import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import StoreOrderForm from '@/components/inventor-store/StoreOrderForm'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getInventorStoreProduct } from '@/lib/inventor-store'

export const metadata: Metadata = { title: 'طلب خدمة | مسار المخترع' }

export default async function InventorStoreOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = getInventorStoreProduct(slug)
  if (!product) notFound()
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/inventor-store/order/${slug}`)}`)
  return <StoreOrderForm product={product} />
}
