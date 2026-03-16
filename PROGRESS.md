# LinkedU Parent Portal — Progress Log

## Session: 2026-03-16 (Session 3)

### Status: ALL COMMITTED AND PUSHED — LIVE ON NETLIFY
Latest commit: `95cc354`

### Commits this session (in order):
- `3b991f2` — Security: strip consultantNotes from token-link API response
- `a9c2106` — Recommendations: replace datalist with custom school search dropdown
- `9f04c7b` — Fix school search: serve schools.json from public/, fix kanban CSS cascade
- `3be7385` — Fix: point backend functions to public/data/schools.json (path.join fix)
- `1ef1e9f` — Fix: use static require paths so Netlify bundler includes schools.json
- `95cc354` — Recommendations: generate real school facts on manual add

---

## What Was Done This Session

### 1. Security fix — consultantNotes
- `netlify/functions/student.js` line 112: `buildStudentObj(s, false)` → `buildStudentObj(s, true)`
- Token-link parents were receiving `consultantNotes` (Data Dump) in API JSON response
- UI never showed it (analyst-only block) but was readable in network tab
- Patched, committed, deployed

### 2. School search dropdown (Recommendations tab)
- Replaced browser-native `<datalist>` with custom dropdown
- Filters all 114 schools client-side, matches mid-word (e.g. "grove" finds Bromsgrove)
- Arrow keys, Enter, Escape all work
- Selection locks in school name before hitting Add School
- File: `public/index.html`

