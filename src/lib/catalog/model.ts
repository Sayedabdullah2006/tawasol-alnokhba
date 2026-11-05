import { CATEGORIES, EXTRAS } from '../constants'
import { parseSubOption } from '../auto-quote'
import { packagePrice, type IndividualPackage, type IndividualPackageId } from '../individual-packages'
export interface ManagedPackage extends IndividualPackage { enabled: boolean }
export interface NewsRate { key: string; label: string; category: string; sub_option: string | { subcategory: string; position: string } | null; price: number }
export interface CatalogExtra { id: string; name: string; price: number; enabled: boolean }
export interface CatalogDocument { packages: ManagedPackage[]; newsRates: NewsRate[]; extras: CatalogExtra[] }
export interface PublishedCatalog extends CatalogDocument { version: string; published_at: string }
export const PACKAGE_IDS: IndividualPackageId[] = ['v2_basic','v2_reach','v2_presence','v2_elite','v2_career']
export const CHANNEL_IDS = ['x','li','ig','tk']
export const EXTRA_IDS = EXTRAS.filter(e=>!['website','media','plan'].includes(e.id)).map(e=>e.id)
export class CatalogError extends Error { constructor(public code: string, public status=400){super(code)} }
function fail(field:string):never{throw new CatalogError(`INVALID_CATALOG:${field}`)}
function record(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))fail('object');return v as Record<string,unknown>}
function str(v:unknown,field:string,max=200){if(typeof v!=='string'||!v.trim()||v.length>max)fail(field);return v.trim()}
function bool(v:unknown,field:string){if(typeof v!=='boolean')fail(field);return v as boolean}
function amount(v:unknown,field:string,positive=false){if(typeof v!=='number'||!Number.isFinite(v)||v< (positive ? .01 : 0)||v>1000000||Math.abs(v*100-Math.round(v*100))>.00001)fail(field);return v as number}
export function newsRateDefinitions():Omit<NewsRate,'price'>[]{
 const rows:Omit<NewsRate,'price'>[]=CATEGORIES.filter(c=>c.id!=='Others'&&!c.hasSubOption&&(!c.clientTypes||c.clientTypes.includes('individual'))).map(c=>({key:c.id,label:c.nameAr,category:c.id,sub_option:null}))
 for(const [id,label]of [['with_patent','ببراءة اختراع'],['no_patent','دون براءة اختراع']])rows.push({key:`inventions:${id}`,label:`اختراعات ${label}`,category:'inventions',sub_option:id})
 const scopes={international:['first','second','third','top_10','top_50','participation'],local:['first','second','third','top_10','top_50','participation'],hackathon:['first','second','third','finalist','participation']}
 const labels:Record<string,string>={international:'دولية',local:'محلية',hackathon:'هاكاثون',first:'الأول',second:'الثاني',third:'الثالث',top_10:'أفضل 10',top_50:'أفضل 50',participation:'مشاركة',finalist:'متأهل نهائي'}
 for(const [scope,positions]of Object.entries(scopes))for(const position of positions)rows.push({key:`competitions:${scope}:${position}`,label:`مسابقات ${labels[scope]} ${labels[position]}`,category:'competitions',sub_option:{subcategory:scope,position}})
 return rows
}
export function newsPrice(catalog:CatalogDocument,category:string,sub:unknown=null){
 const parsed=parseSubOption(sub as string)
 const key=category==='competitions'&&parsed&&typeof parsed==='object'?`competitions:${parsed.subcategory}:${parsed.position}`:category==='inventions'?`inventions:${parsed}`:category
 const rate=catalog.newsRates.find(r=>r.key===key);if(!rate)throw new CatalogError('INVALID_CATEGORY');return rate.price
}
export function activePackages(catalog:CatalogDocument){return catalog.packages.filter(p=>p.enabled)}
export function packageStartingPrice(catalog:CatalogDocument,pkg:IndividualPackage){
 return Math.min(...catalog.newsRates.filter(r=>!pkg.requiredCategory||r.category===pkg.requiredCategory).map(r=>packagePrice(r.price,pkg,r.category)))
}
/** Reconstruct the document: derived features and compatibility flags cannot be forged. */
export function validateCatalog(input:unknown):CatalogDocument{
 const root=record(input);if(!Array.isArray(root.packages)||root.packages.length!==5)fail('packages')
 const keys=new Set<string>()
 const packages=root.packages.map(raw=>{
  const p=record(raw),id=str(p.id,'id') as IndividualPackageId;if(!PACKAGE_IDS.includes(id)||keys.has(id))fail('id');keys.add(id)
  const rawChannels=p.channels==null?undefined:p.channels; const channels=rawChannels as string[] | undefined;if(channels!==undefined&&(!Array.isArray(channels)||!channels.length||channels.length>4||channels.some(c=>!CHANNEL_IDS.includes(c))||new Set(channels).size!==channels.length))fail('channels')
  const count=Number(p.channelCount);if(!Number.isInteger(count)||count<1||count>4||(channels&&channels.length!==count))fail('channelCount')
  if(!Array.isArray(p.includedExtras)||p.includedExtras.some(e=>typeof e!=='string'||!EXTRA_IDS.includes(e))||new Set(p.includedExtras).size!==p.includedExtras.length)fail('includedExtras')
  if(!Array.isArray(p.benefits)||p.benefits.length>40)fail('benefits')
  const benefitKeys=new Set<string>();let outputs=0
  const benefits=p.benefits.map(v=>{const b=record(v);const bid=str(b.id,'benefit.id',64);if(!/^[a-z0-9_-]+$/.test(bid)||benefitKeys.has(bid))fail('benefit.id');benefitKeys.add(bid)
   const label=str(b.label,'benefit.label',150),value=str(b.value,'benefit.value',340),included=bool(b.included,'benefit.included');if(label.length+value.length>490)fail('benefit.length')
   const quantity=b.quantity==null?undefined:Number(b.quantity);if(quantity!==undefined&&(!Number.isInteger(quantity)||quantity<1||quantity>20))fail('benefit.quantity');if(included)outputs+=quantity??1
   return {id:bid,label,value,included,...(quantity!==undefined?{quantity}:{})}
  });if(outputs>100)fail('deliverable_count')
  const fixedPrice=p.fixedPrice==null?undefined:amount(p.fixedPrice,'fixedPrice',true)
  let categoryPrices:Record<string,number>|undefined
  if(p.categoryPrices!=null){
   const entries=Object.entries(record(p.categoryPrices))
   if(fixedPrice!==undefined&&entries.length)fail('categoryPrices.fixedPrice')
   const allowed=new Set(newsRateDefinitions().filter(r=>r.sub_option===null&&(id!=='v2_career'||r.category==='cv')).map(r=>r.category))
   categoryPrices=Object.fromEntries(entries.map(([category,price])=>{if(!allowed.has(category))fail('categoryPrices.category');return [category,amount(price,'categoryPrices.price',true)]}))
  }
  return {id,name:str(p.name,'name',80),blurb:str(p.blurb,'blurb',200),enabled:bool(p.enabled,'enabled'),surcharge:amount(p.surcharge,'surcharge'),...(fixedPrice!==undefined?{fixedPrice}:{}),...(categoryPrices&&Object.keys(categoryPrices).length?{categoryPrices}:{}),channelCount:count,...(channels?{channels:channels as ('x'|'li'|'ig'|'tk')[]}:{}),benefits,features:benefits.filter(b=>b.included).map(b=>`${b.label}: ${b.value}`),includedExtras:p.includedExtras as string[],allChannels:channels?.length===4,sponsoredCampaignBudget:amount(p.sponsoredCampaignBudget,'advertising'),highlighted:bool(p.highlighted??false,'highlighted'),...(id==='v2_career'?{requiredCategory:'cv'}:{}),priceMultiplier:1} satisfies ManagedPackage
 })
 if(!packages.some(p=>p.enabled))fail('enabled')
 const defs=newsRateDefinitions();if(!Array.isArray(root.newsRates)||root.newsRates.length!==defs.length)fail('newsRates')
 const newsRates=defs.map(def=>{const found=(root.newsRates as unknown[]).filter(r=>record(r).key===def.key);if(found.length!==1)fail('newsRate.key');return {...def,price:amount(record(found[0]).price,'newsRate.price',true)}})
 if(!Array.isArray(root.extras)||root.extras.length!==EXTRA_IDS.length)fail('extras')
 const extras=EXTRA_IDS.map(id=>{const found=(root.extras as unknown[]).filter(r=>record(r).id===id);if(found.length!==1)fail('extra.id');const e=record(found[0]);return {id,name:str(e.name,'extra.name',120),price:amount(e.price,'extra.price'),enabled:bool(e.enabled,'extra.enabled')}})
 for(const p of packages){if(p.sponsoredCampaignBudget>packageStartingPrice({packages,newsRates,extras},p))fail('advertising_exceeds_price')}
 return {packages,newsRates,extras}
}
