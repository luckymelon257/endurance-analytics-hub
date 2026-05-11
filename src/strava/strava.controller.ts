import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { User } from '@prisma/client'
import { Request, Response } from 'express'
import { AuthService } from '../auth/auth.service'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { JWT_SECRET } from '../config/env'
import { AUTH_COOKIE_NAME } from '../constants/auth'
import { PrismaService } from '../prisma/prisma.service'
import { StravaSyncResult } from './entities'
import { StravaService } from './strava.service'

type StravaErrorCode = 'denied' | 'invalid' | 'scope' | 'conflict' | 'failed'
type ToastKind = 'success' | 'error' | 'info'

@Controller()
export class StravaController {
  private readonly logger = new Logger(StravaController.name)

  constructor(
    private readonly stravaService: StravaService,
    private readonly authService: AuthService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('auth/strava/connect')
  public async connect(@Req() req: Request, @Res() res: Response) {
    const currentUserId = await this.softAuth(req)
    const url = await this.stravaService.beginAuth(currentUserId)
    return res.redirect(url)
  }

  @Public()
  @Get('auth/strava/callback')
  public async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('scope') scope: string | undefined,
    @Query('error') stravaError: string | undefined,
    @Res() res: Response,
  ) {
    if (stravaError) {
      return this.redirectWithError(res, 'denied')
    }
    if (!code || !state) {
      return this.redirectWithError(res, 'invalid')
    }

    try {
      const { user, isNew } = await this.stravaService.handleCallback(code, state, scope ?? '')
      this.authService.issueSessionCookie(res, user)
      return res.redirect(isNew ? '/dashboard?strava=new' : '/dashboard?strava=connected')
    } catch (err) {
      return this.redirectWithError(res, this.classifyError(err))
    }
  }

  @Post('strava/sync')
  public async sync(@CurrentUser() user: User, @Req() req: Request, @Res() res: Response) {
    const result = await this.stravaService.syncActivities(user.id)
    return this.respondWithSync(req, res, result, 'Synced from Strava.')
  }

  @Post('strava/disconnect')
  public async disconnect(@CurrentUser() user: User, @Req() req: Request, @Res() res: Response) {
    await this.stravaService.disconnect(user.id)
    if (this.isHtmx(req)) {
      // The Strava panel structure changes (Sync/Disconnect → Link), so a full
      // refresh is simpler than partial-swap dance. Toast + reload.
      res.setHeader('HX-Trigger', this.buildTrigger('Strava disconnected.', 'info'))
      res.setHeader('HX-Refresh', 'true')
      return res.status(204).end()
    }
    return res.redirect('/dashboard?strava=disconnected')
  }

  /**
   * Build a sync-completed response. HTMX clients get a toast + a syncCompleted
   * custom event (which the dashboard / activities views listen for to re-fetch
   * their data partials). Non-HTMX clients get the legacy redirect.
   */
  private respondWithSync(
    req: Request,
    res: Response,
    result: StravaSyncResult,
    fallbackMessage: string,
    extras: { allCaughtUp?: boolean } = {},
  ) {
    const toastMessage = formatSyncToast(result, fallbackMessage)

    if (this.isHtmx(req)) {
      res.setHeader(
        'HX-Trigger',
        JSON.stringify({
          showToast: { message: toastMessage, kind: 'success' satisfies ToastKind },
          syncCompleted: true,
        }),
      )
      return res.status(204).end()
    }

    // Non-HTMX fallback: redirect to wherever the form was submitted from, with
    // a query param for the server-rendered flash banner.
    const target = req.headers.referer ?? '/dashboard'
    const url = new URL(target, 'http://placeholder')
    if (extras.allCaughtUp) url.searchParams.set('synced', 'all')
    else if (result.created > 0) url.searchParams.set('synced', String(result.created))
    return res.redirect(url.pathname + url.search)
  }

  private isHtmx(req: Request): boolean {
    return req.headers['hx-request'] === 'true'
  }

  private buildTrigger(message: string, kind: ToastKind, extraEvents: string[] = []): string {
    const payload: Record<string, unknown> = { showToast: { message, kind } }
    for (const evt of extraEvents) payload[evt] = true
    return JSON.stringify(payload)
  }

  /**
   * Soft authentication — returns the userId from the access-token cookie if it's
   * present and valid, otherwise null. Never throws or redirects.
   */
  private async softAuth(req: Request): Promise<string | null> {
    const token: string | undefined = req.cookies?.[AUTH_COOKIE_NAME]
    if (!token) return null
    try {
      const payload = this.jwt.verify<{ sub: string }>(token, { secret: JWT_SECRET })
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
      return user?.id ?? null
    } catch {
      return null
    }
  }

  private classifyError(err: unknown): StravaErrorCode {
    if (err instanceof ConflictException) return 'conflict'
    if (err instanceof BadRequestException) {
      const message = String((err as BadRequestException).message ?? '')
      if (message.toLowerCase().includes('scope')) return 'scope'
      if (message.toLowerCase().includes('expired') || message.toLowerCase().includes('invalid')) {
        return 'invalid'
      }
      return 'invalid'
    }
    this.logger.error(`Strava callback failed: ${(err as Error).message}`, (err as Error).stack)
    return 'failed'
  }

  private redirectWithError(res: Response, code: StravaErrorCode) {
    return res.redirect(`/auth/login?strava_error=${code}`)
  }
}

/**
 * Render the per-sync toast string. "3 created, 12 updated" if there's anything,
 * otherwise the caller's contextual fallback ("No older activities…", etc.).
 */
function formatSyncToast(result: StravaSyncResult, fallback: string): string {
  const { created, updated } = result
  if (created === 0 && updated === 0) return fallback

  const parts: string[] = []
  if (created > 0) parts.push(`${created} new`)
  if (updated > 0) parts.push(`${updated} updated`)
  const noun = created + updated === 1 ? 'activity' : 'activities'
  return `${parts.join(', ')} ${noun}.`
}
