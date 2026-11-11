import { randomUUID } from 'node:crypto'
import { buildCompactImagePrompt } from './studio-image-prompt'
import { nov21ExperimentPrompt } from './publication-plan-experiment-model'
import { generateImageWithOpenAI } from './image-generation'
import { resizeToPoster,compositeLogoBottomRight } from './logo-overlay'
import { createServiceRoleClient } from './supabase-server'

export async function generateNov21NumberVariant(args:{day:string;analysis:Record<string,unknown>;chosenConcept:string;sourceImage:string;sourceText:string}):Promise<string> {
  const metric=args.analysis.standout_metric||args.analysis.evidence_metric
  if(typeof metric!=='string'||!/[\p{N}]/u.test(metric))throw new Error('لا يوجد رقم موثق صالح لاختبار بطاقة الرقم')
  const base=buildCompactImagePrompt({analysis:{...args.analysis,standout_metric:metric},chosenConcept:args.chosenConcept,sourceText:args.sourceText})
  const prompt=nov21ExperimentPrompt(base,args.day)
  const {b64}=await generateImageWithOpenAI(prompt,[args.sourceImage],{aspectRatio:'4:5',allowSafetyFallback:false})
  const db=await createServiceRoleClient();const {data:brand,error}=await db.from('brand_settings').select('first1saudi_logo_url').eq('id',1).single()
  if(error||!brand?.first1saudi_logo_url)throw new Error('تعذر قراءة الشعار الرسمي لتركيب التذييل')
  const image=await compositeLogoBottomRight(await resizeToPoster(Buffer.from(b64,'base64')),brand.first1saudi_logo_url)
  const path=`plan-test-20261121-${randomUUID()}.png`
  const {error:uploadError}=await db.storage.from('content-images').upload(path,image.buffer,{contentType:'image/png'});if(uploadError)throw new Error(uploadError.message)
  return db.storage.from('content-images').getPublicUrl(path).data.publicUrl
}
