-- جدول خطة النشر الاجتماعي اليومية/الشهرية
-- يخزّن كل خبر مُعاد نشره (مأخوذ من first1saudi.net، مُصمَّم في الاستوديو)
-- لغرضين: منع تكرار نفس الخبر خلال نافذة زمنية، وبناء تقويم النشر الشهري.
CREATE TABLE IF NOT EXISTS social_schedule (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  wp_post_id        BIGINT      NOT NULL,          -- معرّف المنشور في ووردبريس (لمنع التكرار)
  post_url          TEXT        NOT NULL,
  post_title        TEXT        NOT NULL,
  category          TEXT,                          -- تصنيف الخبر (للتنويع)
  source_image_url  TEXT,                          -- الصورة البارزة المستخدمة كمصدر
  design_image_url  TEXT,                          -- التصميم المُولَّد من الاستوديو
  tweets            TEXT,                          -- التغريدات الثلاث المقترحة (نص مرقّم)
  chosen_concept    TEXT,                          -- الاتجاه الفني المختار
  batch_date        DATE        NOT NULL,          -- يوم الدفعة
  status            TEXT        DEFAULT 'suggested' NOT NULL, -- suggested | published | skipped
  email_sent        BOOLEAN     DEFAULT false NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- لمنع التكرار السريع: نبحث عن آخر مرة استُخدم فيها كل منشور.
CREATE INDEX IF NOT EXISTS idx_social_schedule_wp_post_id ON social_schedule (wp_post_id);
-- لعرض تقويم الشهر.
CREATE INDEX IF NOT EXISTS idx_social_schedule_batch_date ON social_schedule (batch_date);

-- يُقرأ/يُكتب عبر service role فقط (المُنسّق اليومي ولوحة الإدارة).
ALTER TABLE social_schedule ENABLE ROW LEVEL SECURITY;
