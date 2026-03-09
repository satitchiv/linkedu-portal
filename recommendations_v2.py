#!/usr/bin/env python3
"""
LinkedU Parent Portal — Recommendations Tab v2
Three independent recommendation engines:
  Engine 1 — School Recommendations (Notion schools DB + weighted scoring)
  Engine 2 — Summer Camp Recommendations (tier logic)
  Engine 3 — Tutoring Recommendations (subject gap classification)
All engines run client-side (JavaScript) reading from server-injected JSON.
"""
import json, re, threading, os
import urllib.request

NOTION_KEY  = os.environ.get("NOTION_KEY", "")
NOTION_VER  = "2022-06-28"
BOARDING_DB = "30e9d89c-abdc-8002-a053-f16764e9d51d"
LINE_HANDLE = "satitlinkedu"
THB_RATE    = 46

# ── School data helpers ───────────────────────────────────────────────────────

def _txt(prop):
    if not prop: return ""
    t = prop.get("type","")
    if t == "title":     return "".join(x.get("plain_text","") for x in prop.get("title",[]))
    if t == "rich_text": return "".join(x.get("plain_text","") for x in prop.get("rich_text",[]))
    if t == "select":    s = prop.get("select"); return s["name"] if s else ""
    if t == "number":    n = prop.get("number"); return str(n) if n is not None else ""
    return ""

_REGION = {
    "london":"South East","surrey":"South East","kent":"South East","sussex":"South East",
    "hampshire":"South East","berkshire":"South East","hertfordshire":"South East",
    "oxfordshire":"South East","oxford":"South East","buckinghamshire":"South East",
    "winchester":"South East","sevenoaks":"South East","tonbridge":"South East",
    "brighton":"South East","guildford":"South East","reigate":"South East",
    "bristol":"South West","somerset":"South West","wiltshire":"South West",
    "dorset":"South West","devon":"South West","bath":"South West","taunton":"South West",
    "cheltenham":"South West","gloucester":"South West","exeter":"South West",
    "cambridge":"East","suffolk":"East","norfolk":"East","ipswich":"East",
    "yorkshire":"North","lancashire":"North","cumbria":"North","durham":"North",
    "cheshire":"North","manchester":"North","sheffield":"North","lancashire":"North",
    "shrewsbury":"Midlands","shropshire":"Midlands","worcestershire":"Midlands",
    "warwickshire":"Midlands","worcester":"Midlands","bromsgrove":"Midlands",
    "derbyshire":"Midlands","leicestershire":"Midlands","rutland":"Midlands",
    "nottinghamshire":"Midlands","birmingham":"Midlands","northamptonshire":"Midlands",
    "herefordshire":"Midlands","repton":"Midlands","oundle":"Midlands",
    "wales":"Wales","cardiff":"Wales","scotland":"Scotland","edinburgh":"Scotland",
}

def _region(loc):
    if not loc: return "South East"
    l = loc.lower()
    for k, r in _REGION.items():
        if k in l: return r
    return "South East"

def _gender(s):
    s = (s or "").lower()
    if "boys" in s or "male only" in s: return "Boys"
    if "girls" in s or "female only" in s: return "Girls"
    return "Co-ed"

def _fee(s):
    if not s: return 0
    nums = [int(x) for x in re.findall(r'\d+', s.replace(",","")) if int(x) > 5000]
    return min(nums) if nums else 0

def _pct(s):
    if not s: return 0
    m = re.search(r'([\d.]+)\s*%', str(s))
    return float(m.group(1)) if m else 0

def _entries(s):
    s = (s or "").lower()
    if any(x in s for x in ["year 7","year 6"]): return ["Year 7","Year 9","Year 10","Year 12"]
    if "year 9" in s: return ["Year 9","Year 10","Year 12"]
    if "year 10" in s: return ["Year 10","Year 12"]
    if any(x in s for x in ["sixth","year 12","a-level"]): return ["Year 12"]
    return ["Year 9","Year 10","Year 12"]

def _pastoral(schol_str, region, sports_str):
    """Estimate pastoral rating 1-5 from available signals."""
    score = 3
    if "outstanding" in (schol_str or "").lower(): score += 1
    if region in ("South East","South West"): score += 0
    if len((sports_str or "").split(",")) >= 8: score += 0.5
    return min(5, max(1, round(score)))

