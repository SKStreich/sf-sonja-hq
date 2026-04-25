# Sonja HQ — Universal Build Standard

**Version:** 1.0  
**Created:** April 2026  
**Status:** Locked — Claude Code reads this before touching any module  
**Applies to:** Every module, every component, every migration in sf-sonja-hq  

---

## The Design Motto

> **Keep it simple, stupid. Keep it smart, silly.**

The interface is dead simple. The intelligence lives underneath.  
UI simple. Intelligence deep. Never the other way around.

---

## 01 — Test-First Rules

No code ships without passing tests. This is not a suggestion.

### The Rule
1. Write the test first
2. Confirm the test fails (no false passes)
3. Write the code to make it pass
4. Confirm all tests pass before merge
5. No exceptions — ever

### Database Layer (Vitest)
- RLS policy tests written before any migration runs
- Tests must fail before RLS policies exist
- Tests must pass before any PR merges
- Test command: `npx vitest run src/modules`

**Required RLS tests per table:**
- Owner can read their own rows
- Owner cannot read another user's rows
- Share token grants read-only access to the correct item only
- Expired share token returns nothing
- Revoked share token returns nothing
- Vault items are never returned by any query that Claude touches

### Component Layer (Vitest + React Testing Library)
- Form validation — valid input passes, invalid input shows error
- List renders correctly with data
- List renders empty state correctly
- Mobile viewport render — no overflow, no broken layout
- Desktop viewport render

### Integration Layer (Playwright)
- Claude API call — classification returns a type
- Share link — creates token, token resolves to item, expired token returns 404
- Vault boundary — Tier 2 items never appear in Claude API calls
- Auth — unauthenticated requests redirect to login
- Mobile E2E — full happy path on 390px viewport

---

## 02 — Visual Design System

### Brand Direction
- Source: Streich Force brand (streichforce.com)
- Audience: Blue-collar, practical, direct — not corporate, not trendy
- Feel: Well-built truck interior — solid, clear, everything in the right place
- Strong and bold but easy to work through all day

### Color Palette
Pull exact hex values from streichforce.com CSS before implementing.  
These are directional until extracted:

```
Background:   White (#FFFFFF) or warm off-white — never dark
Surface:      Light warm gray for cards, panels, sidebars
Primary:      SF brand color — used for CTAs, active states, nav highlights
Text primary: Near-black — high contrast, never pure gray on white
Border:       Subtle — 1px, low opacity, never heavy
Error:        Standard red — accessible contrast
Success:      Standard green — accessible contrast
Warning:      Standard amber — accessible contrast
```

**Default mode: Light.**  
Dark mode is available as a user preference but light is the default and primary.  
Reason: daily use, eye strain, readability for glasses wearers.

### Logo Rules
- SF logo — always use the light-background version (not logo-dark.png)
- logo-dark.png was designed for dark backgrounds — do not use on light backgrounds
- A light-version logo asset must exist before UI work begins — flag if missing
- Never distort, recolor, or add effects to the logo

### Component Library
shadcn/ui only — no custom primitives, no third-party component libraries.

```typescript
// Always import from @/components/ui
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
```

---

## 03 — Typography

### Font
- Primary: Inter or Geist Sans (decide at project init — use one, stay consistent)
- Monospace: Geist Mono — code blocks and inline code only
- Never mix font families within the app

### Weights
Two weights only:
- `400` — body text, labels, meta
- `600` — headings, buttons, emphasis

Never use 300, 500, 700, 800, or 900. They break visual consistency.

### Type Scale
```
Page title:    28px · weight 600 · line-height 1.2
Section head:  20px · weight 600 · line-height 1.3
Card title:    16px · weight 600 · line-height 1.4
Body:          16px · weight 400 · line-height 1.6
Label / meta:  13px · weight 400 · line-height 1.4
Code:          14px · Geist Mono · weight 400
```

### Accessibility Rules
- Minimum body font size: 16px — never go below this
- WCAG AA contrast on all text — minimum 4.5:1 ratio
- No light gray text on white backgrounds — fails contrast
- Maximum line length: 72 characters — improves readability
- All text must be selectable — no `user-select: none` on content
- Never use color alone to convey information — always pair with icon or label

---

## 04 — Responsive and Mobile-First

### Breakpoints
```
Mobile:   0px – 768px     ← build here first
Tablet:   768px – 1024px
Desktop:  1024px+
```

