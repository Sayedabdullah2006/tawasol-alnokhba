-- بيانات الجهة (لغير الأفراد) + دعم صفة "وكالة دعاية وإعلان"

-- 1) أعمدة بيانات الجهة — اسم الجهة (إلزامي في الواجهة)، الممثّل والسجل (اختياري)
alter table publish_requests add column if not exists org_name           text;
alter table publish_requests add column if not exists org_representative text;
alter table publish_requests add column if not exists org_license        text;

-- 2) توسيع قيد نوع العميل ليشمل جميع الصفات + وكالة الدعاية والإعلان
alter table publish_requests drop constraint if exists publish_requests_client_type_check;
alter table publish_requests
  add constraint publish_requests_client_type_check
  check (client_type in ('individual', 'business', 'government', 'charity', 'agency'));
