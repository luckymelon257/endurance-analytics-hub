import { User } from '@prisma/client'

/** Result of resolving an OAuth callback to a local User session. */
export interface StravaCallbackResult {
  user: User
  /** True iff this call created a brand-new placeholder-email account. */
  isNew: boolean
}
