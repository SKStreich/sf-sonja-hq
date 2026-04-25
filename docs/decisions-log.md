# Sonja HQ — Decisions Log

**Version:** 1.0  
**Created:** April 2026  
**Purpose:** Canonical record of every architectural and design decision made for Sonja HQ.  
Every decision here is locked. Do not revisit without Sonja's explicit instruction.

---

## How to Use This Log

- Read this before making any architectural decision in sf-sonja-hq
- If a decision exists here, it is locked — do not re-open it
- If a new decision is needed, add it here after Sonja confirms
- Format: Decision number · Date · What was decided · Why

---

## Locked Decisions

---

### D-001 — HQ is a standalone app, permanently
**Date:** April 2026  
**Decision:** Sonja HQ is a standalone application. It is not a module inside sf-ops and will never become one.  
**Rationale:** HQ is Sonja's personal command center. It has different users, different data, different purpose, and different auth requirements from the SF Ops platform. Keeping it separate maintains clean boundaries.  
**Implications:** Separate GitHub repo (SKStreich/sf-sonja-hq), separate Supabase project (sonja-hq), separate Vercel deployment.

---

### D-002 — HQ and SF Ops share auth via SSO
**Date:** April 2026  
**Decision:** HQ and SF Ops are connected via a shared auth layer (SSO). Single login works across both apps. Deep links between apps work without re-authentication.  
**Rationale:** Users should not log in twice. The apps are separate but they serve the same person.  
**Implications:** Auth provider must support SSO across multiple apps. WorkOS and Clerk both support this. Decision on provider pending stack evaluation (see D-008).

---

### D-003 — Knowledge Base replaces Notion and OneDrive
**Date:** April 2026  
**Decision:** The HQ Knowledge Base is the single source of truth for all of Sonja's decisions, strategies, brand assets, marketing documents, business documents, and session primers. Notion is no longer the source of truth. OneDrive folder structures are no longer used for document organization.  
**Rationale:** Notion was causing more friction than value. OneDrive folder structures required too much manual management. HQ replaces both with a searchable, intelligent knowledge store.  
**Implications:** All content currently in Notion primers must be migrated to the HQ Knowledge Base. Existing Notion pages become read-only references during transition, then archived.

---

### D-004 — No folders, no filing — Claude classifies everything
**Date:** April 2026  
**Decision:** The Knowledge Base has no folder structure. Users drop content in. Claude auto-classifies, auto-tags, and makes it findable. Users can override any classification.  
**Rationale:** Sonja's design motto — keep it simple, stupid; keep it smart, silly. Filing systems create friction. Intelligence removes it.  
**Implications:** knowledge_items table has a `type` field with auto-classification. `classification_overridden` boolean tracks when user changes Claude's suggestion. Every item gets fts vector and semantic embedding for dual-mode search.

---

### D-005 — Two-tier security: Tier 1 (Claude-accessible) and Tier 2 (Vault)
**Date:** April 2026  
**Decision:** Knowledge store has two tiers. Tier 1 is Claude-accessible (decisions, strategies, brand, marketing, business docs). Tier 2 is a Vault that Claude cannot read under any circumstances (passports, health records, financial account numbers, sensitive PII).  
**Rationale:** Claude needs access to business context to be useful. But certain personal documents must never be exposed via API calls, regardless of how secure the implementation is. The boundary is architectural, not just a permission check.  
**Implications:** Two separate Supabase Storage buckets with separate RLS policies. Claude API system prompt explicitly instructs Claude not to access Vault. No queries that touch knowledge_items can also touch Vault storage. Vault items are never shareable.

---

### D-006 — Sharing is fully user-controlled
**Date:** April 2026  
**Decision:** Any Tier 1 knowledge item can be shared. The user controls: who receives the share, what they can see, how long the share is active (expiring links), and can revoke any share at any time. Vault (Tier 2) items can never be shared.  
**Rationale:** Sonja needs to share strategy docs, brand guidelines, and decision records with clients, contractors, and collaborators. She must retain full control over that sharing.  
**Implications:** knowledge_shares table with share_token, recipient_email (optional), expires_at (nullable), revoked boolean. Share URLs use opaque tokens — never expose item_id. Expired or revoked tokens return 404.

---

### D-007 — Classification is Claude's suggestion, not a lock
**Date:** April 2026  
**Decision:** Claude's auto-classification of any knowledge item is always a suggestion. The user can override the type, tags, and entity assignment with one click. When overridden, classification_overridden = true, overridden_by = user_id.  
**Rationale:** AI classification is imperfect. The user knows their own content better than Claude does. Claude should help, not constrain.  
**Implications:** Every knowledge item card shows Claude's classification with a visible override option. Changes propagate everywhere the item appears.

---

