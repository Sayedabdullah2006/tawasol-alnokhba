'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { calculatePrice, type PriceBreakdown } from '@/lib/pricing-engine'
import { useCategories, useExtras, type DBCategory } from '@/lib/hooks'
import WizardProgress from './WizardProgress'
import WizardFooter from './WizardFooter'
import StepInfluencer, { type Influencer } from './StepInfluencer'
import Step1Category from './Step1Category'
import StepSubOption from './StepSubOption'
import Step2Scope from './Step2Scope'
import Step3Images from './Step3Images'
import Step4Extras from './Step4Extras'
import Step5Posts from './Step5Posts'
import Step6Result from './Step6Result'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

type StepId = 'influencer' | 'category' | 'subOption' | 'scope' | 'images' | 'extras' | 'posts' | 'result'

export default function PricingWizard() {
  const router = useRouter()
  const { categories, loading: catsLoading } = useCategories()
  const { extras: dbExtras, loading: extrasLoading } = useExtras()
  const [stepIndex, setStepIndex] = useState(0)
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [loading, setLoading] = useState(true)
  const [pricingConfig, setPricingConfig] = useState<any>(null)

  const [selectedInfluencer, setSelectedInfluencer] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [subOption, setSubOption] = useState<string | null>(null)
  const [scope, setScope] = useState<'single' | 'all' | null>(null)
  const [images, setImages] = useState<'one' | 'multi' | null>(null)
  const [extras, setExtras] = useState<string[]>([])
  const [numPosts, setNumPosts] = useState(1)
  const [breakdown, setBreakdown] = useState<PriceBreakdown | null>(null)

  const selectedCat: DBCategory | null = categories.find(c => c.id === category) ?? null
  const needsSubOption = selectedCat?.has_sub_option && selectedCat?.sub_options?.length

  const steps: StepId[] = useMemo(() => {
    const base: StepId[] = ['influencer', 'category']
    if (needsSubOption) base.push('subOption')
    base.push('scope', 'images', 'extras', 'posts', 'result')
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
  }, [])

  // Load pricing config when influencer changes
  useEffect(() => {
    if (!selectedInfluencer) return
    const supabase = createClient()
    supabase.from('pricing_config').select('*').eq('influencer_id', selectedInfluencer).single()
      .then(({ data }) => { if (data) setPricingConfig(data) })
  }, [selectedInfluencer])

  const selectedInf = influencers.find(i => i.id === selectedInfluencer) ?? null

  const toggleExtra = (id: string) => {
    setExtras(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id])
  }

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'influencer': return selectedInfluencer !== null
      case 'category': return category !== null
      case 'subOption': return subOption !== null
      case 'scope': return scope !== null
      case 'images': return images !== null
      case 'extras': return true
      case 'posts': return numPosts >= 1
      default: return true
    }
  }

  const goNext = () => {
    if (steps[stepIndex + 1] === 'result') {
      const result = calculatePrice({
        category: category!, subOption,
        scope: scope!, images: images!,
        extras, numPosts,
        influencerPriceMultiplier: selectedInf?.price_multiplier ?? 1.0,
      })
      setBreakdown(result)
    }
    if (stepIndex < totalSteps - 1) setStepIndex(stepIndex + 1)
  }

  const goBack = () => { if (stepIndex > 0) setStepIndex(stepIndex - 1) }

  const goToRequest = () => {
    const params = new URLSearchParams({
      influencer: selectedInfluencer ?? '', category: category ?? '',
      subOption: subOption ?? '', scope: scope ?? '', images: images ?? '',
      extras: extras.join(','), numPosts: numPosts.toString(),
    })
    router.push(`/request?${params.toString()}`)
  }

  if (loading || catsLoading || extrasLoading) return <LoadingSpinner size="lg" />

  return (
    <div className="flex flex-col bg-cream">
      <div className="max-w-3xl mx-auto w-full px-4 pt-6 flex-1 flex flex-col">
        <WizardProgress current={stepIndex + 1} total={totalSteps} />

        <div className="flex-1 py-4">
          {currentStep === 'influencer' && (
            <StepInfluencer influencers={influencers} selected={selectedInfluencer} onSelect={setSelectedInfluencer} />
          )}
          {currentStep === 'category' && (
            <Step1Category selected={category} onSelect={(id) => { setCategory(id); setSubOption(null) }} categories={categories} />
          )}
          {currentStep === 'subOption' && selectedCat && (
            <StepSubOption category={selectedCat} selected={subOption} onSelect={setSubOption} />
          )}
          {currentStep === 'scope' && (
            <Step2Scope selected={scope} onSelect={setScope} influencer={selectedInf} />
          )}
          {currentStep === 'images' && (
            <Step3Images selected={images} onSelect={setImages} />
          )}
          {currentStep === 'extras' && (
            <Step4Extras selected={extras} onToggle={toggleExtra} category={category} extras={dbExtras} pricingExtras={pricingConfig?.extras_prices} />
          )}
          {currentStep === 'posts' && (
            <Step5Posts count={numPosts} onChange={setNumPosts} />
          )}
          {currentStep === 'result' && breakdown && (
            <Step6Result breakdown={breakdown} scope={scope!} images={images!} numPosts={numPosts} extrasCount={extras.length} influencer={selectedInf} />
          )}
        </div>

        {currentStep !== 'result' ? (
          <WizardFooter onNext={goNext} onBack={stepIndex > 0 ? goBack : undefined}
            onSkip={currentStep === 'extras' ? goNext : undefined} showSkip={currentStep === 'extras'}
            showBack={stepIndex > 0} nextDisabled={!canProceed()} />
        ) : (
          <div className="sticky bottom-0 bg-card/95 backdrop-blur-md border-t border-border px-4 py-3 flex items-center gap-3">
            <button onClick={() => setStepIndex(0)} className="px-6 py-3 rounded-xl border-2 border-border text-dark font-medium hover:border-green transition-all cursor-pointer min-h-[48px]">
              → إعادة الحساب
            </button>
            <div className="flex-1" />
            <button onClick={goToRequest} className="px-6 py-3 rounded-xl bg-green text-white font-bold hover:bg-green/90 transition-all cursor-pointer min-h-[48px]">
              تقديم الطلب بهذا السعر ←
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
