import { Controller, Get, Post, Render, Res, UseGuards } from '@nestjs/common'
import { BackfillJob, User } from '@prisma/client'
import { Response } from 'express'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { WebAuthGuard } from '../auth/guards/web-auth.guard'
import { BackfillCoordinator } from './backfill.coordinator'

@Public()
@UseGuards(WebAuthGuard)
@Controller('backfill')
export class BackfillController {
  constructor(private readonly coordinator: BackfillCoordinator) {}

  @Post('full')
  public async startFull(@CurrentUser() user: User, @Res() res: Response): Promise<void> {
    await this.coordinator.enqueue(user.id, 'FULL')
    return this.renderStatus(user, res)
  }

  @Post('cancel')
  public async cancel(@CurrentUser() user: User, @Res() res: Response): Promise<void> {
    await this.coordinator.cancel(user.id)
    return this.renderStatus(user, res)
  }

  @Post('retry')
  public async retry(@CurrentUser() user: User, @Res() res: Response): Promise<void> {
    await this.coordinator.retryLast(user.id)
    return this.renderStatus(user, res)
  }

  @Get('status')
  @Render('partials/backfill-status')
  public async status(@CurrentUser() user: User): Promise<{ job: BackfillJob | null }> {
    return { job: await this.coordinator.getStatus(user.id) }
  }

  @Get('banner')
  @Render('partials/backfill-banner')
  public async banner(@CurrentUser() user: User): Promise<{ job: BackfillJob | null }> {
    return { job: await this.coordinator.getActiveJob(user.id) }
  }

  /** Shared renderer for the POST endpoints — returns the up-to-date status partial. */
  private async renderStatus(user: User, res: Response): Promise<void> {
    const job = await this.coordinator.getStatus(user.id)
    res.render('partials/backfill-status', { job })
  }
}
