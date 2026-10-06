import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import './register-ts-imports.mjs'

const { compositeStudioSocialFooter, studioFooterSvg } = await import('../src/lib/studio-social-footer.ts')

test('digital footer paints five icons and account with a full-width curved edge', async () => {
  const width = 1080, height = 1350
  const base = await sharp({ create: { width, height, channels: 4, background: '#0A3A2A' } }).png().toBuffer()
  const output = await compositeStudioSocialFooter(base)
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true })
  const whites = (left, top, w, h) => {
    let count = 0
    for (let y = top; y < top + h; y++) for (let x = left; x < left + w; x++) {
      const i = (y * info.width + x) * info.channels
      if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) count++
    }
    return count
  }
  for (let i = 0; i < 5; i++) assert.ok(whites(128 + i * 48, 1265, 35, 40) > 20, `social icon ${i + 1} appears`)
  assert.ok(whites(376, 1265, 230, 45) > 200, 'account text appears')
  assert.equal(whites(900, 1200, 180, 150), 0, 'no white panel or account text in the logo corner')
  const svg = studioFooterSvg(width, height)
  assert.match(svg, /@First1Saudi/)
  assert.match(svg, /stroke="#D4AF37"/)
  assert.match(svg, / C.* S/)
})
