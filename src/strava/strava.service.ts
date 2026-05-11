import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ActivityStatus, SportType, UserStatus } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import { CacheService } from '../cache/cache.service'
import { STRAVA_CLIENT_ID, STRAVA_REDIRECT_URL } from '../config/env'
import { BCRYPT_ROUNDS, TOKEN_BYTES } from '../constants/auth'
import { stravaStateKey } from '../constants/cache-keys'
import {
  STRAVA_REQUIRED_SCOPES,
  STRAVA_STATE_BYTES,
  STRAVA_TOKEN_REFRESH_LEEWAY_SECONDS,
} from '../constants/strava'
import { STRAVA_STATE_TTL_SECONDS } from '../constants/ttl'
import { PrismaService } from '../prisma/prisma.service'
import {
  ActivityImportPayload,
  StravaCallbackResult,
  StravaSyncResult,
} from './entities'
import { StravaApiClient } from './strava-api.client'
import {
  StravaAthlete,
  StravaStateTicket,
  StravaSummaryActivity,
  StravaTokenResponse,
} from './types'

@Injectable()
export class StravaService {
  private readonly logger = new Logger(StravaService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly api: StravaApiClient,
  ) {}

  /**
   * Build a Strava authorize URL. Caller passes the current session's userId (or null
   * for anonymous). The flow kind is recorded in the state ticket so the callback can
   * branch correctly without relying on session presence at callback time.
   */
  public async beginAuth(currentUserId: string | null): Promise<string> {
    const ticket: StravaStateTicket = currentUserId
      ? { kind: 'link', userId: currentUserId }
      : { kind: 'signin' }

    const state = randomBytes(STRAVA_STATE_BYTES).toString('hex')
    await this.cache.set(stravaStateKey(state), JSON.stringify(ticket), STRAVA_STATE_TTL_SECONDS)

    const params = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      redirect_uri: STRAVA_REDIRECT_URL,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,' + STRAVA_REQUIRED_SCOPES.join(','),
      state,
    })
    return `https://www.strava.com/oauth/authorize?${params.toString()}`
  }

  /**
   * Validate state, exchange code for tokens, fetch athlete, and resolve to a User.
   *
   * Throws:
   *  - BadRequestException for invalid/expired state, missing athlete, or scope downgrade
   *  - ConflictException when a Link ticket targets a Strava already bound to another user
   */
  public async handleCallback(
    code: string,
    state: string,
    grantedScope: string,
  ): Promise<StravaCallbackResult> {
    const ticket = await this.consumeState(state)
    this.assertScopes(grantedScope)

    const tokenResponse = await this.api.exchangeCodeForToken(code)
    if (!tokenResponse.athlete) {
      throw new BadRequestException('Strava did not return athlete information')
    }
    const athlete = tokenResponse.athlete
    const athleteId = BigInt(athlete.id)
    const existing = await this.prisma.stravaAccount.findUnique({ where: { id: athleteId } })

    if (ticket.kind === 'link') {
      if (existing && existing.userId !== ticket.userId) {
        throw new ConflictException(
          'This Strava account is already connected to another user.',
        )
      }
      await this.upsertStravaAccount(ticket.userId, tokenResponse, athlete)
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ticket.userId } })
      this.kickoffBackfill(user.id)
      return { user, isNew: false }
    }

    // signin
    if (existing) {
      await this.upsertStravaAccount(existing.userId, tokenResponse, athlete)
      let user = await this.prisma.user.findUniqueOrThrow({ where: { id: existing.userId } })
      // Self-heal: previous versions left Strava-created users in PENDING. Strava
      // OAuth itself is the identity proof for these placeholder-email accounts,
      // so PENDING was wrong (it only blocks email/password login, but they don't
      // have a real password anyway). Flip them to ACTIVE on next signin.
      if (user.status === UserStatus.PENDING && user.email.endsWith('@pending.local')) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { status: UserStatus.ACTIVE },
        })
      }
      return { user, isNew: false }
    }

    const placeholderEmail = `strava-${athlete.id}@pending.local`
    const unusablePasswordHash = await bcrypt.hash(
      randomBytes(TOKEN_BYTES).toString('hex'),
      BCRYPT_ROUNDS,
    )
    const newUser = await this.prisma.user.create({
      data: {
        email: placeholderEmail,
        firstName: athlete.firstname ?? 'Strava',
        lastName: athlete.lastname ?? 'Athlete',
        passwordHash: unusablePasswordHash,
        // ACTIVE: Strava OAuth is the identity proof for these accounts. The
        // placeholder email is a reminder for "set a real one someday" (the
        // dashboard surfaces a banner) — not a verification gate.
        status: UserStatus.ACTIVE,
      },
    })
    await this.upsertStravaAccount(newUser.id, tokenResponse, athlete)
    this.kickoffBackfill(newUser.id)
    return { user: newUser, isNew: true }
  }

  public async syncActivities(userId: string): Promise<StravaSyncResult> {
    const accessToken = await this.getValidAccessToken(userId)
    const summaries = await this.api.listActivities(accessToken, 30, 1)
    return this.upsertActivities(userId, summaries)
  }

  /**
   * Pull the next page of older activities. Page is computed from the count of
   * already-imported Strava activities, so repeated calls keep walking backward
   * through the user's history. Returns `hasMore: false` when Strava returns a
   * partial page (signal that we've reached the end).
   */
  public async syncOlder(userId: string): Promise<StravaSyncResult & { hasMore: boolean }> {
    const PER_PAGE = 30
    const existing = await this.prisma.activity.count({
      where: { userId, externalId: { startsWith: 'strava:' } },
    })
    const page = Math.floor(existing / PER_PAGE) + 1

    const accessToken = await this.getValidAccessToken(userId)
    const summaries = await this.api.listActivities(accessToken, PER_PAGE, page)
    const result = await this.upsertActivities(userId, summaries)
    return { ...result, hasMore: summaries.length === PER_PAGE }
  }

  public async disconnect(userId: string): Promise<void> {
    const account = await this.prisma.stravaAccount.findUnique({ where: { userId } })
    if (!account) return

    try {
      const accessToken = await this.getValidAccessToken(userId)
      await this.api.deauthorize(accessToken)
    } catch (err) {
      this.logger.warn(`Strava deauthorize failed for ${userId}: ${(err as Error).message}`)
    }
    await this.prisma.stravaAccount.delete({ where: { userId } })
  }

  private async consumeState(state: string): Promise<StravaStateTicket> {
    const raw = await this.cache.get(stravaStateKey(state))
    if (!raw) {
      throw new BadRequestException('Authorization link expired or invalid. Please retry.')
    }
    await this.cache.del(stravaStateKey(state))
    return JSON.parse(raw) as StravaStateTicket
  }

  private assertScopes(grantedScope: string): void {
    const granted = new Set(grantedScope.split(/[,\s]/).filter(Boolean))
    for (const required of STRAVA_REQUIRED_SCOPES) {
      if (!granted.has(required)) {
        throw new BadRequestException(
          `Strava authorization is missing required scope "${required}". Please retry and accept all permissions.`,
        )
      }
    }
  }

  private async upsertStravaAccount(
    userId: string,
    token: StravaTokenResponse,
    athlete: StravaAthlete,
  ): Promise<void> {
    const tokenExpiresAt = new Date(token.expires_at * 1000)
    await this.prisma.stravaAccount.upsert({
      where: { userId },
      create: {
        userId,
        id: BigInt(athlete.id),
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenExpiresAt,
        scope: token.scope ?? STRAVA_REQUIRED_SCOPES.join(','),
        athleteFirstName: athlete.firstname,
        athleteLastName: athlete.lastname,
        profilePictureUrl: athlete.profile,
      },
      update: {
        id: BigInt(athlete.id),
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenExpiresAt,
        scope: token.scope ?? STRAVA_REQUIRED_SCOPES.join(','),
        athleteFirstName: athlete.firstname,
        athleteLastName: athlete.lastname,
        profilePictureUrl: athlete.profile,
      },
    })
  }

  /**
   * Returns a non-expired access token for the user, refreshing through Strava
   * if the stored one is within the leeway window. Throws `UnauthorizedException`
   * if the user has no `StravaAccount` (never connected, or disconnected).
   */
  public async getValidAccessToken(userId: string): Promise<string> {
    const account = await this.prisma.stravaAccount.findUnique({ where: { userId } })
    if (!account) throw new UnauthorizedException('Strava is not connected for this user.')

    const nowSeconds = Math.floor(Date.now() / 1000)
    const expiresInSeconds = Math.floor(account.tokenExpiresAt.getTime() / 1000) - nowSeconds
    if (expiresInSeconds > STRAVA_TOKEN_REFRESH_LEEWAY_SECONDS) return account.accessToken

    const refreshed = await this.api.refreshToken(account.refreshToken)
    await this.prisma.stravaAccount.update({
      where: { userId },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        tokenExpiresAt: new Date(refreshed.expires_at * 1000),
      },
    })
    return refreshed.access_token
  }

  private kickoffBackfill(userId: string): void {
    this.syncActivities(userId).catch((err: Error) => {
      this.logger.warn(`Strava initial backfill failed for ${userId}: ${err.message}`)
    })
  }

  private async upsertActivities(
    userId: string,
    summaries: StravaSummaryActivity[],
  ): Promise<StravaSyncResult> {
    let created = 0
    let updated = 0
    for (const s of summaries) {
      const externalId = `strava:${s.id}`
      const data = this.mapSummary(s)
      const result = await this.prisma.activity.upsert({
        where: { userId_externalId: { userId, externalId } },
        create: { ...data, userId, externalId },
        update: data,
      })
      if (result.createdAt.getTime() === result.updatedAt.getTime()) created++
      else updated++
    }
    return { created, updated }
  }

  private mapSummary(s: StravaSummaryActivity): ActivityImportPayload {
    const sportType = mapSport(s.sport_type ?? s.type)
    const avgPace =
      s.average_speed && s.average_speed > 0 ? 1000 / s.average_speed : null
    return {
      title: s.name,
      sportType,
      status: ActivityStatus.COMPLETED,
      startedAt: new Date(s.start_date),
      durationSeconds: s.moving_time,
      distanceMeters: s.distance,
      elevationGainMeters: s.total_elevation_gain,
      avgHeartRate: s.average_heartrate ? Math.round(s.average_heartrate) : null,
      maxHeartRate: s.max_heartrate ? Math.round(s.max_heartrate) : null,
      avgPaceSecondsPerKm: avgPace,
      avgPowerWatts: s.average_watts ? Math.round(s.average_watts) : null,
    }
  }
}

function mapSport(stravaType: string): SportType {
  switch (stravaType) {
    case 'Run':
    case 'TrailRun':
    case 'VirtualRun':
      return SportType.RUNNING
    case 'Ride':
    case 'VirtualRide':
    case 'EBikeRide':
    case 'MountainBikeRide':
    case 'GravelRide':
      return SportType.CYCLING
    case 'Swim':
      return SportType.SWIMMING
    case 'Rowing':
    case 'VirtualRow':
      return SportType.ROWING
    default:
      return SportType.OTHER
  }
}
