import { Prisma } from '@prisma/client'

/**
 * Fields produced by mapping a Strava summary activity onto our `Activity`
 * model. `userId` and `externalId` are added by the caller based on context,
 * so they're intentionally excluded here.
 */
export type ActivityImportPayload = Pick<
  Prisma.ActivityCreateManyInput,
  | 'title'
  | 'sportType'
  | 'status'
  | 'startedAt'
  | 'durationSeconds'
  | 'distanceMeters'
  | 'elevationGainMeters'
  | 'avgHeartRate'
  | 'maxHeartRate'
  | 'avgPaceSecondsPerKm'
  | 'avgPowerWatts'
  | 'calories'
>
