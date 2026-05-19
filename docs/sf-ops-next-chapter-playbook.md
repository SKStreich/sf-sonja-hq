# SF Ops — Next-Chapter Playbook

**For reference / carry-over to the `sf-ops` repo.** This doc lives in `sf-sonja-hq` because that's where we wrote the retrospective; copy whatever's useful into the SF Ops repo as you go.

Last updated: 2026-04-27.
Companion doc: [`docs/sonja-hq-retrospective.html`](./sonja-hq-retrospective.html) — the lessons learned that this playbook applies.

---

## 0 · Where SF Ops Is Today (per `project_sf_ops_complete.md`)

✅ Built and shipped:
- WO list / create / detail / import pages
- DMG CSV import (3-step flow with dedup via `(source, source_ref)`)
- Status state machine: `draft → assigned → in_progress → pending_close → closed`
- Close-out gates (notes ≥10ch, ≥1 photo, parts confirmed, GPS check-in)
- NTE budget flag + supervisor approval
- Slack alerts (`postNteAlert`, `postStatusAlert`) via webhook, no-op if unset
- Categories table (HVC, PLM, ELC, GEN, CRP, PNT, FLR, EXT, SAF)
- 81 unit/RLS tests passing

🟡 Currently queued (your P1–P8 list):
- P1 Dashboard stat cards with live data
- P2 Mobile status-transition verification
- P3 Locations table seeded with real Walgreens data
- P4 WO detail inline editing
- P5 Photo upload + GPS check-in
- P6 Invoice / closed-date tracking
- P7 Additional CSV import sources
- P8 Materials / inventory

The rest of this doc maps **Sonja HQ patterns** to those queued items, plus the things on the horizon you haven't scoped yet (customer signoff, multi-client expansion, role-gated UIs).

---

## 1 · Day-1 Hardening Checklist (do these now, before more features)

These are the non-negotiable security + reliability items the Sonja HQ retrospective surfaced. SF Ops is on Netlify (not Vercel), so a couple of items differ.

### Account security
- [ ] **2FA + recovery codes** on every cloud account: Supabase (`ehvfukilzulmyyszmjiy`), Netlify, GitHub (`sf-ops` repo), Cloudflare (DNS for `sfops.netlify.app` + custom domain when you add one), Slack (the workspace receiving alerts), Anthropic if SF Ops calls Claude. Save codes to a password manager.
- [ ] Confirm **email account 2FA** is on (compromised email = compromised everything).

### Custom domain (resolution #8)
- [ ] **`ops.streichforce.com`** — add CNAME record in Cloudflare pointing at the Netlify domain alias (Netlify dashboard → Domain settings → Add custom domain → it shows you the target).
- [ ] **Netlify domain config** — add `ops.streichforce.com` as the primary domain; Netlify provisions Let's Encrypt SSL automatically.
- [ ] **`NEXT_PUBLIC_APP_URL`** — set to `https://ops.streichforce.com` in production env.

### Supabase auth
- [ ] **Site URL** set to the production custom domain (`https://ops.streichforce.com`) once DNS is live.
- [ ] **Redirect URLs** allow-list includes BOTH the custom domain and Netlify deploy previews. Patterns:
  - `https://ops.streichforce.com/auth/callback`
  - `https://*--sfops.netlify.app/auth/callback` (deploy-preview shape — confirm in Netlify dashboard)
- [ ] If SF Ops grows to use magic-link auth: log out, request a fresh link, verify it works on a deploy preview URL before the next launch.

### CSS
- [ ] Confirm `:root { color-scheme: light dark }` (or whichever the brand intent is — SF brand is dark) is declared in `globals.css`. Don't let Chrome's Auto Dark Mode flag invert your intentional dark theme into a glitched light mockery. (Sonja HQ ate two hours of debugging on this.)

### Environment variable inventory
Maintain a `docs/env-vars.md` in the SF Ops repo. Each row: var name, where it's used, where to rotate, who has access. Today that's at minimum:
- `NEXT_PUBLIC_APP_URL`
- `SLACK_WEBHOOK_URL`
- Supabase URL + anon key + service role key
- (when added) `RESEND_API_KEY` for email, `STRIPE_*` for billing, `CRON_SECRET` for scheduled jobs

