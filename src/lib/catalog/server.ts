import { createServiceRoleClient } from '../supabase-server'
import { CatalogError, type PublishedCatalog, validateCatalog } from './model'
/** No process cache or static fallback: every quote reads one complete published revision. */
export async function getPublishedCatalog():Promise<PublishedCatalog>{
 const db=await createServiceRoleClient()
 const {data,error}=await db.rpc('individual_catalog_read')
 if(error||!data)throw new CatalogError('CATALOG_UNAVAILABLE',503)
 return {...validateCatalog(data.document),version:data.version,published_at:data.published_at}
}
