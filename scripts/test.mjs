// The one test runner: imports every tests/*.test.ts in this Node process (Node strips the types) and
// fails loudly. A single script, because shell loops over files can silently run nothing on Windows.
import { readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { results } from '../tests/harness.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests')
const only = process.argv[2]
const files = readdirSync(root).filter(f => f.endsWith('.test.ts') && (!only || f.includes(only))).sort()
if (files.length === 0) { console.error('FAIL: no test files found in tests/'); process.exit(1) }
let crashed = 0
for (const file of files) {
  const before = results.passed + results.failed
  try {
    const mod = await import(pathToFileURL(join(root, file)).href)
    if (typeof mod.run === 'function') await mod.run()
  } catch (error) {
    crashed++
    console.error(`CRASH ${file}\n`, error)
  }
  console.log(`${file}: ${results.passed + results.failed - before} checks`)
}
for (const failure of results.failures) console.error('FAIL', failure)
console.log(`\n${files.length} files, ${results.passed} passed, ${results.failed} failed${crashed ? `, ${crashed} crashed` : ''}`)
if (results.failed || crashed || results.passed === 0) process.exit(1)
