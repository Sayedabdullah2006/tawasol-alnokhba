import { handlePostpulseCallback } from '@/lib/postpulse-callback'

export const dynamic = 'force-dynamic'

// رد نداء OAuth للتطوير المحلي: http://localhost:3000/callback
export async function GET(req: Request) {
  return handlePostpulseCallback(req)
}
