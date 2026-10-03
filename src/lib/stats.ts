/**
 * OLS (Ordinary Least Squares) linear regression utility.
 * Returns slope, intercept, and R².
 */
export function linearRegression(
  xs: number[],
  ys: number[]
): { slope: number; intercept: number; r2: number } | null {
  if (xs.length < 2 || ys.length !== xs.length) return null

  const n = xs.length
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0)
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0)

  const denom = n * sumXX - sumX * sumX
  if (Math.abs(denom) < 1e-10) return null

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  const yMean = sumY / n
  const ssTot = ys.reduce((acc, y) => acc + (y - yMean) ** 2, 0)
  const ssRes = ys.reduce((acc, y, i) => acc + (y - (slope * xs[i] + intercept)) ** 2, 0)
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot

  return { slope, intercept, r2 }
}

/** Sigmoid function for logistic regression inference */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

/** Compute mean of a numeric array, ignoring null/undefined */
export function mean(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null && !isNaN(v))
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

/** Compute std dev */
export function stdDev(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null && !isNaN(v))
  if (valid.length < 2) return null
  const m = valid.reduce((a, b) => a + b, 0) / valid.length
  const variance = valid.reduce((acc, v) => acc + (v - m) ** 2, 0) / (valid.length - 1)
  return Math.sqrt(variance)
}

/** Compute max, ignoring null */
export function max(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null && !isNaN(v))
  if (valid.length === 0) return null
  return Math.max(...valid)
}