### Storage backups
- [ ] Decide before P5 (photo upload) lands: **what's the off-platform backup for `work-order-photos`?** Walgreens-related photos are likely contractually retained. Options from Sonja HQ retrospective:
  - **Minimum:** accept Supabase storage as the only copy, document the risk.
  - **Standard:** Cloudflare R2 nightly sync via scheduled function (~$0.015/GB-month). Set up before P5 launches.
  - **Paranoid:** R2 + a quarterly export to S3 Glacier or local NAS.

> **Recommendation:** stand up the Standard tier (R2 sync) the same week P5 ships. Don't let unbacked-up photos accumulate.

---

## 2 · Patterns To Carry Over From Sonja HQ

| Sonja HQ pattern | Where it applies in SF Ops |
|---|---|
| Single-table data model with `kind` enum | Already happening with `work_orders` + status enum. Resist adding parallel tables for "quotes" or "invoices" — extend the same shape with a `kind` column or a related row. |
| Server actions for everything | You're already on `useActionState` (React 19). Keep it. Avoid REST routes unless something external calls them (cron, webhooks). |
| Sandboxed iframe for any user-supplied HTML | When the customer signoff page renders WO details supplied by techs, wrap any rich-text in a sandboxed iframe. Tech-supplied notes shouldn't be able to inject scripts onto a customer-visible page. |
| Admin client for public flows | Customer signoff route uses the admin client + a token. RLS doesn't apply because the customer has no account. |
| `parent_id` for hierarchy | Use this for **change orders** on a parent WO. Re-use the same column pattern. |
| Versions table for audit | You already have `work_orders` audit needs (compliance). Add a `work_order_versions` table that snapshots on every save. JSONB blob is fine — fast, queryable enough. |
| Optimistic UI for list mutations | When tech changes status from "in_progress" to "pending_close" on mobile, the list updates instantly even before the server confirms. `router.refresh()` alone isn't enough. |
| Named foreign keys | Already discussed below in §4. Critical for any table with multiple FKs to the same target. |
| Memory file per module | Already in place: `project_sf_ops_complete.md`. Keep updating it after every PR. |
| Phased PRs (A → B → C) | Photo upload (P5) is a perfect example: PR-A migration + bucket + RLS, PR-B mobile camera UI, PR-C R2 backup sync. |

---

## 3 · The P1–P8 List, Annotated

Not detailed implementation — just the Sonja HQ pattern that fits and the gotchas to dodge.

### P1 — Dashboard stat cards with live data

**Pattern from Sonja HQ:** the `/dashboard` page in `sf-sonja-hq` runs `Promise.all` over server queries and renders metric tiles with hint text ("inbox clear" vs "5 awaiting"). The Knowledge Hub page does the same with `getHubMetrics()`.

**For SF Ops:**
- Build a `getWorkOrderAnalytics()` function in `queries/work-orders.queries.ts` (you already have one — extend it). Return `{ totals, byStatus, nteExceededCount, overdueCount, closedThisMonth }`.
- The dashboard page calls it once via `Promise.all` with any other tile queries, passes the result to a client component for render.
- **Don't** poll on the client. If techs need real-time, use Supabase Realtime subscriptions on the `work_orders` table (debounced).

**Carry the count-tile-as-filter pattern:** Sonja HQ's Tasks page (PR #8) made the four count tiles double as the status filter. Apply this to your dashboard so clicking "Pending Close" filters the WO list.

### P2 — Mobile status transitions

**Lesson from Sonja HQ:** server actions return `{ data, error }` but the SDK doesn't throw on 4xx — you have to check the error explicitly. The optimistic-UI pattern requires the action to return the inserted/updated row.

**For SF Ops mobile:**
- Confirm `updateWOStatus` returns the updated row.
- The mobile UI optimistically updates local state, calls the action, then reconciles. If the server rejects the transition, snap back and show a toast.
- Test on actual mobile (not just responsive DevTools) — touch targets, viewport math, and battery-saver throttling can hide bugs.

### P3 — Locations table seeding

