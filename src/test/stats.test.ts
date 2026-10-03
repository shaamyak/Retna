import { describe, it, expect } from 'vitest'
import { linearRegression, mean, stdDev, max } from '@/lib/stats'

describe('linearRegression', () => {
  it('computes slope and intercept for simple data', () => {
    const result = linearRegression([0, 1, 2], [0, 1, 2])
    expect(result).not.toBeNull()
    expect(result!.slope).toBeCloseTo(1.0, 4)
    expect(result!.intercept).toBeCloseTo(0.0, 4)
    expect(result!.r2).toBeCloseTo(1.0, 4)
  })

  it('computes negative slope', () => {
    const result = linearRegression([0, 1, 2, 3], [10, 8, 6, 4])
    expect(result!.slope).toBeCloseTo(-2.0, 4)
  })

  it('returns null for fewer than 2 points', () => {
    expect(linearRegression([1], [1])).toBeNull()
    expect(linearRegression([], [])).toBeNull()
  })

  it('returns null for zero variance in x', () => {
    expect(linearRegression([1, 1, 1], [1, 2, 3])).toBeNull()
  })
})

describe('mean', () => {
  it('computes mean ignoring nulls', () => {
    expect(mean([1, 2, null, 4])).toBeCloseTo(7 / 3, 4)
  })
  it('returns null for empty or all-null array', () => {
    expect(mean([])).toBeNull()
    expect(mean([null, null])).toBeNull()
  })
})

describe('stdDev', () => {
  it('computes sample std dev', () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2)
  })
  it('returns null for fewer than 2 valid values', () => {
    expect(stdDev([5])).toBeNull()
    expect(stdDev([])).toBeNull()
  })
})

describe('max', () => {
  it('returns max ignoring nulls', () => {
    expect(max([1, null, 5, 3])).toBe(5)
  })
  it('returns null for empty array', () => {
    expect(max([])).toBeNull()
  })
})
