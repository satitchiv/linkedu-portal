#!/usr/bin/env python3
"""
LinkedU Parent Portal — Complete Student Profile Tab
tab_profile_full(s) renders all 8 profile sections with full dummy data for Ping.
Phase 1: display only. Phase 2 tools feed data through assessment tools (Coming Soon).
"""

# ── CSS ──────────────────────────────────────────────────────────────────────

PROFILE_CSS = """
/* ── Complete Profile Page ─────────────────────────────────────────────── */
.pf-layout { display:flex; gap:32px; align-items:flex-start; }
.pf-sidebar { width:186px; flex-shrink:0; position:sticky; top:126px;
  max-height:calc(100vh - 146px); overflow-y:auto; padding-bottom:40px; }
.pf-sidebar::-webkit-scrollbar { width:2px; }
.pf-sidebar::-webkit-scrollbar-thumb { background:#e0d9cd; }
.pf-nav-lbl { font-size:10px; font-weight:700; letter-spacing:.18em; color:#B8962E;
  text-transform:uppercase; margin:0 0 10px; }
.pf-nav-a { display:block; font-size:11.5px; color:#999; text-decoration:none;
  padding:5px 0 5px 12px; border-left:2px solid #e0d9cd; margin-bottom:4px;
  line-height:1.4; transition:color .15s,border-color .15s; }
.pf-nav-a:hover, .pf-nav-a.pf-active { color:#1a1a1a; border-left-color:#B8962E; }
.pf-content { flex:1; min-width:0; }
.pf-section { scroll-margin-top:130px; margin-bottom:52px;
  padding-bottom:16px; border-bottom:1px solid #e8e0d0; }
.pf-section:last-child { border-bottom:none; margin-bottom:0; }
.pf-sec-num { font-size:10px; font-weight:700; letter-spacing:.18em; color:#B8962E;
  text-transform:uppercase; margin-bottom:6px; }
.pf-sec-title { font-family:'Playfair Display',serif; font-size:1.35rem;
  font-weight:400; color:#1a1a1a; margin-bottom:6px; line-height:1.3; }
.pf-sec-desc { font-size:12px; color:#888; line-height:1.65; max-width:580px;
  margin-bottom:22px; padding-bottom:18px; border-bottom:1px solid #f0ebe2; }
.pf-sub { font-size:10px; font-weight:700; letter-spacing:.18em; color:#B8962E;
  text-transform:uppercase; margin:24px 0 12px; padding-top:14px;
  border-top:1px solid #f0ebe2; display:flex; align-items:center; gap:10px; }
.pf-sub.pf-sub-first { border-top:none; margin-top:0; padding-top:0; }
.pf-row { display:grid; grid-template-columns:192px 1fr; gap:4px 16px;
  padding:8px 0; border-bottom:1px solid #faf5ee; align-items:baseline; }
.pf-row:last-of-type { border-bottom:none; }
.pf-lbl { font-size:11px; color:#aaa; line-height:1.5; }
.pf-val { font-size:13px; color:#1a1a1a; line-height:1.65; }
.pf-note { font-size:12px; color:#555; line-height:1.8; font-style:italic;
  background:#faf8f5; border-radius:6px; padding:12px 16px; margin:10px 0 6px;
  border-left:3px solid #e0d9cd; }
.pf-narrative { background:#f5f0e8; border-radius:8px; padding:20px 24px;
  font-size:13px; color:#333; line-height:1.9; margin-top:16px; }
/* Student Voice card */
.sv-card { background:#fdf9f0; border-left:3px solid #B8962E;
  border-radius:0 8px 8px 0; padding:24px 28px; margin:8px 0 4px; }
.sv-hdr { font-size:11px; font-weight:700; letter-spacing:.15em; color:#B8962E;
  text-transform:uppercase; margin-bottom:3px; }
.sv-meta { font-size:11px; color:#aaa; margin-bottom:22px; }
.sv-q { font-size:10.5px; color:#999; text-transform:uppercase; letter-spacing:.08em;
  margin:16px 0 5px; }
.sv-q:first-of-type { margin-top:0; }
.sv-a { font-size:13px; color:#1a1a1a; line-height:1.75; }
.sv-obs-hdr { font-size:10px; font-weight:700; letter-spacing:.15em; color:#B8962E;
  text-transform:uppercase; margin:22px 0 8px; padding-top:18px;
  border-top:1px solid #e8dfc8; }
.sv-obs { font-size:12px; color:#555; line-height:1.8; font-style:italic; }
/* Academic performance table */
.ac-tbl { width:100%; border-collapse:collapse; font-size:12px; background:#fff;
  border-radius:8px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.06); }
.ac-tbl th { background:#1a1a1a; color:#f5f0e8; font-size:9.5px; letter-spacing:.07em;
  text-transform:uppercase; padding:9px 10px; text-align:left; font-weight:500;
  white-space:nowrap; }
.ac-tbl td { padding:9px 10px; border-bottom:1px solid #f0ebe2; vertical-align:middle; }
.ac-tbl tbody tr:last-child td { border-bottom:none; }
.ac-tbl tbody tr:hover td { background:#faf8f5; }
.ac-subj { font-weight:600; color:#1a1a1a; font-size:12.5px; white-space:nowrap; }
.ac-g { font-weight:700; font-size:12.5px; }
/* Trend text */
.tr-cs { color:#2d7a2d; font-size:11px; }
.tr-ss { color:#2d7a2d; font-size:11px; }
.tr-si { color:#5a9a5a; font-size:11px; }
.tr-st { color:#B8962E; font-size:11px; }
.tr-stim { color:#5a9a5a; font-size:11px; }
.tr-im { color:#5a9a5a; font-size:11px; }
.tr-sl { color:#5a9a5a; font-size:11px; }
.tr-co { color:#c9a830; font-size:11px; }
.tr-de { color:#ca6d6d; font-size:11px; }
/* Gap status badges */
.bg-ex { background:#eaf5ea;color:#2d6a2d;font-size:10px;font-weight:700;
  padding:2px 7px;border-radius:3px;letter-spacing:.05em;white-space:nowrap }
.bg-mt { background:#eaf5ea;color:#2d6a2d;font-size:10px;font-weight:700;
  padding:2px 7px;border-radius:3px;letter-spacing:.05em;white-space:nowrap }
.bg-ag { background:#fff8e6;color:#8a6000;font-size:10px;font-weight:700;
  padding:2px 7px;border-radius:3px;letter-spacing:.05em;white-space:nowrap }
.bg-cg { background:#fdecea;color:#b03030;font-size:10px;font-weight:700;
  padding:2px 7px;border-radius:3px;letter-spacing:.05em;white-space:nowrap }
.bg-na { background:#f0f0f0;color:#888;font-size:10px;font-weight:700;
  padding:2px 7px;border-radius:3px;letter-spacing:.05em;white-space:nowrap }
.bg-as { background:#B8962E22;color:#8a5e00;border:1px solid #B8962E55;
  font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;
  letter-spacing:.05em;white-space:nowrap }
/* Profile completeness banner */
.pf-banner { background:#1a1a1a; border-radius:10px; padding:28px 32px;
  margin-bottom:32px; display:flex; gap:32px; align-items:flex-start;
  flex-wrap:wrap; }
.pf-ban-avatar { width:64px; height:64px; border-radius:50%; border:2px solid #B8962E66;
  background:#B8962E22; flex-shrink:0; display:flex; align-items:center;
  justify-content:center; font-family:'Playfair Display',serif; font-size:24px;
  color:#B8962E; }
.pf-ban-info { flex:1; min-width:220px; }
.pf-ban-name { font-family:'Playfair Display',serif; font-size:1.8rem;
  font-weight:400; color:#f5f0e8; margin-bottom:4px; }
.pf-ban-meta { font-size:12px; color:#f5f0e8; opacity:.45; margin-bottom:18px; }
.pf-ban-score { font-size:11px; color:#B8962E; font-weight:600;
  letter-spacing:.04em; margin-bottom:5px; }
.pf-ban-ready { font-size:12px; color:#f5f0e8; opacity:.5; font-style:italic;
  line-height:1.65; }
.comp-grid { display:flex; flex-direction:column; gap:6px; min-width:220px; }
.comp-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.comp-nm { font-size:11px; color:#f5f0e8; opacity:.6; }
.comp-ok { background:#1a3a1a;color:#6dca6d;font-size:9.5px;font-weight:700;
  padding:2px 8px;border-radius:3px;letter-spacing:.05em;white-space:nowrap }
.comp-par { background:#2a2200;color:#c9a830;font-size:9.5px;font-weight:700;
  padding:2px 8px;border-radius:3px;letter-spacing:.05em;white-space:nowrap }
.comp-nil { background:#2a1010;color:#ca6d6d;font-size:9.5px;font-weight:700;
  padding:2px 8px;border-radius:3px;letter-spacing:.05em;white-space:nowrap }
/* Phase 2 coming soon button */
.ph2-btn { display:inline-block; font-size:9.5px; font-weight:700;
  letter-spacing:.07em; text-transform:uppercase; color:#bbb;
  background:#f0f0f0; border:1px solid #e0e0e0; border-radius:3px;
  padding:2px 9px; cursor:not-allowed; vertical-align:middle; }
/* Assessment status cards */
.as-card { background:#fff; border:1px solid rgba(0,0,0,.08); border-radius:8px;
  padding:18px 22px; margin-bottom:12px; }
.as-st-pend { display:inline-block; font-size:9.5px; font-weight:700;
  padding:3px 9px; border-radius:3px; letter-spacing:.07em;
  background:#fff8e6; color:#8a6000; margin-bottom:10px; }
.as-st-done { display:inline-block; font-size:9.5px; font-weight:700;
  padding:3px 9px; border-radius:3px; letter-spacing:.07em;
  background:#eaf5ea; color:#2d6a2d; margin-bottom:10px; }
.as-st-flag { display:inline-block; font-size:9.5px; font-weight:700;
  padding:3px 9px; border-radius:3px; letter-spacing:.07em;
  background:#fdecea; color:#b03030; margin-bottom:10px; }
.as-ex { font-size:12px; color:#666; line-height:1.75; background:#faf8f5;
  border-radius:6px; padding:13px 18px; margin-top:10px; }
/* Tournament table */
.tn-tbl { width:100%; border-collapse:collapse; font-size:12px; }
.tn-tbl th { font-size:9.5px; letter-spacing:.07em; text-transform:uppercase;
  color:#aaa; padding:7px 10px; text-align:left; border-bottom:1px solid #e0d9cd;
  font-weight:500; }
.tn-tbl td { padding:9px 10px; border-bottom:1px solid #f0ebe2; color:#444;
  vertical-align:top; }
.tn-tbl tr:last-child td { border-bottom:none; }
/* Checklist */
.pf-cl { list-style:none; padding:0; margin:0; }
.pf-cl li { display:flex; gap:12px; align-items:flex-start; font-size:13px;
  color:#444; padding:9px 0; border-bottom:1px solid #f5f2ec; line-height:1.55; }
.pf-cl li:last-child { border-bottom:none; }
.cl-box { width:15px; height:15px; border:1.5px solid #ccc; border-radius:3px;
  flex-shrink:0; margin-top:2px; }
/* CE mock table */
.ce-tbl { width:100%; border-collapse:collapse; font-size:12px; background:#fff;
  border-radius:8px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.06); }
.ce-tbl th { background:#1a1a1a; color:#f5f0e8; font-size:9.5px; letter-spacing:.07em;
  text-transform:uppercase; padding:9px 12px; text-align:left; font-weight:500; }
.ce-tbl td { padding:9px 12px; border-bottom:1px solid #f0ebe2; }
.ce-tbl tr:last-child td { border-bottom:none; }
/* Mobile nav */
.pf-mobile-nav { display:none; }
@media (max-width:820px) {
  .pf-sidebar { display:none; }
  .pf-mobile-nav { display:flex; overflow-x:auto; margin:0 -28px 24px;
    padding:0 28px; border-bottom:1px solid #e0d9cd;
    -webkit-overflow-scrolling:touch; }
  .pf-mobile-nav::-webkit-scrollbar { display:none; }
  .pf-mobile-nav a { flex-shrink:0; font-size:11px; color:#888;
    text-decoration:none; padding:10px 14px; white-space:nowrap;
    border-bottom:2px solid transparent; margin-bottom:-1px; }
  .pf-mobile-nav a:hover { color:#1a1a1a; }
  .pf-row { grid-template-columns:130px 1fr; }
}
"""

