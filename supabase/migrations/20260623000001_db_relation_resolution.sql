-- HQ Databases — relation resolution substrate (Unified Knowledge Browser U3d).
--
-- A Notion `relation` column imports as an array of raw Notion *page* ids
-- (notion-import.ts::extractCellValue). To render those as the related record's
-- title — and to make them real cross-database pointers — we need a join key
-- from a Notion page id back to the HQ record, and from a Notion database id to
-- the HQ database it was imported into. The B2 importer recorded neither, so two
-- additive nullable columns capture them going forward; a one-time backfill
-- (database-import.ts::backfillNotionPageIds) populates them for already-imported
-- databases.
--
-- Both tables already carry B1's `FOR ALL` org-scoped RLS policies, which cover
-- the new columns — no policy change is required.

alter table public.hq_db_records   add column if not exists notion_page_id     text;
alter table public.hq_databases     add column if not exists notion_database_id text;

-- Resolve a relation cell's page id within a database (notion_page_id -> record).
create index if not exists hq_db_records_notion_page_id_idx
  on public.hq_db_records (database_id, notion_page_id)
  where notion_page_id is not null;

-- Resolve a relation property's target Notion db -> the HQ database it became.
create index if not exists hq_databases_notion_database_id_idx
  on public.hq_databases (org_id, notion_database_id)
  where notion_database_id is not null;
