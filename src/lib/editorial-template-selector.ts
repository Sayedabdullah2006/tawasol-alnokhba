import sharp from 'sharp'

type ImageShape = 'portrait' | 'landscape' | 'square' | 'unknown'

type EditorialTemplate = {
  id: string
  label: string
  direction: string
}

const TEMPLATES: Record<ImageShape, EditorialTemplate[]> = {
  portrait: [
    { id: 'portrait-hero', label: 'بورتريه تحريري بطولي', direction: 'Use the real vertical photograph as the dominant hero image. Preserve its exact crop logic and pose; build a confident asymmetric editorial layout around it with typography and factual elements in the natural negative space.' },
    { id: 'portrait-magazine', label: 'غلاف مجلة تحريري', direction: 'Treat the supplied vertical photograph as an intact magazine-cover photograph, not an AI portrait. Retain the original person, pose, clothing, and camera angle while using refined cover lines, an editorial frame, and restrained information hierarchy around it.' },
    { id: 'portrait-depth', label: 'عمق طبقي', direction: 'Keep the supplied portrait photograph as one coherent, unchanged photographic subject. Integrate it through layered editorial depth, soft foreground geometry, and a strong RTL hierarchy without reconstructing or repainting the person.' },
  ],
  landscape: [
    { id: 'landscape-cinematic', label: 'مشهد سينمائي تحريري', direction: 'Use the supplied horizontal photograph as an intact cinematic scene. Keep its viewpoint, people, architecture, and proportions faithful; extend the editorial system around its existing horizon and natural empty areas only.' },
    { id: 'landscape-panorama', label: 'بانوراما خبرية', direction: 'Make the original landscape photo the documentary panorama of the poster. Do not turn it into a synthetic scene; place concise RTL facts in the real visual breathing room of the photograph and use subtle editorial bands only around it.' },
    { id: 'landscape-grid', label: 'شبكة تحريرية واسعة', direction: 'Use the supplied wide image as one untouched photographic panel within a premium editorial grid. Keep every real person and setting exactly as photographed, while other panels contain only abstract graphic texture and short factual hierarchy.' },
  ],
  square: [
    { id: 'square-feature', label: 'صورة رئيسية في إطار تحريري', direction: 'Preserve the square reference as a single intact hero photograph. Build a sophisticated editorial frame and offset typography around it; never regenerate, restyle, or replace anything inside the photo.' },
    { id: 'square-collage', label: 'كولاج تحريري منضبط', direction: 'Use the original square photograph as the central documentary card of a controlled editorial collage. It must remain a faithful, unaltered photograph while the surrounding layers are graphic and abstract.' },
  ],
  unknown: [
    { id: 'documentary-editorial', label: 'تحرير وثائقي', direction: 'Treat every supplied reference as a documentary photograph. Integrate it creatively but preserve all visible people, pose, clothing, setting, and camera perspective exactly as supplied.' },
  ],
}

function hash(value: string) {
  return Array.from(value).reduce((total, char) => ((total * 33) + char.charCodeAt(0)) >>> 0, 5381)
}

async function imageShape(url?: string): Promise<ImageShape> {
  if (!url) return 'unknown'
  try {
    const response = await fetch(url)
    if (!response.ok) return 'unknown'
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).rotate().metadata()
    if (!metadata.width || !metadata.height) return 'unknown'
    const ratio = metadata.width / metadata.height
    if (ratio > 1.14) return 'landscape'
    if (ratio < 0.88) return 'portrait'
    return 'square'
  } catch {
    return 'unknown'
  }
}

/**
 * A small art-direction preflight, injected at runtime without replacing a product's
 * existing campaign/studio prompt. It guides the model to choose a fitting layout while
 * keeping the real reference photo as the immutable source of truth.
 */
export async function selectEditorialTemplate(args: { sourceImageUrls: string[]; variantKey: string }): Promise<string> {
  if (!args.sourceImageUrls.length) return ''
  const shape = await imageShape(args.sourceImageUrls[0])
  const options = args.sourceImageUrls.length > 1
    ? [{ id: 'documentary-multi-image', label: 'تكوين وثائقي متعدد الصور', direction: 'Use every supplied photo as a separate, intact documentary image within one coherent editorial composition. Do not blend faces, combine bodies, replace people, or synthesize a new pose. Choose a balanced grid, staggered gallery, or layered photo essay based on the photos\' natural orientations.' }]
    : TEMPLATES[shape]
  const template = options[hash(args.variantKey) % options.length]
  return [
    `EDITORIAL TEMPLATE PREFLIGHT — selected template: ${template.label} (${template.id}).`,
    template.direction,
    'REFERENCE PHOTO LOCK — treat the supplied image as an authentic editorial photograph, not inspiration for a new portrait. Preserve the real people, clothing, pose, and setting faithfully. Integrate it naturally into the selected template; let the layout adapt to the photograph, never force the photograph to change for the layout.',
  ].join('\n')
}
