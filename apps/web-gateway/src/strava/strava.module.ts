import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StravaApiClient } from './strava-api.client'
import { StravaBudgetService } from './strava-budget.service'
import { StravaController } from './strava.controller'
import { StravaService } from './strava.service'

@Module({
  imports: [AuthModule],
  controllers: [StravaController],
  providers: [StravaService, StravaApiClient, StravaBudgetService],
  exports: [StravaService, StravaApiClient, StravaBudgetService],
})
export class StravaModule {}
