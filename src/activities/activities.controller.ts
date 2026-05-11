import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Render,
  Res,
  UseGuards,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { Response } from 'express'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { WebAuthGuard } from '../auth/guards/web-auth.guard'
import { ActivitiesService } from './activities.service'
import { ListActivitiesQueryDto } from './dto/list-activities-query.dto'

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Public()
  @UseGuards(WebAuthGuard)
  @Get()
  @Render('activities')
  public async index(
    @CurrentUser() user: User,
    @Query() q: ListActivitiesQueryDto,
  ) {
    const page = await this.activitiesService.listForUserPaged(user.id, q.cursor)
    return {
      title: 'Activities',
      user,
      activities: page.items,
      nextCursor: page.nextCursor,
      isFirstPage: !q.cursor,
    }
  }

  /**
   * HTMX partial for the initial list container — used by the post-sync refresh
   * (syncCompleted event re-fetches this endpoint). Always renders page 1.
   */
  @Public()
  @UseGuards(WebAuthGuard)
  @Get('partials/list')
  @Render('partials/activities-list-island')
  public async partialList(@CurrentUser() user: User) {
    const page = await this.activitiesService.listForUserPaged(user.id, undefined)
    return { activities: page.items, nextCursor: page.nextCursor }
  }

  /**
   * HTMX partial for "Load more" — returns the next page of rows plus a
   * replacement "Load more" trigger row (or nothing if no more).
   */
  @Public()
  @UseGuards(WebAuthGuard)
  @Get('partials/rows')
  @Render('partials/activities-rows')
  public async partialRows(
    @CurrentUser() user: User,
    @Query() q: ListActivitiesQueryDto,
  ) {
    const page = await this.activitiesService.listForUserPaged(user.id, q.cursor)
    return { activities: page.items, nextCursor: page.nextCursor }
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
