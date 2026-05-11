import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { StravaConnectedEvent } from '../strava/events/strava-connected.event'
import { BackfillCoordinator } from './backfill.coordinator'

@Injectable()
export class StravaConnectedListener {
  private readonly logger = new Logger(StravaConnectedListener.name)

  constructor(private readonly coordinator: BackfillCoordinator) {}

  @OnEvent(StravaConnectedEvent.NAME)
  public async onConnected(event: StravaConnectedEvent): Promise<void> {
    try {
      const job = await this.coordinator.enqueue(event.userId, 'WINDOW_1Y')
      this.logger.log(
        `Enqueued WINDOW_1Y job ${job.id} for user ${event.userId} (isNew=${event.isNewUser})`,
      )
    } catch (err) {
      this.logger.error(
        `Failed to enqueue backfill for ${event.userId}: ${(err as Error).message}`,
      )
    }
  }
}
