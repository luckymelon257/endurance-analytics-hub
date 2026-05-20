/**
 * Shape returned by Strava `GET /api/v3/activities/:id/streams?key_by_type=true`.
 * Each requested stream type appears as a key with its `data` array. Strava omits
 * stream types the device didn't record, so callers must treat all keys as optional.
 */
export interface StravaStreamSeries {
  data: number[]
  series_type: string
  original_size: number
  resolution: 'low' | 'medium' | 'high'
}

export interface StravaStreamsResponse {
  time?: StravaStreamSeries
  distance?: StravaStreamSeries
  heartrate?: StravaStreamSeries
  velocity_smooth?: StravaStreamSeries
  altitude?: StravaStreamSeries
}
