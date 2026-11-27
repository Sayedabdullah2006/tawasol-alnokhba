export function normalizeCustomerPhone(raw: string) {
  const phone = raw.normalize('NFKC')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[\s()-]/g, '')
  if (/^05\d{8}$/.test(phone)) return '+966' + phone.slice(1)
  if (/^\+9665\d{8}$/.test(phone)) return phone
  if (/^\+966/.test(phone)) return null
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null
}

export function customerProfileComplete(profile: { full_name: string | null; phone: string | null }) {
  const name = profile.full_name?.trim() ?? ''
  return name.length >= 2 && name.length <= 160 && !!normalizeCustomerPhone(profile.phone ?? '')
}
