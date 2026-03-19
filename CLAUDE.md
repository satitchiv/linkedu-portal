# LinkedU Parent Portal — Claude Rules

## Project identity
- **Project:** LinkedU Parent Portal
- **Owner:** Satit Chivangkur (consultant, satit@linkedu.hk)
- **Purpose:** Private portal for Thai families applying to UK boarding schools — school pipeline tracker, documents, golf rounds, recommendations, Telegram bot
- **Live URL:** https://linkedu-parent-portal.netlify.app
- **GitHub:** satitchiv/linkedu-portal (branch: main — auto-deploys to Netlify on push)

## Tech stack
- **Frontend:** Single-page HTML/CSS/JS (`public/index.html`) — no framework, dark theme
- **Backend:** Netlify serverless functions (`netlify/functions/*.js`)
- **Database:** Supabase (PostgreSQL) — `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- **Auth:** Supabase JWT — `sb.auth.getUser(token)` to validate sessions
- **Telegram bot:** `netlify/functions/telegram-bot.js` — Gemini Flash powered, natural language
- **Local dev:** `netlify dev` on port 8904

## Key env vars (set in Netlify dashboard)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET` — X-Admin-Secret header for write operations
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`
- `GEMINI_API_KEY` — for telegram-bot Gemini Flash

## Architecture
- `isAnalystView` — `true` when URL does NOT contain `?view=parent`
- `window._adminSecret` — set at page load when `isAnalystView`
- `D` global — `{ student, schools, milestones, recommendations, golfRounds }`
- `localStorage` cache key: `portal_cache` (30-min TTL)
- 10-stage pipeline: `researching → applied → interview → offer → visit → accepted → visa → tb_test → guardianship → enrolled`
- `application_status = 'abandoned'` for abandoned schools
- `item_type = 'custom_done'` for completed custom timeline items

## Database tables
- `students` — main student record
- `student_schools` — one row per school per student
- `school_timeline_items` — timeline events per student_school
- `student_documents` — document submissions
- `golf_rounds` — golf performance rounds
- `recommendations` — school recommendations (pre-applying)

## Design rules (hard rules — never break)
- Dark theme: `#111` bg, `#B8962E` gold, `#eee` text
- **NO emojis** — not in HTML, UI, copy, or anywhere
- Use typographic symbols only: → · — ✓
- No borders on tables — row separators only (`#1a1a1a`)

## Git / deploy rules
- **Never `git push` without Satit saying "push", "deploy", or "push to Netlify"**
- Netlify auto-deploys on push to main — pushing = live instantly
- Always commit locally and wait for approval

## Pre-deploy checklist — mandatory before any fix is "done" (top priority)
Run these three checks every time, no exceptions:
1. **`git status`** — every file touched must be committed. Untracked files = not deployed. This caught a function that existed locally but never reached Netlify (404 in prod).
2. **Curl the live endpoint** — confirm it returns JSON, not HTML. HTML response = 404 (not deployed) or 502 (function crash). `curl -s -o /dev/null -w "%{http_code}" https://linkedu-parent-portal.netlify.app/api/<function-name>`
3. **New function?** — verify it appears in `git log --oneline netlify/functions/<name>.js`. If no output, it was never committed.

## Worktree rule
- Before any multi-file edit or new feature, assess if worktree is needed
- If risky, parallel, or long-running → ask Satit first

## Devil's Advocate — mandatory second opinion (top priority)
Before presenting ANY result to Satit, a devil's advocate pass is required. No exceptions.
- **Code fixes**: challenge the fix before writing — what could go wrong, what edge cases are missed
- **Audits & reviews**: after completing any audit, challenge every finding — is it real, overstated, or missing context
- **Proof tests**: verify the test performed real interactions, not just element checks, and would catch real failures
- **"Ready" confirmations**: before saying anything is complete or ready to deploy — ask what wasn't tested, what assumption was made
Both the primary analysis AND the devil's advocate must agree before presenting to Satit.

## Design Beauty — priority voice on all design (top priority)
Design Beauty is the third perspective on any UI work. She is invoked for any change a user will see.
She represents a parent opening the portal for the first time — immediately feeling whether it is premium or mediocre.
Her opinion takes priority on all aesthetic decisions.

**Invoked for:** new screens, mobile audits, layout changes, any HTML/CSS change, design reviews. Not for backend-only fixes.

**Her design language:** Quiet luxury — a private school prospectus, not a SaaS dashboard. Space is prestige. Typography hierarchy is non-negotiable. Gold is sacred, not decorative.

**Her rules (non-negotiable):**
1. Minimum 12px text on mobile, everywhere, no exceptions
2. Minimum 20px horizontal padding on any content area on mobile
3. Minimum 16px internal padding on any card or section
4. Gold used maximum once per visible section, only on the most important element
5. Mobile screens must feel designed FOR mobile — not squished from desktop
6. Maximum 2 primary actions visible at once on mobile
7. Tables on mobile must scroll with a visible indicator or be redesigned as cards
8. When in doubt: remove an element rather than shrink it

**Her authority:** Priority on aesthetic decisions. Cannot override functional requirements — conflict goes to Satit.
**Her two levels:** Must Fix (broken, below brand standard) · Polish (acceptable now, improve later)
**Her feedback format:** Always states WHAT is wrong and WHY it violates the brief. Never just "looks bad."

## Test credentials
- Analyst PIN: `2024golf`
- Test token: `YIFJXNUR` (Ping's JWT)
- Telegram allowed user ID: `5085440081`
- Telegram bot webhook: `https://linkedu-parent-portal.netlify.app/api/telegram-bot`
- Seed demo data: visit `/golf-seed` and click Seed
