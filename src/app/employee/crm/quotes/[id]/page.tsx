import SalesQuote from '@/components/workforce/SalesQuote';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){return <SalesQuote id={(await params).id}/>;}
