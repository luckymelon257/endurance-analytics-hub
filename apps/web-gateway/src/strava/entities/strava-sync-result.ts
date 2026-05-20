/** Result of pulling activities from Strava and upserting into the local DB. */
export interface StravaSyncResult {
  created: number
  updated: number
}
