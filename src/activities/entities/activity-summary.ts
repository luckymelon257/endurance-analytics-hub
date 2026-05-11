/**
 * Slim, transport-friendly view of an `Activity` row sent to the activities-list
 * React island. Defined without Prisma references so this file is safe to import
 * from client code (types are erased at compile time, no runtime drag).
 */
export type ActivitySportType = 'RUNNING' | 'CYCLING' | 'SWIMMING' | 'ROWING' | 'OTHER'

export interface ActivitySummary {
  id: string
  title: string
  sportType: ActivitySportType
  /** ISO 8601 string. Stored as DateTime server-side, serialized for transport. */
  startedAt: string | null
  durationSeconds: number | null
  distanceMeters: number | null
  avgHeartRate: number | null
  /** Seconds per kilometer. Null if speed wasn't recorded or activity is too short. */
  avgPaceSecondsPerKm: number | null
}
