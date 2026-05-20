import Redis from 'ioredis'

/** Token-owned distributed lock. heartbeat() and release() are atomic via Lua scripts. */
export interface LockHandle {
  /** Re-extend TTL. Returns true if we still own the lock. */
  heartbeat(): Promise<boolean>
  /** Release the lock if we still own it. */
  release(): Promise<void>
}

export async function acquireLock(
  redis: Redis,
  key: string,
  ttlSec: number,
): Promise<LockHandle | null> {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const ok = await redis.set(key, token, 'EX', ttlSec, 'NX')
  if (ok !== 'OK') return null

  return {
    async heartbeat(): Promise<boolean> {
      const script = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('expire', KEYS[1], ARGV[2])
        else
          return 0
        end
      `
      const result = (await redis.eval(script, 1, key, token, String(ttlSec))) as number
      return result === 1
    },
    async release(): Promise<void> {
      const script = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        else
          return 0
        end
      `
      await redis.eval(script, 1, key, token)
    },
  }
}
