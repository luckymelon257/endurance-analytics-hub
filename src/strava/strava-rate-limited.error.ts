/**
 * Thrown by StravaApiClient when Strava returns 429. Caller (the backfill
 * runner) catches it specifically to transition the job to RATE_LIMITED rather
 * than FAILED, and uses retryAfterSeconds to set the resume time.
 */
export class StravaRateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Strava rate limit reached; retry after ${retryAfterSeconds}s`)
    this.name = 'StravaRateLimitedError'
  }
}
