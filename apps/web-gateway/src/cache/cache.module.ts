import { Global, Module } from '@nestjs/common'
import { CacheService } from './cache.service'
import { RedisCacheService } from './redis-cache.service'

@Global()
@Module({
  providers: [{ provide: CacheService, useClass: RedisCacheService }],
  exports: [CacheService],
})
export class CacheModule {}
