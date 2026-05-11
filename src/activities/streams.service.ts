import { Injectable, Logger } from '@nestjs/common'
import { Activity, Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { StravaApiClient } from '../strava/strava-api.client'
import { StravaService } from '../strava/strava.service'
import { StravaStreamsResponse } from '../strava/types'
import { ActivityStreams } from './entities'

const STALE_DAYS = 30
/** Per-stream sample cap. Bounds storage and chart payload regardless of activity length. */
const MAX_SAMPLES_PER_STREAM = 1000

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly stravaService: StravaService,
    private readonly stravaApi: StravaApiClient,
  ) {}

  /**
   * Returns decimated streams for an activity, going through the cache:
   *  - cache hit and fresh → return cached
   *  - cache miss or stale → fetch from Strava, decimate, upsert, return
   *  - non-Strava activity, or Strava 404, or Strava unreachable → null
   *
   * Errors during refresh fall back to the cached payload if any (so a temporary
   * Strava outage doesn't break the page for users who already loaded the activity).
   */
  public async getStreams(activity: Activity): Promise<ActivityStreams | null> {
    if (!activity.externalId?.startsWith('strava:')) return null

    const stravaActivityId = Number(activity.externalId.replace('strava:', ''))
    if (Number.isNaN(stravaActivityId)) return null

    const cached = await this.prisma.activityStreamSet.findUnique({
      where: { activityId: activity.id },
    })

    const ageDays = cached
      ? (Date.now() - cached.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity

    if (cached && ageDays < STALE_DAYS) {
      return cached.streams as unknown as ActivityStreams
    }

    try {
      const accessToken = await this.stravaService.getValidAccessToken(activity.userId)
      const raw = await this.stravaApi.getActivityStreams(accessToken, stravaActivityId)
      if (!raw) return cached ? (cached.streams as unknown as ActivityStreams) : null

      const decimated = decimateStreams(raw)
      if (!decimated) return cached ? (cached.streams as unknown as ActivityStreams) : null
      await this.upsert(activity.id, decimated)
      return decimated
    } catch (err) {
      this.logger.warn(
        `Streams refresh failed for activity ${activity.id}: ${(err as Error).message}`,
      )
      // Strava unreachable or token missing — serve stale data if we have it.
      return cached ? (cached.streams as unknown as ActivityStreams) : null
    }
  }

  private async upsert(activityId: string, streams: ActivityStreams): Promise<void> {
    const data = streams as unknown as Prisma.InputJsonValue
    await this.prisma.activityStreamSet.upsert({
      where: { activityId },
      create: { Id: randomUUID(), activityId, streams: data },
      update: { streams: data },
    })
  }
}

/**
 * Map Strava's per-type response into our flat `ActivityStreams`, decimating each
 * present stream to at most `MAX_SAMPLES_PER_STREAM` evenly-spaced samples. The
 * `time` stream defines length; if it's missing we bail (charts have no x-axis).
 */
function decimateStreams(raw: StravaStreamsResponse): ActivityStreams | null {
  const timeRaw = raw.time?.data
  if (!timeRaw || timeRaw.length === 0) return null

  const indexes = pickIndexes(timeRaw.length, MAX_SAMPLES_PER_STREAM)
  const pick = (arr: number[]): number[] => indexes.map((i) => arr[i])

  return {
    time: pick(timeRaw),
    distance: raw.distance ? pick(raw.distance.data) : null,
    heartrate: raw.heartrate ? pick(raw.heartrate.data) : null,
    velocity_smooth: raw.velocity_smooth ? pick(raw.velocity_smooth.data) : null,
    altitude: raw.altitude ? pick(raw.altitude.data) : null,
  }
}

/** Evenly spaced indexes into [0, length-1] up to `max` samples. */
function pickIndexes(length: number, max: number): number[] {
  if (length <= max) return Array.from({ length }, (_, i) => i)
  const step = (length - 1) / (max - 1)
  const out: number[] = new Array(max)
  for (let i = 0; i < max; i++) out[i] = Math.round(i * step)
  return out
}
