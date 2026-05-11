import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
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
import { ManualActivityDto } from './dto/manual-activity.dto'

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
  @Get('new')
  @Render('activities/form')
  public newForm(@CurrentUser() user: User) {
    return {
      title: 'Add manual activity',
      user,
      mode: 'create',
      formAction: '/activities/new',
      values: {
        title: '',
        sportType: 'RUNNING',
        startedAt: '',
        durationMinutes: '',
        distanceKm: '',
      },
      error: null,
    }
  }

  @Public()
  @UseGuards(WebAuthGuard)
  @Post('new')
  public async createManual(
    @CurrentUser() user: User,
    @Body() dto: ManualActivityDto,
    @Res() res: Response,
  ) {
    try {
      await this.activitiesService.createManualActivity(user.id, dto)
      return res.redirect('/dashboard')
    } catch (err) {
      if (!(err instanceof BadRequestException)) {
        throw err
      }

      return res.status(400).render('activities/form', {
        title: 'Add manual activity',
        user,
        mode: 'create',
        formAction: '/activities/new',
        values: dto,
        error: err.message,
      })
    }
  }

  @Public()
  @UseGuards(WebAuthGuard)
  @Get(':id/edit')
  public async editForm(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    try {
      const values = await this.activitiesService.getManualActivityForEdit(user.id, id)
      return res.render('activities/form', {
        title: 'Edit manual activity',
        user,
        mode: 'edit',
        formAction: `/activities/${id}/edit`,
        values,
        error: null,
      })
    } catch (err) {
      if (err instanceof NotFoundException) {
        return res.redirect('/activities')
      }
      throw err
    }
  }

  @Public()
  @UseGuards(WebAuthGuard)
  @Post(':id/edit')
  public async updateManual(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ManualActivityDto,
    @Res() res: Response,
  ) {
    try {
      await this.activitiesService.updateManualActivity(user.id, id, dto)
      return res.redirect('/dashboard')
    } catch (err) {
      if (err instanceof NotFoundException) {
        return res.redirect('/activities')
      }

      if (!(err instanceof BadRequestException)) {
        throw err
      }

      return res.status(400).render('activities/form', {
        title: 'Edit manual activity',
        user,
        mode: 'edit',
        formAction: `/activities/${id}/edit`,
        values: dto,
        error: err.message,
      })
    }
  }

  @Public()
  @UseGuards(WebAuthGuard)
  @Post(':id/delete')
  public async deleteManual(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    try {
      await this.activitiesService.deleteManualActivity(user.id, id)
      return res.redirect('/dashboard')
    } catch (err) {
      if (err instanceof NotFoundException) {
        return res.redirect('/activities')
      }
      throw err
    }
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