**Lesson from Sonja HQ:** the `add_sfe_entity` migration seeded a row by cloning `org_id`/`created_by` from an existing row, so no hardcoded UUIDs.

**For SF Ops:**
- Source of truth for Walgreens stores is the DMG export. Two options:
  - **Build into the import flow** (preferred): when the CSV preview encounters an unknown `Store Number`, offer "Create location" inline. New rows fill `store_number, name=<from CSV>, address, city, state, zip` from the parsed Address.
  - **One-off seed migration**: write `supabase/migrations/<date>_seed_locations.sql` with `INSERT … ON CONFLICT DO NOTHING` and a hardcoded list. Acceptable if the list is < 100 rows.

**Either way:** don't blocks WO import on missing locations. Allow import with `location_id = NULL`, surface "5 WOs missing location" as a dashboard warning.

### P4 — WO detail inline editing

**Pattern from Sonja HQ:** the EntryDetail page edits title/body/kind/entity inline with a Save button at the top right that's disabled until `dirty=true`. After save, `router.refresh()` AND local state update.

**For SF Ops:**
- Inline-edit fields: `title`, `description`, `internal_notes`, `client_facing_notes`, `scheduled_at`, `due_at`, `priority`, `category_id`, `assigned_to`.
- Add a `work_order_versions` table on the same migration so every save snapshots. RLS on read = same as parent WO. Admin client used by future audit-export tools.
- "Reassign" and "change category" can be dropdowns next to the field. "Reassign" specifically should also fire a notification to the new assignee (extend the type allow-list — see §6).

### P5 — Photo upload + GPS check-in

**Patterns from Sonja HQ:**
- Storage bucket with `{org_id}/{user_id}/{uuid}-{safeName}` path scheme.
- 25 MB limit enforced before upload.
- Mime-type allow-list (in this case: `image/jpeg`, `image/png`, `image/heic`, `image/webp`).
- Signed URL access via admin client for non-authenticated viewers (e.g., customers).
- Client component captures via `<input type="file" accept="image/*" capture="environment">` for camera; uploads via FormData (lesson #14).

**SF Ops specifics:**
- **Storage bucket** name: `work-order-photos`. RLS: read by org members + via signed URL; write by assigned tech only.
- **EXIF preservation** considered? Photos with GPS embedded in EXIF help compliance. If you strip EXIF for privacy, capture lat/lng separately.
- **Offline queue:** field techs lose signal. Either accept that uploads happen on reconnect (use a service worker + IndexedDB queue), or surface "X photos pending upload" in the WO header. Decision needed before the mobile UX is final.
- **GPS check-in button:** call `navigator.geolocation.getCurrentPosition` with high-accuracy + timeout. Write `checkin_lat / checkin_lng / checkin_at`. Fall back to "Enter location manually" if denied.
- **Increment `close_photo_count`** as a transaction with the upload — don't drift between actual photos in the bucket and the count column.

### P6 — Invoice / closed-date tracking

Schema sketch (extend in migration):

```sql
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,           -- already may exist
  ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoiced_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS invoice_external_id TEXT,        -- if QuickBooks etc. is integrated
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;
```

Status enum extends to `closed → invoiced → paid` (paid is terminal).

**Don't** model invoices as a separate table yet — most WOs map 1:1 with an invoice line item. Only if you start consolidating multiple WOs onto a single invoice do you need a separate `invoices` table.

### P7 — Additional import sources

**Pattern:** `dmg-parser.ts` is well-isolated. For new sources:
1. Create `<source>-parser.ts` in `modules/work-orders/utils/`.
2. Define a column-mapper UI step in the import flow that lets the user pick which CSV columns map to which WO fields. Persist the mapping to a `import_templates` table keyed by `(org_id, source, client_or_portal_name)`.
3. After successful preview, save the mapping so next month's import skips the column-mapper step.

**Carry the dedup pattern:** every source uses `(source, source_ref)` as the partial unique index. New sources just need a unique `source` string.

### P8 — Materials / inventory

This is its own design doc, but the carry-over patterns:
- **Receipt OCR** → use Claude Vision (Anthropic API) to parse a tech's photo of a hardware-store receipt. Sonja HQ doesn't do this yet, but the API client + cost-tracking pattern is already in `sf-sonja-hq/src/app/api/agent/actions.ts` — copy the shape.
- **Inventory ledger:** single table `materials_movements` with `{ wo_id, item_id, quantity, unit_cost, source: 'purchase'|'used'|'returned', receipt_storage_path }`. Sum query gives current on-hand per item.
- **Item catalog:** seeded from receipt parse + manual entry. Per-org so different SF entities have different inventories.
- This is **Phase 3** territory — don't block P1–P6 on it.

---

## 4 · Schema Additions for the Next Chapter

What's missing today that will be needed soon, ordered by likely first need.

### Customers — comprehensive shape (per resolution #1)

Designed to handle every SF entity's customer model: B2B with corporate-parent → site hierarchy (Walgreens → individual stores), B2B flat (consulting clients), and B2C individuals. External-id columns let it federate with DMG, Stripe, and QuickBooks without bolting on later.

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,                       -- 'sf' | 'sfe' | 'sfc' | 'personal'
  parent_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,  -- for store-of-corporate hierarchies
  customer_type TEXT NOT NULL DEFAULT 'business',  -- 'business' | 'individual' | 'site'
  display_name TEXT NOT NULL,                      -- 'Walgreens', 'Walgreens #4039', 'Acme Logistics', 'Jane Doe'
  legal_name TEXT,                                 -- formal billing name if different
  primary_contact_id UUID,                         -- → customer_contacts.id (defined below)
  billing_address JSONB,
  shipping_address JSONB,
  default_terms TEXT,                              -- 'net-30', 'on-completion', etc.
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','archived','prospect','churned')),
  external_dmg_client_id TEXT,                     -- DMG portal id
  external_stripe_customer_id TEXT,                -- when Stripe lands
  external_quickbooks_customer_id TEXT,            -- when QB lands
  external_other JSONB DEFAULT '{}'::jsonb,        -- catch-all for future portals
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, entity_type, display_name)
);

