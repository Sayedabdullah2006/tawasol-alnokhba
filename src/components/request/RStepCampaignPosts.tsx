'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CATEGORY_CONDITIONS } from '@/lib/constants'
import type { DBCategory } from '@/lib/hooks'
import ContentImagesUploader from './ContentImagesUploader'

// ─── Types ───────────────────────────────────────────────────────

export interface CampaignPostData {
  category: string
  subOption: string | { subcategory: string; position: string } | null
  title: string
  content: string
  preferredDate: string
  images: string[]
  link: string
  hashtags: string
}

export function makeEmptyPost(): CampaignPostData {
  return {
    category: '', subOption: null, title: '', content: '',
    preferredDate: '', images: [], link: '', hashtags: '',
  }
}

// ─── Competition data ────────────────────────────────────────────

const COMP_SUBCATS = [
  { id: 'international', label: 'مسابقات دولية' },
  { id: 'local',         label: 'مسابقات محلية' },
  { id: 'hackathon',     label: 'هاكثون / برمجي' },
]

const COMP_POSITIONS: Record<string, { id: string; label: string }[]> = {
  international: [
    { id: 'first',         label: 'المركز الأول' },
    { id: 'second',        label: 'المركز الثاني' },
    { id: 'third',         label: 'المركز الثالث' },
    { id: 'top_10',        label: 'أفضل 10' },
    { id: 'top_50',        label: 'أفضل 50' },
    { id: 'participation', label: 'مشاركة' },
  ],
  local: [
    { id: 'first',         label: 'المركز الأول' },
    { id: 'second',        label: 'المركز الثاني' },
    { id: 'third',         label: 'المركز الثالث' },
    { id: 'top_10',        label: 'أفضل 10' },
    { id: 'top_50',        label: 'أفضل 50' },
    { id: 'participation', label: 'مشاركة' },
  ],
  hackathon: [
    { id: 'first',         label: 'المركز الأول' },
    { id: 'second',        label: 'المركز الثاني' },
    { id: 'third',         label: 'المركز الثالث' },
    { id: 'finalist',      label: 'وصلت للنهائي' },
    { id: 'participation', label: 'مشاركة' },
  ],
}

const INVENTION_OPTS = [
  { id: 'with_patent', label: 'ببراءة اختراع 📜' },
  { id: 'no_patent',   label: 'بدون براءة اختراع' },
]

// ─── Helper ──────────────────────────────────────────────────────

export function isPostComplete(post: CampaignPostData): boolean {
  if (!post.category) return false
  if (post.category === 'competitions') {
    const sub = post.subOption as { subcategory?: string; position?: string } | null
    if (!sub || typeof sub !== 'object' || !sub.subcategory || !sub.position) return false
  }
  if (post.category === 'inventions' && !post.subOption) return false
  return post.title.trim() !== '' && post.content.trim() !== ''
}

// ─── Single post card ─────────────────────────────────────────────

interface PostCardProps {
  index: number
  post: CampaignPostData
  onChange: (p: CampaignPostData) => void
  clientType: string | null
  categories: DBCategory[]
  isOpen: boolean
  onToggle: () => void
}

