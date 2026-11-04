import {createServerSupabaseClient,createServiceRoleClient} from '@/lib/supabase-server'
import {CatalogError,validateCatalog} from '@/lib/catalog/model'
export const dynamic='force-dynamic'
async function authorize(request:Request){
 const userDb=await createServerSupabaseClient();const {data:{user}}=await userDb.auth.getUser();if(!user)throw new CatalogError('UNAUTHORIZED',401)
 const {data}=await userDb.from('profiles').select('role').eq('id',user.id).single();if(data?.role!=='admin')throw new CatalogError('FORBIDDEN',403)
 if(request.method==='POST'){
  const origin=request.headers.get('origin'),configured=process.env.CATALOG_ADMIN_ORIGIN??process.env.NEXT_PUBLIC_SITE_URL??'https://nukhba.media'
  if(!origin||origin!==new URL(configured).origin||!request.headers.get('content-type')?.startsWith('application/json'))throw new CatalogError('INVALID_ORIGIN',403)
 }
 return {db:await createServiceRoleClient(),user}
}
export async function GET(request:Request){try{
 const {db}=await authorize(request)
 const {data:state,error}=await db.from('individual_catalog_state').select('*').eq('id',true).single();if(error)throw new CatalogError('CATALOG_UNAVAILABLE',503)
 const {data:releases,error:listError}=await db.from('individual_catalog_releases').select('id,version,published_at,published_by').order('published_at',{ascending:false}).limit(30);if(listError)throw new CatalogError('CATALOG_UNAVAILABLE',503)
 return Response.json({draft:state.draft,revision:state.revision,published_release_id:state.published_release_id,releases},{headers:{'Cache-Control':'no-store'}})
}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 const {db,user}=await authorize(request)
 if(Number(request.headers.get('content-length')??0)>262144)throw new CatalogError('BODY_TOO_LARGE',413)
 const raw=await request.text();if(raw.length>262144)throw new CatalogError('BODY_TOO_LARGE',413)
 let body;try{body=JSON.parse(raw)}catch{throw new CatalogError('INVALID_JSON')}
 if(!Number.isSafeInteger(body.expected_revision)||body.expected_revision<1)throw new CatalogError('INVALID_REVISION')
 let result
 if(body.action==='save'||body.action==='restore'){
  let document=body.document
  if(body.action==='restore'){
   const {data,error}=await db.from('individual_catalog_releases').select('document').eq('id',body.release_id).single();if(error||!data)throw new CatalogError('RELEASE_NOT_FOUND',404);document=data.document
  }
  result=await db.rpc('individual_catalog_save',{p_document:validateCatalog(document),p_expected:body.expected_revision,p_actor:user.id})
 }else if(body.action==='publish'){
  const {data,error}=await db.from('individual_catalog_state').select('draft,revision').eq('id',true).single();if(error||!data)throw new CatalogError('CATALOG_UNAVAILABLE',503)
  if(data.revision!==body.expected_revision)throw new CatalogError('CATALOG_CONFLICT',409)
  validateCatalog(data.draft)
  result=await db.rpc('individual_catalog_publish',{p_expected:body.expected_revision,p_actor:user.id})
 }else throw new CatalogError('INVALID_ACTION')
 if(result.error)throw new CatalogError(result.error.message.includes('CATALOG_CONFLICT')?'CATALOG_CONFLICT':'CATALOG_UNAVAILABLE',result.error.message.includes('CATALOG_CONFLICT')?409:503)
 return Response.json(result.data,{headers:{'Cache-Control':'no-store'}})
}catch(e){return failure(e)}}
function failure(e:unknown){return Response.json({error:e instanceof CatalogError?e.code:'CATALOG_UNAVAILABLE',message:e instanceof CatalogError&&e.code.startsWith('INVALID_CATALOG')?'راجع القيم المدخلة. يجب اكتمال الباقات الخمس وأسعار الأخبار، وألا تتجاوز ميزانية الإعلان سعر الخدمة.':undefined},{status:e instanceof CatalogError?e.status:503,headers:{'Cache-Control':'no-store'}})}
