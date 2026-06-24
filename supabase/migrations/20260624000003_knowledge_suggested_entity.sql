-- Sprint 13 · Inbox & Triage — T2.
-- D6 (locked): quick-capture paths land an item in the inbox with the AI's
-- entity guess PRE-SELECTED in the triage UI rather than auto-applied. Store the
-- guess so the inbox UI can pre-fill it; it's cleared when the item is filed.
-- A transient hint, not membership — membership stays in the junction. Nullable
-- TEXT, no CHECK (it's a soft suggestion; an unknown slug just won't pre-select).
ALTER TABLE knowledge_entries
  ADD COLUMN IF NOT EXISTS suggested_entity TEXT;
