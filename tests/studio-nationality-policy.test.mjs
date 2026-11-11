import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('generation source does not restore the retired nationality gate', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url))
  const retiredGate = /requireSaudiNationality|SAUDI_NATIONALITY_(?:RULES|POLICY_VERSION)|_nationalityVerification|(?:from|import)\s*['"][^'"]*\/saudi-nationality(?:-policy)?['"]|الجنسية السعودية غير مثبتة بمصدر صريح/
  const matches = []

  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        scan(path)
      } else if (/\.[cm]?[jt]sx?$/.test(entry.name) && retiredGate.test(readFileSync(path, 'utf8'))) {
        matches.push(path)
      }
    }
  }

  scan(root)
  assert.deepEqual(matches, [], 'Generation must proceed without proof of nationality')
})
