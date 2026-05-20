import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ClientKafka } from '@nestjs/microservices'
import { ACTIVITY_SYNCED_TOPIC } from './proto/analytics.types'

export const ANALYTICS_KAFKA = Symbol('ANALYTICS_KAFKA')

export interface ActivitySyncedPayload {
  activityId: string
  userId: string
}

@Injectable()
export class AnalyticsKafkaProducer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsKafkaProducer.name)

  constructor(@Inject(ANALYTICS_KAFKA) private readonly client: ClientKafka) {}

  public async onModuleInit(): Promise<void> {
    await this.client.connect()
    this.logger.log('Kafka producer connected')
  }

  public async onModuleDestroy(): Promise<void> {
    await this.client.close()
  }

  public emitActivitySynced(payload: ActivitySyncedPayload): void {
    this.client.emit(ACTIVITY_SYNCED_TOPIC, payload)
  }
}
