const studioImageTypes = ['image/jpeg', 'image/png', 'image/webp']

export function isPartnerStudioImage(file: { name: string; mime_type: string }) {
  return file.name.startsWith('[news-design] ') && studioImageTypes.includes(file.mime_type)
}

export function partnerStudioImageRef(id: string) {
  return `/api/admin/partner-files/${id}?preview=1`
}

export function isPartnerStudioImageRef(value: unknown): value is string {
  return typeof value === 'string' && /^\/api\/admin\/partner-files\/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\?preview=1$/i.test(value)
}
