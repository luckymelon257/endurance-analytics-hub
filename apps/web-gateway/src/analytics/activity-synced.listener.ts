import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ActivitySyncedEvent } from './events/activity-synced.event'
import { AnalyticsKafkaProducer } from './analytics-kafka.producer'

@Injectable()
export class ActivitySyncedListener {
  private readonly logger = new Logger(ActivitySyncedListener.name)

  constructor(private readonly producer: AnalyticsKafkaProducer) {}

  @OnEvent(ActivitySyncedEvent.NAME)
  public onActivitySynced(event: ActivitySyncedEvent): void {
    this.producer.emitActivitySynced({
      activityId: event.activityId,
      userId: event.userId,
    })
    this.logger.debug(`emitted activity.synced for ${event.activityId}`)
  }
}
