import sharp from 'sharp'

// Original vector artwork: social marks are composited digitally, never AI-rendered.
const SOCIAL_MARKS = [
  '<path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l8.2-9.4L.8 2h6.5l4.5 6.7L18.9 2Zm-1.1 18h1.7L6.4 4H4.6l13.2 16Z"/>',
  '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/>',
  '<path fill="currentColor" d="M3 8h4v13H3V8Zm2-6a2.3 2.3 0 1 1 0 4.6A2.3 2.3 0 0 1 5 2Zm5 6h3.8v1.8c.8-1.3 2-2.1 3.7-2.1 3.7 0 4.5 2.4 4.5 5.5V21h-4v-6.9c0-1.7 0-3.3-2-3.3s-2.2 1.5-2.2 3.2v7h-4V8Z"/>',
  '<path fill="currentColor" d="M14.5 22v-9h3l.5-3.5h-3.5V7.3c0-1 .3-1.8 1.8-1.8H18V2.3a23 23 0 0 0-2.6-.2c-2.6 0-4.4 1.6-4.4 4.5v2.9H8V13h3v9h3.5Z"/>',
  '<path fill="currentColor" d="M14 2h3c.3 2.3 1.6 3.7 4 4v3a9 9 0 0 1-4-1.3v8.1a6.2 6.2 0 1 1-5.4-6.1v3a3.2 3.2 0 1 0 2.4 3.1V2Z"/>',
]

export function studioFooterSvg(width: number, height: number, logoPocketWidthRatio = 0.3): string {
  const scale = Math.min(width / 1080, height / 1000)
  const footerHeight = Math.round(170 * scale)
  const top = height - footerHeight
  const iconSize = 32 * scale
  const step = 48 * scale
  const rowWidth = 500 * scale
  const start = (width * (1 - logoPocketWidthRatio) - rowWidth) / 2
  const rowY = height - 64 * scale
  const curve = `M0 ${top + 28 * scale} C${width * .25} ${top - 18 * scale} ${width * .42} ${top + 52 * scale} ${width * .67} ${top + 20 * scale} S${width * .9} ${top - 5 * scale} ${width} ${top + 15 * scale}`
  const icons = SOCIAL_MARKS.map((mark, index) =>
    `<g transform="translate(${start + index * step} ${rowY - iconSize / 2}) scale(${iconSize / 24})" color="#FFFFFF">${mark}</g>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="footer" x2="0" y2="1"><stop stop-color="#0A3A2A"/><stop offset="1" stop-color="#06291E"/></linearGradient></defs>
    <path d="${curve} L${width} ${height} H0 Z" fill="url(#footer)"/>
    <path d="${curve}" fill="none" stroke="#247B4B" stroke-width="${10 * scale}"/>
    <path d="${curve}" fill="none" stroke="#D4AF37" stroke-width="${2.5 * scale}"/>
    ${icons}
    <text x="${start + 5 * step + 8 * scale}" y="${rowY}" fill="#FFFFFF" font-family="Arial, sans-serif" font-weight="700" font-size="${30 * scale}" dominant-baseline="central">@First1Saudi</text>
  </svg>`
}

/** Full-width curved footer; the logo sits directly on it with no individual panel. */
export async function compositeStudioSocialFooter(baseImage: Buffer, logoPocketWidthRatio = 0.3): Promise<Buffer> {
  const metadata = await sharp(baseImage).metadata()
  if (!metadata.width || !metadata.height) throw new Error('تعذّر تحديد مقاس التصميم لإضافة تذييل التواصل')
  return sharp(baseImage).composite([{
    input: Buffer.from(studioFooterSvg(metadata.width, metadata.height, logoPocketWidthRatio)),
    top: 0, left: 0,
  }]).png().toBuffer()
}
