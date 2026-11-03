import {notFound} from 'next/navigation';
import SalesWorkspace from '@/components/workforce/SalesWorkspace';
import {requireAdmin,workforceActor} from '@/lib/workforce/server';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{view?:string[]}>;searchParams:Promise<{month?:string}>}){
 requireAdmin(await workforceActor());const {view=[]}=await params;const section=view[0]??'crm';if(view.length>1||!['goals','crm','competition','reviews'].includes(section))notFound();
 return <SalesWorkspace initialMonth={(await searchParams).month} view={section as 'goals'|'crm'|'competition'|'reviews'}/>;
}
