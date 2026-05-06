import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Request, Response } from 'express'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class WebAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const res = context.switchToHttp().getResponse<Response>()

    const token: string | undefined = (req as any).cookies?.access_token
    if (!token) {
      res.redirect('/auth/login')
      return false
    }

    try {
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      })
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user) throw new Error()
      ;(req as any).user = user
      return true
    } catch {
      res.redirect('/auth/login')
      return false
    }
  }
}
