import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { BackfillRunner } from './backfill.runner'

@Injectable()
export class BackfillScheduler {
  private readonly logger = new Logger(BackfillScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: BackfillRunner,
  ) {}

  /**
   * Every 30 seconds:
   *  1. Resurrect any RATE_LIMITED jobs whose retryAfter has passed.
   *  2. Ask the runner to pick up the next QUEUED job (lock-permitting).
   *
   * Nest's @Cron does not overlap by default; the Redis lock in the runner
   * provides a second line of defense for multi-instance scaling.
   */
  // Cron expression is a literal at compile time; change here if you need a different tick.
  @Cron(CronExpression.EVERY_30_SECONDS)
  public async tick(): Promise<void> {
    try {
      const resurrected = await this.prisma.backfillJob.updateMany({
        where: { status: 'RATE_LIMITED', retryAfter: { lte: new Date() } },
        data: { status: 'QUEUED', retryAfter: null },
      })
      if (resurrected.count > 0) {
        this.logger.log(`Resurrected ${resurrected.count} rate-limited job(s)`)
      }

      await this.runner.runNext()
    } catch (err) {
      this.logger.error(`Scheduler tick failed: ${(err as Error).message}`, (err as Error).stack)
    }
  }
}
