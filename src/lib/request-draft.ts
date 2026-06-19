// مفتاح مسودة نموذج الطلب في localStorage + محوّل من صف طلب في القاعدة إلى مسودة
// النموذج — يُستخدم في «تعديل الطلب» لإعادة فتح النموذج معبّأً ببيانات الطلب القديم.

export const DRAFT_KEY = 'tn_request_draft_v1'

// محاولة تحويل قيمة sub_option المخزّنة (قد تكون نصاً أو JSON كائن المسابقة)
function parseMaybeJson(v: unknown): unknown {
  if (v && typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
    try { return JSON.parse(v) } catch { return v }
  }
  return v
}

// يبني كائن المسودة الذي يتوقّعه RequestWizard من صف الطلب في القاعدة.
// best-effort: الحقول المفقودة تأخذ قيماً افتراضية آمنة.
export function requestToDraft(r: Record<string, any>): Record<string, unknown> {
  const isCompetition = r.category === 'competitions'
  const subOptionRaw = parseMaybeJson(r.sub_option)

  const campaignPosts = Array.isArray(r.campaign_posts)
    ? r.campaign_posts.map((p: Record<string, any>) => ({
        category: p.category ?? '',
        subOption: parseMaybeJson(p.sub_option) ?? null,
        title: p.title ?? '',
        content: p.content ?? '',
        preferredDate: p.preferred_date ?? '',
        images: Array.isArray(p.images) ? p.images : [],
        link: p.link ?? '',
        hashtags: p.hashtags ?? '',
      }))
    : []

  return {
    savedAt: Date.now(),
    selectedInfluencer: r.influencer_id ?? null,
    requestType: r.request_type ?? 'single',
    clientType: r.client_type ?? null,
    category: isCompetition ? 'competitions' : (r.category ?? null),
    subOption: isCompetition ? null : (typeof subOptionRaw === 'string' ? subOptionRaw : null),
    competitionSelection: isCompetition && subOptionRaw && typeof subOptionRaw === 'object'
      ? subOptionRaw
      : null,
    details: {
      title: r.title ?? '',
      content: r.content ?? '',
      link: r.link ?? '',
      hashtags: r.hashtags ?? '',
      preferredDate: r.preferred_date ?? '',
      images: Array.isArray(r.content_images) ? r.content_images : [],
    },
    channels: Array.isArray(r.channels) ? r.channels : [],
    orgInfo: {
      name: r.org_name ?? '',
      representative: r.org_representative ?? '',
      license: r.org_license ?? '',
    },
    campaignSetup: {
      postCount: r.campaign_post_count ?? 2,
      duration: r.campaign_duration ?? '',
    },
    campaignPosts,
    selectedPackage: r.selected_package ?? null,
    basicChannel: r.basic_channel ?? null,
  }
}
