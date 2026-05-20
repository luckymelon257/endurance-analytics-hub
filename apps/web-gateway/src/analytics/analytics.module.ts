import { Global, Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import {
  ANALYTICS_GRPC_URL,
  KAFKA_BROKERS,
  PROTO_PATH,
} from '../config/env'
import { ANALYTICS_PACKAGE } from './proto/analytics.types'
import { ActivitySyncedListener } from './activity-synced.listener'
import {
  ANALYTICS_KAFKA,
  AnalyticsKafkaProducer,
} from './analytics-kafka.producer'
import {
  ANALYTICS_GRPC,
  AnalyticsGrpcClient,
} from './analytics-grpc.client'

@Global()
@Module({
  imports: [
    ClientsModule.register([
      {
        name: ANALYTICS_KAFKA,
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'web-gateway',
            brokers: KAFKA_BROKERS,
          },
          producerOnly: true,
        },
      },
      {
        name: ANALYTICS_GRPC,
        transport: Transport.GRPC,
        options: {
          package: ANALYTICS_PACKAGE,
          protoPath: PROTO_PATH,
          url: ANALYTICS_GRPC_URL,
        },
      },
    ]),
  ],
  providers: [AnalyticsKafkaProducer, AnalyticsGrpcClient, ActivitySyncedListener],
  exports: [AnalyticsKafkaProducer, AnalyticsGrpcClient],
})
export class AnalyticsModule {}
