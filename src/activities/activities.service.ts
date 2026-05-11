import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Activity } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { StravaApiClient } from '../strava/strava-api.client'
import { StravaService } from '../strava/strava.service'
import {
  ActivityDetail,
  ActivitySportType,
  ActivitySummary,
  DashboardData,
  DashboardStats,
  HeatmapDay,
  WeeklyVolumeBin,
} from './entities'
import { StreamsService } from './streams.service'

const HEATMAP_DAYS = 16 * 7 // 16 weeks
const WEEKLY_VOLUME_WEEKS = 12

interface AggregationRow {
  startedAt: Date | null
  durationSeconds: number | null
  distanceMeters: number | null
  sportType: ActivitySportType
}

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly streamsService: StreamsService,
    private readonly stravaService: StravaService,
    private readonly stravaApi: StravaApiClient,
  ) {}

  /**
   * Single-shot aggregator for the dashboard. Pulls the last 16 weeks of
   * activities once and derives stats, the heatmap grid, the weekly-volume
   * bars, and the recent-activity preview from the same in-memory rows.
   */
  public async getDashboardData(userId: string): Promise<DashboardData> {
    const cutoff = startOfDay(daysAgo(HEATMAP_DAYS))

    const [stats, rows] = await Promise.all([
      this.getDashboardStats(userId),
      this.prisma.activity.findMany({
        where: { userId, startedAt: { gte: cutoff } },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          title: true,
          sportType: true,
          startedAt: true,
          durationSeconds: true,
          distanceMeters: true,
          avgHeartRate: true,
          avgPaceSecondsPerKm: true,
        },
      }),
    ])

    const aggRows: AggregationRow[] = rows.map((r) => ({
      startedAt: r.startedAt,
      durationSeconds: r.durationSeconds,
      distanceMeters: r.distanceMeters,
      sportType: r.sportType as ActivitySportType,
    }))

    return {
      stats,
      recent: rows.slice(0, 5).map((r) => ({
        id: r.id,
        title: r.title,
        sportType: r.sportType as ActivitySportType,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        durationSeconds: r.durationSeconds,
        distanceMeters: r.distanceMeters,
        avgHeartRate: r.avgHeartRate,
        avgPaceSecondsPerKm: r.avgPaceSecondsPerKm,
      })),
      heatmap: buildHeatmap(aggRows, HEATMAP_DAYS),
      weeklyVolume: buildWeeklyVolume(aggRows, WEEKLY_VOLUME_WEEKS),
    }
  }

  public async getDashboardStats(userId: string): Promise<DashboardStats> {
    const weekStart = startOfIsoWeek(new Date())

    const [totalActivities, thisWeekCount, distanceAggregate, heartRateAggregate] =
      await Promise.all([
        this.prisma.activity.count({ where: { userId } }),
        this.prisma.activity.count({
          where: { userId, startedAt: { gte: weekStart } },
        }),
        this.prisma.activity.aggregate({
          where: { userId },
          _sum: { distanceMeters: true },
        }),
        this.prisma.activity.aggregate({
          where: { userId, avgHeartRate: { not: null } },
          _avg: { avgHeartRate: true },
        }),
      ])

    return {
      totalActivities,
      thisWeekCount,
      totalDistanceMeters: distanceAggregate._sum.distanceMeters ?? 0,
      avgHeartRate:
        heartRateAggregate._avg.avgHeartRate !== null
          ? Math.round(heartRateAggregate._avg.avgHeartRate)
          : null,
    }
  }

  public async getDetail(userId: string, activityId: string): Promise<ActivityDetail> {
    let row = await this.prisma.activity.findFirst({
      where: { id: activityId, userId },
    })
    if (!row) {
      throw new NotFoundException('Activity not found')
    }

    // Strava's list endpoint omits `calories` (and a few other detail-only
    // fields). On first detail view we hit /activities/{id} once to fill them
    // in. Subsequent visits skip this call.
    if (row.calories === null && row.externalId?.startsWith('strava:')) {
      row = (await this.enrichFromStrava(row)) ?? row
    }

    let streams = null
    let streamsError: string | null = null
    try {
      streams = await this.streamsService.getStreams(row)
      if (!streams) {
        streamsError = row.externalId?.startsWith('strava:')
          ? 'Strava has no detailed sample data for this activity.'
          : 'Detailed charts are only available for Strava-imported activities.'
      }
    } catch {
      streamsError = 'Could not load detailed data right now. Please try again.'
    }

    return {
      activity: {
        id: row.id,
        title: row.title,
        sportType: row.sportType as ActivitySportType,
        startedAt: row.startedAt ? row.startedAt.toISOString() : null,
        durationSeconds: row.durationSeconds,
        distanceMeters: row.distanceMeters,
        avgHeartRate: row.avgHeartRate,
        avgPaceSecondsPerKm: row.avgPaceSecondsPerKm,
        elevationGainMeters: row.elevationGainMeters,
        maxHeartRate: row.maxHeartRate,
        avgPowerWatts: row.avgPowerWatts,
        calories: row.calories,
      },
      streams,
      streamsError,
    }
  }

  /**
   * One-shot fill of detail-only fields (`calories`, etc.) from `/activities/{id}`.
   * Best-effort: returns `null` on any Strava error so the page still renders.
   */
  private async enrichFromStrava(activity: Activity): Promise<Activity | null> {
    if (!activity.externalId) return null
    const stravaId = Number(activity.externalId.replace('strava:', ''))
    if (Number.isNaN(stravaId)) return null

    try {
      const accessToken = await this.stravaService.getValidAccessToken(activity.userId)
      const detail = await this.stravaApi.getActivity(accessToken, stravaId)
      if (!detail) return null
      return await this.prisma.activity.update({
        where: { id: activity.id },
        data: {
          calories: detail.calories ? Math.round(detail.calories) : null,
        },
      })
    } catch (err) {
      this.logger.warn(
        `Activity enrichment failed for ${activity.id}: ${(err as Error).message}`,
      )
      return null
    }
  }

  public async listForUser(userId: string, take = 30): Promise<ActivitySummary[]> {
    const rows = await this.prisma.activity.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take,
      select: {
        id: true,
        title: true,
        sportType: true,
        startedAt: true,
        durationSeconds: true,
        distanceMeters: true,
        avgHeartRate: true,
        avgPaceSecondsPerKm: true,
      },
    })

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      sportType: r.sportType as ActivitySportType,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      durationSeconds: r.durationSeconds,
      distanceMeters: r.distanceMeters,
      avgHeartRate: r.avgHeartRate,
      avgPaceSecondsPerKm: r.avgPaceSecondsPerKm,
    }))
  }
}

