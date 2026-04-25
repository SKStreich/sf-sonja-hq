-- Sprint 9 — Original viewer support
-- Stores extracted HTML for non-PDF uploads (DOCX via mammoth, XLSX via SheetJS,
-- HTML as-is). The /share/[token] viewer and EntryDetail Original tab render
-- this in a sandboxed iframe.

ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS rendered_html text;
