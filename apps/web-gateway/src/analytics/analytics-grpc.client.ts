import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common'
import { ClientGrpc } from '@nestjs/microservices'
import { firstValueFrom } from 'rxjs'
import {
  ANALYTICS_SERVICE_NAME,
  type AnalyticsServiceClient,
  type InsightsRequest,
  type InsightsResponse,
} from './proto/analytics.types'

export const ANALYTICS_GRPC = Symbol('ANALYTICS_GRPC')

@Injectable()
export class AnalyticsGrpcClient implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsGrpcClient.name)
  private service!: AnalyticsServiceClient

  constructor(@Inject(ANALYTICS_GRPC) private readonly client: ClientGrpc) {}

  public onModuleInit(): void {
    this.service = this.client.getService<AnalyticsServiceClient>(ANALYTICS_SERVICE_NAME)
    this.logger.log('gRPC client bound to analytics.AnalyticsService')
  }

  public async getActivityInsights(request: InsightsRequest): Promise<InsightsResponse> {
    return firstValueFrom(this.service.getActivityInsights(request))
  }
}
