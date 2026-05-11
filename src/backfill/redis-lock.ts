import Redis from 'ioredis'

/**
 * Best-effort distributed lock. SET key value NX EX ttl. The owner is
 * identified by a unique token so we never release a lock we don't hold.
 *
 * heartbeat() re-extends the TTL while the runner is mid-loop.
 * release() only deletes the key if we still own it (accepting a tiny
 * GET+DEL race; consequence at worst is a dropped DEL which TTL handles
 * within ttlSec).
 */
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
      const current = await redis.get(key)
      if (current !== token) return false
      await redis.expire(key, ttlSec)
      return true
    },
    async release(): Promise<void> {
      const current = await redis.get(key)
      if (current === token) {
        await redis.del(key)
      }
    },
  }
}
