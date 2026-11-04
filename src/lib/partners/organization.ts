import { CATEGORIES } from '@/lib/constants'
import { PartnerError, text } from './auth'

export const organizationTypes = ['business', 'government'] as const
export function clientType(value: unknown) {
  const type = value === undefined ? 'individual' : value
  if (typeof type !== 'string' || !['individual', ...organizationTypes].includes(type)) throw new PartnerError('INVALID_CLIENT_TYPE')
  return type as 'individual' | typeof organizationTypes[number]
}
export function clientDefinitions() {
  return [{ id: 'individual', name: 'فرد', pricing_mode: 'automatic', package_selection: true },
    { id: 'business', name: 'شركة / مؤسسة', pricing_mode: 'manual', package_selection: false },
    { id: 'government', name: 'جهة حكومية', pricing_mode: 'manual', package_selection: false }]
    .map(type => ({ ...type, request_types: ['single'], category_ids: CATEGORIES.filter(c => !c.clientTypes || c.clientTypes.includes(type.id)).map(c => c.id),
      organization_fields: type.id === 'individual' ? [] : [
        { id: 'org_name', label: 'اسم الجهة', required: true, max_length: 200 },
        { id: 'org_representative', label: 'اسم ممثل الجهة (اختياري)', required: false, max_length: 160 },
        { id: 'org_license', label: 'السجل أو الترخيص (اختياري)', required: false, max_length: 100 },
      ] }))
}
export function organizationInput(body: Record<string, unknown>) {
  const type = clientType(body.client_type)
  if (type === 'individual') throw new PartnerError('INVALID_CLIENT_TYPE')
  if (body.request_type !== undefined && body.request_type !== 'single') throw new PartnerError('UNSUPPORTED_REQUEST_TYPE')
  if (['quote_id', 'package_id', 'selected_package', 'package_snapshot', 'discount_code', 'final_total', 'admin_quoted_price', 'amount', 'status', 'payment_status', 'user_id'].some(k => body[k] !== undefined && body[k] !== null) || ['extras','selected_extras'].some(k=>Array.isArray(body[k]) && (body[k] as unknown[]).length>0)) throw new PartnerError('MANUAL_QUOTE_REQUIRED')
  const category = text(body.category, 40)
  if (!CATEGORIES.some(c => c.id === category && (!c.clientTypes || c.clientTypes.includes(type)))) throw new PartnerError('INVALID_CATEGORY')
  if (body.sub_option != null && body.sub_option !== '') throw new PartnerError('INVALID_SUB_OPTION')
  return { client_type: type, category, org_name: text(body.org_name, 200), org_representative: text(body.org_representative ?? '', 160, false), org_license: text(body.org_license ?? '', 100, false) }
}
