# Sonja HQ — Platform Specification

**Version:** 1.0  
**Created:** April 2026  
**Status:** Approved — ready for Claude Code implementation  
**Repo:** SKStreich/sf-sonja-hq  
**Local path:** ~/OneDrive/Documents/GitHub/HQ/sf-sonja-hq/  
**Live URL:** hq.streichforce.com  
**Supabase project:** sonja-hq  

---

## What This Is

Sonja HQ is a standalone personal command center and intelligent knowledge platform for Sonja Streich. It is **not** a module inside sf-ops. It is a separate application that shares auth with SF Ops via SSO.

It replaces Notion as Sonja's source of truth for all decisions, strategies, brand assets, documents, and session context.

**Design motto:** Keep it simple, stupid. Keep it smart, silly.  
The interface is dead simple. The intelligence lives underneath.

---

## Architecture

### Standalone App — Non-Negotiable
- HQ = separate app, permanently
- Connected to SF Ops via shared auth (SSO)
- Single login across all apps
- Deep links between HQ and SF Ops work seamlessly
- HQ has its own Supabase project — never shares with sf-ops

### Stack (current — subject to stack evaluation)
- Frontend: Next.js 14 + App Router
- Database: Supabase (Postgres + RLS)
- Auth: Supabase Auth — magic link — shared SSO with SF Ops
- Hosting: Vercel (under evaluation — see decisions log)
- Styling: Tailwind CSS
- Components: shadcn/ui only — no custom primitives
- AI: Claude API (claude-sonnet-4-20250514)
- Testing: Vitest + Playwright

### Stack Evaluation (separate session — not yet decided)
Under evaluation: Railway + Cloudflare + Clerk  
Do not make stack-dependent decisions until evaluation is complete.  
All specs are stack-agnostic where possible.

### Three Entities (always present)
```
tm        — Triplemeter
sf        — Streich Force
personal  — Sonja Streich personal
```

---

## The Core Loop

```
You (type · paste · upload) 
  → Claude (resident in HQ — no primers to paste)
    → reads Knowledge Store
    → classifies · acts · saves · answers
      → Knowledge Store (versioned · searchable)
        → feeds all 8 modules
```

Claude is embedded via the Claude API. Claude has direct read access to Tier 1 of the knowledge store on every conversation. No context primers required. No manual updates. Claude handles it.

---

## Eight Modules

### 1. Command Dashboard
- Entity tabs: TM · SF · Personal
- Metrics overview per entity
- Focus banner — what matters today
- Entry point to all other modules

### 2. Knowledge Base *(primary module — center of HQ)*
- Decisions, strategy docs, session primers, brand assets, marketing docs, business documents
- One unified record type — no folders, no filing
- Claude auto-classifies — user can override any classification
- Full-text search + semantic search — search by question or keyword
- Version history on every item automatically
- Shareable — user controls who, what, how long, revocable anytime
- Replaces: Notion, OneDrive, scattered MD files, session primers
- See Knowledge Store spec below for full data model

### 3. Project Tracker
- All projects across TM · SF · Personal entities
- Status pipeline view
- Linked to tasks and knowledge items

### 4. Task Manager
- GTD-style: Today · This Week · Backlog · Someday
- Linked to projects
- Quick capture from any device

### 5. Idea Library
- Capture ideas tagged by entity
- Status lifecycle: Raw → Developing → Approved → Shipped · Parked
- Linked to projects when idea becomes active

### 6. Chat History
- Every conversation with Claude inside HQ is stored
- Searchable by topic, date, entity
- Linked to knowledge items created or updated in that session
- Replaces: Claude.ai chat history as reference source

### 7. Integrations Hub
- Manage connections: Claude API · MS365 · Slack · GitHub · TM API
- Status per integration — active · error · disconnected
- No Notion integration — Notion replaced by HQ

### 8. AI Digest
- Claude reads live data from knowledge store + all modules
- Produces daily prioritized brief
- Surfaced on dashboard
- Configurable: which entities, which modules, what time

---

## Knowledge Store — Full Data Model

### Design Principle
No folders. No filing required. Drop something in — Claude handles the rest.

---

### Two-Tier Security Architecture

#### Tier 1 — Claude-Accessible
Everything Claude can read and work with.  
Lives in: `knowledge_items` table + Supabase Storage Tier 1 bucket.

**Content types (auto-classified by Claude, overridable):**
- `decision` — locked architectural or strategic choice
- `strategy` — primer, spec, playbook, process definition
- `primer` — Claude session context block
- `brand` — brand assets, guidelines, visual identity
- `marketing` — campaigns, marketing plans, copy
- `business` — contracts, agreements, reference docs
- `idea` — captured idea (links to Idea Library)

#### Tier 2 — Vault (Claude Cannot Read)
Claude never touches anything in this tier. Ever.  
Lives in: Supabase Storage Tier 2 bucket — separate RLS — no app reads.

**Content types:**
- Government IDs — passports, driver's licenses
- Health records and insurance documents
- Financial account numbers and statements
- Sensitive legal documents with PII

