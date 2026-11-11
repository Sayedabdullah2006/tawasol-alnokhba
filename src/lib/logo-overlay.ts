/** Original digital branding only. Main photos and Arabic are integrated by the image model. */
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { studioFooterHeight } from './studio-design-guidelines'

export const POSTER_WIDTH = 1080
export const POSTER_HEIGHT = 1350

/** Proportional contain/pad: never stretch a face, garment, document or name. */
export async function resizeToPoster(img: Buffer, width = POSTER_WIDTH, height = POSTER_HEIGHT): Promise<Buffer> {
  const meta = await sharp(img).metadata()
  if (meta.width && meta.height) {
    // Models can return a taller canvas than requested. Locate their blank ivory footer
    // so proportional normalization does not place the last fact underneath the real footer.
    const { data, info } = await sharp(img).resize({ width: Math.min(160, meta.width) }).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
    let row = info.height - 1
    for (; row >= Math.floor(info.height * 0.75); row--) {
      let nonIvory = 0
      for (let x = 0; x < info.width; x++) {
        const i = (row * info.width + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2]
        if (r < 235 || g < 232 || b < 222 || Math.max(r, g, b) - Math.min(r, g, b) > 35) nonIvory++
      }
      if (nonIvory > info.width * 0.01) break
    }
    const blankRatio = (info.height - row - 1) / info.height
    if (blankRatio >= 0.04 && blankRatio < 0.24) {
      const contentBottom = (row + 1) * meta.height / info.height
      const scale = Math.min(width / meta.width, height / meta.height, (height - studioFooterHeight(width, height) - Math.round(20 * width / POSTER_WIDTH)) / contentBottom)
      const resized = await sharp(img).resize({ width: Math.max(1, Math.floor(meta.width * scale)) }).png().toBuffer()
      const m = await sharp(resized).metadata()
      return sharp({ create: { width, height, channels: 3, background: '#FCFAF3' } })
        .composite([{ input: resized, left: Math.floor((width - (m.width ?? width)) / 2), top: 0 }]).png().toBuffer()
    }
  }
  return sharp(img).resize(width, height, { fit: 'contain', background: '#FCFAF3' }).png().toBuffer()
}

interface OverlayOptions { widthRatio?: number; rightMarginRatio?: number; bottomMarginRatio?: number }
const originalLogoPath = () => path.join(process.cwd(), 'public', 'brands', 'first1saudi-identity.svg')
let socialLockup: Promise<Buffer> | undefined

/** Verified platform set and unified handle approved in reference v3. */
function socialAssets(): Promise<Buffer> {
  socialLockup ??= (async () => {
    const icons = ['instagram', 'x', 'linkedin', 'facebook', 'tiktok']
    const layers = await Promise.all(icons.map(async (name, i) => ({
      input: await sharp(await readFile(path.join(process.cwd(), 'public', 'brands', 'first1saudi-social', `${name}.svg`))).resize(30, 30).png().toBuffer(),
      left: i * 46, top: 10,
    })))
    const handle = await sharp({ text: {
      text: '<span font_family="Almarai Bold" weight="normal" foreground="#15432F">First1Saudi</span>',
      font: 'Almarai Bold 35', fontfile: path.join(process.cwd(), 'public', 'fonts', 'almarai-bold.ttf'), rgba: true, dpi: 72,
    } }).png().toBuffer()
    const handleMeta = await sharp(handle).metadata()
    layers.push({ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="40"><rect width="1" height="40" fill="#15432F"/></svg>'), left: 244, top: 5 })
    layers.push({ input: handle, left: 273, top: 10 })
    return sharp({ create: { width: 273 + (handleMeta.width ?? 200), height: Math.max(50, (handleMeta.height ?? 40) + 15), channels: 4, background: '#FCFAF3' } }).composite(layers).png().toBuffer()
  })().catch(error => { socialLockup = undefined; throw error })
  return socialLockup
}

async function originalLogo(logoUrl: string): Promise<Buffer> {
  if (!logoUrl) return readFile(originalLogoPath())
  const response = await fetch(logoUrl)
  if (!response.ok) throw new Error(`تعذّر تحميل الشعار الأصلي: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function brandFooter(baseImage: Buffer, logos: Array<{ input: Buffer; widthRatio: number }>, opts: OverlayOptions = {}): Promise<Buffer> {
  const meta = await sharp(baseImage).metadata()
  const W = meta.width ?? POSTER_WIDTH, H = meta.height ?? POSTER_HEIGHT
  const scale = W / POSTER_WIDTH, footerH = studioFooterHeight(W, H), footerTop = H - footerH
  const padding = Math.max(8, Math.round(22 * scale)), margin = Math.round(W * (opts.rightMarginRatio ?? 56 / POSTER_WIDTH)), gap = Math.round(20 * scale)
  const rendered = await Promise.all(logos.map(async logo => sharp(logo.input).resize({ width: Math.max(1, Math.round(W * logo.widthRatio)), height: Math.max(1, footerH - padding * 2), fit: 'inside' }).png().toBuffer()))
  const layers: Array<{ input: Buffer; left: number; top: number }> = [{ input: await sharp({ create: { width: W, height: footerH, channels: 4, background: '#FCFAF3' } }).png().toBuffer(), left: 0, top: footerTop }]
  let cursor = W - margin
  for (const input of rendered) {
    const m = await sharp(input).metadata()
    cursor -= m.width ?? 1
    if (cursor < 0) throw new Error('لا تتسع مساحة التذييل للشعارات الأصلية')
    layers.push({ input, left: cursor, top: footerTop + Math.round((footerH - (m.height ?? 1)) / 2) })
    cursor -= gap
  }
  const socialLeft = Math.round(64 * scale), available = cursor - socialLeft
  if (available < 1) throw new Error('لا تتسع مساحة التذييل لحسابات التواصل')
  const social = await socialAssets(), sm = await sharp(social).metadata()
  const sizedSocial = await sharp(social).resize({ width: Math.min(available, Math.round((sm.width ?? 450) * scale)), height: footerH - padding * 2, fit: 'inside' }).png().toBuffer()
  const socialMeta = await sharp(sizedSocial).metadata()
  layers.push({ input: sizedSocial, left: socialLeft, top: footerTop + Math.round((footerH - (socialMeta.height ?? 50)) / 2) })
  return sharp(baseImage).composite(layers).png().toBuffer()
}

/** Includes the mandatory footer; branding failures must not be silently published. */
export async function compositeLogoBottomRight(baseImage: Buffer, logoUrl: string, opts: OverlayOptions = {}): Promise<{ buffer: Buffer; mimeType: string }> {
  return { buffer: await brandFooter(baseImage, [{ input: await originalLogo(logoUrl), widthRatio: opts.widthRatio ?? 235 / POSTER_WIDTH }], opts), mimeType: 'image/png' }
}

/** Original campaign marks retain their files, colors and proportions beside the shared social lockup. */
export async function compositeCampaignLogos(baseImage: Buffer, logos: Array<{ input: Buffer; widthRatio: number }>): Promise<Buffer> {
  return brandFooter(baseImage, logos.length ? logos : [{ input: await originalLogo(''), widthRatio: 235 / POSTER_WIDTH }])
}
