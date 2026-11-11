import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import './register-ts-imports.mjs'
const { resizeToPoster, compositeLogoBottomRight, compositeCampaignLogos } = await import('../src/lib/logo-overlay.ts')

test('resizing a non-4:5 source preserves circular proportions rather than stretching it', async () => {
  const source = Buffer.from('<svg width="200" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="100" fill="#eeeeee"/><circle cx="100" cy="50" r="20" fill="#ff0000"/></svg>')
  const result = await resizeToPoster(source)
  const { data, info } = await sharp(result).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 1080)
  assert.equal(info.height, 1350)
  let minX = 1080, maxX = 0, minY = 1350, maxY = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3
    if (data[i] > 200 && data[i + 1] < 40 && data[i + 2] < 40) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  }
  assert.ok(Math.abs((maxX - minX) - (maxY - minY)) <= 1)
})

test('footer preserves all main artwork and rasterizes the exact original SVG', async () => {
  const base = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#123456' } }).png().toBuffer()
  const { buffer } = await compositeLogoBottomRight(base, '')
  const before = await sharp(base).extract({ left: 0, top: 0, width: 1080, height: 1205 }).removeAlpha().raw().toBuffer()
  const after = await sharp(buffer).extract({ left: 0, top: 0, width: 1080, height: 1205 }).removeAlpha().raw().toBuffer()
  assert.ok(before.equals(after), 'main poster must not be modified')
  const svg = await readFile('public/brands/first1saudi-identity.svg')
  const logo = await sharp(svg).resize({ width: 235, height: 101, fit: 'inside' }).png().toBuffer()
  const m = await sharp(logo).metadata()
  const expected = await sharp({ create: { width: m.width, height: m.height, channels: 3, background: '#FCFAF3' } }).composite([{ input: logo }]).removeAlpha().raw().toBuffer()
  const actual = await sharp(buffer).extract({ left: 1080 - 56 - m.width, top: 1205 + Math.round((145 - m.height) / 2), width: m.width, height: m.height }).removeAlpha().raw().toBuffer()
  assert.ok(actual.equals(expected), 'exact original logo should survive the compositor')
  const social = await sharp(buffer).extract({ left: 64, top: 1230, width: 500, height: 100 }).removeAlpha().raw().toBuffer()
  assert.ok(social.some((v, i) => i % 3 === 0 && v < 80), 'social lockup is actually present, not just reserved')
})

test('a model canvas taller than 4:5 does not lose its last fact under the final footer', async () => {
  const input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1092" height="1440"><rect width="1092" height="1440" fill="#FCFAF3"/><rect x="100" y="1260" width="800" height="40" fill="#15432F"/></svg>')
  const { data, info } = await sharp(await resizeToPoster(input)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let lastInk = -1
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3
    if (data[i] < 80 && data[i + 1] < 120 && data[i + 2] < 100) lastInk = y
  }
  assert.ok(lastInk > 1100 && lastInk < 1205, 'all source facts must remain above the digital footer')
})

test('original campaign marks and the social footer fit both portrait and report formats', async () => {
  const logo = await readFile('public/brands/first1saudi-identity.svg')
  for (const [width, height] of [[1080, 1350], [1600, 900], [1080, 1920]]) {
    const base = await sharp({ create: { width, height, channels: 3, background: '#15432F' } }).png().toBuffer()
    const output = await compositeCampaignLogos(base, [{ input: logo, widthRatio: 235 / 1080 }, { input: Buffer.from('<svg width="100" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="80" fill="#663399"/></svg>'), widthRatio: 0.145 }])
    const m = await sharp(output).metadata()
    assert.equal(m.width, width); assert.equal(m.height, height)
  }
})