function PostCard({ index, post, onChange, clientType, categories, isOpen, onToggle }: PostCardProps) {
  const complete          = isPostComplete(post)
  const availableCategories = clientType
    ? categories.filter(c => !c.client_types || c.client_types.includes(clientType))
    : categories
  const catInfo           = availableCategories.find(c => c.id === post.category)
  const compSub   = (
    post.category === 'competitions' &&
    post.subOption !== null &&
    typeof post.subOption === 'object'
  ) ? (post.subOption as { subcategory: string; position: string }) : null

  const select = 'w-full rounded-xl border border-border bg-card p-2 text-sm text-dark'
  const input  = 'w-full rounded-xl border border-border bg-card p-2 text-sm text-dark placeholder:text-muted'
  const label  = 'block text-xs font-bold text-dark mb-1'

  return (
    <div className={cn(
      'rounded-2xl border-2 overflow-hidden transition-all',
      complete ? 'border-green/40' : 'border-border',
    )}>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/5 transition-colors text-right"
      >
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0',
          complete ? 'bg-green text-white' : 'bg-muted/20 text-muted',
        )}>
          {complete ? '✓' : index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-bold text-dark text-sm truncate">
            {post.title.trim() || `المنشور ${index + 1}`}
          </div>
          {catInfo && (
            <div className="text-xs text-muted">
              {catInfo.icon} {catInfo.name_ar}
            </div>
          )}
        </div>

        <span className="text-muted text-xs flex-shrink-0">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Body */}
      {isOpen && (
        <div className="p-4 bg-card/50 border-t border-border space-y-4">

          {/* الفئة */}
          <div>
            <label className={label}>الفئة *</label>
            <select
              value={post.category}
              onChange={e => onChange({ ...post, category: e.target.value, subOption: null })}
              className={select}
            >
              <option value="">— اختر الفئة —</option>
              {availableCategories.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name_ar}</option>
              ))}
            </select>
          </div>

          {/* مسابقات */}
          {post.category === 'competitions' && (
            <div className="space-y-3 bg-muted/5 rounded-xl p-3">
              <div>
                <label className={label}>نوع المسابقة *</label>
                <select
                  value={compSub?.subcategory ?? ''}
                  onChange={e => onChange({
                    ...post,
                    subOption: { subcategory: e.target.value, position: '' },
                  })}
                  className={select}
                >
                  <option value="">— اختر النوع —</option>
                  {COMP_SUBCATS.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              {compSub?.subcategory && (
                <div>
                  <label className={label}>المركز *</label>
                  <select
                    value={compSub.position ?? ''}
                    onChange={e => onChange({
                      ...post,
                      subOption: { subcategory: compSub!.subcategory, position: e.target.value },
                    })}
                    className={select}
                  >
                    <option value="">— اختر المركز —</option>
                    {(COMP_POSITIONS[compSub.subcategory] ?? []).map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* اختراعات */}
          {post.category === 'inventions' && (
            <div>
              <label className={label}>نوع الاختراع *</label>
              <div className="grid grid-cols-2 gap-2">
                {INVENTION_OPTS.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onChange({ ...post, subOption: o.id })}
                    className={cn(
                      'py-2 px-3 rounded-xl border-2 text-sm font-semibold transition-all',
                      post.subOption === o.id
                        ? 'border-green bg-green/10 text-green-700'
                        : 'border-border bg-card text-dark hover:border-green/40',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* العنوان */}
          <div>
            <label className={label}>العنوان *</label>
            <input
              type="text"
              value={post.title}
              onChange={e => onChange({ ...post, title: e.target.value })}
              placeholder="عنوان المنشور..."
              maxLength={200}
              className={input}
            />
          </div>

          {/* المحتوى */}
          <div>
            <label className={label}>المحتوى *</label>
            <textarea
              value={post.content}
              onChange={e => onChange({ ...post, content: e.target.value })}
              placeholder="تفاصيل ما تودّ نشره..."
              rows={3}
              className={cn(input, 'resize-none')}
            />
          </div>

          {/* شرط قبول هذا الخبر حسب فئته */}
          {post.category && CATEGORY_CONDITIONS[post.category] && (
            <p className="text-[11px] leading-5 text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              <span className="font-bold">⚠️ شرط الفئة:</span> {CATEGORY_CONDITIONS[post.category]}
              <br />كما يلزم إثبات أي «أوّلية» وموافقة أي جهة مذكورة، وإلا أُلغي الخبر.
            </p>
          )}

          {/* تاريخ النشر */}
          <div>
            <label className={label}>تاريخ النشر المفضل</label>
            <input
              type="date"
              value={post.preferredDate}
              onChange={e => onChange({ ...post, preferredDate: e.target.value })}
              className={input}
            />
          </div>

          {/* الصور */}
          <div>
            <label className={label}>صور المحتوى</label>
            <ContentImagesUploader
              images={post.images}
              onChange={imgs => onChange({ ...post, images: imgs })}
              maxImages={4}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────

interface Props {
  posts: CampaignPostData[]
  onChange: (posts: CampaignPostData[]) => void
  clientType: string | null
  categories: DBCategory[]
}

export default function RStepCampaignPosts({ posts, onChange, clientType, categories }: Props) {
  const [openIndex, setOpenIndex] = useState(0)

  const updatePost = (i: number, p: CampaignPostData) => {
    const next = [...posts]
    next[i] = p
    onChange(next)
  }

  const completedCount  = posts.filter(isPostComplete).length

  return (
    <div className="wizard-enter space-y-4 max-w-2xl mx-auto">
      <div className="text-center">
        <h2 className="text-xl md:text-2xl font-black text-dark mb-1">
          تفاصيل المنشورات
        </h2>
        <p className="text-sm text-muted">
          اكتمل <span className="font-bold text-dark">{completedCount}</span> من{' '}
          <span className="font-bold text-dark">{posts.length}</span> منشور
        </p>
      </div>

      {/* بطاقات المنشورات */}
      <div className="space-y-3">
        {posts.map((post, i) => (
          <PostCard
            key={i}
            index={i}
            post={post}
            onChange={p => updatePost(i, p)}
            clientType={clientType}
            categories={categories}
            isOpen={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
          />
        ))}
      </div>

      {completedCount === posts.length && posts.length > 0 && (
        <div className="bg-green/5 border border-green/20 rounded-xl px-4 py-3 text-center text-sm text-green-700 wizard-enter">
          ✓ جميع المنشورات مكتملة — يمكنك المتابعة
        </div>
      )}
    </div>
  )
}
