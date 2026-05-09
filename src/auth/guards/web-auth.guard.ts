import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { User } from '@prisma/client'
import { Request, Response } from 'express'
import { JWT_SECRET } from '../../config/env'
import { AUTH_COOKIE_NAME } from '../../constants/auth'
import { PrismaService } from '../../prisma/prisma.service'

interface AuthedRequest extends Request {
  user?: User
}

@Injectable()
export class WebAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>()
    const res = context.switchToHttp().getResponse<Response>()

    const token: string | undefined = req.cookies?.[AUTH_COOKIE_NAME]
    if (!token) {
      res.redirect('/auth/login')
      return false
    }

    try {
      const payload = this.jwt.verify<{ sub: string }>(token, { secret: JWT_SECRET })
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user) throw new Error()
      req.user = user
      return true
    } catch {
      res.redirect('/auth/login')
      return false
    }
  }
}