### Mobile-First Rules
- Every screen designed at 390px width first
- Desktop layout is an enhancement of mobile — not a shrunk desktop
- Touch targets: minimum 44×44px — no exceptions
- Tap to capture from phone — input must be easy one-handed
- No hover-only interactions — everything must work on touch
- Bottom navigation on mobile — thumb-reachable
- No horizontal scroll on any screen at any breakpoint

### Input on Mobile
- Type: large text input, prominent, always visible
- Paste: standard paste behavior — no friction
- Upload: native file picker — no drag-and-drop required on mobile
- Voice-to-text: leverage device keyboard mic where available

### Performance
- First contentful paint: under 1.5s on mobile (LTE)
- No blocking scripts in `<head>`
- Images: next/image with proper sizing and lazy loading
- No large client-side bundles — use server components where possible

---

## 05 — Security Rules

### Auth
- Magic link auth — no passwords stored
- Session timeout: 8 hours idle
- HTTPS only — no HTTP fallback
- No sensitive data in URL parameters — ever
- Shared links use opaque tokens — never expose item ID in URL

### Data
- RLS on every table — non-negotiable
- Vault (Tier 2) items: separate bucket, separate RLS, Claude never reads them
- No PII in logs, analytics events, or error messages
- Environment variables: never committed to git — .env.local only
- Supabase service role key: server-side only — never in client code

### API
- Claude API calls: server-side only — API key never in browser
- Rate limit Claude API calls per user per day — prevent runaway costs
- All Claude prompts include: system context from knowledge store, entity scope, user preference context

---

## 06 — UX Philosophy — Progressive Disclosure

### The Principle
Simple on the surface. More available when you want it. Never overwhelming. Never hiding important things.

### Navigation Rules
- The right thing is always one tap away
- The deeper thing is always findable — never forced
- No dead ends — always a back path
- Search is available on every screen — always
- Never more than 3 taps to any piece of content

### Information Hierarchy
```
Level 1 — Always visible:    Key metrics, current status, primary action
Level 2 — One tap:           Detail view, related items, secondary actions
Level 3 — Two taps:          History, settings, advanced options
```

### Empty States
Every list, module, and section must have a designed empty state.  
Empty state = a helpful message + a clear call to action.  
Never show a blank screen.

### Error States
Every error must:
- Explain what happened in plain English
- Tell the user what to do next
- Offer a way to retry or escape
- Never show a raw error code or stack trace to the user

### Loading States
Every async operation must show a loading state.  
Use skeleton screens — not spinners — for content loads.  
Spinners are acceptable for actions (save, submit, upload).

### Confirmation Patterns
- Destructive actions (delete, revoke share, archive): require confirmation
- Non-destructive actions (save, classify, tag): save immediately, no confirmation needed
- Never ask for confirmation twice for the same action

---

## 07 — Module Directory Structure

Every module in sf-sonja-hq follows this structure exactly:

```
src/modules/
└── {module-slug}/
    ├── README.md              ← spec — written before any code
    ├── config.ts              ← module metadata
    ├── types.ts               ← TypeScript types
    ├── components/
    │   ├── {ModuleName}.tsx   ← primary UI component
    │   └── index.ts
    ├── hooks/
    │   ├── use{ModuleName}.ts ← primary data hook
    │   └── index.ts
    ├── queries/
    │   ├── {module}.queries.ts ← typed Supabase queries
    │   └── index.ts
    ├── actions/
    │   └── {module}.actions.ts ← server actions
    └── __tests__/
        ├── rls.test.ts         ← RLS tests — written first
        ├── {module}.test.ts    ← component tests
        └── e2e.spec.ts         ← Playwright E2E
```

### Query Rule
All Supabase calls live in `queries/*.ts`.  
No Supabase calls inside components or hooks directly.  
Components call hooks. Hooks call queries. Queries call Supabase.

### Commit Convention
```
feat(module-slug): add knowledge item capture
fix(knowledge-base): correct RLS policy for share tokens
test(knowledge-base): add vault boundary tests
chore(deps): update supabase-js to 2.x
```

---

## 08 — Implementation Workflow

Every module follows this sequence — no skipping steps:

```
1. Write README.md spec — answer all questions before any code
2. Write RLS tests — confirm they fail
3. Write migration SQL — tables, indexes, RLS policies
4. Apply migration — confirm RLS tests now pass
5. Write TypeScript types
6. Write queries (typed Supabase calls)
7. Write hooks (consume queries)
8. Build components (consume hooks, shadcn/ui only)
9. Write server actions (mutations)
10. Write component tests — confirm they pass
11. Write Playwright E2E — confirm they pass
12. PR — all tests must be green before merge
```

---

## 09 — Claude API Integration Rules

Claude is a resident in HQ — not a visitor.

