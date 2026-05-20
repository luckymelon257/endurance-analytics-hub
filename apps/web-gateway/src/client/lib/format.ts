import type { ActivitySportType } from '../../activities/entities/activity-summary'

/** "Thu, May 8 · 7:42 AM" — locale-aware compact form. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "42:15" or "1:14:32" depending on length. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** "8.32 km" / "12.4 km" / "108 km" — precision adapts to magnitude. */
export function formatDistance(meters: number | null): string {
  if (meters === null || meters <= 0) return '—'
  const km = meters / 1000
  const decimals = km >= 100 ? 0 : km >= 10 ? 1 : 2
  return `${km.toFixed(decimals)} km`
}

/** "152 bpm" — null/0 → "—". */
export function formatHeartRate(bpm: number | null): string {
  if (bpm === null || bpm <= 0) return '—'
  return `${Math.round(bpm)} bpm`
}

/**
 * Pace for runs/swims, speed for rides/rows. Strava normalizes everything to
 * a per-km pace; we convert as appropriate for the sport.
 */
export function formatPaceOrSpeed(
  sport: ActivitySportType,
  secondsPerKm: number | null,
): string {
  if (secondsPerKm === null || secondsPerKm <= 0) return '—'
  if (sport === 'CYCLING' || sport === 'ROWING') {
    const kmh = 3600 / secondsPerKm
    return `${kmh.toFixed(1)} km/h`
  }
  const m = Math.floor(secondsPerKm / 60)
  const s = Math.floor(secondsPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')} /km`
}

/** Emoji glyph for each sport. Small, recognizable, no asset cost. */
export const SPORT_ICON: Record<ActivitySportType, string> = {
  RUNNING: '🏃',
  CYCLING: '🚴',
  SWIMMING: '🏊',
  ROWING: '🚣',
  OTHER: '⚡',
}

export const SPORT_LABEL: Record<ActivitySportType, string> = {
  RUNNING: 'Run',
  CYCLING: 'Bike',
  SWIMMING: 'Swim',
  ROWING: 'Row',
  OTHER: 'Other',
}
