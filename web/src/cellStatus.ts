import type { WeekCell } from './api'

export type CellStatus = 'over' | 'full' | 'ok' | 'free' | 'none'

/** Share of capacity at which a week counts as nearly full. */
export const NEAR_FULL = 0.9

// One place that decides what "over-allocated" means on screen.
export function cellStatus({ allocated, capacity }: WeekCell): CellStatus {
  if (capacity <= 0) return allocated > 0 ? 'over' : 'none' // 0h contract: any work is too much
  if (allocated > capacity) return 'over'
  if (allocated >= capacity * NEAR_FULL) return 'full'
  if (allocated === 0) return 'free'
  return 'ok'
}

export function formatHours(h: number): string {
  // Allocations are multiples of 0.25h in practice; don't print float noise.
  return String(Math.round(h * 100) / 100)
}
