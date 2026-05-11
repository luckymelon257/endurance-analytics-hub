import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Render,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { Request, Response } from 'express'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { WebAuthGuard } from '../auth/guards/web-auth.guard'
import { ActivitiesService } from './activities.service'

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Public()
  @UseGuards(WebAuthGuard)
  @Get()
  @Render('activities')
  public async index(@CurrentUser() user: User, @Req() req: Request) {
    // 100 is enough headroom that "Load older" pages add visible rows for users
    // with up to a few years of imports. True pagination on the list view is a
    // follow-up if anyone hits this ceiling.
    const activities = await this.activitiesService.listForUser(user.id, 100)
    return {
      title: 'Activities',
      user,
      activities,
      query: req.query,
    }
  }

  /**
   * HTMX partial: just the activities-list island container. Refreshed in-place
   * after Strava sync so the table updates without a full page reload.
   */
  @Public()
  @UseGuards(WebAuthGuard)
  @Get('partials/list')
  @Render('partials/activities-list-island')
  public async partialList(@CurrentUser() user: User) {
    const activities = await this.activitiesService.listForUser(user.id, 100)
    return { activities }
  }

  @Public()
  @UseGuards(WebAuthGuard)
  @Get(':id')
  public async detail(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    try {
      const detail = await this.activitiesService.getDetail(user.id, id)
      return res.render('activity-detail', {
        title: detail.activity.title,
        user,
        detail,
      })
    } catch (err) {
      if (err instanceof NotFoundException) {
        return res.redirect('/activities')
      }
      throw err
    }
  }
}
