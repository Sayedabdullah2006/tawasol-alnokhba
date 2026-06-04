/**
 * تركيب شعار First1Saudi برمجياً فوق التصميم المُولَّد.
 *
 * نماذج توليد الصور (حتى نانو بانانا برو) تُعيد رسم أي لوقو يُمرَّر إليها فتُشوّه
 * نصّه العربي. لذلك نولّد التصميم بدون لوقو (مع ترك مساحة فارغة أسفل اليمين)،
 * ثم نلصق ملف اللوقو الأصلي بكسلاً ببكسل هنا لضمان ظهوره صحيحاً 100%.
 *
 * يفضَّل أن يكون اللوقو PNG بخلفية شفافة. إن كان بخلفية صلبة سيظهر كمستطيل.
 */
import sharp from 'sharp'

// مقاس منشور السوشال الثابت (4:5)
export const POSTER_WIDTH = 1080
export const POSTER_HEIGHT = 1350

/**
 * يضبط الصورة على مقاس 1080×1350 بالضبط (4:5) **بالتحجيم فقط دون قصّ**.
 * بما أن النموذج يُطلب منه إخراج 4:5، يكون التحجيم لنفس النسبة بلا تشويه يُذكر.
 */
export async function resizeToPoster(
  img: Buffer,
  width: number = POSTER_WIDTH,
  height: number = POSTER_HEIGHT,
): Promise<Buffer> {
  return sharp(img)
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer()
}

interface OverlayOptions {
  // عرض اللوقو كنسبة من عرض التصميم
  widthRatio?: number
  // الهامش من اليمين كنسبة من العرض
  rightMarginRatio?: number
  // الهامش من الأسفل كنسبة من الارتفاع
  bottomMarginRatio?: number
}

/**
 * يلصق اللوقو أسفل يمين الصورة الأساسية ويعيد PNG buffer.
 * عند أي خطأ يعيد الصورة الأساسية كما هي (لا نُفشل توليد التصميم بسبب اللوقو).
 */
export async function compositeLogoBottomRight(
  baseImage: Buffer,
  logoUrl: string,
  opts: OverlayOptions = {},
): Promise<{ buffer: Buffer; mimeType: string }> {
  // شعار أصغر ومُلاصق لأقصى الزاوية اليمنى السفلية لتفادي تداخله مع النص/الفوتر
  const widthRatio = opts.widthRatio ?? 0.11
  const rightMarginRatio = opts.rightMarginRatio ?? 0.02
  const bottomMarginRatio = opts.bottomMarginRatio ?? 0.025

  try {
    const base = sharp(baseImage)
    const meta = await base.metadata()
    const W = meta.width ?? 1080
    const H = meta.height ?? 1350

    const resp = await fetch(logoUrl)
    if (!resp.ok) throw new Error(`تعذّر تحميل اللوقو: ${resp.status}`)
    const logoBuf = Buffer.from(await resp.arrayBuffer())

    // نُحجّم اللوقو على العرض المطلوب مع الحفاظ على الشفافية
    const targetW = Math.max(1, Math.round(W * widthRatio))
    const resizedLogo = await sharp(logoBuf)
      .resize({ width: targetW, fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer()
    const logoMeta = await sharp(resizedLogo).metadata()
    const logoW = logoMeta.width ?? targetW
    const logoH = logoMeta.height ?? targetW

    const left = Math.max(0, W - logoW - Math.round(W * rightMarginRatio))
    const top = Math.max(0, H - logoH - Math.round(H * bottomMarginRatio))

    const out = await base
      .composite([{ input: resizedLogo, left, top }])
      .png()
      .toBuffer()

    return { buffer: out, mimeType: 'image/png' }
  } catch {
    // أي خلل في التركيب: نُرجع الصورة الأصلية دون لوقو بدل إفشال العملية
    return { buffer: baseImage, mimeType: 'image/png' }
  }
}
