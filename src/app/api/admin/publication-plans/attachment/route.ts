import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin-auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
export const runtime='nodejs'
export async function POST(req:Request){
 const admin=await getAdminUser();if(!admin)return NextResponse.json({error:'غير مصرح'},{status:401})
 try{
  const form=await req.formData(),file=form.get('file')
  if(!(file instanceof File)||!file.size||file.size>10*1024*1024)throw new Error('اختر ملفًا بحجم لا يتجاوز 10 ميغابايت')
  const ext=file.name.split('.').pop()?.toLowerCase()||''
  const types:Record<string,string>={txt:'text/plain',md:'text/markdown',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
  if(!types[ext])throw new Error('الصيغ المتاحة: TXT أو MD أو PDF أو DOCX')
  const path=`${admin.id}/${randomUUID()}.${ext}`
  const db=await createServiceRoleClient();const {error}=await db.storage.from('editorial-plan-files').upload(path,Buffer.from(await file.arrayBuffer()),{contentType:types[ext]})
  if(error)throw new Error(error.message)
  return NextResponse.json({path,name:file.name,text:['txt','md'].includes(ext)?await file.text():undefined})
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'تعذر رفع الملف'},{status:400})}
}
