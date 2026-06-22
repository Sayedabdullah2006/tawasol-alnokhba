import { handlePostpulseCallback } from '@/lib/postpulse-callback'

export const dynamic = 'force-dynamic'

// رد نداء OAuth للإنتاج: https://nukhba.media/oauth/callback
export async function GET(req: Request) {
  return handlePostpulseCallback(req)
}