CREATE INDEX idx_customers_parent ON customers (parent_customer_id) WHERE parent_customer_id IS NOT NULL;
CREATE INDEX idx_customers_org_entity ON customers (org_id, entity_type, status);
CREATE INDEX idx_customers_dmg ON customers (external_dmg_client_id) WHERE external_dmg_client_id IS NOT NULL;

-- Multiple contacts per customer (signer, AP, dispatcher, primary, etc.)
CREATE TABLE customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,                                       -- 'primary', 'billing', 'site_manager', 'dispatcher', 'signer'
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  receive_signoff_links BOOLEAN NOT NULL DEFAULT FALSE,
  receive_invoices BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_contacts_customer ON customer_contacts (customer_id);

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

-- If you want locations to roll up to customers:
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
```

**Seed strategy for the Walgreens-via-DMG case:**
- One root row: `display_name='Walgreens', customer_type='business', external_dmg_client_id='<from DMG>'`.
- Each Walgreens store becomes a child row: `display_name='Walgreens #4039', customer_type='site', parent_customer_id=<walgreens.id>`. Or — simpler v1 — leave stores in the existing `locations` table and just point them at the single Walgreens customer via `locations.customer_id`. Choose based on whether you ever need to bill stores independently.
- Each contact (DMG dispatcher, store manager, etc.) becomes a `customer_contacts` row with the appropriate `receive_*` flags.

**Seed strategy for SF Solutions / Containers / Personal:**
- Each new client is its own customer row with `parent_customer_id = NULL`.
- Individual customers (B2C) use `customer_type='individual'`, `legal_name = full legal name`.

### `work_order_share_tokens` (for customer signoff / quote acceptance / status pages)

```sql
CREATE TABLE work_order_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('view','signoff','quote_accept','receipt')),
  token TEXT NOT NULL UNIQUE,
  recipient_name TEXT,
  recipient_email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  signature_storage_path TEXT,                -- when purpose='signoff' and customer signed
  signed_name TEXT,
  signed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wost_token ON work_order_share_tokens (token);
