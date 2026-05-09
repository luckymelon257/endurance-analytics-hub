import { Controller, Get, Query, Render, Res, UseGuards } from '@nestjs/common'
import { User } from '@prisma/client'
import { Response } from 'express'
import { CurrentUser } from './auth/decorators/current-user.decorator'
import { Public } from './auth/decorators/public.decorator'
import { WebAuthGuard } from './auth/guards/web-auth.guard'
import { PrismaService } from './prisma/prisma.service'

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  public root(@Res() res: Response) {
    return res.redirect('/auth/login')
  }

  @Public()
  @UseGuards(WebAuthGuard)
  @Get('dashboard')
  @Render('dashboard')
  public async dashboard(
    @CurrentUser() user: User,
    @Query('strava') stravaFlash?: 'connected' | 'new' | 'disconnected',
  ) {
    const stravaAccount = await this.prisma.stravaAccount.findUnique({
      where: { userId: user.id },
    })
    return {
      title: 'Dashboard',
      user,
      stravaConnected: stravaAccount !== null,
      stravaAthleteName: stravaAccount
        ? `${stravaAccount.athleteFirstName ?? ''} ${stravaAccount.athleteLastName ?? ''}`.trim()
        : null,
      stravaFlash: stravaFlash ?? null,
    }
  }
}
