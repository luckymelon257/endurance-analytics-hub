/**
 * Redis TTLs. All values are in seconds — that's what `ioredis` `EXPIRE` and
 * our `CacheService.set(_, _, ttlSeconds)` take.
 */

export const EMAIL_VERIFY_TTL_SECONDS = 60 * 60 * 24 // 24 hours

export const EMAIL_CHANGE_TTL_SECONDS = 60 * 60 * 24 // 24 hours

export const PASSWORD_RESET_TTL_SECONDS = 60 * 60 // 1 hour

export const RATE_LIMIT_WINDOW_SECONDS = 60 * 60 // 1 hour

export const STRAVA_STATE_TTL_SECONDS = 60 * 5 // 5 minutes

/** Strava 15-min rate-limit window. Cached usage observation expires with the window. */
export const STRAVA_BUDGET_15MIN_TTL_SECONDS = 60 * 15 // 15 minutes

/** Strava daily rate-limit window. */
export const STRAVA_BUDGET_DAILY_TTL_SECONDS = 60 * 60 * 24 // 24 hours

/** Defensive self-heal for orphaned in-flight reservations. */
export const STRAVA_IN_FLIGHT_TTL_SECONDS = 120 // 2 minutes