CREATE INDEX idx_wost_wo ON work_order_share_tokens (work_order_id, created_at DESC);
```

Public route shape: `/signoff/[token]`, `/quote/[token]`, `/receipt/[token]`. Each resolves the token via the admin client (no auth), verifies `expires_at` and `revoked_at`, then renders the appropriate page.

### `work_order_links` (for related items beyond a primary asset)

If a WO touches multiple assets, references a parent WO (change order), or links to a knowledge entry / SOP doc, store the relations here:

```sql
CREATE TABLE work_order_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  related_type TEXT NOT NULL,                  -- 'asset' | 'parent_wo' | 'invoice' | 'sop' | 'photo_set'
  related_id UUID NOT NULL,
  relation_label TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `work_order_versions` (audit snapshot)

```sql
CREATE TABLE work_order_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  version INT NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (work_order_id, version)
);
```

Insert a row on every save in the inline-edit action. Cheap insurance for compliance + debugging "who changed what when".

---

## 5 · Customer-Facing Public Surfaces

When SF Ops needs to send a customer a link (signoff, status update, receipt), follow the Sonja HQ `/share/[token]` pattern.

### Routes

| Route | Purpose | Generated when |
|---|---|---|
| `/signoff/[token]` | Customer reviews WO + signs to mark complete | When tech submits "ready for customer signoff" |
| `/quote/[token]` | Customer reviews + accepts a quote (creates a WO in `assigned` state) | When dispatcher creates a quote |
| `/receipt/[token]` | Customer sees a signed PDF + paid receipt | After `paid_at` is stamped |
| `/status/[token]` | Customer sees live status (en-route, on-site) without signing in | Optional — for premium customers |

### Signoff UX

1. Tech finishes work, marks WO `pending_close`. All four close-out gates are met.
2. Tech taps "Send to customer for signoff" → server action mints a `work_order_share_tokens` row with `purpose='signoff'`, `expires_at = now + 7 days`. Email sent via Resend with subject "Please sign for service at <location>".
3. Customer opens the link → `/signoff/[token]` page renders WO summary, photos, technician notes (`client_facing_notes` only — never `internal_notes`), and a signature canvas.
4. Customer types name + draws signature → POST. Action stores the signature image to `work-order-photos/signatures/{wo_id}/{uuid}.png`, stamps `signed_at` and `signed_name` on the share token.
5. WO transitions `pending_close → closed`. Slack alert via `postStatusAlert`.

### Lessons from Sonja HQ for these routes

- **Lockdown CSS:** signoff/receipt pages should disable text selection + right-click via the same `user-select: none` + `oncontextmenu` blockers from `ShareViewer.tsx`. Soft deterrent only — document that.
- **Watermark:** for signed receipts, render a faint diagonal repeating watermark with the customer's name + sign timestamp. Same SVG approach used in Sonja HQ.
- **No auth allow-list dependency:** these routes are entirely public via admin client; no Supabase redirect URL config needed.

---

## 6 · Notifications — Type Allow-List Policy

### The lesson from Sonja HQ
The `notifications` table had a `CHECK (type IN (...))` constraint that silently rejected `'share_forward_request'` because it wasn't in the enum. Inserts didn't throw, just failed. The bell stayed empty for weeks.

### Policy for SF Ops
1. **Plan the type allow-list ahead of every feature** that will fire a notification.
2. **The first migration that touches `notifications` should declare the full set** of likely types, not just the ones being used today. Adding new ones later is a constraint-replacement migration each time.
3. **`entity_type` allow-list** should similarly include every table that can be referenced.
4. **Every `.insert()` on `notifications` must `await { error }` and log the error** if any.

### Suggested SF Ops type allow-list (from day 1)
```
'wo_assigned', 'wo_status_changed', 'wo_completed', 'wo_signed',
'wo_overdue', 'wo_due_soon', 'wo_nte_exceeded', 'wo_nte_approved',
'wo_comment_added', 'quote_accepted', 'invoice_overdue',
'photo_uploaded'
```

### `entity_type` allow-list
```
'work_order', 'customer', 'location', 'asset', 'invoice', 'photo'
```

---

## 7 · Auth & Roles

You already have `assigned_to` on WOs. The roles likely emerging:

| Role | Can do |
|---|---|
| **Owner** | Everything. You + Scott. |
| **Dispatcher** | Create WOs, assign, edit any WO, approve NTE, view all photos. |
| **Tech** | View only own assigned WOs, update status (state-machine constrained), upload photos, GPS check-in, flag NTE. |
| **Read-only** | Dashboards + reporting only. (Auditor / accountant role.) |
| **Customer** | NO account. Receives time-bound tokens for signoff/receipt. |

**RLS pattern:**
- `org_id` filter on every table (you already have this).
- `user_profiles.role` field stores `'owner'`, `'admin'`, `'dispatcher'`, `'tech'`, `'read_only'`.
- Policies: tech can `SELECT` only WOs `WHERE assigned_to = auth.uid()`. Dispatcher can `SELECT` all. Owner/admin can do anything.

**Edge cases:**
- A tech reassigned mid-job loses access to their own history of that WO. Solution: `wo_assignments` ledger that grants temporal access; or just let them keep read access on WOs they were ever assigned to (`wo_assignments WHERE assigned_to = auth.uid()`).

---

## 8 · Integration Roadmap

| Integration | Status today | Next step |
|---|---|---|
| **Slack** | ✅ NTE + status alerts via webhook | Add a "ping tech via Slack" action when a WO is reassigned or due-soon |
| **DMG portal** | ✅ CSV import | If DMG has an API, replace CSV with daily pull. Sonja HQ's cron pattern (`/api/cron/sync-usage` + `CRON_SECRET`) is the template. |
| **Resend (email)** | ❌ Not yet integrated | Needed for customer signoff emails. Verify domain + API key the day you start P5. |
| **Stripe / payment** | ❌ Not yet | Needed for P6 paid_at tracking. Use Stripe Payment Links initially — no full Stripe integration needed for v1. |
| **QuickBooks** | ❌ Not yet | Future: push closed WOs as invoices. The `invoice_external_id` column above accommodates this. |
| **Twilio / SMS** | ❌ Not yet | Tech texts when assigned/reassigned, customer texts before tech arrives. Lower priority than Slack. |
| **Anthropic / Claude** | ❌ Not yet | When P8 (materials/inventory) lands, Claude Vision parses receipts. Sonja HQ's `logAnthropicCall` cost-tracking helper transfers over. |
| **Cloudflare R2** | ❌ Not yet | Storage backup for `work-order-photos`. Needed before P5 ships at scale. |

---

## 9 · Open Questions to Resolve Before the Next PR

Following the Sprint 10 pattern of "decide before code." Each of these has options; pick one and document the rationale.

1. **Multi-customer model** — does the customer schema land before or after the Walgreens-via-DMG flow stabilizes? Before, this needs to be comprehensive and inclusive
2. **Signoff transport** — do customers get the link via email (Resend), SMS (Twilio), or both? Both
3. **Photo retention** — months, years, indefinite? Drives the R2 sync schedule and Glacier tier. 1 year
4. **Mobile shell** — PWA (cheaper, web-only), Capacitor wrapper (offline + native camera, mid effort), or full React Native (most flexibility, most work)? Decision drives photo-upload UX. need the easiest for blue collar workers but cost effective
5. **Tech offline support** — full offline queue with local DB, or "you must have signal to update status"? Drives mobile shell + service-worker investment. Need offline updates
6. **Reporting** — when do techs/dispatchers need real reports (utilization, NTE accuracy, on-time-completion)? Affects whether you build a reporting layer in v1 or v2. V2
7. **Walgreens contract retention** — what's the legal photo retention requirement? Drives backup posture. Unknown at this time
8. **Subdomain layout** — `sfops.streichforce.com`? `ops.streichforce.com`? Or stays on Netlify for v1 + custom domain only when launching to a real customer? Affects auth + DNS setup. I already have hq.streichforce.com, so we should set up ops.streichforce.com

---

## 9.5 · Resolutions Recap & Implications

### Decisions locked in (2026-04-27)

