import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CapacityResponse } from './api'
import { CapacityGrid } from './CapacityGrid'

function response(weeklyHours: number, allocated = 45): CapacityResponse {
  return {
    from: '2026-01-05',
    to: '2026-01-11',
    weeks: ['2026-01-05'],
    people: [{ id: 4, name: 'Dee Okafor', weekly_hours: weeklyHours, weeks: [{ allocated, capacity: weeklyHours }] }],
    total: 1,
    offset: 0,
    limit: 100,
  }
}

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

async function editHours(value: string) {
  fireEvent.click(await screen.findByRole('button', { name: /Edit weekly hours for Dee Okafor/ }))
  fireEvent.change(screen.getByLabelText('Weekly hours for Dee Okafor'), { target: { value } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CapacityGrid editing', () => {
  it('after a save, shows the row as the server computes it for the range on screen', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return json(200, { id: 4, name: 'Dee Okafor', weekly_hours: 48 })
      if (url.includes('ids=4')) return json(200, response(48))
      return json(200, response(40))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CapacityGrid from="2026-01-05" to="2026-01-11" />)
    expect(await screen.findByText('+5h')).toBeTruthy() // 45 of 40: over

    await editHours('48')

    await waitFor(() => expect(screen.queryByText('+5h')).toBeNull())
    expect(screen.getByText('/48')).toBeTruthy()
    // The row refresh asks for the same range, filtered to the edited person.
    expect(fetchMock).toHaveBeenCalledWith('/api/capacity?from=2026-01-05&to=2026-01-11&ids=4', expect.anything())
  })

  it('on a failed save, keeps the old numbers and the draft, and says why', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        init?.method === 'PATCH' ? json(500, { error: 'could not save weekly hours' }) : json(200, response(40)),
      ),
    )

    render(<CapacityGrid from="2026-01-05" to="2026-01-11" />)
    await editHours('48')

    expect((await screen.findByRole('alert')).textContent).toContain('Not saved: could not save weekly hours')
    expect((screen.getByLabelText('Weekly hours for Dee Okafor') as HTMLInputElement).value).toBe('48')
    expect(screen.getByText('/40')).toBeTruthy()
    expect(screen.getByText('+5h')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
