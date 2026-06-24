-- Reconcile knowledge_vault_grants.kvg_read with prod (replay-correctness fix).
--
-- A clean migration replay reproduced an OLD kvg_read whose USING clause had a
-- third arm — `entry_id IN (SELECT id FROM knowledge_entries WHERE user_id =
-- auth.uid())`. That arm re-enters knowledge_entries, which via its ke_read
-- policy re-enters knowledge_vault_grants, giving Postgres "infinite recursion
-- detected in policy for relation knowledge_entries" on any authenticated read
-- of knowledge_entry_entities (kee_read → knowledge_entries → kvg_read → …).
--
-- Prod was already fixed out-of-band (via MCP) to the non-recursive form below
-- and that fix was never committed — so prod works but the committed history
-- did not. This migration commits the prod-matching policy: a vault grant is
-- visible only to its grantee or its granter. Idempotent (DROP-then-CREATE) and
-- a functional no-op on prod, which already has exactly this policy.

DROP POLICY IF EXISTS kvg_read ON knowledge_vault_grants;
CREATE POLICY kvg_read ON knowledge_vault_grants
  FOR SELECT
  USING (grantee_id = auth.uid() OR granted_by = auth.uid());
