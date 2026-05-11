import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StravaModule } from '../strava/strava.module'
import { SettingsController } from './settings.controller'

@Module({
  imports: [AuthModule, StravaModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