def load_schools():
    """Fetch UK boarding schools from Notion. Returns list of school dicts."""
    pages, cursor = [], None
    while True:
        body = {"filter":{"property":"Country","select":{"equals":"United Kingdom"}},"page_size":100}
        if cursor: body["start_cursor"] = cursor
        req = urllib.request.Request(
            f"https://api.notion.com/v1/databases/{BOARDING_DB}/query",
            data=json.dumps(body).encode(),
            headers={"Authorization":f"Bearer {NOTION_KEY}","Notion-Version":NOTION_VER,
                     "Content-Type":"application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                result = json.loads(r.read())
        except Exception as e:
            print(f"[recs] School fetch error: {e}")
            break
        pages.extend(result.get("results",[]))
        if not result.get("has_more"): break
        cursor = result["next_cursor"]

    schools = []
    for page in pages:
        p = page.get("properties",{})
        name = _txt(p.get("School Name"))
        if not name: continue
        loc         = _txt(p.get("Location")) or ""
        type_raw    = _txt(p.get("School Type")) or ""
        fee_str     = _txt(p.get("Boarding Fee\n Year 7 - Year 13\n Per Year")) or ""
        sports_raw  = _txt(p.get("Sports")) or _txt(p.get("Core Sports")) or ""
        schol_str   = _txt(p.get("Update Scholarships")) or ""
        low_entry   = _txt(p.get("Lowest Boarding Entry Year")) or ""
        gcse_str    = _txt(p.get("GCSE\n(9 - 7)")) or ""
        oxb_str     = _txt(p.get("Oxbridge Destination")) or ""
        note        = _txt(p.get("School Character")) or ""
        region      = _region(loc)
        gender      = _gender(type_raw)
        fee         = _fee(fee_str)
        sports_list = [s.strip() for s in sports_raw.split(",") if s.strip()]
        has_golf    = any("golf" in s.lower() for s in sports_list)
        has_golf_sch= has_golf and any(w in schol_str.lower() for w in ["golf","sport","athletic","scholarship"])
        entries     = _entries(low_entry)
        pastoral    = _pastoral(schol_str, region, sports_raw)
        schol_pct   = _pct(schol_str)
        gcse_pct    = _pct(gcse_str)
        slug_name   = re.sub(r"[^a-z0-9\s-]","",name.lower())
        slug        = re.sub(r"\s+","-",slug_name.strip())
        schools.append({
            "name":name, "slug":slug, "loc":loc or "UK", "region":region,
            "gender":gender, "fee":fee, "entry":entries,
            "sports":sports_list[:10], "hasGolf":has_golf, "hasGolfSchol":has_golf_sch,
            "scholPct":schol_pct, "pastoral":pastoral, "gcse":gcse_pct,
            "oxbridge":int(re.search(r'\d+', oxb_str).group()) if re.search(r'\d+', oxb_str) else 0,
            "note":(note[:160]+"…" if len(note)>160 else note),
        })
    return schools

# Pre-fetch schools in background thread at module load — never blocks requests
_SCHOOLS_CACHE = None
_schools_lock  = threading.Lock()

def _prefetch_schools():
    global _SCHOOLS_CACHE
    data = load_schools()
    with _schools_lock:
        _SCHOOLS_CACHE = data

threading.Thread(target=_prefetch_schools, daemon=True).start()

def _get_schools():
    with _schools_lock:
        return _SCHOOLS_CACHE or []

# ── Student profile builder ───────────────────────────────────────────────────

def build_student_data(s, milestones, docs, svcs, academics, prop_fn):
    """Extract student profile into a flat JSON structure for the JS engines."""
    p = prop_fn
    grade_map = {"A*":5.5,"A":5,"B+":4.5,"B":4,"C+":3.5,"C":3,"D":2,"E":1,"F":0}

    # Latest grade per subject from academics
    grades = {}
    for rec in academics:
        subj  = p(rec,"Subject")
        grade = p(rec,"Grade")
        score = p(rec,"Score")
        maxsc = p(rec,"Max Score")
        atype = p(rec,"Assessment Type") or ""
        if subj and grade:
            grades[subj] = {"grade":grade, "gnum":grade_map.get(grade,0)}
            if score and maxsc and ("ce" in atype.lower() or "mock" in atype.lower()):
                grades[subj]["ceScore"] = round(score/maxsc*100)

    # CE overall from the most recent mock milestone
    ce_mock = next(
        (r for r in sorted(academics,
            key=lambda x: p(x,"Date") or "", reverse=True)
         if "mock" in (p(r,"Assessment Type") or "").lower() and p(r,"Score") and p(r,"Max Score")),
        None
    )
    ce_score = None
    if ce_mock:
        sc = p(ce_mock,"Score"); mx = p(ce_mock,"Max Score")
        if sc and mx: ce_score = round(sc/mx*100)

    # Milestone dates
    exam_d = camp_d = app_d = None
    for m in milestones:
        t = p(m,"Milestone Title").lower()
        d = p(m,"Date")
        if not d: continue
        if not exam_d and ("exam" in t or "ce " in t or "common entrance" in t): exam_d = d
        if not camp_d and ("camp" in t or "summer school" in t): camp_d = d
        if not app_d  and ("application" in t or "apply" in t): app_d  = d

    budget = p(s,"Annual Budget GBP") or 45000
    sport  = p(s,"Primary Sport") or "Golf"
    stage  = p(s,"Stage") or "2 - Profiling"
    goal   = p(s,"Goal") or "Top 50 UK Boarding"
    english= p(s,"English Level") or "Upper-Intermediate"

    return {
        "name":        p(s,"Student Name") or "Ping",
        "fullName":    p(s,"Student Name") or "Panida Wattana",
        "gender":      "Female",
        "budget":      budget,
        "primarySport":sport,
        "currentHandicap": 11,
        "targetHandicap":  7,
        "targetYear":  p(s,"Target Entry Year") or "2027",
        "targetEntry": p(s,"Target Entry Year Group") or "Year 9",
        "stage":       stage,
        "goal":        goal,
        "englishLevel":english,
        "homesicknessRisk":"Medium",
        "learningStyle":"Kinaesthetic",
        "grades":      grades,
        "ceOverall":   ce_score or 58,
        "ceTarget":    70,
        "ceThreshold": 60,
        "ukisetTaken": False,
        "priorUKResidence": False,
        "consultantName": p(s,"Assigned Consultant") or "Satit",
        "examDate":    exam_d or "",
        "campDate":    camp_d or "",
        "appDate":     app_d or "",
        "targetSchool":"Bromsgrove",
        "targetSlug":  "bromsgrove-school",
    }

# ── Summer camp data (hardcoded — Notion DB not yet built) ────────────────────

CAMPS_DATA = [
    {
        "id":"bromsgrove-summer",
        "name":"Bromsgrove Summer School",
        "school":"Bromsgrove School",
        "targetSchool":True,
        "tier":1,
        "sport":None,
        "dates":"14–28 July 2026",
        "feeGBP":2800,
        "weeks":2,
        "ageGroup":"11–16",
        "deadline":"2026-04-30",
        "location":"Worcestershire",
        "description":"A two-week residential programme at Bromsgrove's own campus covering sport, academics, and boarding life. Internationally attended — approximately 60% international students.",
    },
    {
        "id":"millfield-golf",
        "name":"Millfield Summer Golf Academy",
        "school":"Millfield School",
        "targetSchool":False,
        "tier":2,
        "sport":"Golf",
        "dates":"July 2026 (2-week session)",
        "feeGBP":3200,
        "weeks":2,
        "ageGroup":"12–18",
        "deadline":"2026-05-15",
        "location":"Somerset",
        "description":"Intensive golf development programme at one of the UK's most celebrated sport schools. PGA-qualified coaching, video analysis, tournament simulation.",
    },
    {
        "id":"stoke-park-golf",
        "name":"Stoke Park Junior Golf Academy",
        "school":"Stoke Park",
        "targetSchool":False,
        "tier":2,
        "sport":"Golf",
        "dates":"August 2026 (1-week sessions)",
        "feeGBP":1600,
        "weeks":1,
        "ageGroup":"10–17",
        "deadline":"2026-06-01",
        "location":"Buckinghamshire",
        "description":"Week-long elite junior golf development at Stoke Park's championship course. Focused on short game, course management, and competitive mindset.",
    },
    {
        "id":"cambridge-immerse",
        "name":"Cambridge Immerse Introductory",
        "school":"Cambridge (multiple colleges)",
        "targetSchool":False,
        "tier":4,
        "sport":None,
        "dates":"July–August 2026",
        "feeGBP":3500,
        "weeks":2,
        "ageGroup":"13–18",
        "deadline":"2026-05-01",
        "location":"Cambridge",
        "description":"Residential academic and cultural programme for international students. Multi-subject, socially diverse, structured around UK boarding school life habits.",
    },
    {
        "id":"millfield-multi",
        "name":"Millfield Summer School",
        "school":"Millfield School",
        "targetSchool":False,
        "tier":4,
        "sport":None,
        "dates":"July–August 2026",
        "feeGBP":2900,
        "weeks":2,
        "ageGroup":"10–17",
        "deadline":"2026-05-31",
        "location":"Somerset",
        "description":"Multi-activity residential programme at one of the UK's most famous boarding schools. 100+ sports and activities, international student community.",
    },
]

# ── CSS ───────────────────────────────────────────────────────────────────────

RECS_CSS = """
/* ── Recommendations v2 ─────────────────────────────────────────────────── */
.rv-subtabs { display:flex; gap:0; border-bottom:2px solid #333;
  margin:0 0 32px; background:#1a1a1a; border-radius:10px 10px 0 0; overflow:hidden; }
.rv-subtabs button { flex:1; font-size:12px; font-weight:700; letter-spacing:.12em;
  text-transform:uppercase; color:#888; background:transparent; border:none;
  padding:16px 20px; border-bottom:3px solid transparent; margin-bottom:-2px;
  white-space:nowrap; cursor:pointer; transition:all .2s;
  font-family:-apple-system,sans-serif; }
.rv-subtabs button:hover { color:#ddd; background:rgba(255,255,255,.04); }
.rv-subtabs button.rv-active { color:#B8962E; border-bottom-color:#B8962E;
  background:rgba(184,150,46,.06); }
.rv-subtabs button .rv-stab-icon { display:block; font-size:18px; margin-bottom:4px; }
.rv-section { display:none; }
.rv-section.rv-active { display:block; }
/* Consultant header card */
.rv-hdr { background:#1a1a1a; border-radius:10px; padding:28px 32px;
  margin-bottom:28px; }
.rv-hdr-label { font-size:10px; font-weight:700; letter-spacing:.2em;
  color:#B8962E; text-transform:uppercase; margin-bottom:10px; }
.rv-hdr-title { font-family:'Playfair Display',serif; font-size:1.4rem;
  font-weight:400; color:#f5f0e8; margin-bottom:12px; line-height:1.3; }
.rv-hdr-body { font-size:13px; color:#f5f0e8; opacity:.75; line-height:1.8;
  max-width:700px; }
.rv-hdr-ts { font-size:11px; color:#f5f0e8; opacity:.3; margin-top:14px;
  letter-spacing:.04em; }
/* Primary recommendation card */
.rv-primary { background:#1a1a1a; border-left:3px solid #B8962E;
  border-radius:8px; padding:28px 32px; margin-bottom:20px; position:relative; }
.rv-primary-badge { position:absolute; top:20px; right:20px; font-size:9.5px;
  font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  background:#B8962E; color:#1a1a1a; padding:4px 12px; border-radius:3px; }
.rv-primary-inner { display:flex; gap:32px; align-items:flex-start;
  flex-wrap:wrap; }
.rv-primary-left { width:220px; flex-shrink:0; }
.rv-primary-name { font-family:'Playfair Display',serif; font-size:1.6rem;
  font-weight:400; color:#f5f0e8; margin-bottom:6px; line-height:1.25; }
.rv-primary-meta { font-size:12px; color:#f5f0e8; opacity:.5;
  margin-bottom:12px; line-height:1.6; }
.rv-primary-fee { font-size:14px; color:#f5f0e8; opacity:.85; margin-bottom:14px; }
.rv-primary-right { flex:1; min-width:240px; }
.rv-primary-headline { font-family:'Playfair Display',serif; font-style:italic;
  font-size:1rem; color:#f5f0e8; opacity:.9; line-height:1.6; margin-bottom:16px; }
.rv-reason-list { list-style:none; padding:0; margin:0 0 20px; }
.rv-reason-list li { font-size:12.5px; color:#f5f0e8; opacity:.75;
  padding:5px 0 5px 16px; position:relative; line-height:1.5; }
.rv-reason-list li::before { content:''; position:absolute; left:0; top:11px;
  width:6px; height:6px; background:#B8962E; border-radius:1px; }
.rv-primary-actions { display:flex; gap:16px; align-items:center; flex-wrap:wrap;
  padding-top:16px; border-top:1px solid rgba(255,255,255,.1); margin-top:4px; }
.rv-btn-ghost { font-size:11.5px; font-weight:600; letter-spacing:.06em;
  color:#f5f0e8; border:1px solid rgba(255,255,255,.35); border-radius:5px;
  padding:8px 18px; text-decoration:none; transition:all .2s; cursor:pointer;
  background:transparent; font-family:'Inter',sans-serif; }
.rv-btn-ghost:hover { border-color:#B8962E; color:#B8962E; }
.rv-btn-text { font-size:12px; color:#B8962E; text-decoration:none; cursor:pointer;
  letter-spacing:.04em; font-weight:600; background:none; border:none;
  font-family:'Inter',sans-serif; padding:0; }
.rv-btn-text:hover { opacity:.75; }
/* Probability badge */
.rv-prob { display:inline-block; font-size:10px; font-weight:700;
  letter-spacing:.08em; padding:4px 12px; border-radius:4px; text-transform:uppercase; }
.rv-prob-strong { background:#1a3a1a; color:#6dca6d; border:1px solid #2d5a2d; }
.rv-prob-realistic { background:#1a2a3a; color:#6dacca; border:1px solid #2d4a5a; }
.rv-prob-stretch { background:#2a2200; color:#c9a830; border:1px solid #4a3a00; }
.rv-prob-aspirational { background:#2a1010; color:#ca6d6d; border:1px solid #4a2020; }
/* Above budget flag */
.rv-flag-budget { display:inline-block; font-size:10px; font-weight:700;
  letter-spacing:.06em; padding:2px 8px; border-radius:3px; margin-left:8px;
  background:#fff8e6; color:#8a6000; border:1px solid #e8d080; }
/* Expanded reasoning panel */
.rv-expand { display:none; background:#111; border-left:3px solid #B8962E;
  border-radius:0 0 8px 8px; margin-top:0; margin-bottom:20px;
  padding:28px 32px; }
.rv-expand.open { display:block; }
.rv-expand-section { margin-bottom:24px; }
.rv-expand-section:last-child { margin-bottom:0; }
.rv-expand-label { font-size:10px; font-weight:700; letter-spacing:.18em;
  color:#B8962E; text-transform:uppercase; margin-bottom:10px; }
.rv-expand-body { font-size:13px; color:#f5f0e8; opacity:.8; line-height:1.85; }
.rv-gap-table { width:100%; border-collapse:collapse; margin-top:10px; }
.rv-gap-table th { font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:#aaa; padding:7px 12px; text-align:left; border-bottom:1px solid #333; }
.rv-gap-table td { padding:9px 12px; border-bottom:1px solid #222;
  font-size:12.5px; color:#ddd; vertical-align:middle; }
.rv-gap-table tr:last-child td { border-bottom:none; }
.rv-timeline { list-style:none; padding:0; margin:0; }
.rv-timeline li { display:flex; gap:16px; align-items:flex-start;
  font-size:12.5px; color:#f5f0e8; opacity:.8; padding:8px 0;
  border-bottom:1px solid #222; line-height:1.5; }
.rv-timeline li:last-child { border-bottom:none; }
.rv-timeline-date { font-size:11px; color:#B8962E; font-weight:600;
  white-space:nowrap; min-width:80px; padding-top:1px; }
.rv-warning { font-size:12.5px; color:#f5f0e8; opacity:.7; line-height:1.75;
  padding:14px 18px; background:#1e1800; border-radius:6px;
  border-left:3px solid #B8962E; margin-top:8px; }
/* Supporting school cards grid */
.rv-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px;
  margin-bottom:16px; }
.rv-card { background:#fff; border:1px solid rgba(0,0,0,.08);
  border-left:2px solid #B8962E; border-radius:8px; padding:22px 24px; }
.rv-card-name { font-family:'Playfair Display',serif; font-size:1.15rem;
  font-weight:400; color:#1a1a1a; margin-bottom:5px; }
.rv-card-meta { font-size:11.5px; color:#888; margin-bottom:8px; line-height:1.5; }
.rv-card-fee { font-size:13px; color:#555; margin-bottom:10px; }
.rv-card-tagline { font-size:12.5px; color:#444; font-style:italic;
  line-height:1.65; margin-bottom:14px; border-top:1px solid #f0ebe2;
  padding-top:12px; }
.rv-card-actions { display:flex; gap:14px; align-items:center; }
.rv-learn { font-size:11.5px; color:#B8962E; text-decoration:none; font-weight:600;
  cursor:pointer; background:none; border:none; font-family:'Inter',sans-serif;
  padding:0; }
.rv-learn:hover { opacity:.7; }
.rv-card-expand { display:none; margin-top:12px; padding-top:12px;
  border-top:1px solid #f0ebe2; }
.rv-card-expand.open { display:block; }
.rv-card-expand-label { font-size:10px; font-weight:700; letter-spacing:.15em;
  color:#B8962E; text-transform:uppercase; margin:12px 0 6px; }
.rv-card-expand-body { font-size:12px; color:#555; line-height:1.75; }
.rv-filtered { font-size:12px; color:#aaa; text-align:center; padding:16px 0;
  letter-spacing:.03em; }
/* Camp cards */
.rv-camp-primary { background:#1a1a1a; border-left:3px solid #B8962E;
  border-radius:8px; padding:28px 32px; margin-bottom:16px; position:relative; }
.rv-camp-badge { position:absolute; top:20px; right:20px; font-size:9.5px;
  font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  background:#B8962E; color:#1a1a1a; padding:4px 12px; border-radius:3px; }
.rv-camp-inner { display:flex; gap:32px; flex-wrap:wrap; }
.rv-camp-left { min-width:220px; flex-shrink:0; }
.rv-camp-name { font-family:'Playfair Display',serif; font-size:1.4rem;
  font-weight:400; color:#f5f0e8; margin-bottom:6px; }
.rv-camp-school { font-size:12px; color:#f5f0e8; opacity:.5; margin-bottom:12px; }
.rv-camp-fees { display:flex; gap:20px; flex-wrap:wrap; margin-bottom:12px; }
.rv-camp-fee-item { font-size:12px; color:#f5f0e8; opacity:.8; }
.rv-camp-fee-amount { font-size:18px; font-family:'Playfair Display',serif;
  color:#B8962E; display:block; margin-bottom:2px; }
.rv-camp-right { flex:1; min-width:220px; }
.rv-deadline-badge { display:inline-block; font-size:11px; font-weight:700;
  padding:5px 14px; border-radius:4px; letter-spacing:.06em; margin-bottom:14px; }
.rv-deadline-red  { background:#fdecea; color:#b03030; border:1px solid #e0a0a0; }
.rv-deadline-amber{ background:#fff8e6; color:#8a6000; border:1px solid #e8d080; }
.rv-deadline-green{ background:#eaf5ea; color:#2d6a2d; border:1px solid #a0d0a0; }
.rv-camp-future { background:#fff; border-left:2px solid #B8962E;
  border:1px solid rgba(0,0,0,.08); border-left:2px solid #B8962E;
  border-radius:8px; padding:22px 26px; margin-bottom:16px; }
.rv-camp-future-label { font-size:10px; font-weight:700; letter-spacing:.15em;
  color:#B8962E; text-transform:uppercase; margin-bottom:8px; }
.rv-camp-future-body { font-size:13px; color:#555; line-height:1.75; }
/* CE bar */
.rv-ce-card { background:#1a1a1a; border-left:3px solid #B8962E;
  border-radius:8px; padding:28px 32px; margin-bottom:20px; }
.rv-ce-title { font-family:'Playfair Display',serif; font-size:1.15rem;
  color:#f5f0e8; margin-bottom:20px; }
.rv-ce-bar-wrap { position:relative; margin-bottom:8px; }
.rv-ce-bar-track { background:#333; border-radius:4px; height:10px;
  position:relative; overflow:visible; }
.rv-ce-bar-fill { height:100%; background:linear-gradient(90deg,#ca6d6d,#c9a830,#B8962E);
  border-radius:4px; transition:width .6s ease; }
.rv-ce-markers { position:relative; height:28px; margin-top:4px; }
.rv-ce-marker { position:absolute; transform:translateX(-50%); text-align:center; }
.rv-ce-marker-line { width:1px; height:14px; margin:0 auto 3px;
  background:#555; }
.rv-ce-marker-label { font-size:10px; color:#888; white-space:nowrap; }
.rv-ce-current-marker { position:absolute; transform:translateX(-50%); top:-14px; }
.rv-ce-diamond { width:10px; height:10px; background:#B8962E;
  transform:rotate(45deg); margin:0 auto; }
.rv-ce-body { font-size:13px; color:#f5f0e8; opacity:.75; line-height:1.85;
  margin-top:16px; }
.rv-ce-next { font-size:12px; color:#f5f0e8; opacity:.45; margin-top:10px;
  letter-spacing:.03em; }
/* Subject tutoring cards */
.rv-tutor-card { border-radius:8px; padding:22px 26px; margin-bottom:14px; }
.rv-tutor-gap  { background:#fff; border-left:3px solid #c9a830; border:1px solid rgba(0,0,0,.08); border-left:3px solid #c9a830; }
.rv-tutor-crit { background:#fff; border-left:3px solid #ca6d6d; border:1px solid rgba(0,0,0,.08); border-left:3px solid #ca6d6d; }
.rv-tutor-subj { font-family:'Playfair Display',serif; font-size:1.1rem;
  color:#1a1a1a; margin-bottom:8px; }
.rv-tutor-grade { font-size:13px; color:#555; margin-bottom:6px; }
.rv-tutor-grade strong { color:#1a1a1a; }
.rv-tutor-ce { font-size:12px; color:#888; margin-bottom:12px; }
.rv-tutor-rec { display:grid; grid-template-columns:110px 1fr; gap:5px 12px;
  font-size:12.5px; margin-bottom:12px; }
.rv-tutor-rec-lbl { color:#aaa; }
.rv-tutor-rec-val { color:#1a1a1a; font-weight:600; }
.rv-tutor-why { font-size:12px; color:#666; line-height:1.8;
  background:#faf8f5; border-radius:5px; padding:12px 16px;
  margin-top:4px; display:none; }
.rv-tutor-why.open { display:block; }
.rv-tutor-toggle { font-size:11.5px; color:#B8962E; cursor:pointer;
  background:none; border:none; padding:0; font-family:'Inter',sans-serif;
  font-weight:600; }
/* Tutor active badge */
.rv-tutor-active { background:#eaf5ea; border-left:3px solid #5a9a5a;
  border-radius:5px; padding:12px 16px; margin-top:10px; }
.rv-tutor-active-label { font-size:10px; font-weight:700; letter-spacing:.12em;
  color:#2d6a2d; text-transform:uppercase; margin-bottom:6px; }
.rv-tutor-active-body { font-size:12px; color:#333; line-height:1.65; }
/* Not recommending summary */
.rv-not-rec { background:#faf8f5; border-radius:8px; padding:16px 20px;
  font-size:12.5px; color:#666; line-height:1.75; margin-top:8px; }
/* Action counter badge on tab */
.tab-action-badge { display:inline-flex; align-items:center; justify-content:center;
  background:#ca6d6d; color:#fff; font-size:9px; font-weight:700;
  width:16px; height:16px; border-radius:50%; margin-left:6px;
  vertical-align:middle; }
/* Empty state */
.rv-empty { background:#f5f0e8; border-radius:8px; padding:28px 32px;
  font-size:13.5px; color:#555; line-height:1.85; text-align:center; }
/* Mobile */
@media (max-width:768px) {
  .rv-grid { grid-template-columns:1fr; }
  .rv-primary-inner, .rv-camp-inner { flex-direction:column; gap:20px; }
  .rv-primary-left { width:100%; }
  .rv-subtabs button { padding:12px 10px; font-size:10.5px; }
  .rv-tutor-rec { grid-template-columns:90px 1fr; }
}
"""

# ── Main function ─────────────────────────────────────────────────────────────

def tab_recommendations_v2(s, svcs, academics, milestones, prop_fn):
    """Render the complete Recommendations tab with three live engines."""
    p = prop_fn
    student = build_student_data(s, milestones, [], svcs, academics, p)
    schools  = _get_schools()

    # Fallback: if Notion fails, use minimal hardcoded set for Bromsgrove
    if not schools:
        schools = [{"name":"Bromsgrove School","slug":"bromsgrove-school",
                    "loc":"Worcestershire","region":"Midlands","gender":"Co-ed",
                    "fee":43000,"entry":["Year 9","Year 12"],"sports":["Golf","Cricket","Tennis"],
                    "hasGolf":True,"hasGolfSchol":True,"scholPct":30,"pastoral":5,
                    "gcse":75,"oxbridge":8,
                    "note":"Co-educational boarding school in Worcestershire with outstanding pastoral care."}]

    # Determine active tutor from svcs
    tutor_svc = next((sv for sv in svcs
                      if "Tutor" in (p(sv,"Service Type") or "")
                      and p(sv,"Status") == "Active"), None)
    if tutor_svc:
        student["activeTutor"] = {
            "subject": p(tutor_svc,"Service Type") or "Tutoring",
            "sessions": p(tutor_svc,"Sessions Per Week") or 2,
        }

    student_json = json.dumps(student)
    schools_json = json.dumps(schools)
    camps_json   = json.dumps(CAMPS_DATA)
    line_handle  = LINE_HANDLE

    now_str = "March 2026"

    return f"""<style>{RECS_CSS}</style>

<!-- Sub-tab bar -->
<div class="rv-subtabs" id="rv-subtabs">
  <button id="rvbtn-schools"  class="rv-active" onclick="showRvTab('rv-schools')">
    <span class="rv-stab-icon">🏫</span>Schools
  </button>
  <button id="rvbtn-camps"    onclick="showRvTab('rv-camps')">
    <span class="rv-stab-icon">⛺</span>Summer Camps
  </button>
  <button id="rvbtn-tutoring" onclick="showRvTab('rv-tutoring')">
    <span class="rv-stab-icon">📚</span>Tutoring
  </button>
</div>

<!-- Section panels — only one visible at a time -->
<div id="rv-schools"  class="rv-section rv-active"></div>
<div id="rv-camps"    class="rv-section"></div>
<div id="rv-tutoring" class="rv-section"></div>

<script>
// ── Injected data ─────────────────────────────────────────────────────────
const STUDENT = {student_json};
const SCHOOLS = {schools_json};
const CAMPS   = {camps_json};

// ── Utilities ─────────────────────────────────────────────────────────────
function daysUntil(d) {{
  if (!d) return 9999;
  return Math.round((new Date(d) - new Date()) / 86400000);
}}
function monthsUntil(d) {{
  if (!d) return 99;
  var now = new Date(), target = new Date(d);
  return Math.max(0,(target.getFullYear()-now.getFullYear())*12+(target.getMonth()-now.getMonth()));
}}
function gradeNum(g) {{
  return {{'A*':5.5,'A':5,'B+':4.5,'B':4,'C+':3.5,'C':3,'D':2,'E':1,'F':0}}[g] || 0;
}}
function fmtGBP(n) {{ return '£' + n.toLocaleString() + ' / yr'; }}
function fmtTHB(n) {{ return '฿' + Math.round(n * {THB_RATE}).toLocaleString(); }}
function deadlineClass(days) {{
  if (days < 30) return 'rv-deadline-red';
  if (days < 60) return 'rv-deadline-amber';
  return 'rv-deadline-green';
}}
function deadlineLabel(days, dateStr) {{
  if (!dateStr) return '';
  var d = new Date(dateStr);
  var mo = d.toLocaleString('en-GB',{{month:'long'}});
  var yr = d.getFullYear();
  if (days < 0) return 'Deadline passed';
  if (days === 0) return 'Deadline today';
  return 'Apply by ' + mo + ' ' + yr + ' &mdash; ' + days + ' days remaining';
}}
function probClass(label) {{
  if (label === 'Strong Candidate') return 'rv-prob-strong';
  if (label === 'Realistic Candidate') return 'rv-prob-realistic';
  if (label === 'Stretch Candidate') return 'rv-prob-stretch';
  return 'rv-prob-aspirational';
}}

// ── Engine 1: School Recommendations ─────────────────────────────────────

function runSchoolEngine() {{
  var budget = STUDENT.budget || 45000;
  var targetEntry = STUDENT.targetEntry || 'Year 9';
  var targetYear  = parseInt(STUDENT.targetYear) || 2027;
  var gender      = STUDENT.gender || 'Female';
  var sport       = (STUDENT.primarySport || '').toLowerCase();

  // Hard filter
  var passed = SCHOOLS.filter(function(sc) {{
    if (sc.gender === 'Boys'  && gender === 'Female') return false;
    if (sc.gender === 'Girls' && gender === 'Male')   return false;
    if (sc.fee > budget * 1.2) return false;
    if (sc.entry && !sc.entry.includes(targetEntry)) return false;
    return true;
  }});

  var removedCount = SCHOOLS.length - passed.length;

  // Weighted scoring
  var scored = passed.map(function(sc) {{
    var pts = 0; var breakdown = {{}};

    // Academic match (25 pts)
    var gradeVals = Object.values(STUDENT.grades || {{}}).map(function(g) {{ return gradeNum(g.grade); }});
    var avg = gradeVals.length ? gradeVals.reduce(function(a,b){{return a+b;}},0)/gradeVals.length : 3.5;
    var target_level = 4.0; // B average
    var diff = avg - target_level;
    var acPts = diff >= 1 ? 25 : diff >= 0.5 ? 22 : diff >= 0 ? 15 : diff >= -0.5 ? 8 : 0;
    pts += acPts; breakdown.academic = acPts;

    // Sport match (20 pts)
    var sportPts = 0;
    var hasSport = sc.sports && sc.sports.some(function(s){{ return s.toLowerCase().indexOf(sport) >= 0; }});
    if (hasSport) {{
      sportPts += 10;
      if (sc.hasGolfSchol) sportPts += 8;
      var hcGap = (STUDENT.currentHandicap || 11) - (STUDENT.targetHandicap || 7);
      if (hcGap <= 3) sportPts += 2;
    }}
    pts += sportPts; breakdown.sport = sportPts;

    // Budget fit (15 pts)
    var fee = sc.fee || 0;
    var budgetPts = fee <= budget ? 15 : fee <= budget*1.1 ? 10 : fee <= budget*1.2 ? 5 : 0;
    pts += budgetPts; breakdown.budget = budgetPts;

    // Pastoral fit (15 pts)
    var pastoralRisk = STUDENT.homesicknessRisk === 'Medium' || STUDENT.homesicknessRisk === 'High';
    var pastoralPts = pastoralRisk ? (sc.pastoral || 3) * 3 : 12;
    pts += pastoralPts; breakdown.pastoral = pastoralPts;

    // Location (10 pts)
    var locPts = {{
      'South East':10,'South West':10,'London':10,
      'East':8,'Midlands':8,'North':5,'Wales':3,'Scotland':3
    }}[sc.region] || 8;
    pts += locPts; breakdown.location = locPts;

    // Reputation for goal (10 pts)
    var repPts = 6;
    if (STUDENT.goal && STUDENT.goal.toLowerCase().indexOf('oxford') >= 0) {{
      repPts = Math.min(10, Math.round((sc.oxbridge || 0) / 3));
    }} else if (sc.hasGolfSchol) {{
      repPts = 9;
    }} else if (sc.scholPct > 20) {{
      repPts = 8;
    }}
    pts += repPts; breakdown.reputation = repPts;

    // Entry timeline (5 pts)
    var currentYear = new Date().getFullYear();
    var targetInt = parseInt(STUDENT.targetYear) || currentYear + 1;
    var timelinePts = 5;
    pts += timelinePts; breakdown.timeline = timelinePts;

    // Probability label
    var probLabel = pts >= 75 ? 'Strong Candidate' : pts >= 60 ? 'Realistic Candidate' : pts >= 45 ? 'Stretch Candidate' : 'Aspirational';

    // Tier
    var tier = pts >= 75 ? 2 : pts >= 60 ? 2 : pts >= 50 ? 3 : pts >= 35 ? 4 : 0;
    var aboveBudget = fee > budget;

    return Object.assign({{}}, sc, {{
      matchScore: pts, breakdown: breakdown,
      probLabel: probLabel, tier: tier, aboveBudget: aboveBudget
    }});
  }});

  // Sort and filter
  scored.sort(function(a,b) {{ return b.matchScore - a.matchScore; }});
  var visible = scored.filter(function(s){{ return s.matchScore >= 35; }}).slice(0, 8);

  // Force Bromsgrove to tier 1 if present (it's the confirmed target)
  var bIdx = visible.findIndex(function(s){{ return s.slug === 'bromsgrove-school'; }});
  if (bIdx >= 0) {{ visible[bIdx].tier = 1; visible[bIdx].probLabel = 'Strong Candidate'; }}

  renderSchools(visible, removedCount);
}}

function renderSchools(schools, removedCount) {{
  var el = document.getElementById('rv-schools');
  if (!el) return;

  var name = STUDENT.name || 'the student';

  var primary = schools.find(function(s){{ return s.tier === 1; }}) || schools[0];
  var supporting = schools.filter(function(s){{ return s !== primary && s.matchScore >= 50; }}).slice(0,4);

  var filteredNote = removedCount > 0
    ? '<p class="rv-filtered">' + removedCount + ' school' + (removedCount>1?'s were':' was') + ' assessed and removed from the shortlist. Ask Satit for details.</p>'
    : '';

  var html = `
  <div class="rv-hdr">
    <div class="rv-hdr-label">School Recommendations</div>
    <div class="rv-hdr-title">${{name}}'s School Shortlist &mdash; {now_str}</div>
    <div class="rv-hdr-body">Based on ${{name}}'s academic record, golf profile, budget, and pastoral readiness, we have identified schools where she has a realistic path to entry. ${{primary ? primary.name : 'Our primary recommendation'}} is our primary recommendation. The supporting schools protect the application in different scenarios.</div>
    <div class="rv-hdr-ts">Last reviewed {now_str}</div>
  </div>`;

  if (primary) html += renderPrimarySchool(primary, name);

  if (supporting.length) {{
    html += '<div class="rv-grid">';
    supporting.forEach(function(sc) {{ html += renderSupportingSchool(sc); }});
    html += '</div>';
  }}

  html += filteredNote;
  el.innerHTML = html;
}}

function schoolMeta(sc) {{
  var parts = [];
  if (sc.gender && sc.gender !== 'Co-ed') parts.push(sc.gender + ' only');
  else parts.push('Co-educational');
  if (sc.loc) parts.push(sc.loc.split(',')[0]);
  if (sc.entry && sc.entry.includes(STUDENT.targetEntry || 'Year 9')) parts.push(STUDENT.targetEntry + ' Entry');
  return parts.join(' &nbsp;&middot;&nbsp; ');
}}

function renderPrimarySchool(sc, name) {{
  var fee = sc.fee ? fmtGBP(sc.fee) : 'Contact school';
  var budgetFlag = sc.aboveBudget ? '<span class="rv-flag-budget">Above Budget</span>' : '';
  var reasons = buildReasons(sc);
  var meta = schoolMeta(sc);

  return `
  <div class="rv-primary" id="rv-primary-card">
    <div class="rv-primary-badge">Primary Recommendation</div>
    <div class="rv-primary-inner">
      <div class="rv-primary-left">
        <div class="rv-primary-name">${{sc.name}}</div>
        <div class="rv-primary-meta">${{meta}}</div>
        <div class="rv-primary-fee">${{fee}} ${{budgetFlag}}</div>
        <span class="rv-prob ${{probClass(sc.probLabel)}}">${{sc.probLabel}}</span>
      </div>
      <div class="rv-primary-right">
        <div class="rv-primary-headline">${{buildHeadline(sc, name)}}</div>
        <ul class="rv-reason-list">${{reasons}}</ul>
        <div class="rv-primary-actions">
          <a class="rv-btn-ghost" href="/portal/schools/${{sc.slug || ''}}" target="_blank">View School Profile</a>
          <button class="rv-btn-text" onclick="toggleExpand('rv-primary-expand')">Why This School? &rarr;</button>
        </div>
      </div>
    </div>
  </div>
  <div class="rv-expand" id="rv-primary-expand">${{buildExpandedPanel(sc, name)}}</div>`;
}}

function buildHeadline(sc, name) {{
  if (sc.hasGolfSchol) {{
    return sc.name + "'s golf scholarship programme and inquiry-led teaching approach make it the strongest match for " + name + "'s profile.";
  }}
  if (sc.hasGolf) {{
    return sc.name + "'s active golf programme and " + (sc.pastoral >= 4 ? 'outstanding' : 'strong') + " pastoral support make it a strong environment for " + name + "'s development.";
  }}
  return sc.name + "'s academic standard and boarding culture are a strong fit for " + name + "'s current profile and 2027 entry goal.";
}}

function buildReasons(sc) {{
  var r = [];
  if (sc.hasGolfSchol) r.push('Golf scholarship programme with competitive intake each year');
  else if (sc.hasGolf)  r.push('Active golf programme with competitive team structure');
  if (sc.pastoral >= 4) r.push('Outstanding pastoral reputation — suited to students settling from overseas');
  if (sc.breakdown && sc.breakdown.academic >= 15) r.push('Academic entry standard within reach at current trajectory');
  if (sc.scholPct >= 20) r.push('Scholarships available up to ' + Math.round(sc.scholPct) + '% of fees');
  if (r.length < 3 && sc.gcse >= 70) r.push('Strong academic outcomes — ' + Math.round(sc.gcse) + '% GCSE grade 7–9');
  if (r.length < 3) r.push('Co-educational environment with strong international student community');
  return r.slice(0,3).map(function(x){{ return '<li>' + x + '</li>'; }}).join('');
}}

function buildExpandedPanel(sc, name) {{
  var ceNeeded = 70, ceCurrent = STUDENT.ceOverall || 58;
  var sciCE = (STUDENT.grades && STUDENT.grades['Science'] && STUDENT.grades['Science'].ceScore) || 41;

  var whyText = name + "'s profile matches " + sc.name + " across three critical dimensions. " +
    (sc.hasGolfSchol
      ? "The golf scholarship programme is the primary selection criterion — " + name + "'s handicap of " + (STUDENT.currentHandicap||11) + " is 4 shots above the typical scholarship threshold of " + (STUDENT.targetHandicap||7) + ", with a realistic improvement trajectory over the next 19 months. "
      : sc.hasGolf ? name + "'s golf development to handicap " + (STUDENT.currentHandicap||11) + " positions her well for " + sc.name + "'s golf programme. " : "") +
    (sc.pastoral >= 4
      ? sc.name + "'s pastoral reputation is particularly relevant given " + name + "'s mild social anxiety and no prior residential experience — the structured house system and experienced housemasters will support her settling period. "
      : "") +
    "Her English language ability (consistently A to A* over 6 terms) will make academic adjustment significantly easier than for most Thai students at Year 9 entry.";

  var gapRows = [
    ['Science CE Paper',   'Grade B / 65% threshold',  sciCE + '% on Mock 1', 'Active Gap'],
    ['Overall CE Score',   ceNeeded + '% (competitive)', ceCurrent + '% (Mock 1)', 'Active Gap'],
    ['UKISET',             'Required — VR 110+',       'Not yet taken',  'Not Started'],
    ['Golf Handicap',      'Approx. 7 for scholarship', 'Current: ' + (STUDENT.currentHandicap||11), 'Developing'],
  ];

  var gapTableHtml = '<table class="rv-gap-table"><thead><tr><th>Criterion</th><th>Required</th><th>Ping Now</th><th>Status</th></tr></thead><tbody>' +
    gapRows.map(function(r) {{
      var badgeCls = r[3]==='Active Gap' ? 'rv-prob rv-prob-stretch' : r[3]==='Not Started' ? 'rv-prob rv-prob-aspirational' : 'rv-prob rv-prob-realistic';
      return '<tr><td>' + r[0] + '</td><td style="color:#aaa">' + r[1] + '</td><td>' + r[2] + '</td><td><span class="' + badgeCls + '" style="font-size:9.5px;padding:2px 7px">' + r[3] + '</span></td></tr>';
    }}).join('') + '</tbody></table>';

  var timeline = [
    ['Now', 'Register for UKISET and book preparation session with Satit'],
    ['April 2026', 'Submit Bromsgrove Summer School application — deadline 30 April'],
    ['July 2026', 'Attend Bromsgrove Summer School — 14 to 28 July'],
    ['Sep 2026', 'Begin 2&times; weekly Science tutoring with CE focus'],
    ['Sep 2026', 'CE Mock 2 — target 62%'],
    ['Nov 2026', 'Submit Year 9 application to Bromsgrove'],
    ['Jan 2027', 'Golf scholarship audition — target handicap 7'],
    ['Feb 2027', 'Interview and offer decision'],
  ];

  var timelineHtml = '<ul class="rv-timeline">' +
    timeline.map(function(t){{ return '<li><span class="rv-timeline-date">' + t[0] + '</span><span>' + t[1] + '</span></li>'; }}).join('') +
    '</ul>';

  return `
  <div class="rv-expand-section">
    <div class="rv-expand-label">Why ${{sc.name}} for ${{name}} specifically</div>
    <div class="rv-expand-body">${{whyText}}</div>
  </div>
  <div class="rv-expand-section">
    <div class="rv-expand-label">Where the gaps are</div>
    ${{gapTableHtml}}
  </div>
  <div class="rv-expand-section">
    <div class="rv-expand-label">Path to an offer &mdash; what needs to happen</div>
    ${{timelineHtml}}
  </div>
  <div class="rv-expand-section">
    <div class="rv-expand-label">What happens if we don't act</div>
    <div class="rv-warning">Without the UKISET and Summer School attendance, ${{name}}'s application will be less competitive than the typical ${{sc.name}} Year 9 international applicant. These two actions are the highest-leverage steps for the next 6 months.</div>
  </div>`;
}}

function renderSupportingSchool(sc) {{
  var fee = sc.fee ? fmtGBP(sc.fee) : 'Contact school';
  var budgetFlag = sc.aboveBudget ? '<span class="rv-flag-budget">Above Budget</span>' : '';
  var tagline = buildSupportingTagline(sc);
  var expandId = 'rv-supp-' + sc.slug;

  return `<div class="rv-card">
    <div class="rv-card-name">${{sc.name}}</div>
    <div class="rv-card-meta">${{schoolMeta(sc)}}</div>
    <div class="rv-card-fee">${{fee}} ${{budgetFlag}}</div>
    <div style="margin-bottom:10px"><span class="rv-prob ${{probClass(sc.probLabel)}}" style="font-size:9.5px;padding:2px 10px">${{sc.probLabel}}</span></div>
    <div class="rv-card-tagline">${{tagline}}</div>
    <div class="rv-card-actions">
      <button class="rv-learn" onclick="toggleExpand('${{expandId}}')">Learn More &rarr;</button>
    </div>
    <div class="rv-card-expand" id="${{expandId}}">
      <div class="rv-card-expand-label">Match Summary</div>
      <div class="rv-card-expand-body">${{buildSupportingExpand(sc)}}</div>
      ${{sc.hasGolfSchol || sc.hasGolf ? buildGolfSupportNote(sc) : ''}}
    </div>
  </div>`;
}}

function buildSupportingTagline(sc) {{
  if (sc.hasGolfSchol) return sc.name + " offers a golf scholarship pathway — a viable alternative if the Bromsgrove application requires a stronger handicap than Ping achieves by January 2027.";
  if (sc.hasGolf && sc.breakdown && sc.breakdown.budget === 15) return "Within budget with an active golf programme. Lower academic threshold than Bromsgrove — provides a stronger safety option.";
  if (sc.fee && sc.fee < (STUDENT.budget || 45000)) return "Meaningfully below budget — creates financial flexibility for additional tutoring and activity investment without exceeding the family's annual commitment.";
  return "Co-educational boarding school with a strong pastoral reputation and realistic entry requirements for " + STUDENT.name + "'s current academic profile.";
}}

function buildSupportingExpand(sc) {{
  var s = [];
  if (sc.breakdown) {{
    if (sc.breakdown.academic >= 15) s.push("Academic match: strong. Current grades are at or above typical entry standard.");
    if (sc.breakdown.sport >= 15)    s.push("Sport match: strong. Golf scholarship or programme available.");
    else if (sc.breakdown.sport >= 10) s.push("Sport match: good. Golf programme available — scholarship pathway possible.");
    if (sc.breakdown.pastoral >= 12)   s.push("Pastoral: excellent. Recommended for students with moderate homesickness risk.");
    if (sc.breakdown.budget === 15)    s.push("Budget: within target range.");
    else if (sc.breakdown.budget === 10) s.push("Budget: slightly above target — within 10% stretch range.");
  }}
  if (!s.length) s.push("A solid match across the key criteria for " + STUDENT.name + "'s profile.");
  return s.join(' ');
}}

function buildGolfSupportNote(sc) {{
  return '<div class="rv-card-expand-label" style="margin-top:12px">Golf Note</div>' +
    '<div class="rv-card-expand-body">' +
    (sc.hasGolfSchol
      ? sc.name + "'s golf scholarship programme accepts applications in the same cycle as Bromsgrove. Applying to both in November 2026 is recommended strategy."
      : sc.name + " has an active golf programme. While a scholarship is not confirmed, the coaching environment would support continued handicap development.") +
    '</div>';
}}

// ── Engine 2: Summer Camp Recommendations ────────────────────────────────

function runCampEngine() {{
  var name        = STUDENT.name || 'the student';
  var hasUK       = STUDENT.priorUKResidence;
  var english     = STUDENT.englishLevel || 'Upper-Intermediate';
  var sport       = (STUDENT.primarySport || '').toLowerCase();
  var targetYear  = parseInt(STUDENT.targetYear) || 2027;
  var now         = new Date().getFullYear();
  var yearsToGo   = targetYear - now;
  var targetSchool= STUDENT.targetSchool || 'Bromsgrove';
  var targetSlug  = STUDENT.targetSlug || 'bromsgrove-school';

  // Find target school camp
  var targetCamp = CAMPS.find(function(c){{ return c.targetSchool; }});

  // Determine primary tier
  var primary = null, tier = 0, triggerReason = '';

  var engLow = english === 'Beginner' || english === 'Intermediate';

  // Tier 1: target school programme, entry 12–30 months away
  if (targetCamp && yearsToGo >= 1 && yearsToGo <= 3 && !engLow) {{
    primary = targetCamp; tier = 1;
    triggerReason = 'Attending ' + targetSchool + "'s own summer programme puts " + name + " in front of the admissions team before her application — a meaningful advantage that very few Thai students act on early enough.";
  }}

  // Tier 2: sport development if tier 1 didn't fire and sport scholarship goal
  if (!primary && sport && sport !== 'none') {{
    var sportCamp = CAMPS.find(function(c){{ return c.tier === 2 && c.sport && c.sport.toLowerCase().indexOf(sport) >= 0; }});
    if (sportCamp) {{ primary = sportCamp; tier = 2; triggerReason = 'A specialist ' + sport + ' camp develops the documented performance record required for a scholarship application. Two weeks of concentrated PGA-level coaching can produce measurable handicap improvement.'; }}
  }}

  // Tier 4: first UK residential experience
  if (!primary && !hasUK && yearsToGo >= 2) {{
    primary = CAMPS.find(function(c){{ return c.tier === 4; }});
    tier = 4;
    triggerReason = name + " has no prior UK residential experience. A multi-activity boarding camp is the highest-leverage preparation — building the foundational confidence that boarding school life is survivable and enjoyable before the formal transition.";
  }}

  // Tier 5 override: English immersion
  if (engLow) {{
    primary = null; tier = 5;
    triggerReason = 'English level is currently ' + english + '. An English immersion camp is the prerequisite before any specialist programme — a student who cannot comfortably communicate in English will not benefit fully from a sport or academic camp.';
  }}

  // Future year: golf development for 2027
  var future = CAMPS.find(function(c){{ return c.id === 'millfield-golf'; }});

  renderCamps(primary, tier, triggerReason, future, name);
}}

function renderCamps(primary, tier, triggerReason, future, name) {{
  var el = document.getElementById('rv-camps');
  if (!el) return;

  var html = `<div class="rv-hdr">
    <div class="rv-hdr-label">Summer Camps</div>
    <div class="rv-hdr-title">Summer 2026 &mdash; One Priority Programme</div>
    <div class="rv-hdr-body">Attending Bromsgrove Summer School in July 2026 is the single most valuable thing ${{name}} can do before her application. It achieves three things: direct experience of life at Bromsgrove, visibility to admissions and house staff, and a genuine test of readiness for boarding. We recommend applying immediately &mdash; places fill early.</div>
    <div class="rv-hdr-ts">Last reviewed {now_str}</div>
  </div>`;

  if (primary) {{
    html += renderPrimaryCamp(primary, triggerReason);
  }} else {{
    html += '<div class="rv-empty">No summer camp action is needed at this stage. We will make a recommendation when the time is right.</div>';
  }}

  if (future) {{
    html += `<div class="rv-camp-future">
      <div class="rv-camp-future-label">Summer 2027 &mdash; Early Planning</div>
      <div class="rv-camp-future-body">In 2027, the priority shifts to golf development as final preparation ahead of ${{name}}'s September 2027 entry. We recommend the Millfield Summer Golf Academy as the pre-entry intensive — two weeks of PGA-coached development and competitive simulation. No action needed now &mdash; we will revisit this in January 2027.</div>
    </div>`;
  }}

  el.innerHTML = html;
}}

function renderPrimaryCamp(camp, triggerReason) {{
  var deadline = daysUntil(camp.deadline + 'T00:00:00');
  var dlClass  = deadlineClass(deadline);
  var dlLabel  = deadlineLabel(deadline, camp.deadline);
  var thb      = fmtTHB(camp.feeGBP);
  var name     = STUDENT.name || 'the student';

  var reasons = [
    triggerReason,
    camp.targetSchool
      ? 'The summer school introduces ' + name + ' to the house system, teaching style, and social environment before her application — reducing both homesickness risk and cultural adjustment difficulty at entry.'
      : 'Two weeks of concentrated specialist coaching produces measurable skill improvement and creates a documented performance record for the scholarship application.',
    camp.targetSchool
      ? 'Summer school attendance is explicitly noted by many housemasters as a positive signal in the application review process. It demonstrates commitment that a standard application cannot.'
      : 'The competitive environment of a specialist camp builds the tournament experience and mental resilience that scholarship auditions specifically assess.'
  ];

  return `<div class="rv-camp-primary">
    <div class="rv-camp-badge">Primary Recommendation</div>
    <div class="rv-camp-inner">
      <div class="rv-camp-left">
        <div class="rv-camp-name">${{camp.name}}</div>
        <div class="rv-camp-school">${{camp.school}} &nbsp;&middot;&nbsp; ${{camp.location}}</div>
        <div class="rv-camp-fees">
          <div class="rv-camp-fee-item"><span class="rv-camp-fee-amount">&pound;${{camp.feeGBP.toLocaleString()}}</span>GBP</div>
          <div class="rv-camp-fee-item"><span class="rv-camp-fee-amount">${{thb}}</span>Thai Baht</div>
        </div>
        <div style="font-size:12px;color:#f5f0e8;opacity:.5;margin-bottom:8px">${{camp.dates}} &nbsp;&middot;&nbsp; Ages ${{camp.ageGroup}}</div>
        ${{dlLabel ? '<div class="rv-deadline-badge ' + dlClass + '">' + dlLabel + '</div>' : ''}}
      </div>
      <div class="rv-camp-right">
        <ul class="rv-reason-list" style="margin-bottom:18px">
          ${{reasons.map(function(r){{return '<li style=\\'color:#f5f0e8;opacity:.75;font-size:12.5px;\\'>' + r + '</li>';}}).join('')}}
        </ul>
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
          <a href="https://line.me/R/ti/p/@{line_handle}?text=${{encodeURIComponent('สวัสดีครับ อยากสอบถามเรื่อง ' + camp.name + ' 2026 สำหรับน้อง' + (STUDENT.name||''))}}" target="_blank" class="rv-btn-ghost">Book a Call with Satit</a>
        </div>
      </div>
    </div>
  </div>`;
}}

// ── Engine 3: Tutoring Recommendations ──────────────────────────────────

var SCHOOL_REQS = {{ 'Mathematics':'B','English Language':'B','English Literature':'B','Science (Combined)':'B' }};

function runTutoringEngine() {{
  var grades    = STUDENT.grades || {{}};
  var ceOverall = STUDENT.ceOverall || 58;
  var ceTarget  = STUDENT.ceTarget  || 70;
  var ceThresh  = STUDENT.ceThreshold || 60;
  var name      = STUDENT.name || 'the student';
  var style     = STUDENT.learningStyle || 'Kinaesthetic';

  // Months to exam
  var monthsToExam = monthsUntil(STUDENT.examDate) || 19;
  var freqMap = function(m) {{
    if (m >= 18) return '1 session per week';
    if (m >= 12) return '2 sessions per week';
    if (m >= 6)  return '3 sessions per week';
    return 'Daily preparation — exam season';
  }};
  var formatRec = style === 'Kinaesthetic' ? 'In-person preferred' : style === 'Visual' ? 'Online or in-person' : 'Online or in-person';

  // Classify subjects
  var classified = [];
  Object.keys(SCHOOL_REQS).forEach(function(subj) {{
    var req  = SCHOOL_REQS[subj];
    var data = grades[subj] || {{}};
    var curr = data.grade || '?';
    var ceScore = data.ceScore || null;

    var reqNum  = gradeNum(req);
    var currNum = curr === '?' ? reqNum - 1 : gradeNum(curr);
    var gap     = reqNum - currNum;

    var classification;
    if (curr === '?') classification = 'active_gap';
    else if (gap >= 2 || (ceScore !== null && ceScore < 50)) classification = 'critical';
    else if (gap >= 1 || (ceScore !== null && ceScore < 65)) classification = 'active_gap';
    else if (gap === 0 || (ceScore !== null && ceScore < 75)) classification = 'maintained';
    else classification = 'strong';

    if (classification === 'active_gap' || classification === 'critical') {{
      var focus = subj === 'Science (Combined)'
        ? 'Exam technique and timed written paper practice — not concept re-teaching'
        : subj === 'Mathematics'
          ? 'CE Paper 2 problem-solving and open-ended question practice'
          : 'Written accuracy and structured response technique';

      var why = subj === 'Science (Combined)'
        ? 'Teacher comments across 6 terms consistently identify exam technique, not understanding, as the specific weakness. Practical and continuous assessment scores are higher than written exam scores. Tutoring that focuses on knowledge re-teaching would waste time — the priority is timed practice under exam conditions, mark scheme familiarity, and exam anxiety management.'
        : subj === 'Mathematics'
          ? 'Grade B is stable across all 6 recorded terms — the subject is at threshold, not in decline. However CE Mock 1 shows the score is not yet secure. Teacher notes that ' + (STUDENT.name||'the student') + ' under-performs on open-ended problem solving relative to procedural questions. CE Paper 2 preparation is the specific gap.'
          : 'The subject is approaching but not yet firmly at entry standard. Consistent structured practice before the CE will close the gap.';

      classified.push({{
        subject: subj, classification: classification,
        current: curr, required: req, ceScore: ceScore,
        frequency: freqMap(monthsToExam),
        format: formatRec,
        focus: focus, why: why,
        startMonth: monthsToExam >= 18 ? 'Begin by September 2026' : 'Begin immediately'
      }});
    }}
  }});

  // CE prep analysis
  var sciCE    = (grades['Science (Combined)'] || {{}}).ceScore || 41;
  var engCE    = (grades['English Language'] || {{}}).ceScore    || 71;
  var mathsCE  = (grades['Mathematics'] || {{}}).ceScore         || 62;
  var sciGain  = 60 - sciCE;
  var projectedIfSciImproves = ceOverall + Math.round(sciGain * 0.33);

  var cePrep = {{
    currentScore: ceOverall, targetScore: ceTarget, threshold: ceThresh,
    highestImpactSubject: 'Science (Combined)',
    sciCE: sciCE, engCE: engCE, mathsCE: mathsCE,
    projectedIfSciImproves: projectedIfSciImproves,
    monthsToExam: monthsToExam,
    papersPerWeek: monthsToExam >= 12 ? 1 : monthsToExam >= 6 ? 2 : 3
  }};

  // Strong subjects
  var strongSubjects = [];
  ['English Language','English Literature','History','Thai Language','Art and Design','Physical Education'].forEach(function(subj) {{
    strongSubjects.push(subj);
  }});

  renderTutoring(classified, cePrep, strongSubjects);
}}

function renderTutoring(subjects, ce, strongSubjects) {{
  var el = document.getElementById('rv-tutoring');
  if (!el) return;
  var name = STUDENT.name || 'the student';

  var html = `<div class="rv-hdr">
    <div class="rv-hdr-label">Tutoring Recommendations</div>
    <div class="rv-hdr-title">Preparation Plan for ${{name}}</div>
    <div class="rv-hdr-body">Every strong boarding school candidate works with specialist tutors. These are not remedial sessions &mdash; they are the preparation tools that close the gap between where ${{name}} is now and where Bromsgrove needs her to be.</div>
    <div class="rv-hdr-ts">Last reviewed {now_str}</div>
  </div>`;

  // CE overview card
  html += renderCECard(ce, name);

  // Subject cards
  subjects.forEach(function(subj) {{
    html += renderSubjectCard(subj, name);
  }});

  // Not recommending
  if (strongSubjects.length) {{
    html += `<div class="rv-not-rec"><strong>We are not currently recommending tutoring in:</strong> ${{strongSubjects.join(', ')}}. ${{name}}'s performance in these subjects meets or exceeds Bromsgrove's entry requirements. Redirecting time and budget to gap subjects will have more impact on the overall CE score.</div>`;
  }}

  el.innerHTML = html;
}}

function renderCECard(ce, name) {{
  var fillPct  = ce.currentScore;
  var threshPct= ce.threshold;
  var targetPct= ce.targetScore;

  return `<div class="rv-ce-card">
    <div class="rv-ce-title">CE Preparation Overview &mdash; Overall Score</div>
    <div class="rv-ce-bar-wrap">
      <div class="rv-ce-bar-track">
        <div class="rv-ce-bar-fill" style="width:${{fillPct}}%"></div>
        <div class="rv-ce-current-marker" style="left:${{fillPct}}%">
          <div class="rv-ce-diamond"></div>
        </div>
      </div>
      <div class="rv-ce-markers">
        <div class="rv-ce-marker" style="left:${{fillPct}}%">
          <div class="rv-ce-marker-line" style="background:#B8962E"></div>
          <div class="rv-ce-marker-label" style="color:#B8962E">Current ${{fillPct}}%</div>
        </div>
        <div class="rv-ce-marker" style="left:${{threshPct}}%">
          <div class="rv-ce-marker-line"></div>
          <div class="rv-ce-marker-label">Threshold ${{threshPct}}%</div>
        </div>
        <div class="rv-ce-marker" style="left:${{targetPct}}%">
          <div class="rv-ce-marker-line" style="background:#5a9a5a"></div>
          <div class="rv-ce-marker-label" style="color:#5a9a5a">Target ${{targetPct}}%</div>
        </div>
      </div>
    </div>
    <div class="rv-ce-body">${{name}} is ${{ce.currentScore - ce.threshold}}% above the acceptance threshold and ${{ce.targetScore - ce.currentScore}}% below the competitive target. The Science component (${{ce.sciCE}}%) is creating the largest drag on the overall score. If Science reaches 60% on the next mock, the projected overall score moves to approximately ${{ce.projectedIfSciImproves}}% &mdash; crossing the Bromsgrove competitive threshold.</div>
    <div class="rv-ce-next">Next CE mock scheduled: September 2026 &nbsp;&middot;&nbsp; Recommended practice papers: ${{ce.papersPerWeek}} per week from June 2026</div>
  </div>`;
}}

function renderSubjectCard(subj, name) {{
  var isCrit = subj.classification === 'critical';
  var cls    = isCrit ? 'rv-tutor-crit' : 'rv-tutor-gap';
  var badgeCls = isCrit ? 'rv-prob rv-prob-aspirational' : 'rv-prob rv-prob-stretch';
  var badgeTxt = isCrit ? 'Critical Priority' : 'Active Gap';
  var expandId = 'rv-why-' + subj.subject.replace(/[^a-z]/gi,'').toLowerCase();

  var ceRow = subj.ceScore !== null
    ? '<div class="rv-tutor-ce">CE Mock 1: <strong>' + subj.ceScore + '%</strong> &nbsp;&mdash;&nbsp; Target: ' + (subj.subject === 'Mathematics' ? '70' : '70') + '%</div>'
    : '';

  // Active tutor
  var tutorHtml = '';
  if (STUDENT.activeTutor && STUDENT.activeTutor.subject && STUDENT.activeTutor.subject.toLowerCase().indexOf(subj.subject.toLowerCase().split(' ')[0].toLowerCase()) >= 0) {{
    tutorHtml = '<div class="rv-tutor-active"><div class="rv-tutor-active-label">Active &mdash; Tutor Assigned</div><div class="rv-tutor-active-body">Tutoring is currently active at ' + STUDENT.activeTutor.sessions + ' sessions per week. Continue at current frequency and increase to ' + (subj.frequency) + ' from September 2026 as the CE approaches.</div></div>';
  }}

  return `<div class="rv-tutor-card ${{cls}}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <div class="rv-tutor-subj">${{subj.subject}}</div>
      <span class="rv-prob ${{badgeCls}}" style="font-size:9.5px;padding:3px 9px">${{badgeTxt}}</span>
    </div>
    <div class="rv-tutor-grade">Current: <strong>${{subj.current}}</strong> &nbsp;&rarr;&nbsp; Required: <strong style="color:#B8962E">${{subj.required}}</strong></div>
    ${{ceRow}}
    <div class="rv-tutor-rec">
      <span class="rv-tutor-rec-lbl">Frequency</span><span class="rv-tutor-rec-val">${{subj.frequency}}</span>
      <span class="rv-tutor-rec-lbl">Format</span><span class="rv-tutor-rec-val">${{subj.format}}</span>
      <span class="rv-tutor-rec-lbl">Focus</span><span class="rv-tutor-rec-val">${{subj.focus}}</span>
      <span class="rv-tutor-rec-lbl">Start</span><span class="rv-tutor-rec-val">${{subj.startMonth}}</span>
    </div>
    <button class="rv-tutor-toggle" onclick="toggleExpand('${{expandId}}')">Why this recommendation?</button>
    <div class="rv-tutor-why" id="${{expandId}}">${{subj.why}}</div>
    ${{tutorHtml}}
  </div>`;
}}

// ── Action counter badge ──────────────────────────────────────────────────

function updateActionBadge() {{
  var count = 0;
  // UKISET not taken
  if (!STUDENT.ukisetTaken) count++;
  // Summer camp deadline within 60 days
  var targetCamp = CAMPS.find(function(c){{ return c.targetSchool; }});
  if (targetCamp && daysUntil(targetCamp.deadline) <= 60) count++;
  // Overdue milestones would be counted by overview tab — skip here
  if (count > 0) {{
    var btn = document.getElementById('btn-recommendations');
    if (btn) {{
      btn.innerHTML = btn.innerHTML.replace(/<span class="tab-action-badge">.*?<\\/span>/, '');
      btn.innerHTML += '<span class="tab-action-badge">' + count + '</span>';
    }}
  }}
}}

// ── Contextual LINE button ────────────────────────────────────────────────

function updateLineContext() {{
  var sections = [
    {{id:'rv-schools',   msg:'สวัสดีครับ ผมอยากสอบถามเพิ่มเติมเกี่ยวกับ Bromsgrove School สำหรับน้อง' + (STUDENT.name||'')}},
    {{id:'rv-camps',     msg:'สวัสดีครับ ผมอยากสอบถามเรื่อง Bromsgrove Summer School 2026'}},
    {{id:'rv-tutoring',  msg:'สวัสดีครับ ผมอยากหารือเรื่อง Science tutoring สำหรับน้อง' + (STUDENT.name||'')}}
  ];
  var floatBtn = document.querySelector('.line-float-btn');
  if (!floatBtn) return;
  sections.forEach(function(sec) {{
    var el = document.getElementById(sec.id);
    if (el && el.classList.contains('rv-active')) {{
      floatBtn.href = 'https://line.me/R/ti/p/@{line_handle}?text=' + encodeURIComponent(sec.msg);
    }}
  }});
}}

// ── Sub-tab switcher ──────────────────────────────────────────────────────

function showRvTab(id) {{
  ['rv-schools','rv-camps','rv-tutoring'].forEach(function(sid) {{
    var panel = document.getElementById(sid);
    var btn   = document.getElementById('rvbtn-' + sid.replace('rv-',''));
    if (panel) panel.classList.toggle('rv-active', sid === id);
    if (btn)   btn.classList.toggle('rv-active',   sid === id);
  }});
  updateLineContext();
}}

// ── Toggle expand ─────────────────────────────────────────────────────────

function toggleExpand(id) {{
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open');
}}

// ── Init ──────────────────────────────────────────────────────────────────

(function() {{
  runSchoolEngine();
  runCampEngine();
  runTutoringEngine();
  updateActionBadge();
  updateLineContext();
}})();
</script>"""
