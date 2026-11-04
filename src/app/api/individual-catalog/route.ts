import {getPublishedCatalog} from '@/lib/catalog/server'
export const dynamic='force-dynamic'
export async function GET(){try{return Response.json({...await getPublishedCatalog(),money_unit:'SAR',refresh_seconds:60},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'CATALOG_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}})}}
