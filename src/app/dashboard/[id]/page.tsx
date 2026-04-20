'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/constants'
import { formatNumber, formatDate, formatNumberShort, generateRequestNumber } from '@/lib/utils'
import StatusBadge from '@/components/dashboard/StatusBadge'
import QuoteApproval from '@/components/dashboard/QuoteApproval'
import EditableExtras from '@/components/dashboard/EditableExtras'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [request, setRequest] = useState<any>(null)
  const [influencer, setInfluencer] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('publish_requests')
        .select('*')
        .eq('id', id)
        .single()

      if (!data) { router.push('/dashboard'); return }
      setRequest(data)

      if (data.influencer_id) {
        const { data: inf } = await supabase
          .from('influencers').select('*').eq('id', data.influencer_id).single()
        setInfluencer(inf)
      }

      setLoading(false)
    }
    load()
  }, [id, router, supabase])

  if (loading) return <LoadingSpinner size="lg" />
  if (!request) return null

  const cat = CATEGORIES.find(c => c.id === request.category)
  const scope: 'single' | 'all' = request.scope === 'all' ? 'all' : 'single'
  // Treat legacy approved requests with an uploaded receipt as payment_review
  const effectiveStatus: string = (request.status === 'approved' && request.receipt_url)
    ? 'payment_review'
    : request.status

  return (
    <div>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-green hover:underline mb-4 block">
          → العودة للطلبات
        </Link>

        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-dark">
                طلب {generateRequestNumber(request.request_number)}
              </h1>
              <p className="text-sm text-muted">{formatDate(request.created_at)}</p>
            </div>
            <StatusBadge status={effectiveStatus} />
          </div>

          <div className="p-5 space-y-4">
            {/* Content — always visible */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted block">الفئة</span>
                <span className="font-medium">{cat?.icon} {cat?.nameAr ?? request.category}</span>
              </div>
              {request.preferred_date && (
                <div>
                  <span className="text-muted block">التاريخ المفضل</span>
                  <span className="font-medium">{formatDate(request.preferred_date)}</span>
                </div>
              )}
              {Array.isArray(request.channels) && request.channels.length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted block">القنوات</span>
                  <span className="font-medium">
                    {request.channels.map((c: string) => ({ x: 'X', ig: 'Instagram', li: 'LinkedIn', tk: 'TikTok' } as Record<string, string>)[c] ?? c).join('، ')}
                  </span>
                </div>
              )}
            </div>

            <div>
              <span className="text-muted text-sm block mb-1">عنوان الخبر</span>
              <p className="font-medium text-dark">{request.title}</p>
            </div>

            <div>
              <span className="text-muted text-sm block mb-1">المحتوى</span>
              <p className="text-dark text-sm whitespace-pre-line bg-cream rounded-xl p-3">
                {request.content}
              </p>
            </div>

            {Array.isArray(request.content_images) && request.content_images.length > 0 && (
              <div>
                <span className="text-muted text-sm block mb-2">الصور المرفقة</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {request.content_images.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="aspect-square rounded-xl overflow-hidden border border-border hover:border-green/40 transition-colors block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {request.link && (
              <div>
                <span className="text-muted text-sm block mb-1">الرابط</span>
                <a href={request.link} target="_blank" rel="noopener noreferrer"
                   className="text-green text-sm hover:underline break-all" dir="ltr">
                  {request.link}
                </a>
              </div>
            )}

            {request.hashtags && (
              <div>
                <span className="text-muted text-sm block mb-1">الهاشتاقات</span>
                <p className="text-dark text-sm">{request.hashtags}</p>
              </div>
            )}
          </div>
        </div>

        {/* Status-specific sections BELOW content */}

        {request.status === 'pending' && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
            <div className="text-2xl mb-2">⏳</div>
            <p className="font-bold text-yellow-700 text-sm">طلبك قيد المراجعة</p>
            <p className="text-xs text-yellow-600 mt-1">ستصلك التسعيرة مع خيارات الخدمات الإضافية فور موافقة الإدارة على المحتوى</p>
          </div>
        )}

        {request.status === 'quoted' && request.admin_quoted_price != null && (
          <div className="mt-4">
            <QuoteApproval
              requestId={request.id}
              quotedPrice={Number(request.admin_quoted_price)}
              offeredExtras={request.admin_offered_extras ?? []}
              influencer={influencer}
              scope={scope}
              adminNotes={request.admin_notes}
            />
          </div>
        )}

        {effectiveStatus === 'approved' && request.admin_quoted_price != null && (
          <div className="mt-4 space-y-4">
            <EditableExtras
              requestId={request.id}
              category={request.category}
              basePrice={Number(request.admin_quoted_price)}
              initialSelected={(request.user_selected_extras ?? []) as string[]}
              offered={(request.admin_offered_extras ?? []) as { id: string; name: string; price: number; reachBoost: number }[]}
              influencer={influencer}
              scope={scope}
              onUpdated={(newTotal, newReach, newSelected) => {
                setRequest((prev: any) => ({
                  ...prev,
                  final_total: newTotal,
                  estimated_reach: newReach,
                  user_selected_extras: newSelected,
                }))
              }}
            />
            <Button onClick={() => router.push(`/payment/${request.id}`)} className="w-full" size="lg">
              الانتقال للدفع — {formatNumber(request.final_total ?? request.admin_quoted_price)} ر.س
            </Button>
          </div>
        )}

        {effectiveStatus === 'payment_review' && (
          <div className="mt-4 bg-orange-50 border border-orange-200 rounded-2xl p-5 text-center">
            <div className="text-3xl mb-2">⏳</div>
            <p className="font-bold text-orange-700 text-sm">تم استلام إيصال التحويل</p>
            <p className="text-xs text-orange-600 mt-1">الإدارة تتحقق من التحويل البنكي وستحدّث الحالة قريباً</p>
          </div>
        )}

        {['payment_review', 'paid', 'in_progress', 'completed'].includes(effectiveStatus) && request.final_total != null && (
          <div className="mt-4 bg-card rounded-2xl border border-border p-5 space-y-2 text-sm">
            <h3 className="font-bold text-dark mb-2">تفصيل التسعيرة المعتمدة</h3>
            <div className="flex justify-between">
              <span className="text-muted">السعر الرئيسي</span>
              <span>{formatNumber(request.admin_quoted_price ?? 0)} ر.س</span>
            </div>
            {request.extras_selected_total > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">خدمات إضافية</span>
                <span>+{formatNumber(request.extras_selected_total)} ر.س</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 mt-2 font-bold">
              <span>الإجمالي</span>
              <span className="text-gold text-lg">{formatNumber(request.final_total)} ر.س</span>
            </div>
            {request.estimated_reach > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted">الوصول المتوقع</span>
                <span className="font-bold text-green">{formatNumberShort(request.estimated_reach)} متابع</span>
              </div>
            )}
          </div>
        )}

        {request.status === 'rejected' && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-5 space-y-2">
            <div className="text-center">
              <div className="text-3xl mb-1">❌</div>
              <p className="font-bold text-red-700">تم رفض الطلب</p>
            </div>
            {request.admin_notes && (
              <div className="bg-white/60 rounded-xl p-3 mt-3">
                <p className="text-xs font-bold text-red-700 mb-1">سبب الرفض من الإدارة:</p>
                <p className="text-sm text-red-700 whitespace-pre-line">{request.admin_notes}</p>
              </div>
            )}
          </div>
        )}

        {request.admin_notes && request.status !== 'quoted' && request.status !== 'rejected' && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3">
            <span className="text-sm font-bold text-blue-700 block mb-1">ملاحظات الإدارة</span>
            <p className="text-sm text-blue-600">{request.admin_notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
