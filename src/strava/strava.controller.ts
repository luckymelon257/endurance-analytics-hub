import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { OperationMessage } from '../common/types'
import { JWT_SECRET } from '../config/env'
import { AUTH_COOKIE_NAME } from '../constants/auth'
import { PrismaService } from '../prisma/prisma.service'
import { StravaSyncResult } from './entities'
import { StravaService } from './strava.service'

type StravaErrorCode = 'denied' | 'invalid' | 'scope' | 'conflict' | 'failed'

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
  @HttpCode(HttpStatus.OK)
  public async sync(@CurrentUser() user: User): Promise<StravaSyncResult> {
    return this.stravaService.syncActivities(user.id)
  }

  @Post('strava/disconnect')
  @HttpCode(HttpStatus.OK)
  public async disconnect(@CurrentUser() user: User): Promise<OperationMessage> {
    await this.stravaService.disconnect(user.id)
    return { message: 'Strava disconnected.' }
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