**Access:** Direct signed URL — you only. Never shareable via link. Never passed to Claude API.

---

### Tier 1 — knowledge_items Table

```sql
knowledge_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  title           text,                    -- auto-generated or user-set
  body            text NOT NULL,           -- full content
  entity          text NOT NULL,           -- 'tm' | 'sf' | 'personal'
  type            text NOT NULL,           -- see content types above
  tags            text[],                  -- auto-generated array
  status          text DEFAULT 'active',   -- 'draft' | 'active' | 'archived'
  confidence      float,                   -- Claude's classification certainty
  classification_overridden boolean DEFAULT false,
  overridden_by   uuid REFERENCES auth.users(id),
  version         integer DEFAULT 1,
  fts             tsvector,                -- full-text search vector
  embedding       vector(1536),            -- semantic search vector
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
)
```

**Indexes required:**
```sql
CREATE INDEX ON knowledge_items (user_id);
CREATE INDEX ON knowledge_items (entity);
CREATE INDEX ON knowledge_items (type);
CREATE INDEX ON knowledge_items (status);
CREATE INDEX ON knowledge_items USING GIN (fts);
CREATE INDEX ON knowledge_items USING ivfflat (embedding vector_cosine_ops);
```

---

### Version History — knowledge_versions Table

```sql
knowledge_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES knowledge_items(id),
  version         integer NOT NULL,
  body_snapshot   text NOT NULL,           -- full body at this version
  diff            text,                    -- what changed
  changed_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz DEFAULT now()
)
```

Every save creates a new version row automatically. Any prior version is restorable.

---

### Sharing — knowledge_shares Table

```sql
knowledge_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES knowledge_items(id),
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  share_token     text UNIQUE NOT NULL,    -- unique link token
  recipient_email text,                   -- optional — specific person
  access_level    text DEFAULT 'read',    -- 'read' only for now
  expires_at      timestamptz,            -- null = no expiry
  revoked         boolean DEFAULT false,
  revoked_at      timestamptz,
  created_at      timestamptz DEFAULT now()
)
```

**Sharing rules (non-negotiable):**
- User controls: who · what · how long · revocable anytime
- Share token grants read-only access to that item only
- Vault items (Tier 2) are never shareable — no exceptions
- Expired or revoked tokens return 404 — never reveal the item exists

---

### Attachments
- Stored in Supabase Storage Tier 1 bucket
- Linked to knowledge_items via item_id
- Images · PDFs · files
- Claude can read attachments in Tier 1

---

### RLS Policies (required on all tables)
```sql
-- knowledge_items: user sees only their own rows
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_items_owner_only"
ON knowledge_items FOR ALL
USING (user_id = auth.uid());

-- knowledge_shares: public read via share token (read-only, not revoked, not expired)
CREATE POLICY "knowledge_shares_token_read"
ON knowledge_items FOR SELECT
USING (
  id IN (
    SELECT item_id FROM knowledge_shares
    WHERE share_token = current_setting('app.share_token', true)
    AND revoked = false
    AND (expires_at IS NULL OR expires_at > now())
  )
);
```

---

## Input Methods

All three input methods must work on mobile and desktop:
- **Type** — text input, voice-to-text on mobile
- **Paste** — text, links, code blocks
- **Upload** — images, PDFs, files → Tier 1 or Tier 2 based on type

Claude processes every input: generates title if absent, classifies type, generates tags, calculates confidence score, updates fts vector and embedding.

---

## Search

Search is available everywhere in HQ at all times.

Two modes that work simultaneously:
- **Keyword search** — "Stripe invoicing" → matches title, body, tags
- **Question search** — "what did I decide about Stripe?" → semantic vector match

Search never reaches Tier 2 vault items.

---

## Sprint Plan

### Sprint 1 (start here)
- All Tier 1 tables: knowledge_items, knowledge_versions, knowledge_shares
- RLS policies on all tables
- Auth shell: magic link, session management
- Next.js scaffold: App Router, entity tab nav, responsive layout
- Vitest RLS tests — written first, must fail before policies, must pass before merge

### Sprint 2
- Knowledge Base UI: capture, view, search, classify, override
- Claude API integration — classification + title generation
- Version history UI

### Sprint 3
- Command Dashboard
- Task Manager
- Idea Library

### Sprint 4
- Project Tracker
- Chat History module
- Sharing UI + share token routes

### Sprint 5
- AI Digest
- Integrations Hub
- Vault (Tier 2) — upload + access UI

### Sprint 6
- Mobile optimization pass
- Performance + accessibility audit
- Full Playwright E2E suite

---

## Key Notion References (transitional — migrate to HQ Knowledge Base)
- Sonja HQ Spec: https://www.notion.so/33e2ad2fd8b181bbbd75eb5338a3450f
- Universal Build Standards: https://www.notion.so/33e2ad2fd8b181f2a7c7de5870c462fe
- SF Master Hub: https://www.notion.so/3212ad2fd8b181fab5dac5ee8bddccd0

*Note: Notion is being replaced by HQ Knowledge Base. These are read-only references during migration.*
