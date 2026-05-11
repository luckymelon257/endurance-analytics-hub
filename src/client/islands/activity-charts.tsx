import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  ActivityDetail,
  ActivityStreams,
} from '../../activities/entities'

interface ActivityChartsProps {
  activity: ActivityDetail['activity']
  streams: ActivityStreams | null
  streamsError: string | null
}

const SYNC_ID = 'activity-charts'

export default function ActivityCharts({ activity, streams, streamsError }: ActivityChartsProps) {
  if (activity.isManual) {
    return (
      <ChartsUnavailable message="Detailed telemetry is unavailable because this activity was added manually." />
    )
  }

  if (!streams) {
    return <ChartsUnavailable message={streamsError ?? 'No detailed data for this activity.'} />
  }

  const isCyclingLike = activity.sportType === 'CYCLING' || activity.sportType === 'ROWING'

  // Build per-chart row sets once. Each chart only needs `time` (or `distance`)
  // plus its metric — but we share a single sample-indexed array for the time axis
  // so Recharts' syncId can align cursors across charts.
  const hrRows = useMemo(() => buildTimeSeries(streams, 'heartrate'), [streams])
  const paceOrSpeedRows = useMemo(
    () => buildTimeSeries(streams, 'velocity_smooth', isCyclingLike ? toKmh : toPaceSecondsPerKm),
    [streams, isCyclingLike],
  )
  const elevationRows = useMemo(() => buildElevationByDistance(streams), [streams])

  return (
    <div className="space-y-4">
      <ChartCard
        title="Heart rate"
        unit="bpm"
        emptyText="No heart rate data for this activity."
        rows={hrRows}
      >
        {(rows) => (
          <LineChart data={rows} syncId={SYNC_ID} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTime}
              stroke="#a8a29e"
              fontSize={12}
            />
            <YAxis stroke="#a8a29e" fontSize={12} domain={['auto', 'auto']} />
            <Tooltip
              labelFormatter={(label) => formatTime(Number(label))}
              formatter={(v) => [`${Math.round(Number(v))} bpm`, 'Heart rate']}
              contentStyle={tooltipStyle}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#dc2626"
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ChartCard>

      <ChartCard
        title={isCyclingLike ? 'Speed' : 'Pace'}
        unit={isCyclingLike ? 'km/h' : 'min/km'}
        emptyText="No speed data for this activity."
        rows={paceOrSpeedRows}
      >
        {(rows) => (
          <LineChart data={rows} syncId={SYNC_ID} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTime}
              stroke="#a8a29e"
              fontSize={12}
            />
            <YAxis
              stroke="#a8a29e"
              fontSize={12}
              domain={['auto', 'auto']}
              reversed={!isCyclingLike}
              tickFormatter={isCyclingLike ? (v) => v.toFixed(0) : formatPace}
            />
            <Tooltip
              labelFormatter={(label) => formatTime(Number(label))}
              formatter={(v) =>
                isCyclingLike
                  ? [`${Number(v).toFixed(1)} km/h`, 'Speed']
                  : [`${formatPace(Number(v))} /km`, 'Pace']
              }
              contentStyle={tooltipStyle}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#fc4c02"
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ChartCard>

      <ChartCard
        title="Elevation"
        unit="m"
        emptyText="No elevation data for this activity."
        rows={elevationRows}
      >
        {(rows) => (
          <AreaChart data={rows} syncId={SYNC_ID} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="elevationFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="distanceKm"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v) => `${v.toFixed(0)} km`}
              stroke="#a8a29e"
              fontSize={12}
            />
            <YAxis stroke="#a8a29e" fontSize={12} domain={['auto', 'auto']} />
            <Tooltip
              labelFormatter={(label) => `${Number(label).toFixed(2)} km`}
              formatter={(v) => [`${Math.round(Number(v))} m`, 'Elevation']}
              contentStyle={tooltipStyle}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#16a34a"
              strokeWidth={1.75}
              fill="url(#elevationFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        )}
      </ChartCard>
    </div>
  )
}

// ───────────────────────────────────────────────────────────── components ──

interface ChartCardProps<R> {
  title: string
  unit: string
  emptyText: string
  rows: R[] | null
  children: (rows: R[]) => React.ReactElement
}

function ChartCard<R>({ title, unit, emptyText, rows, children }: ChartCardProps<R>) {
  return (
    <article className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
      <header className="flex items-baseline justify-between border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="text-xs text-ink-muted">{unit}</span>
      </header>
      {rows && rows.length > 0 ? (
        <div className="h-56 px-3 py-3">
          <ResponsiveContainer width="100%" height="100%">
            {children(rows)}
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-ink-muted">{emptyText}</p>
      )}
    </article>
  )
}

function ChartsUnavailable({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-gradient-to-br from-stone-50 to-white p-8 text-center shadow-sm">
      <p className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-sm ring-1 ring-border" aria-hidden="true">
        📈
      </p>
      <p className="mt-4 text-sm font-medium text-ink">Charts unavailable</p>
      <p className="mx-auto mt-1 max-w-xl text-sm text-ink-muted">{message}</p>
    </div>
  )
}

// ───────────────────────────────────────────────────────────── helpers ──

interface TimeSeriesRow {
  time: number
  value: number
}

interface ElevationRow {
  distanceKm: number
  value: number
}

function buildTimeSeries(
  streams: ActivityStreams,
  key: 'heartrate' | 'velocity_smooth',
  transform?: (v: number) => number,
): TimeSeriesRow[] | null {
  const data = streams[key]
  if (!data || data.length === 0) return null
  const rows: TimeSeriesRow[] = []
  for (let i = 0; i < streams.time.length && i < data.length; i++) {
    const value = transform ? transform(data[i]) : data[i]
    if (!Number.isFinite(value)) continue
    rows.push({ time: streams.time[i], value })
  }
  return rows.length > 0 ? rows : null
}

function buildElevationByDistance(streams: ActivityStreams): ElevationRow[] | null {
  if (!streams.altitude || !streams.distance || streams.altitude.length === 0) return null
  const rows: ElevationRow[] = []
  for (let i = 0; i < streams.distance.length && i < streams.altitude.length; i++) {
    rows.push({
      distanceKm: streams.distance[i] / 1000,
      value: streams.altitude[i],
    })
  }
  return rows.length > 0 ? rows : null
}

function toPaceSecondsPerKm(metersPerSecond: number): number {
  if (metersPerSecond <= 0.1) return NaN // walking-pace floor; chart skips it
  return 1000 / metersPerSecond
}

function toKmh(metersPerSecond: number): number {
  return metersPerSecond * 3.6
}

/** "12:34" or "1:23:45". */
function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** Pace formatter — input is seconds-per-km. */
function formatPace(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '—'
  const m = Math.floor(secondsPerKm / 60)
  const s = Math.floor(secondsPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const tooltipStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #e7e5e4',
  fontSize: 12,
  padding: '8px 10px',
  background: '#ffffff',
}
