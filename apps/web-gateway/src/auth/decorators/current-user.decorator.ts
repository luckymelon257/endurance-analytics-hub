import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { User } from '@prisma/client'
import { Request } from 'express'

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<Request & { user: User }>()
    return request.user
  },
)
