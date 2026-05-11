import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ActivitiesModule } from './activities/activities.module'
import { AuthModule } from './auth/auth.module'
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard'
import { BackfillModule } from './backfill/backfill.module'
import { CacheModule } from './cache/cache.module'
import { PrismaModule } from './prisma/prisma.module'
import { SettingsModule } from './settings/settings.module'
import { StravaModule } from './strava/strava.module'
import { ViteAssetsModule } from './vite-assets/vite-assets.module'

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    CacheModule,
    AuthModule,
    ActivitiesModule,
    StravaModule,
    BackfillModule,
    SettingsModule,
    ViteAssetsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // JwtAuthGuard applied globally; mark public routes with @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
