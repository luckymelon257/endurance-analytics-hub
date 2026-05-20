import { Injectable, Logger } from '@nestjs/common'
import { BackfillJob, BackfillMode, BackfillStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const ACTIVE: BackfillStatus[] = ['QUEUED', 'RUNNING', 'RATE_LIMITED']

@Injectable()
export class BackfillCoordinator {
  private readonly logger = new Logger(BackfillCoordinator.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent: if an active job (QUEUED|RUNNING|RATE_LIMITED) already exists
   * for this user, we return it untouched. Otherwise create a fresh QUEUED job.
   * Mode matters only for new jobs — an existing active job (of any mode)
   * blocks a new enqueue.
   */
  public async enqueue(userId: string, mode: BackfillMode): Promise<BackfillJob> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.backfillJob.findFirst({
        where: { userId, status: { in: ACTIVE } },
      })
      if (existing) {
        this.logger.log(
          `enqueue(${userId}, ${mode}): active job ${existing.id} (${existing.status}) already exists; no-op`,
        )
        return existing
      }
      return tx.backfillJob.create({
        data: { userId, mode, status: 'QUEUED' },
      })
    })
  }

  /** Most recent job for a user (any status). Null if they have no history. */
  public async getStatus(userId: string): Promise<BackfillJob | null> {
    return this.prisma.backfillJob.findFirst({
      where: { userId },
      orderBy: { enqueuedAt: 'desc' },
    })
  }

  /** Active (non-terminal) job for a user, if any. */
  public async getActiveJob(userId: string): Promise<BackfillJob | null> {
    return this.prisma.backfillJob.findFirst({
      where: { userId, status: { in: ACTIVE } },
      orderBy: { enqueuedAt: 'desc' },
    })
  }

  /**
   * Mark the active job CANCELED. The runner refetches status between pages
   * and exits cleanly when it sees this. No-op if no active job.
   */
  public async cancel(userId: string): Promise<BackfillJob | null> {
    const active = await this.getActiveJob(userId)
    if (!active) return null
    return this.prisma.backfillJob.update({
      where: { id: active.id },
      data: { status: 'CANCELED', completedAt: new Date() },
    })
  }

  /**
   * Re-enqueue a copy of the user's last FAILED or CANCELED job. Same mode,
   * fresh state (no cursor inherited — restarts from page 1).
   */
  public async retryLast(userId: string): Promise<BackfillJob | null> {
    const last = await this.prisma.backfillJob.findFirst({
      where: { userId, status: { in: ['FAILED', 'CANCELED'] } },
      orderBy: { enqueuedAt: 'desc' },
    })
    if (!last) return null
    return this.enqueue(userId, last.mode)
  }
}
