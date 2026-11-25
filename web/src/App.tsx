import { useEffect, useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { RangeControls, type Range } from './RangeControls'
import { addDays, isISODate, mondayOf, sundayOf, todayISO } from './dates'

const DEFAULT_WEEKS = 6

// The range lives in the URL (?from=&to=) so a view can be bookmarked or shared.
function initialRange(): Range {
  const q = new URLSearchParams(window.location.search)
  const from = q.get('from') ?? ''
  const to = q.get('to') ?? ''
  if (isISODate(from) && isISODate(to) && from <= to) {
    return { from: mondayOf(from), to: sundayOf(to) }
  }
  const monday = mondayOf(todayISO())
  return { from: monday, to: addDays(monday, DEFAULT_WEEKS * 7 - 1) }
}

export function App() {
  const [range, setRange] = useState<Range>(initialRange)

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('from', range.from)
    url.searchParams.set('to', range.to)
    window.history.replaceState(null, '', url)
  }, [range])

  return (
    <main>
      <h1>Team capacity</h1>
      <RangeControls range={range} onChange={setRange} />
      <CapacityGrid from={range.from} to={range.to} />
    </main>
  )
}
