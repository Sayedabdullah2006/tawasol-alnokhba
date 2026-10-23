import {notFound} from 'next/navigation';
import {readFile} from 'node:fs/promises';
import PortalScreen from '@/components/layout/PortalScreen';
import type {TaskSuggestion} from '@/lib/workforce/task-suggestion';
import PreviewForm from './preview-form';
export const dynamic='force-dynamic';
export default async function Page(){
 if(process.env.NODE_ENV!=='development')notFound();
 const sample=JSON.parse(await readFile('.preview/task-ai-result.json','utf8')) as {title:string;suggestion:TaskSuggestion};
 return <PortalScreen area="team"><main dir="rtl" className="mx-auto max-w-2xl p-5 sm:p-8"><header className="mb-5 text-white"><p className="text-xs text-amber-200">معاينة محلية · لا حفظ أو إرسال</p><h1 className="mt-2 text-2xl font-black">إضافة مهمة</h1></header><PreviewForm sample={sample}/></main></PortalScreen>;
}