# ── Main function ─────────────────────────────────────────────────────────────

def tab_profile_full(s, academics=None):
    try:
        name = s["properties"]["Student Name"]["title"][0]["plain_text"]
    except Exception:
        name = "Panida Wattana"

    LINE_HANDLE = "satitlinkedu"

    # ── Completeness banner ─────────────────────────────────────────────────
    banner = f"""
<div class="pf-banner">
  <div class="pf-ban-avatar">P</div>
  <div class="pf-ban-info">
    <div class="pf-ban-name">{name}</div>
    <div class="pf-ban-meta">Bangkok Patana School &nbsp;·&nbsp; Year 8 &nbsp;·&nbsp; Target: Bromsgrove Year 9 entry 2027</div>
    <div class="pf-ban-score">6 of 8 sections complete &nbsp;&middot;&nbsp; 2 partial</div>
    <div class="pf-ban-ready">Strong — sufficient to generate full recommendations. UKISET result and formal learning assessment will further sharpen recommendations when available.</div>
  </div>
  <div class="comp-grid">
    <div class="comp-row"><span class="comp-nm">Personal Identity</span><span class="comp-ok">Complete</span></div>
    <div class="comp-row"><span class="comp-nm">Academic Record</span><span class="comp-ok">Complete — 6 terms</span></div>
    <div class="comp-row"><span class="comp-nm">Assessments</span><span class="comp-par">Partial</span></div>
    <div class="comp-row"><span class="comp-nm">Learning Profile</span><span class="comp-par">Partial</span></div>
    <div class="comp-row"><span class="comp-nm">Sport Profile</span><span class="comp-ok">Complete</span></div>
    <div class="comp-row"><span class="comp-nm">Creative Arts</span><span class="comp-ok">Complete</span></div>
    <div class="comp-row"><span class="comp-nm">Character</span><span class="comp-ok">Complete</span></div>
    <div class="comp-row"><span class="comp-nm">Wellbeing</span><span class="comp-ok">Complete</span></div>
  </div>
</div>"""

    # ── Mobile nav ──────────────────────────────────────────────────────────
    mobile_nav = """
<div class="pf-mobile-nav">
  <a href="#pf-1">Identity</a>
  <a href="#pf-2">Academic</a>
  <a href="#pf-3">Assessments</a>
  <a href="#pf-4">Learning</a>
  <a href="#pf-5">Sport</a>
  <a href="#pf-6">Creative</a>
  <a href="#pf-7">Character</a>
  <a href="#pf-8">Wellbeing</a>
</div>"""

    # ── Sidebar nav ─────────────────────────────────────────────────────────
    sidebar = """
<nav class="pf-sidebar">
  <div class="pf-nav-lbl">Profile</div>
  <a class="pf-nav-a" href="#pf-1">1 &middot; Personal Identity</a>
  <a class="pf-nav-a" href="#pf-2">2 &middot; Academic Record</a>
  <a class="pf-nav-a" href="#pf-3">3 &middot; Assessments</a>
  <a class="pf-nav-a" href="#pf-4">4 &middot; Learning Profile</a>
  <a class="pf-nav-a" href="#pf-5">5 &middot; Sport Profile</a>
  <a class="pf-nav-a" href="#pf-6">6 &middot; Creative Arts</a>
  <a class="pf-nav-a" href="#pf-7">7 &middot; Character</a>
  <a class="pf-nav-a" href="#pf-8">8 &middot; Wellbeing</a>
</nav>"""

    # ── Section 1 — Personal Identity ───────────────────────────────────────
    sec1 = """
<div id="pf-1" class="pf-section">
  <div class="pf-sec-num">Section 01</div>
  <div class="pf-sec-title">Personal Identity</div>
  <div class="pf-sec-desc">Foundational information about the student and family. Used for all applications, visa documentation, and school communications.</div>

  <div class="pf-sub pf-sub-first">Student Details</div>
  <div class="pf-row"><div class="pf-lbl">Full Legal Name</div><div class="pf-val">Panida Wattana</div></div>
  <div class="pf-row"><div class="pf-lbl">Preferred Name</div><div class="pf-val">Ping</div></div>
  <div class="pf-row"><div class="pf-lbl">Date of Birth</div><div class="pf-val">1 March 2013</div></div>
  <div class="pf-row"><div class="pf-lbl">Age</div><div class="pf-val">13</div></div>
  <div class="pf-row"><div class="pf-lbl">UK Academic Year Note</div><div class="pf-val">Born in March — mid-year birthday. No significant late-birthday risk for Year 9 entry.</div></div>
  <div class="pf-row"><div class="pf-lbl">Gender</div><div class="pf-val">Female</div></div>
  <div class="pf-row"><div class="pf-lbl">Nationality</div><div class="pf-val">Thai</div></div>
  <div class="pf-row"><div class="pf-lbl">Passport Number</div><div class="pf-val" style="color:#aaa;font-style:italic">Redacted — on file</div></div>
  <div class="pf-row"><div class="pf-lbl">Passport Expiry</div><div class="pf-val">June 2029</div></div>
  <div class="pf-row"><div class="pf-lbl">First Language</div><div class="pf-val">Thai</div></div>
  <div class="pf-row"><div class="pf-lbl">Additional Languages</div><div class="pf-val">English (Upper-Intermediate) &nbsp;&middot;&nbsp; Mandarin (Basic — studied 2 years)</div></div>
  <div class="pf-row"><div class="pf-lbl">Religion</div><div class="pf-val">Buddhist (non-observant)</div></div>
  <div class="pf-row"><div class="pf-lbl">Dietary Requirements</div><div class="pf-val">No restrictions</div></div>
  <div class="pf-row"><div class="pf-lbl">Medical Conditions</div><div class="pf-val">None recorded</div></div>
  <div class="pf-row"><div class="pf-lbl">Diagnosed Learning Differences</div><div class="pf-val">None recorded</div></div>
  <div class="pf-row"><div class="pf-lbl">EP Assessment</div><div class="pf-val">Not yet completed — <span style="color:#c9a830;font-weight:600">recommended before Year 9 application</span></div></div>

  <div class="pf-sub">Family Details</div>
  <div class="pf-row"><div class="pf-lbl">Mother</div><div class="pf-val">Khun Araya Wattana &nbsp;&middot;&nbsp; Business Owner &nbsp;&middot;&nbsp; Educated in Thailand (no UK experience)</div></div>
  <div class="pf-row"><div class="pf-lbl">Father</div><div class="pf-val">Khun Somchai Wattana &nbsp;&middot;&nbsp; Engineer &nbsp;&middot;&nbsp; Educated in Thailand (no UK experience)</div></div>
  <div class="pf-row"><div class="pf-lbl">Primary Decision Maker</div><div class="pf-val">Both parents jointly — mother leads day-to-day communication</div></div>
  <div class="pf-row"><div class="pf-lbl">Prior Int'l School Experience</div><div class="pf-val">None — first international education decision</div></div>
  <div class="pf-row"><div class="pf-lbl">Siblings</div><div class="pf-val">None recorded</div></div>
  <div class="pf-row"><div class="pf-lbl">Parents' Relationship Status</div><div class="pf-val">Married</div></div>
  <div class="pf-row"><div class="pf-lbl">Communication Preference</div><div class="pf-val">LINE &nbsp;&middot;&nbsp; Thai language &nbsp;&middot;&nbsp; voice messages acceptable</div></div>
  <div class="pf-row"><div class="pf-lbl">How Family Found LinkedU</div><div class="pf-val">Referral from Bangkok Patana School parent — Mrs Siriporn Kanchanawat</div></div>
  <div class="pf-note">First-generation UK boarding family. Will need more explanation of UK school culture and processes than experienced families. Mother is highly engaged and detail-oriented. Father defers to mother on education decisions but approves final financial commitments.</div>

  <div class="pf-sub">In Ping's Own Words <span class="ph2-btn">Coming Soon &mdash; Student Voice Tool</span></div>
  <div class="sv-card">
    <div class="sv-hdr">In Ping's Own Words</div>
    <div class="sv-meta">Recorded during initial consultation &mdash; January 2026</div>
    <div class="sv-q">What I most enjoy doing</div>
    <div class="sv-a">Playing golf and watching golf on TV. I also like drawing but I have not done it properly for a long time.</div>
    <div class="sv-q">Subjects I find most interesting</div>
    <div class="sv-a">Science — I find it hard but I actually think it is interesting. I want to understand how things work. I just find the exams really stressful.</div>
    <div class="sv-q">What I find most difficult</div>
    <div class="sv-a">Sitting still and studying for long periods. I do better when I can move around or do practical things.</div>
    <div class="sv-q">What I am most proud of</div>
    <div class="sv-a">My golf. I have been playing since I was 7 and I got my handicap down from 18 to 11 in one year. My coach said that is unusual progress.</div>
    <div class="sv-q">What I hope boarding school will give me</div>
    <div class="sv-a">I want to get better at golf with real coaching. I also want to be able to speak English without being embarrassed. And I want to learn how to live by myself because I think it will make me stronger.</div>
    <div class="sv-q">What worries me most</div>
    <div class="sv-a">Being away from my mum. And the food. I heard English food is not good. Also I worry that the other students will all know each other already and I will not have any friends at the start.</div>
    <div class="sv-q">Do I want to go, or is it my parents' idea</div>
    <div class="sv-a">It was my idea first actually. I saw a documentary about UK boarding schools and I asked my mum if I could go. She did not believe me at first.</div>
    <div class="sv-obs-hdr">Consultant Observation</div>
    <div class="sv-obs">Ping is genuinely self-motivated — the boarding school idea originated with her. This is a strong indicator of readiness. The food and social concerns are normal and addressable. The homesickness concern around the mother specifically will need preparation work — recommend pre-departure conversation and structured communication plan.</div>
  </div>
</div>"""

    # ── Live academic data from Notion ───────────────────────────────────────
    grade_map = {"A*":5,"A":4,"B":3,"C":2,"D":1,"E":0,"F":0}
    grade_col = {"A*":"#B8962E","A":"#5a9a5a","B":"#5a7aba","C":"#c9a830","D":"#ca7a5a","E":"#ca6d6d","F":"#ca6d6d"}

    if academics:
        import json as _json, re as _re
        def _prop(rec, key):
            pr = rec.get("properties",{}).get(key,{})
            t = pr.get("type","")
            if t=="title":     return "".join(x.get("plain_text","") for x in pr.get("title",[]))
            if t=="rich_text": return "".join(x.get("plain_text","") for x in pr.get("rich_text",[]))
            if t=="select":    s2=pr.get("select"); return s2["name"] if s2 else ""
            if t=="number":    n=pr.get("number"); return n if n is not None else ""
            return ""

        rows_html = ""
        for rec in academics:
            subj  = _prop(rec,"Subject")
            grade = _prop(rec,"Grade")
            atype = _prop(rec,"Assessment Type")
            term  = _prop(rec,"Term")
            score = _prop(rec,"Score")
            maxsc = _prop(rec,"Max Score")
            date  = _prop(rec,"Date")
            gc    = grade_col.get(grade,"#888")
            score_display = f"{score}/{maxsc}" if score and maxsc else grade or "—"
            rows_html += f"""<tr>
              <td style="font-weight:500;padding:9px 12px;border-bottom:1px solid #ece7df;font-size:13px">{subj}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #ece7df;font-size:13px"><span style="color:{gc};font-weight:700;font-size:15px">{score_display}</span></td>
              <td style="padding:9px 12px;border-bottom:1px solid #ece7df;font-size:12px;color:#aaa">{atype}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #ece7df;font-size:12px;color:#aaa">{term or date}</td>
            </tr>"""

        by_subject = {}
        for rec in academics:
            subj  = _prop(rec,"Subject")
            grade = _prop(rec,"Grade")
            score = _prop(rec,"Score")
            maxsc = _prop(rec,"Max Score")
            if grade in grade_map:
                by_subject.setdefault(subj,[]).append(grade_map[grade])
            elif score and maxsc:
                try: by_subject.setdefault(subj,[]).append(round(float(score)/float(maxsc)*5))
                except: pass

        chart_subjects = list(by_subject.keys())[:6]
        chart_avgs  = [round(sum(v)/len(v)*20) for s2 in chart_subjects for v in [by_subject[s2]]]
        chart_labels = _json.dumps(chart_subjects)
        chart_data   = _json.dumps(chart_avgs)
        chart_colors = _json.dumps(["#B8962E","#1a1a1a","#5a9a5a","#5a7aba","#c9a830","#ca7a5a"][:len(chart_subjects)])

        live_academic_html = f"""
  <div class="pf-sub">Live Assessment Records <span style="font-size:10px;color:#aaa;font-weight:400;letter-spacing:0;text-transform:none;margin-left:8px">from Notion</span></div>
  <div class="chart-wrap" style="margin-bottom:24px">
    <p style="font-size:12px;color:#aaa;margin-bottom:16px">Subject performance overview (average across all recorded terms)</p>
    <canvas id="gradeChart" height="80"></canvas>
  </div>
  <div class="card" style="overflow-x:auto;margin-bottom:8px">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:2px solid #ece7df">
        <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Subject</th>
        <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Grade / Score</th>
        <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Type</th>
        <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Term</th>
      </tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
  </div>
  <script>
  window._gradeChartData = {{labels:{chart_labels},data:{chart_data},colors:{chart_colors}}};
  </script>"""
    else:
        live_academic_html = ""

    # ── Section 2 — Academic Record ─────────────────────────────────────────
    sec2 = """
<div id="pf-2" class="pf-section">
  <div class="pf-sec-num">Section 02</div>
  <div class="pf-sec-title">Academic Record</div>
  <div class="pf-sec-desc">Two full years of academic performance across all subjects. Used to identify gaps, track trends, and assess readiness against target school entry requirements.</div>

  <div class="pf-sub pf-sub-first">School Context</div>
  <div class="pf-row"><div class="pf-lbl">Current School</div><div class="pf-val">Bangkok Patana School</div></div>
  <div class="pf-row"><div class="pf-lbl">Curriculum</div><div class="pf-val">British National Curriculum — UK Year 8 equivalent</div></div>
  <div class="pf-row"><div class="pf-lbl">Grading System</div><div class="pf-val">A* to E (mirroring UK GCSE structure at junior level)</div></div>
  <div class="pf-row"><div class="pf-lbl">Academic Year System</div><div class="pf-val">September to June — 3 terms</div></div>
  <div class="pf-row"><div class="pf-lbl">Class Position</div><div class="pf-val">Top 35% of year group (estimated from teacher comments and grade distribution)</div></div>
  <div class="pf-note">Bangkok Patana is one of Bangkok's most rigorous British curriculum schools. A Grade B here is equivalent to a solid Grade B at a UK prep school. Do not discount grades due to international school provenance.</div>

  <div class="pf-sub">Subject Performance &mdash; 6 Term Record</div>
  <div style="overflow-x:auto;margin-bottom:20px">
  <table class="ac-tbl">
    <thead>
      <tr>
        <th>Subject</th>
        <th>T1 2024</th><th>T2 2024</th><th>T3 2024</th>
        <th>T1 2025</th><th>T2 2025</th><th>T3 2025</th>
        <th>Trend</th>
        <th>School Requires</th>
        <th>Gap Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="ac-subj">Mathematics</td>
        <td class="ac-g">B</td><td class="ac-g">B</td><td class="ac-g">B</td>
        <td class="ac-g">B</td><td class="ac-g">B</td><td class="ac-g" style="color:#5a9a5a">B+</td>
        <td><span class="tr-st">Stable</span></td>
        <td>B</td>
        <td><span class="bg-mt">Met</span></td>
      </tr>
      <tr>
        <td class="ac-subj">English Language</td>
        <td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#B8962E">A*</td>
        <td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td>
        <td><span class="tr-ss">Strong-Stable</span></td>
        <td>B</td>
        <td><span class="bg-ex">Exceeded</span></td>
      </tr>
      <tr>
        <td class="ac-subj">English Literature</td>
        <td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g">B+</td><td class="ac-g" style="color:#2d7a2d">A</td>
        <td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td>
        <td><span class="tr-ss">Strong-Stable</span></td>
        <td>B</td>
        <td><span class="bg-ex">Exceeded</span></td>
      </tr>
      <tr>
        <td class="ac-subj">Science (Combined)</td>
        <td class="ac-g" style="color:#c9a830">C</td><td class="ac-g" style="color:#c9a830">C</td><td class="ac-g" style="color:#c9a830">C+</td>
        <td class="ac-g" style="color:#c9a830">C</td><td class="ac-g" style="color:#c9a830">C</td><td class="ac-g" style="color:#c9a830">C+</td>
        <td><span class="tr-sl">Slight improvement</span></td>
        <td>B</td>
        <td><span class="bg-ag">Active Gap</span></td>
      </tr>
      <tr>
        <td class="ac-subj">Geography</td>
        <td class="ac-g">B</td><td class="ac-g">B+</td><td class="ac-g">B</td>
        <td class="ac-g">B</td><td class="ac-g">B+</td><td class="ac-g" style="color:#5a9a5a">B+</td>
        <td><span class="tr-im">Improving</span></td>
        <td>B</td>
        <td><span class="bg-mt">Met</span></td>
      </tr>
      <tr>
        <td class="ac-subj">History</td>
        <td class="ac-g">B+</td><td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g">B+</td>
        <td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td>
        <td><span class="tr-si">Strong-Improving</span></td>
        <td>B</td>
        <td><span class="bg-ex">Exceeded</span></td>
      </tr>
      <tr>
        <td class="ac-subj">Thai Language</td>
        <td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td>
        <td class="ac-g" style="color:#B8962E">A*</td><td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td>
        <td><span class="tr-cs">Consistently Strong</span></td>
        <td>&mdash;</td>
        <td><span class="bg-na">N/A</span></td>
      </tr>
      <tr>
        <td class="ac-subj">Art and Design</td>
        <td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#B8962E">A*</td><td class="ac-g" style="color:#2d7a2d">A</td>
        <td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td>
        <td><span class="tr-cs">Consistently Strong</span></td>
        <td>&mdash;</td>
        <td><span class="bg-as">Asset</span></td>
      </tr>
      <tr>
        <td class="ac-subj">Physical Education</td>
        <td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#B8962E">A*</td>
        <td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td><td class="ac-g" style="color:#2d7a2d">A</td>
        <td><span class="tr-cs">Consistently Strong</span></td>
        <td>&mdash;</td>
        <td><span class="bg-as">Asset</span></td>
      </tr>
      <tr>
        <td class="ac-subj">ICT / Computing</td>
        <td class="ac-g">B</td><td class="ac-g">B</td><td class="ac-g">B+</td>
        <td class="ac-g">B</td><td class="ac-g">B+</td><td class="ac-g">B+</td>
        <td><span class="tr-stim">Stable-Improving</span></td>
        <td>&mdash;</td>
        <td><span class="bg-na">N/A</span></td>
      </tr>
      <tr>
        <td class="ac-subj">French</td>
        <td class="ac-g" style="color:#c9a830">C</td><td class="ac-g" style="color:#c9a830">C</td><td class="ac-g" style="color:#c9a830">C+</td>
        <td class="ac-g" style="color:#c9a830">C+</td><td class="ac-g">B</td><td class="ac-g">B</td>
        <td><span class="tr-im">Improving</span></td>
        <td>&mdash;</td>
        <td><span class="bg-na">N/A</span></td>
      </tr>
    </tbody>
  </table>
  </div>

  <div class="pf-sub">Teacher Comments Summary</div>
  <div class="as-card">
    <div style="font-size:12px;font-weight:700;color:#1a1a1a;margin-bottom:8px">Science (Combined) &mdash; Active Gap</div>
    <div style="font-size:12px;color:#444;line-height:1.75">Teacher notes strong conceptual curiosity but significant difficulty under timed exam conditions. Practical work scores are consistently higher than written paper scores. Understanding is present but exam technique is weak. Tutoring should focus on exam technique and timed practice, not concept re-teaching.</div>
  </div>
  <div class="as-card">
    <div style="font-size:12px;font-weight:700;color:#1a1a1a;margin-bottom:8px">Mathematics &mdash; Met</div>
    <div style="font-size:12px;color:#444;line-height:1.75">Teacher notes consistent, reliable performance. Student described as "steady and methodical." Under-performs in open-ended problem solving but strong on procedural questions. CE Maths Paper 1 (procedural) will suit her better than Paper 2 (problem solving) — prepare accordingly.</div>
  </div>
  <div class="as-card">
    <div style="font-size:12px;font-weight:700;color:#1a1a1a;margin-bottom:8px">English Language &amp; Literature &mdash; Exceeded</div>
    <div style="font-size:12px;color:#444;line-height:1.75">Teacher notes exceptional written expression for age and language background. Described as "a natural writer with genuine voice." This is unusual for an EAL student and should be highlighted prominently in the application personal statement.</div>
  </div>
  <div class="as-card">
    <div style="font-size:12px;font-weight:700;color:#1a1a1a;margin-bottom:8px">Art and Design &mdash; Asset</div>
    <div style="font-size:12px;color:#444;line-height:1.75">Repeatedly highlighted as exceptional. Teacher has recommended external art school or competition submission. This has not yet been pursued — worth considering as a secondary activity development before the application.</div>
  </div>

  <div class="pf-sub">Academic Narrative</div>
  <div class="pf-narrative">Ping's academic profile shows a student with genuine intellectual strengths in humanities, languages, and creative subjects — and a structural gap in Science that has persisted consistently across two full years. The Science gap is not a sign of low ability. Teacher comments consistently describe strong curiosity and good practical understanding. The gap is in exam technique under time pressure, which is a learnable skill. Her English language ability is exceptional for a Thai student at this stage and will be her strongest academic asset in the UK. The consistent upward trend in French suggests she acquires languages well when motivated — a positive signal for adapting to an all-English environment.</div>

  {live_academic_html}
</div>"""

    # ── Section 3 — Standardised Assessments ────────────────────────────────
    sec3 = """
<div id="pf-3" class="pf-section">
  <div class="pf-sec-num">Section 03</div>
  <div class="pf-sec-title">Standardised Assessments</div>
  <div class="pf-sec-desc">Formal assessment results used directly by UK schools in their selection process. Each test has a specific purpose and required threshold.</div>

  <div class="pf-sub pf-sub-first">UKISET</div>
  <div class="as-card">
    <span class="as-st-flag">Not Yet Taken &mdash; Overdue</span>
    <div class="pf-row" style="border-bottom:none;padding-top:0"><div class="pf-lbl">Required by Bromsgrove</div><div class="pf-val">Yes</div></div>
    <div class="pf-row"><div class="pf-lbl">Preparation Started</div><div class="pf-val" style="color:#c9a830;font-weight:600">No &mdash; flagged as overdue in Roadmap</div></div>
    <div class="pf-row"><div class="pf-lbl">Recommended By</div><div class="pf-val">June 2026</div></div>
    <div class="pf-row"><div class="pf-lbl">Verbal Reasoning</div><div class="pf-val" style="color:#aaa">&mdash; &nbsp;(Target: 110+)</div></div>
    <div class="pf-row"><div class="pf-lbl">Non-Verbal Reasoning</div><div class="pf-val" style="color:#aaa">&mdash;</div></div>
    <div class="pf-row"><div class="pf-lbl">English</div><div class="pf-val" style="color:#aaa">&mdash;</div></div>
    <div class="pf-row"><div class="pf-lbl">Overall Profile</div><div class="pf-val" style="color:#aaa">&mdash;</div></div>
    <div class="pf-row"><div class="pf-lbl">Schools Results Sent To</div><div class="pf-val" style="color:#aaa">&mdash;</div></div>
    <div class="as-ex">UKISET (UK Independent Schools' Entry Test) measures Verbal Reasoning, Non-Verbal Reasoning, and English ability. Most UK boarding schools use it to standardise assessment across international applicants from different curriculum backgrounds. Bromsgrove requires a Verbal Reasoning score of 110 or above for competitive Year 9 entry. Ping has not yet taken UKISET — this is the most urgent assessment gap in her profile.</div>
  </div>

  <div class="pf-sub">Common Entrance Mock Results</div>
  <div style="overflow-x:auto;margin-bottom:14px">
  <table class="ce-tbl">
    <thead>
      <tr>
        <th>Mock</th><th>Date</th><th>Maths</th><th>English</th>
        <th>Science</th><th>Overall</th><th>Target</th><th>Gap</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="font-weight:600;color:#1a1a1a">Mock 1</td>
        <td style="color:#aaa">Term 2 2025</td>
        <td>62%</td><td style="color:#5a9a5a;font-weight:600">71%</td>
        <td style="color:#ca6d6d;font-weight:600">41%</td>
        <td style="font-weight:600">58%</td>
        <td>70%</td>
        <td style="color:#c9a830;font-weight:600">-12%</td>
      </tr>
    </tbody>
  </table>
  </div>
  <div class="pf-row"><div class="pf-lbl">Next Mock Scheduled</div><div class="pf-val">September 2026</div></div>
  <div class="pf-row"><div class="pf-lbl">Predicted Score (Current Trajectory)</div><div class="pf-val">62% to 65%</div></div>
  <div class="pf-note">The Science component (41%) is significantly dragging down the overall CE score. English (71%) is already above the target threshold. Maths (62%) is approaching target. If Science reaches 60% on the next mock, the overall score moves to approximately 64%, which crosses the Bromsgrove acceptance threshold of 60% and approaches the competitive 70% target. Science CE preparation should focus specifically on the written paper — Ping's practical understanding is strong but the written component is where marks are being lost.</div>

  <div class="pf-sub">English Language Qualifications</div>
  <div class="pf-row"><div class="pf-lbl">Cambridge English KET</div><div class="pf-val"><span class="bg-ex">Passed</span> &nbsp; Grade A &nbsp;&middot;&nbsp; January 2025</div></div>
  <div class="pf-row"><div class="pf-lbl">Cambridge English PET</div><div class="pf-val" style="color:#c9a830;font-weight:600">Not yet taken &mdash; recommended June 2026</div></div>
  <div class="pf-row"><div class="pf-lbl">IELTS</div><div class="pf-val" style="color:#aaa">Not yet taken &mdash; not required until university application</div></div>
  <div class="pf-row"><div class="pf-lbl">TOEFL</div><div class="pf-val" style="color:#aaa">Not yet taken &mdash; not required at boarding school level</div></div>
  <div class="pf-note">Teacher Assessment: Upper-Intermediate. Can follow academic instruction in English, express ideas in writing with good accuracy, but oral communication becomes hesitant under social pressure. Recommend English conversation and presentation practice before September 2027 entry.</div>

  <div class="pf-sub">Cognitive and Academic Potential</div>
  <div class="pf-row"><div class="pf-lbl">Educational Psychologist Assessment</div><div class="pf-val" style="color:#c9a830;font-weight:600">Not completed &mdash; recommended before formal application</div></div>
  <div class="pf-note">An EP assessment is recommended before the formal application. It provides validated evidence of cognitive ability that can contextualise the Science grade gap — if Ping's non-verbal reasoning is strong, this supports the case that the Science gap is technique-related rather than ability-related. Some schools will consider EP results in borderline cases.</div>
  <div class="pf-note">Consultant Observation: Based on academic performance patterns, teacher comments, and consultation conversation, Ping demonstrates strong verbal-linguistic intelligence (English, Thai, History, Art), adequate logical-mathematical ability (Maths at threshold level), and potential spatial intelligence (Art, golf course management). The Science gap appears inconsistent with her overall intellectual profile and strongly suggests exam technique rather than subject ability as the root cause.</div>
</div>"""

    # ── Section 4 — Learning Profile ────────────────────────────────────────
    sec4 = """
<div id="pf-4" class="pf-section">
  <div class="pf-sec-num">Section 04</div>
  <div class="pf-sec-title">Learning Profile</div>
  <div class="pf-sec-desc">How Ping learns best. Used to match tutoring approach, school environment, and study preparation.</div>

  <div class="pf-sub pf-sub-first">Learning Style Assessment <span class="ph2-btn">Coming Soon &mdash; Learning Style Tool</span></div>
  <div style="margin-bottom:12px"><span class="as-st-pend">Formal Assessment Pending</span> <span style="font-size:11px;color:#aaa;margin-left:8px">Current data from consultant observation and parent report only</span></div>
  <div class="pf-row"><div class="pf-lbl">Assessment Method</div><div class="pf-val">Consultant observation and parent report — formal assessment not yet completed</div></div>
  <div class="pf-row"><div class="pf-lbl">Primary Learning Style</div><div class="pf-val">Kinaesthetic — learns best through doing, practical application, and movement</div></div>
  <div class="pf-row"><div class="pf-lbl">Secondary Learning Style</div><div class="pf-val">Visual — responds well to diagrams, colour, and visual organisation</div></div>
  <div class="pf-row"><div class="pf-lbl">Weakest Mode</div><div class="pf-val">Auditory-sequential — struggles to absorb information delivered as long verbal explanations without visual support</div></div>
  <div class="pf-note">Tutoring sessions should use worked examples first, then practice, not theory-first explanation. Science tutoring should maximise practical demonstrations and visual models. Avoid extended verbal explanation of abstract concepts — Ping will disengage. Break sessions into shorter focused blocks with movement breaks if possible.</div>
  <div class="pf-note">School Matching Implication: Ping will thrive in schools with active project-based learning, strong sports integration into daily life, and hands-on teaching approaches. Traditional chalk-and-talk schools with large passive lecture-style classes are not recommended. Bromsgrove's teaching approach is inquiry-led at Year 9 — a positive match.</div>

  <div class="pf-sub">Study Habits</div>
  <div class="pf-row"><div class="pf-lbl">Independent Study</div><div class="pf-val">Moderate — needs structure and a clear task. Does not study well with open-ended "just revise" instruction.</div></div>
  <div class="pf-row"><div class="pf-lbl">Homework Completion</div><div class="pf-val">Consistent at current school — no pattern of missed or late submissions</div></div>
  <div class="pf-row"><div class="pf-lbl">Help-Seeking Behaviour</div><div class="pf-val">Avoids asking for help in class. More willing to ask a tutor or consultant privately. Flag for boarding house — she may not ask her housemaster for help when struggling.</div></div>
  <div class="pf-row"><div class="pf-lbl">Screen Time</div><div class="pf-val">High — 4 to 5 hours daily on phone outside school</div></div>
  <div class="pf-row"><div class="pf-lbl">Study Environment Preference</div><div class="pf-val">Quiet, tidy, private space. Does not study well with background noise.</div></div>
  <div class="pf-note">Boarding school prep hour (typically 7pm to 9pm in a supervised house study room) will suit Ping's need for structure and quiet. However the transition from 4 to 5 hours of daily phone use to restricted boarding school device policy will need specific preparation and a realistic family conversation before departure.</div>

  <div class="pf-sub">Performance Under Pressure <span class="ph2-btn">Coming Soon &mdash; Subject Confidence Tool</span></div>
  <div class="pf-row"><div class="pf-lbl">Exam vs Continuous Assessment</div><div class="pf-val">Significantly lower under exam conditions. Science illustrates this clearly — practical and continuous assessment grades are higher than written paper scores.</div></div>
  <div class="pf-row"><div class="pf-lbl">High-Stakes Response</div><div class="pf-val">Shows visible anxiety before formal assessments. Has reported feeling her mind going blank in exams despite knowing the material.</div></div>
  <div class="pf-row"><div class="pf-lbl">Golf Performance Under Pressure</div><div class="pf-val">Consistent — does not show the same anxiety response in competitive golf as in academic exams. Suggests exam anxiety is specific to academic contexts and is addressable.</div></div>
  <div class="pf-note">Recommended intervention: exam technique coaching is as important as subject knowledge tutoring. Specifically: timed practice papers from Term 3 2026 onward, controlled breathing and focus techniques introduced by the tutor, and mock exam simulations in exam-like conditions to build familiarity with the format.</div>
</div>"""

    # ── Section 5 — Sport Profile ────────────────────────────────────────────
    sec5 = """
<div id="pf-5" class="pf-section">
  <div class="pf-sec-num">Section 05</div>
  <div class="pf-sec-title">Sport Profile</div>
  <div class="pf-sec-desc">Complete athletic record. Used for sport scholarship applications, school matching, and summer camp recommendations.</div>

  <div class="pf-sub pf-sub-first">Primary Sport &mdash; Golf <span class="ph2-btn">Coming Soon &mdash; Sport Profile Builder</span></div>
  <div class="pf-row"><div class="pf-lbl">Current Handicap</div><div class="pf-val" style="font-size:16px;font-family:'Playfair Display',serif;color:#B8962E">11</div></div>
  <div class="pf-row"><div class="pf-lbl">Handicap Certificate Date</div><div class="pf-val">February 2026</div></div>
  <div class="pf-row"><div class="pf-lbl">Handicap History</div><div class="pf-val">18 (Jan 2024) &nbsp;&rarr;&nbsp; 15 (Jun 2024) &nbsp;&rarr;&nbsp; 13 (Nov 2024) &nbsp;&rarr;&nbsp; 11 (Feb 2026)</div></div>
  <div class="pf-row"><div class="pf-lbl">Target for Scholarship</div><div class="pf-val">7 or below (Bromsgrove scholarship audition)</div></div>
  <div class="pf-row"><div class="pf-lbl">Gap to Target</div><div class="pf-val"><span class="bg-ag">4 shots</span> &nbsp;&middot;&nbsp; 19 months to January 2027 audition &nbsp;&middot;&nbsp; <span style="color:#5a9a5a;font-weight:600">Achievable with structured coaching</span></div></div>
  <div class="pf-row"><div class="pf-lbl">Coach 1</div><div class="pf-val">Somchai Prasertsak &nbsp;&middot;&nbsp; January 2020 to December 2023 &nbsp;&middot;&nbsp; Foundation and development &nbsp;&middot;&nbsp; 2 sessions/week</div></div>
  <div class="pf-row"><div class="pf-lbl">Coach 2 (Current)</div><div class="pf-val">Mark Holloway (PGA Professional, British-based Bangkok) &nbsp;&middot;&nbsp; January 2024 to present &nbsp;&middot;&nbsp; 3 sessions/week &nbsp;&middot;&nbsp; Competitive development</div></div>
  <div class="pf-row"><div class="pf-lbl">Training Frequency</div><div class="pf-val">3 sessions per week plus weekend independent practice rounds</div></div>
  <div class="pf-row"><div class="pf-lbl">Training Venue</div><div class="pf-val">Royal Bangkok Sports Club &mdash; 18-hole course</div></div>
  <div class="pf-row"><div class="pf-lbl">Typical Practice Round</div><div class="pf-val">Approximately +11 to +14 over par</div></div>
  <div class="pf-row"><div class="pf-lbl">Best Competitive Round</div><div class="pf-val">+8 &nbsp;&middot;&nbsp; Thailand Junior Circuit Round 1, January 2026</div></div>

  <div class="pf-sub">Tournament History</div>
  <table class="tn-tbl" style="margin-bottom:16px">
    <thead>
      <tr>
        <th>Date</th><th>Tournament</th><th>Location</th>
        <th>Score</th><th>Position</th><th>Field</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Sep 2025</td>
        <td>School Invitational</td>
        <td>Bangkok</td>
        <td>+9</td>
        <td>12th of 28</td>
        <td style="color:#aaa;font-size:11px">School-level</td>
      </tr>
      <tr>
        <td>Nov 2025</td>
        <td>Bangkok Junior Open</td>
        <td>Bangkok</td>
        <td>+10</td>
        <td>22nd of 45</td>
        <td style="color:#aaa;font-size:11px">Regional junior competitive</td>
      </tr>
      <tr>
        <td>Jan 2026</td>
        <td>Thailand Junior Circuit Round 1</td>
        <td>Chiang Mai</td>
        <td style="color:#5a9a5a;font-weight:600">+8</td>
        <td>18th of 52</td>
        <td style="color:#aaa;font-size:11px">National junior competitive</td>
      </tr>
    </tbody>
  </table>

  <div class="pf-sub">Scholarship Readiness Assessment</div>
  <div class="pf-note">Developing. Ping is 4 shots above the typical Bromsgrove scholarship threshold. Her improvement trajectory is strong — reducing handicap by 7 shots in 2 years is notable for a junior player. If the current trajectory continues, reaching handicap 7 by November 2026 is realistic. Key risk: trajectory must be sustained through a period of intensive academic preparation — there is a risk that increased CE tutoring from September 2026 reduces training time and slows handicap progression. Consultant should discuss training schedule management with family for the September to January period.</div>
  <div class="pf-note">Coach Assessment (Mark Holloway, February 2026): Ping has exceptional natural timing for her age. Her short game is her strongest asset — putting and chipping are notably above junior average. Her main development area is driver consistency under competitive pressure. She is highly coachable and responds well to technical instruction. Handicap 7 is achievable by mid-2027 with sustained effort.</div>

  <div class="pf-sub">Secondary Sport &mdash; Swimming</div>
  <div class="pf-row"><div class="pf-lbl">Level</div><div class="pf-val">Recreational — school team but not competitive beyond school level</div></div>
  <div class="pf-row"><div class="pf-lbl">Years Active</div><div class="pf-val">6 years</div></div>
  <div class="pf-row"><div class="pf-lbl">Training</div><div class="pf-val">School PE sessions only &mdash; not active outside school</div></div>
  <div class="pf-row"><div class="pf-lbl">Relevance to Application</div><div class="pf-val">Minor &mdash; shows physical versatility. Not sufficient to add significant application value on its own.</div></div>
</div>"""

    # ── Section 6 — Creative and Performing Arts ─────────────────────────────
    sec6 = """
<div id="pf-6" class="pf-section">
  <div class="pf-sec-num">Section 06</div>
  <div class="pf-sec-title">Creative and Performing Arts</div>
  <div class="pf-sec-desc">Creative talents and artistic development. Used for school matching and building extracurricular application profile.</div>

  <div class="pf-sub pf-sub-first">Visual Art</div>
  <div class="pf-row"><div class="pf-lbl">Status</div><div class="pf-val">Active at school &mdash; not pursued externally</div></div>
  <div class="pf-row"><div class="pf-lbl">Medium</div><div class="pf-val">Drawing and illustration &mdash; particularly detailed technical drawing and character design</div></div>
  <div class="pf-row"><div class="pf-lbl">School Grade</div><div class="pf-val" style="color:#2d7a2d;font-weight:600">Consistently A to A* across all 6 recorded terms</div></div>
  <div class="pf-row"><div class="pf-lbl">Teacher Recommendation</div><div class="pf-val">Recommended for external competition or art school programme — not yet acted upon</div></div>
  <div class="pf-row"><div class="pf-lbl">Portfolio</div><div class="pf-val" style="color:#c9a830;font-weight:600">None currently compiled</div></div>
  <div class="pf-row"><div class="pf-lbl">Relevance to Application</div><div class="pf-val">High — consistent A* in Art is a strong application asset. The specific style may connect well with schools offering design technology or architecture pathways.</div></div>
  <div class="pf-note">Recommendation: Compile an art portfolio before application submission. Even 8 to 10 strong pieces in PDF format. Some schools request a creative portfolio alongside the standard application. Bromsgrove has an active art programme — worth mentioning in the personal statement.</div>

  <div class="pf-sub">Music</div>
  <div class="pf-row"><div class="pf-lbl">Instrument</div><div class="pf-val">None formally studied</div></div>
  <div class="pf-row"><div class="pf-lbl">Informal Engagement</div><div class="pf-val">Listens extensively (K-pop, Thai pop, some Western). No formal music study.</div></div>
  <div class="pf-row"><div class="pf-lbl">ABRSM Grade</div><div class="pf-val">None</div></div>
  <div class="pf-note">Music is not a current asset or development priority given the timeline. Do not recommend starting an instrument at this stage — 18 months is insufficient to reach a grade level meaningful for a boarding school application. Focus creative extracurricular energy on the art portfolio instead.</div>

  <div class="pf-sub">Drama and Performance</div>
  <div class="pf-row"><div class="pf-lbl">Drama Experience</div><div class="pf-val">School drama club &mdash; participated in two productions as supporting cast (Year 7 and Year 8)</div></div>
  <div class="pf-row"><div class="pf-lbl">LAMDA Qualifications</div><div class="pf-val">None</div></div>
  <div class="pf-row"><div class="pf-lbl">Public Speaking</div><div class="pf-val">Participated in one school debate &mdash; described by teacher as confident once settled but visibly nervous at start</div></div>
  <div class="pf-row"><div class="pf-lbl">Relevance</div><div class="pf-val">Low to moderate. Drama participation shows social confidence and willingness to take part. Not a scholarship-level talent.</div></div>
</div>"""

    # ── Section 7 — Character and Activities ─────────────────────────────────
    sec7 = """
<div id="pf-7" class="pf-section">
  <div class="pf-sec-num">Section 07</div>
  <div class="pf-sec-title">Character and Activities</div>
  <div class="pf-sec-desc">Leadership, community involvement, and personal development record. Used to build the extracurricular profile section of school applications.</div>

  <div class="pf-sub pf-sub-first">Positions of Responsibility <span class="ph2-btn">Coming Soon &mdash; Personality and Character Quiz</span></div>
  <div class="pf-row"><div class="pf-lbl">School Council</div><div class="pf-val">Representative &mdash; Year 7 &mdash; one year</div></div>
  <div class="pf-row"><div class="pf-lbl">Sports Captain (Golf)</div><div class="pf-val">Not held at school level &mdash; school does not have a formal golf team</div></div>
  <div class="pf-row"><div class="pf-lbl">Class Monitor</div><div class="pf-val">Year 8 &mdash; current</div></div>
  <div class="pf-note">Light leadership record for age and school. One year of student council is positive. No sports leadership role yet — this will come more naturally once in a school with a formal golf programme. Not a concern at Year 9 entry level.</div>

  <div class="pf-sub">Community Service and Volunteering</div>
  <div class="pf-row"><div class="pf-lbl">Temple Volunteering</div><div class="pf-val">Annual participation in family merit-making activities &mdash; not structured volunteering</div></div>
  <div class="pf-row"><div class="pf-lbl">School Community Service</div><div class="pf-val">Participated in school food drive &mdash; 2024</div></div>
  <div class="pf-row"><div class="pf-lbl">Structured Volunteering Hours</div><div class="pf-val">Estimated 8 to 10 hours per year</div></div>
  <div class="pf-note">Thin volunteering record. Below what a competitive UK boarding school application would ideally show. Recommend adding one structured ongoing volunteering commitment in 2026 — even 2 hours per month over 12 months creates a more credible record than sporadic one-day events.</div>

  <div class="pf-sub">Duke of Edinburgh Award</div>
  <div class="pf-row"><div class="pf-lbl">Status</div><div class="pf-val" style="color:#c9a830;font-weight:600">Not started</div></div>
  <div class="pf-row"><div class="pf-lbl">Eligibility</div><div class="pf-val">Eligible to begin Bronze from September 2026 (age 14 from March 2026 — meets minimum age)</div></div>
  <div class="pf-note">Begin Bronze Award September 2026 through Bangkok Patana School if the programme is available. Bronze takes 6 to 12 months — completing or being actively mid-way through Bronze by the November 2026 application deadline shows initiative and demonstrates the qualities UK boarding schools value. Bromsgrove actively supports continuation to Silver and Gold once enrolled.</div>

  <div class="pf-sub">Extracurricular Activities Record</div>
  <div class="pf-row"><div class="pf-lbl">Golf</div><div class="pf-val">Primary activity &mdash; 3 sessions per week plus tournaments &mdash; active and developing</div></div>
  <div class="pf-row"><div class="pf-lbl">Art Club</div><div class="pf-val">School &mdash; occasional attendance &mdash; not a formal commitment</div></div>
  <div class="pf-row"><div class="pf-lbl">Drama Club</div><div class="pf-val">School &mdash; 2 productions &mdash; Year 7 and Year 8</div></div>
  <div class="pf-row"><div class="pf-lbl">Swimming</div><div class="pf-val">School team &mdash; recreational level</div></div>
  <div class="pf-row"><div class="pf-lbl">Profile Assessment</div><div class="pf-val">6 out of 10 against a competitive Year 9 boarding school applicant benchmark. Centred almost entirely on golf — appropriate for a sport scholarship application. Adding one non-sport structured activity before November 2026 is recommended.</div></div>

  <div class="pf-sub">International Experience</div>
  <div class="pf-row"><div class="pf-lbl">Countries Visited</div><div class="pf-val">Thailand (home) &nbsp;&middot;&nbsp; Japan (2023) &nbsp;&middot;&nbsp; Singapore (2024) &nbsp;&middot;&nbsp; No UK or Europe visits yet</div></div>
  <div class="pf-row"><div class="pf-lbl">Living Abroad</div><div class="pf-val">None</div></div>
  <div class="pf-row"><div class="pf-lbl">UK Residential Experience</div><div class="pf-val" style="color:#c9a830;font-weight:600">None &mdash; first planned experience is Bromsgrove Summer School July 2026</div></div>
  <div class="pf-row"><div class="pf-lbl">Cultural Adjustment Risk</div><div class="pf-val">Moderate &mdash; no prior experience of Western cultural environment. Japan and Singapore visits show family openness to international travel.</div></div>
</div>"""

    # ── Section 8 — Wellbeing and Pastoral ──────────────────────────────────
    sec8 = f"""
<div id="pf-8" class="pf-section">
  <div class="pf-sec-num">Section 08</div>
  <div class="pf-sec-title">Wellbeing and Pastoral</div>
  <div class="pf-sec-desc">Pastoral readiness assessment. Used to match school environment, prepare the student and family, and brief the UK guardian.</div>

  <div class="pf-sub pf-sub-first">Separation and Independence History</div>
  <div class="pf-row"><div class="pf-lbl">Prior Residential Experience</div><div class="pf-val">None &mdash; has never slept away from family home for more than 2 nights</div></div>
  <div class="pf-row"><div class="pf-lbl">Longest Time Away From Parents</div><div class="pf-val">3 days (stayed with aunt while parents travelled)</div></div>
  <div class="pf-row"><div class="pf-lbl">Response to Separation</div><div class="pf-val">Cries when saying goodbye to mother at airport even for short trips. Settles quickly once distracted. Does not sustain distress. Has never expressed a desire to come home early from any trip.</div></div>
  <div class="pf-row"><div class="pf-lbl">Independence Assessment</div><div class="pf-val">Low to moderate. Capable of basic self-management but has never navigated UK public transport, managed a bank account, or made appointments independently.</div></div>

  <div class="pf-sub">Social Profile <span class="ph2-btn">Coming Soon &mdash; Personality and Character Quiz</span></div>
  <div class="pf-row"><div class="pf-lbl">Friendship Style</div><div class="pf-val">Prefers small number of close friends over large social group. Currently has 3 close friends at Bangkok Patana. Takes 4 to 6 weeks to feel comfortable with new people.</div></div>
  <div class="pf-row"><div class="pf-lbl">Social Anxiety Level</div><div class="pf-val">Mild &mdash; visible nervousness in new social situations, resolves within a few weeks</div></div>
  <div class="pf-row"><div class="pf-lbl">Peer Group Response</div><div class="pf-val">Well-liked within established friend group. Not described as a social leader. Will participate once invited rather than organise social activities.</div></div>
  <div class="pf-note">Ping's social profile suggests she will have a more difficult first 4 to 6 weeks than an extroverted student, but will settle well once she finds her core friendship group. The house system at Bromsgrove — where students eat, sleep, and spend evenings together — actually works in Ping's favour. Forced proximity in a structured environment accelerates friendship formation for quieter students. The housemaster should be briefed to watch for social isolation in the first 4 weeks.</div>

  <div class="pf-sub">Technology and Screen Time</div>
  <div class="pf-row"><div class="pf-lbl">Current Daily Screen Time</div><div class="pf-val">4 to 5 hours (phone) &mdash; social media, YouTube, golf content</div></div>
  <div class="pf-row"><div class="pf-lbl">Device Restriction at Current School</div><div class="pf-val">Approximately 6 hours of restriction daily (phones collected at classroom door)</div></div>
  <div class="pf-row"><div class="pf-lbl">Bromsgrove Device Policy</div><div class="pf-val">Approximately 15 to 16 hours of restricted access daily &mdash; significantly more restriction than current experience</div></div>
  <div class="pf-note">The jump from 6 hours of daily restriction to 15 to 16 hours will be a meaningful adjustment. Recommend beginning a gradual phone restriction programme at home 3 months before departure &mdash; incrementally extending the periods without phone access to build the habit before it is imposed externally.</div>

  <div class="pf-sub">Family Communication Plan</div>
  <div class="pf-row"><div class="pf-lbl">Mother's Expectation</div><div class="pf-val">Daily contact &mdash; video call at minimum every 2 days</div></div>
  <div class="pf-row"><div class="pf-lbl">Father's Expectation</div><div class="pf-val">Weekly update sufficient</div></div>
  <div class="pf-row"><div class="pf-lbl">Ping's Expectation</div><div class="pf-val">"I will call when I want to &mdash; probably every 2 or 3 days once I have friends."</div></div>
  <div class="pf-note">Gap identified: mother expects more frequent contact than Ping anticipates initiating. Recommended agreement: video call every 3 days as agreed minimum, with Ping able to call more frequently whenever she wants. Brief the guardian to send a brief weekly WhatsApp update to the mother independent of Ping's own calls &mdash; this significantly reduces parental anxiety.</div>

  <div class="pf-sub">Mental Health and Emotional History</div>
  <div class="pf-row"><div class="pf-lbl">Significant Emotional Difficulty</div><div class="pf-val">None reported</div></div>
  <div class="pf-row"><div class="pf-lbl">Anxiety Profile</div><div class="pf-val">Mild academic performance anxiety &mdash; specifically exam situations. Does not extend to social anxiety of clinical level or generalised anxiety.</div></div>
  <div class="pf-row"><div class="pf-lbl">Homesickness Risk</div><div class="pf-val"><span class="bg-ag">Medium</span> &nbsp;&middot;&nbsp; First time away, strong attachment to mother, no prior residential experience. Counter-factors: self-motivated, resilient, settles quickly.</div></div>
  <div class="pf-note">Guardian Briefing Notes: Monitor for social withdrawal in first 4 weeks. If Ping is not eating meals with her house group by Week 3, contact LinkedU. Watch for exam-period anxiety spikes — she may need additional pastoral support before internal assessments. Otherwise, expect a normal settling period and a strong second half of Year 9.</div>

  <div class="pf-sub">Pre-Departure Preparation Checklist</div>
  <ul class="pf-cl">
    <li><div class="cl-box"></div><div>UK residential camp experience &mdash; planned: Bromsgrove Summer School July 2026</div></li>
    <li><div class="cl-box"></div><div>Phone restriction gradual programme &mdash; start March 2027, 6 months before departure</div></li>
    <li><div class="cl-box"></div><div>Family communication agreement &mdash; LinkedU-facilitated conversation, recommend June 2027</div></li>
    <li><div class="cl-box"></div><div>Guardian briefing session &mdash; LinkedU arranges, July 2027</div></li>
    <li><div class="cl-box"></div><div>Basic UK life skills &mdash; public transport, NHS registration, bank account setup &mdash; pre-departure orientation with LinkedU</div></li>
    <li><div class="cl-box"></div><div>Pre-departure LinkedU orientation day with Ping and Khun Mae Araya &mdash; plan for August 2027</div></li>
    <li><div class="cl-box"></div><div>School packing and uniform preparation &mdash; Bromsgrove uniform list, start August 2027</div></li>
  </ul>

  <div style="margin-top:24px">
    <a href="https://line.me/R/ti/p/@{LINE_HANDLE}" target="_blank" class="btn-primary" style="display:inline-block">
      <span class="lang-en">Contact Consultant to Update Profile</span>
      <span class="lang-th">ติดต่อที่ปรึกษาเพื่ออัปเดตโปรไฟล์</span>
    </a>
  </div>
</div>"""

    # ── Sidebar active link JS ───────────────────────────────────────────────
    scroll_js = """
<script>
(function() {
  var ids = ['pf-1','pf-2','pf-3','pf-4','pf-5','pf-6','pf-7','pf-8'];
  function updateNav() {
    var scrollY = window.scrollY + 160;
    var active = ids[0];
    ids.forEach(function(id) {
      var el = document.getElementById(id);
      if (el && el.offsetTop <= scrollY) active = id;
    });
    document.querySelectorAll('.pf-nav-a').forEach(function(a) {
      a.classList.toggle('pf-active', a.getAttribute('href') === '#' + active);
    });
  }
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();
})();
</script>"""

    return (
        f"<style>{PROFILE_CSS}</style>"
        + banner
        + mobile_nav
        + '<div class="pf-layout">'
        + sidebar
        + '<div class="pf-content">'
        + sec1 + sec2 + sec3 + sec4 + sec5 + sec6 + sec7 + sec8
        + '</div></div>'
        + scroll_js
    )
