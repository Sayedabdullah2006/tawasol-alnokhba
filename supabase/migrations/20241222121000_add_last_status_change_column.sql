-- إضافة عمود last_status_change لتتبع آخر تغيير في حالة الطلب
-- هذا العمود مطلوب لحساب متى يجب إرسال التذكيرات

-- إضافة العمود إذا لم يكن موجوداً
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'publish_requests'
        AND column_name = 'last_status_change'
    ) THEN
        ALTER TABLE publish_requests
        ADD COLUMN last_status_change TIMESTAMP WITH TIME ZONE;

        -- تحديث السجلات الموجودة لتأخذ قيمة created_at كقيمة افتراضية
        UPDATE publish_requests
        SET last_status_change = created_at
        WHERE last_status_change IS NULL;

        COMMENT ON COLUMN publish_requests.last_status_change IS 'تاريخ آخر تغيير في حالة الطلب - مطلوب لحساب التذكيرات';

        -- إضافة فهرس للأداء
        CREATE INDEX IF NOT EXISTS idx_publish_requests_last_status_change
          ON publish_requests(last_status_change);

        RAISE NOTICE 'تمت إضافة عمود last_status_change وتحديث البيانات الموجودة';
    ELSE
        RAISE NOTICE 'عمود last_status_change موجود بالفعل';
    END IF;
END $$;

-- إنشاء دالة لتحديث last_status_change تلقائياً عند تغيير الحالة
CREATE OR REPLACE FUNCTION update_last_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- تحديث last_status_change فقط إذا تغيرت الحالة
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.last_status_change = NOW();

        -- سجل في log للمراقبة
        RAISE NOTICE 'تم تحديث last_status_change للطلب % من % إلى %',
                     NEW.id, OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ربط الدالة بـ trigger إذا لم يكن موجوداً
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_update_last_status_change'
    ) THEN
        CREATE TRIGGER trigger_update_last_status_change
            BEFORE UPDATE ON publish_requests
            FOR EACH ROW
            EXECUTE FUNCTION update_last_status_change();

        RAISE NOTICE 'تم إنشاء trigger لتحديث last_status_change تلقائياً';
    ELSE
        RAISE NOTICE 'trigger update_last_status_change موجود بالفعل';
    END IF;
END $$;

-- تعليق على التحسينات
COMMENT ON TRIGGER trigger_update_last_status_change ON publish_requests IS
'يحدث last_status_change تلقائياً عند تغيير حالة الطلب';

COMMENT ON FUNCTION update_last_status_change() IS
'دالة تحديث last_status_change عند تغيير حالة الطلب - مطلوبة لنظام التذكيرات';