import { Controller, Get, Render, Res, UseGuards } from '@nestjs/common'
import { User } from '@prisma/client'
import { Response } from 'express'
import { CurrentUser } from './auth/decorators/current-user.decorator'
import { Public } from './auth/decorators/public.decorator'
import { WebAuthGuard } from './auth/guards/web-auth.guard'

@Controller()
export class AppController {
  @Public()
  @Get()
  root(@Res() res: Response) {
    return res.redirect('/auth/login')
  }

  @Public()
  @UseGuards(WebAuthGuard)
  @Get('dashboard')
  @Render('dashboard')
  dashboard(@CurrentUser() user: User) {
    return { title: 'Dashboard', user }
  }
}
