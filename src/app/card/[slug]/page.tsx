import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { socialPlatforms, type CardSnapshot } from "@/lib/workforce/business-card";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "بطاقة تواصل | تواصل النخبة", robots: { index: false, follow: false } };
export default async function PublicCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(slug)) notFound();
  const { data, error } = await (await createServiceRoleClient()).rpc("wf_public_business_card", { p_slug: slug });
  if (error || !data) notFound();
  const card = data as CardSnapshot;
  return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#102b57] px-5 py-12">
    <article className="w-full max-w-md overflow-hidden rounded-3xl bg-white text-center shadow-2xl">
      <div className="border-b-4 border-[#b99d59] px-7 py-9">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt={card.company.name} className="mx-auto mb-7 h-28 w-auto" />
        <h1 className="text-2xl font-black text-[#102b57]">{card.name}</h1>
        <p className="mt-2 font-bold text-[#8b7444]">{card.title}</p>
        <p className="mt-2 text-sm text-slate-500">{card.company.name}</p>
      </div>
      <div className="space-y-3 p-7">
        {socialPlatforms.filter(p => card.socials[p.key]).map(p => <a key={p.key} href={card.socials[p.key]} target="_blank" rel="noopener noreferrer nofollow" className="block rounded-xl bg-[#102b57] px-5 py-4 font-bold text-white hover:bg-[#214775]">{p.label} <span aria-hidden>↗</span></a>)}
        {card.email && <a className="block break-all rounded-xl border p-3 text-[#102b57]" href={`mailto:${card.email}`}>{card.email}</a>}
        {card.phone && <a className="block rounded-xl border p-3 text-[#102b57]" dir="ltr" href={`tel:${card.phone.replace(/[^+0-9]/g, "")}`}>{card.phone}</a>}
        <a href={card.company.website} target="_blank" rel="noopener noreferrer" className="mt-6 block text-sm font-bold text-[#8b7444]">{card.company.name} ↗</a>
        {card.company.email && <a className="block break-all text-sm text-slate-500" href={`mailto:${card.company.email}`}>{card.company.email}</a>}
        {card.company.phone && <a className="block text-sm text-slate-500" dir="ltr" href={`tel:${card.company.phone.replace(/[^+0-9]/g, "")}`}>{card.company.phone}</a>}
        {card.company.address && <p className="text-sm text-slate-500">{card.company.address}</p>}
      </div>
    </article>
  </main>;
}
