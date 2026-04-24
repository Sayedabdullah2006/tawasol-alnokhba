-- ═══════════════════════════════════════════════════════════════════
-- 🔧 إضافة الأعمدة المفقودة لنظام الدفع الإلكتروني
-- Add missing payment columns for Moyasar integration
-- ═══════════════════════════════════════════════════════════════════

-- Add payment-related columns to publish_requests table
ALTER TABLE publish_requests
ADD COLUMN IF NOT EXISTS moyasar_payment_id TEXT,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS moyasar_reference TEXT,
ADD COLUMN IF NOT EXISTS moyasar_auth_code TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_publish_requests_moyasar_payment_id
ON publish_requests (moyasar_payment_id);

CREATE INDEX IF NOT EXISTS idx_publish_requests_payment_status
ON publish_requests (payment_status);

CREATE INDEX IF NOT EXISTS idx_publish_requests_status_moyasar
ON publish_requests (status, moyasar_payment_id)
WHERE moyasar_payment_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN publish_requests.moyasar_payment_id IS 'Moyasar payment ID from payment gateway';
COMMENT ON COLUMN publish_requests.payment_status IS 'Payment status: pending, paid, failed, refunded';
COMMENT ON COLUMN publish_requests.paid_at IS 'Timestamp when payment was confirmed';
COMMENT ON COLUMN publish_requests.moyasar_reference IS 'Bank reference number from Moyasar';
COMMENT ON COLUMN publish_requests.moyasar_auth_code IS 'Authorization code from payment gateway';
COMMENT ON COLUMN publish_requests.payment_method IS 'Payment method used (e.g., VISA ***1234)';

-- Create webhook_logs table for Moyasar webhook logging
CREATE TABLE IF NOT EXISTS webhook_logs (
    id SERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    payment_id TEXT,
    request_id UUID,
    raw_payload JSONB NOT NULL,
    status TEXT DEFAULT 'received',
    response_message TEXT,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for webhook_logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_payment_id ON webhook_logs (payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_request_id ON webhook_logs (request_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs (created_at);

-- Add comments for webhook_logs
COMMENT ON TABLE webhook_logs IS 'Logs all webhook events from Moyasar payment gateway';
COMMENT ON COLUMN webhook_logs.event_type IS 'Type of webhook event (e.g., payment.paid)';
COMMENT ON COLUMN webhook_logs.payment_id IS 'Moyasar payment ID from webhook';
COMMENT ON COLUMN webhook_logs.request_id IS 'Our internal request ID';
COMMENT ON COLUMN webhook_logs.raw_payload IS 'Complete webhook payload from Moyasar';
COMMENT ON COLUMN webhook_logs.status IS 'Processing status: received, success, failed';
COMMENT ON COLUMN webhook_logs.response_message IS 'Result message from processing';

-- Show the added columns
SELECT
    'Added payment columns:' as status,
    COUNT(*) as total_columns_added
FROM information_schema.columns
WHERE table_name = 'publish_requests'
AND column_name IN (
    'moyasar_payment_id',
    'payment_status',
    'paid_at',
    'moyasar_reference',
    'moyasar_auth_code',
    'payment_method'
);

-- Show current table structure with new columns
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'publish_requests'
    AND column_name IN (
        'moyasar_payment_id',
        'payment_status',
        'paid_at',
        'moyasar_reference',
        'moyasar_auth_code',
        'payment_method'
    )
ORDER BY column_name;