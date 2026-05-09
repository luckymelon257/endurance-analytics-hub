/** Strava OAuth & API constants. */

/** Random bytes used to mint the OAuth `state` parameter (CSRF token). */
export const STRAVA_STATE_BYTES = 32

/** Required Strava OAuth scopes — verified on every callback. */
export const STRAVA_REQUIRED_SCOPES = ['activity:read_all', 'profile:read_all']

/** Refresh the access token if it would expire within this many seconds. */
export const STRAVA_TOKEN_REFRESH_LEEWAY_SECONDS = 60
