import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { RoleName } from '@prisma/client'
import { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JWT_SECRET } from '../../config/env'
import { AUTH_COOKIE_NAME } from '../../constants/auth'
import { PrismaService } from '../../prisma/prisma.service'

interface JwtPayload {
  sub: string
  email: string
  role: RoleName
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.[AUTH_COOKIE_NAME] ?? null,
      ]),
      secretOrKey: JWT_SECRET,
      ignoreExpiration: false,
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) throw new UnauthorizedException()
    return user
  }
}
