import {
  BadRequestException,
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
  emailVerifyTokenKey,
  emailVerifyUserKey,
  passwordResetTokenKey,
  rateLimitVerifyKey,
} from '../constants/cache-keys'
import {
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
