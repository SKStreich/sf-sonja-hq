-- Sprint 12 doc-linking — add the 'attached' relation to knowledge_links.
--
-- Closes the HQ gap surfaced during the Loadstar / SF Solutions engagement:
-- there was no way to deliberately pin an existing knowledge doc to a project
-- (only incidental [[Project: Name]] mentions inside workspace pages persisted,
-- as relation='mentions'). 'attached' is the deliberate, user-driven link
-- created from a project's Linked tab.
--
-- Everything else the feature needs already exists on this table:
--   • to_project column + FK (knowledge_links_to_project_fkey, ON DELETE CASCADE)
--   • 3-way XOR (knowledge_links_target_xor): exactly one of entry/project/task
--   • partial unique kl_unique_project (from_entry, to_project, relation)
--   • RLS (kl_read/kl_write/kl_delete) keyed off from_entry — already permits these rows
-- So this migration only widens the relation CHECK.

ALTER TABLE knowledge_links DROP CONSTRAINT IF EXISTS knowledge_links_relation_check;
ALTER TABLE knowledge_links ADD CONSTRAINT knowledge_links_relation_check
  CHECK (relation = ANY (ARRAY[
    'cites','duplicate_of','extends','chat_about','merged_into',
    'critique_of','note_on','superseded_by','mentions','attached'
  ]));
