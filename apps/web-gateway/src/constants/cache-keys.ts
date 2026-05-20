/**
 * Builders for Redis cache keys. Centralizing them as functions means a key
 * rename is a one-line edit and consumers can't drift apart on naming.
 */

export const emailVerifyTokenKey = (token: string) => `email_verify:tok:${token}`

export const emailVerifyUserKey = (userId: string) => `email_verify:user:${userId}`

export const passwordResetTokenKey = (token: string) => `pwd_reset:${token}`

export const emailChangeTokenKey = (token: string) => `email_change:tok:${token}`

export const emailChangeUserKey = (userId: string) => `email_change:user:${userId}`

export const rateLimitVerifyKey = (email: string) => `rl:verify:${email.toLowerCase()}`

export const stravaStateKey = (state: string) => `strava_state:${state}`

/** App-wide Strava rate-limit usage observed from response headers. */
export const stravaBudgetUsage15MinKey = () => 'strava:usage:15min'
export const stravaBudgetUsageDailyKey = () => 'strava:usage:daily'

/** App-wide counter of Strava requests we've issued but not yet received responses for. */
export const stravaInFlightKey = () => 'strava:in_flight'

/** App-wide lock guaranteeing at most one backfill runner active at a time. */
export const stravaBackfillLockKey = () => 'strava:backfill:lock'
