import { randomBytes } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { notifyCompletedToClient, sendRequestReviewEmail } from '@/lib/email'

const REVIEW_VALIDITY_DAYS = 30

type ReviewInvitationArgs = {
  requestId: string
  requestNumber: string
  clientName: string
  clientEmail: string
}

export async function sendRequestReviewInvitation(args: ReviewInvitationArgs): Promise<boolean> {
  if (!args.clientEmail) return false

  const reviewUrl = await prepareRequestReviewUrl(args)
  if (!reviewUrl) return false

  return sendRequestReviewEmail({
    email: args.clientEmail,
    clientName: args.clientName,
    requestNumber: args.requestNumber,
    reviewUrl,
  })
}

export async function sendCompletedWithReviewInvitation(args: ReviewInvitationArgs): Promise<boolean> {
  const reviewUrl = await prepareRequestReviewUrl(args)
  return notifyCompletedToClient({
    email: args.clientEmail,
    clientName: args.clientName,
    requestNumber: args.requestNumber,
    reviewUrl: reviewUrl ?? undefined,
  })
}

async function prepareRequestReviewUrl(args: ReviewInvitationArgs): Promise<string | null> {
  if (!args.clientEmail) return null

  const service = await createServiceRoleClient()
  const now = new Date()
  const { data: existing, error: existingError } = await service
    .from('request_reviews')
    .select('review_token, token_expires_at, submitted_at')
    .eq('request_id', args.requestId)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing?.submitted_at) return null

  const isReusable = existing?.review_token && new Date(existing.token_expires_at) > now
  const reviewToken = isReusable ? existing.review_token : randomBytes(32).toString('hex')
  const expiresAt = isReusable
    ? existing!.token_expires_at
    : new Date(now.getTime() + REVIEW_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error: saveError } = await service
    .from('request_reviews')
    .upsert({
      request_id: args.requestId,
      review_token: reviewToken,
      token_expires_at: expiresAt,
      invitation_sent_at: now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'request_id' })

  if (saveError) throw saveError

  return `https://nukhba.media/review/${reviewToken}`
}