/** Monday 00:00 of the week containing `now`. Endurance training convention. */
function startOfIsoWeek(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const dayOfWeek = d.getDay() // 0 = Sun, 1 = Mon, …, 6 = Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  d.setDate(d.getDate() + diffToMonday)
  return d
}

/** Today's 00:00 in server local time. */
function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

/** Format a Date as YYYY-MM-DD in local time. */
function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Build a contiguous `numDays`-long array ending today. Days with no training
 * are present with zero values so the React grid renders empty cells uniformly.
 */
function buildHeatmap(rows: AggregationRow[], numDays: number): HeatmapDay[] {
  const buckets = new Map<string, { volumeSeconds: number; sessions: number }>()
  for (const row of rows) {
    if (!row.startedAt || !row.durationSeconds) continue
    const key = formatDateKey(row.startedAt)
    const bucket = buckets.get(key) ?? { volumeSeconds: 0, sessions: 0 }
    bucket.volumeSeconds += row.durationSeconds
    bucket.sessions += 1
    buckets.set(key, bucket)
  }

  const out: HeatmapDay[] = []
  for (let i = numDays - 1; i >= 0; i--) {
    const d = startOfDay(daysAgo(i))
    const key = formatDateKey(d)
    const bucket = buckets.get(key) ?? { volumeSeconds: 0, sessions: 0 }
    out.push({ date: key, volumeSeconds: bucket.volumeSeconds, sessions: bucket.sessions })
  }
  return out
}

/**
 * Aggregate moving time and distance per ISO week, broken down by sport. Returns
 * `numWeeks` bins ending with the current week (chronological order, oldest first).
 */
function buildWeeklyVolume(rows: AggregationRow[], numWeeks: number): WeeklyVolumeBin[] {
  const buckets = new Map<string, WeeklyVolumeBin>()

  // Pre-create empty bins so weeks with zero training render correctly.
  const thisWeekStart = startOfIsoWeek(new Date())
  for (let i = numWeeks - 1; i >= 0; i--) {
    const start = new Date(thisWeekStart)
    start.setDate(start.getDate() - i * 7)
    buckets.set(formatDateKey(start), {
      weekStart: formatDateKey(start),
      totalSeconds: 0,
      totalMeters: 0,
      bySport: { RUNNING: 0, CYCLING: 0, SWIMMING: 0, ROWING: 0, OTHER: 0 },
    })
  }

  for (const row of rows) {
    if (!row.startedAt) continue
    const weekKey = formatDateKey(startOfIsoWeek(row.startedAt))
    const bin = buckets.get(weekKey)
    if (!bin) continue // older than the window we're showing
    const seconds = row.durationSeconds ?? 0
    bin.totalSeconds += seconds
    bin.totalMeters += row.distanceMeters ?? 0
    bin.bySport[row.sportType] += seconds
  }

  return Array.from(buckets.values())
}
