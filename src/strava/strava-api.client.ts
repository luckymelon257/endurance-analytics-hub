import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } from '../config/env'
import { StravaBudgetService, CallerKind } from './strava-budget.service'
import { StravaRateLimitedError } from './strava-rate-limited.error'
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
  constructor(private readonly budget: StravaBudgetService) {}

  /** Token endpoints bypass the gate — transparent, infrequent, must succeed. */
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
    await this.afterFetch(res)
    if (!res.ok) {
      throw new InternalServerErrorException(`Strava deauthorize failed: ${res.status}`)
    }
  }

  public async getAthlete(accessToken: string): Promise<StravaAthlete> {
    return this.getJson<StravaAthlete>(`${API_BASE}/athlete`, accessToken, 'LIVE_SYNC')
  }

  /**
   * Default perPage bumped from 30 → 200 (Strava's max). Same single request.
   */
  public async listActivities(
    accessToken: string,
    perPage = 200,
    page = 1,
    callerKind: CallerKind = 'BACKFILL',
  ): Promise<StravaSummaryActivity[]> {
    return this.getJson<StravaSummaryActivity[]>(
      `${API_BASE}/athlete/activities?per_page=${perPage}&page=${page}`,
      accessToken,
      callerKind,
    )
  }

  public async getActivity(
    accessToken: string,
    stravaActivityId: number,
  ): Promise<StravaDetailedActivity | null> {
    const url = `${API_BASE}/activities/${stravaActivityId}`
    return this.getJsonOrNullOn404<StravaDetailedActivity>(url, accessToken, 'LIVE_SYNC')
  }

  public async getActivityStreams(
    accessToken: string,
    stravaActivityId: number,
  ): Promise<StravaStreamsResponse | null> {
    const keys = ['time', 'distance', 'heartrate', 'velocity_smooth', 'altitude'].join(',')
    const url = `${API_BASE}/activities/${stravaActivityId}/streams?keys=${keys}&key_by_type=true`
    return this.getJsonOrNullOn404<StravaStreamsResponse>(url, accessToken, 'LIVE_SYNC')
  }

  // ---------- private ----------

  private async postForm<T>(url: string, body: Record<string, string>): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    })
    await this.afterFetch(res)
    await this.throwIfRateLimited(res)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new InternalServerErrorException(`Strava ${url} failed: ${res.status} ${text}`)
    }
    return res.json() as Promise<T>
  }

  private async getJson<T>(url: string, accessToken: string, kind: CallerKind): Promise<T> {
    const gate = await this.budget.canStartRequest(kind)
    if (!gate.ok) {
      throw new StravaRateLimitedError(gate.retryAfterSeconds)
    }
    let res: Response
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    } catch (err) {
      await this.budget.releaseReservation()
      throw err
    }
    await this.afterFetch(res)
    await this.throwIfRateLimited(res)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new InternalServerErrorException(`Strava ${url} failed: ${res.status} ${text}`)
    }
    return res.json() as Promise<T>
  }

  private async getJsonOrNullOn404<T>(
    url: string,
    accessToken: string,
    kind: CallerKind,
  ): Promise<T | null> {
    const gate = await this.budget.canStartRequest(kind)
    if (!gate.ok) {
      throw new StravaRateLimitedError(gate.retryAfterSeconds)
    }
    let res: Response
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    } catch (err) {
      await this.budget.releaseReservation()
      throw err
    }
    await this.afterFetch(res)
    if (res.status === 404) return null
    await this.throwIfRateLimited(res)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new InternalServerErrorException(`Strava ${url} failed: ${res.status} ${text}`)
    }
    return res.json() as Promise<T>
  }

  private async afterFetch(res: Response): Promise<void> {
    try {
      await this.budget.recordResponse(res.headers)
    } catch {
      // Don't let a Redis hiccup abort a Strava response. TTL self-heals leaked reservations.
    }
  }

  private async throwIfRateLimited(res: Response): Promise<void> {
    if (res.status !== 429) return
    const retryAfter = Number(res.headers.get('retry-after'))
    const retrySeconds =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.floor(retryAfter)
        : this.budget.nextWindowResetSeconds() + 30
    throw new StravaRateLimitedError(retrySeconds)
  }
}