| # | Question | Decision |
|---|---|---|
| 1 | Customer schema timing | **Land first**, designed comprehensively for B2B (Walgreens-via-DMG, future commercial clients) AND B2C / individual customers across SF Solutions, SF Enterprises, SF Containers. |
| 2 | Signoff transport | **Email AND SMS.** Resend for email, Twilio for SMS. Customer can pick on the share-link generation form. |
| 3 | Photo retention | **1 year minimum.** R2 sync schedule + lifecycle policy honors that floor. Older photos can stay in R2 for free-ish if storage cost stays low. |
| 4 | Mobile shell | **PWA.** No app-store install friction for blue-collar techs. Lowest cost path (one codebase, no Apple/Google review). Combined with #5 = installable PWA + service worker + offline queue. |
| 5 | Offline support | **Required.** IndexedDB queue for status updates and photo uploads. Background sync flushes on reconnect. Conflict policy: last-write-wins on text fields, append-only on photos. |
| 6 | Reporting | **V2.** No reporting in v1. Capture the data correctly so v2 has clean inputs. |
| 7 | Walgreens contract retention | **Unknown.** Default to the 1-year floor from #3. Open action: ask DMG / Walgreens contracts in writing; revise R2 lifecycle if the contractual minimum exceeds 1 year. |
| 8 | Subdomain | **`ops.streichforce.com`** on Netlify. Mirrors the existing `hq.streichforce.com` pattern. |

### What changed in scope because of these answers

1. **PWA + offline-first is a real engineering chunk** that didn't exist before. It's not a single PR — it's a layer cake of service worker, manifest, install prompt, IndexedDB queue, conflict resolution, background sync. Adds ~5–7 days to the realistic phased plan. Worth it for blue-collar UX.
2. **Twilio adds a new vendor** with its own cost model + DR concerns. Add it to `service_configs` from day 1. Domain not relevant; A2P 10DLC registration is.
3. **Customer schema must be richer** than the v0 sketch in §4. Needs to handle: corporate parent → store/site, individual customers, multiple contacts per customer, and external IDs (DMG client id, future Stripe customer id, future QuickBooks customer id).
4. **Custom domain `ops.streichforce.com`** must land in PR-A — Supabase auth Redirect URLs can't be set correctly until the production domain is decided.
5. **R2 backup with 1-year lifecycle policy** is the agreed posture. Schedule the cron the same week P5 (photo upload) ships.
6. **Reporting deferred to V2** means current data model must be reporting-ready: every state change writes to `work_order_versions`, every NTE event has a row, every assignment timestamped. No "fix later" — capture cleanly now.

### New action items extracted from the resolutions

- [ ] **Twilio account + A2P 10DLC registration** — A2P registration takes 1–3 weeks. Start the day signoff SMS becomes a real feature.
- [ ] **DNS record for `ops.streichforce.com`** in Cloudflare → Netlify domain config.
- [ ] **PWA scaffold** — `manifest.webmanifest`, install icons (use the brand mark), service-worker registration. Decide between Workbox (battle-tested) and a hand-rolled SW.
- [ ] **IndexedDB shape** — choose Dexie (typed, queryable) over raw IDB or LocalForage. Outline the queue schema before writing it.
- [ ] **Conflict-resolution write-up** — if a tech is offline for 2 hours and dispatcher reassigns the WO in that window, what wins? Document the rule before coding.
- [ ] **Contractual photo retention** — written request to DMG / Walgreens for the minimum retention requirement. Update the lifecycle policy if it's > 1 year.

---

## 10 · Phased Plan (revised after §9 answers)

Resolutions in §9.5 changed the shape of what fits in each PR. Net effect: PR-A is bigger, a new PR-B-mobile splits off, PR-D is bumped.

### PR-A — Hardening + customer foundations + custom domain (5–7 days)
- Day-1 hardening checklist (§1) completed
- **`ops.streichforce.com` DNS + Netlify domain + Supabase Site URL update**
- Customers table + `customer_id` on `work_orders` (§4) — **comprehensive shape** per resolution #1
  - Supports corporate parent → store/site/asset hierarchy via `parent_customer_id`
  - Supports individual customers (`customer_type = 'individual'`)
  - External-id columns for DMG, Stripe, QuickBooks
