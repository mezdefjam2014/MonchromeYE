-- YE2K metadata cleanup
-- Run in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- This keeps the old columns in place for compatibility, but makes them optional.
-- No existing rows or uploaded files are deleted.

alter table public.beats
  alter column genre drop not null,
  alter column bpm drop not null;

alter table public.beats
  drop constraint if exists beats_bpm_check;

comment on column public.beats.genre is
  'Legacy optional field. The YE2K storefront and back office no longer use genre.';

comment on column public.beats.mood is
  'Legacy optional field. The YE2K storefront and back office no longer use mood.';

comment on column public.beats.bpm is
  'Legacy optional field. The YE2K storefront and back office no longer use BPM.';

comment on column public.beats.musical_key is
  'Legacy optional field. The YE2K storefront and back office no longer use musical key.';
