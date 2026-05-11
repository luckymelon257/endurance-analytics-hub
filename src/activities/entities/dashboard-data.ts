import type { ActivitySportType, ActivitySummary } from './activity-summary'
import type { DashboardStats } from './dashboard-stats'

/**
 * One day in the training-heatmap grid. Date is YYYY-MM-DD in the user's local
 * timezone (resolved server-side when bucketing). Volume is total moving time
 * across activities started on that day.
 */
export interface HeatmapDay {
  date: string
  volumeSeconds: number
  sessions: number
}

/**
 * One bar in the weekly-volume chart. `weekStart` is the Monday 00:00 of the
 * ISO week, formatted YYYY-MM-DD. `bySport` keys are sport types; the value
 * is total moving time in seconds for that sport that week. Sum of bySport
 * equals `totalSeconds`.
 */
export interface WeeklyVolumeBin {
  weekStart: string
  totalSeconds: number
  totalMeters: number
  bySport: Record<ActivitySportType, number>
}

/** Combined payload sent into the dashboard view. */
export interface DashboardData {
  stats: DashboardStats
  recent: ActivitySummary[]
  heatmap: HeatmapDay[]
  weeklyVolume: WeeklyVolumeBin[]
}
