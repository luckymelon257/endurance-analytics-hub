import { useMemo, useState } from 'react'
import type {
  ActivitySportType,
  ActivitySummary,
} from '../../activities/entities/activity-summary'
import {
  SPORT_ICON,
  SPORT_LABEL,
  formatDate,
  formatDistance,
  formatDuration,
  formatHeartRate,
  formatPaceOrSpeed,
} from '../lib/format'

type SortKey = 'startedAt' | 'distanceMeters' | 'durationSeconds'
type SortDir = 'asc' | 'desc'
type SportFilter = 'ALL' | ActivitySportType

interface ActivitiesListProps {
  activities: ActivitySummary[]
}

const SPORT_FILTERS: SportFilter[] = ['ALL', 'RUNNING', 'CYCLING', 'SWIMMING', 'ROWING', 'OTHER']

export default function ActivitiesList({ activities }: ActivitiesListProps) {
  const [sportFilter, setSportFilter] = useState<SportFilter>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('startedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const filtered = useMemo(
    () =>
      sportFilter === 'ALL'
        ? activities
        : activities.filter((a) => a.sportType === sportFilter),
    [activities, sportFilter],
  )

  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'startedAt' ? 'desc' : 'desc')
    }
  }

  if (activities.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="space-y-4">
      <FilterBar value={sportFilter} onChange={setSportFilter} activities={activities} />

      {sorted.length === 0 ? (
        <NoMatchState onReset={() => setSportFilter('ALL')} />
      ) : (
        <>
          <DesktopTable
            rows={sorted}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
          />
          <MobileCards rows={sorted} />
        </>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────── components ──

function FilterBar({
  value,
  onChange,
  activities,
}: {
  value: SportFilter
  onChange: (v: SportFilter) => void
  activities: ActivitySummary[]
}) {
  const counts = useMemo(() => countBySport(activities), [activities])

  return (
    <div role="group" aria-label="Filter by sport" className="flex flex-wrap gap-2">
      {SPORT_FILTERS.map((sf) => {
        const count = sf === 'ALL' ? activities.length : counts[sf]
        if (sf !== 'ALL' && count === 0) return null
        const active = value === sf
        return (
          <button
            key={sf}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(sf)}
            className={
              'rounded-full px-3 py-1.5 text-sm font-medium transition ' +
              (active
                ? 'bg-brand text-white'
                : 'bg-card text-ink-muted ring-1 ring-inset ring-border hover:bg-stone-50 hover:text-ink')
            }
          >
            {sf === 'ALL' ? 'All' : `${SPORT_ICON[sf]} ${SPORT_LABEL[sf]}`}
            <span className="ml-1.5 text-xs opacity-70">({count})</span>
          </button>
        )
      })}
    </div>
  )
}

function DesktopTable({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: ActivitySummary[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}) {
  return (
    <div className="hidden overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border md:block">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-stone-50/60 text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <SortableHeader
              label="Date"
              colKey="startedAt"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <th scope="col" className="px-4 py-3 text-left font-medium">
              Activity
            </th>
            <SortableHeader
              label="Distance"
              colKey="distanceMeters"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              align="right"
            />
            <SortableHeader
              label="Duration"
              colKey="durationSeconds"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              align="right"
            />
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Pace / Speed
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Avg HR
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((a) => (
            <tr
              key={a.id}
              onClick={(e) => {
                // Don't hijack clicks on the inner anchor itself — let the browser handle it.
                if ((e.target as HTMLElement).closest('a')) return
                window.location.href = `/activities/${a.id}`
              }}
              className="cursor-pointer hover:bg-stone-50/60"
            >
              <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                {formatDate(a.startedAt)}
              </td>
              <td className="px-4 py-3">
                <a
                  href={`/activities/${a.id}`}
                  className="flex items-center gap-2 font-medium text-ink hover:text-brand"
                >
                  <span aria-hidden="true">{SPORT_ICON[a.sportType]}</span>
                  <span>{a.title}</span>
                </a>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink">
                {formatDistance(a.distanceMeters)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink">
                {formatDuration(a.durationSeconds)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink-muted">
                {formatPaceOrSpeed(a.sportType, a.avgPaceSecondsPerKm)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink-muted">
                {formatHeartRate(a.avgHeartRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SortableHeader({
  label,
  colKey,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
}: {
  label: string
  colKey: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === colKey
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-4 py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(colKey)}
        className={
          'inline-flex items-center gap-1 transition hover:text-ink ' +
          (active ? 'text-ink' : '')
        }
      >
        {label}
        <span aria-hidden="true" className="text-[0.7em]">
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

function MobileCards({ rows }: { rows: ActivitySummary[] }) {
  return (
    <ul className="space-y-3 md:hidden" aria-label="Activities">
      {rows.map((a) => (
        <li key={a.id}>
          <a
            href={`/activities/${a.id}`}
            className="block rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition hover:ring-brand/40"
          >
            <article>
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-muted">{formatDate(a.startedAt)}</p>
                  <h3 className="mt-0.5 truncate text-base font-semibold text-ink">
                    <span aria-hidden="true" className="mr-1.5">
                      {SPORT_ICON[a.sportType]}
                    </span>
                    {a.title}
                  </h3>
                </div>
              </header>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Cell term="Distance" def={formatDistance(a.distanceMeters)} />
                <Cell term="Duration" def={formatDuration(a.durationSeconds)} />
                <Cell term="Pace / Speed" def={formatPaceOrSpeed(a.sportType, a.avgPaceSecondsPerKm)} />
                <Cell term="Avg HR" def={formatHeartRate(a.avgHeartRate)} />
              </dl>
            </article>
          </a>
        </li>
      ))}
    </ul>
  )
}

function Cell({ term, def }: { term: string; def: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{term}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-ink">{def}</dd>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-card p-10 text-center shadow-sm ring-1 ring-border">
      <p className="text-3xl" aria-hidden="true">📭</p>
      <h2 className="mt-3 text-base font-semibold text-ink">No activities yet</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Connect Strava and click <span className="font-medium text-ink">Sync from Strava</span> above to import your recent activities.
      </p>
    </div>
  )
}

function NoMatchState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
      <p className="text-sm text-ink-muted">No activities match this filter.</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-3 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        Show all
      </button>
    </div>
  )
}

// ───────────────────────────────────────────────────────────── helpers ──

function sortRows(
  rows: ActivitySummary[],
  key: SortKey,
  dir: SortDir,
): ActivitySummary[] {
  const sign = dir === 'asc' ? 1 : -1
  const sorted = [...rows]
  sorted.sort((a, b) => {
    const aVal = pickSortValue(a, key)
    const bVal = pickSortValue(b, key)
    return sign * (aVal - bVal)
  })
  return sorted
}

function pickSortValue(a: ActivitySummary, key: SortKey): number {
  if (key === 'startedAt') {
    return a.startedAt ? new Date(a.startedAt).getTime() : 0
  }
  return a[key] ?? 0
}

function countBySport(rows: ActivitySummary[]): Record<ActivitySportType, number> {
  const counts: Record<ActivitySportType, number> = {
    RUNNING: 0,
    CYCLING: 0,
    SWIMMING: 0,
    ROWING: 0,
    OTHER: 0,
  }
  for (const r of rows) counts[r.sportType] += 1
  return counts
}
