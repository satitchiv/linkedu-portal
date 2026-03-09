"""
LinkedU Golf — On-Course Reports tab for parent portal
"""
import json


def tab_golf_reports(student_id, student_name):
    sid_js = json.dumps(student_id)
    name_js = json.dumps(student_name)

    return f"""
<style>
/* ── Golf tab specific styles ─────────────────────────────────── */
.golf-sub-tabs{{display:flex;gap:0;margin-bottom:28px;background:#1a1a1a;border-radius:8px;padding:4px;}}
.golf-sub-btn{{flex:1;background:none;border:none;color:#f5f0e8;opacity:0.5;font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;padding:10px;cursor:pointer;border-radius:6px;transition:all 0.2s;min-height:42px}}
.golf-sub-btn.active{{background:#B8962E22;color:#B8962E;opacity:1;font-weight:600}}
.golf-sub-panel{{display:none}}.golf-sub-panel.active{{display:block}}

/* round list */
.round-row{{display:grid;grid-template-columns:1fr auto;align-items:center;padding:14px 0;border-bottom:1px solid #ece7df;cursor:pointer;transition:background 0.15s;gap:12px}}
.round-row:last-child{{border-bottom:none}}
.round-row:hover{{background:#faf7f3;margin:0 -8px;padding:14px 8px;border-radius:6px}}
.round-row-left{{display:flex;flex-direction:column;gap:3px}}
.round-date{{font-size:12px;color:#aaa}}
.round-course{{font-size:14px;font-weight:600;color:#1a1a1a}}
.round-row-right{{display:flex;flex-direction:column;align-items:flex-end;gap:4px}}
.round-score{{font-size:16px;font-weight:700;font-family:'Playfair Display',serif}}
.round-score.over{{color:#1a1a1a}}
.round-score.even{{color:#B8962E}}
.round-score.under{{color:#5a9a5a}}
.round-meta{{font-size:11px;color:#aaa}}
.round-type-badge{{font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;background:#f5f0e8;color:#888;border:1px solid #e0d9cd;white-space:nowrap}}

/* detail view */
.golf-detail-back{{color:#B8962E;font-size:13px;cursor:pointer;margin-bottom:20px;display:inline-flex;align-items:center;gap:6px;font-weight:500}}
.golf-detail-back:hover{{color:#d4aa3e}}
.detail-hero{{background:#1a1a1a;color:#f5f0e8;border-radius:10px;padding:28px;margin-bottom:24px}}
.detail-hero h2{{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:400;margin-bottom:6px}}
.detail-hero .meta{{font-size:12px;opacity:0.5;margin-bottom:14px}}
.detail-hero .pills{{display:flex;gap:8px;flex-wrap:wrap}}
.stat-tiles-grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}}
@media(min-width:600px){{.stat-tiles-grid{{grid-template-columns:repeat(4,1fr)}}}}
.stat-tile{{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:18px 14px;text-align:center}}
.stat-tile-val{{font-family:'Playfair Display',serif;font-size:1.8rem;line-height:1;margin-bottom:4px}}
.stat-tile-val.gold{{color:#B8962E}}
.stat-tile-val.green{{color:#5a9a5a}}
.stat-tile-label{{font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px}}
.stat-tile-note{{font-size:11px;color:#888;line-height:1.5;padding-top:8px;border-top:1px solid #ece7df;text-align:left}}

/* mental row */
.mental-row{{display:flex;gap:3px;flex-wrap:wrap;padding:14px 0}}
.mental-cell{{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;min-width:28px}}
.mental-emoji{{font-size:16px;line-height:1}}
.mental-hole-num{{font-size:9px;color:#aaa}}
.mental-note{{font-size:12px;color:#888;line-height:1.6;padding:12px 16px;background:#f9f6f1;border-radius:6px;border-left:2px solid #B8962E33;margin-top:4px}}

/* shot quality chart */
.quality-bar-row{{display:flex;align-items:center;gap:12px;margin-bottom:10px}}
.quality-bar-label{{font-size:12px;color:#555;width:52px;flex-shrink:0}}
.quality-bar-track{{flex:1;background:#ece7df;border-radius:4px;height:10px;overflow:hidden}}
.quality-bar-fill{{height:100%;border-radius:4px;transition:width 0.6s ease}}
.quality-bar-pct{{font-size:12px;color:#888;width:36px;text-align:right;flex-shrink:0}}

/* scorecard table */
.scorecard-table{{width:100%;border-collapse:collapse;font-size:12px}}
.scorecard-table th{{background:#1a1a1a;color:#f5f0e8;padding:10px 8px;text-align:center;font-weight:600;letter-spacing:0.05em;font-size:11px}}
.scorecard-table td{{padding:10px 8px;text-align:center;border-bottom:1px solid #ece7df}}
.scorecard-table tr:last-child td{{border-bottom:none}}
.scorecard-table tr:hover td{{background:#faf7f3}}
.sc-par{{color:#aaa;font-size:11px}}
.sc-score-over{{color:#ca6d6d;font-weight:600}}
.sc-score-even{{color:#1a1a1a;font-weight:600}}
.sc-score-under{{color:#5a9a5a;font-weight:600}}
.sc-score-birdie{{color:#B8962E;font-weight:700}}
.expand-row td{{background:#faf7f3;padding:14px;text-align:left;font-size:12px;color:#555}}
.shot-detail-row{{display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid #f0ebe2}}
.shot-detail-row:last-child{{border-bottom:none}}
.shot-num-badge{{background:#e0d9cd;color:#555;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;min-width:22px;text-align:center}}
.shot-club-tag{{font-weight:600;color:#1a1a1a;font-size:12px;min-width:36px}}
.shot-result-tag{{font-size:12px;color:#888}}
.shot-quality-tag{{font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600}}
.sq-pure{{background:#f0f7f0;color:#2d6a2d}}
.sq-ok{{background:#fff8e6;color:#8a6000}}
.sq-mishit{{background:#fdecea;color:#8a3030}}
.hole-note-display{{background:#f5f0e8;border-radius:6px;padding:10px 12px;margin-top:8px;font-size:12px;color:#555;line-height:1.6;font-style:italic}}
.notes-box{{background:#1a1a1a;border-radius:8px;padding:20px 22px;margin-bottom:12px}}
.notes-box-label{{font-size:10px;letter-spacing:0.15em;color:#B8962E;text-transform:uppercase;margin-bottom:10px;font-weight:600}}
.notes-box-text{{color:#f5f0e8;font-size:13px;line-height:1.8}}
.notes-gold-line{{color:#B8962E;font-size:12px;margin-top:14px;line-height:1.6}}

/* course comparison */
.course-comp-table{{width:100%;border-collapse:collapse;font-size:13px}}
.course-comp-table th{{background:#1a1a1a;color:#f5f0e8;padding:12px 14px;text-align:left;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase}}
.course-comp-table td{{padding:12px 14px;border-bottom:1px solid #ece7df}}
.course-comp-table tr:last-child td{{border-bottom:none}}
.course-comp-table tr:hover td{{background:#faf7f3}}
.best-badge{{background:#B8962E22;color:#B8962E;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;margin-left:6px;vertical-align:middle}}
.most-played-badge{{background:#1a1a1a;color:#f5f0e8;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;margin-left:6px;vertical-align:middle}}
.comp-note{{font-size:12px;color:#888;line-height:1.7;background:#f5f0e8;border-radius:6px;padding:14px 16px;margin-bottom:24px}}
.empty-state{{text-align:center;padding:60px 20px;color:#aaa}}
.empty-icon{{font-size:40px;margin-bottom:12px}}
.empty-title{{font-size:16px;color:#555;margin-bottom:8px}}
.empty-sub{{font-size:13px;line-height:1.6}}
.chart-wrap-golf{{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:20px;margin-bottom:16px}}
.chart-title{{font-size:12px;font-weight:600;color:#555;margin-bottom:14px;letter-spacing:0.05em;text-transform:uppercase}}
</style>

<div id="golf-root">
  <p class="sec-label">
    <span class="lang-en">On-Course Reports</span>
    <span class="lang-th">รายงานการเล่นสนาม</span>
  </p>

  <!-- sub-tab nav -->
  <div class="golf-sub-tabs">
    <button class="golf-sub-btn active" onclick="golfSubTab('history')">
      <span class="lang-en">Round History</span>
      <span class="lang-th">ประวัติการเล่น</span>
    </button>
    <button class="golf-sub-btn" onclick="golfSubTab('compare')">
      <span class="lang-en">Course Comparison</span>
      <span class="lang-th">เปรียบเทียบสนาม</span>
    </button>
  </div>

  <!-- PANEL: History -->
  <div id="golf-panel-history" class="golf-sub-panel active">
    <div id="golf-history-list"></div>
    <div id="golf-detail" style="display:none"></div>
  </div>

  <!-- PANEL: Course Comparison -->
  <div id="golf-panel-compare" class="golf-sub-panel">
    <div id="golf-compare-content"></div>
  </div>
</div>

<script src="/golf-storage.js"></script>
<script>
(function() {{

const STUDENT_ID   = {sid_js};
const STUDENT_NAME = {name_js};
let cachedRounds = [];

// ── Sub-tab navigation ─────────────────────────────────────────────────────
window.golfSubTab = function(id) {{
  document.querySelectorAll('.golf-sub-btn').forEach((b,i) => {{
    b.classList.toggle('active', ['history','compare'][i] === id);
  }});
  document.getElementById('golf-panel-history').classList.toggle('active', id === 'history');
  document.getElementById('golf-panel-compare').classList.toggle('active', id === 'compare');
  if (id === 'compare') renderCompare();
}};

// ── Format helpers ─────────────────────────────────────────────────────────
function fmtDate(iso) {{
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {{ day:'numeric', month:'short', year:'numeric' }});
}}

function stpStr(n) {{
  if (n === 0) return 'E';
  return n > 0 ? '+' + n : '' + n;
}}

function stpClass(n) {{
  if (n <= -1) return 'under';
  if (n === 0)  return 'even';
  return 'over';
}}

function mentalEmoji(m) {{
  return m <= 1.5 ? '😊' : m <= 2.5 ? '😐' : '😤';
}}

function fmtTeeClubs(breakdown) {{
  if (!breakdown || !Object.keys(breakdown).length) return '';
  return Object.entries(breakdown)
    .sort((a, b) => b[1].attempts - a[1].attempts)
    .map(([c, d]) => `${{c}}: ${{d.fairways}}/${{d.attempts}}`)
    .join(' · ');
}}

function fmtApproachClubs(breakdown) {{
  if (!breakdown || !Object.keys(breakdown).length) return '';
  return Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([c, n]) => `${{c}} ×${{n}}`)
    .join(' · ');
}}

function mentalLabel(m, lang) {{
  const labels = {{
    1: {{ en: 'Composed',       th: 'ใจเย็น' }},
    2: {{ en: 'Minor Reaction', th: 'ตอบสนองเล็กน้อย' }},
    3: {{ en: 'Struggled',      th: 'กดดัน' }}
  }};
  return (labels[m] || labels[1])[lang] || '';
}}

function roundTypeBadgeColor(rt) {{
  const m = {{ 'Ranked Tournament':'#B8962E22', 'Club Competition':'#1a1a1a' }};
  return m[rt] || '#f5f0e8';
}}

// ── Round list ─────────────────────────────────────────────────────────────
window.renderList = async function renderList() {{
  const listEl  = document.getElementById('golf-history-list');
  const detailEl= document.getElementById('golf-detail');
  listEl.style.display  = '';
  detailEl.style.display = 'none';
  try {{
    const resp = await fetch('/golf-api/rounds?student_id=' + encodeURIComponent(STUDENT_ID));
    cachedRounds = resp.ok ? ((await resp.json()).rounds || []) : [];
  }} catch(e) {{ cachedRounds = []; }}
  const rounds = cachedRounds;

  if (!rounds.length) {{
    listEl.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⛳</div>
      <div class="empty-title">
        <span class="lang-en">No rounds recorded yet</span>
        <span class="lang-th">ยังไม่มีข้อมูลการเล่น</span>
      </div>
      <div class="empty-sub">
        <span class="lang-en">Rounds tracked by your LINKEDU Golf analyst will appear here after each session.</span>
        <span class="lang-th">รายงานการเล่นจากนักวิเคราะห์ LINKEDU Golf จะปรากฏที่นี่หลังแต่ละรอบ</span>
      </div>
    </div>`;
    return;
  }}

  const rows = rounds.map((r, idx) => {{
    const comp = r.computed || GolfStorage.computeRoundStats(r);
    const stp  = comp.scoreToPar;
    const cls  = stpClass(stp);
    const mental = mentalEmoji(comp.mentalRatingAvg);
    return `<div class="round-row" onclick="renderDetail('${{r.roundId}}')">
      <div class="round-row-left">
        <div class="round-date">${{fmtDate(r.date)}}</div>
        <div class="round-course">${{r.course || '—'}}</div>
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;align-items:center">
          <span class="round-type-badge">${{r.roundType || ''}}</span>
          <span style="font-size:11px;color:#aaa">${{r.tees || ''}} tees · ${{r.conditions || ''}}</span>
        </div>
      </div>
      <div class="round-row-right">
        <div class="round-score ${{cls}}">${{comp.totalScore}} <span style="font-size:12px;opacity:0.7">(${{stpStr(stp)}})</span></div>
        <div class="round-meta">${{comp.totalPutts}} putts · ${{mental}}</div>
      </div>
    </div>`;
  }}).join('');

  listEl.innerHTML = `<div class="card" style="padding:0 16px">${{rows}}</div>`;
  renderProgressCharts(rounds);
}}

// ── Progress charts (shows when 3+ rounds) ─────────────────────────────────
function renderProgressCharts(rounds) {{
  const listEl = document.getElementById('golf-history-list');
  if (rounds.length < 3) return;

  const last10 = rounds.slice(0, 10).reverse();
  const labels = last10.map(r => fmtDate(r.date).slice(0,6));

  const comps  = last10.map(r => r.computed || GolfStorage.computeRoundStats(r));
  const scores = comps.map(c => c.totalScore);
  const putts  = comps.map(c => c.totalPutts);
  const girs   = comps.map(c => c.greensInRegulation);
  const mentals= comps.map(c => +(c.mentalRatingAvg).toFixed(1));

  const chartsHtml = `
    <p class="sec-label" style="margin-top:32px">
      <span class="lang-en">Progress Over Time</span>
      <span class="lang-th">พัฒนาการในระยะยาว</span>
    </p>
    <div class="chart-wrap-golf"><div class="chart-title">Scoring Average</div><canvas id="gc-score" height="80"></canvas></div>
    <div class="chart-wrap-golf"><div class="chart-title">Putts Per Round</div><canvas id="gc-putts" height="80"></canvas></div>
    <div class="chart-wrap-golf"><div class="chart-title">Greens in Regulation</div><canvas id="gc-gir" height="80"></canvas></div>
    <div class="chart-wrap-golf"><div class="chart-title">Mental Rating Average (1=Composed · 3=Struggled)</div><canvas id="gc-mental" height="80"></canvas></div>
    <div class="mental-note">
      <span class="lang-en">These charts show long-term trends, not judgements from any single round. Junior golfer development is rarely a straight line.</span>
      <span class="lang-th">กราฟเหล่านี้แสดงแนวโน้มในระยะยาว ไม่ใช่การตัดสินจากรอบใดรอบหนึ่ง การพัฒนาของนักกอล์ฟจูเนียร์ไม่ได้เป็นเส้นตรงเสมอไป</span>
    </div>`;

  listEl.insertAdjacentHTML('beforeend', chartsHtml);

  setTimeout(() => {{
    if (!window.Chart) return;
    const chartDefs = [
      {{ id:'gc-score',  data:scores,  color:'#B8962E', yReverse:false }},
      {{ id:'gc-putts',  data:putts,   color:'#5a7aba', yReverse:false }},
      {{ id:'gc-gir',    data:girs,    color:'#5a9a5a', yReverse:false }},
      {{ id:'gc-mental', data:mentals, color:'#ca6d6d', min:1, max:3 }},
    ];
    chartDefs.forEach(cd => {{
      const ctx = document.getElementById(cd.id);
      if (!ctx) return;
      const opts = {{
        type: 'line',
        data: {{
          labels,
          datasets: [{{ data:cd.data, borderColor:cd.color, backgroundColor:cd.color+'22',
            borderWidth:2, pointBackgroundColor:cd.color, pointRadius:4, fill:true, tension:0.3 }}]
        }},
        options: {{
          plugins:{{ legend:{{ display:false }} }},
          scales:{{
            y:{{ min:cd.min, max:cd.max, ticks:{{font:{{size:11}},color:'#aaa'}}, grid:{{color:'#f0ebe2'}} }},
            x:{{ ticks:{{font:{{size:10}},color:'#aaa'}}, grid:{{display:false}} }}
          }}
        }}
      }};
      new Chart(ctx, opts);
    }});
  }}, 100);
}}

// ── Round detail ───────────────────────────────────────────────────────────
window.renderDetail = function(roundId) {{
  const round = cachedRounds.find(r => r.roundId === roundId);
  if (!round) return;
  const comp  = round.computed || GolfStorage.computeRoundStats(round);
  const stp   = comp.scoreToPar;
  const cls   = stpClass(stp);

  document.getElementById('golf-history-list').style.display = 'none';
  const detailEl = document.getElementById('golf-detail');
  detailEl.style.display = 'block';

  // Section 1: hero card
  const heroHtml = `
    <div class="detail-hero">
      <h2>${{round.course || '—'}}</h2>
      <div class="meta">${{fmtDate(round.date)}} · ${{round.tees || ''}} tees · ${{round.weather || ''}} · ${{round.conditions || ''}}</div>
      <div class="pills">
        <span class="pill pill-gold">${{round.roundType || ''}}</span>
        <span class="pill pill-light">Score: ${{comp.totalScore}} (${{stpStr(stp)}})</span>
      </div>
    </div>`;

  // Section 2: stat tiles
  const tilesHtml = `
    <p class="sec-label"><span class="lang-en">At a Glance</span><span class="lang-th">ภาพรวมสถิติ</span></p>
    <div class="stat-tiles-grid">
      <div class="stat-tile">
        <div class="stat-tile-label"><span class="lang-en">Score to Par</span><span class="lang-th">สกอร์เทียบพาร์</span></div>
        <div class="stat-tile-val ${{stp <= 0 ? 'gold' : ''}}">${{stpStr(stp)}}</div>
        <div class="stat-tile-note">
          <span class="lang-en">Score to par shows how your child performed relative to the course standard. Always consider course difficulty and conditions when reading this number.</span>
          <span class="lang-th">คะแนนเทียบกับพาร์บอกให้รู้ว่าลูกเล่นได้ดีแค่ไหนในแต่ละสนาม ตัวเลขนี้ควรดูร่วมกับความยากของสนามและสภาพอากาศ</span>
        </div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-label"><span class="lang-en">Fairways Hit</span><span class="lang-th">แฟร์เวย์</span></div>
        <div class="stat-tile-val">${{comp.fairwaysHit}}/${{comp.fairwaysApplicable}}</div>
        <div class="stat-tile-note">
          ${{fmtTeeClubs(comp.teeClubBreakdown) ? `<div style="font-size:11px;color:#B8962E;font-weight:600;margin-bottom:6px">${{fmtTeeClubs(comp.teeClubBreakdown)}}</div>` : ''}}
          <span class="lang-en">Fairways hit per club off the tee. Helps identify whether misses come from the driver or a specific club.</span>
          <span class="lang-th">แฟร์เวย์ที่ตีได้แยกตามไม้ที่ใช้ออก ช่วยระบุว่าการพลาดมาจากไม้ตัวใด</span>
        </div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-label"><span class="lang-en">Greens in Reg.</span><span class="lang-th">GIR</span></div>
        <div class="stat-tile-val">${{comp.greensInRegulation}}/18</div>
        <div class="stat-tile-note">
          ${{fmtApproachClubs(comp.approachClubBreakdown) ? `<div style="font-size:11px;color:#B8962E;font-weight:600;margin-bottom:6px">Approach: ${{fmtApproachClubs(comp.approachClubBreakdown)}}</div>` : ''}}
          <span class="lang-en">Greens reached in regulation, with the approach clubs used. Shows which irons are performing well on approach.</span>
          <span class="lang-th">จำนวนกรีนที่เข้าถึงตามกำหนด พร้อมไม้ที่ใช้ตีเข้ากรีน แสดงให้เห็นว่าเหล็กตัวใดทำงานได้ดีในช็อตเข้ากรีน</span>
        </div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-label"><span class="lang-en">Total Putts</span><span class="lang-th">พัตต์รวม</span></div>
        <div class="stat-tile-val">${{comp.totalPutts}}</div>
        <div class="stat-tile-note">
          <span class="lang-en">Total putts reflect green performance. A good benchmark for juniors is 30–36 putts per round depending on level.</span>
          <span class="lang-th">จำนวนพัตต์รวมบอกถึงทักษะบนกรีน ค่าเฉลี่ยที่ดีสำหรับจูเนียร์คือ 30–36 พัตต์ต่อรอบ ขึ้นอยู่กับระดับ</span>
        </div>
      </div>
    </div>`;

  // Section 3: mental game
  const mentalRow = (round.holes || []).map((h, i) => {{
    const emoji = h.mentalRating === 3 ? '😤' : h.mentalRating === 2 ? '😐' : '😊';
    return `<div class="mental-cell"><div class="mental-emoji">${{emoji}}</div><div class="mental-hole-num">${{i+1}}</div></div>`;
  }}).join('');

  const mentalHtml = `
    <p class="sec-label"><span class="lang-en">Mental Game</span><span class="lang-th">จิตใจในการเล่น</span></p>
    <div class="card" style="padding:16px">
      <div class="mental-row">${{mentalRow}}</div>
      <div class="mental-note">
        <span class="lang-en">Tracking mental response hole-by-hole helps coaches understand how your child handles pressure. Please discuss this section directly with your LINKEDU Golf coach rather than drawing your own conclusions.</span>
        <span class="lang-th">การติดตามสภาพจิตใจในแต่ละหลุมช่วยให้โค้ชเข้าใจว่าลูกรับมือกับแรงกดดันได้อย่างไร ผลลัพธ์ในส่วนนี้ควรพูดคุยกับโค้ช LINKEDU Golf โดยตรง ไม่ควรนำไปสรุปด้วยตนเอง</span>
      </div>
    </div>`;

  // Section 4: shot quality
  const qb  = comp.qualityBreakdown;
  const tot = qb.pure + qb.ok + qb.mishit || 1;
  const pPure  = Math.round(100 * qb.pure   / tot);
  const pOk    = Math.round(100 * qb.ok     / tot);
  const pMis   = Math.round(100 * qb.mishit / tot);

  const qualityHtml = `
    <p class="sec-label"><span class="lang-en">Shot Quality</span><span class="lang-th">คุณภาพการตีช็อต</span></p>
    <div class="card">
      <div class="quality-bar-row">
        <div class="quality-bar-label">👍 Pure</div>
        <div class="quality-bar-track"><div class="quality-bar-fill" style="width:${{pPure}}%;background:#5a9a5a"></div></div>
        <div class="quality-bar-pct">${{pPure}}%</div>
      </div>
      <div class="quality-bar-row">
        <div class="quality-bar-label">👌 OK</div>
        <div class="quality-bar-track"><div class="quality-bar-fill" style="width:${{pOk}}%;background:#c9a830"></div></div>
        <div class="quality-bar-pct">${{pOk}}%</div>
      </div>
      <div class="quality-bar-row">
        <div class="quality-bar-label">👎 Mishit</div>
        <div class="quality-bar-track"><div class="quality-bar-fill" style="width:${{pMis}}%;background:#ca6d6d"></div></div>
        <div class="quality-bar-pct">${{pMis}}%</div>
      </div>
      <div class="mental-note" style="margin-top:12px">
        <span class="lang-en">This shows overall shot consistency across the round. Improvement here comes with time and consistent practice.</span>
        <span class="lang-th">สัดส่วนนี้ให้ภาพรวมของความสม่ำเสมอในการตีช็อตทั้งรอบ การพัฒนาในส่วนนี้ต้องใช้เวลาและการฝึกซ้อมอย่างต่อเนื่อง</span>
      </div>
    </div>`;

  // Section 5: hole-by-hole scorecard
  const scorecardRows = (round.holes || []).map((h, i) => {{
    const diff = h.score - h.par;
    const cls  = diff < -1 ? 'sc-score-birdie' : diff === -1 ? 'sc-score-birdie' : diff === 0 ? 'sc-score-even' : diff > 0 ? 'sc-score-over' : 'sc-score-under';
    const diffStr = diff === 0 ? '' : (diff > 0 ? '+' : '') + diff;
    const hasNote = h.noteText || h.noteAudioUrl;
    const hasMedia = h.media && h.media.length;
    return `<tr onclick="toggleHoleExpand(this, '${{round.roundId}}', ${{i}})">
      <td><strong>${{h.holeNumber}}</strong></td>
      <td class="sc-par">${{h.par}}</td>
      <td class="${{cls}}">${{h.score}} <span style="font-size:10px;opacity:0.7">${{diffStr}}</span></td>
      <td>${{h.putts}}</td>
      <td>${{h.mentalRating === 3 ? '😤' : h.mentalRating === 2 ? '😐' : '😊'}}</td>
      <td>${{hasNote || hasMedia ? '📎' : ''}}</td>
    </tr>`;
  }}).join('');

  const front9  = round.holes ? round.holes.slice(0,9).reduce((s,h)=>s+(h.score||0),0) : 0;
  const back9   = round.holes ? round.holes.slice(9,18).reduce((s,h)=>s+(h.score||0),0) : 0;
  const totalPar = round.holes ? round.holes.reduce((s,h)=>s+(h.par||4),0) : 72;

  const scorecardHtml = `
    <p class="sec-label"><span class="lang-en">Hole-by-Hole Scorecard</span><span class="lang-th">สกอร์การ์ดแต่ละหลุม</span></p>
    <div class="card" style="padding:0;overflow:hidden">
      <table class="scorecard-table">
        <thead><tr>
          <th>Hole</th><th>Par</th><th>Score</th><th>Putts</th><th>Mind</th><th>Note</th>
        </tr></thead>
        <tbody id="scorecard-body-${{round.roundId}}">
          ${{scorecardRows}}
          <tr style="background:#1a1a1a">
            <td style="color:#f5f0e8;font-weight:600">Total</td>
            <td style="color:#888">${{totalPar}}</td>
            <td style="color:#B8962E;font-weight:700">${{comp.totalScore}} (${{stpStr(stp)}})</td>
            <td style="color:#f5f0e8">${{comp.totalPutts}}</td>
            <td></td><td></td>
          </tr>
        </tbody>
      </table>
    </div>`;

  // Section 6: club usage
  const clubs = comp.clubsUsed;
  const clubTotal = Object.values(clubs).reduce((a,b)=>a+b,0) || 1;
  const clubsSorted = Object.entries(clubs).sort((a,b)=>b[1]-a[1]);
  const clubBars = clubsSorted.map(([c,n]) => {{
    const pct = Math.round(100 * n / clubTotal);
    return `<div class="quality-bar-row">
      <div class="quality-bar-label" style="width:52px;font-size:12px;font-weight:600">${{c}}</div>
      <div class="quality-bar-track"><div class="quality-bar-fill" style="width:${{pct}}%;background:#B8962E"></div></div>
      <div class="quality-bar-pct" style="width:52px">${{n}}x</div>
    </div>`;
  }}).join('');

  const clubHtml = `
    <p class="sec-label">
      <span class="lang-en">Clubs Used This Round</span>
      <span class="lang-th">คลับที่ใช้ในรอบนี้</span>
    </p>
    <div class="card">${{clubBars || '<div style="color:#aaa;font-size:13px">No shot data recorded.</div>'}}</div>`;

  // Section 7: analyst notes
  const hasCoachRec   = round.coachRecommendation && round.coachRecommendation.trim();
  const hasDebriefNotes = round.debriefNotes && round.debriefNotes.trim();
  const hasRoundAudio = round.roundAudioUrl;

  const notesHtml = `
    <p class="sec-label"><span class="lang-en">Analyst Notes</span><span class="lang-th">บันทึกจากนักวิเคราะห์</span></p>
    <div class="notes-box">
      <div class="notes-box-label">
        <span class="lang-en">Notes from Your LINKEDU Golf Analyst</span>
        <span class="lang-th">บันทึกจากนักวิเคราะห์ LINKEDU Golf</span>
      </div>
      ${{hasCoachRec ? `<div class="notes-box-text"><strong style="color:#B8962E;font-size:11px;letter-spacing:0.1em;text-transform:uppercase">Coach Recommendation</strong><br><br>${{round.coachRecommendation}}</div>` : ''}}
      ${{hasDebriefNotes ? `<div class="notes-box-text" style="margin-top:14px;padding-top:14px;border-top:1px solid #2a2a2a"><strong style="color:#B8962E;font-size:11px;letter-spacing:0.1em;text-transform:uppercase">Student Debrief</strong><br><br>${{round.debriefNotes}}</div>` : ''}}
      ${{!hasCoachRec && !hasDebriefNotes ? '<div style="color:#555;font-size:13px">No notes recorded for this round.</div>' : ''}}
      <div class="notes-gold-line">
        <span class="lang-en">All observations should be discussed with your child&#39;s coach before adjusting any training plan.</span>
        <span class="lang-th">ข้อมูลทั้งหมดนี้ควรนำไปพูดคุยกับโค้ชของลูกก่อนปรับแผนการฝึกซ้อม</span>
      </div>
    </div>
    ${{hasRoundAudio ? `
      <div class="card" style="margin-top:12px">
        <div class="profile-label" style="margin-bottom:10px">
          <span class="lang-en">Round Voice Memo</span>
          <span class="lang-th">บันทึกเสียงหลังรอบ</span>
        </div>
        <audio src="${{round.roundAudioUrl}}" controls style="width:100%"></audio>
      </div>` : ''}}`;

  // Assemble everything
  detailEl.innerHTML = `
    <div class="golf-detail-back" onclick="renderList()">← <span class="lang-en">Back to rounds</span><span class="lang-th">กลับไปรายการ</span></div>
    ${{heroHtml}}
    ${{tilesHtml}}
    ${{mentalHtml}}
    ${{qualityHtml}}
    ${{scorecardHtml}}
    ${{clubHtml}}
    ${{notesHtml}}`;
}};

// ── Hole expand ─────────────────────────────────────────────────────────────
const expandedHoles = {{}};
window.toggleHoleExpand = function(row, roundId, holeIdx) {{
  const key    = roundId + '_' + holeIdx;
  const round  = cachedRounds.find(r => r.roundId === roundId);
  if (!round) return;
  const hole   = round.holes[holeIdx];

  // Remove any existing expand row after this tr
  const next = row.nextElementSibling;
  if (next && next.classList.contains('expand-row')) {{
    next.remove();
    delete expandedHoles[key];
    return;
  }}

  const shots = (hole.shots || []).map(s => `
    <div class="shot-detail-row">
      <span class="shot-num-badge">${{s.shotNumber}}</span>
      <span class="shot-club-tag">${{s.club}}</span>
      <span class="shot-result-tag">→ ${{s.result}}</span>
      <span class="shot-quality-tag sq-${{(s.quality||'').toLowerCase()}}">${{s.quality}}</span>
      ${{s.contactType && s.contactType !== 'Normal' ? `<span style="font-size:10px;color:#aaa">${{s.contactType}}</span>` : ''}}
    </div>`).join('');

  const media = (hole.media || []).map(m =>
    m.type === 'photo'
      ? `<img src="${{m.url}}" style="height:80px;border-radius:6px;border:1px solid #e0d9cd;object-fit:cover">`
      : `<div style="height:80px;width:80px;background:#f5f0e8;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:24px;border:1px solid #e0d9cd">🎥</div>`
  ).join('');

  const noteHtml = hole.noteText
    ? `<div class="hole-note-display">${{hole.noteText}}</div>`
    : hole.noteAudioUrl
      ? `<audio src="${{hole.noteAudioUrl}}" controls style="width:100%;margin-top:8px"></audio>`
      : '';

  const expandRow = document.createElement('tr');
  expandRow.className = 'expand-row';
  expandRow.innerHTML = `<td colspan="6">
    <div style="padding:4px 0">
      ${{shots || '<div style="color:#aaa;font-size:12px">No shots logged.</div>'}}
      ${{noteHtml}}
      ${{media ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${{media}}</div>` : ''}}
    </div>
  </td>`;

  row.parentNode.insertBefore(expandRow, row.nextSibling);
  expandedHoles[key] = true;
}};

// ── Course stats (local computation from cached rounds) ─────────────────────
function computeCourseStats(rounds) {{
  const byC = {{}};
  rounds.forEach(r => {{
    const c = r.course || 'Unknown';
    if (!byC[c]) byC[c] = {{ course: c, rounds: [], scoreToPars: [], putts: [], girs: [] }};
    const comp = r.computed || GolfStorage.computeRoundStats(r);
    byC[c].rounds.push(r);
    byC[c].scoreToPars.push(comp.scoreToPar);
    byC[c].putts.push(comp.totalPutts);
    byC[c].girs.push(comp.greensInRegulation);
  }});
  return Object.values(byC).map(d => {{
    const avg = arr => arr.length ? Math.round(10*arr.reduce((a,b)=>a+b,0)/arr.length)/10 : null;
    return {{ course:d.course, roundCount:d.rounds.length,
      avgScoreToPar:avg(d.scoreToPars), avgPutts:avg(d.putts), avgGIR:avg(d.girs), rounds:d.rounds }};
  }}).sort((a,b) => b.roundCount - a.roundCount);
}}

// ── Course comparison ───────────────────────────────────────────────────────
async function renderCompare() {{
  const el = document.getElementById('golf-compare-content');
  if (!cachedRounds.length) {{
    try {{
      const resp = await fetch('/golf-api/rounds?student_id=' + encodeURIComponent(STUDENT_ID));
      cachedRounds = resp.ok ? ((await resp.json()).rounds || []) : [];
    }} catch(e) {{ cachedRounds = []; }}
  }}
  const courseStats = computeCourseStats(cachedRounds);

  if (!courseStats.length) {{
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🏌️</div>
      <div class="empty-title">
        <span class="lang-en">No course data yet</span>
        <span class="lang-th">ยังไม่มีข้อมูลสนาม</span>
      </div>
    </div>`;
    return;
  }}

  // Find best avg score to par (lowest)
  const bestAvg     = Math.min(...courseStats.filter(c=>c.avgScoreToPar!==null).map(c=>c.avgScoreToPar));
  const bestCourse  = courseStats.find(c=>c.avgScoreToPar===bestAvg);
  const mostPlayed  = courseStats[0];

  const rows = courseStats.map(cs => {{
    const isBest   = bestCourse && cs.course === bestCourse.course;
    const isMost   = cs.course === mostPlayed.course;
    const stpAvg   = cs.avgScoreToPar !== null ? stpStr(Math.round(cs.avgScoreToPar)) : '—';
    return `<tr>
      <td style="font-weight:600">
        ${{cs.course}}
        ${{isBest  ? '<span class="best-badge">Best Score</span>'    : ''}}
        ${{isMost  ? '<span class="most-played-badge">Most Played</span>' : ''}}
      </td>
      <td style="text-align:center">${{cs.roundCount}}</td>
      <td style="text-align:center;font-weight:600;color:${{cs.avgScoreToPar<=0?'#5a9a5a':'#1a1a1a'}}">${{stpAvg}}</td>
      <td style="text-align:center">${{cs.avgPutts !== null ? cs.avgPutts.toFixed(1) : '—'}}</td>
      <td style="text-align:center">${{cs.avgGIR  !== null ? cs.avgGIR.toFixed(1)  : '—'}}</td>
    </tr>`;
  }}).join('');

  // Trend charts for courses with 3+ rounds
  const trendCourses = courseStats.filter(cs => cs.roundCount >= 3);
  const trendChartsHtml = trendCourses.map((cs, i) => {{
    const sorted = cs.rounds.slice().sort((a,b)=>a.date.localeCompare(b.date));
    const labels  = sorted.map(r=>fmtDate(r.date).slice(0,6));
    const data    = sorted.map(r=>{{const c=r.computed||GolfStorage.computeRoundStats(r);return c.scoreToPar;}});
    return `<div class="chart-wrap-golf">
      <div class="chart-title">${{cs.course}} — Scoring Trend</div>
      <canvas id="gc-trend-${{i}}" height="80"></canvas>
    </div>`;
  }}).join('');

  el.innerHTML = `
    <div class="comp-note">
      <span class="lang-en">Comparing results across courses helps identify where your child performs most confidently and where opportunities exist. Consult your LINKEDU Golf coach to plan the right practice course schedule.</span>
      <span class="lang-th">การเปรียบเทียบผลในหลายสนามช่วยให้เห็นว่าลูกถนัดสนามประเภทใด และสนามไหนที่ยังมีโอกาสพัฒนา ปรึกษาผู้เชี่ยวชาญ LINKEDU Golf เพื่อวางแผนเลือกสนามฝึกซ้อมที่เหมาะสม</span>
    </div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:24px">
      <table class="course-comp-table">
        <thead><tr>
          <th>Course</th>
          <th style="text-align:center">Rounds</th>
          <th style="text-align:center">Avg Score to Par</th>
          <th style="text-align:center">Avg Putts</th>
          <th style="text-align:center">Avg GIR</th>
        </tr></thead>
        <tbody>${{rows}}</tbody>
      </table>
    </div>
    ${{trendChartsHtml}}`;

  if (!window.Chart) return;
  setTimeout(() => {{
    trendCourses.forEach((cs, i) => {{
      const ctx = document.getElementById('gc-trend-' + i);
      if (!ctx) return;
      const sorted = cs.rounds.slice().sort((a,b)=>a.date.localeCompare(b.date));
      const labels = sorted.map(r=>fmtDate(r.date).slice(0,6));
      const data   = sorted.map(r=>{{const c=r.computed||GolfStorage.computeRoundStats(r);return c.scoreToPar;}});
      new Chart(ctx, {{
        type:'line',
        data:{{ labels, datasets:[{{ data, borderColor:'#B8962E', backgroundColor:'#B8962E22',
          borderWidth:2, pointBackgroundColor:'#B8962E', pointRadius:4, fill:true, tension:0.3 }}] }},
        options:{{
          plugins:{{ legend:{{display:false}} }},
          scales:{{
            y:{{ ticks:{{font:{{size:11}},color:'#aaa',callback: v => stpStr(v)}}, grid:{{color:'#f0ebe2'}} }},
            x:{{ ticks:{{font:{{size:10}},color:'#aaa'}}, grid:{{display:false}} }}
          }}
        }}
      }});
    }});
  }}, 100);
}}

// ── Init ───────────────────────────────────────────────────────────────────
renderList();

// Re-render when tab becomes active (catch lazy activation)
const observer = new MutationObserver(() => {{
  const panel = document.getElementById('tab-golf');
  if (panel && panel.style.display !== 'none') renderList();
}});
const tabGolf = document.getElementById('tab-golf');
if (tabGolf) observer.observe(tabGolf, {{ attributes: true, attributeFilter: ['style'] }});

}})();
</script>
"""
