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
