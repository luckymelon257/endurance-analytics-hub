import type { StravaSummaryActivity } from './strava-summary-activity'

/**
 * Shape returned by `GET /api/v3/activities/{id}` — the per-activity detail
 * endpoint. Same fields as SummaryActivity plus a few that Strava only includes
 * when you ask for a specific activity (notably `calories`).
 *
 * We treat detail-only fields as optional because Strava omits them when the
 * device didn't record the metric (e.g. no calorie estimate for activities
 * without HR or power data).
 */
export interface StravaDetailedActivity extends StravaSummaryActivity {
  calories?: number
  description?: string | null
  device_name?: string | null
}
