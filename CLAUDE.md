# Sonja HQ — Claude context

Personal PM + knowledge hub for Sonja Streich. Next.js 14 App Router · Supabase Auth + RLS · Vercel · `https://hq.streichforce.com`.

Sibling repo (separate codebase, same SF platform): `~/OneDrive/Documents/GitHub/SF/sf-ops` (Streich Force Enterprises operations platform).

## Where things live (canonical storage map)

Locked in the 2026-05-22 cross-project audit, Section 5. **Don't propose new storage locations without a reason and an explicit decision.**

| Location | What's there | Action |
|---|---|---|
| HQ `knowledge` bucket | Uploaded knowledge entries (PDF/DOCX/XLSX/HTML/TXT/MD). Tier-1 org-visible. | Keep — primary doc store |
| HQ `vault` bucket | Vault entries — owner-only, AES-256-GCM encrypted in R2 backup | Keep — private doc store |
| HQ `project-files` bucket | Files attached to projects + tasks | Keep — operational attachments |
| HQ `knowledge_entries` (DB) | Workspace pages (`kind=workspace`) · ideas · notes · critiques · chat archives · code snippets | Keep — primary text store |
| SF Ops `work-order-photos` | WO photos: reference/before/completion | Keep — domain-specific (SF Ops repo) |
| SF Ops `invoice-pdfs` | Generated invoice PDFs, 24h signed URLs | Keep — domain-specific (SF Ops repo) |
| SF Ops `parts-receipts` | Parts purchase receipts for reimbursement audit | Keep — domain-specific (SF Ops repo) |
| Notion (legacy) | Pre-2026 docs, half-migrated content, read-only via `NOTION_API_KEY` sync | **Retire** — Sprint 12 cutover (audit row 6) |
| GitHub `docs/specs/` (SF Ops) | Technical HTML specs | Keep — finalized versions also uploaded to HQ knowledge |
| GitHub `docs/specs/` (HQ) | Technical HTML specs | Keep — mirror SF Ops convention |
| Claude memory files | `~/OneDrive/Documents/Claude/memory/` — 30+ markdown | Keep — Claude-only, bridges sessions |
| Granola transcripts | Meeting transcripts via Granola MCP | **Decide** — auto-import to HQ or stay external (open Q) |
| SharePoint / OneDrive Documents | Personal scratch space; Claude memory dir lives here | Keep — OS-level scratch |
| Claude conversation logs | HQ chat-history table + saved-chat workspace entries | Keep — auto-save shipped Sprint 10c |

### The mental model

- **"Things I want Claude to know"** → HQ `knowledge_entries` (workspace pages + uploads).
- **Technical specs** → GitHub `docs/specs/` in the relevant repo, mirrored to HQ knowledge on finalize per `feedback_html_specs.md`.
- **Operational records** → SF Ops domain tables (WOs, invoices, photos).
- **Notion is retiring.** Don't add new content there; the Sprint-4 `src/app/api/documents/actions.ts` Notion-sync code is quietly broken (writes to a non-existent `documents` table) and slated for retirement during cutover.
- **Memory files are Claude-only.** Sonja doesn't read them.

## Quick-reference

- **Supabase project ID:** `goxszzjjwpkqwchhfqam`
- **Dev server port:** `3001` (not 3000)
- **Repo branch protection:** `main` requires PR — never push direct
- **Local dev:** the OneDrive checkout (`~/Library/CloudStorage/OneDrive-Personal/Documents/GitHub/HQ/sf-sonja-hq`) is hostile to `tsc` / `next dev` / `vitest`. For active dev work, use `git worktree add ~/dev/sf-sonja-hq-<slice>`.
- **Vercel deploys** auto from `main`. Preview deploys on every PR; verify via commit-status API (`gh api repos/.../commits/<sha>/status`).
- **HTML specs convention:** scoping deliverables Sonja reviews are HTML in `docs/specs/<topic>_v<N>.html`. Refinements save as new versions; never overwrite. See `~/OneDrive/Documents/Claude/memory/feedback_html_specs.md`.
- **Role taxonomy (post-2026-05-25 migration):** `platform_owner · org_admin · supervisor · member · read_only`. Cutline matrix in `docs/specs/hq_auth-and-roles_v2.html`.

## Detailed reference

Comprehensive stack details, RLS patterns, DB enums, gotchas, production infra, and key file locations live in the Claude memory:
`~/OneDrive/Documents/Claude/memory/project_sonja_hq_tech.md`.

## Sibling repo awareness

Before starting code work, check the sibling SF Ops state — there's a session-start protocol documented in `~/OneDrive/Documents/Claude/memory/feedback_cross_project.md` (when written).
