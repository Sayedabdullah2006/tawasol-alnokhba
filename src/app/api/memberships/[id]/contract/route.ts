import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { generateMembershipContractPdf } from '@/lib/membership-contract'
import { formatMembershipNumber } from '@/lib/memberships'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const service = await createServiceRoleClient()
  const [{ data: membership }, { data: profile }] = await Promise.all([
    service.from('memberships').select('*').eq('id', id).maybeSingle(),
    service.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])
  if (!membership || (membership.user_id !== user.id && profile?.role !== 'admin')) return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
  if (membership.status !== 'active' && profile?.role !== 'admin') return NextResponse.json({ error: 'العقد متاح بعد تفعيل العضوية' }, { status: 409 })

  const number = formatMembershipNumber(membership.membership_number)
  const contractPath = `${membership.user_id}/${membership.id}/${number}-one-page.pdf`
  let pdf: Buffer | null = null
  if (membership.contract_path === contractPath) {
    const { data } = await service.storage.from('membership-contracts').download(contractPath)
    if (data) pdf = Buffer.from(await data.arrayBuffer())
  }
  if (!pdf) {
    pdf = await generateMembershipContractPdf(membership)
    const now = new Date().toISOString()
    const { error: uploadError } = await service.storage.from('membership-contracts').upload(contractPath, pdf, { contentType: 'application/pdf', upsert: true })
    if (!uploadError) {
      await Promise.all([
        service.from('memberships').update({ contract_path: contractPath, contract_generated_at: now }).eq('id', membership.id),
        service.from('membership_agreements').update({ contract_path: contractPath, contract_generated_at: now }).eq('membership_id', membership.id).eq('version', membership.terms_version),
      ])
    }
  }
  const bytes = new Uint8Array(pdf)
  return new NextResponse(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${number}.pdf"`, 'Cache-Control': 'private, no-store' } })
}
