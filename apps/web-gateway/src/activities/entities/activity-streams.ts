import type { ActivitySummary } from './activity-summary'

/**
 * Per-second sample arrays from Strava `/streams`. All arrays are equal length
 * for a given activity. Each stream type may be missing (the watch didn't
 * record it) — represented as `null` rather than an empty array so charts can
 * decide between "no data" and "data is zero".
 *
 * Stored as JSON in `activity_stream_sets.streams`. Already decimated to a
 * sane sample cap server-side; consumers can render directly without further
 * downsampling.
 */
export interface ActivityStreams {
  /** Seconds since activity start (x-axis for time-based charts). */
  time: number[]
  /** Cumulative distance in meters (alternative x-axis). */
  distance: number[] | null
  /** Heart rate in bpm. */
  heartrate: number[] | null
  /** Speed in m/s — converted to pace or km/h client-side per sport. */
  velocity_smooth: number[] | null
  /** Altitude in meters. */
  altitude: number[] | null
}

/**
 * Detail-page row shape — extends the list summary with the extra summary fields
 * shown on the stats grid above the charts.
 */
export interface ActivityDetailRow extends ActivitySummary {
  elevationGainMeters: number | null
  maxHeartRate: number | null
  avgPowerWatts: number | null
  calories: number | null
}

/** Combined payload sent to the activity-charts island. */
export interface ActivityDetail {
  activity: ActivityDetailRow
  /** Null when the activity wasn't imported from Strava (no streams to fetch). */
  streams: ActivityStreams | null
  /** "No detailed data for this activity" type message when present. */
  streamsError: string | null
}
