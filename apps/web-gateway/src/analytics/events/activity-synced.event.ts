/**
 * Emitted after a new (not updated) activity row is persisted. The analytics
 * module listens and forwards it to the `activity.synced` Kafka topic so the
 * Go analytics-engine can consume it.
 */
export class ActivitySyncedEvent {
  public static readonly NAME = 'activity.synced'
  constructor(public readonly userId: string, public readonly activityId: string) {}
}