### System Prompt Pattern (every Claude API call)
```typescript
const systemPrompt = `
You are Claude, operating inside Sonja HQ — Sonja Streich's personal command center.
You have access to Sonja's knowledge store (Tier 1 only).
Current entity context: ${entity}
Current date: ${new Date().toISOString()}

Your job:
- Classify and tag new items accurately
- Answer questions using knowledge store context
- Save and update items when instructed
- Never access or reference Vault (Tier 2) items
- Suggest classifications — never lock them without user confirmation
`
```

### Rate Limiting
- Max Claude API calls per user per day: configurable (default 200)
- Long-running operations (bulk classification): queue, do not block UI
- Cache Claude responses where the input hasn't changed

### Cost Awareness
- Use claude-haiku-4-5 for classification tasks (cheaper, fast)
- Use claude-sonnet-4-20250514 for search, digest, complex reasoning
- Log token usage per session for cost monitoring

---

## 10 — Smart Query Rules — Cost Containment

Queries are expensive. Bad queries are wasteful. Every query in HQ must be intentional.

### The Principle
Never fetch more data than the user actually needs. Force specificity at every layer — in the code and in the UI. A user who needs two columns of data should never trigger a query that returns thirty.

### Code-Level Rules

**Select only the columns you need — never use select(\*) in production queries:**
```typescript
// WRONG — fetches every column
const { data } = await supabase.from('knowledge_items').select('*')

// RIGHT — fetch only what this view needs
const { data } = await supabase
  .from('knowledge_items')
  .select('id, title, type, entity, status, updated_at')
```

**Always apply filters before fetching — never filter in JavaScript:**
```typescript
// WRONG — fetches all rows, filters in memory
const items = await getAllItems()
const filtered = items.filter(i => i.entity === 'sf')

// RIGHT — filter at the database level
const { data } = await supabase
  .from('knowledge_items')
  .select('id, title, type, updated_at')
  .eq('entity', 'sf')
  .eq('status', 'active')
  .order('updated_at', { ascending: false })
  .limit(50)
```

**Always set a limit — no unbounded queries:**
```typescript
// Every list query must have a limit
.limit(50)   // default for list views
.limit(10)   // for inline previews and suggestions
.limit(200)  // max allowed — never exceed without pagination
```

**Use pagination for large datasets — never load everything at once:**
```typescript
// Use range-based pagination
.range(page * pageSize, (page + 1) * pageSize - 1)
```

**Use Postgres column selection for exports and reports:**
```typescript
// For data exports — require user to specify columns explicitly
// Never export all columns by default
const exportColumns = userSelectedColumns.join(', ')
const { data } = await supabase
  .from('knowledge_items')
  .select(exportColumns)
  .match(userFilters)
```

### API and External Query Rules

**Claude API queries:**
- Never send the full knowledge store to Claude in one call
- Send only the items relevant to the current query (use semantic search first, send top results)
- Maximum context per Claude call: 20 knowledge items
- For exports and reports, summarize rather than dump raw data

**TM API queries (SF Solutions — read-only):**
- Always specify date ranges — never open-ended queries
- Always specify the data fields needed — never request full records
- Cache TM API responses for minimum 5 minutes — never hammer the API

### UI-Level Rules — Force the User to Be Specific

Every query interface must require the user to define their criteria before results load.

**Search:**
- Minimum 3 characters before search fires — no results on empty input
- Show the user how many results their query will return before they commit to an export

**Filters:**
- Filters are required on any view with more than 50 potential results
- Default filter state: current entity + active status — never show everything unfiltered
- Date range filter is required for any time-series data export

**Exports and reports:**
- User must select which columns to export — no default all-columns export
- User must set a date range before any export runs — no open-ended exports
- Show estimated row count before export executes — let user narrow if count is large
- Cap exports at 1,000 rows without a confirmation step
- Cap exports at 10,000 rows hard — require a different approach above that

**Query builder UI pattern (for advanced users):**
```
Step 1: Choose entity (TM · SF · Personal)
Step 2: Choose data type (decisions · strategies · brand · etc.)
Step 3: Set date range (required)
Step 4: Select columns to include (required — no select-all default)
Step 5: Preview row count → if > 500, prompt to narrow criteria
Step 6: Run query / export
```

### Cost Monitoring
- Log query row counts per user per day
- Alert (internal) if any single query returns > 500 rows
- Alert (internal) if any user exceeds 5,000 total rows fetched in a day
- Review high-count queries monthly — optimize or gate them

---

*This document is the first thing Claude Code reads before any module work begins.*  
*No module starts without it. No exceptions.*
