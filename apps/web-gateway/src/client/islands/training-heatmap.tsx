import { useMemo, useState } from 'react'
import type { HeatmapDay } from '../../activities/entities'

interface TrainingHeatmapProps {
  days: HeatmapDay[]
}

interface HoverState {
  day: HeatmapDay
  x: number
  y: number
}

const COLOR_BUCKETS = [
  { max: 0, classes: 'bg-stone-100', label: 'Rest' },
  { max: 30 * 60, classes: 'bg-brand/30', label: '< 30 min' },
  { max: 60 * 60, classes: 'bg-brand/55', label: '30–60 min' },
  { max: 120 * 60, classes: 'bg-brand/80', label: '1–2 h' },
  { max: Infinity, classes: 'bg-brand', label: '2 h+' },
] as const

export default function TrainingHeatmap({ days }: TrainingHeatmapProps) {
  const [hover, setHover] = useState<HoverState | null>(null)

  // Group into weeks (columns), each containing 7 days (rows: Mon → Sun).
  // Server emits days oldest → newest, contiguous, so we just chunk by 7.
  // The first chunk may not be a full week; pad with nulls so the grid aligns
  // to the day-of-week of the first sample.
  const { weeks, monthLabels, totalSessions, activeDays } = useMemo(
    () => buildLayout(days),
    [days],
  )

  return (
    <div className="relative">
      <div className="mb-3 grid grid-cols-3 gap-3 text-xs sm:grid-cols-4">
        <Stat label="Active days" value={`${activeDays}/${days.length}`} />
        <Stat label="Sessions"    value={totalSessions.toString()} />
        <Stat
          label="Streak"
          value={`${currentStreak(days)} day${currentStreak(days) === 1 ? '' : 's'}`}
        />
        <Stat
          label="Best week"
          value={fmtDuration(bestWeekSeconds(days))}
          className="hidden sm:block"
        />
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="inline-flex min-w-full flex-col gap-1">
          <div className="flex gap-[3px] pl-7 text-[10px] text-ink-subtle">
            {monthLabels.map((m, i) => (
              <span key={i} style={{ width: '14px' }}>
                {m}
              </span>
            ))}
          </div>

          <div className="flex gap-1">
            <div className="grid grid-rows-7 gap-[3px] pr-1 text-[10px] text-ink-subtle">
              <span className="leading-[14px]">Mon</span>
              <span className="leading-[14px]">&nbsp;</span>
              <span className="leading-[14px]">Wed</span>
              <span className="leading-[14px]">&nbsp;</span>
              <span className="leading-[14px]">Fri</span>
              <span className="leading-[14px]">&nbsp;</span>
              <span className="leading-[14px]">Sun</span>
            </div>

            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-rows-7 gap-[3px]">
                  {week.map((day, di) => (
                    <Cell
                      key={di}
                      day={day}
                      onHover={setHover}
                      onLeave={() => setHover(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Legend />

      {hover ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: hover.x, top: hover.y - 36 }}
        >
          <div className="font-semibold">{formatDateLabel(hover.day.date)}</div>
          <div className="text-white/80">
            {hover.day.sessions === 0
              ? 'Rest day'
              : `${hover.day.sessions} session${hover.day.sessions === 1 ? '' : 's'} · ${fmtDuration(hover.day.volumeSeconds)}`}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ───────────────────────────────────────────────────────────── components ──

function Cell({
  day,
  onHover,
  onLeave,
}: {
  day: HeatmapDay | null
  onHover: (s: HoverState) => void
  onLeave: () => void
}) {
  if (!day) {
    return <span className="block h-[14px] w-[14px]" aria-hidden="true" />
  }

  const bucket = COLOR_BUCKETS.find((b) => day.volumeSeconds <= b.max)!
  return (
    <button
      type="button"
      aria-label={`${formatDateLabel(day.date)}: ${day.sessions === 0 ? 'rest day' : `${day.sessions} session${day.sessions === 1 ? '' : 's'}, ${fmtDuration(day.volumeSeconds)}`}`}
      onMouseEnter={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const parent = (e.currentTarget.offsetParent as HTMLElement | null)?.getBoundingClientRect()
        onHover({
          day,
          x: rect.left - (parent?.left ?? 0) + 8,
          y: rect.top - (parent?.top ?? 0),
        })
      }}
      onMouseLeave={onLeave}
      className={`block h-[14px] w-[14px] rounded-[3px] transition ${bucket.classes} hover:ring-2 hover:ring-brand hover:ring-offset-1`}
    />
  )
}

function Stat({
  label,
  value,
  className = '',
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={`rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-inset ring-border ${className}`}>
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">{value}</p>
    </div>
  )
}

function Legend() {
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-ink-subtle">
      <span>Less</span>
      {COLOR_BUCKETS.map((b, i) => (
        <span
          key={i}
          className={`block h-[12px] w-[12px] rounded-[3px] ${b.classes}`}
          aria-hidden="true"
        />
      ))}
      <span>More</span>
    </div>
  )
}

// ───────────────────────────────────────────────────────────── helpers ──

interface Layout {
  weeks: (HeatmapDay | null)[][]
  monthLabels: string[]
  totalSessions: number
  activeDays: number
}

function buildLayout(days: HeatmapDay[]): Layout {
  // Pad the start so column 0 begins on Monday. JS getDay(): 0=Sun..6=Sat.
  // We want Mon=row 0, Sun=row 6.
  if (days.length === 0) {
    return { weeks: [], monthLabels: [], totalSessions: 0, activeDays: 0 }
  }
  const first = new Date(days[0].date + 'T00:00:00')
  const firstDow = (first.getDay() + 6) % 7 // Mon=0..Sun=6
  const padded: (HeatmapDay | null)[] = [
    ...Array.from({ length: firstDow }, () => null as HeatmapDay | null),
    ...days,
  ]
  const weeks: (HeatmapDay | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7))
  }

  // Month label per week column: show month name when the column starts a new month.
  const monthLabels: string[] = []
  let lastMonth = -1
  for (const week of weeks) {
    const firstReal = week.find((d): d is HeatmapDay => d !== null)
    if (!firstReal) {
      monthLabels.push('')
      continue
    }
    const m = new Date(firstReal.date + 'T00:00:00').getMonth()
    if (m !== lastMonth) {
      monthLabels.push(
        new Date(firstReal.date + 'T00:00:00').toLocaleString(undefined, { month: 'short' }),
      )
      lastMonth = m
    } else {
      monthLabels.push('')
    }
  }

  let totalSessions = 0
  let activeDays = 0
  for (const d of days) {
    totalSessions += d.sessions
    if (d.sessions > 0) activeDays++
  }
  return { weeks, monthLabels, totalSessions, activeDays }
}

function currentStreak(days: HeatmapDay[]): number {
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].sessions > 0) streak++
    else break
  }
  return streak
}

function bestWeekSeconds(days: HeatmapDay[]): number {
  // Server already provided ~16 weeks; iterate in chunks of 7 starting from
  // the right (most recent week is the last 7 days here).
  let best = 0
  for (let i = 0; i + 7 <= days.length; i += 7) {
    const total = days.slice(i, i + 7).reduce((sum, d) => sum + d.volumeSeconds, 0)
    if (total > best) best = total
  }
  return best
}

function fmtDuration(seconds: number): string {
  if (seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

function formatDateLabel(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T00:00:00')
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
