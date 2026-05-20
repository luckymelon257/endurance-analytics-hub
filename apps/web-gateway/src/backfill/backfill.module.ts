import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StravaModule } from '../strava/strava.module'
import { BackfillController } from './backfill.controller'
import { BackfillCoordinator } from './backfill.coordinator'
import { BackfillRunner } from './backfill.runner'
import { BackfillScheduler } from './backfill.scheduler'
import { StravaConnectedListener } from './strava-connected.listener'

@Module({
  imports: [AuthModule, StravaModule],
  providers: [BackfillCoordinator, BackfillRunner, BackfillScheduler, StravaConnectedListener],
  controllers: [BackfillController],
  exports: [BackfillCoordinator],
})
export class BackfillModule {}
