alter table public.x_radar_items
  drop constraint if exists x_radar_items_source_type_check;

alter table public.x_radar_items
  add constraint x_radar_items_source_type_check
  check (source_type in ('verified_topic', 'verified_reply_to_first1', 'saudi_cabinet'));