### 3. schools.json — two-part fix (took 3 attempts)
**Root cause:** `data/schools.json` was at project root — not served by browser (Netlify publishes `public/` only), AND not bundled into Netlify functions (bundler uses static analysis, can't follow `path.join(__dirname, ...)`).
**Fix:**
- Copied to `public/data/schools.json` (browser can now fetch it)
- Changed all 3 backend functions to static `require('../../public/data/schools.json')`
- Functions affected: `add-recommendation.js`, `generate-recommendations.js`, `telegram-bot.js`
- **Lesson learned:** Always use static `require()` strings for Netlify functions — dynamic `path.join()` paths are NOT bundled

### 4. Kanban CSS cascade fix
- `@media (max-width: 640px) { .sa-kbn-grid { grid-template-columns: 1fr } }` at line 646 was overridden by base style at line 1108 (equal specificity, later in sheet)
- Fixed by adding the override AFTER the base style and tightening the 700px rule to `(min-width:641px) and (max-width:700px)`
- Kanban now correctly single-column on mobile ≤640px

### 5. Manual add — "Why this school" bullets
- Previously showed only "Manually added by consultant"
- Now `buildManualReasons(school)` generates real bullets from school data:
  - boarding, golf, scholarship, sport (feed tag expander in frontend)
  - "Region: X" and "Tuition: £X/yr" (plain strings, display as-is)
- Patched existing Bromsgrove record directly in Supabase

### 6. Proof test infrastructure
- Test file: `/tmp/portal-proof-test-2026-03-16.js` — 52 checks, all pass
- Valid tokens: Kenshin `63a34b1aae74336f`, Zaeril `10735805cdc93de7`
- Analyst JWT expires each session — regenerate at session start
- **Gap identified:** localhost tests pass even when Netlify bundler would fail — need to also test live endpoint for any function that uses `require()` on non-npm files

---

## Still To Do — Next Session

### A. Further fixes Satit wants to address (context limit hit — pick up fresh)
- Not yet specified — Satit said there are more fixes but cut session here

### B. School Emails Feature
- Option 2 (manual paste) recommended — not yet built

### C. Polish items
- Tab bar — 7 tabs need scrolling on mobile, no visual scroll indicator
- Golf detail hero padding on mobile

### D. Longer-term pending
- Buckswood School — Arsenal academy
- Rejection feedback loop
- More sport/medicine tags

---

## Test Credentials
- Analyst PIN: `2024golf`
- Valid tokens: Kenshin `63a34b1aae74336f`, Zaeril `10735805cdc93de7`
- Local dev: `netlify dev` on port 8904
- Live: https://linkedu-parent-portal.netlify.app

---

## What Was Done This Session

### 1. Emoji Removals (all violations cleared)
Replaced all emoji with typographic symbols or plain text:
- `📝` — removed icon span from notes box header
- `✏` → `Edit note` (plain text)
- `😤 😐 😊` → `F N G` in mental game row, scorecard column, and `mentalEmoji()` function
- `👍 👌 👎` → `Pure OK Mishit` in shot quality bars
- `📎` → `·` in scorecard note indicator
- `⛳` → `—` in golf empty state
- `🏌️` → `—` in course stats empty state

### 2. Table Scroll Fixes
- **Golf scorecard**: added `<div style="overflow-x:auto">` wrapper inside the `overflow:hidden` card
- **Academic records** (Profile tab): same fix — `overflow-x:auto` inner wrapper added

### 3. Full Parent Flow Mobile Audit (Design Beauty + Devil's Advocate)
Traced every screen a parent sees on 375px. Found and fixed:

#### MUST FIX — Header touch targets
- `.header-signout` had zero padding (11px tap target) → added `padding: 8px 12px`
- `.header-lang` had 3px vertical padding → added `padding: 7px 10px`

#### MUST FIX — Urgency deadline rows (Schools tab)
- 5-column flex row overflowed 375px, days badge orphaned alone on second line
- Fixed: restructured as 3-col CSS grid — dot | school+label stacked | date+days stacked

#### MUST FIX — Journey kanban cramped
- `@media (max-width: 700px)` gave 2-col kanban — cards only 148px wide, text cramped
- Fixed: added `@media (max-width: 640px) { .sa-kbn-grid { grid-template-columns: 1fr; } }`
- Kanban now single column on mobile — full width, readable

#### MUST FIX — School card head asymmetry
- `justify-content: space-between` pushed role badge to far right edge
- Fixed: `.sa-card-head { flex-direction: column; gap: 10px; }` on mobile
- Role badge + status now left-aligned row below school name

### 4. Auth Refactor (committed from previous session's work)
- `netlify/functions/utils/auth.js` — `isAuthorizedAnalyst()` helper
- `netlify/functions/check-analyst.js` — new endpoint
- Three-tier auth in `school-timeline.js`, `update-student.js`, `delete-student.js`
- `_portalToken` support for parent token links
- Deleted `public/admin/students.html` and `public/admin/recommendations.html`

---

## New Feature Discussion — School Emails in Portal

Satit asked: can emails from schools directed at specific students appear in the portal automatically?

**Answer: Yes. Three options discussed:**

### Option 1 — Inbound email forwarding (Recommended for automation)
- Each student gets a unique email address (e.g. `ping@mail.linkedu-portal.com`)
- Parents set a Gmail filter to auto-forward school emails to that address
- Mailgun/Postmark (~$15/mo) receives email → webhook → Netlify function → Supabase → portal
- After one-time Gmail filter setup, fully automatic

### Option 2 — Manual paste (Easiest to build, zero cost)
- Add "Emails" section to each school card
- Parent pastes email content — stored in Supabase, shown in portal timeline
- Build time: one session. No running cost. Parent controls what appears.

### Option 3 — Gmail API (Most powerful, most complex)
- Parents connect Gmail via Google OAuth
- Portal auto-reads emails from school domains
- Fully automatic after one-time Google login
- Free but significantly more complex — OAuth, token refresh, polling

**Recommendation:** Start with Option 2 (manual paste) to validate the workflow.
Upgrade to Option 1 (inbound webhook) if parents want automation.
Option 3 is overkill for current student volume.

**Status: Paused — picking up next session.**

---

## Still To Do — Next Session

### A. School Emails Feature (new)
Decide which option to build, then build it. Likely starting with Option 2.

### B. Polish items (from mobile audit)
- Tab bar — 7 tabs need scrolling on mobile, no visual scroll indicator
- Golf detail hero — `padding: 28px` on mobile, could be 20px
- Consultant message card — dark `#161616` block on light cream page

### C. Longer-term pending work
- **Buckswood School** — Arsenal academy, footballAcademy tag — Satit to share details
- **Rejection feedback loop** — when analyst rejects a rec, capture reason
- **More sport tags** — swimming, tennis, equestrian specialists
- **More medicine schools** — only Caterham + Concord tagged so far
- **Test live site** — verify all mobile fixes on live after today's push

---

## Test Credentials
- Analyst PIN: `2024golf`
- Test token: `YIFJXNUR` (Ping's parent view)
- Local dev: `netlify dev` on port 8904 → http://localhost:8904
- Live: https://linkedu-parent-portal.netlify.app
