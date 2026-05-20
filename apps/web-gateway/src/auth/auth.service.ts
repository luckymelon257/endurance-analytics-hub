import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { User, UserStatus } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import { Response } from 'express'
import { CacheService } from '../cache/cache.service'
import { OperationMessage } from '../common/types'
import { APP_URL, IS_PRODUCTION } from '../config/env'
import {
  AUTH_COOKIE_MAX_AGE_MS,
  AUTH_COOKIE_NAME,
  BCRYPT_ROUNDS,
  RATE_LIMIT_MAX,
  TOKEN_BYTES,
} from '../constants/auth'
import {
  emailChangeTokenKey,
  emailChangeUserKey,
  emailVerifyTokenKey,
  emailVerifyUserKey,
  passwordResetTokenKey,
  rateLimitVerifyKey,
} from '../constants/cache-keys'
import {
  EMAIL_CHANGE_TTL_SECONDS,
  EMAIL_VERIFY_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
  RATE_LIMIT_WINDOW_SECONDS,
} from '../constants/ttl'
import { MailerService } from '../mailer/mailer.service'
import { PrismaService } from '../prisma/prisma.service'
import { ForgotPasswordDto } from './dto/forgot-password.dto'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import { ResendVerificationDto } from './dto/resend-verification.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly mailer: MailerService,
    private readonly jwt: JwtService,
  ) {}

  public async register(dto: RegisterDto): Promise<void> {
    const count = await this.cache.increment(
      rateLimitVerifyKey(dto.email),
      RATE_LIMIT_WINDOW_SECONDS,
    )
    if (count > RATE_LIMIT_MAX) return

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })

    if (!existing) {
      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
        },
      })
      await this.issueVerificationToken(user)
      return
    }

    if (existing.status === UserStatus.PENDING) {
      await this.issueVerificationToken(existing)
      return
    }

    await this.mailer.sendMail({
      to: existing.email,
      subject: 'Someone tried to sign up with your email',
      template: 'register-attempt-existing',
      context: {
        firstName: existing.firstName,
        loginUrl: `${APP_URL}/auth/login`,
        forgotUrl: `${APP_URL}/auth/forgot-password`,
      },
    })
  }

  public async resendVerification(dto: ResendVerificationDto): Promise<void> {
    const count = await this.cache.increment(
      rateLimitVerifyKey(dto.email),
      RATE_LIMIT_WINDOW_SECONDS,
    )
    if (count > RATE_LIMIT_MAX) return

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (user?.status === UserStatus.PENDING) {
      await this.issueVerificationToken(user)
    }
  }

  public async verifyEmail(token: string): Promise<void> {
    const userId = await this.cache.get(emailVerifyTokenKey(token))
    if (!userId) throw new BadRequestException('Invalid or expired verification link')

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    })
    await this.cache.del(emailVerifyTokenKey(token))
    await this.cache.del(emailVerifyUserKey(userId))
  }

  public async login(dto: LoginDto, res: Response): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    if (user.status === UserStatus.PENDING)
      throw new UnauthorizedException('Please verify your email before logging in')
    if (user.status === UserStatus.BANNED)
      throw new UnauthorizedException('Your account has been suspended')

    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role })
    this.setAuthCookie(res, token)
    return user
  }

  public logout(res: Response): void {
    res.clearCookie(AUTH_COOKIE_NAME)
  }

  /** Mint a JWT for the given user and write it to the auth cookie on `res`. */
  public issueSessionCookie(res: Response, user: User): void {
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role })
    this.setAuthCookie(res, token)
  }

  private setAuthCookie(res: Response, token: string): void {
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    })
  }

  public async forgotPassword(dto: ForgotPasswordDto): Promise<OperationMessage> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) return { message: 'If that email exists, a reset link has been sent.' }

    const token = randomBytes(TOKEN_BYTES).toString('hex')
    await this.cache.set(passwordResetTokenKey(token), user.id, PASSWORD_RESET_TTL_SECONDS)

    // TODO: send password reset email via MailerService once a template exists
    console.log(`[DEV] Password reset link: /auth/reset-password?token=${token}`)

    return { message: 'If that email exists, a reset link has been sent.' }
  }

  public async resetPassword(dto: ResetPasswordDto): Promise<OperationMessage> {
    const userId = await this.cache.get(passwordResetTokenKey(dto.token))
    if (!userId) throw new BadRequestException('Invalid or expired reset link')

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } })
    await this.cache.del(passwordResetTokenKey(dto.token))

    return { message: 'Password updated successfully.' }
  }

  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<OperationMessage> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException()

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) throw new BadRequestException('Current password is incorrect')

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } })

    return { message: 'Password changed successfully.' }
  }

  /** Update editable profile fields. Returns the fresh User row. */
  public async updateProfile(
    userId: string,
    data: { firstName: string; lastName: string },
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { firstName: data.firstName, lastName: data.lastName },
    })
  }

  /**
   * Settings-page password setter for Strava-OAuth-only accounts. These users
   * have an unusable random hash from the OAuth signup flow, so there's no
   * "current password" to verify — the session cookie is the identity proof.
   * Refuses on accounts that already have a real password (use `changePassword`).
   */
  public async setInitialPassword(userId: string, newPassword: string): Promise<OperationMessage> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException()
    if (!isPlaceholderEmail(user.email)) {
      throw new BadRequestException(
        'This account already has a password — use Change password instead.',
      )
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } })
    return { message: 'Password set.' }
  }

  /**
   * Begin an email change. Sends a confirmation link to the *new* address (not
   * the old one — the old address may already be abandoned, which is exactly
   * why users change it). The old email keeps working until they click.
   *
   * Throws ConflictException if `newEmail` already belongs to another user.
   */
  public async requestEmailChange(userId: string, newEmail: string): Promise<OperationMessage> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException()

    const normalized = newEmail.trim().toLowerCase()
    if (normalized === user.email.toLowerCase()) {
      throw new BadRequestException('That is already your email address.')
    }

    const conflict = await this.prisma.user.findUnique({ where: { email: normalized } })
    if (conflict && conflict.id !== userId) {
      throw new ConflictException('That email is already in use.')
    }

    // Invalidate any previous pending request for this user so the latest one wins.
    const previousToken = await this.cache.get(emailChangeUserKey(userId))
    if (previousToken) await this.cache.del(emailChangeTokenKey(previousToken))

    const token = randomBytes(TOKEN_BYTES).toString('hex')
    const payload = JSON.stringify({ userId, newEmail: normalized })
    await this.cache.set(emailChangeTokenKey(token), payload, EMAIL_CHANGE_TTL_SECONDS)
    await this.cache.set(emailChangeUserKey(userId), token, EMAIL_CHANGE_TTL_SECONDS)

    await this.mailer.sendMail({
      to: normalized,
      subject: 'Confirm your new email',
      template: 'change-email',
      context: {
        firstName: user.firstName,
        newEmail: normalized,
        link: `${APP_URL}/auth/confirm-email-change?token=${token}`,
      },
    })

    return { message: `Confirmation sent to ${normalized}.` }
  }

  /**
   * Consume an email-change token and atomically update the user's email. Race-
   * safe against another user grabbing the same email in the window: the unique
   * constraint on `email` surfaces as a Prisma P2002 error, which we translate.
   */
  public async confirmEmailChange(token: string): Promise<{ userId: string; newEmail: string }> {
    const raw = await this.cache.get(emailChangeTokenKey(token))
    if (!raw) throw new BadRequestException('This confirmation link is invalid or expired.')

    let userId: string
    let newEmail: string
    try {
      const parsed = JSON.parse(raw) as { userId: string; newEmail: string }
      userId = parsed.userId
      newEmail = parsed.newEmail
    } catch {
      throw new BadRequestException('This confirmation link is malformed.')
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { email: newEmail, status: UserStatus.ACTIVE },
      })
    } catch (err) {
      // P2002 = unique-constraint violation (someone else took this email in the meantime).
      if ((err as { code?: string }).code === 'P2002') {
        await this.cache.del(emailChangeTokenKey(token))
        await this.cache.del(emailChangeUserKey(userId))
        throw new ConflictException('That email is already in use.')
      }
      throw err
    }

    await this.cache.del(emailChangeTokenKey(token))
    await this.cache.del(emailChangeUserKey(userId))
    return { userId, newEmail }
  }

  /**
   * Delete a user and all of their data. Strava-only placeholder accounts skip
   * the password check (no real password to verify); regular accounts must
   * supply the current password to confirm.
   *
   * Prisma cascades take care of activities, training blocks, and the Strava
   * account row. The cookie is cleared by the caller.
   */
  public async deleteAccount(userId: string, password?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException()

    if (!isPlaceholderEmail(user.email)) {
      if (!password) throw new BadRequestException('Password is required to delete this account.')
      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) throw new BadRequestException('Password is incorrect.')
    }

    await this.prisma.user.delete({ where: { id: userId } })
  }

  private async issueVerificationToken(user: User): Promise<void> {
    const previous = await this.cache.get(emailVerifyUserKey(user.id))
    if (previous) {
      await this.cache.del(emailVerifyTokenKey(previous))
    }

    const token = randomBytes(TOKEN_BYTES).toString('hex')
    await this.cache.set(emailVerifyTokenKey(token), user.id, EMAIL_VERIFY_TTL_SECONDS)
    await this.cache.set(emailVerifyUserKey(user.id), token, EMAIL_VERIFY_TTL_SECONDS)

    await this.mailer.sendMail({
      to: user.email,
      subject: 'Verify your email',
      template: 'verify-email',
      context: {
        firstName: user.firstName,
        link: `${APP_URL}/auth/verify-email?token=${token}`,
      },
    })
  }
}

/**
 * Strava-only signup creates a User with email `strava-<athleteId>@pending.local`
 * and a random unusable password hash. We use that suffix as the marker for
 * "no real credentials yet" everywhere in the settings flows.
 */
function isPlaceholderEmail(email: string): boolean {
  return email.endsWith('@pending.local')
}
