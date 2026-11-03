'use client';
export default function SalesQuotePrint(){return <button type="button" className="min-h-11 rounded-md border border-slate-300 px-4 text-sm print:hidden" onClick={()=>window.print()}>طباعة / حفظ PDF</button>;}
