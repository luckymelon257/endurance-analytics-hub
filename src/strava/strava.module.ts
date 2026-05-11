import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StravaApiClient } from './strava-api.client'
import { StravaController } from './strava.controller'
import { StravaService } from './strava.service'

@Module({
  imports: [AuthModule],
  controllers: [StravaController],
  providers: [StravaService, StravaApiClient],
  exports: [StravaService, StravaApiClient],
})
export class StravaModule {}
