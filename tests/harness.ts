/** A tiny assertion harness: every check counts, and a failure is recorded with its name. */
export const results = { passed: 0, failed: 0, failures: [] as string[] }

export function check(name: string, condition: unknown, detail?: unknown) {
  if (condition) results.passed++
  else { results.failed++; results.failures.push(detail === undefined ? name : `${name}: ${JSON.stringify(detail)}`) }
}

export function near(name: string, actual: number, expected: number, tolerance = 1e-6) {
  check(name, Math.abs(actual - expected) <= tolerance, { actual, expected })
}

export function throws(name: string, fn: () => unknown) {
  try { fn(); check(name, false, 'did not throw') } catch { check(name, true) }
}
