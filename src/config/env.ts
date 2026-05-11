import 'dotenv/config'
import type { StringValue } from 'ms'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

// App
export const NODE_ENV = process.env.NODE_ENV ?? 'development'
export const IS_PRODUCTION = NODE_ENV === 'production'
export const APP_URL = process.env.APP_URL ?? 'http://localhost:3000'

// Datastores
export const DATABASE_URL = required('DATABASE_URL')
export const REDIS_URL = required('REDIS_URL')

// Auth
export const JWT_SECRET = required('JWT_SECRET')
export const JWT_EXPIRES_IN: StringValue = (process.env.JWT_EXPIRES_IN ?? '7d') as StringValue

// Strava
export const STRAVA_CLIENT_ID = required('STRAVA_CLIENT_ID')
export const STRAVA_CLIENT_SECRET = required('STRAVA_CLIENT_SECRET')
export const STRAVA_REDIRECT_URL =
  process.env.STRAVA_REDIRECT_URI ?? `${APP_URL}/auth/strava/callback`

// Backfill

/** Helper: parse a float env var with a fallback. Throws if present-but-unparseable. */
function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (Number.isNaN(n)) throw new Error(`Env var ${name} is not a number: ${raw}`)
  return n
}

function envInt(name: string, fallback: number): number {
  const n = envFloat(name, fallback)
  if (!Number.isInteger(n)) throw new Error(`Env var ${name} must be an integer: ${n}`)
  return n
}

export const BACKFILL_BUDGET_THRESHOLD_15MIN = envFloat('BACKFILL_BUDGET_THRESHOLD_15MIN', 0.80)
export const LIVE_SYNC_BUDGET_THRESHOLD_15MIN = envFloat('LIVE_SYNC_BUDGET_THRESHOLD_15MIN', 0.95)
export const BACKFILL_BUDGET_THRESHOLD_DAILY = envFloat('BACKFILL_BUDGET_THRESHOLD_DAILY', 0.90)
export const BACKFILL_PAGE_SPACING_MS = envInt('BACKFILL_PAGE_SPACING_MS', 250)
export const BACKFILL_LOCK_TTL_SECONDS = envInt('BACKFILL_LOCK_TTL_SECONDS', 60)
