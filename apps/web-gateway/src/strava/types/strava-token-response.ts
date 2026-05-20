import { StravaAthlete } from './strava-athlete'

export interface StravaTokenResponse {
  access_token: string
  refresh_token: string
  /** Unix seconds. */
  expires_at: number
  expires_in: number
  token_type: 'Bearer'
  /** Present on initial token exchange, absent on refresh. */
  athlete?: StravaAthlete
  /** Present on initial exchange. */
  scope?: string
}