- `work_order_share_tokens` table + admin-client resolver (§4)
- `work_order_versions` audit snapshot table (§4)
- Notification type + entity_type allow-lists declared comprehensively (§6)
- Inline editing on WO detail (P4) using optimistic-UI pattern

### PR-B — Customer-facing surfaces + photos + R2 backup (6–8 days)
- `/signoff/[token]` route + canvas signature + email send via Resend
- **Twilio integration:** SMS send fallback for signoff links (start A2P 10DLC registration in parallel — independent of code)
- `work-order-photos` Storage bucket + RLS + GPS check-in + upload UI (P5)
- **R2 nightly storage sync with 1-year lifecycle policy** (DR Standard, per resolution #3)
- Status flow: `pending_close → closed` requires signed-off token (or admin override)

### PR-C — Mobile PWA shell + offline queue (5–7 days)  ⭐ NEW
- `manifest.webmanifest`, brand icons, install prompt (per resolution #4)
- Service worker via Workbox: precache + runtime cache for read endpoints
- IndexedDB queue (Dexie) for offline writes — status transitions + photo uploads + check-ins
- Background sync: flush queue on reconnect with conflict-resolution rules (per resolution #5)
- Visible "syncing N items" indicator on the WO detail page when queue is non-empty

### PR-D — Invoicing + dashboard live data + integration docs (3–5 days)
- Closed/invoiced/paid columns + state-machine extension (P6)
- Dashboard live data (P1) — count tiles double as filters
- One `docs/integrations/<name>.md` per integration (Slack, DMG, Resend, Twilio, R2)
- DR runbook in the SF Ops repo

### PR-E and beyond
- Additional CSV imports + column-mapper UI (P7)
- Materials/inventory + Claude Vision receipt parse (P8)
- **V2 reporting layer** (per resolution #6)

---

## 11 · Cross-Linking To Sonja HQ Reference

Open these from the Sonja HQ repo when you need a concrete example:

| Need | Look at |
|---|---|
| Public token-resolver pattern | `sf-sonja-hq/src/app/api/knowledge/shares.ts` → `resolveShareToken` |
| Public-route layout + lockdown CSS | `sf-sonja-hq/src/app/share/[token]/ShareViewer.tsx` |
| Optimistic UI on list mutation | `sf-sonja-hq/src/components/projects/ProjectDetail.tsx` → `handleAddTask` |
| Bell + click-through | `sf-sonja-hq/src/components/notifications/NotificationBell.tsx` |
| Cron route pattern | `sf-sonja-hq/src/app/api/cron/sync-usage/route.ts` + `vercel.json` |
| Server action with admin-client override for cron | `sf-sonja-hq/src/app/api/usage/actions.ts` → `getOrgContextOrOverride` |
| Email send with proper error logging | `sf-sonja-hq/src/app/api/knowledge/shares.ts` → `createShare` Resend block |
| Migration .sql discipline | every file in `sf-sonja-hq/supabase/migrations/` is hand-written, not just MCP-applied |
| 2FA / DR baseline | `sf-sonja-hq/docs/dr-2fa-checklist.md` |

---

## 12 · One Last Gotcha (specific to SF Ops's stack)

You're on **Next.js 16** + **React 19** + **Tailwind v4** — Sonja HQ is on Next 14 + React 18 + Tailwind v3. A few things differ:

- **Tailwind v4** has its config in `globals.css` via `@theme inline` — there's no `tailwind.config.js`. Don't paste Sonja HQ's `tailwind.config.ts` in. Mirror the brand tokens into `@theme` instead.
- **React 19** uses `useActionState`, not `useFormState`. Sonja HQ predates 19 and uses `useTransition` + manual fetch. The patterns translate but the API surface differs.
- **Next.js 16** route handlers may have stricter caching rules than Sonja HQ's Next 14 routes. If a server action / route seems stale, try `export const dynamic = 'force-dynamic'` first.
- **Netlify** (vs Vercel) — cron declaration goes in `netlify.toml` under `[functions."<name>"]` with a `schedule` field, not `vercel.json`. Authorization-header pattern still applies.

---

**End of playbook.** Treat as living: update as decisions land. The same way `project_sf_ops_complete.md` tracks what's built, this should track what's coming next + the rationale.
