// Client for the capacity API. Types mirror api/capacity.go and api/people.go.

export type WeekCell = {
  allocated: number
  capacity: number
}

export type PersonCapacity = {
  id: number
  name: string
  weekly_hours: number
  /** Aligned by index with CapacityResponse.weeks. */
  weeks: WeekCell[]
}

export type CapacityResponse = {
  from: string
  to: string
  /** Monday of each week in the range. */
  weeks: string[]
  people: PersonCapacity[]
  total: number
  offset: number
  limit: number
}

export type Person = {
  id: number
  name: string
  weekly_hours: number
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = body && typeof body.error === 'string' ? body.error : `Request failed (${res.status})`
    throw new ApiError(message, res.status)
  }
  return body as T
}

export type CapacityParams = {
  from: string
  to: string
  offset?: number
  limit?: number
  ids?: number[]
}

export function fetchCapacity(p: CapacityParams, signal?: AbortSignal): Promise<CapacityResponse> {
  const q = new URLSearchParams({ from: p.from, to: p.to })
  if (p.offset) q.set('offset', String(p.offset))
  if (p.limit) q.set('limit', String(p.limit))
  if (p.ids) q.set('ids', p.ids.join(','))
  return request(`/api/capacity?${q}`, { signal })
}

export function updateWeeklyHours(id: number, weeklyHours: number): Promise<Person> {
  return request(`/api/people/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekly_hours: weeklyHours }),
  })
}
