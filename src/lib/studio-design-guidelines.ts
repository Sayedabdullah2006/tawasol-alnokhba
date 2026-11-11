/** Approved v3 identity shared by every image-generation entry point. */
export { STUDIO_FACT_RULES, STUDIO_EDITORIAL_VOICE, STUDIO_BRAND_RULES, STUDIO_NEWS_LAYOUT_RULES, STUDIO_LOGO_RESERVATION, FACE_LOCK, PRINT_BOUNDARY, STUDIO_RENDER_CONTRACT } from './studio-reference-prompts'
import { STUDIO_BRAND_RULES, FACE_LOCK } from './studio-reference-prompts'

export const STUDIO_DESIGN_DIRECTIONS = [
  {
    "title": "اتجاه تحريري من الخبر",
    "mood": "يتحدد من المصدر",
    "brief": "بديل مرن يستنتج المعالجة من نوع الخبر والصورة الفعلية، مع الاسم أعلى ثم خبر مترابط ثم رقم موثق واحد إن وجد؛ الصورة 60% على الأقل والتفاصيل للتغريدة. يدمج النموذج الصورة الأصلية داخل التكوين ويحفظ الشخص دون تغيير. لا تصنيف أو رقم أو لوحة ثابتة مفروضة."
  },
  {
    "title": "اتجاه بصري مكمّل",
    "mood": "يتحدد من القصة",
    "brief": "بديل ثان يغيّر التكوين وحجم الصورة وأدوار الألوان عن الأول مع تسلسل القراءة نفسه. المعلومات المتاحة والصورة تحكمان التصميم، ولا تُلصق صورة منفصلة بعد توليد الخلفية."
  },
  {
    "title": "اتجاه معلوماتي مناسب",
    "mood": "يتحدد من المحتوى",
    "brief": "بديل ثالث يكيف المساحات والفراغ وأدوار ألوان الهوية مع صورة مهيمنة 60% على الأقل. الاسم ثم سطر إنجاز واحد ثم رقم مفيد واحد، دون بطاقات تفاصيل أو اختلاق معلومات."
  }
]

/** Campaigns, education and reports retain their own content structure. */
export const STUDIO_EDITORIAL_DESIGN_RULES = [STUDIO_BRAND_RULES, FACE_LOCK].join('\n\n')

/** Keep the prompt and digital compositor on the same geometry for all formats. */
export function studioFooterHeight(width: number, height: number): number {
  return Math.round(height * (width > height ? 0.16 : 145 / 1350))
}

export function studioFooterReservation(width = 1080, height = 1350): string {
  const top = height - studioFooterHeight(width, height)
  return 'ORIGINAL DIGITAL FOOTER: Keep y=' + top + '..' + height + ' of the ' + width + '×' + height + ' canvas flat ivory #FCFAF3 and completely empty of generated text, people, icons, logos, handles and placeholders. End main content above this strip with a small breathing gap. The exact original First1Saudi SVG logo, any original campaign logos, and the actual social icons plus First1Saudi are added digitally afterward. Never place words under the logo. Do not reserve a full-height right strip. This footer is geometry only; preserve the content format specified by the caller.'
}

export const STUDIO_NO_SOURCE_IMAGE_RULES = 'NO SOURCE PHOTO: if no source photo is supplied, create a typography-led design using verified text, small topic/fact icons, abstract geometric decoration and the required branded footer ONLY. NEVER a fake human face; no invented person, portrait, silhouette, stock photo, realistic scene, venue, laboratory, landscape, product, invention or illustrative replacement hero. Do not infer an image from a name, news text, old concept, template or editing note. This rule overrides all photographic or scenic creative directions when there is no source photo.'

export const STUDIO_EXCLUDED_EMBLEM_RULE = 'PERMANENT EXCLUSION: never generate, approximate or introduce the Saudi national emblem (crossed swords and palm tree / السيفين والنخلة) anywhere in the artwork, background, decoration, badges or topic icons; no stylized substitutes or emblem-like silhouettes. The excluded national emblem must appear nowhere in the generated design.'
