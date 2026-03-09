#!/usr/bin/env python3
"""
LinkedU Parent Portal — v2
Tab-based dashboard with design-bible styling, bilingual EN/TH,
Chart.js academics, school recommendations, tools library, document upload.
"""
import http.server, urllib.request, urllib.parse, urllib.error
import json, os, glob, socketserver
from datetime import datetime
from profile_tab import tab_profile_full
from recommendations_v2 import tab_recommendations_v2
from golf_tab import tab_golf_reports
from golf_analyst import analyst_app_html

PORT        = int(os.environ.get("PORT", 8904))
NOTION_KEY  = os.environ.get("NOTION_KEY", "")
NOTION_VER  = "2022-06-28"
WEBSITE_URL = "http://127.0.0.1:8901"   # local website preview
LINE_HANDLE = "satitlinkedu"
THB_RATE    = 46

DB = {
    "students":      "31d9d89c-abdc-816e-9e31-f17fcf384d6e",
    "academics":     "31d9d89c-abdc-81c9-87e9-f01d2579992f",
    "subscriptions": "31d9d89c-abdc-81bf-ac3d-e4c2c3f2925d",
    "milestones":    "31d9d89c-abdc-8101-b95f-f28ed5b4db10",
    "documents":     "31d9d89c-abdc-81e7-9468-dea2c705c332",
}

# ── Golf rounds storage (server-side, JSON file) ────────────────────────────

_ROUNDS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "golf_rounds.json")

def _load_rounds():
    try:
        with open(_ROUNDS_FILE) as f:
            return {r["roundId"]: r for r in json.load(f)}
    except:
        return {}

def _persist_rounds():
    try:
        with open(_ROUNDS_FILE, "w") as f:
            json.dump(list(GOLF_ROUNDS.values()), f)
    except Exception as e:
        print(f"Golf rounds save error: {e}")

GOLF_ROUNDS = _load_rounds()

def golf_save_round(r):
    GOLF_ROUNDS[r["roundId"]] = r
    _persist_rounds()

def golf_get_rounds(student_id):
    return sorted(
        [r for r in GOLF_ROUNDS.values() if r.get("studentId") == student_id],
        key=lambda r: r.get("date", ""), reverse=True
    )

def golf_clear_student(student_id):
    for rid in [rid for rid, r in list(GOLF_ROUNDS.items()) if r.get("studentId") == student_id]:
        del GOLF_ROUNDS[rid]
    _persist_rounds()

# ── school name → website slug mapping ──────────────────────────────────────
SCHOOL_SLUGS = {
    "bromsgrove": "bromsgrove-school",
    "rossall": "rossall-school",
    "millfield": "millfield-school",
    "harrow": "harrow-school",
    "eton": "eton-college",
    "cardiff": "cardiff-sixth-form-college",
    "concord": "concord-college",
    "oundle": "oundle-school",
    "rugby": "rugby-school",
    "cheltenham": "cheltenham-college",
    "marlborough": "marlborough-college",
    "wellington": "wellington-college",
    "repton": "repton-school",
    "shrewsbury": "shrewsbury-school",
    "radley": "radley-college",
    "charterhouse": "charterhouse",
    "winchester": "winchester-college",
    "westminster": "westminster-school",
}

# ── Notion helpers ──────────────────────────────────────────────────────────

def notion_req(method, endpoint, data=None):
    url = f"https://api.notion.com/v1/{endpoint}"
    headers = {"Authorization": f"Bearer {NOTION_KEY}",
               "Content-Type": "application/json",
               "Notion-Version": NOTION_VER}
    body = json.dumps(data).encode() if data else None
    req  = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"Notion error: {e}")
        return None

def qdb(db_id, filt=None, sorts=None):
    p = {}
    if filt:  p["filter"] = filt
    if sorts: p["sorts"]  = sorts
    r = notion_req("POST", f"databases/{db_id}/query", p)
    return r.get("results", []) if r else []

def prop(page, key, default=""):
    try:
        p = page["properties"][key]; t = p["type"]
        if t == "title":       return "".join(r["plain_text"] for r in p["title"])
        if t == "rich_text":   return "".join(r["plain_text"] for r in p["rich_text"])
        if t == "select":      return p["select"]["name"] if p["select"] else default
        if t == "multi_select":return [o["name"] for o in p["multi_select"]]
        if t == "number":      return p["number"]
        if t == "date":        return p["date"]["start"] if p["date"] else default
        if t == "checkbox":    return p["checkbox"]
        if t == "url":         return p["url"] or default
    except: pass
    return default

# ── Data fetch ──────────────────────────────────────────────────────────────

def load_student(token):
    rows = qdb(DB["students"], filt={"property":"Portal Token","rich_text":{"equals":token.upper().strip()}})
    return rows[0] if rows else None

def load_all(sid):
    ms  = qdb(DB["milestones"],    filt={"property":"Student","relation":{"contains":sid}}, sorts=[{"property":"Date","direction":"ascending"}])
    docs= qdb(DB["documents"],     filt={"property":"Student","relation":{"contains":sid}})
    svcs= qdb(DB["subscriptions"], filt={"property":"Student","relation":{"contains":sid}})
    acs = qdb(DB["academics"],     filt={"property":"Student","relation":{"contains":sid}}, sorts=[{"property":"Date","direction":"ascending"}])
    return ms, docs, svcs, acs

def save_doc_link(student_id, doc_title, link, notes):
    notion_req("POST", "pages", {
        "parent": {"database_id": DB["documents"]},
        "properties": {
            "Document Title": {"title": [{"text": {"content": doc_title}}]},
            "Student": {"relation": [{"id": student_id}]},
            "Document Type": {"select": {"name": "Other"}},
            "Status": {"select": {"name": "📤 Uploaded"}},
            "File Link": {"url": link},
            "Notes": {"rich_text": [{"text": {"content": notes or "Uploaded via parent portal"}}]},
        }
    })

# ── Utility ─────────────────────────────────────────────────────────────────

def fmt_date(d, short=False):
    if not d: return "—"
    try:
        dt = datetime.strptime(d[:10], "%Y-%m-%d")
        return dt.strftime("%-d %b %Y") if not short else dt.strftime("%b %Y")
    except: return d[:10]

def days_away(d):
    if not d: return None
    try:
        delta = (datetime.strptime(d[:10], "%Y-%m-%d").date() - datetime.today().date()).days
        return delta
    except: return None

def find_pdfs(name):
    results = []
    pattern = f"/tmp/linkedu-report-{name}-*.pdf"
    for p in glob.glob(pattern):
        results.append(p)
    # also try loose match
    if not results:
        for p in glob.glob("/tmp/linkedu-report-*.pdf"):
            bn = os.path.basename(p).lower()
            if name.lower() in bn:
                results.append(p)
    return sorted(results, reverse=True)

def extract_schools_from_milestones(milestones):
    """Return list of (display_name, slug) found in milestone titles."""
    found = {}
    for m in milestones:
        title = prop(m, "Milestone Title").lower()
        for key, slug in SCHOOL_SLUGS.items():
            if key in title and key not in found:
                found[key] = (key.title(), slug)
    return list(found.values())

def stage_num(stage_str):
    try: return int(stage_str[0])
    except: return 1

# ── LOGO ────────────────────────────────────────────────────────────────────

LOGO_DARK = """<a href="/" style="text-decoration:none">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 141 21" style="height:22px;width:auto;display:block"><style>.st0{fill:#FFFFFF;}</style><path class="st0" d="M24.7,20h-5V0h5V20z M5,15.5h10.8V20H0V0h5V15.5z M44.7,20h5V0h-5v12.2L34.3,0h-5v20h5V7.8L44.7,20z M66.4,8.1 L75,20h-6.5l-5.6-8.3l-3.6,3.8V20h-5V0h5v8.8L67.3,0h6.3L66.4,8.1z M94.2,4.5V0H78.4v20h15.8v-4.5H83.4v-3.4h9V7.9h-9V4.5H94.2z M118.3,10c0,5.8-4.5,10-10.9,10h-9.1V0l9.1,0C114.2,0,118.3,4.2,118.3,10z M103.3,15.5h4.2c3.5,0,5.9-2.2,5.9-5.6 c0-3.6-2.3-5.5-5.9-5.5h-4.2V15.5z M130.9,20.4c5.8,0,10.1-4,10.1-10.6h0V0h-5v9.7c0,3.8-1.9,6.1-5,6.1c-3.2,0-4.9-2.3-4.9-6.1V0h-5 v9.7C121.1,16.4,125.1,20.4,130.9,20.4z"/></svg>
  <span style="display:block;font-family:'Inter',sans-serif;font-size:8px;letter-spacing:0.25em;color:#f5f0e8;opacity:0.5;margin-top:4px;text-transform:uppercase">OVERSEAS EDUCATION</span>
</a>"""

# ── SHARED CSS ───────────────────────────────────────────────────────────────

