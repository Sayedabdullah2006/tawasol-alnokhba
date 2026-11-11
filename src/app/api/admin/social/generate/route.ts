import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin-auth'
import { preparePublicationDay } from '@/lib/publication-plans'
export const dynamic='force-dynamic'
export const maxDuration=300
export async function POST(){
 if(!await getAdminUser())return NextResponse.json({error:'غير مصرح'},{status:401})
 try{return NextResponse.json(await preparePublicationDay())}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'تعذر تجهيز اليوم'},{status:400})}
}
