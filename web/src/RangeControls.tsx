import { addDays, mondayOf, sundayOf, todayISO, weeksBetween } from './dates'

export type Range = { from: string; to: string } // Monday … Sunday

// Must match maxWeeks in api/capacity.go.
export const MAX_WEEKS = 106
const PRESETS = [4, 6, 13, 26, 52]

type Props = {
  range: Range
  onChange: (r: Range) => void
}

export function RangeControls({ range, onChange }: Props) {
  const weeks = weeksBetween(range.from, range.to)

  const shift = (days: number) => onChange({ from: addDays(range.from, days), to: addDays(range.to, days) })

  const setLength = (n: number) => onChange({ from: range.from, to: addDays(range.from, n * 7 - 1) })

  const setFrom = (value: string) => {
    if (!value) return
    const from = mondayOf(value)
    // Keep the range valid: moving the start past the end drags the end along.
    const to = from > range.to ? sundayOf(from) : range.to
    onChange(clamp({ from, to }, 'from'))
  }

  const setTo = (value: string) => {
    if (!value) return
    const to = sundayOf(value)
    const from = to < range.from ? mondayOf(to) : range.from
    onChange(clamp({ from, to }, 'to'))
  }

  const thisWeek = () => {
    const monday = mondayOf(todayISO())
    onChange({ from: monday, to: addDays(monday, weeks * 7 - 1) })
  }

  return (
    <div className="controls" role="group" aria-label="Date range">
      <div className="nav">
        <button type="button" onClick={() => shift(-7)} aria-label="Previous week">
          ← Week
        </button>
        <button type="button" onClick={thisWeek}>
          This week
        </button>
        <button type="button" onClick={() => shift(7)} aria-label="Next week">
          Week →
        </button>
      </div>
      <label>
        From
        <input type="date" value={range.from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label>
        To
        <input type="date" value={range.to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label>
        Show
        <select value={PRESETS.includes(weeks) ? weeks : ''} onChange={(e) => setLength(Number(e.target.value))}>
          {!PRESETS.includes(weeks) && <option value="">{weeks} weeks</option>}
          {PRESETS.map((n) => (
            <option key={n} value={n}>
              {n} weeks
            </option>
          ))}
        </select>
      </label>
      <span className="hint">Weeks run Monday–Sunday; dates snap to whole weeks.</span>
    </div>
  )
}

function clamp(r: Range, keep: 'from' | 'to'): Range {
  if (weeksBetween(r.from, r.to) <= MAX_WEEKS) return r
  return keep === 'from'
    ? { from: r.from, to: addDays(r.from, MAX_WEEKS * 7 - 1) }
    : { from: addDays(r.to, -(MAX_WEEKS * 7 - 1)), to: r.to }
}
