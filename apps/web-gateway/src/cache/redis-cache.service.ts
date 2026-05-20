import { Injectable, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_URL } from '../config/env'
import { CacheService } from './cache.service'

@Injectable()
export class RedisCacheService extends CacheService implements OnModuleDestroy {
  private readonly client: Redis

  constructor() {
    super()
    this.client = new Redis(REDIS_URL)
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds)
    } else {
      await this.client.set(key, value)
    }
  }

  public async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  public async del(key: string): Promise<void> {
    await this.client.del(key)
  }

  /**
   * MULTI/EXEC: single round-trip, atomic. EXPIRE … NX sets TTL only on first hit
   * (Redis 7+) — fixed-window counter semantics with no TTL leak.
   */
  public async increment(key: string, ttlSeconds: number): Promise<number> {
    const results = await this.client.multi().incr(key).expire(key, ttlSeconds, 'NX').exec()
    return results![0][1] as number
  }

  public onModuleDestroy(): void {
    this.client.disconnect()
  }
}
