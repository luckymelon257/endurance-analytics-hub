import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'
import {
  BACKFILL_BUDGET_THRESHOLD_15MIN,
  BACKFILL_BUDGET_THRESHOLD_DAILY,
  LIVE_SYNC_BUDGET_THRESHOLD_15MIN,
  REDIS_URL,
} from '../config/env'
import {
  stravaBudgetUsage15MinKey,
  stravaBudgetUsageDailyKey,
  stravaInFlightKey,
} from '../constants/cache-keys'
import {
  STRAVA_BUDGET_15MIN_TTL_SECONDS,
  STRAVA_BUDGET_DAILY_TTL_SECONDS,
  STRAVA_IN_FLIGHT_TTL_SECONDS,
} from '../constants/ttl'

export type CallerKind = 'BACKFILL' | 'LIVE_SYNC'

interface UsageSnapshot {
  usage: number
  limit: number
  observedAt: number // ms since epoch
}

const DEFAULT_LIMIT_15MIN = 100
const DEFAULT_LIMIT_DAILY = 1000

@Injectable()
export class StravaBudgetService implements OnModuleDestroy {
  private readonly logger = new Logger(StravaBudgetService.name)
  private readonly redis: Redis

  constructor() {
    this.redis = new Redis(REDIS_URL)
  }

  /**
   * Atomically reserve a request slot. The pipeline collapses three Redis
   * ops into one round-trip: INCR in-flight, EXPIRE NX (self-heal),
   * GET observed usage. If the reservation pushes effective usage over the
   * threshold for this caller kind, we DECR to roll back and return ok=false.
   */
  public async canStartRequest(
    kind: CallerKind,
  ): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
    const threshold15min =
      kind === 'BACKFILL' ? BACKFILL_BUDGET_THRESHOLD_15MIN : LIVE_SYNC_BUDGET_THRESHOLD_15MIN

    const pipeline = this.redis.pipeline()
    pipeline.incr(stravaInFlightKey())
    pipeline.expire(stravaInFlightKey(), STRAVA_IN_FLIGHT_TTL_SECONDS, 'NX')
    pipeline.get(stravaBudgetUsage15MinKey())
    pipeline.get(stravaBudgetUsageDailyKey())

    const results = await pipeline.exec()
    if (!results) {
      return { ok: false, retryAfterSeconds: this.nextWindowResetSeconds() + 30 }
    }

    // Fail-closed on any per-command Redis error or unexpected return type.
    const incrErr = results[0]?.[0]
    const incrVal = results[0]?.[1]
    if (incrErr || typeof incrVal !== 'number') {
      this.logger.warn(
        `Budget pipeline INCR failed or returned non-number: ${incrErr?.message ?? String(incrVal)}`,
      )
      return { ok: false, retryAfterSeconds: this.nextWindowResetSeconds() + 30 }
    }

    const inFlight = incrVal
    const usage15Raw = results[2]?.[1] as string | null
    const usageDailyRaw = results[3]?.[1] as string | null

    const snap15 = this.parseSnapshot(usage15Raw, DEFAULT_LIMIT_15MIN)
    const snapDaily = this.parseSnapshot(usageDailyRaw, DEFAULT_LIMIT_DAILY)

    const effective15 = snap15.usage + inFlight
    const effectiveDaily = snapDaily.usage + inFlight

    if (
      effective15 / snap15.limit >= threshold15min ||
      effectiveDaily / snapDaily.limit >= BACKFILL_BUDGET_THRESHOLD_DAILY
    ) {
      await this.redis.decr(stravaInFlightKey())
      return { ok: false, retryAfterSeconds: this.nextWindowResetSeconds() + 30 }
    }

    return { ok: true }
  }

  /**
   * Called from StravaApiClient after every fetch (success or error, as long
   * as headers exist). DECRs the in-flight counter that canStartRequest INCRed,
   * and persists the observed usage from response headers.
   */
  public async recordResponse(headers: Headers | Record<string, string>): Promise<void> {
    await this.redis.decr(stravaInFlightKey())

    const usage = this.headerValue(headers, 'x-ratelimit-usage')
    const limit = this.headerValue(headers, 'x-ratelimit-limit')
    if (!usage || !limit) return

    const parsed = this.parseUsageHeader(usage, limit)
    if (!parsed) return

    const now = Date.now()
    const snap15: UsageSnapshot = { usage: parsed.usage15, limit: parsed.limit15, observedAt: now }
    const snapDaily: UsageSnapshot = {
      usage: parsed.usageDaily,
      limit: parsed.limitDaily,
      observedAt: now,
    }

    await this.redis
      .pipeline()
      .set(stravaBudgetUsage15MinKey(), JSON.stringify(snap15), 'EX', STRAVA_BUDGET_15MIN_TTL_SECONDS)
      .set(stravaBudgetUsageDailyKey(), JSON.stringify(snapDaily), 'EX', STRAVA_BUDGET_DAILY_TTL_SECONDS)
      .exec()
  }

  /** Used by callers that bypass the gate but should still release reservation. */
  public async releaseReservation(): Promise<void> {
    await this.redis.decr(stravaInFlightKey())
  }

  public onModuleDestroy(): void {
    this.redis.disconnect()
  }

  /** Seconds until the next wall-clock 15-min boundary. Strava's windows align to these. */
  public nextWindowResetSeconds(): number {
    const now = new Date()
    const minutes = now.getUTCMinutes()
    const nextBoundaryMin = Math.ceil((minutes + 1) / 15) * 15
    const seconds = (nextBoundaryMin - minutes) * 60 - now.getUTCSeconds()
    return seconds > 0 ? seconds : 60
  }

  private parseSnapshot(raw: string | null, defaultLimit: number): UsageSnapshot {
    if (!raw) {
      return { usage: defaultLimit * 0.5, limit: defaultLimit, observedAt: 0 }
    }
    try {
      const parsed = JSON.parse(raw) as UsageSnapshot
      if (typeof parsed.usage !== 'number' || typeof parsed.limit !== 'number') {
        return { usage: defaultLimit * 0.5, limit: defaultLimit, observedAt: 0 }
      }
      return parsed
    } catch {
      return { usage: defaultLimit * 0.5, limit: defaultLimit, observedAt: 0 }
    }
  }

  private parseUsageHeader(
    usage: string,
    limit: string,
  ): { usage15: number; usageDaily: number; limit15: number; limitDaily: number } | null {
    const [u15, uDaily] = usage.split(',').map((s) => Number(s.trim()))
    const [l15, lDaily] = limit.split(',').map((s) => Number(s.trim()))
    if ([u15, uDaily, l15, lDaily].some((n) => !Number.isFinite(n))) return null
    return { usage15: u15, usageDaily: uDaily, limit15: l15, limitDaily: lDaily }
  }

  private headerValue(
    headers: Headers | Record<string, string>,
    name: string,
  ): string | undefined {
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name) ?? undefined
    }
    const lower = name.toLowerCase()
    const rec = headers as Record<string, string>
    return rec[lower] ?? rec[name] ?? undefined
  }
}
