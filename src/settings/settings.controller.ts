import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { BackfillJob, StravaAccount, User } from '@prisma/client'
import { Request, Response } from 'express'
import { AuthService } from '../auth/auth.service'
import { BackfillCoordinator } from '../backfill/backfill.coordinator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { WebAuthGuard } from '../auth/guards/web-auth.guard'
import { AUTH_COOKIE_NAME } from '../constants/auth'
import { emailChangeTokenKey, emailChangeUserKey } from '../constants/cache-keys'
import { CacheService } from '../cache/cache.service'
import { PrismaService } from '../prisma/prisma.service'
import { StravaService } from '../strava/strava.service'
import { ChangeEmailDto } from './dto/change-email.dto'
import { DeleteAccountDto } from './dto/delete-account.dto'
import { UpdatePasswordDto } from './dto/update-password.dto'
import { UpdateProfileDto } from './dto/update-profile.dto'

const DELETE_CONFIRMATION_PHRASE = 'DELETE my account'

type ToastKind = 'success' | 'error' | 'info'

interface SettingsContext {
  user: User
  isPlaceholderEmail: boolean
  pendingEmailChange: string | null
  strava: {
    athleteName: string | null
    profilePictureUrl: string | null
    connectedAt: Date
    scope: string
  } | null
  backfillJob: BackfillJob | null
}

@Public()
@UseGuards(WebAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly authService: AuthService,
    private readonly stravaService: StravaService,
    private readonly backfill: BackfillCoordinator,
  ) {}

  @Get()
  public async index(
    @CurrentUser() user: User,
    @Res() res: Response,
    @Query('email_changed') emailChanged?: string,
    @Query('email_change_error') emailChangeError?: string,
  ) {
    const ctx = await this.buildContext(user.id)
    const flash = emailChanged
      ? { kind: 'success' as const, message: 'Your email has been updated.' }
      : emailChangeError
      ? {
          kind: 'error' as const,
          message: 'That confirmation link is invalid, expired, or the email is now taken.',
        }
      : null

    return res.render('settings', {
      title: 'Settings',
      user: ctx.user,
      settings: ctx,
      flash,
    })
  }

  @Post('profile')
  public async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
    @Res() res: Response,
  ) {
    await this.authService.updateProfile(user.id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
    })
    return this.renderCard(res, 'settings-profile', user.id, {
      message: 'Profile updated.',
      kind: 'success',
    })
  }

  @Post('email')
  public async changeEmail(
    @CurrentUser() user: User,
    @Body() dto: ChangeEmailDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.authService.requestEmailChange(user.id, dto.newEmail)
      return this.renderCard(res, 'settings-profile', user.id, {
        message: result.message,
        kind: 'success',
      })
    } catch (err) {
      return this.renderCard(res, 'settings-profile', user.id, {
        message: (err as Error).message || 'Could not start email change.',
        kind: 'error',
      })
    }
  }

  @Post('email/cancel')
  public async cancelEmailChange(@CurrentUser() user: User, @Res() res: Response) {
    const previousToken = await this.cache.get(emailChangeUserKey(user.id))
    if (previousToken) {
      await this.cache.del(emailChangeTokenKey(previousToken))
      await this.cache.del(emailChangeUserKey(user.id))
    }
    return this.renderCard(res, 'settings-profile', user.id, {
      message: 'Pending email change cancelled.',
      kind: 'info',
    })
  }

  @Post('password')
  public async updatePassword(
    @CurrentUser() user: User,
    @Body() dto: UpdatePasswordDto,
    @Res() res: Response,
  ) {
    try {
      if (isPlaceholderEmail(user.email)) {
        await this.authService.setInitialPassword(user.id, dto.newPassword)
        return this.renderCard(res, 'settings-password', user.id, {
          message: 'Password set.',
          kind: 'success',
        })
      }
      if (!dto.currentPassword) {
        return this.renderCard(res, 'settings-password', user.id, {
          message: 'Current password is required.',
          kind: 'error',
        })
      }
      await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword)
      return this.renderCard(res, 'settings-password', user.id, {
        message: 'Password changed.',
        kind: 'success',
      })
    } catch (err) {
      return this.renderCard(res, 'settings-password', user.id, {
        message: (err as Error).message || 'Could not update password.',
        kind: 'error',
      })
    }
  }

  @Post('account/delete')
  public async deleteAccount(
    @CurrentUser() user: User,
    @Body() dto: DeleteAccountDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (dto.confirmation !== DELETE_CONFIRMATION_PHRASE) {
      return this.renderCard(res, 'settings-danger', user.id, {
        message: `Type "${DELETE_CONFIRMATION_PHRASE}" exactly to confirm.`,
        kind: 'error',
      })
    }
    try {
      // Best-effort Strava deauthorization, mirroring StravaService.disconnect.
      // Cascade-deleting the StravaAccount row is enough on our side, but it's
      // polite to revoke our token on theirs.
      try {
        await this.stravaService.disconnect(user.id)
      } catch {
        // ignore — disconnect failure shouldn't block account deletion
      }
      await this.authService.deleteAccount(user.id, dto.password)
    } catch (err) {
      return this.renderCard(res, 'settings-danger', user.id, {
        message: (err as Error).message || 'Could not delete account.',
        kind: 'error',
      })
    }

    res.clearCookie(AUTH_COOKIE_NAME)
    if (isHtmx(req)) {
      res.setHeader('HX-Redirect', '/auth/login?deleted=1')
      return res.status(204).end()
    }
    return res.redirect('/auth/login?deleted=1')
  }

  private async renderCard(
    res: Response,
    partial: 'settings-profile' | 'settings-password' | 'settings-connections' | 'settings-danger',
    userId: string,
    toast: { message: string; kind: ToastKind },
  ) {
    const ctx = await this.buildContext(userId)
    res.setHeader(
      'HX-Trigger',
      JSON.stringify({ showToast: { message: toast.message, kind: toast.kind } }),
    )
    return res.render(`partials/${partial}`, { settings: ctx, user: ctx.user })
  }

  private async buildContext(userId: string): Promise<SettingsContext> {
    const [user, stravaAccount, pendingToken, backfillJob] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.stravaAccount.findUnique({ where: { userId } }),
      this.cache.get(emailChangeUserKey(userId)),
      this.backfill.getStatus(userId),
    ])

    const pendingEmailChange = pendingToken
      ? await extractPendingNewEmail(this.cache, pendingToken)
      : null

    return {
      user,
      isPlaceholderEmail: isPlaceholderEmail(user.email),
      pendingEmailChange,
      strava: stravaAccount ? toStravaSummary(stravaAccount) : null,
      backfillJob,
    }
  }
}

async function extractPendingNewEmail(
  cache: CacheService,
  token: string,
): Promise<string | null> {
  const raw = await cache.get(emailChangeTokenKey(token))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { newEmail?: string }
    return parsed.newEmail ?? null
  } catch {
    return null
  }
}

function toStravaSummary(account: StravaAccount): SettingsContext['strava'] {
  const name = `${account.athleteFirstName ?? ''} ${account.athleteLastName ?? ''}`.trim()
  return {
    athleteName: name || null,
    profilePictureUrl: account.profilePictureUrl ?? null,
    connectedAt: account.connectedAt,
    scope: account.scope,
  }
}

function isPlaceholderEmail(email: string): boolean {
  return email.endsWith('@pending.local')
}

function isHtmx(req: Request): boolean {
  return req.headers['hx-request'] === 'true'
}
