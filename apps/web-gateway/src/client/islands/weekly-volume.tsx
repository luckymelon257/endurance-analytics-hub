import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ActivitySportType, WeeklyVolumeBin } from '../../activities/entities'

interface WeeklyVolumeProps {
  bins: WeeklyVolumeBin[]
}

interface ChartRow {
  weekLabel: string
  Run: number
  Bike: number
  Swim: number
  Row: number
  Other: number
}

const SPORT_BARS: { key: keyof Omit<ChartRow, 'weekLabel'>; sport: ActivitySportType; color: string }[] = [
  { key: 'Run',   sport: 'RUNNING',  color: '#fc4c02' },
  { key: 'Bike',  sport: 'CYCLING',  color: '#2563eb' },
  { key: 'Swim',  sport: 'SWIMMING', color: '#0891b2' },
  { key: 'Row',   sport: 'ROWING',   color: '#7c3aed' },
  { key: 'Other', sport: 'OTHER',    color: '#78716c' },
]

export default function WeeklyVolume({ bins }: WeeklyVolumeProps) {
  const rows = useMemo<ChartRow[]>(
    () =>
      bins.map((bin) => ({
        weekLabel: formatWeekLabel(bin.weekStart),
        Run:   bin.bySport.RUNNING  / 3600,
        Bike:  bin.bySport.CYCLING  / 3600,
        Swim:  bin.bySport.SWIMMING / 3600,
        Row:   bin.bySport.ROWING   / 3600,
        Other: bin.bySport.OTHER    / 3600,
      })),
    [bins],
  )

  const totalSeconds = bins.reduce((sum, b) => sum + b.totalSeconds, 0)
  if (totalSeconds === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        No training in the last 12 weeks. Sync from Strava to see your weekly trends.
      </p>
    )
  }

  // Identify which sports actually appear so we don't render empty legend entries.
  const activeBars = SPORT_BARS.filter(({ key }) => rows.some((r) => r[key] > 0))

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="weekLabel" stroke="#a8a29e" fontSize={11} tickLine={false} />
          <YAxis
            stroke="#a8a29e"
            fontSize={11}
            tickLine={false}
            tickFormatter={(v) => `${Number(v).toFixed(0)}h`}
          />
          <Tooltip
            cursor={{ fill: '#fafaf9' }}
            contentStyle={tooltipStyle}
            formatter={(value, name) => [`${Number(value).toFixed(1)}h`, name]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ paddingTop: 4, fontSize: 11, color: '#57534e' }}
          />
          {activeBars.map((b) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              stackId="sport"
              fill={b.color}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const tooltipStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #e7e5e4',
  fontSize: 12,
  padding: '8px 10px',
  background: '#ffffff',
}

/** "May 5" — week-start label. Year omitted for compactness; full date in tooltip. */
function formatWeekLabel(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T00:00:00')
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric' })
}
