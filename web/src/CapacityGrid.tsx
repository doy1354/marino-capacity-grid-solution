import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCapacity, updateWeeklyHours, type CapacityResponse, type PersonCapacity, type WeekCell } from './api'
import { cellStatus, formatHours } from './cellStatus'
import { mondayOf, todayISO, weekLabel } from './dates'
import { WeeklyHoursEditor } from './WeeklyHoursEditor'

type Props = {
  from: string
  to: string
}

const PAGE_SIZE = 100

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }

// CapacityGrid renders one row per person and one column per week.
//
// After an edit it does not recompute anything itself: it asks the API for the
// edited person's row over the range on screen (GET /api/capacity?ids=…) and
// swaps it in. The allocation rules live only in the API.
export function CapacityGrid({ from, to }: Props) {
  const [data, setData] = useState<CapacityResponse | null>(null)
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [staleRows, setStaleRows] = useState<ReadonlySet<number>>(new Set())
  const [reloadToken, setReloadToken] = useState(0)

  // Async callbacks read the range from here, so a response for a range the
  // manager has already navigated away from is dropped instead of applied.
  const rangeRef = useRef({ from, to })
  rangeRef.current = { from, to }
  const isCurrent = (r: { from: string; to: string }) => r.from === rangeRef.current.from && r.to === rangeRef.current.to

  // People saved while a full load was in flight; that load may have read the
  // old value, so their rows are re-fetched once it lands.
  const savedDuringLoad = useRef(new Set<number>())
  const loadingRef = useRef(true)
  loadingRef.current = load.kind === 'loading'

  const replaceRows = useCallback((fresh: PersonCapacity[]) => {
    const byId = new Map(fresh.map((p) => [p.id, p]))
    setData((d) => d && { ...d, people: d.people.map((p) => byId.get(p.id) ?? p) })
    setStaleRows((s) => {
      const next = new Set(s)
      fresh.forEach((p) => next.delete(p.id))
      return next
    })
  }, [])

  const markStale = useCallback(
    (ids: number[]) =>
      setStaleRows((s) => {
        const next = new Set(s)
        ids.forEach((id) => next.add(id))
        return next
      }),
    [],
  )

  const refreshRows = useCallback(
    async (ids: number[]) => {
      const range = rangeRef.current
      const res = await fetchCapacity({ ...range, ids })
      if (isCurrent(range)) replaceRows(res.people)
    },
    [replaceRows],
  )

  useEffect(() => {
    const controller = new AbortController()
    savedDuringLoad.current.clear()
    setLoad({ kind: 'loading' })
    setMoreError(null)
    fetchCapacity({ from, to, limit: PAGE_SIZE }, controller.signal)
      .then((res) => {
        setData(res)
        setStaleRows(new Set())
        setLoad({ kind: 'ready' })
        const resaved = [...savedDuringLoad.current]
        savedDuringLoad.current.clear()
        if (resaved.length) refreshRows(resaved).catch(() => markStale(resaved))
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setLoad({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load capacity.' })
      })
    return () => controller.abort()
  }, [from, to, reloadToken, refreshRows, markStale])

  const loadMore = async () => {
    if (!data) return
    const range = rangeRef.current
    setLoadingMore(true)
    setMoreError(null)
    try {
      const res = await fetchCapacity({ ...range, offset: data.people.length, limit: PAGE_SIZE })
      if (!isCurrent(range)) return
      setData((d) => d && { ...d, people: [...d.people, ...res.people], total: res.total })
    } catch (err) {
      if (isCurrent(range)) setMoreError(err instanceof Error ? err.message : 'Could not load more people.')
    } finally {
      setLoadingMore(false)
    }
  }

  // Throws if the save fails, so the editor can keep the draft and show why.
  const saveWeeklyHours = async (id: number, hours: number) => {
    const saved = await updateWeeklyHours(id, hours)
    if (loadingRef.current) savedDuringLoad.current.add(id)
    try {
      await refreshRows([id])
    } catch {
      // The save itself worked. Show the new contract hours, but don't guess
      // the weekly numbers — flag the row and let the manager refresh it.
      setData((d) => d && { ...d, people: d.people.map((p) => (p.id === id ? { ...p, weekly_hours: saved.weekly_hours } : p)) })
      markStale([id])
    }
  }

  if (!data) {
    if (load.kind === 'error') return <ErrorBanner message={load.message} onRetry={() => setReloadToken((t) => t + 1)} />
    return <p className="status">Loading capacity…</p>
  }

  const currentWeek = mondayOf(todayISO())
  const busy = load.kind === 'loading'

  return (
    <section className="grid-section" aria-busy={busy}>
      {load.kind === 'error' && (
        <ErrorBanner
          message={`${load.message} Showing the previously loaded range.`}
          onRetry={() => setReloadToken((t) => t + 1)}
        />
      )}
      <Legend />
      <div className={`grid-wrap${busy ? ' is-busy' : ''}`}>
        <table className="grid">
          <thead>
            <tr>
              <th scope="col" className="name-col">
                Person
              </th>
              <th scope="col" className="hours-col">
                Weekly hours
              </th>
              {data.weeks.map((w) => (
                <th scope="col" key={w} className={w === currentWeek ? 'week current' : 'week'}>
                  <span className="week-of">Week of</span> {weekLabel(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.people.map((p) => (
              <tr key={p.id} className={staleRows.has(p.id) ? 'stale' : undefined}>
                <th scope="row" className="name-col">
                  {p.name}
                  {staleRows.has(p.id) && (
                    <button type="button" className="link" onClick={() => refreshRows([p.id]).catch(() => undefined)}>
                      Saved — numbers may be out of date. Refresh row
                    </button>
                  )}
                </th>
                <td className="hours-col">
                  <WeeklyHoursEditor
                    name={p.name}
                    value={p.weekly_hours}
                    onSave={(h) => saveWeeklyHours(p.id, h)}
                  />
                </td>
                {p.weeks.map((cell, i) => (
                  <Cell key={data.weeks[i]} cell={cell} current={data.weeks[i] === currentWeek} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="footer">
        <span>
          Showing {data.people.length} of {data.total} people
        </span>
        {data.people.length < data.total && (
          <button type="button" onClick={loadMore} disabled={loadingMore || busy}>
            {loadingMore ? 'Loading…' : `Load ${Math.min(PAGE_SIZE, data.total - data.people.length)} more`}
          </button>
        )}
        {moreError && (
          <span role="alert" className="error-text">
            {moreError}
          </span>
        )}
        {busy && <span className="status">Updating…</span>}
      </div>
    </section>
  )
}

function Cell({ cell, current }: { cell: WeekCell; current: boolean }) {
  const status = cellStatus(cell)
  const over = cell.allocated - cell.capacity
  const pct = cell.capacity > 0 ? Math.round((cell.allocated / cell.capacity) * 100) : null
  const title =
    `${formatHours(cell.allocated)}h allocated of ${formatHours(cell.capacity)}h capacity` +
    (pct !== null ? ` (${pct}%)` : '')
  return (
    <td className={`cell ${status}${current ? ' current' : ''}`} title={title}>
      <span className="alloc">{formatHours(cell.allocated)}</span>
      <span className="cap">/{formatHours(cell.capacity)}</span>
      {status === 'over' && <span className="over-by">+{formatHours(over)}h</span>}
    </td>
  )
}

function Legend() {
  return (
    <p className="legend">
      Allocated / capacity hours per week (Mon–Fri).
      <span className="swatch over">Over capacity</span>
      <span className="swatch full">90%+</span>
      <span className="swatch free">Unallocated</span>
    </p>
  )
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="banner error">
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
