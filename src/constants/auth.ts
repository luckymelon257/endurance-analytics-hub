/** Authentication-related constants (cookie, hashing, rate limiting). */

export const BCRYPT_ROUNDS = 12

export const AUTH_COOKIE_NAME = 'access_token'

export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/** Maximum verification-email or password-reset attempts per email per window. */
export const RATE_LIMIT_MAX = 5

/** Random bytes per token (email verify, password reset). 32 bytes → 64 hex chars. */
export const TOKEN_BYTES = 32
