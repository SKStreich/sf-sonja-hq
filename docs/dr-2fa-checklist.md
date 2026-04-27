# DR Minimum Viable Posture — 2FA + Recovery Codes Checklist

This is the 30-minute baseline. Doing this once eliminates ~95% of account-takeover risk for Sonja HQ.
Plan to upgrade to **Standard** posture (Supabase Pro + R2 storage backups + nightly DB exports) when you're ready — see `dr-standard-plan.md` (TODO).

## Why this matters

We don't run our own servers, so classical ransomware (encrypting machines until you pay) isn't the realistic threat. The realistic threat is **account takeover**: someone phishes or guesses a password, takes over a critical account, deletes the project or holds it for ransom. 2FA with a hardware-backed authenticator stops that cold for everything below.

A compromised **email account** would also cascade to every magic-link login (Supabase, Vercel, GitHub, Resend). Lock that down first.

## Steps — do these today

Use an authenticator app like 1Password, Authy, or Apple Passwords. **Save every recovery code** to your password manager *before* leaving the page that shows them — once you close that page, those codes are usually unrecoverable.

### Tier 1 — Email (cascades to everything else)

- [ ] **Outlook account** (`sstreich1@outlook.com`) — Microsoft Account → Security → Two-step verification → enable. Save recovery codes.
- [ ] Any Gmail/iCloud accounts you receive shared docs at — same drill (Google Account / Apple ID security pages).

### Tier 2 — Cloud accounts that can wipe Sonja HQ

- [ ] **Supabase** (https://supabase.com/dashboard/account/security) → Multi-factor authentication → enable. Save recovery codes.
- [ ] **Vercel** (https://vercel.com/account/security) → Two-factor authentication → enable. Save recovery codes.
- [ ] **GitHub** (https://github.com/settings/security) → Two-factor authentication → enable, prefer authenticator app over SMS. Save recovery codes.
- [ ] **Cloudflare** (DNS for `streichforce.com`) — https://dash.cloudflare.com/profile/authentication → enable Two-Factor Authentication. Save recovery codes.

### Tier 3 — API providers (lower blast radius but still important)

- [ ] **Resend** (https://resend.com/settings/team) — enable 2FA on your team profile.
- [ ] **Anthropic** (https://console.anthropic.com/settings/security) — enable two-factor authentication.
- [ ] **OpenAI** if used (https://platform.openai.com/account/security) — same.

### Tier 4 — Domain registrar (if compromised, attacker can redirect `hq.streichforce.com`)

- [ ] Wherever `streichforce.com` is registered — enable 2FA + transfer lock.

## Storage of recovery codes

For each service above, the recovery codes should live in **one** of:

1. Your password manager, in a dedicated note attached to that service's login (preferred — encrypted, syncs across devices)
2. Printed and stored in a fireproof box at home
3. **NOT** in plain text on your computer or in cloud notes

If you lose all your authenticator devices and have no recovery codes, account recovery requires the provider's support team and can take days or weeks.

## Verify — quick spot-check

After completing the above:
- [ ] Log out of Supabase dashboard → log back in → confirm it asks for the second factor.
- [ ] Same for Vercel.
- [ ] Same for GitHub.
- [ ] Email yourself a test from `info@streichforce.com` via the Resend dashboard to confirm the API key still works.

## What's NOT covered by this minimum posture

- No off-platform backup of your storage buckets (`knowledge`, `vault`, `project-files`). If your Supabase project is deleted or the org is locked, uploaded files are gone. → **Standard posture** addresses this with a nightly Cloudflare R2 sync.
- No cross-region replication of the Postgres database. Supabase free tier keeps daily snapshots for 7 days. → **Standard posture** upgrades to Supabase Pro ($25/mo) for daily PITR + cross-region storage.
- No printed runbook of "how to rebuild from scratch if every cloud account is lost." → **Paranoid posture** addresses this.

## Open question to revisit

Once we ship the integrations documentation in PR-C, every doc should end with a section **"What to do if this service is unavailable / compromised"** so the runbook is colocated with the integration spec.
