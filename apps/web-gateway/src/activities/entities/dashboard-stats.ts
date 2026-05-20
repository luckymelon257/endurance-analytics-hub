/** Aggregate values shown on the dashboard's stats grid. */
export interface DashboardStats {
  /** Total imported activities for the user. */
  totalActivities: number
  /** Activities started in the current ISO week (Monday → today). */
  thisWeekCount: number
  /** Sum of distanceMeters across all activities. */
  totalDistanceMeters: number
  /**
   * Mean of `avgHeartRate` across activities that recorded it.
   * Null when no activity has any HR data.
   */
  avgHeartRate: number | null
}
