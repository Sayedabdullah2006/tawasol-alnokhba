/** One-time bootstrap only. Runtime prices always come from published database releases. */
import { INITIAL_SINGLE_PACKAGES } from './bootstrap'
import { EXTRAS } from '../constants'
import { calculateAutoQuote } from '../auto-quote'
import { EXTRA_IDS, newsRateDefinitions, validateCatalog } from './model'
export function initialCatalog(){return validateCatalog({
 packages:INITIAL_SINGLE_PACKAGES.map(p=>({...p,enabled:true,benefits:p.benefits.map(b=>({...b,...(b.id==='job_ads'?{quantity:5}:{})}))})),
 newsRates:newsRateDefinitions().map(r=>({...r,price:calculateAutoQuote({category:r.category,subOption:r.sub_option,selectedExtras:[]}).singleChannelBase})),
 extras:EXTRAS.filter(e=>EXTRA_IDS.includes(e.id)).map(e=>({id:e.id,name:e.nameAr,price:e.price,enabled:true})),
})}
