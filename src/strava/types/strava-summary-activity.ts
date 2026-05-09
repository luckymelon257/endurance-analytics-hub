export interface StravaSummaryActivity {
  id: number
  name: string
  /** Legacy field (e.g. 'Run', 'Ride'). */
  type: string
  /** Newer field (e.g. 'TrailRun'). Prefer this when present. */
  sport_type: string
  /** ISO 8601. */
  start_date: string
  /** Seconds. */
  moving_time: number
  /** Meters. */
  distance: number
  /** Meters. */
  total_elevation_gain: number
  average_heartrate?: number
  max_heartrate?: number
  /** Meters per second. */
  average_speed?: number
  average_watts?: number
  calories?: number
}
