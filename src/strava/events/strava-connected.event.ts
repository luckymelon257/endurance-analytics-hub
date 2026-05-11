/**
 * Emitted after a successful Strava OAuth link or signin. The backfill
 * module listens and enqueues a WINDOW_1Y job for this user.
 */
export class StravaConnectedEvent {
  public static readonly NAME = 'strava.connected'
  constructor(public readonly userId: string, public readonly isNewUser: boolean) {}
}
