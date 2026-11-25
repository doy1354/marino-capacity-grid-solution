// Calendar-date helpers. Everything works on ISO "YYYY-MM-DD" strings and UTC
// arithmetic, so the browser's time zone can never shift a date by one.

const DAY_MS = 24 * 60 * 60 * 1000

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && format(parse(s)) === s
}

export function addDays(iso: string, days: number): string {
  return format(new Date(parse(iso).getTime() + days * DAY_MS))
}

/** The Monday on or before the given date. */
export function mondayOf(iso: string): string {
  const dow = parse(iso).getUTCDay() // Sunday = 0
  return addDays(iso, -((dow + 6) % 7))
}

/** The Sunday on or after the given date. */
export function sundayOf(iso: string): string {
  return addDays(mondayOf(iso), 6)
}

export function todayISO(now = new Date()): string {
  // The manager's local calendar day, not UTC's.
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function weeksBetween(from: string, to: string): number {
  return Math.round((parse(sundayOf(to)).getTime() - parse(mondayOf(from)).getTime() + DAY_MS) / (7 * DAY_MS))
}

const short = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "29 Dec" — label for a week column, given its Monday. */
export function weekLabel(monday: string): string {
  return short.format(parse(monday))
}