### D-008 — Stack evaluation is a separate session
**Date:** April 2026  
**Decision:** The potential migration from Supabase + Vercel to Railway + Cloudflare + Clerk is a separate evaluation. No architectural decisions in sf-sonja-hq depend on the outcome of that evaluation until it is complete.  
**Current stack:** Supabase + Vercel (in use)  
**Under evaluation:** Railway + Cloudflare + Clerk  
**Rationale:** Changing stack mid-build is more expensive than completing the evaluation first. All specs are written to be stack-agnostic where possible.  
**Implications:** Do not hard-code Vercel-specific or Supabase-specific patterns that cannot be migrated. Keep infrastructure concerns in dedicated files (not scattered through business logic).

---

### D-009 — Document Library module replaced by Knowledge Base
**Date:** April 2026  
**Decision:** The Document Library module from the April 2026 spec is replaced by the Knowledge Base. Notion sync (which was the Document Library's primary function in v1) is dropped entirely.  
**Rationale:** Notion is no longer the source of truth. The Knowledge Base serves the same purpose with more capability and no external dependency.  
**Implications:** Module list is 8 items: Dashboard, Knowledge Base, Projects, Tasks, Ideas, Chat History, Integrations Hub, AI Digest.

---

### D-010 — Light mode is default, dark mode is available
**Date:** April 2026  
**Decision:** HQ defaults to light mode. Dark mode is available as a user preference. Light is the primary design surface.  
**Rationale:** Sonja wears glasses and works on screens all day. Dark backgrounds cause eye strain with daily use. The SF brand palette works better on light backgrounds with a light-version logo.  
**Implications:** All components must support both modes. Light mode is tested first. Logo asset: must have a light-background version (not logo-dark.png).

---

### D-011 — Claude is resident in HQ, not a visitor
**Date:** April 2026  
**Decision:** Claude is embedded in HQ via the Claude API. It is always present with full Tier 1 knowledge store context. No session primers required. No manual context updates. Claude reads the knowledge store before every conversation.  
**Rationale:** The current workflow (come to Claude.ai, paste a primer, ask Claude to update Notion) is too much friction. HQ eliminates that loop entirely.  
**Implications:** Claude API is called server-side. System prompt includes current entity context and knowledge store summary. Chat history is stored in the chat_history module. Token usage is monitored and rate-limited.

---

### D-012 — SF marketing website stays separate
**Date:** April 2026  
**Decision:** streichforce.com (Astro, SKStreich/sf-website, Netlify) remains a separate standalone site with no codebase connection to sf-sonja-hq or sf-ops.  
**Rationale:** Marketing site has different goals, different audience, different build cadence. Keeping it separate prevents breaking production platform on marketing site changes.  
**Implications:** Login link on marketing site deep-links to HQ or SF Ops auth. No shared codebase.

---

### D-013 — Smart queries only — users must define criteria before data is fetched
**Date:** April 2026  
**Decision:** Every query in HQ — whether code-level or user-facing — must be intentional and specific. No unbounded queries, no select(*) in production, no open-ended exports. Users must define entity, type, date range, and columns before any significant data fetch executes. Cost containment is a first-class design requirement, not an afterthought.  
**Rationale:** Poorly scoped queries are expensive at the database level, the Claude API level, and the TM API level. A user who needs two columns of data should never trigger a query that returns thirty. Forcing specificity keeps costs contained and encourages better data thinking.  
**Implications:**  
- All Supabase queries use explicit column selection — never select(*)  
- All list queries have a hard limit (default 50, max 200 without pagination)  
- All exports require user to select columns and set a date range  
- Row count preview shown before any export executes  
- Hard cap: 1,000 rows without confirmation, 10,000 rows absolute maximum  
- Claude API calls: maximum 20 knowledge items per call — use semantic search to narrow first  
- TM API calls: always specify date range and fields — never open-ended  
- See universal-build-standard.md Section 10 for full implementation rules

---

## Open Items (not yet decided)

| # | Question | Context | Target |
|---|---|---|---|
| OI-001 | Final stack: Railway + Cloudflare + Clerk vs. Supabase + Vercel + WorkOS | See D-008 | Separate evaluation session |
| OI-002 | Auth provider for SSO: WorkOS vs. Clerk | Depends on stack evaluation | After OI-001 |
| OI-003 | Light-version SF logo asset | Needed before UI work begins | Before Sprint 2 |
| OI-004 | Exact SF brand color hex values | Extract from streichforce.com CSS | Before Sprint 2 |
| OI-005 | Claude API model split: haiku for classification, sonnet for reasoning | Cost optimization — confirm before Sprint 2 | Before Sprint 2 |
| OI-006 | Client Project Module | Logged as future module concept — not yet scoped | See project-module-stub.md |

---

*This log is the canonical source of truth for HQ architectural decisions.*  
*Read it before building anything. Update it when new decisions are made.*
