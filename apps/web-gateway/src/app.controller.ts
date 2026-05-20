import { Controller, Get, Query, Render, Res, UseGuards } from '@nestjs/common'
import { User } from '@prisma/client'
import { Response } from 'express'
import { ActivitiesService } from './activities/activities.service'
import { CurrentUser } from './auth/decorators/current-user.decorator'
import { Public } from './auth/decorators/public.decorator'
import { WebAuthGuard } from './auth/guards/web-auth.guard'
import { BackfillCoordinator } from './backfill/backfill.coordinator'
import { PrismaService } from './prisma/prisma.service'

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
    private readonly backfill: BackfillCoordinator,
  ) {}

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
    @Query('year') yearRaw?: string,
    @Query('strava') stravaFlash?: 'connected' | 'new' | 'disconnected',
  ) {
    const heatmapYear = this.parseDashboardYear(yearRaw)
    const [stravaAccount, dashboard, backfillJob] = await Promise.all([
      this.prisma.stravaAccount.findUnique({ where: { userId: user.id } }),
      this.activitiesService.getDashboardData(user.id, heatmapYear),
      this.backfill.getActiveJob(user.id),
    ])

    return {
      title: 'Dashboard',
      user,
      dashboard,
      heatmapYear,
      stravaConnected: stravaAccount !== null,
      stravaAthleteName: stravaAccount
        ? `${stravaAccount.athleteFirstName ?? ''} ${stravaAccount.athleteLastName ?? ''}`.trim()
        : null,
      stravaFlash: stravaFlash ?? null,
      backfillJob,
    }
  }

  /**
   * HTMX partial: just the dashboard data sections (stats / heatmap / recent /
   * weekly volume). Refreshed in-place after Strava sync, no full page reload.
   */
  @Public()
  @UseGuards(WebAuthGuard)
  @Get('partials/dashboard/data')
  @Render('partials/dashboard-data')
  public async dashboardData(@CurrentUser() user: User, @Query('year') yearRaw?: string) {
    const heatmapYear = this.parseDashboardYear(yearRaw)
    const [stravaAccount, dashboard] = await Promise.all([
      this.prisma.stravaAccount.findUnique({ where: { userId: user.id } }),
      this.activitiesService.getDashboardData(user.id, heatmapYear),
    ])
    return { dashboard, heatmapYear, stravaConnected: stravaAccount !== null }
  }

  private parseDashboardYear(yearRaw?: string): number {
    if (!yearRaw) return new Date().getFullYear()
    const year = Number(yearRaw)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return new Date().getFullYear()
    }
    return year
  }
}