SHARED_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:15px;-webkit-font-smoothing:antialiased}
body{background:#f5f0e8;color:#1a1a1a;font-family:'Inter',sans-serif;line-height:1.6;min-height:100vh}

/* lang */
html[lang="en"] .lang-th{display:none!important}
html[lang="th"] .lang-en{display:none!important}

/* topbar */
.topbar{background:#1a1a1a;padding:0 32px;display:flex;align-items:center;justify-content:space-between;height:60px;position:sticky;top:0;z-index:100;border-bottom:1px solid #2a2a2a}
.topbar-right{display:flex;align-items:center;gap:20px}
.lang-toggle{display:flex;gap:4px}
.lang-btn{background:transparent;border:1px solid #B8962E;color:#B8962E;font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.1em;padding:4px 10px;border-radius:4px;cursor:pointer;transition:all 0.2s}
.lang-btn.active{background:#B8962E;color:#1a1a1a}
.topbar-exit{color:#f5f0e8;opacity:0.4;font-size:12px;text-decoration:none;letter-spacing:0.05em}
.topbar-exit:hover{opacity:0.8;color:#B8962E}

/* tab nav */
.tabnav{background:#1a1a1a;border-bottom:2px solid #2a2a2a;padding:0 32px;display:flex;gap:0;overflow-x:auto}
.tabnav::-webkit-scrollbar{height:3px}
.tabnav::-webkit-scrollbar-thumb{background:#B8962E33}
.tab-btn{background:none;border:none;color:#f5f0e8;opacity:0.45;font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;padding:14px 18px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:all 0.2s}
.tab-btn:hover{opacity:0.75}
.tab-btn.active{color:#B8962E;opacity:1;border-bottom-color:#B8962E}

/* container */
.container{max-width:1100px;margin:0 auto;padding:36px 28px 80px}

/* section label */
.sec-label{font-size:11px;letter-spacing:0.2em;color:#B8962E;font-family:'Inter',sans-serif;font-weight:600;text-transform:uppercase;margin-bottom:14px;padding-bottom:10px;border-top:1px solid #B8962E33;padding-top:10px}
.sec-label::before{content:'· '}
.sec-label::after{content:' ·'}

/* cards */
.card{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.06);transition:all 0.3s ease}
.card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,0.1)}
.card-cream{background:#f5f0e8;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:24px}

/* hero student card */
.hero-card{background:#1a1a1a;color:#f5f0e8;border-radius:10px;padding:32px;margin-bottom:36px;display:flex;gap:28px;align-items:flex-start}
.hero-avatar{width:72px;height:72px;border-radius:50%;background:#B8962E22;border:2px solid #B8962E66;display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0}
.hero-info h1{font-family:'Playfair Display',serif;font-size:1.9rem;font-weight:400;color:#f5f0e8;margin-bottom:4px}
.hero-info .meta{font-size:12px;color:#f5f0e8;opacity:0.45;margin-bottom:16px;letter-spacing:0.03em}
.hero-pills{display:flex;flex-wrap:wrap;gap:8px}
.pill{font-size:11px;padding:4px 12px;border-radius:20px;font-weight:500;letter-spacing:0.03em}
.pill-gold{background:#B8962E22;color:#B8962E;border:1px solid #B8962E44}
.pill-light{background:#f5f0e822;color:#f5f0e8;border:1px solid #f5f0e822}
.pill-green{background:#1a3a1a;color:#6dca6d;border:1px solid #2d5a2d}
.pill-yellow{background:#2a2200;color:#c9a830;border:1px solid #4a3a00}
.pill-red{background:#2a1010;color:#ca6d6d;border:1px solid #4a2020}

/* progress stage */
.stage-track{display:flex;gap:0;margin:20px 0 8px;position:relative}
.stage-track::before{content:'';position:absolute;top:10px;left:10px;right:10px;height:2px;background:#e0d9cd;z-index:0}
.stage-step{flex:1;text-align:center;position:relative;z-index:1}
.stage-dot{width:22px;height:22px;border-radius:50%;margin:0 auto 8px;border:2px solid #e0d9cd;background:#f5f0e8;transition:all 0.3s}
.stage-dot.done{background:#B8962E;border-color:#B8962E}
.stage-dot.current{background:#1a1a1a;border-color:#B8962E;box-shadow:0 0 0 3px #B8962E33}
.stage-label{font-size:10px;color:#999;letter-spacing:0.05em}
.stage-label.active{color:#1a1a1a;font-weight:600}
.progress-bar-bg{background:#e0d9cd;border-radius:4px;height:5px;overflow:hidden;margin-top:6px}
.progress-bar-fill{height:100%;background:linear-gradient(90deg,#B8962E,#d4aa3e);border-radius:4px}

/* stat cards */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;margin-bottom:32px}
.stat-card{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:20px;text-align:center}
.stat-num{font-family:'Playfair Display',serif;font-size:2.2rem;color:#B8962E;line-height:1}
.stat-label{font-size:11px;color:#999;margin-top:6px;letter-spacing:0.05em;text-transform:uppercase}

/* timeline */
.timeline{display:flex;flex-direction:column}
.ms-row{display:grid;grid-template-columns:90px 28px 1fr;gap:0 14px;align-items:start;padding:12px 0;border-bottom:1px solid #ece7df}
.ms-row:last-child{border-bottom:none}
.ms-date{font-size:11px;color:#aaa;text-align:right;padding-top:4px;line-height:1.4}
.ms-dot-col{display:flex;flex-direction:column;align-items:center}
.ms-dot{width:13px;height:13px;border-radius:50%;margin-top:3px;flex-shrink:0;border:2px solid}
.ms-line{width:1px;background:#ece7df;flex:1;min-height:18px;margin-top:4px}
.ms-row:last-child .ms-line{display:none}
.dot-done{background:#B8962E33;border-color:#B8962E}
.dot-upcoming{background:#f5f0e8;border-color:#1a1a1a}
.dot-overdue{background:#fdecea;border-color:#ca6d6d}
.dot-na{background:#f5f0e8;border-color:#ccc}
.ms-title{font-size:13.5px;color:#1a1a1a;font-weight:500;line-height:1.4}
.ms-type{font-size:11px;color:#aaa;margin-top:2px}
.ms-note{font-size:12px;color:#888;margin-top:4px;font-style:italic}
.ms-urgent{color:#ca6d6d!important;font-weight:600}
.ms-days{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;margin-left:8px}
.days-urgent{background:#fdecea;color:#ca6d6d}
.days-soon{background:#fff8e6;color:#c9a830}
.days-ok{background:#f0f7f0;color:#5a9a5a}

/* two-col grid */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}

/* doc cards */
.doc-card{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:16px;display:flex;gap:12px;align-items:flex-start}
.doc-icon{font-size:20px;flex-shrink:0;line-height:1}
.doc-name{font-size:13px;font-weight:500;color:#1a1a1a}
.doc-status{font-size:11px;margin-top:3px}
.doc-note{font-size:11px;color:#aaa;margin-top:4px}
.doc-grid{display:flex;flex-direction:column;gap:10px}

/* service cards */
.svc-card{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:20px 22px;border-left:4px solid}
.svc-card.active-svc{border-left-color:#B8962E}
.svc-card.rec-svc{border-left-color:#ccc}
.svc-card.paused-svc{border-left-color:#e0d9cd}
.svc-name{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:400;color:#1a1a1a;margin-bottom:4px}
.svc-detail{font-size:12px;color:#888}

/* school cards */
.school-card{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;overflow:hidden}
.school-header{background:#1a1a1a;padding:18px 20px;display:flex;align-items:center;justify-content:space-between}
.school-header h3{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:400;color:#f5f0e8}
.school-body{padding:20px}
.school-links{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}

/* academic chart */
.chart-wrap{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:24px;margin-bottom:20px}

/* tool cards */
.tool-card{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:18px;transition:all 0.2s;cursor:pointer}
.tool-card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,0.1);border-color:#B8962E44}
.tool-card a{text-decoration:none;color:inherit;display:block}
.tool-icon{font-size:24px;margin-bottom:10px}
.tool-name{font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:4px}
.tool-desc{font-size:11px;color:#aaa;line-height:1.5}
.tool-stage-label{font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#B8962E;margin-bottom:14px;margin-top:24px;padding-bottom:8px;border-bottom:1px solid #ece7df}

/* profile */
.profile-section{margin-bottom:24px}
.profile-label{font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#B8962E;margin-bottom:8px}
.profile-value{font-size:14px;color:#1a1a1a;padding:12px 16px;background:#f5f0e8;border-radius:6px;border:1px solid rgba(0,0,0,0.06)}
.resume-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}

/* buttons */
.btn-primary{display:inline-block;background:#B8962E;color:#1a1a1a;font-family:'Inter',sans-serif;font-weight:700;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;padding:12px 24px;border-radius:6px;border:none;cursor:pointer;text-decoration:none;transition:all 0.2s}
.btn-primary:hover{background:#d4aa3e}
.btn-secondary{display:inline-block;background:transparent;color:#B8962E;font-family:'Inter',sans-serif;font-weight:600;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;padding:11px 23px;border-radius:6px;border:1px solid #B8962E;cursor:pointer;text-decoration:none;transition:all 0.2s}
.btn-secondary:hover{background:#B8962E11}
.btn-sm{padding:8px 16px;font-size:11px}

/* LINE CTA */
.line-cta{background:#1a1a1a;border-radius:10px;padding:28px 32px;text-align:center;margin-top:32px}
.line-cta p{color:#f5f0e8;opacity:0.6;font-size:13px;margin-bottom:14px}
.line-cta .line-handle{font-family:'Playfair Display',serif;font-size:1.3rem;color:#B8962E;margin-bottom:16px}

/* upload form */
.upload-form{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:24px}
.form-group{margin-bottom:16px}
.form-label{font-size:12px;font-weight:600;color:#555;margin-bottom:6px;display:block}
.form-input{width:100%;background:#f5f0e8;border:1px solid rgba(0,0,0,0.1);border-radius:6px;padding:10px 14px;font-size:13px;font-family:'Inter',sans-serif;color:#1a1a1a;outline:none;transition:border-color 0.2s}
.form-input:focus{border-color:#B8962E}
.form-success{background:#f0f7f0;border:1px solid #5a9a5a33;border-radius:6px;padding:12px 16px;color:#3a6a3a;font-size:13px;margin-top:12px}
.form-error{background:#fdecea;border:1px solid #ca6d6d33;border-radius:6px;padding:12px 16px;color:#8a3030;font-size:13px;margin-top:12px}

/* alerts */
.next-action{background:#1a1a1a;border-radius:8px;padding:20px 24px;margin-bottom:28px;display:flex;align-items:center;gap:16px}
.next-action .icon{font-size:28px;flex-shrink:0}
.next-action .text{color:#f5f0e8}
.next-action .label{font-size:10px;letter-spacing:0.15em;color:#B8962E;text-transform:uppercase;margin-bottom:4px}
.next-action .title{font-family:'Playfair Display',serif;font-size:1.05rem;font-weight:400}
.next-action .date{font-size:12px;opacity:0.5;margin-top:3px}

/* responsive */
@media(max-width:700px){
  .topbar{padding:0 16px}.container{padding:20px 14px 60px}
  .tabnav{padding:0 12px}.tab-btn{padding:12px 12px;font-size:11px}
  .hero-card{flex-direction:column;gap:16px;padding:22px}
  .grid-2,.grid-3,.resume-grid{grid-template-columns:1fr}
  .stats-grid{grid-template-columns:1fr 1fr}
  .ms-row{grid-template-columns:72px 22px 1fr}
}

/* ── Recommendations tab ──────────────────────────────────────── */
.rec-anchor-nav{display:flex;gap:24px;margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid #e0d9cd;flex-wrap:wrap}
.rec-anchor-nav a{color:#B8962E;font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.rec-section{margin-bottom:56px}
.rec-section-header{background:#f5f0e8;border:1px solid rgba(0,0,0,0.07);border-radius:8px;padding:24px;margin-bottom:24px}
.rec-card{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:24px;margin-bottom:16px;border-left:4px solid}
.rec-card.critical{border-left-color:#ca6d6d}
.rec-card.active-gap{border-left-color:#c9a830}
.rec-card.maintained{border-left-color:#5a9a5a}
.rec-card.strong{border-left-color:#ccc}
.rec-card.gold-border{border-left-color:#B8962E}
.rec-card.cream-card{background:#f5f0e8;border-left-color:#ccc}
.rec-badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.1em;padding:3px 10px;border-radius:3px;text-transform:uppercase}
.badge-critical{background:#fdecea;color:#b03030}
.badge-active-gap{background:#fff8e6;color:#8a6000}
.badge-maintained{background:#f0f7f0;color:#2d6a2d}
.badge-strong{background:#f5f5f5;color:#888}
.badge-gold{background:#B8962E22;color:#8a6a00}
.rec-subject{font-family:'Playfair Display',serif;font-size:1.05rem;font-weight:400;color:#1a1a1a;margin-bottom:10px}
.rec-grade-row{display:flex;gap:24px;margin:12px 0;flex-wrap:wrap}
.rec-grade-label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#aaa;margin-bottom:2px}
.reasoning-block{background:#f5f0e8;border-left:2px solid #B8962E44;padding:12px 16px;margin-top:14px;font-size:12px;color:#777;line-height:1.7;font-style:italic}
.rec-text{font-size:13.5px;color:#444;line-height:1.8;margin:12px 0}
.ce-bar-wrap{position:relative;background:#e8e2d9;border-radius:4px;height:10px;margin:16px 0 8px}
.ce-bar-fill{height:100%;background:#B8962E;border-radius:4px}
.ce-marker{position:absolute;top:-4px;width:2px;height:18px;background:#1a1a1a}
.ce-marker-label{position:absolute;top:20px;font-size:9px;color:#555;white-space:nowrap;transform:translateX(-50%)}
.compare-row{display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f0ebe2;font-size:12px}
.sub-option{background:#f5f0e8;border-radius:6px;padding:14px 16px;margin:10px 0;border-left:2px solid #e0d9cd}
.sub-option-num{font-size:10px;font-weight:700;letter-spacing:0.1em;color:#B8962E;margin-bottom:4px;text-transform:uppercase}
.sub-option-title{font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:6px}
.sub-option-text{font-size:12px;color:#666;line-height:1.7}
.deadline-badge{display:inline-block;font-size:11px;font-weight:600;padding:4px 12px;border-radius:4px;margin:10px 0}
.deadline-urgent{background:#fdecea;color:#b03030}
.deadline-warning{background:#fff8e6;color:#8a6000}
.deadline-ok{background:#f0f7f0;color:#2d6a2d}
.timeline-plan{display:flex;flex-direction:column;gap:12px;margin-top:14px}
.plan-item{display:flex;gap:14px;align-items:flex-start}
.plan-period{font-size:11px;font-weight:600;color:#B8962E;width:160px;flex-shrink:0;padding-top:2px}
.plan-text{font-size:13px;color:#444;line-height:1.7;flex:1}
.guardian-strip{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:40px;padding-top:24px;border-top:1px solid #e0d9cd}
@media(max-width:700px){.guardian-strip{grid-template-columns:1fr}}
"""

# ── LOGIN PAGE ───────────────────────────────────────────────────────────────

def login_page(error=""):
    err = f'<p style="color:#ca6d6d;font-size:13px;margin-top:12px;text-align:center">{error}</p>' if error else ""
    return f"""<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LINKEDU — Parent Portal</title>
<style>
{SHARED_CSS}
body{{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1a1a1a}}
.login-box{{background:#f5f0e8;border-radius:12px;padding:48px 40px;width:100%;max-width:420px;text-align:center}}
.login-logo{{margin-bottom:6px}}
.login-tagline{{font-size:12px;color:#888;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:36px}}
.login-box h2{{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:400;color:#1a1a1a;margin-bottom:6px}}
.login-sub{{font-size:13px;color:#888;margin-bottom:28px;line-height:1.7}}
.token-input{{width:100%;background:#fff;border:1px solid rgba(0,0,0,0.15);border-radius:8px;color:#1a1a1a;font-size:22px;letter-spacing:0.3em;text-align:center;padding:14px;text-transform:uppercase;font-family:monospace;outline:none;margin-bottom:16px;transition:border-color 0.2s}}
.token-input:focus{{border-color:#B8962E}}
.login-help{{font-size:11px;color:#aaa;margin-top:28px;line-height:1.8}}
</style>
</head>
<body>
<div class="login-box">
  <div class="login-logo">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 141 21" style="height:24px;width:auto;margin:0 auto;display:block"><style>.st0{{fill:#1a1a1a;}}</style><path class="st0" d="M24.7,20h-5V0h5V20z M5,15.5h10.8V20H0V0h5V15.5z M44.7,20h5V0h-5v12.2L34.3,0h-5v20h5V7.8L44.7,20z M66.4,8.1 L75,20h-6.5l-5.6-8.3l-3.6,3.8V20h-5V0h5v8.8L67.3,0h6.3L66.4,8.1z M94.2,4.5V0H78.4v20h15.8v-4.5H83.4v-3.4h9V7.9h-9V4.5H94.2z M118.3,10c0,5.8-4.5,10-10.9,10h-9.1V0l9.1,0C114.2,0,118.3,4.2,118.3,10z M103.3,15.5h4.2c3.5,0,5.9-2.2,5.9-5.6 c0-3.6-2.3-5.5-5.9-5.5h-4.2V15.5z M130.9,20.4c5.8,0,10.1-4,10.1-10.6h0V0h-5v9.7c0,3.8-1.9,6.1-5,6.1c-3.2,0-4.9-2.3-4.9-6.1V0h-5 v9.7C121.1,16.4,125.1,20.4,130.9,20.4z"/></svg>
    <span style="display:block;font-size:8px;letter-spacing:0.3em;color:#B8962E;margin-top:5px;text-transform:uppercase">OVERSEAS EDUCATION</span>
  </div>
  <p class="login-tagline">Parent Portal</p>
  <h2 class="lang-en">Welcome</h2>
  <h2 class="lang-th">ยินดีต้อนรับ</h2>
  <p class="login-sub lang-en">Enter your 8-character portal token<br>to view your child's journey.</p>
  <p class="login-sub lang-th">กรอกรหัส 8 ตัวอักษรของคุณ<br>เพื่อดูความก้าวหน้าของบุตรหลาน</p>
  <form method="POST" action="/login">
    <input class="token-input" type="text" name="token" maxlength="8" placeholder="XXXXXXXX" autocomplete="off" spellcheck="false" autofocus>
    <button class="btn-primary" type="submit" style="width:100%;font-size:14px;padding:14px">
      <span class="lang-en">View Portal →</span>
      <span class="lang-th">เข้าสู่พอร์ทัล →</span>
    </button>
    {err}
  </form>
  <p class="login-help lang-en">Don't have a token? Contact us via LINE<br><strong style="color:#B8962E">@{LINE_HANDLE}</strong></p>
  <p class="login-help lang-th">ไม่มีรหัส? ติดต่อเราผ่าน LINE<br><strong style="color:#B8962E">@{LINE_HANDLE}</strong></p>
</div>
<script>
(function(){{var l=localStorage.getItem('linkedu-lang')||'th';document.documentElement.setAttribute('lang',l)}})();
</script>
</body></html>"""

# ── TAB: OVERVIEW ────────────────────────────────────────────────────────────

def tab_overview(s, milestones, docs, svcs):
    name       = prop(s, "Student Name")
    parent     = prop(s, "Parent Name")
    school     = prop(s, "Current School")
    yr_grp     = prop(s, "Current Year Group")
    stage      = prop(s, "Stage") or "1 - Discovery"
    status     = prop(s, "Status") or "🟢 On Track"
    goal       = prop(s, "Goal")
    sport      = prop(s, "Primary Sport")
    dest       = prop(s, "Destination") or []
    consultant = prop(s, "Assigned Consultant") or "Satit"
    budget     = prop(s, "Annual Budget GBP")
    target_yr  = prop(s, "Target Entry Year")
    target_grp = prop(s, "Target Entry Year Group")

    snum = stage_num(stage)
    stage_names     = ["Discovery","Profiling","Roadmap","Preparation","Transition"]
    stage_labels_th = ["ค้นหา","วิเคราะห์","วางแผน","เตรียมตัว","เดินทาง"]
    pct = int(snum / 5 * 100)

    sc         = "pill-green" if "On Track" in status else ("pill-yellow" if "Needs Action" in status else "pill-red")
    dest_pills = "".join(f'<span class="pill pill-light">{d}</span>' for d in (dest if isinstance(dest, list) else [dest]))
    budget_str = f"£{budget:,} / year" if budget else "—"

    dots_html = ""
    for i, (en, th) in enumerate(zip(stage_names, stage_labels_th)):
        cls = "done" if i < snum else ("current" if i == snum-1 else "")
        dots_html += f'<div class="stage-step"><div class="stage-dot {cls}"></div><div class="stage-label {"active" if i==snum-1 else ""}"><span class="lang-en">{en}</span><span class="lang-th">{th}</span></div></div>'

    # ── Zone 1: Right Now ─────────────────────────────────────────────────────
    # Collect all upcoming school events + milestones, pick the single most urgent
    all_urgent = []
    for sc2 in SHORTLISTED_SCHOOLS:
        for ev in sc2.get("events", []):
            d = _days_until(ev["date"])
            if d >= 0:
                all_urgent.append({
                    "days": d, "label": ev["label"], "date": ev["date"],
                    "school": sc2["name"], "owner": ev["owner"],
                    "type": ev["type"], "tab": "schools"
                })
    for m in milestones:
        if "Complete" in prop(m,"Status"): continue
        d = days_away(prop(m,"Date"))
        if d is not None and d >= 0:
            all_urgent.append({
                "days": d, "label": prop(m,"Milestone Title"), "date": prop(m,"Date"),
                "school": None, "owner": "Both", "type": "deadline", "tab": "journey"
            })
    all_urgent.sort(key=lambda x: x["days"])
    top = all_urgent[0] if all_urgent else None

    if top:
        urg_col  = "#ca6d6d" if top["days"] < 30 else ("#c9a830" if top["days"] < 60 else "#5a9a5a")
        urg_txt  = "This month" if top["days"] < 30 else (f"{top['days']} days away" if top["days"] < 60 else f"{top['days']} days away")
        own_col  = _OWN_COL.get(top["owner"],"#555")
        own_bg   = _OWN_BG.get(top["owner"],"#eee")
        ev_icon  = _EV_ICON.get(top["type"],"📌")
        school_line = f'<div style="font-size:11px;color:#888;margin-bottom:6px;letter-spacing:.05em">{top["school"].upper() if top["school"] else "MILESTONE"}</div>' if top.get("school") else ""
        owner_note = {"Parent":"This requires your action.","Satit":"Satit is handling this — no action needed from you yet.","Both":"This requires action from both you and Satit."}
        right_now_html = f"""<div class="ov-rightnow">
  <div class="ov-rn-left">
    <div class="ov-rn-eyebrow">Most Urgent Right Now</div>
    {school_line}
    <div class="ov-rn-title">{ev_icon} {top["label"]}</div>
    <div class="ov-rn-owner">{owner_note.get(top["owner"],"")}</div>
  </div>
  <div class="ov-rn-right">
    <div class="ov-rn-days" style="color:{urg_col}">{top["days"]}</div>
    <div class="ov-rn-days-lbl">days away</div>
    <div class="ov-rn-date">{_fmt_event_date(top["date"])}</div>
    <span class="ov-rn-owner-badge" style="color:{own_col};background:{own_bg}">{top["owner"]}</span>
  </div>
</div>"""
    else:
        right_now_html = ""

    # ── Zone 2: Status Board ──────────────────────────────────────────────────
    # Schools card
    shortlisted = [sc2 for sc2 in SHORTLISTED_SCHOOLS if sc2["status"] == "Shortlisted"]
    next_school_ev = sorted(
        [ev for sc2 in SHORTLISTED_SCHOOLS for ev in sc2.get("events",[]) if _days_until(ev["date"]) >= 0],
        key=lambda e: _days_until(e["date"])
    )
    nse = next_school_ev[0] if next_school_ev else None
    school_next = f'Next: {nse["label"][:30]}… in {_days_until(nse["date"])}d' if nse else "No upcoming events"
    schools_card = f"""<div class="ov-sb-card" onclick="showTab('schools')" style="cursor:pointer">
  <div class="ov-sb-icon">🏫</div>
  <div class="ov-sb-label">Schools</div>
  <div class="ov-sb-value">{len(shortlisted)} shortlisted</div>
  <div class="ov-sb-sub">{school_next}</div>
  <div class="ov-sb-link">View tracker →</div>
</div>"""

    # UKISET card — hardcoded from profile (not taken, overdue)
    ukiset_card = f"""<div class="ov-sb-card ov-sb-alert" onclick="showTab('profile')" style="cursor:pointer">
  <div class="ov-sb-icon">📝</div>
  <div class="ov-sb-label">UKISET</div>
  <div class="ov-sb-value" style="color:#ca6d6d">Not taken</div>
  <div class="ov-sb-sub" style="color:#ca6d6d">Overdue — book now</div>
  <div class="ov-sb-link">See profile →</div>
</div>"""

    # Summer Camp card — from Bromsgrove events
    camp_ev = next((ev for sc2 in SHORTLISTED_SCHOOLS if sc2["slug"]=="bromsgrove-school"
                    for ev in sc2.get("events",[]) if "summer school" in ev["label"].lower() and "closes" in ev["label"].lower()), None)
    if camp_ev:
        camp_days = _days_until(camp_ev["date"])
        camp_col  = "#ca6d6d" if camp_days < 30 else ("#c9a830" if camp_days < 60 else "#5a9a5a")
        camp_val  = f'{camp_days} days left'
        camp_sub  = f'Apply by {_fmt_event_date(camp_ev["date"])}'
    else:
        camp_col, camp_val, camp_sub = "#c9a830", "Apply soon", "Bromsgrove Summer School"
    camp_card = f"""<div class="ov-sb-card" onclick="showTab('recommendations')" style="cursor:pointer">
  <div class="ov-sb-icon">⛺</div>
  <div class="ov-sb-label">Summer Camp</div>
  <div class="ov-sb-value" style="color:{camp_col}">{camp_val}</div>
  <div class="ov-sb-sub">{camp_sub}</div>
  <div class="ov-sb-link">View camps →</div>
</div>"""

    # Tutoring card
    tutor_svc = next((sv for sv in svcs if "Tutor" in (prop(sv,"Service Type") or "") and prop(sv,"Status") == "Active"), None)
    if tutor_svc:
        t_subj = prop(tutor_svc,"Service Type") or "Tutoring"
        t_sess = prop(tutor_svc,"Sessions Per Week") or 2
        tutor_val = "Active"
        tutor_sub = f'{t_subj} · {t_sess}× per week'
        tutor_col = "#5a9a5a"
    else:
        tutor_val = "Not started"
        tutor_sub = "Science gap — recommend 2× weekly"
        tutor_col = "#c9a830"
    tutor_card = f"""<div class="ov-sb-card" onclick="showTab('recommendations')" style="cursor:pointer">
  <div class="ov-sb-icon">📚</div>
  <div class="ov-sb-label">Tutoring</div>
  <div class="ov-sb-value" style="color:{tutor_col}">{tutor_val}</div>
  <div class="ov-sb-sub">{tutor_sub}</div>
  <div class="ov-sb-link">View plan →</div>
</div>"""

    status_board = f"""<div class="ov-status-board">
  {schools_card}{ukiset_card}{camp_card}{tutor_card}
</div>"""

    # ── Zone 3: What's Next (combined top 3) ─────────────────────────────────
    whats_next = all_urgent[:3]
    wn_rows = ""
    for item in whats_next:
        urg_col2 = "#ca6d6d" if item["days"] < 30 else ("#c9a830" if item["days"] < 60 else "#5a9a5a")
        ev_icon2 = _EV_ICON.get(item["type"],"📌")
        src = item["school"].split()[0].upper() if item.get("school") else "MILESTONE"
        wn_rows += f"""<div class="ov-wn-row" onclick="showTab('{item['tab']}')" style="cursor:pointer">
  <span class="ov-wn-icon">{ev_icon2}</span>
  <div class="ov-wn-body">
    <div class="ov-wn-lbl">{item["label"]}</div>
    <div class="ov-wn-src">{src} · {_fmt_event_date(item["date"])}</div>
  </div>
  <div class="ov-wn-days" style="color:{urg_col2}">{item["days"]}d</div>
</div>"""

    # ── Journey stage progress ─────────────────────────────────────────────────
    done_ms  = sum(1 for m in milestones if "Complete" in prop(m,"Status"))
    total_ms = len(milestones)
    done_docs = sum(1 for d in docs if "Verified" in prop(d,"Status") or "Uploaded" in prop(d,"Status"))

    return f"""
<style>
/* ── Overview v2 ─────────────────────────────────────────── */
.ov-rightnow {{ background:#1a1a1a; border-radius:10px; padding:26px 30px;
  margin-bottom:24px; display:flex; justify-content:space-between;
  align-items:center; gap:24px; flex-wrap:wrap; }}
.ov-rn-eyebrow {{ font-size:10px; font-weight:700; letter-spacing:.16em;
  text-transform:uppercase; color:#B8962E; margin-bottom:10px; }}
.ov-rn-title {{ font-family:'Playfair Display',serif; font-size:1.25rem;
  color:#f5f0e8; margin-bottom:10px; line-height:1.35; }}
.ov-rn-owner {{ font-size:12.5px; color:#f5f0e8; opacity:.6; line-height:1.6; max-width:420px; }}
.ov-rn-right {{ text-align:center; flex-shrink:0; }}
.ov-rn-days {{ font-family:'Playfair Display',serif; font-size:3rem; font-weight:400;
  line-height:1; }}
.ov-rn-days-lbl {{ font-size:11px; color:#888; letter-spacing:.08em; text-transform:uppercase; margin-top:2px; }}
.ov-rn-date {{ font-size:12px; color:#888; margin:6px 0 8px; }}
.ov-rn-owner-badge {{ font-size:10px; font-weight:700; padding:3px 10px;
  border-radius:3px; letter-spacing:.06em; }}
/* Status board */
.ov-status-board {{ display:grid; grid-template-columns:repeat(4,1fr);
  gap:14px; margin-bottom:28px; }}
.ov-sb-card {{ background:#fff; border:1px solid #e8e2d8; border-radius:10px;
  padding:18px 20px; transition:box-shadow .2s; }}
.ov-sb-card:hover {{ box-shadow:0 4px 16px rgba(0,0,0,.08); }}
.ov-sb-alert {{ border-left:3px solid #ca6d6d; }}
.ov-sb-icon {{ font-size:22px; margin-bottom:8px; }}
.ov-sb-label {{ font-size:10px; font-weight:700; letter-spacing:.12em;
  text-transform:uppercase; color:#aaa; margin-bottom:6px; }}
.ov-sb-value {{ font-family:'Playfair Display',serif; font-size:1.1rem;
  color:#1a1a1a; margin-bottom:4px; }}
.ov-sb-sub {{ font-size:11.5px; color:#888; line-height:1.5; margin-bottom:10px; }}
.ov-sb-link {{ font-size:11px; color:#B8962E; font-weight:600; letter-spacing:.04em; }}
/* What's next */
.ov-wn-card {{ background:#fff; border:1px solid #e8e2d8; border-radius:10px;
  overflow:hidden; margin-bottom:28px; }}
.ov-wn-hdr {{ font-size:10px; font-weight:700; letter-spacing:.14em;
  text-transform:uppercase; color:#B8962E; padding:14px 20px;
  border-bottom:1px solid #f0ebe2; }}
.ov-wn-row {{ display:flex; align-items:center; gap:14px; padding:13px 20px;
  border-bottom:1px solid #f8f5f0; transition:background .15s; }}
.ov-wn-row:last-child {{ border-bottom:none; }}
.ov-wn-row:hover {{ background:#faf8f5; }}
.ov-wn-icon {{ font-size:16px; width:24px; text-align:center; flex-shrink:0; }}
.ov-wn-body {{ flex:1; }}
.ov-wn-lbl {{ font-size:13px; color:#1a1a1a; margin-bottom:2px; }}
.ov-wn-src {{ font-size:11px; color:#aaa; letter-spacing:.04em; }}
.ov-wn-days {{ font-size:13px; font-weight:700; min-width:30px; text-align:right; }}
@media(max-width:768px) {{
  .ov-status-board {{ grid-template-columns:1fr 1fr; }}
  .ov-rightnow {{ flex-direction:column; }}
  .ov-rn-right {{ display:flex; gap:16px; align-items:center; }}
}}
</style>

<div class="hero-card">
  <div class="hero-avatar">🎓</div>
  <div class="hero-info" style="flex:1">
    <h1>{name}</h1>
    <div class="meta">
      <span class="lang-en">Parent: {parent} · Consultant: {consultant} · {school}, {yr_grp}</span>
      <span class="lang-th">ผู้ปกครอง: {parent} · ที่ปรึกษา: {consultant} · {school}, {yr_grp}</span>
    </div>
    <div class="hero-pills">
      <span class="pill {sc}">{status}</span>
      <span class="pill pill-gold">🎯 {goal}</span>
      {"<span class='pill pill-gold'>⛳ " + sport + "</span>" if sport and sport != "None" else ""}
      <span class="pill pill-light">🎓 {target_grp} entry {target_yr}</span>
      {dest_pills}
      {"<span class='pill pill-light'>💷 " + budget_str + "</span>" if budget else ""}
    </div>
  </div>
</div>

<p class="sec-label lang-en" style="margin-top:28px">Right Now</p>
{right_now_html}

<p class="sec-label lang-en">Status Board</p>
{status_board}

<div class="ov-wn-card">
  <div class="ov-wn-hdr">What's Next — Top 3 Across All Areas</div>
  {wn_rows}
</div>

<p class="sec-label lang-en">Journey Progress</p>
<div class="card-cream" style="margin-bottom:20px">
  <div class="stage-track">{dots_html}</div>
  <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:{pct}%"></div></div>
  <div style="display:flex;justify-content:space-between;margin-top:14px;flex-wrap:wrap;gap:8px">
    <span style="font-size:12px;color:#888">Stage {snum} of 5 — {stage_names[snum-1]}</span>
    <span style="font-size:12px;color:#888">{done_ms}/{total_ms} milestones · {done_docs}/{len(docs)} documents ready</span>
  </div>
</div>

<div class="line-cta">
  <p class="lang-en">Questions about {name}'s journey?</p>
  <p class="lang-th">มีคำถามเกี่ยวกับเส้นทางของน้อง?</p>
  <div class="line-handle">LINE: @{LINE_HANDLE}</div>
  <a href="https://line.me/R/ti/p/@{LINE_HANDLE}" target="_blank" class="btn-primary">
    <span class="lang-en">Message Satit on LINE</span>
    <span class="lang-th">ส่งข้อความผ่าน LINE</span>
  </a>
</div>"""

# ── TAB: JOURNEY ─────────────────────────────────────────────────────────────

STAGE_TOOLS = {
    1: [
        ("🧠","Personality Match","/tools/personality-match.html","Find the right school culture"),
        ("🏫","School Match Quiz","/tools/school-match-quiz.html","Get matched to schools"),
        ("🌍","UK vs Thailand","/tools/uk-vs-thailand.html","Compare education systems"),
        ("😌","Culture Shock Quiz","/tools/culture-shock-readiness-quiz.html","Readiness check"),
        ("🎭","Culture Fit Assessor","/tools/boarding-school-culture-fit-assessor.html","School culture match"),
    ],
    2: [
        ("📝","English Assessment","/tools/english-assessment.html","Gauge English level"),
        ("🧩","Learning Style","/tools/tutoring/tutoring-learning-style.html","How your child learns best"),
        ("⭐","Gifted Checker","/tools/tutoring/tutoring-gifted-checker.html","Identify strengths"),
        ("📊","UKISET Tracker","/tools/ukiset-prep-tracker.html","Track UKISET preparation"),
        ("🗺","Curriculum Gap Map","/tools/tutoring/tutoring-curriculum-gap-map.html","Identify knowledge gaps"),
    ],
    3: [
        ("💷","Fees Calculator","/tools/fees-calculator-v2c.html","Estimate full costs"),
        ("🏙","Cost of Living","/tools/cost-of-living-calc.html","UK living costs"),
        ("🎓","Bursary Finder","/tools/bursary-finder.html","Find financial support"),
        ("📋","Scholarship Checklist","/tools/scholarship-checklist.html","Scholarship readiness"),
        ("⛳","Sports Pathway","/tools/sports-pathway.html","Sport scholarship pathway"),
        ("🏆","Sports Scholarship Finder","/tools/sports-scholarship-finder.html","Find sport scholarships"),
    ],
    4: [
        ("📅","Application Timeline","/tools/application-timeline.html","Plan your applications"),
        ("🎤","Interview Prep Guide","/tools/interview-prep-guide.html","Ace the interview"),
        ("📝","Interview Scorer","/tools/tutoring/tutoring-interview-scorer.html","Score mock interviews"),
        ("📚","Subject Weakness","/tools/tutoring/tutoring-subject-weakness.html","Fix weak subjects"),
        ("⏱","Tutoring Hours Calc","/tools/tutoring/tutoring-hours-calculator.html","How much tutoring?"),
        ("🏛","Oxbridge Profile","/tools/tutoring/tutoring-oxbridge-profile.html","Build Oxbridge profile"),
    ],
    5: [
        ("🧳","Packing Guide","/tools/packing-guide.html","What to pack for UK"),
        ("✈️","Visa Pathway","/tools/post-study-visa-pathway.html","Post-study visa options"),
        ("☀️","Summer Planner","/tools/tutoring/tutoring-summer-planner.html","Plan the summer before"),
        ("💼","Career Path Quiz","/tools/tutoring/tutoring-career-path-quiz.html","Future career planning"),
    ],
}

def tab_journey(s, milestones):
    snum = stage_num(prop(s, "Stage") or "1")
    stage_names = ["Discovery","Profiling","Roadmap","Preparation","Transition"]
    stage_names_th = ["ค้นหาโรงเรียน","วิเคราะห์นักเรียน","วางแผนเส้นทาง","เตรียมสมัคร","เตรียมเดินทาง"]

    # full milestone list
    completed = [m for m in milestones if "Complete" in prop(m,"Status")]
    upcoming  = [m for m in milestones if "Complete" not in prop(m,"Status")]
    overdue   = [m for m in upcoming if prop(m,"Date") and days_away(prop(m,"Date")) is not None and days_away(prop(m,"Date")) < 0]

    all_ms = milestones  # already sorted by date asc
    ms_html = ""
    for m in all_ms:
        t     = prop(m,"Milestone Title")
        mtype = prop(m,"Milestone Type")
        mdate = prop(m,"Date")
        mstat = prop(m,"Status")
        mnote = prop(m,"Notes")
        pri   = prop(m,"Priority")
        daway = days_away(mdate)
        if "Complete" in mstat:
            dot_cls = "dot-done"
        elif daway is not None and daway < 0:
            dot_cls = "dot-overdue"
        elif "Upcoming" in mstat:
            dot_cls = "dot-upcoming"
        else:
            dot_cls = "dot-na"
        days_tag = ""
        if daway is not None and "Complete" not in mstat:
            if daway < 0: days_tag = f'<span class="ms-days days-urgent">{abs(daway)}d overdue</span>'
            elif daway <= 30: days_tag = f'<span class="ms-days days-urgent">{daway}d</span>'
            elif daway <= 90: days_tag = f'<span class="ms-days days-soon">{daway}d</span>'
        # Detect which school this milestone belongs to
        school_chip = ""
        for sc in SHORTLISTED_SCHOOLS:
            if sc["name"].split()[0].lower() in t.lower():
                chip_col = {"Primary Target":"#B8962E","Sports Alternative":"#5a9a5a","Supporting Option":"#5a7aba","Stretch Option":"#ca8dca"}.get(sc["role"],"#888")
                school_chip = f'<span style="font-size:10px;font-weight:700;color:{chip_col};background:rgba(0,0,0,.05);padding:2px 7px;border-radius:3px;margin-left:6px;letter-spacing:.05em">{sc["name"].split()[0].upper()}</span>'
                break
        ms_html += f"""<div class="ms-row">
          <div class="ms-date">{fmt_date(mdate)}</div>
          <div class="ms-dot-col"><div class="ms-dot {dot_cls}"></div><div class="ms-line"></div></div>
          <div>
            <div class="ms-title">{t}{days_tag}{school_chip}</div>
            <div class="ms-type">{mtype} · {mstat} · <span style="color:{"#ca6d6d" if pri=="High" else "#aaa"}">{pri} Priority</span></div>
            {"<div class='ms-note'>" + mnote[:150] + ("…" if len(mnote)>150 else "") + "</div>" if mnote else ""}
          </div>
        </div>"""

    # tools for current stage
    tools = STAGE_TOOLS.get(snum, [])
    tools_html = "".join(f"""<div class="tool-card">
      <a href="{WEBSITE_URL}{url}" target="_blank">
        <div class="tool-icon">{icon}</div>
        <div class="tool-name">{name}</div>
        <div class="tool-desc">{desc}</div>
      </a>
    </div>""" for icon, name, url, desc in tools)

    return f"""
<div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
  <div class="card" style="flex:1;min-width:140px;text-align:center">
    <div class="stat-num" style="font-size:1.8rem">{len(completed)}</div>
    <div class="stat-label lang-en">Milestones Complete</div>
    <div class="stat-label lang-th">เสร็จแล้ว</div>
  </div>
  <div class="card" style="flex:1;min-width:140px;text-align:center">
    <div class="stat-num" style="font-size:1.8rem">{len(upcoming)}</div>
    <div class="stat-label lang-en">Upcoming</div>
    <div class="stat-label lang-th">กำลังจะมา</div>
  </div>
  <div class="card" style="flex:1;min-width:140px;text-align:center">
    <div class="stat-num" style="font-size:1.8rem;color:{"#ca6d6d" if overdue else "#B8962E"}">{len(overdue)}</div>
    <div class="stat-label lang-en">Overdue</div>
    <div class="stat-label lang-th">เกินกำหนด</div>
  </div>
</div>

<p class="sec-label lang-en">Full Timeline</p>
<p class="sec-label lang-th">ไทม์ไลน์ทั้งหมด</p>
<div class="card" style="padding:8px 0 0">
  <div class="timeline" style="padding:0 20px 12px">{ms_html}</div>
</div>

<p class="sec-label lang-en" style="margin-top:36px">Recommended Tools — Stage {snum}: {stage_names[snum-1]}</p>
<p class="sec-label lang-th" style="margin-top:36px">เครื่องมือแนะนำ — ขั้น {snum}: {stage_names_th[snum-1]}</p>
<div class="grid-3">{tools_html}</div>"""

# ── TAB: SCHOOLS ─────────────────────────────────────────────────────────────

# Application data for each shortlisted school
SHORTLISTED_SCHOOLS = [
    {
        "name":    "Bromsgrove School",
        "slug":    "bromsgrove-school",
        "loc":     "Worcestershire, Midlands",
        "type":    "Co-educational · Full Boarding",
        "fee":     43620,
        "entry":   "Year 9 · September 2027",
        "role":    "Primary Target",
        "role_cls":"sa-role-primary",
        "status":  "Shortlisted",
        "status_cls":"sa-status-shortlisted",
        "golf":    True,
        "golf_note": "Golf scholarship pathway active — handicap target 7 by Jan 2027",
        "pipeline": [
            ("Research",      "done",     None),
            ("Shortlisted",   "done",     None),
            ("Register",      "upcoming", "Sept 2026"),
            ("Apply",         "upcoming", "Nov 2026"),
            ("Interview",     "upcoming", "Jan 2027"),
            ("Decision",      "upcoming", "Mar 2027"),
        ],
        "docs": [
            ("School report (2 yrs)", "done"),
            ("Passport copy",         "done"),
            ("Consultant reference",  "pending"),
            ("UKISET results",        "missing"),
            ("Golf HIO evidence",     "pending"),
        ],
        "note": "Confirmed primary target. Summer School attendance July 2026 is strongly recommended — it provides visibility to admissions staff before the formal application.",
        "events": [
            {"type":"deadline", "label":"Summer School application opens",  "date":"2026-04-01", "owner":"Satit"},
            {"type":"deadline", "label":"Summer School application closes",  "date":"2026-05-15", "owner":"Parent"},
            {"type":"exam",     "label":"Sit UKISET (book now)",            "date":"2026-06-15", "owner":"Parent"},
            {"type":"openday",  "label":"Bromsgrove Open Morning",          "date":"2026-06-27", "owner":"Both"},
            {"type":"deadline", "label":"Registration opens",               "date":"2026-09-01", "owner":"Satit"},
            {"type":"deadline", "label":"Application submission deadline",   "date":"2026-11-15", "owner":"Both"},
            {"type":"exam",     "label":"Common Entrance mock (internal)",   "date":"2026-11-01", "owner":"Parent"},
            {"type":"interview","label":"Admissions interview",             "date":"2027-01-20", "owner":"Both"},
            {"type":"email",    "label":"Decision notification expected",    "date":"2027-03-01", "owner":"Satit"},
        ],
    },
    {
        "name":    "Millfield School",
        "slug":    "millfield-school",
        "loc":     "Somerset, South West",
        "type":    "Co-educational · Full Boarding",
        "fee":     44370,
        "entry":   "Year 9 · September 2027",
        "role":    "Sports Alternative",
        "role_cls":"sa-role-alt",
        "status":  "Shortlisted",
        "status_cls":"sa-status-shortlisted",
        "golf":    True,
        "golf_note": "One of the UK's leading sports scholarship schools — golf scholarship programme is highly competitive",
        "pipeline": [
            ("Research",      "done",     None),
            ("Shortlisted",   "done",     None),
            ("Register",      "upcoming", "Oct 2026"),
            ("Apply",         "upcoming", "Nov 2026"),
            ("Interview",     "upcoming", "Feb 2027"),
            ("Decision",      "upcoming", "Mar 2027"),
        ],
        "docs": [
            ("School report (2 yrs)", "done"),
            ("Passport copy",         "done"),
            ("Consultant reference",  "pending"),
            ("UKISET results",        "missing"),
            ("Golf portfolio",        "missing"),
        ],
        "note": "Strong backup if Bromsgrove golf scholarship requires a lower handicap than achieved. Millfield's sports specialism makes it an exceptional environment for a competitive junior golfer.",
        "events": [
            {"type":"email",    "label":"Golf scholarship enquiry (send letter)", "date":"2026-04-15", "owner":"Satit"},
            {"type":"exam",     "label":"Sit UKISET (book now)",                  "date":"2026-06-15", "owner":"Parent"},
            {"type":"deadline", "label":"Golf portfolio submission",              "date":"2026-10-01", "owner":"Both"},
            {"type":"deadline", "label":"Registration deadline",                  "date":"2026-10-15", "owner":"Satit"},
            {"type":"deadline", "label":"Application deadline",                   "date":"2026-11-30", "owner":"Both"},
            {"type":"interview","label":"Sports scholarship interview",            "date":"2027-02-01", "owner":"Both"},
            {"type":"email",    "label":"Decision notification expected",          "date":"2027-03-15", "owner":"Satit"},
        ],
    },
    {
        "name":    "Cheltenham College",
        "slug":    "cheltenham-college",
        "loc":     "Gloucestershire, South West",
        "type":    "Co-educational · Full Boarding",
        "fee":     43200,
        "entry":   "Year 9 · September 2027",
        "role":    "Supporting Option",
        "role_cls":"sa-role-support",
        "status":  "Researching",
        "status_cls":"sa-status-research",
        "golf":    False,
        "golf_note": None,
        "pipeline": [
            ("Research",      "active",   None),
            ("Shortlisted",   "upcoming", None),
            ("Register",      "upcoming", "Oct 2026"),
            ("Apply",         "upcoming", "Dec 2026"),
            ("Interview",     "upcoming", "Feb 2027"),
            ("Decision",      "upcoming", "Apr 2027"),
        ],
        "docs": [
            ("School report (2 yrs)", "done"),
            ("Passport copy",         "done"),
            ("Consultant reference",  "pending"),
            ("UKISET results",        "missing"),
        ],
        "note": "Co-educational school with strong academic reputation and excellent pastoral care. Within budget. Good fit for a student with humanities and arts strengths.",
        "events": [
            {"type":"openday",  "label":"Open Day — visit recommended",     "date":"2026-09-19", "owner":"Both"},
            {"type":"deadline", "label":"Registration deadline",             "date":"2026-10-01", "owner":"Satit"},
            {"type":"deadline", "label":"Application deadline",              "date":"2026-12-01", "owner":"Both"},
            {"type":"interview","label":"Admissions interview",              "date":"2027-02-15", "owner":"Both"},
            {"type":"email",    "label":"Decision notification expected",    "date":"2027-04-01", "owner":"Satit"},
        ],
    },
    {
        "name":    "Repton School",
        "slug":    "repton-school",
        "loc":     "Derbyshire, Midlands",
        "type":    "Co-educational · Full Boarding",
        "fee":     42720,
        "entry":   "Year 9 · September 2027",
        "role":    "Supporting Option",
        "role_cls":"sa-role-support",
        "status":  "Researching",
        "status_cls":"sa-status-research",
        "golf":    False,
        "golf_note": None,
        "pipeline": [
            ("Research",      "active",   None),
            ("Shortlisted",   "upcoming", None),
            ("Register",      "upcoming", "Oct 2026"),
            ("Apply",         "upcoming", "Dec 2026"),
            ("Interview",     "upcoming", "Feb 2027"),
            ("Decision",      "upcoming", "Apr 2027"),
        ],
        "docs": [
            ("School report (2 yrs)", "done"),
            ("Passport copy",         "done"),
            ("Consultant reference",  "pending"),
            ("UKISET results",        "missing"),
        ],
        "note": "One of England's oldest boarding schools. Strong sports culture and excellent house system. Lower academic threshold than Bromsgrove — makes it a solid safety option.",
        "events": [
            {"type":"openday",  "label":"Open Day — visit recommended",     "date":"2026-09-26", "owner":"Both"},
            {"type":"deadline", "label":"Registration deadline",             "date":"2026-10-15", "owner":"Satit"},
            {"type":"deadline", "label":"Application deadline",              "date":"2026-12-15", "owner":"Both"},
            {"type":"interview","label":"Admissions interview",              "date":"2027-02-15", "owner":"Both"},
            {"type":"email",    "label":"Decision notification expected",    "date":"2027-04-01", "owner":"Satit"},
        ],
    },
    {
        "name":    "Oundle School",
        "slug":    "oundle-school",
        "loc":     "Northamptonshire, Midlands",
        "type":    "Co-educational · Full Boarding",
        "fee":     44490,
        "entry":   "Year 9 · September 2027",
        "role":    "Stretch Option",
        "role_cls":"sa-role-stretch",
        "status":  "Researching",
        "status_cls":"sa-status-research",
        "golf":    False,
        "golf_note": None,
        "pipeline": [
            ("Research",      "active",   None),
            ("Shortlisted",   "upcoming", None),
            ("Register",      "upcoming", "Sept 2026"),
            ("Apply",         "upcoming", "Nov 2026"),
            ("Interview",     "upcoming", "Jan 2027"),
            ("Decision",      "upcoming", "Mar 2027"),
        ],
        "docs": [
            ("School report (2 yrs)", "done"),
            ("Passport copy",         "done"),
            ("Consultant reference",  "pending"),
            ("UKISET results",        "missing"),
        ],
        "note": "Academically selective — slightly above Ping's current CE trajectory. Included as a stretch school. Worth pursuing if UKISET scores come in strong and the Science gap closes by September 2026.",
        "events": [
            {"type":"openday",  "label":"Open Day — visit recommended",     "date":"2026-10-03", "owner":"Both"},
            {"type":"deadline", "label":"Registration deadline",             "date":"2026-09-15", "owner":"Satit"},
            {"type":"deadline", "label":"Application deadline",              "date":"2026-11-01", "owner":"Both"},
            {"type":"interview","label":"Admissions interview",              "date":"2027-01-20", "owner":"Both"},
            {"type":"email",    "label":"Decision notification expected",    "date":"2027-03-01", "owner":"Satit"},
        ],
    },
]

def _school_pipeline_html(pipeline):
    stages_html = ""
    for label, state, date in pipeline:
        if state == "done":
            dot = '<div class="sa-pip-dot sa-pip-done"></div>'
            lbl_cls = "sa-pip-lbl-done"
        elif state == "active":
            dot = '<div class="sa-pip-dot sa-pip-active"></div>'
            lbl_cls = "sa-pip-lbl-active"
        else:
            dot = '<div class="sa-pip-dot sa-pip-upcoming"></div>'
            lbl_cls = ""
        date_html = f'<div class="sa-pip-date">{date}</div>' if date else '<div class="sa-pip-date">&nbsp;</div>'
        stages_html += f'<div class="sa-pip-step"><div class="sa-pip-top">{dot}<div class="sa-pip-line"></div></div><div class="sa-pip-lbl {lbl_cls}">{label}</div>{date_html}</div>'
    return f'<div class="sa-pipeline">{stages_html}</div>'

def _doc_status_html(docs):
    rows = ""
    for label, state in docs:
        if state == "done":
            icon, col = "✓", "#5a9a5a"
        elif state == "pending":
            icon, col = "◎", "#c9a830"
        else:
            icon, col = "✗", "#ca6d6d"
        rows += f'<div class="sa-doc-row"><span style="color:{col};font-weight:700;font-size:13px;min-width:16px">{icon}</span><span class="sa-doc-lbl">{label}</span></div>'
    return rows

_EV_ICON  = {"deadline":"📅","exam":"📝","email":"📧","openday":"🏫","interview":"🎤"}
_EV_LABEL = {"deadline":"Deadline","exam":"Exam","email":"Update","openday":"Open Day","interview":"Interview"}
_OWN_COL  = {"Parent":"#8a6000","Satit":"#2d4a7a","Both":"#555"}
_OWN_BG   = {"Parent":"#fff8e6","Satit":"#e8f0fc","Both":"#f0f0f0"}

def _days_until(date_str):
    from datetime import date
    try:
        d = date.fromisoformat(date_str)
        return (d - date.today()).days
    except:
        return 9999

def _fmt_event_date(date_str):
    from datetime import date
    try:
        d = date.fromisoformat(date_str)
        return d.strftime("%-d %b %Y")
    except:
        return date_str

def _urgency_class(days):
    if days < 0:   return "sa-urg-overdue"
    if days < 30:  return "sa-urg-red"
    if days < 60:  return "sa-urg-amber"
    if days < 90:  return "sa-urg-green"
    return "sa-urg-grey"

def _urgency_strip_html():
    from datetime import date
    all_events = []
    for sc in SHORTLISTED_SCHOOLS:
        for ev in sc.get("events", []):
            days = _days_until(ev["date"])
            if days >= 0:
                all_events.append({**ev, "school": sc["name"].split()[0], "days": days})
    all_events.sort(key=lambda e: e["days"])
    urgent = [e for e in all_events if e["days"] < 90][:5]
    if not urgent:
        return ""
    rows = ""
    for ev in urgent:
        urg_cls = _urgency_class(ev["days"])
        icon    = _EV_ICON.get(ev["type"], "📌")
        own_col = _OWN_COL.get(ev["owner"], "#555")
        own_bg  = _OWN_BG.get(ev["owner"], "#f0f0f0")
        days_txt = f'{ev["days"]}d away' if ev["days"] > 0 else "Today"
        rows += f"""<div class="sa-urg-row">
          <span class="sa-urg-dot {urg_cls}"></span>
          <span class="sa-urg-icon">{icon}</span>
          <span class="sa-urg-school">{ev["school"]}</span>
          <span class="sa-urg-lbl">{ev["label"]}</span>
          <span class="sa-urg-date">{_fmt_event_date(ev["date"])}</span>
          <span class="sa-urg-days {urg_cls}-txt">{days_txt}</span>
          <span class="sa-urg-owner" style="color:{own_col};background:{own_bg}">{ev["owner"]}</span>
        </div>"""
    return f'<div class="sa-urgency-strip"><div class="sa-urg-hdr">⚠️ Needs Attention — Next 90 Days</div>{rows}</div>'

def _event_timeline_html(events):
    if not events: return ""
    from datetime import date
    rows = ""
    for ev in sorted(events, key=lambda e: e["date"]):
        days    = _days_until(ev["date"])
        icon    = _EV_ICON.get(ev["type"], "📌")
        typ_lbl = _EV_LABEL.get(ev["type"], ev["type"].title())
        own_col = _OWN_COL.get(ev["owner"], "#555")
        own_bg  = _OWN_BG.get(ev["owner"], "#f0f0f0")
        urg_cls = _urgency_class(days)
        if days < 0:
            days_tag = f'<span class="sa-ev-days sa-urg-overdue-txt">Overdue</span>'
        elif days < 90:
            days_tag = f'<span class="sa-ev-days {urg_cls}-txt">{days}d</span>'
        else:
            days_tag = f'<span class="sa-ev-days" style="color:#ccc">{_fmt_event_date(ev["date"])}</span>'
        rows += f"""<div class="sa-ev-row">
          <span class="sa-ev-icon">{icon}</span>
          <div class="sa-ev-body">
            <div class="sa-ev-top">
              <span class="sa-ev-lbl">{ev["label"]}</span>
              {days_tag}
            </div>
            <div class="sa-ev-meta">
              <span class="sa-ev-type">{typ_lbl}</span>
              <span class="sa-ev-owner" style="color:{own_col};background:{own_bg}">{ev["owner"]}</span>
            </div>
          </div>
        </div>"""
    return f'<div class="sa-ev-timeline">{rows}</div>'

def tab_schools(s, milestones, token, svcs=None):
    name = prop(s, "Student Name")
    svcs = svcs or []

    # PDF reports
    pdfs = find_pdfs(name)
    if pdfs:
        pdf_links = "".join(
            f'<a href="/pdf/{os.path.basename(p)}" target="_blank" class="sa-pdf-btn">📄 {os.path.basename(p).replace("linkedu-report-","").replace(".pdf","")}</a>'
            for p in pdfs
        )
        pdf_bar = f'<div class="sa-pdf-bar"><span style="font-size:12px;color:#aaa;margin-right:12px">School Reports:</span>{pdf_links}</div>'
    else:
        pdf_bar = ""

    # Guardianship & sport pathway
    has_guardian     = any("Guardianship" in prop(sv,"Service Type") for sv in svcs)
    sport            = prop(s,"Primary Sport") or ""
    has_sport_pathway= any("Golf" in prop(sv,"Service Type") or "Sport" in prop(sv,"Service Type") for sv in svcs)

    # Build school cards
    cards_html = ""
    for sc in SHORTLISTED_SCHOOLS:
        # Milestones matching this school
        sc_ms = [m for m in milestones if sc["name"].split()[0].lower() in prop(m,"Milestone Title").lower()]
        ms_rows = "".join(
            f'<div class="sa-ms-row"><span class="sa-ms-date">{fmt_date(prop(m,"Date"))}</span><span class="sa-ms-title">{prop(m,"Milestone Title")}</span></div>'
            for m in sc_ms[:4]
        )
        ms_block = f'<div class="sa-ms-block">{ms_rows}</div>' if ms_rows else ""

        golf_chip  = f'<div class="sa-golf-chip">⛳ {sc["golf_note"]}</div>' if sc.get("golf_note") else ""
        pipeline   = _school_pipeline_html(sc["pipeline"])
        docs       = _doc_status_html(sc["docs"])
        ev_timeline= _event_timeline_html(sc.get("events", []))
        school_url = f'{WEBSITE_URL}/schools/{sc["slug"]}.html'
        thb_fee    = f'฿{round(sc["fee"] * THB_RATE / 1000):,}k'

        cards_html += f"""
<div class="sa-card">
  <div class="sa-card-head">
    <div>
      <div class="sa-card-name">{sc["name"]}</div>
      <div class="sa-card-meta">{sc["loc"]} &nbsp;·&nbsp; {sc["type"]}</div>
      <div class="sa-card-fee">£{sc["fee"]:,} / yr &nbsp;<span style="color:#888;font-size:12px">({thb_fee})</span>&nbsp;·&nbsp; {sc["entry"]}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
      <span class="sa-role {sc['role_cls']}">{sc["role"]}</span>
      <span class="sa-status {sc['status_cls']}">{sc["status"]}</span>
    </div>
  </div>

  {golf_chip}

  <div class="sa-section-lbl" style="padding:16px 26px 0">Application Pipeline</div>
  {pipeline}

  <div class="sa-body">
    <div class="sa-col">
      <div class="sa-section-lbl">Key Dates &amp; Events</div>
      {ev_timeline}
    </div>
    <div class="sa-col">
      <div class="sa-section-lbl">Documents</div>
      {docs}
      <div class="sa-section-lbl" style="margin-top:18px">Consultant Note</div>
      <div class="sa-note">{sc["note"]}</div>
      {ms_block}
    </div>
  </div>

  <div class="sa-card-actions">
    <a href="{school_url}" target="_blank" class="btn-secondary btn-sm">View School Profile →</a>
    <a href="https://line.me/R/ti/p/@{LINE_HANDLE}?text={sc['name']}について相談したい" target="_blank" class="btn-primary btn-sm">Ask Satit</a>
  </div>
</div>"""

    # Guardian strip
    guardian_card = f"""<div class="rec-card {'maintained' if has_guardian else 'active-gap'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div style="font-family:'Playfair Display',serif;font-size:1rem">🏠 UK Guardianship</div>
        <span class="rec-badge {'badge-maintained' if has_guardian else 'badge-active-gap'}">{'Active' if has_guardian else 'Not Set Up'}</span>
      </div>
      <p style="font-size:13px;color:#555;margin:10px 0;line-height:1.7">UK law requires all international students under 18 to have a registered UK guardian.</p>
      {"<p style='font-size:12px;color:#5a9a5a;font-weight:600'>✅ Guardianship is active for " + name + ".</p>" if has_guardian else
       f'<a href="https://line.me/R/ti/p/@{LINE_HANDLE}" target="_blank" class="btn-secondary btn-sm" style="margin-top:8px;display:inline-block">Set up guardianship</a>'}
    </div>"""

    sport_card = ""
    if sport and sport not in ("None",""):
        sport_card = f"""<div class="rec-card {'maintained' if has_sport_pathway else 'gold-border'}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div style="font-family:'Playfair Display',serif;font-size:1rem">⛳ {sport} Scholarship Pathway</div>
            <span class="rec-badge {'badge-maintained' if has_sport_pathway else 'badge-gold'}">{'Active' if has_sport_pathway else 'Recommended'}</span>
          </div>
          <p style="font-size:13px;color:#555;margin:10px 0;line-height:1.7">A sport scholarship can reduce annual fees by 10–30%. Requires a documented performance record before the application window.</p>
          <a href="https://line.me/R/ti/p/@{LINE_HANDLE}" target="_blank" class="{'btn-secondary' if has_sport_pathway else 'btn-primary'} btn-sm" style="margin-top:8px;display:inline-block">
            {'View pathway details' if has_sport_pathway else 'Activate sport pathway'}
          </a>
        </div>"""

    shortlisted_count = sum(1 for sc in SHORTLISTED_SCHOOLS if sc["status"] == "Shortlisted")
    researching_count = sum(1 for sc in SHORTLISTED_SCHOOLS if sc["status"] == "Researching")
    urgency_strip     = _urgency_strip_html()

    return f"""
<style>
/* ── Schools Application Tracker ────────────────────────── */
.sa-summary {{ display:flex; gap:16px; margin-bottom:28px; flex-wrap:wrap; }}
.sa-sum-card {{ background:#1a1a1a; border-radius:8px; padding:18px 24px; flex:1; min-width:120px; text-align:center; }}
.sa-sum-num {{ font-family:'Playfair Display',serif; font-size:2rem; color:#B8962E; }}
.sa-sum-lbl {{ font-size:11px; color:#888; letter-spacing:.08em; text-transform:uppercase; margin-top:4px; }}
.sa-pdf-bar {{ background:#1a1a1a; border-radius:8px; padding:14px 20px; margin-bottom:24px; display:flex; align-items:center; flex-wrap:wrap; gap:8px; }}
.sa-pdf-btn {{ font-size:12px; color:#B8962E; text-decoration:none; padding:5px 12px; border:1px solid #333; border-radius:4px; transition:border-color .2s; }}
.sa-pdf-btn:hover {{ border-color:#B8962E; }}
.sa-card {{ background:#fff; border:1px solid #e8e2d8; border-radius:10px; margin-bottom:20px; overflow:hidden; }}
.sa-card-head {{ background:#1a1a1a; padding:22px 26px; display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }}
.sa-card-name {{ font-family:'Playfair Display',serif; font-size:1.3rem; color:#f5f0e8; margin-bottom:4px; }}
.sa-card-meta {{ font-size:12px; color:#f5f0e8; opacity:.5; margin-bottom:6px; }}
.sa-card-fee {{ font-size:13px; color:#f5f0e8; opacity:.8; }}
.sa-role {{ font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; padding:4px 10px; border-radius:3px; }}
.sa-role-primary {{ background:#B8962E; color:#1a1a1a; }}
.sa-role-alt {{ background:#1a3a2a; color:#6dca6d; border:1px solid #2d5a3a; }}
.sa-role-support {{ background:#1a2a3a; color:#6dacca; border:1px solid #2d4a5a; }}
.sa-role-stretch {{ background:#2a1a2a; color:#ca8dca; border:1px solid #4a2a4a; }}
.sa-status {{ font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; padding:3px 10px; border-radius:3px; }}
.sa-status-shortlisted {{ background:#B8962E; color:#1a1a1a; }}
.sa-status-research {{ background:#2a2a2a; color:#888; border:1px solid #444; }}
.sa-golf-chip {{ background:#0a1a0a; border-left:3px solid #5a9a5a; font-size:12px; color:#8dca8d; padding:10px 20px; }}
.sa-section-lbl {{ font-size:10px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#B8962E; margin:0 0 10px; }}
/* Pipeline */
.sa-pipeline {{ display:flex; align-items:flex-start; padding:18px 26px; gap:0; overflow-x:auto; border-bottom:1px solid #f0ebe2; }}
.sa-pip-step {{ display:flex; flex-direction:column; align-items:center; flex:1; min-width:70px; }}
.sa-pip-top {{ display:flex; align-items:center; width:100%; }}
.sa-pip-dot {{ width:14px; height:14px; border-radius:50%; flex-shrink:0; }}
.sa-pip-done {{ background:#5a9a5a; }}
.sa-pip-active {{ background:#B8962E; box-shadow:0 0 0 3px rgba(184,150,46,.25); }}
.sa-pip-upcoming {{ background:#ddd; border:2px solid #ccc; }}
.sa-pip-line {{ flex:1; height:2px; background:#e8e2d8; }}
.sa-pip-step:last-child .sa-pip-line {{ display:none; }}
.sa-pip-lbl {{ font-size:10px; color:#999; margin-top:6px; text-align:center; letter-spacing:.04em; }}
.sa-pip-lbl-done {{ color:#5a9a5a; font-weight:600; }}
.sa-pip-lbl-active {{ color:#B8962E; font-weight:700; }}
.sa-pip-date {{ font-size:9.5px; color:#bbb; margin-top:2px; text-align:center; }}
/* Body */
.sa-body {{ display:grid; grid-template-columns:1fr 1fr; gap:0; }}
.sa-col {{ padding:20px 26px; }}
.sa-col:first-child {{ border-right:1px solid #f0ebe2; }}
.sa-doc-row {{ display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid #f8f5f0; }}
.sa-doc-row:last-child {{ border-bottom:none; }}
.sa-doc-lbl {{ font-size:12.5px; color:#444; }}
.sa-note {{ font-size:12.5px; color:#555; line-height:1.8; margin-bottom:12px; }}
.sa-ms-block {{ margin-top:4px; }}
.sa-ms-row {{ display:flex; gap:10px; font-size:11.5px; color:#777; padding:4px 0; border-bottom:1px solid #f5f0e8; }}
.sa-ms-row:last-child {{ border-bottom:none; }}
.sa-ms-date {{ color:#B8962E; font-weight:600; white-space:nowrap; min-width:70px; }}
.sa-ms-title {{ flex:1; }}
.sa-card-actions {{ display:flex; gap:12px; padding:16px 26px; background:#faf8f5; border-top:1px solid #f0ebe2; }}
/* Urgency strip */
.sa-urgency-strip {{ background:#1a1a1a; border-radius:10px; padding:20px 24px; margin-bottom:24px; }}
.sa-urg-hdr {{ font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#B8962E; margin-bottom:14px; }}
.sa-urg-row {{ display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid #222; flex-wrap:wrap; }}
.sa-urg-row:last-child {{ border-bottom:none; }}
.sa-urg-dot {{ width:8px; height:8px; border-radius:50%; flex-shrink:0; }}
.sa-urg-icon {{ font-size:14px; width:20px; text-align:center; flex-shrink:0; }}
.sa-urg-school {{ font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#666; min-width:80px; flex-shrink:0; }}
.sa-urg-lbl {{ font-size:13px; color:#ddd; flex:1; min-width:160px; }}
.sa-urg-date {{ font-size:11.5px; color:#888; white-space:nowrap; }}
.sa-urg-days {{ font-size:11px; font-weight:700; white-space:nowrap; min-width:60px; text-align:right; }}
.sa-urg-owner {{ font-size:10px; font-weight:700; letter-spacing:.06em; padding:2px 8px; border-radius:3px; white-space:nowrap; }}
/* Event timeline */
.sa-ev-timeline {{ display:flex; flex-direction:column; gap:0; }}
.sa-ev-row {{ display:flex; gap:10px; align-items:flex-start; padding:9px 0; border-bottom:1px solid #f8f5f0; }}
.sa-ev-row:last-child {{ border-bottom:none; }}
.sa-ev-icon {{ font-size:14px; width:20px; text-align:center; flex-shrink:0; padding-top:1px; }}
.sa-ev-body {{ flex:1; }}
.sa-ev-top {{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom:3px; }}
.sa-ev-lbl {{ font-size:12.5px; color:#333; line-height:1.4; }}
.sa-ev-days {{ font-size:11px; font-weight:700; white-space:nowrap; }}
.sa-ev-meta {{ display:flex; gap:6px; align-items:center; }}
.sa-ev-type {{ font-size:10px; color:#aaa; letter-spacing:.05em; }}
.sa-ev-owner {{ font-size:10px; font-weight:700; letter-spacing:.05em; padding:1px 7px; border-radius:3px; }}
/* Urgency colours */
.sa-urg-red {{ background:#ca6d6d; }}
.sa-urg-amber {{ background:#c9a830; }}
.sa-urg-green {{ background:#5a9a5a; }}
.sa-urg-grey {{ background:#555; }}
.sa-urg-overdue {{ background:#ca6d6d; }}
.sa-urg-red-txt {{ color:#ca6d6d; }}
.sa-urg-amber-txt {{ color:#c9a830; }}
.sa-urg-green-txt {{ color:#5a9a5a; }}
.sa-urg-grey-txt {{ color:#aaa; }}
.sa-urg-overdue-txt {{ color:#ca6d6d; }}
@media(max-width:640px) {{
  .sa-body {{ grid-template-columns:1fr; }}
  .sa-col:first-child {{ border-right:none; border-bottom:1px solid #f0ebe2; }}
  .sa-urg-row {{ gap:6px; }}
  .sa-urg-school {{ min-width:60px; }}
}}
</style>

<div class="sa-summary">
  <div class="sa-sum-card">
    <div class="sa-sum-num">{len(SHORTLISTED_SCHOOLS)}</div>
    <div class="sa-sum-lbl">Schools Tracked</div>
  </div>
  <div class="sa-sum-card">
    <div class="sa-sum-num">{shortlisted_count}</div>
    <div class="sa-sum-lbl">Shortlisted</div>
  </div>
  <div class="sa-sum-card">
    <div class="sa-sum-num">{researching_count}</div>
    <div class="sa-sum-lbl">Researching</div>
  </div>
  <div class="sa-sum-card">
    <div class="sa-sum-num" style="color:#c9a830">Sept 2027</div>
    <div class="sa-sum-lbl">Target Entry</div>
  </div>
</div>

{pdf_bar}
{urgency_strip}

<p class="sec-label lang-en">Application Tracker</p>
{cards_html}

<div class="guardian-strip" style="margin-top:32px">
  {guardian_card}
  {sport_card if sport_card else '<div></div>'}
</div>"""

# ── TAB: RECOMMENDATIONS ─────────────────────────────────────────────────────

def tab_recommendations(s, svcs, academics, milestones):
    import json as _json

    name          = prop(s, "Student Name")
    english_level = prop(s, "English Level") or "Intermediate"
    goal          = prop(s, "Goal") or "Top 50 UK Boarding"
    sport         = prop(s, "Primary Sport") or ""
    target_year   = prop(s, "Target Entry Year") or "2027"
    target_group  = prop(s, "Target Entry Year Group") or "Year 9"

    # Detect target school from milestones / notes
    notes_low = prop(s, "Notes").lower()
    target_school = "Bromsgrove"
    for key in SCHOOL_SLUGS:
        for m in milestones:
            if key in prop(m, "Milestone Title").lower():
                target_school = key.title()
                break
        if key in notes_low:
            target_school = key.title()

    # Key milestone dates
    exam_date_str = camp_deadline_str = app_deadline_str = ""
    for m in milestones:
        t = prop(m, "Milestone Title").lower()
        d = prop(m, "Date")
        if not d: continue
        if "exam" in t or "ce " in t or "common entrance" in t:
            exam_date_str = exam_date_str or d
        if "camp" in t or "summer school" in t:
            camp_deadline_str = camp_deadline_str or d
        if "application" in t or "apply" in t:
            app_deadline_str = app_deadline_str or d

    # Build grade_by_subject (ascending sort already applied → last write = most recent)
    grade_by_subject = {}
    ce_mock_pct = None
    for rec in academics:
        subj  = prop(rec, "Subject") or ""
        grade = prop(rec, "Grade") or ""
        atype = prop(rec, "Assessment Type") or ""
        score = prop(rec, "Score")
        maxsc = prop(rec, "Max Score")
        if grade:
            grade_by_subject[subj] = grade
        if "mock" in atype.lower() and ("ce" in atype.lower() or "common entrance" in atype.lower()):
            if score and maxsc:
                ce_mock_pct = round(score / maxsc * 100)

    # Find active tutoring service
    tutoring_svc = next(
        (sv for sv in svcs if "Tutor" in prop(sv, "Service Type") and prop(sv, "Status") == "Active"),
        None
    )
    tutor_sessions = prop(tutoring_svc, "Sessions Per Week") if tutoring_svc else 0
    tutor_active   = tutoring_svc is not None

    # Find active camp service
    camp_svc = next(
        (sv for sv in svcs if "Camp" in prop(sv, "Service Type") or "Summer" in prop(sv, "Service Type")),
        None
    )

    rec_data = {
        "studentName":   name,
        "englishLevel":  english_level,
        "goal":          goal,
        "targetSchool":  target_school,
        "targetYear":    target_year,
        "targetGroup":   target_group,
        "sport":         sport,
        "examDate":      exam_date_str,
        "campDeadline":  camp_deadline_str,
        "appDeadline":   app_deadline_str,
        "grades":        {k: {"current": v} for k, v in grade_by_subject.items()},
        "ceMock":        {"score": ce_mock_pct, "target": 70, "threshold": 60},
        "tutoring":      {
            "active":          tutor_active,
            "sessionsPerWeek": tutor_sessions or 0,
        },
        "campActive":    camp_svc is not None,
        "schoolRequirements": {"Maths": "B", "English": "B", "Science": "B"},
        "campFeeGBP":    2800,
    }
    rec_json = _json.dumps(rec_data)

    # scaffold: f-string (Python vars), inner JS only uses const REC injected below
    scaffold = f"""
<div class="rec-anchor-nav">
  <a onclick="document.getElementById('rec-tutoring').scrollIntoView({{behavior:'smooth'}})">📚 Tutoring</a>
  <a onclick="document.getElementById('rec-camp').scrollIntoView({{behavior:'smooth'}})">☀️ Summer Camp</a>
  <a onclick="document.getElementById('rec-activities').scrollIntoView({{behavior:'smooth'}})">🏅 Activities</a>
</div>

<div id="rec-tutoring" class="rec-section"></div>
<div id="rec-camp"     class="rec-section"></div>
<div id="rec-activities" class="rec-section"></div>

<div class="line-cta" style="margin-top:32px">
  <p class="lang-en">Want to discuss any recommendation in detail?</p>
  <p class="lang-th">ต้องการปรึกษาเรื่องคำแนะนำเหล่านี้?</p>
  <div class="line-handle">LINE: @{LINE_HANDLE}</div>
  <a href="https://line.me/R/ti/p/@{LINE_HANDLE}" target="_blank" class="btn-primary">
    <span class="lang-en">Talk to Satit</span>
    <span class="lang-th">คุยกับที่ปรึกษา</span>
  </a>
</div>

<script>
const REC = {rec_json};
</script>"""

    # logic: plain Python string — no f-string, so JS braces don't need escaping
    logic = """<script>
(function() {

// ─── helpers ──────────────────────────────────────────────────────────────────
function gradeNum(g) {
  return {A:4,B:3,C:2,D:1,E:0,F:0}[g] !== undefined ? {A:4,B:3,C:2,D:1,E:0,F:0}[g] : -1;
}
function gradeGap(current, required) {
  return gradeNum(required) - gradeNum(current);
}
function statusClass(gap) {
  if (gap <= -1) return 'strong';
  if (gap === 0)  return 'maintained';
  if (gap === 1)  return 'active-gap';
  return 'critical';
}
function badgeClass(gap) {
  if (gap <= -1) return 'badge-strong';
  if (gap === 0)  return 'badge-maintained';
  if (gap === 1)  return 'badge-active-gap';
  return 'badge-critical';
}
function badgeLabel(gap) {
  if (gap <= -1) return 'Strong';
  if (gap === 0)  return 'On Track';
  if (gap === 1)  return 'Gap — Action Needed';
  return 'Critical Gap';
}
function sessionsRec(monthsToExam) {
  if (monthsToExam > 18) return 2;
  if (monthsToExam > 12) return 3;
  if (monthsToExam > 6)  return 4;
  return 5;
}
function monthsUntil(dateStr) {
  if (!dateStr) return 18;
  var d = new Date(dateStr), now = new Date();
  return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()));
}
function deadlineClass(daysAway) {
  if (daysAway < 30)  return 'deadline-urgent';
  if (daysAway < 90)  return 'deadline-warning';
  return 'deadline-ok';
}
function daysUntil(dateStr) {
  if (!dateStr) return 999;
  var d = new Date(dateStr), now = new Date();
  return Math.round((d - now) / 86400000);
}

// ─── SECTION 1: TUTORING ──────────────────────────────────────────────────────
function buildTutoring() {
  var el = document.getElementById('rec-tutoring');
  var reqs = REC.schoolRequirements;
  var months = monthsUntil(REC.examDate);
  var recSess = sessionsRec(months);
  var currSess = REC.tutoring.sessionsPerWeek || 0;

  // subject cards
  var subjectCards = '';
  var subjects = Object.keys(reqs);
  subjects.forEach(function(subj) {
    var current  = (REC.grades[subj] || {}).current || '?';
    var required = reqs[subj];
    var gap      = current === '?' ? 1 : gradeGap(current, required);
    var sc       = statusClass(gap);
    var reasoning = '';
    if (sc === 'strong')     reasoning = current + ' exceeds the ' + required + ' requirement — maintain current performance and keep ahead of syllabus.';
    if (sc === 'maintained') reasoning = current + ' meets the ' + required + ' requirement — consistent effort needed to hold this grade through exam season.';
    if (sc === 'active-gap') reasoning = current + ' is one grade below the ' + required + ' required — focused tutoring on this subject should begin immediately.';
    if (sc === 'critical')   reasoning = 'Grade is significantly below target — urgent intervention required before exam date.';

    subjectCards += '<div class="rec-card ' + sc + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
        '<div class="rec-subject">' + subj + '</div>' +
        '<span class="rec-badge ' + badgeClass(gap) + '">' + badgeLabel(gap) + '</span>' +
      '</div>' +
      '<div class="rec-grade-row">' +
        '<div><div class="rec-grade-label">Current Grade</div><div style="font-size:1.3rem;font-family:&apos;Playfair Display&apos;,serif;color:#1a1a1a">' + (current === '?' ? '—' : current) + '</div></div>' +
        '<div><div class="rec-grade-label">Required (' + REC.targetSchool + ')</div><div style="font-size:1.3rem;font-family:&apos;Playfair Display&apos;,serif;color:#B8962E">' + required + '</div></div>' +
        (gap > 0 ? '<div><div class="rec-grade-label">Gap</div><div style="font-size:1.3rem;font-family:&apos;Playfair Display&apos;,serif;color:#ca6d6d">+' + gap + '</div></div>' : '') +
      '</div>' +
      '<div class="reasoning-block">' + reasoning + '</div>' +
    '</div>';
  });

  // CE mock bar
  var mockHtml = '';
  if (REC.ceMock.score !== null) {
    var pct      = REC.ceMock.score;
    var targetPct = REC.ceMock.target;
    var threshPct = REC.ceMock.threshold;
    var mockSc   = pct >= targetPct ? 'maintained' : (pct >= threshPct ? 'active-gap' : 'critical');
    var threshLeft = threshPct + '%';
    var targetLeft = targetPct + '%';
    mockHtml = '<div class="rec-card ' + mockSc + '" style="margin-top:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
        '<div class="rec-subject">CE Mock Exam</div>' +
        '<span class="rec-badge ' + badgeClass(pct >= targetPct ? -1 : (pct >= threshPct ? 1 : 2)) + '">' + pct + '% scored</span>' +
      '</div>' +
      '<div class="ce-bar-wrap" style="margin-top:16px">' +
        '<div class="ce-bar-fill" style="width:' + Math.min(pct,100) + '%"></div>' +
        '<div class="ce-marker" style="left:' + threshLeft + '"><span class="ce-marker-label">Pass ' + threshPct + '%</span></div>' +
        '<div class="ce-marker" style="left:' + targetLeft + ';background:#B8962E"><span class="ce-marker-label" style="color:#B8962E">Target ' + targetPct + '%</span></div>' +
      '</div>' +
      '<p style="font-size:11px;color:#aaa;margin-top:30px">Score vs pass threshold and target score</p>' +
    '</div>';
  }

  // sessions card
  var sessClass  = currSess >= recSess ? 'maintained' : 'active-gap';
  var sessBadge  = currSess >= recSess ? 'badge-maintained' : 'badge-active-gap';
  var sessLabel  = currSess >= recSess ? 'On Track' : 'Needs Increase';
  var sessCard   = '<div class="rec-card ' + sessClass + '">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
      '<div class="rec-subject">Active Tutoring Plan</div>' +
      '<span class="rec-badge ' + sessBadge + '">' + sessLabel + '</span>' +
    '</div>' +
    '<div class="rec-grade-row">' +
      '<div><div class="rec-grade-label">Current Sessions / week</div><div style="font-size:1.3rem;font-family:&apos;Playfair Display&apos;,serif">' + (REC.tutoring.active ? currSess : 'None') + '</div></div>' +
      '<div><div class="rec-grade-label">Recommended (' + months + ' months to exam)</div><div style="font-size:1.3rem;font-family:&apos;Playfair Display&apos;,serif;color:#B8962E">' + recSess + '</div></div>' +
    '</div>' +
    (currSess < recSess ? '<div class="reasoning-block">With ' + months + ' months until the CE exam, we recommend increasing to <strong>' + recSess + ' sessions per week</strong> to give ' + REC.studentName + ' the best chance of meeting all grade requirements. Message Satit on LINE to adjust your plan.</div>' : '<div class="reasoning-block">Current tutoring frequency is well-matched to the timeline. Keep consistent and review subject gaps above.</div>') +
  '</div>';

  el.innerHTML =
    '<div class="rec-section-header">' +
      '<p style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#B8962E;font-weight:600;margin-bottom:8px">Section 1</p>' +
      '<h2 style="font-family:&apos;Playfair Display&apos;,serif;font-size:1.5rem;font-weight:400;margin-bottom:10px">📚 Tutoring</h2>' +
      '<p style="font-size:13px;color:#666;line-height:1.8">Subject performance vs. ' + REC.targetSchool + ' requirements, CE mock progress, and recommended tutoring intensity.</p>' +
    '</div>' +
    subjectCards + mockHtml + sessCard;
}

// ─── SECTION 2: SUMMER CAMP ───────────────────────────────────────────────────
function buildCamp() {
  var el = document.getElementById('rec-camp');
  var days = daysUntil(REC.campDeadline);
  var dlBadge = REC.campDeadline ? '<span class="deadline-badge ' + deadlineClass(days) + '">' + (days < 0 ? 'Deadline passed' : days + ' days to register') + '</span>' : '';

  var tier1 = '<div class="rec-card gold-border">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
      '<div class="rec-subject">Tier 1 — ' + REC.targetSchool + ' Summer School</div>' +
      '<span class="rec-badge badge-gold">Primary Target</span>' +
    '</div>' +
    '<p class="rec-text">Attending ' + REC.targetSchool + '\'s own summer programme puts ' + REC.studentName + ' in front of the admissions team, makes the school familiar and comfortable, and is explicitly noted in many applications as a positive signal.</p>' +
    dlBadge +
    '<div class="reasoning-block">This is the highest-impact single action available before the ' + REC.targetYear + ' entry application window opens. Priority: enrol now.</div>' +
    '<a href="https://line.me/R/ti/p/@satitlinkedu" target="_blank" class="btn-primary btn-sm" style="margin-top:16px;display:inline-block">Enrol via Satit</a>' +
  '</div>';

  var tier2 = '';
  if (REC.sport) {
    tier2 = '<div class="rec-card active-gap" style="margin-top:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
        '<div class="rec-subject">Tier 2 — ' + REC.sport + ' Performance Camp (UK)</div>' +
        '<span class="rec-badge badge-active-gap">Sport Scholarship Support</span>' +
      '</div>' +
      '<p class="rec-text">A specialist ' + REC.sport.toLowerCase() + ' camp in the UK develops athletic credentials and produces a performance portfolio — critical evidence for a sport scholarship application at ' + REC.targetSchool + '.</p>' +
      '<div class="reasoning-block">Sport scholarship success depends on documented development over time, not just natural ability. A UK camp this summer creates the evidence trail needed for ' + REC.targetYear + ' entry.</div>' +
      '<a href="https://line.me/R/ti/p/@satitlinkedu" target="_blank" class="btn-secondary btn-sm" style="margin-top:16px;display:inline-block">Ask about sport camps</a>' +
    '</div>';
  }

  var tier5 = '<div class="rec-card cream-card" style="margin-top:8px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
      '<div class="rec-subject">Tier 5 — English Immersion Camp</div>' +
      '<span class="rec-badge badge-strong">English Development</span>' +
    '</div>' +
    '<p class="rec-text">An English immersion programme in a UK or international setting strengthens conversational and academic English — particularly valuable for CE English and interview preparation.</p>' +
    '<div class="reasoning-block">Current English level: <strong>' + REC.englishLevel + '</strong>. ' + (REC.englishLevel === 'Advanced' ? 'English is strong — this tier is optional unless exam English needs polish.' : 'An immersion camp before Year 9 entry will significantly improve CE English performance and interview confidence.') + '</div>' +
  '</div>';

  var campStatus = REC.campActive
    ? '<div class="rec-card maintained"><div class="rec-subject">Camp Registration</div><p class="rec-text">A summer camp is already booked — great. Confirm placement details with Satit to ensure it aligns with the application timeline.</p></div>'
    : '';

  el.innerHTML =
    '<div class="rec-section-header">' +
      '<p style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#B8962E;font-weight:600;margin-bottom:8px">Section 2</p>' +
      '<h2 style="font-family:&apos;Playfair Display&apos;,serif;font-size:1.5rem;font-weight:400;margin-bottom:10px">☀️ Summer Camp</h2>' +
      '<p style="font-size:13px;color:#666;line-height:1.8">Recommended summer programmes ranked by impact on the ' + REC.targetSchool + ' application.</p>' +
    '</div>' +
    campStatus + tier1 + tier2 + tier5;
}

// ─── SECTION 3: ACTIVITIES ────────────────────────────────────────────────────
function buildActivities() {
  var el = document.getElementById('rec-activities');
  var hasSport = !!REC.sport;

  var profileCard = '<div class="rec-card gold-border">' +
    '<div class="rec-subject">Current Activity Profile</div>' +
    '<div class="rec-grade-row">' +
      (hasSport ? '<div><div class="rec-grade-label">Primary Sport</div><div style="font-size:1.1rem;font-weight:600">' + REC.sport + '</div></div>' : '') +
      '<div><div class="rec-grade-label">Portfolio Status</div><div style="font-size:1.1rem;font-weight:600;color:#B8962E">In Development</div></div>' +
    '</div>' +
    '<p class="rec-text">UK boarding schools expect applicants to demonstrate both athletic/creative achievement and a genuine secondary interest. ' + REC.studentName + '\'s current profile is centred on ' + (hasSport ? REC.sport : 'academics') + '. Building a documented secondary activity now strengthens the application narrative.</p>' +
  '</div>';

  var secondaryCard = '<div class="rec-card active-gap">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
      '<div class="rec-subject">Secondary Activity — Choose One</div>' +
      '<span class="rec-badge badge-active-gap">Action Needed</span>' +
    '</div>' +
    '<p class="rec-text" style="margin-bottom:14px">Select a secondary activity and begin building documented achievement. Schools look for consistency over 1–2 years, not last-minute additions.</p>' +
    '<div class="sub-option">' +
      '<div class="sub-option-num">Option A</div>' +
      '<div class="sub-option-title">Music or Performing Arts</div>' +
      '<div class="sub-option-text">Grade examinations (ABRSM / Trinity) provide internationally recognised evidence of commitment. Aim for Grade 4–5 before ' + REC.targetYear + ' entry.</div>' +
    '</div>' +
    '<div class="sub-option">' +
      '<div class="sub-option-num">Option B</div>' +
      '<div class="sub-option-title">Community Service / Leadership</div>' +
      '<div class="sub-option-text">A consistent volunteering role or school leadership position (prefect, club president) demonstrates character — a top priority in UK boarding admissions.</div>' +
    '</div>' +
    '<div class="sub-option">' +
      '<div class="sub-option-num">Option C</div>' +
      '<div class="sub-option-title">Creative / STEM Competition</div>' +
      '<div class="sub-option-text">Entering a recognised competition (Maths Olympiad, science fair, art prize) and reaching a regional or national level is a strong differentiator for top-50 schools.</div>' +
    '</div>' +
  '</div>';

  var comparisonCard = '<div class="rec-card maintained" style="margin-top:8px">' +
    '<div class="rec-subject">What ' + REC.targetSchool + ' Looks For</div>' +
    '<div style="margin-top:10px">' +
      '<div class="compare-row"><span style="width:18px;flex-shrink:0">✅</span><span>CE grade profile (Maths, English, Science at ' + (REC.schoolRequirements['Maths']||'B') + '+)</span></div>' +
      '<div class="compare-row"><span style="width:18px;flex-shrink:0">✅</span><span>Primary sport or performing arts with verifiable achievement</span></div>' +
      '<div class="compare-row"><span style="width:18px;flex-shrink:0">⬜</span><span>Secondary interest with documented progression (music grades, competition results)</span></div>' +
      '<div class="compare-row" style="border:none"><span style="width:18px;flex-shrink:0">⬜</span><span>Evidence of character: leadership, community contribution, resilience</span></div>' +
    '</div>' +
    '<div class="reasoning-block" style="margin-top:12px">Items marked ⬜ are areas where ' + REC.studentName + '\'s profile can be strengthened before the application window opens.</div>' +
  '</div>';

  var sportPathwayCard = '';
  if (hasSport) {
    sportPathwayCard = '<div class="rec-card gold-border" style="margin-top:8px">' +
      '<div class="rec-subject">⛳ ' + REC.sport + ' Scholarship Pathway</div>' +
      '<div class="timeline-plan">' +
        '<div class="plan-item"><div class="plan-period">Now → Summer</div><div class="plan-text">Attend UK ' + REC.sport.toLowerCase() + ' performance camp. Request official performance report for application file.</div></div>' +
        '<div class="plan-item"><div class="plan-period">Sep–Dec 2025</div><div class="plan-text">Begin sport scholarship applications to ' + REC.targetSchool + ' and 2 alternative schools. Satit coordinates with sports directors.</div></div>' +
        '<div class="plan-item"><div class="plan-period">Jan–Mar 2026</div><div class="plan-text">Sport assessment trials at shortlisted schools. Prepare performance video if required by school.</div></div>' +
        '<div class="plan-item"><div class="plan-period">' + REC.targetYear + ' Entry</div><div class="plan-text">Target: sport scholarship covering 10–30% of fees at ' + REC.targetSchool + '.</div></div>' +
      '</div>' +
      '<a href="https://line.me/R/ti/p/@satitlinkedu" target="_blank" class="btn-primary btn-sm" style="margin-top:20px;display:inline-block">Activate Sport Pathway</a>' +
    '</div>';
  }

  el.innerHTML =
    '<div class="rec-section-header">' +
      '<p style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#B8962E;font-weight:600;margin-bottom:8px">Section 3</p>' +
      '<h2 style="font-family:&apos;Playfair Display&apos;,serif;font-size:1.5rem;font-weight:400;margin-bottom:10px">🏅 Activities & Profile</h2>' +
      '<p style="font-size:13px;color:#666;line-height:1.8">Building a compelling extracurricular profile for ' + REC.targetSchool + ' admission in ' + REC.targetYear + '.</p>' +
    '</div>' +
    profileCard + secondaryCard + comparisonCard + sportPathwayCard;
}

buildTutoring();
buildCamp();
buildActivities();

})();
</script>"""

    return scaffold + logic

# ── TAB: PROFILE ─────────────────────────────────────────────────────────────

def tab_profile(s):
    fields = [
        ("Student Name / ชื่อนักเรียน", prop(s,"Student Name")),
        ("Date of Birth / วันเกิด", fmt_date(prop(s,"Date of Birth"))),
        ("Nationality / สัญชาติ", prop(s,"Nationality")),
        ("Current School / โรงเรียนปัจจุบัน", prop(s,"Current School")),
        ("Year Group / ชั้นปี", prop(s,"Current Year Group")),
        ("English Level / ระดับภาษาอังกฤษ", prop(s,"English Level")),
        ("Primary Sport / กีฬาหลัก", prop(s,"Primary Sport")),
        ("Academic Goal / เป้าหมายการศึกษา", prop(s,"Goal")),
        ("Target Entry Year / ปีเข้าเรียน", prop(s,"Target Entry Year")),
        ("Target Year Group / ระดับชั้นเป้าหมาย", prop(s,"Target Entry Year Group")),
        ("Destination / ปลายทาง", ", ".join(prop(s,"Destination")) if isinstance(prop(s,"Destination"),list) else prop(s,"Destination")),
        ("Annual Budget / งบประมาณต่อปี", f"£{prop(s,'Annual Budget GBP'):,}" if prop(s,"Annual Budget GBP") else "—"),
    ]

    fields_html = "".join(f"""<div class="profile-section">
      <div class="profile-label">{label}</div>
      <div class="profile-value">{val or "—"}</div>
    </div>""" for label, val in fields)

    svcs = prop(s,"Services Active") or []
    svcs_str = ", ".join(svcs) if isinstance(svcs, list) else svcs
    stage = prop(s,"Stage") or "—"
    status = prop(s,"Status") or "—"
    consultant_msg = prop(s,"Consultant Message") or ""

    return f"""
<div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">
  <div style="flex:1;min-width:280px">
    <p class="sec-label lang-en">Student Profile</p>
    <p class="sec-label lang-th">โปรไฟล์นักเรียน</p>
    <div class="resume-grid">{fields_html}</div>
  </div>
  <div style="width:280px;flex-shrink:0">
    <p class="sec-label lang-en">Journey Status</p>
    <p class="sec-label lang-th">สถานะ</p>
    <div class="card-cream" style="margin-bottom:16px">
      <div class="profile-label">Stage</div>
      <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:14px">{stage}</div>
      <div class="profile-label">Status</div>
      <div style="font-size:14px;margin-bottom:14px">{status}</div>
      <div class="profile-label">Active Services</div>
      <div style="font-size:13px;color:#555">{svcs_str or "—"}</div>
    </div>
    <p class="sec-label lang-en">Message from Consultant</p>
    <p class="sec-label lang-th">ข้อความจากที่ปรึกษา</p>
    <div class="card-cream" style="font-size:13px;color:#555;font-style:italic;line-height:1.7">{consultant_msg if consultant_msg else '<span style="color:#aaa">No message at this time. Contact your consultant via LINE for updates.</span>'}</div>
    <div style="margin-top:20px">
      <a href="https://line.me/R/ti/p/@{LINE_HANDLE}" target="_blank" class="btn-primary" style="width:100%;display:block;text-align:center;margin-bottom:10px">
        <span class="lang-en">Request Detailed Consultation</span>
        <span class="lang-th">ขอคำปรึกษาเพิ่มเติม</span>
      </a>
      <p style="font-size:11px;color:#aaa;text-align:center;margin-top:8px">LINE: @{LINE_HANDLE}</p>
    </div>
  </div>
</div>"""

# ── TAB: ACADEMICS ───────────────────────────────────────────────────────────

def tab_academics(academics):
    grade_map = {"A*":5,"A":4,"B":3,"C":2,"D":1,"E":0,"F":0}
    grade_col = {"A*":"#B8962E","A":"#5a9a5a","B":"#5a7aba","C":"#c9a830","D":"#ca7a5a","E":"#ca6d6d","F":"#ca6d6d"}

    rows_html = ""
    for rec in academics:
        subj  = prop(rec,"Subject")
        grade = prop(rec,"Grade")
        atype = prop(rec,"Assessment Type")
        term  = prop(rec,"Term")
        score = prop(rec,"Score")
        maxsc = prop(rec,"Max Score")
        date  = prop(rec,"Date")
        gc    = grade_col.get(grade,"#888")
        score_display = f"{score}/{maxsc}" if score and maxsc else grade or "—"
        rows_html += f"""<tr>
          <td style="font-weight:500">{subj}</td>
          <td><span style="color:{gc};font-weight:700;font-size:15px">{score_display}</span></td>
          <td style="color:#aaa;font-size:12px">{atype}</td>
          <td style="color:#aaa;font-size:12px">{term or fmt_date(date,short=True)}</td>
        </tr>"""

    # Build chart data — grades by subject over time
    by_subject = {}
    for rec in academics:
        subj  = prop(rec,"Subject")
        grade = prop(rec,"Grade")
        score = prop(rec,"Score")
        maxsc = prop(rec,"Max Score")
        if grade in grade_map:
            by_subject.setdefault(subj,[]).append(grade_map[grade])
        elif score and maxsc:
            pct = round(score / maxsc * 5)
            by_subject.setdefault(subj,[]).append(pct)

    chart_subjects = list(by_subject.keys())[:6]
    chart_avgs = [round(sum(v)/len(v)*20) for s in chart_subjects for v in [by_subject[s]]]  # scale to 0-100
    chart_labels = json.dumps(chart_subjects)
    chart_data   = json.dumps(chart_avgs)
    chart_colors = json.dumps(["#B8962E","#1a1a1a","#5a9a5a","#5a7aba","#c9a830","#ca7a5a"][:len(chart_subjects)])

    return f"""
<p class="sec-label lang-en">Academic Performance</p>
<p class="sec-label lang-th">ผลการเรียน</p>

<div class="chart-wrap" style="margin-bottom:24px">
  <p style="font-size:12px;color:#aaa;margin-bottom:16px">
    <span class="lang-en">Subject performance overview (average across terms)</span>
    <span class="lang-th">ภาพรวมผลการเรียนตามวิชา (เฉลี่ยตลอดเทอม)</span>
  </p>
  <canvas id="gradeChart" height="80"></canvas>
</div>

<p class="sec-label lang-en">All Records</p>
<p class="sec-label lang-th">บันทึกทั้งหมด</p>
<div class="card" style="overflow-x:auto">
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="border-bottom:2px solid #ece7df">
      <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#aaa">Subject</th>
      <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#aaa">Grade / Score</th>
      <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#aaa">Type</th>
      <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#aaa">Term</th>
    </tr></thead>
    <tbody>{rows_html}</tbody>
  </table>
</div>

<div class="line-cta" style="margin-top:32px">
  <p class="lang-en">Want to discuss your child's academic progress?</p>
  <p class="lang-th">ต้องการปรึกษาเรื่องผลการเรียน?</p>
  <div class="line-handle">LINE: @{LINE_HANDLE}</div>
  <a href="https://line.me/R/ti/p/@{LINE_HANDLE}" target="_blank" class="btn-primary">
    <span class="lang-en">Talk to Satit</span><span class="lang-th">คุยกับที่ปรึกษา</span>
  </a>
</div>

<script>
window._gradeChartData = {{
  labels: {chart_labels},
  data: {chart_data},
  colors: {chart_colors}
}};
</script>"""

# ── TAB: DOCUMENTS ───────────────────────────────────────────────────────────

def tab_documents(s, docs, token, sid):
    status_icons = {
        "✅ Verified":         ("✅","#5a9a5a"),
        "📤 Uploaded":         ("📤","#5a7aba"),
        "⏳ Requested":        ("⏳","#c9a830"),
        "❌ Missing":          ("❌","#ca6d6d"),
        "🔒 Not Yet Required": ("🔒","#aaa"),
    }

    # Group by status
    groups = {"✅ Verified":[],"📤 Uploaded":[],"⏳ Requested":[],"❌ Missing":[],"🔒 Not Yet Required":[]}
    for d in docs:
        st = prop(d,"Status")
        groups.get(st, groups["❌ Missing"]).append(d)

    docs_html = ""
    for st, items in groups.items():
        if not items: continue
        icon, col = status_icons.get(st, ("•","#aaa"))
        docs_html += f'<p style="font-size:11px;font-weight:600;color:{col};letter-spacing:0.08em;text-transform:uppercase;margin:20px 0 10px">{icon} {st} ({len(items)})</p>'
        for d in items:
            dtitle = prop(d,"Document Title").replace(f"{prop(s,'Student Name')} | ","")
            dnote  = prop(d,"Notes")
            dlink  = prop(d,"File Link")
            req_by = prop(d,"Required By")
            daway  = days_away(req_by) if req_by else None
            if req_by and daway is not None:
                if daway < 0:
                    due_tag = f'<span style="font-size:11px;color:#ca6d6d;font-weight:600;margin-left:8px">Due {fmt_date(req_by)} · {abs(daway)}d overdue</span>'
                elif daway <= 14:
                    due_tag = f'<span style="font-size:11px;color:#c9a830;font-weight:600;margin-left:8px">Due {fmt_date(req_by)} · {daway}d left</span>'
                else:
                    due_tag = f'<span style="font-size:11px;color:#aaa;margin-left:8px">Due {fmt_date(req_by)}</span>'
            else:
                due_tag = ""
            docs_html += f"""<div class="doc-card" style="margin-bottom:8px">
              <div class="doc-icon">{icon}</div>
              <div style="flex:1">
                <div class="doc-name">{"<a href='" + dlink + "' target='_blank' style='color:#1a1a1a'>" if dlink else ""}{dtitle}{"</a>" if dlink else ""}{due_tag}</div>
                {"<div class='doc-note'>" + dnote[:100] + "…</div>" if dnote and len(dnote)>5 else ""}
              </div>
            </div>"""

    ready = sum(1 for d in docs if "Verified" in prop(d,"Status") or "Uploaded" in prop(d,"Status"))
    pct   = int(ready / len(docs) * 100) if docs else 0

    return f"""
<div class="card-cream" style="margin-bottom:28px;display:flex;align-items:center;gap:24px;flex-wrap:wrap">
  <div style="text-align:center;min-width:100px">
    <div style="font-family:'Playfair Display',serif;font-size:2.5rem;color:#B8962E">{pct}%</div>
    <div style="font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.08em">
      <span class="lang-en">Documents Ready</span>
      <span class="lang-th">เอกสารพร้อม</span>
    </div>
  </div>
  <div style="flex:1;min-width:200px">
    <div class="progress-bar-bg" style="height:8px;margin-bottom:8px"><div class="progress-bar-fill" style="width:{pct}%"></div></div>
    <p style="font-size:13px;color:#555">
      <span class="lang-en">{ready} of {len(docs)} documents verified or uploaded</span>
      <span class="lang-th">{ready} จาก {len(docs)} เอกสารพร้อมแล้ว</span>
    </p>
  </div>
</div>

<p class="sec-label lang-en">Document Checklist</p>
<p class="sec-label lang-th">รายการเอกสาร</p>
<div style="margin-bottom:36px">{docs_html}</div>

<p class="sec-label lang-en">Upload a Document</p>
<p class="sec-label lang-th">อัพโหลดเอกสาร</p>
<div class="upload-form">
  <p style="font-size:13px;color:#888;margin-bottom:20px">
    <span class="lang-en">Share a Google Drive, Dropbox, or OneDrive link below. Your consultant will be notified.</span>
    <span class="lang-th">แชร์ลิงก์ Google Drive, Dropbox หรือ OneDrive ด้านล่าง ที่ปรึกษาจะได้รับแจ้ง</span>
  </p>
  <form id="uploadForm" onsubmit="submitUpload(event)">
    <input type="hidden" name="token" value="{token}">
    <input type="hidden" name="sid" value="{sid}">
    <div class="form-group">
      <label class="form-label">
        <span class="lang-en">Document Name</span>
        <span class="lang-th">ชื่อเอกสาร</span>
      </label>
      <input class="form-input" type="text" name="doc_title" placeholder="e.g. Passport scan" required>
    </div>
    <div class="form-group">
      <label class="form-label">
        <span class="lang-en">File Link (Google Drive / Dropbox / OneDrive)</span>
        <span class="lang-th">ลิงก์ไฟล์</span>
      </label>
      <input class="form-input" type="url" name="doc_link" placeholder="https://drive.google.com/..." required>
    </div>
    <div class="form-group">
      <label class="form-label">
        <span class="lang-en">Notes (optional)</span>
        <span class="lang-th">หมายเหตุ (ถ้ามี)</span>
      </label>
      <input class="form-input" type="text" name="doc_notes" placeholder="">
    </div>
    <button class="btn-primary" type="submit">
      <span class="lang-en">Submit Document Link</span>
      <span class="lang-th">ส่งลิงก์เอกสาร</span>
    </button>
    <div id="uploadMsg"></div>
  </form>
</div>

<div style="background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:20px;margin-top:16px">
  <p style="font-size:13px;font-weight:600;margin-bottom:8px">
    <span class="lang-en">Or send directly via LINE</span>
    <span class="lang-th">หรือส่งตรงผ่าน LINE</span>
  </p>
  <p style="font-size:12px;color:#aaa;margin-bottom:12px">
    <span class="lang-en">You can also send documents directly to your consultant on LINE.</span>
    <span class="lang-th">คุณสามารถส่งเอกสารให้ที่ปรึกษาโดยตรงผ่าน LINE</span>
  </p>
  <a href="https://line.me/R/ti/p/@{LINE_HANDLE}" target="_blank" class="btn-secondary btn-sm">LINE: @{LINE_HANDLE}</a>
</div>

<script>
async function submitUpload(e) {{
  e.preventDefault();
  var f = e.target;
  var msg = document.getElementById('uploadMsg');
  msg.innerHTML = '<p style="color:#aaa;font-size:13px;margin-top:12px">Submitting…</p>';
  try {{
    var resp = await fetch('/upload-doc', {{
      method:'POST',
      headers:{{'Content-Type':'application/x-www-form-urlencoded'}},
      body: new URLSearchParams(new FormData(f)).toString()
    }});
    var data = await resp.json();
    if(data.ok) {{
      msg.innerHTML = '<div class="form-success">✅ Document link submitted. Your consultant has been notified.</div>';
      f.reset();
    }} else {{
      msg.innerHTML = '<div class="form-error">❌ ' + (data.error||'Something went wrong') + '</div>';
    }}
  }} catch(err) {{
    msg.innerHTML = '<div class="form-error">❌ Network error. Please try again.</div>';
  }}
}}
</script>"""

# ── TAB: TOOLS ───────────────────────────────────────────────────────────────

def tab_tools(s):
    snum = stage_num(prop(s,"Stage") or "1")
    stage_names = ["Discovery","Profiling","Roadmap","Preparation","Transition"]
    stage_names_th = ["ค้นหา","วิเคราะห์","วางแผน","เตรียมสมัคร","เตรียมเดินทาง"]

    html = ""
    for st in range(1, 6):
        tools = STAGE_TOOLS.get(st, [])
        is_current = (st == snum)
        label_en = f"Stage {st}: {stage_names[st-1]}"
        label_th = f"ขั้นที่ {st}: {stage_names_th[st-1]}"
        badge = ' <span style="background:#B8962E;color:#1a1a1a;font-size:9px;padding:2px 8px;border-radius:10px;letter-spacing:0.08em;vertical-align:middle">YOUR STAGE</span>' if is_current else ""
        html += f'<div class="tool-stage-label"><span class="lang-en">{label_en}{badge}</span><span class="lang-th">{label_th}{badge}</span></div>'
        html += '<div class="grid-3">'
        for icon, name, url, desc in tools:
            html += f"""<div class="tool-card">
              <a href="{WEBSITE_URL}{url}" target="_blank">
                <div class="tool-icon">{icon}</div>
                <div class="tool-name">{name}</div>
                <div class="tool-desc">{desc}</div>
              </a>
            </div>"""
        html += '</div>'

    return f"""
<div class="card-cream" style="margin-bottom:28px">
  <p style="font-size:13px;color:#555;line-height:1.8">
    <span class="lang-en">All LINKEDU tools are available to you as a premium client. Each tool opens on our website — your results are yours to keep. To save or discuss results, message Satit via LINE.</span>
    <span class="lang-th">เครื่องมือทั้งหมดของ LINKEDU พร้อมให้คุณใช้งานในฐานะลูกค้าพรีเมียม เครื่องมือแต่ละอย่างจะเปิดบนเว็บไซต์ของเรา หากต้องการบันทึกหรือปรึกษาผล ติดต่อที่ปรึกษาผ่าน LINE</span>
  </p>
</div>
{html}
<div class="line-cta" style="margin-top:32px">
  <p class="lang-en">Completed a tool? Share your results with Satit.</p>
  <p class="lang-th">ทำเครื่องมือเสร็จแล้ว? แชร์ผลลัพธ์กับที่ปรึกษา</p>
  <div class="line-handle">LINE: @{LINE_HANDLE}</div>
  <a href="https://line.me/R/ti/p/@{LINE_HANDLE}" target="_blank" class="btn-primary">
    <span class="lang-en">Share on LINE</span><span class="lang-th">แชร์ผ่าน LINE</span>
  </a>
</div>"""

# ── PORTAL SHELL ─────────────────────────────────────────────────────────────

def portal_page(s, milestones, docs, svcs, academics, token):
    sid  = s["id"]
    name = prop(s,"Student Name")

    tabs_en = ["Profile","Overview","Journey","Schools","Recommendations","Documents","Tools","On-Course Reports"]
    tabs_th = ["โปรไฟล์","ภาพรวม","ไทม์ไลน์","โรงเรียน","คำแนะนำ","เอกสาร","เครื่องมือ","รายงานการเล่นสนาม"]
    tab_ids = ["profile","overview","journey","schools","recommendations","documents","tools","golf"]

    tab_buttons = "".join(
        f'<button class="tab-btn" id="btn-{tid}" onclick="showTab(\'{tid}\')">'
        f'<span class="lang-en">{en}</span><span class="lang-th">{th}</span>'
        f'</button>'
        for tid, en, th in zip(tab_ids, tabs_en, tabs_th)
    )

    panels = {
        "overview":        tab_overview(s, milestones, docs, svcs),
        "journey":         tab_journey(s, milestones),
        "schools":         tab_schools(s, milestones, token, svcs),
        "recommendations": tab_recommendations_v2(s, svcs, academics, milestones, prop),
        "profile":         tab_profile_full(s, academics),
        "documents":       tab_documents(s, docs, token, sid),
        "tools":           tab_tools(s),
        "golf":            tab_golf_reports(sid, name),
    }

    panels_html = "".join(
        f'<div id="tab-{tid}" class="tab-panel" style="display:none">{content}</div>'
        for tid, content in panels.items()
    )

    return f"""<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LINKEDU Portal — {name}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>{SHARED_CSS}
td{{padding:10px 12px;border-bottom:1px solid #ece7df;font-size:13px;color:#333}}
tr:last-child td{{border-bottom:none}}
</style>
</head>
<body>
<div class="topbar">
  {LOGO_DARK}
  <div class="topbar-right">
    <div class="lang-toggle">
      <button class="lang-btn" id="btn-en" onclick="setLang('en')">EN</button>
      <button class="lang-btn" id="btn-th" onclick="setLang('th')">TH</button>
    </div>
    <a class="topbar-exit" href="/">Exit</a>
  </div>
</div>

<div class="tabnav">{tab_buttons}</div>

<div class="container">
  {panels_html}
</div>

<script>
(function(){{
  var l = localStorage.getItem('linkedu-lang') || 'th';
  document.documentElement.setAttribute('lang', l);
  document.getElementById('btn-' + l).classList.add('active');
}})();

function setLang(l) {{
  document.documentElement.setAttribute('lang', l);
  localStorage.setItem('linkedu-lang', l);
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-' + l).classList.add('active');
}}

var _chartInited = false;
function showTab(id) {{
  document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).style.display = 'block';
  document.getElementById('btn-' + id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'profile' && !_chartInited && window.Chart && window._gradeChartData) {{
    _chartInited = true;
    var ctx = document.getElementById('gradeChart');
    if (ctx) {{
      new Chart(ctx, {{
        type: 'bar',
        data: {{
          labels: window._gradeChartData.labels,
          datasets: [{{
            label: 'Performance (0–100)',
            data: window._gradeChartData.data,
            backgroundColor: window._gradeChartData.colors,
            borderRadius: 6,
            borderSkipped: false,
          }}]
        }},
        options: {{
          plugins: {{ legend: {{ display: false }} }},
          scales: {{
            y: {{ min:0, max:100, ticks:{{ font:{{size:11}}, color:'#aaa' }}, grid:{{color:'#f0ebe2'}} }},
            x: {{ ticks:{{ font:{{size:11}}, color:'#555' }}, grid:{{display:false}} }}
          }}
        }}
      }});
    }}
  }}
}}

showTab('overview');
</script>
</body></html>"""

def error_page(msg):
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Error</title>
<style>body{{background:#f5f0e8;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:'Inter',sans-serif}}</style>
</head><body><div style="text-align:center">
<div style="font-size:32px;margin-bottom:16px">⚠️</div>
<p style="color:#ca6d6d;margin-bottom:16px">{msg}</p>
<a href="/" style="color:#B8962E">← Back</a>
</div></body></html>"""

# ── HTTP HANDLER ─────────────────────────────────────────────────────────────

class ReuseHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True

class PortalHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[portal] {self.address_string()} — {fmt % args}")

    def send_html(self, html, code=200):
        b = html.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type","text/html; charset=utf-8")
        self.send_header("Content-Length", len(b))
        self.end_headers()
        self.wfile.write(b)

    def send_json(self, data, code=200):
        b = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length", len(b))
        self.end_headers()
        self.wfile.write(b)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length).decode("utf-8")

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path in ("", "/"):
            self.send_html(login_page())
        elif path == "/analyst":
            self.send_html(analyst_app_html())
        elif path == "/golf-storage.js":
            self.serve_static_js("golf_storage.js")
        elif path == "/golf-api/students":
            self.serve_students_api()
        elif path == "/golf-api/rounds":
            qs  = urllib.parse.parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            sid = qs.get("student_id", [""])[0]
            self.send_json({"rounds": golf_get_rounds(sid)})
        elif path == "/golf-seed":
            self.send_html(golf_seed_page())
        elif path.startswith("/portal/"):
            token = path.split("/portal/")[1].upper().strip()
            self.render_portal(token)
        elif path.startswith("/pdf/"):
            self.serve_pdf(path[5:])
        else:
            self.send_html(error_page("Page not found."), 404)

    def do_POST(self):
        path = self.path.rstrip("/")
        if path == "/login":
            params = urllib.parse.parse_qs(self.read_body())
            token  = params.get("token", [""])[0].upper().strip()
            if not token:
                self.send_html(login_page("Please enter your token."))
                return
            self.send_response(302)
            self.send_header("Location", f"/portal/{token}")
            self.end_headers()
        elif path == "/golf-api/save-round":
            try:
                golf_save_round(json.loads(self.read_body()))
                self.send_json({"ok": True})
            except Exception as e:
                self.send_json({"ok": False, "error": str(e)})
        elif path == "/golf-api/clear-rounds":
            try:
                golf_clear_student(json.loads(self.read_body()).get("student_id",""))
                self.send_json({"ok": True})
            except Exception as e:
                self.send_json({"ok": False, "error": str(e)})
        elif path == "/upload-doc":
            params = urllib.parse.parse_qs(self.read_body())
            token  = params.get("token",[""])[0]
            sid    = params.get("sid",[""])[0]
            title  = params.get("doc_title",[""])[0]
            link   = params.get("doc_link",[""])[0]
            notes  = params.get("doc_notes",[""])[0]
            if not (sid and title and link):
                self.send_json({"ok":False,"error":"Missing fields"})
                return
            try:
                save_doc_link(sid, title, link, notes)
                self.send_json({"ok":True})
            except Exception as e:
                self.send_json({"ok":False,"error":str(e)})
        else:
            self.send_html(error_page("Not found."), 404)

    def serve_pdf(self, filename):
        # safety: only serve linkedu-report files from /tmp
        if not filename.startswith("linkedu-report-") or ".." in filename:
            self.send_html(error_page("Not allowed."), 403)
            return
        path = f"/tmp/{filename}"
        if not os.path.exists(path):
            self.send_html(error_page("PDF not found."), 404)
            return
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type","application/pdf")
        self.send_header("Content-Disposition", f'inline; filename="{filename}"')
        self.send_header("Content-Length", len(data))
        self.end_headers()
        self.wfile.write(data)

    def serve_static_js(self, filename):
        """Serve a JS file from the same directory as this script."""
        base = os.path.dirname(os.path.abspath(__file__))
        filepath = os.path.join(base, filename)
        # Safety: only serve known JS files
        allowed = {"golf_storage.js"}
        if filename not in allowed or not os.path.exists(filepath):
            self.send_html(error_page("Not found."), 404)
            return
        with open(filepath, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Content-Length", len(data))
        self.end_headers()
        self.wfile.write(data)

    def serve_students_api(self):
        """Return JSON list of students from Notion for analyst dropdown."""
        try:
            rows = qdb(DB["students"], sorts=[{"property": "Student Name", "direction": "ascending"}])
            students = []
            for r in rows:
                name = prop(r, "Student Name")
                if name:
                    students.append({"id": r["id"], "name": name})
            self.send_json({"students": students})
        except Exception as e:
            self.send_json({"students": [], "error": str(e)})

    def render_portal(self, token):
        student = load_student(token)
        if not student:
            self.send_html(login_page(f"Token '{token}' not found. Please check and try again."))
            return
        sid = student["id"]
        milestones, docs, svcs, academics = load_all(sid)
        html = portal_page(student, milestones, docs, svcs, academics, token)
        self.send_html(html)

# ── GOLF SEED PAGE ────────────────────────────────────────────────────────────

def golf_seed_page():
    """Injects 7 realistic demo rounds for Ping into localStorage, then links to the portal."""
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Golf Demo Seed</title>
<style>
body{background:#111;color:#eee;font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:32px;text-align:center}
h2{color:#B8962E;margin-bottom:8px}
p{color:#888;margin-bottom:24px;font-size:14px}
.btn{background:#B8962E;color:#1a1a1a;font-weight:700;padding:14px 32px;border-radius:8px;border:none;cursor:pointer;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;display:inline-block}
#status{color:#5a9a5a;font-size:13px;margin-top:16px;min-height:20px}
</style>
</head>
<body>
<h2>LINKEDU GOLF — DEMO DATA</h2>
<p>Seeds 7 rounds for Ping (Jan–Mar) into this browser's storage,<br>then takes you straight to the parent portal Golf tab.</p>
<button class="btn" onclick="seed()">Seed &amp; Open Portal</button>
<div id="status"></div>

<script src="/golf-storage.js"></script>
<script>
const PING_ID = "31d9d89c-abdc-817e-a18d-f238c34238d1";

function mkRound(id, date, course, tees, roundType, weather, conditions, holes, coachRec, debrief) {
  const round = {
    roundId: id, studentId: PING_ID, studentName: "Ping",
    date, course, tees, roundType, weather, conditions,
    scorecardPhotoUrl: null, holes,
    roundAudioUrl: null, coachRecommendation: coachRec, debriefNotes: debrief, computed: null
  };
  round.computed = GolfStorage.computeRoundStats(round);
  return round;
}

function mkHole(num, par, shots, putts, mental, note) {
  return { holeNumber: num, par, shots, score: shots.length, putts, mentalRating: mental, noteText: note, noteAudioUrl: null, media: [] };
}

function s(n, club, result, quality, contact) {
  return { shotNumber: n, club, result, quality, contactType: contact || "Normal" };
}

async function seed() {

  // ── Round 1: Panya Indra, 2026-01-10, score 96 (+24) — early season ──────
  const r1 = mkRound("r_demo01", "2026-01-10T08:00:00.000Z", "Panya Indra Golf Club", "Yellow", "Practice", "Sunny", "Normal", [
    mkHole(1, 4,[s(1,"Dr","Rough","Mishit"),s(2,"6i","Rough","Mishit"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,2,""),
    mkHole(2, 3,[s(1,"8i","Rough","Mishit"),s(2,"PW","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(3, 4,[s(1,"Dr","OB","Mishit"),s(2,"Dr","Fairway","OK"),s(3,"7i","Rough","Mishit"),s(4,"GW","Green","OK"),s(5,"Putter","Holed","Pure"),s(6,"Putter","Holed","Pure")],2,3,"OB off tee, very costly"),
    mkHole(4, 5,[s(1,"Dr","Fairway","OK"),s(2,"5i","Rough","Mishit"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure"),s(6,"Putter","Holed","Pure")],3,2,""),
    mkHole(5, 4,[s(1,"Dr","Bunker","Mishit"),s(2,"SW","Rough","OK"),s(3,"PW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,3,""),
    mkHole(6, 3,[s(1,"7i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(7, 4,[s(1,"Dr","Fairway","OK"),s(2,"6i","Rough","Mishit"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,2,""),
    mkHole(8, 4,[s(1,"Dr","Rough","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(9, 5,[s(1,"Dr","Fairway","OK"),s(2,"5i","Rough","Mishit"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure"),s(6,"Putter","Holed","Pure")],3,2,""),
    mkHole(10,4,[s(1,"Dr","Rough","Mishit"),s(2,"6i","Rough","Mishit"),s(3,"SW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,2,""),
    mkHole(11,3,[s(1,"8i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(12,4,[s(1,"Dr","Fairway","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(13,5,[s(1,"Dr","Fairway","OK"),s(2,"3W","Rough","Mishit"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure"),s(6,"Putter","Holed","Pure")],3,2,""),
    mkHole(14,4,[s(1,"Dr","Rough","Mishit"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(15,3,[s(1,"9i","Rough","Mishit"),s(2,"PW","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(16,4,[s(1,"Dr","Fairway","OK"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(17,4,[s(1,"Dr","Rough","OK"),s(2,"8i","Rough","Mishit"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,2,""),
    mkHole(18,5,[s(1,"Dr","Fairway","OK"),s(2,"5i","Fairway","OK"),s(3,"9i","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,1,""),
  ], "Ping is working hard but consistency is the main challenge. Too many double bogeys from poor tee shots. Focus for next 2 weeks: driver swing path drills and pre-shot routine.",
  "First round of the year — expected some rust. Good effort overall. Discussed staying patient on bad holes rather than forcing recovery shots.");

  // ── Round 2: St. Andrews 2000, 2026-01-22, score 93 (+21) ───────────────
  const r2 = mkRound("r_demo02", "2026-01-22T08:30:00.000Z", "St. Andrews 2000", "Yellow", "Practice", "Cloudy", "Normal", [
    mkHole(1, 4,[s(1,"Dr","Fairway","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(2, 3,[s(1,"8i","Rough","Mishit"),s(2,"PW","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(3, 4,[s(1,"Dr","Rough","Mishit"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(4, 5,[s(1,"Dr","Fairway","OK"),s(2,"3W","Fairway","OK"),s(3,"9i","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,1,""),
    mkHole(5, 4,[s(1,"Dr","Bunker","Mishit"),s(2,"SW","Rough","OK"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,3,"Bunker again — frustration building"),
    mkHole(6, 3,[s(1,"6i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(7, 4,[s(1,"Dr","Fairway","OK"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(8, 4,[s(1,"Dr","OB","Mishit"),s(2,"Dr","Rough","OK"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure"),s(6,"Putter","Holed","Pure")],3,3,"OB again — driver unreliable under pressure"),
    mkHole(9, 5,[s(1,"Dr","Fairway","OK"),s(2,"5i","Fairway","OK"),s(3,"8i","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,2,""),
    mkHole(10,4,[s(1,"Dr","Fairway","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(11,3,[s(1,"9i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(12,4,[s(1,"Dr","Fairway","OK"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(13,5,[s(1,"Dr","Fairway","OK"),s(2,"4i","Rough","Mishit"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure"),s(6,"Putter","Holed","Pure")],3,2,""),
    mkHole(14,4,[s(1,"Dr","Rough","OK"),s(2,"8i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(15,3,[s(1,"7i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(16,4,[s(1,"Dr","Fairway","Pure"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(17,4,[s(1,"Dr","Fairway","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(18,5,[s(1,"Dr","Fairway","OK"),s(2,"3W","Rough","OK"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,1,""),
  ], "Marginal improvement. OB on hole 8 was avoidable — player chose driver when 3W was the smarter play. Putting improved (34 putts vs 38 last round). Continue driver drills.",
  "Ping handled frustration better today despite the OB. Discussed course management and when to take driver vs lay up. Good attitude in back 9.");

  // ── Round 3: Thana City Golf, 2026-02-05, score 90 (+18) ─────────────────
  const r3 = mkRound("r_demo03", "2026-02-05T07:45:00.000Z", "Thana City Golf & Country Club", "Yellow", "Practice", "Sunny", "Normal", [
    mkHole(1, 4,[s(1,"Dr","Fairway","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(2, 3,[s(1,"8i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(3, 4,[s(1,"Dr","Rough","OK"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(4, 5,[s(1,"Dr","Fairway","OK"),s(2,"3W","Fairway","OK"),s(3,"9i","Green","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(5, 4,[s(1,"Dr","Rough","Mishit"),s(2,"GW","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],3,2,"3-putt bogey after recovery"),
    mkHole(6, 3,[s(1,"6i","Green","Pure"),s(2,"Putter","Holed","Pure")],2,1,""),
    mkHole(7, 4,[s(1,"Dr","Fairway","OK"),s(2,"5i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(8, 4,[s(1,"Dr","Fairway","OK"),s(2,"6i","Rough","Mishit"),s(3,"SW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,2,""),
    mkHole(9, 5,[s(1,"Dr","Fairway","Pure"),s(2,"3W","Fairway","OK"),s(3,"8i","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,1,""),
    mkHole(10,4,[s(1,"Dr","Fairway","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(11,3,[s(1,"7i","Rough","Mishit"),s(2,"PW","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(12,4,[s(1,"Dr","Fairway","OK"),s(2,"6i","Green","Pure"),s(3,"Putter","Holed","Pure")],1,1,"Birdie — clean hole"),
    mkHole(13,5,[s(1,"Dr","Rough","OK"),s(2,"5i","Fairway","OK"),s(3,"PW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,1,""),
    mkHole(14,4,[s(1,"Dr","Fairway","OK"),s(2,"8i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(15,3,[s(1,"9i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(16,4,[s(1,"Dr","Fairway","Pure"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(17,4,[s(1,"Dr","Rough","Mishit"),s(2,"GW","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],3,2,"3-putt — pace control issue on downhill"),
    mkHole(18,5,[s(1,"Dr","Fairway","OK"),s(2,"3W","Fairway","OK"),s(3,"9i","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,1,""),
  ], "Good progress — no OB incidents today. 3-putts on 5 and 17 are the main leaks. Tee shot shape is becoming more reliable. Start focusing on pace control on breaking putts.",
  "Ping was noticeably calmer today. The 3-breath reset routine is working. Discussed green-reading approach for fast downhill putts — use more break, less pace.");

  // ── Round 4: Royal Gems Golf City, 2026-02-14, score 87 (+15) ───────────
  const r4 = mkRound("r_demo04", "2026-02-14T08:15:00.000Z", "Royal Gems Golf City", "Yellow", "Club Competition", "Sunny", "Normal", [
    mkHole(1, 4,[s(1,"Dr","Fairway","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(2, 3,[s(1,"8i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(3, 4,[s(1,"Dr","Fairway","OK"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(4, 5,[s(1,"Dr","Fairway","Pure"),s(2,"3W","Fairway","OK"),s(3,"9i","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,1,""),
    mkHole(5, 4,[s(1,"Dr","Rough","OK"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(6, 3,[s(1,"9i","Bunker","Mishit"),s(2,"SW","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,"Bunker — SW improving but still costing strokes"),
    mkHole(7, 4,[s(1,"Dr","Fairway","OK"),s(2,"5i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(8, 4,[s(1,"Dr","Fairway","Pure"),s(2,"6i","Green","Pure"),s(3,"Putter","Holed","Pure")],1,1,"Birdie — best tee shot of the day"),
    mkHole(9, 5,[s(1,"Dr","Fairway","OK"),s(2,"4i","Fairway","OK"),s(3,"PW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,1,""),
    mkHole(10,4,[s(1,"Dr","Rough","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(11,3,[s(1,"7i","Green","Pure"),s(2,"Putter","Holed","Pure")],2,1,""),
    mkHole(12,4,[s(1,"Dr","Fairway","OK"),s(2,"8i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(13,4,[s(1,"Dr","Penalty","Mishit"),s(2,"6i","Fairway","OK"),s(3,"PW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,3,"Water off tee — uncharacteristic, course management lapse"),
    mkHole(14,5,[s(1,"Dr","Fairway","OK"),s(2,"3W","Fairway","OK"),s(3,"8i","Green","OK"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(15,3,[s(1,"9i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(16,4,[s(1,"Dr","Fairway","Pure"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(17,4,[s(1,"Dr","Fairway","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(18,5,[s(1,"Dr","Fairway","OK"),s(2,"3W","Fairway","OK"),s(3,"9i","Green","OK"),s(4,"Putter","Holed","Pure")],2,1,""),
  ], "Best round to date in a competition context. Birdie on 8 showed real ability under pressure. The penalty on 13 was avoidable — reinforce course management on water holes. Overall very encouraging.",
  "Competition helped Ping focus. Discussed the penalty incident — agreed to always lay up when water is in play and score is going well. Proud of the back 9 composure after the double.");

  // ── Round 5: Royal Gems Golf City, 2026-02-22, score 89 (+17) ─────────────
  const r5 = mkRound("r_demo05", "2026-02-22T08:30:00.000Z", "Royal Gems Golf City", "Yellow", "Practice", "Sunny", "Normal", [
    mkHole(1, 4,[s(1,"Dr","Fairway","Pure"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(2, 3,[s(1,"8i","Rough","OK"),s(2,"PW","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(3, 4,[s(1,"Dr","Rough","Mishit"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure")],2,2,"Lost tee shot right, recovered well"),
    mkHole(4, 5,[s(1,"Dr","Fairway","Pure"),s(2,"3W","Fairway","OK"),s(3,"9i","Green","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(5, 4,[s(1,"Dr","Bunker","Mishit"),s(2,"SW","Rough","OK"),s(3,"PW","Green","OK"),s(4,"Putter","Holed","Pure")],2,3,"Temper after bunker — needs reset routine"),
    mkHole(6, 3,[s(1,"6i","Green","Pure"),s(2,"Putter","Holed","Pure")],2,1,""),
    mkHole(7, 4,[s(1,"Dr","Fairway","OK"),s(2,"5i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(8, 4,[s(1,"Dr","OB","Mishit"),s(2,"Dr","Fairway","OK"),s(3,"6i","Rough","Mishit"),s(4,"GW","Green","OK"),s(5,"Putter","Holed","Pure"),s(6,"Putter","Holed","Pure")],2,3,"OB off tee"),
    mkHole(9, 5,[s(1,"Dr","Fairway","Pure"),s(2,"3W","Fairway","OK"),s(3,"8i","Green","OK"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(10,4,[s(1,"Dr","Fairway","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(11,3,[s(1,"7i","Rough","Mishit"),s(2,"PW","Green","OK"),s(3,"Putter","Holed","Pure")],2,2,""),
    mkHole(12,4,[s(1,"Dr","Fairway","OK"),s(2,"6i","Green","Pure"),s(3,"Putter","Holed","Pure")],1,1,"Birdie"),
    mkHole(13,5,[s(1,"Dr","Rough","OK"),s(2,"5i","Fairway","OK"),s(3,"PW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,1,""),
    mkHole(14,4,[s(1,"Dr","Fairway","Pure"),s(2,"8i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(15,3,[s(1,"9i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(16,4,[s(1,"Dr","Fairway","OK"),s(2,"7i","Rough","Mishit"),s(3,"PW","Green","OK"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(17,4,[s(1,"Dr","Fairway","Pure"),s(2,"6i","Green","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(18,5,[s(1,"Dr","Fairway","OK"),s(2,"3W","Rough","Mishit"),s(3,"SW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,1,""),
  ], "Slight step back today — OB on 8 resurfaced. This is a known weak point under fatigue. Continue driver path drills, particularly for the late-round holes.",
  "Ping acknowledged tiredness by hole 7. Discussed pre-round warmup routine to build stamina. Good attitude throughout despite the setback.");

  // ── Round 6: Nikanti Golf Club, 2026-03-01, score 85 (+13) ───────────────
  const r6 = mkRound("r_demo06", "2026-03-01T07:45:00.000Z", "Nikanti Golf Club", "Yellow", "Club Competition", "Cloudy", "Wet", [
    mkHole(1, 4,[s(1,"Dr","Fairway","Pure"),s(2,"8i","Green","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(2, 4,[s(1,"Dr","Rough","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(3, 3,[s(1,"9i","Green","OK"),s(2,"Putter","Holed","Pure")],2,1,""),
    mkHole(4, 5,[s(1,"Dr","Fairway","Pure"),s(2,"5i","Fairway","OK"),s(3,"GW","Green","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(5, 4,[s(1,"Dr","Fairway","OK"),s(2,"6i","Rough","Mishit"),s(3,"GW","Green","OK"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(6, 3,[s(1,"8i","Bunker","Mishit"),s(2,"SW","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,"Bunker on par 3"),
    mkHole(7, 4,[s(1,"Dr","Fairway","Pure"),s(2,"5i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(8, 4,[s(1,"Dr","Fairway","OK"),s(2,"6i","Green","Pure"),s(3,"Putter","Holed","Pure")],1,1,"Birdie — excellent approach"),
    mkHole(9, 5,[s(1,"Dr","Fairway","Pure"),s(2,"3W","Fairway","OK"),s(3,"9i","Green","OK"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(10,4,[s(1,"Dr","Rough","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(11,3,[s(1,"7i","Green","Pure"),s(2,"Putter","Holed","Pure")],2,1,""),
    mkHole(12,4,[s(1,"Dr","Fairway","OK"),s(2,"8i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(13,4,[s(1,"Dr","Penalty","Mishit"),s(2,"6i","Fairway","OK"),s(3,"PW","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,3,"Water off tee — double bogey"),
    mkHole(14,5,[s(1,"Dr","Fairway","Pure"),s(2,"3W","Fairway","OK"),s(3,"PW","Green","OK"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(15,3,[s(1,"9i","Green","OK"),s(2,"Putter","Holed","Pure")],2,1,""),
    mkHole(16,4,[s(1,"Dr","Fairway","Pure"),s(2,"7i","Green","Pure"),s(3,"Putter","Holed","Pure")],1,1,"Best iron of the day — birdie"),
    mkHole(17,4,[s(1,"Dr","Rough","Mishit"),s(2,"GW","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(18,5,[s(1,"Dr","Fairway","OK"),s(2,"5i","Fairway","OK"),s(3,"8i","Green","OK"),s(4,"Putter","Holed","Pure")],2,1,""),
  ], "Solid round in wet conditions — shows real mental toughness. Two birdies. Penalty on 13 is a recurring pattern on this hole — suggest a specific game plan (always 3W, always aim left). Putting improving noticeably.",
  "Ping was pleased with the birdies and stayed composed after the double on 13. Wet conditions make this result even more impressive. Reviewed the 13th hole strategy for next time.");

  // ── Round 7: Alpine Golf Club, 2026-03-08, score 82 (+10) ────────────────
  const r7 = mkRound("r_demo07", "2026-03-08T08:00:00.000Z", "Alpine Golf Club", "Yellow", "Ranked Tournament", "Sunny", "Firm & Fast", [
    mkHole(1, 4,[s(1,"Dr","Fairway","Pure"),s(2,"7i","Green","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(2, 3,[s(1,"8i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(3, 4,[s(1,"Dr","Fairway","Pure"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(4, 5,[s(1,"Dr","Fairway","Pure"),s(2,"3W","Fairway","OK"),s(3,"GW","Green","Pure"),s(4,"Putter","Holed","Pure")],1,1,"Eagle attempt — tap-in birdie"),
    mkHole(5, 4,[s(1,"Dr","Rough","OK"),s(2,"7i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(6, 3,[s(1,"9i","Green","Pure"),s(2,"Putter","Holed","Pure")],2,1,""),
    mkHole(7, 4,[s(1,"Dr","Fairway","OK"),s(2,"5i","Rough","Mishit"),s(3,"SW","Green","OK"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(8, 4,[s(1,"Dr","Fairway","Pure"),s(2,"8i","Green","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(9, 5,[s(1,"Dr","Fairway","OK"),s(2,"4i","Fairway","OK"),s(3,"PW","Green","OK"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(10,4,[s(1,"Dr","Fairway","Pure"),s(2,"6i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(11,3,[s(1,"6i","Green","Pure"),s(2,"Putter","Holed","Pure")],1,1,"Birdie — composure excellent"),
    mkHole(12,4,[s(1,"Dr","Bunker","Mishit"),s(2,"SW","Fairway","OK"),s(3,"7i","Green","OK"),s(4,"Putter","Holed","Pure"),s(5,"Putter","Holed","Pure")],2,2,""),
    mkHole(13,5,[s(1,"Dr","Fairway","Pure"),s(2,"3W","Fairway","OK"),s(3,"8i","Green","OK"),s(4,"Putter","Holed","Pure")],2,1,""),
    mkHole(14,4,[s(1,"Dr","Fairway","OK"),s(2,"9i","Green","OK"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(15,3,[s(1,"7i","Green","OK"),s(2,"Putter","Holed","Pure"),s(3,"Putter","Holed","Pure")],2,1,""),
    mkHole(16,4,[s(1,"Dr","Fairway","Pure"),s(2,"5i","Green","Pure"),s(3,"Putter","Holed","Pure")],2,1,"Best driving day of the year"),
    mkHole(17,4,[s(1,"Dr","Rough","OK"),s(2,"8i","Green","OK"),s(3,"Putter","Holed","Pure"),s(4,"Putter","Holed","Pure")],2,2,""),
    mkHole(18,5,[s(1,"Dr","Fairway","Pure"),s(2,"3W","Fairway","Pure"),s(3,"9i","Green","Pure"),s(4,"Putter","Holed","Pure")],1,1,"Birdie to finish — outstanding"),
  ], "Personal best in a tournament. 96 → 82 in two months is exceptional progress. Driving accuracy is now a genuine strength. Next target: eliminate the 3-putt. Recommend fast-green putting practice twice a week before ranking events.",
  "Ping was calm and confident from hole 1. This is a different player compared to January. Discussed staying humble and maintaining the process. Very exciting trajectory — UK academy target is realistic.");

  const post = r => fetch('/golf-api/save-round', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)});
  await fetch('/golf-api/clear-rounds', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({student_id:PING_ID})});
  for (const r of [r1,r2,r3,r4,r5,r6,r7]) { await post(r); }
  document.getElementById('status').textContent = '✓ 7 rounds seeded. Redirecting...';
  setTimeout(() => { window.location.href = '/portal/YIFJXNUR'; }, 800);
}
</script>
</body>
</html>"""


# ── MAIN ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ReuseHTTPServer(("0.0.0.0", PORT), PortalHandler)
    print(f"✅  LinkedU Parent Portal v2 — http://127.0.0.1:{PORT}")
    print(f"    Test: http://127.0.0.1:{PORT}/portal/YIFJXNUR")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
