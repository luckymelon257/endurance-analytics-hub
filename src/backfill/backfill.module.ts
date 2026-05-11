import { Module } from '@nestjs/common'
import { StravaModule } from '../strava/strava.module'
import { BackfillCoordinator } from './backfill.coordinator'
import { BackfillRunner } from './backfill.runner'
import { BackfillScheduler } from './backfill.scheduler'
import { StravaConnectedListener } from './strava-connected.listener'

@Module({
  imports: [StravaModule],
  providers: [BackfillCoordinator, BackfillRunner, BackfillScheduler, StravaConnectedListener],
  controllers: [],
  exports: [BackfillCoordinator],
})
export class BackfillModule {}
