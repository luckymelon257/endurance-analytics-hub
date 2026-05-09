export abstract class CacheService {
  public abstract set(key: string, value: string, ttlSeconds?: number): Promise<void>
  public abstract get(key: string): Promise<string | null>
  public abstract del(key: string): Promise<void>
  public abstract increment(key: string, ttlSeconds: number): Promise<number>
}
