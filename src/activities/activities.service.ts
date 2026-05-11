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

const HEATMAP_DAYS = 365
const WEEKLY_VOLUME_WEEKS = 12
const RECENT_TAKE = 20
const PAGE_SIZE = 50

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
   * Thin orchestrator that fans out to windowed methods. Each window
   * aggregates server-side in Postgres rather than pulling rows into JS.
   */
  public async getDashboardData(userId: string): Promise<DashboardData> {
    const [stats, heatmap, weeklyVolume, recent] = await Promise.all([
      this.getDashboardStats(userId),
      this.getHeatmapData(userId, HEATMAP_DAYS),
      this.getWeeklyVolume(userId, WEEKLY_VOLUME_WEEKS),
      this.getRecentActivities(userId, RECENT_TAKE),
    ])
    return { stats, recent, heatmap, weeklyVolume }
  }

  /**
   * Per-day moving-time volume + session count for the last `days` days.
   * SQL aggregation in Postgres — we don't pull rows into JS for this.
   * Empty days are omitted from the result; the React island fills them.
   */
  public async getHeatmapData(userId: string, days = HEATMAP_DAYS): Promise<HeatmapDay[]> {
    type Row = { day: string; volume_seconds: number; sessions: number }
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        to_char(date_trunc('day', "startedAt"), 'YYYY-MM-DD') AS day,
        COALESCE(SUM("durationSeconds"), 0)::int              AS volume_seconds,
        COUNT(*)::int                                          AS sessions
      FROM activities
      WHERE "userId" = ${userId}
        AND "startedAt" >= NOW() - (${days} || ' days')::interval
      GROUP BY day
      ORDER BY day
    `
    return rows.map((r) => ({
      date: r.day,
      volumeSeconds: r.volume_seconds,
      sessions: r.sessions,
    }))
  }

  /**
   * Per-(week, sport) duration + distance for the last `weeks` ISO weeks.
   * Pre-fills empty weeks and zero-init bySport so the chart code is unchanged.
   */
  public async getWeeklyVolume(
    userId: string,
    weeks = WEEKLY_VOLUME_WEEKS,
  ): Promise<WeeklyVolumeBin[]> {
    type Row = {
      week_start: string
      sport_type: ActivitySportType
      total_seconds: number
      total_meters: number
    }
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        to_char(date_trunc('week', "startedAt"), 'YYYY-MM-DD') AS week_start,
        "sportType"::text                                       AS sport_type,
        COALESCE(SUM("durationSeconds"), 0)::int                AS total_seconds,
        COALESCE(SUM("distanceMeters"), 0)::float               AS total_meters
      FROM activities
      WHERE "userId" = ${userId}
        AND "startedAt" >= date_trunc('week', NOW()) - (${weeks - 1} || ' weeks')::interval
      GROUP BY week_start, "sportType"
      ORDER BY week_start
    `

    const bins = new Map<string, WeeklyVolumeBin>()
    const thisWeekStart = startOfIsoWeek(new Date())
    for (let i = weeks - 1; i >= 0; i--) {
      const start = new Date(thisWeekStart)
      start.setDate(start.getDate() - i * 7)
      const key = formatDateKey(start)
      bins.set(key, {
        weekStart: key,
        totalSeconds: 0,
        totalMeters: 0,
        bySport: { RUNNING: 0, CYCLING: 0, SWIMMING: 0, ROWING: 0, OTHER: 0 },
      })
    }

    for (const row of rows) {
      const bin = bins.get(row.week_start)
      if (!bin) continue
      bin.totalSeconds += row.total_seconds
      bin.totalMeters += row.total_meters
      bin.bySport[row.sport_type] += row.total_seconds
    }

    return Array.from(bins.values())
  }

  /**
   * Latest N activities for the dashboard "recent" card.
   */
  public async getRecentActivities(
    userId: string,
    take = RECENT_TAKE,
  ): Promise<ActivitySummary[]> {
    const rows = await this.prisma.activity.findMany({
      where: { userId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
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

  /**
   * Cursor-paginated list of activities. Cursor encodes (startedAt, id) of the
   * last item on the previous page. We use row-tuple comparison so ordering
   * stays correct even when many activities share the same startedAt (rare,
   * but happens for brick workouts).
   */
  public async listForUserPaged(
    userId: string,
    cursor: string | undefined,
    take = PAGE_SIZE,
  ): Promise<PageOfActivities> {
    const decoded = decodeCursor(cursor)

    // Pull +1 to detect whether more pages exist without a separate COUNT.
    const rows = await this.prisma.activity.findMany({
      where: {
        userId,
        ...(decoded
          ? {
              OR: [
                { startedAt: { lt: decoded.startedAt } },
                {
                  startedAt: decoded.startedAt,
                  id: { lt: decoded.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
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

    const hasMore = rows.length > take
    const sliced = hasMore ? rows.slice(0, take) : rows
    const items = sliced.map((r) => ({
      id: r.id,
      title: r.title,
      sportType: r.sportType as ActivitySportType,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      durationSeconds: r.durationSeconds,
      distanceMeters: r.distanceMeters,
      avgHeartRate: r.avgHeartRate,
      avgPaceSecondsPerKm: r.avgPaceSecondsPerKm,
    }))

    let nextCursor: string | null = null
    if (hasMore) {
      const last = sliced[sliced.length - 1]
      if (last.startedAt) {
        nextCursor = encodeCursor({ startedAt: last.startedAt, id: last.id })
      }
    }

    return { items, nextCursor }
  }
}

export interface PageOfActivities {
  items: ActivitySummary[]
  nextCursor: string | null
}

interface DecodedCursor {
  startedAt: Date
  id: string
}

function encodeCursor(c: DecodedCursor): string {
  const payload = `${c.startedAt.toISOString()}|${c.id}`
  return Buffer.from(payload, 'utf8').toString('base64url')
}

function decodeCursor(raw: string | undefined): DecodedCursor | null {
  if (!raw) return null
  try {
    const payload = Buffer.from(raw, 'base64url').toString('utf8')
    const [iso, id] = payload.split('|')
    if (!iso || !id) return null
    const startedAt = new Date(iso)
    if (Number.isNaN(startedAt.getTime())) return null
    return { startedAt, id }
  } catch {
    return null
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

/** Format a Date as YYYY-MM-DD in local time. */
function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
