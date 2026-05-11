import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StravaModule } from '../strava/strava.module'
import { ActivitiesController } from './activities.controller'
import { ActivitiesService } from './activities.service'
import { StreamsService } from './streams.service'

@Module({
  imports: [AuthModule, StravaModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, StreamsService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
