import type { Observable } from 'rxjs'

export interface InsightsRequest {
  activityId: string
  userId: string
  timeStream?: number[]
  velocityStream?: number[]
  hrStream?: number[]
  altitudeStream?: number[]
}

export interface PacePoint {
  timeSeconds: number
  realPace: number
  predictedPace: number
}

// Mirrors analytics.ActivityInsight. `type` is an open string (set of values
// kept in sync with the Go InsightType* constants); metadata is intentionally
// a stringly-typed map so adding a new analyzer never breaks the wire format.
export interface ActivityInsight {
  type: string
  summary: string
  severityScore: number
  metadata: Record<string, string>
  pointTimeSeconds?: number
}

export interface InsightsResponse {
  activityId: string
  combinedAiNarrative: string
  discreteInsights: ActivityInsight[]
  pacingChartData: PacePoint[]
}

export interface AnalyticsServiceClient {
  getActivityInsights(request: InsightsRequest): Observable<InsightsResponse>
}

export const ANALYTICS_PACKAGE = 'analytics'
export const ANALYTICS_SERVICE_NAME = 'AnalyticsService'
export const ACTIVITY_SYNCED_TOPIC = 'activity.synced'

// Known insight-type discriminators. Mirror of the Go InsightType* constants
// in apps/analytics-engine/internal/analyzer/analyzer.go.
export const InsightType = {
  PacingPenalty: 'PACING_PENALTY',
  AerobicDecoupling: 'AEROBIC_DECOUPLING',
  Terrain: 'TERRAIN',
} as const

export type InsightTypeKey = (typeof InsightType)[keyof typeof InsightType]
