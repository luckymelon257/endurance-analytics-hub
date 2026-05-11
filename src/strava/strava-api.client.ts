import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } from '../config/env'
import {
  StravaAthlete,
  StravaDetailedActivity,
  StravaStreamsResponse,
  StravaSummaryActivity,
  StravaTokenResponse,
} from './types'

const STRAVA_BASE = 'https://www.strava.com'
const API_BASE = `${STRAVA_BASE}/api/v3`

@Injectable()
export class StravaApiClient {
  public async exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
    return this.postForm<StravaTokenResponse>(`${STRAVA_BASE}/oauth/token`, {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    })
  }

  public async refreshToken(refreshToken: string): Promise<StravaTokenResponse> {
    return this.postForm<StravaTokenResponse>(`${STRAVA_BASE}/oauth/token`, {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
  }

  public async deauthorize(accessToken: string): Promise<void> {
    const res = await fetch(`${STRAVA_BASE}/oauth/deauthorize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      throw new InternalServerErrorException(`Strava deauthorize failed: ${res.status}`)
    }
  }

  public async getAthlete(accessToken: string): Promise<StravaAthlete> {
    return this.getJson<StravaAthlete>(`${API_BASE}/athlete`, accessToken)
  }

  public async listActivities(
    accessToken: string,
    perPage = 30,
    page = 1,
  ): Promise<StravaSummaryActivity[]> {
    return this.getJson<StravaSummaryActivity[]>(
      `${API_BASE}/athlete/activities?per_page=${perPage}&page=${page}`,
      accessToken,
    )
  }

  /**
   * Fetch the per-activity detail object — has fields the list endpoint omits
   * (notably `calories`, `description`, `device_name`). Returns `null` on 404
   * (deleted/private since import) so callers can degrade gracefully.
   */
  public async getActivity(
    accessToken: string,
    stravaActivityId: number,
  ): Promise<StravaDetailedActivity | null> {
    const url = `${API_BASE}/activities/${stravaActivityId}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (res.status === 404) return null
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new InternalServerErrorException(`Strava ${url} failed: ${res.status} ${text}`)
    }
    return res.json() as Promise<StravaDetailedActivity>
  }

  /**
   * Fetch per-second sample streams for an activity. Returns `null` when Strava
   * 404s (the activity was deleted or made private after we imported it) so the
   * caller can render an empty-state instead of bubbling an exception.
   */
  public async getActivityStreams(
    accessToken: string,
    stravaActivityId: number,
  ): Promise<StravaStreamsResponse | null> {
    const keys = ['time', 'distance', 'heartrate', 'velocity_smooth', 'altitude'].join(',')
    const url = `${API_BASE}/activities/${stravaActivityId}/streams?keys=${keys}&key_by_type=true`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })

    if (res.status === 404) return null
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new InternalServerErrorException(`Strava ${url} failed: ${res.status} ${text}`)
    }
    return res.json() as Promise<StravaStreamsResponse>
  }

  private async postForm<T>(url: string, body: Record<string, string>): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new InternalServerErrorException(`Strava ${url} failed: ${res.status} ${text}`)
    }
    return res.json() as Promise<T>
  }

  private async getJson<T>(url: string, accessToken: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new InternalServerErrorException(`Strava ${url} failed: ${res.status} ${text}`)
    }
    return res.json() as Promise<T>
  }
}
