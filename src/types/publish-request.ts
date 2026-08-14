export interface PublishRequest {
  [key: string]: unknown
  id: string
  request_number: number
  category: string
  status: string
  created_at: string
  title?: string | null
  content?: string | null
  request_type?: string | null
  campaign_posts?: unknown
  post_reviews?: unknown
  post_statuses?: unknown
  ai_posts?: unknown
  ai_revised_designs?: unknown
  user_feedback?: string | null
  content_images?: string[] | null
  supporting_documents?: unknown
  admin_info_request?: string | null
  admin_notes?: string | null
  admin_offered_extras?: unknown[] | null
  admin_quoted_price?: number | null
  auto_quote_note?: string | null
  auto_quote_tier?: string | null
  billing_source?: string | null
  client_type?: string | null
  channels?: string[] | null
  estimated_reach?: number | null
  extras_selected_total?: number | null
  final_total?: number | null
  hashtags?: string | null
  influencer_id?: string | null
  images?: number | 'one' | 'multi' | null
  link?: string | null
  membership_credit_status?: string | null
  moyasar_payment_id?: string | null
  num_posts?: number | null
  negotiation_rejected?: boolean | null
  negotiation_round?: number | null
  paid_at?: string | null
  payment_status?: string | null
  preferred_date?: string | null
  proposed_content?: string | null
  proposed_images?: string[] | null
  quote_expires_at?: string | null
  receipt_url?: string | null
  refund_amount?: number | null
  refund_timing?: string | null
  scope?: string | null
  selected_package?: string | null
  sub_option?: unknown
  tamara_order_id?: string | null
  user_selected_extras?: string[] | null
}

export interface RequestInfluencer {
  id?: string
  x_followers?: number | null
  ig_followers?: number | null
  li_followers?: number | null
  tk_followers?: number | null
  price_multiplier?: number | null
  [key: string]: unknown
}
