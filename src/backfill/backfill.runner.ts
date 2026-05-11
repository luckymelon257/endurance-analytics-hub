import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ActivityStatus, SportType } from '@prisma/client'
import Redis from 'ioredis'
import { BACKFILL_LOCK_TTL_SECONDS, BACKFILL_PAGE_SPACING_MS, REDIS_URL } from '../config/env'
import { stravaBackfillLockKey } from '../constants/cache-keys'
import { PrismaService } from '../prisma/prisma.service'
import { StravaApiClient } from '../strava/strava-api.client'
import { StravaBudgetService } from '../strava/strava-budget.service'
import { StravaRateLimitedError } from '../strava/strava-rate-limited.error'
import { StravaService } from '../strava/strava.service'
import { StravaSummaryActivity } from '../strava/types'
import { acquireLock } from './redis-lock'

const PER_PAGE = 200
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

@Injectable()
export class BackfillRunner implements OnModuleDestroy {
  private readonly logger = new Logger(BackfillRunner.name)
  private readonly redis: Redis
  private heartbeatTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly stravaApi: StravaApiClient,
    private readonly stravaService: StravaService,
    private readonly budget: StravaBudgetService,
  ) {
    this.redis = new Redis(REDIS_URL)
  }

  public onModuleDestroy(): void {
    this.stopHeartbeat()
    this.redis.disconnect()
  }

  /**
   * Try to start the highest-priority QUEUED job. Returns true if a job was
   * picked up (regardless of terminal state), false if the lock couldn't be
   * acquired or no QUEUED job existed.
   *
   * Priority: WINDOW_1Y before FULL; oldest enqueuedAt first within mode.
   */
  public async runNext(): Promise<boolean> {
    const lock = await acquireLock(this.redis, stravaBackfillLockKey(), BACKFILL_LOCK_TTL_SECONDS)
    if (!lock) {
      this.logger.debug('runNext: lock already held; skipping')
      return false
    }

    try {
      let next = await this.prisma.backfillJob.findFirst({
        where: { status: 'QUEUED', mode: 'WINDOW_1Y' },
        orderBy: { enqueuedAt: 'asc' },
      })
      if (!next) {
        next = await this.prisma.backfillJob.findFirst({
          where: { status: 'QUEUED', mode: 'FULL' },
          orderBy: { enqueuedAt: 'asc' },
        })
      }
      if (!next) {
        await lock.release()
        return false
      }

      this.startHeartbeat(lock)
      try {
        await this.runJob(next.id)
      } finally {
        this.stopHeartbeat()
        await lock.release()
      }
      return true
    } catch (err) {
      await lock.release()
      throw err
    }
  }

  private async runJob(jobId: string): Promise<void> {
    await this.prisma.backfillJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    })

    let job = await this.prisma.backfillJob.findUniqueOrThrow({ where: { id: jobId } })
    let accessToken: string
    try {
      accessToken = await this.stravaService.getValidAccessToken(job.userId)
    } catch (err) {
      await this.markFailed(job.id, (err as Error).message)
      return
    }

    while (true) {
      job = await this.prisma.backfillJob.findUniqueOrThrow({ where: { id: jobId } })
      if (job.status === 'CANCELED') {
        this.logger.log(`Job ${job.id} canceled mid-run`)
        return
      }

      const page = job.lastPageFetched + 1
      let summaries: StravaSummaryActivity[]
      try {
        summaries = await this.fetchPageWithRetry(accessToken, page)
      } catch (err) {
        if (err instanceof StravaRateLimitedError) {
          await this.markRateLimited(job.id, err.retryAfterSeconds)
          return
        }
        await this.markFailed(job.id, (err as Error).message)
        return
      }

      if (summaries.length === 0) {
        await this.markCompleted(job.id)
        return
      }

      try {
        await this.upsertActivities(job.userId, summaries)
      } catch (err) {
        await this.markFailed(job.id, `Upsert failed: ${(err as Error).message}`)
        return
      }

      job = await this.prisma.backfillJob.update({
        where: { id: jobId },
        data: {
          lastPageFetched: page,
          imported: { increment: summaries.length },
        },
      })

      if (job.mode === 'WINDOW_1Y') {
        const oldestOnPage = summaries.reduce((min, s) => {
          const t = new Date(s.start_date).getTime()
          return t < min ? t : min
        }, Infinity)
        if (oldestOnPage <= Date.now() - ONE_YEAR_MS) {
          await this.markCompleted(job.id)
          return
        }
      }

      if (summaries.length < PER_PAGE) {
        await this.markCompleted(job.id)
        return
      }

      await this.sleep(BACKFILL_PAGE_SPACING_MS)
    }
  }

  private async upsertActivities(userId: string, summaries: StravaSummaryActivity[]): Promise<void> {
    for (const s of summaries) {
      const externalId = `strava:${s.id}`
      const data = mapSummary(s)
      await this.prisma.activity.upsert({
        where: { userId_externalId: { userId, externalId } },
        create: { ...data, userId, externalId },
        update: data,
      })
    }
  }

  private async markCompleted(jobId: string): Promise<void> {
    await this.prisma.backfillJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
  }

  private async markFailed(jobId: string, error: string): Promise<void> {
    await this.prisma.backfillJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', error, completedAt: new Date() },
    })
  }

  private async markRateLimited(jobId: string, retryAfterSeconds: number): Promise<void> {
    const retryAfter = new Date(Date.now() + retryAfterSeconds * 1000)
    await this.prisma.backfillJob.update({
      where: { id: jobId },
      data: { status: 'RATE_LIMITED', retryAfter },
    })
  }

  private startHeartbeat(lock: { heartbeat: () => Promise<boolean> }): void {
    this.stopHeartbeat()
    const intervalMs = (BACKFILL_LOCK_TTL_SECONDS * 1000) / 2
    this.heartbeatTimer = setInterval(() => {
      lock.heartbeat().catch((err) => {
        this.logger.warn(`Heartbeat failed: ${(err as Error).message}`)
      })
    }, intervalMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Fetch one page, with a single retry after 5 s on transient (non-429) errors.
   * 429s rethrow immediately so the runJob loop can transition to RATE_LIMITED
   * without burning the retry.
   */
  private async fetchPageWithRetry(
    accessToken: string,
    page: number,
  ): Promise<StravaSummaryActivity[]> {
    try {
      return await this.stravaApi.listActivities(accessToken, PER_PAGE, page, 'BACKFILL')
    } catch (err) {
      if (err instanceof StravaRateLimitedError) throw err
      this.logger.warn(
        `Backfill page ${page} transient error: ${(err as Error).message} — retrying in 5s`,
      )
      await this.sleep(5000)
      return this.stravaApi.listActivities(accessToken, PER_PAGE, page, 'BACKFILL')
    }
  }
}

/**
 * Mirror of StravaService's mapSummary — duplicated here to keep BackfillRunner
 * decoupled from StravaService internals.
 */
function mapSummary(s: StravaSummaryActivity) {
  const sportType = mapSport(s.sport_type ?? s.type)
  const avgPace = s.average_speed && s.average_speed > 0 ? 1000 / s.average_speed : null
  return {
    title: s.name,
    sportType,
    status: ActivityStatus.COMPLETED,
    startedAt: new Date(s.start_date),
    durationSeconds: s.moving_time,
    distanceMeters: s.distance,
    elevationGainMeters: s.total_elevation_gain,
    avgHeartRate: s.average_heartrate ? Math.round(s.average_heartrate) : null,
    maxHeartRate: s.max_heartrate ? Math.round(s.max_heartrate) : null,
    avgPaceSecondsPerKm: avgPace,
    avgPowerWatts: s.average_watts ? Math.round(s.average_watts) : null,
  }
}

function mapSport(stravaType: string): SportType {
  switch (stravaType) {
    case 'Run':
    case 'TrailRun':
    case 'VirtualRun':
      return SportType.RUNNING
    case 'Ride':
    case 'VirtualRide':
    case 'EBikeRide':
    case 'MountainBikeRide':
    case 'GravelRide':
      return SportType.CYCLING
    case 'Swim':
      return SportType.SWIMMING
    case 'Rowing':
    case 'VirtualRow':
      return SportType.ROWING
    default:
      return SportType.OTHER
  }
}
