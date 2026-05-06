import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { UserStatus } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { ForgotPasswordDto } from './dto/forgot-password.dto'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'

const EMAIL_VERIFY_TTL = 60 * 60 * 24     // 24 hours
const PWD_RESET_TTL    = 60 * 60           // 1 hour
const BCRYPT_ROUNDS    = 12

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (exists) throw new ConflictException('Email already registered')

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
      },
    })

    const token = randomBytes(32).toString('hex')
    await this.redis.set(`email_verify:${token}`, user.id, EMAIL_VERIFY_TTL)

    // TODO: send verification email with token
    // In dev, the token is logged for manual testing
    console.log(`[DEV] Email verify link: /auth/verify-email?token=${token}`)

    return { message: 'Registration successful. Check your email to activate your account.' }
  }

  async verifyEmail(token: string) {
    const userId = await this.redis.get(`email_verify:${token}`)
    if (!userId) throw new BadRequestException('Invalid or expired verification link')

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    })
    await this.redis.del(`email_verify:${token}`)

    return { message: 'Email verified. You can now log in.' }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    if (user.status === UserStatus.PENDING)
      throw new UnauthorizedException('Please verify your email before logging in')
    if (user.status === UserStatus.BANNED)
      throw new UnauthorizedException('Your account has been suspended')

    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role })
    return { token, user }
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    // Always return the same message to prevent user enumeration
    if (!user) return { message: 'If that email exists, a reset link has been sent.' }

    const token = randomBytes(32).toString('hex')
    await this.redis.set(`pwd_reset:${token}`, user.id, PWD_RESET_TTL)

    // TODO: send password reset email with token
    console.log(`[DEV] Password reset link: /auth/reset-password?token=${token}`)

    return { message: 'If that email exists, a reset link has been sent.' }
  }

  async resetPassword(dto: ResetPasswordDto) {
    const userId = await this.redis.get(`pwd_reset:${dto.token}`)
    if (!userId) throw new BadRequestException('Invalid or expired reset link')

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } })
    await this.redis.del(`pwd_reset:${dto.token}`)

    return { message: 'Password updated successfully.' }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException()

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) throw new BadRequestException('Current password is incorrect')

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } })

    return { message: 'Password changed successfully.' }
  }
}
