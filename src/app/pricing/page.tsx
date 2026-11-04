import {getPublishedCatalog} from '@/lib/catalog/server'
import IndividualPricing from '@/components/pricing/IndividualPricing'
export const dynamic='force-dynamic'
export const metadata={title:'الأسعار | تواصل النخبة'}
export default async function PricingPage(){
  const initial=await getPublishedCatalog().catch(()=>null)
  return <IndividualPricing initial={initial}/>
}
