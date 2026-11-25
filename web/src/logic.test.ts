import { describe, expect, it } from 'vitest'
import { cellStatus } from './cellStatus'
import { addDays, mondayOf, sundayOf, weeksBetween } from './dates'

describe('dates', () => {
  it('snaps to Monday, treating Sunday as the end of the week', () => {
    expect(mondayOf('2026-01-04')).toBe('2025-12-29') // Sunday, across a year boundary
    expect(mondayOf('2026-01-05')).toBe('2026-01-05') // Monday stays
    expect(sundayOf('2025-12-31')).toBe('2026-01-04')
  })

  it('shifts across DST changes without drifting', () => {
    expect(addDays('2026-03-23', 7)).toBe('2026-03-30') // EU DST starts 29 Mar
    expect(addDays('2026-10-26', -7)).toBe('2026-10-19') // ends 25 Oct
  })

  it('counts whole weeks', () => {
    expect(weeksBetween('2025-12-29', '2026-01-18')).toBe(3)
    expect(weeksBetween('2026-01-05', '2026-01-11')).toBe(1)
  })
})

describe('cellStatus', () => {
  it('flags anything above capacity as over', () => {
    expect(cellStatus({ allocated: 45, capacity: 40 })).toBe('over')
    expect(cellStatus({ allocated: 40, capacity: 40 })).toBe('full')
    expect(cellStatus({ allocated: 20, capacity: 40 })).toBe('ok')
    expect(cellStatus({ allocated: 0, capacity: 40 })).toBe('free')
  })

  it('treats work against a zero-hour contract as over, not as a divide by zero', () => {
    expect(cellStatus({ allocated: 20, capacity: 0 })).toBe('over')
    expect(cellStatus({ allocated: 0, capacity: 0 })).toBe('none')
  })
})
