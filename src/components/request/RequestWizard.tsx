'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useCategories, type DBCategory } from '@/lib/hooks'
import { useToast } from '@/components/ui/Toast'
import WizardProgress from '@/components/pricing/WizardProgress'
import WizardFooter from '@/components/pricing/WizardFooter'
import StepInfluencer, { type Influencer } from '@/components/pricing/StepInfluencer'
import RStep1ClientType, { type ClientType } from './RStep1ClientType'
import Step1Category from '@/components/pricing/Step1Category'
import StepSubOption from '@/components/pricing/StepSubOption'
import RStep3Details from './RStep3Details'
import RStepChannels from './RStepChannels'
import RStep5Contact, { type ContactData } from './RStep5Contact'
import RStep6Terms from './RStep6Terms'
import { validateEmail } from '@/lib/email-validation'
import SuccessScreen from './SuccessScreen'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'

type StepId = 'influencer' | 'clientType' | 'category' | 'subOption' | 'details' | 'channels' | 'contact' | 'terms' | 'confirm'

const CHANNEL_LABELS: Record<string, string> = {
  x: 'X',
  ig: 'Instagram',
  li: 'LinkedIn',
  tk: 'TikTok',
}

export default function RequestWizard() {
  const { showToast } = useToast()
  const { categories, loading: catsLoading } = useCategories()
  const [stepIndex, setStepIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [requestNumber, setRequestNumber] = useState('')
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [loading, setLoading] = useState(true)

  // Step data
  const [selectedInfluencer, setSelectedInfluencer] = useState<string | null>(null)
  const [clientType, setClientType] = useState<ClientType | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [subOption, setSubOption] = useState<string | null>(null)
  const [details, setDetails] = useState({ title: '', content: '', link: '', hashtags: '', preferredDate: '', images: [] as string[] })
  const [channels, setChannels] = useState<string[]>([])
  const [contact, setContact] = useState<ContactData>({ fullName: '', phone: '', email: '', city: '', xHandle: '' })
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)

  const selectedCat: DBCategory | null = categories.find(c => c.id === category) ?? null
  const needsSubOption = selectedCat?.has_sub_option && selectedCat?.sub_options?.length

  const steps: StepId[] = useMemo(() => {
    const base: StepId[] = ['influencer', 'clientType', 'category']
    if (needsSubOption) base.push('subOption')
    base.push('details', 'channels', 'contact', 'terms', 'confirm')
    return base
  }, [needsSubOption])

  const currentStep = steps[stepIndex]
  const totalSteps = steps.length

  useEffect(() => {
    const supabase = createClient()

    supabase.from('influencers').select('*').eq('is_active', true).then(({ data }) => {
      setInfluencers((data as Influencer[]) ?? [])
      setLoading(false)
    })

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data: profile }) => {
          if (profile) {
            setContact(prev => ({
              fullName: profile.full_name || prev.fullName,
              phone: profile.phone || prev.phone,
              email: user.email || prev.email,
              city: profile.city || prev.city,
              xHandle: profile.x_handle || prev.xHandle,
            }))
          }
        })
      }
    })
  }, [])

  const selectedInf = influencers.find(i => i.id === selectedInfluencer) ?? null

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'influencer': return selectedInfluencer !== null
      case 'clientType': return clientType !== null
      case 'category': return category !== null
      case 'subOption': return subOption !== null
      case 'details': return details.title.trim() !== '' && details.content.trim() !== ''
      case 'channels': return channels.length > 0
      case 'contact': return contact.fullName.trim() !== ''
        && contact.phone.trim() !== ''
        && validateEmail(contact.email).valid
      case 'terms': return termsAccepted && privacyAccepted
      case 'confirm': return true
      default: return true
    }
  }

  const goNext = () => { if (stepIndex < totalSteps - 1) setStepIndex(stepIndex + 1) }
  const goBack = () => { if (stepIndex > 0) setStepIndex(stepIndex - 1) }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/submit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          influencer_id: selectedInfluencer,
          client_type: clientType,
          category, sub_option: subOption,
          title: details.title, content: details.content,
          link: details.link || null, hashtags: details.hashtags || null,
          preferred_date: details.preferredDate || null,
          content_images: details.images,
          client_name: contact.fullName, client_phone: contact.phone,
          client_email: contact.email, client_city: contact.city || null,
          x_handle: contact.xHandle || null,
          channels,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'حدث خطأ')

      setRequestNumber(data.requestNumber)
      setSuccess(true)
      showToast('تم إرسال طلبك بنجاح!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء إرسال الطلب'
      showToast(msg, 'error')
    } finally { setSubmitting(false) }
  }

  if (loading || catsLoading) return <LoadingSpinner size="lg" />
  if (success) return <SuccessScreen requestNumber={requestNumber} />

  return (
    <div className="flex flex-col bg-cream">
      <div className="max-w-3xl mx-auto w-full px-4 pt-6 flex-1 flex flex-col">
        <WizardProgress current={stepIndex + 1} total={totalSteps} />

        <div className="flex-1 py-4">
          {currentStep === 'influencer' && (
            <StepInfluencer influencers={influencers} selected={selectedInfluencer} onSelect={setSelectedInfluencer} />
          )}
          {currentStep === 'clientType' && (
            <RStep1ClientType selected={clientType} onSelect={(v) => { if (clientType !== v) { setCategory(null); setSubOption(null) }; setClientType(v) }} />
          )}
          {currentStep === 'category' && (
            <Step1Category selected={category} onSelect={(id) => { setCategory(id); setSubOption(null) }} categories={categories} clientType={clientType} />
          )}
          {currentStep === 'subOption' && selectedCat && (
            <StepSubOption category={selectedCat} selected={subOption} onSelect={setSubOption} />
          )}
          {currentStep === 'details' && (
            <RStep3Details data={details} onChange={setDetails} />
          )}
          {currentStep === 'channels' && (
            <RStepChannels
              influencer={selectedInf}
              selected={channels}
              onToggle={(id) => setChannels(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
            />
          )}
          {currentStep === 'contact' && (
            <RStep5Contact data={contact} onChange={setContact} />
          )}
          {currentStep === 'terms' && (
            <RStep6Terms termsAccepted={termsAccepted} privacyAccepted={privacyAccepted} onTermsChange={setTermsAccepted} onPrivacyChange={setPrivacyAccepted} />
          )}
          {currentStep === 'confirm' && (
            <div className="wizard-enter max-w-lg mx-auto space-y-6">
              <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">تأكيد وإرسال الطلب</h2>
              <p className="text-sm text-muted text-center">راجع ملخص طلبك — سيُراجع من قبل فريق تواصل النخبة وستصلك التسعيرة لاحقاً</p>
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="p-5 space-y-3 text-sm">
                  {selectedInf && <div className="flex justify-between"><span className="text-muted">المؤثر:</span><span className="font-medium">{selectedInf.name_ar}</span></div>}
                  <div className="flex justify-between"><span className="text-muted">الفئة:</span><span className="font-medium">{selectedCat?.name_ar}</span></div>
                  <div className="flex justify-between"><span className="text-muted">القنوات:</span><span className="font-medium">{channels.map(c => CHANNEL_LABELS[c] ?? c).join('، ')}</span></div>
                  <div className="border-t border-border pt-3 mt-3">
                    <div className="flex justify-between"><span className="text-muted">عنوان الخبر:</span><span className="font-medium">{details.title}</span></div>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
                <div className="text-2xl mb-2">📋</div>
                <p className="font-bold text-blue-700 text-sm">سيتم مراجعة طلبك من قبل فريق تواصل النخبة</p>
              </div>
            </div>
          )}
        </div>

        {currentStep !== 'confirm' ? (
          <WizardFooter onNext={goNext} onBack={stepIndex > 0 ? goBack : undefined}
            showBack={stepIndex > 0} nextDisabled={!canProceed()} />
        ) : (
          <div className="sticky bottom-0 bg-card/95 backdrop-blur-md border-t border-border px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" onClick={goBack}>→ رجوع</Button>
            <div className="flex-1" />
            <Button onClick={handleSubmit} disabled={submitting} loading={submitting}>
              {submitting ? 'جارٍ إرسال طلبك...' : 'إرسال الطلب نهائياً'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
