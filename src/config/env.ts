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
