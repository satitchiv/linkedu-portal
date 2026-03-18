// TODO: Replace all localStorage calls with API calls to backend when ready.
// All read/write functions are isolated here to make migration straightforward.

const GolfStorage = (() => {
  const ROUNDS_KEY       = 'linkedu_golf_rounds';
  const IN_PROGRESS_KEY  = 'linkedu_golf_inprogress';
  const STUDENTS_KEY     = 'linkedu_golf_students';

  // ── Round CRUD ─────────────────────────────────────────────────────────────

  function getAllRounds() {
    try { return JSON.parse(localStorage.getItem(ROUNDS_KEY) || '[]'); }
    catch(e) { return []; }
  }

  function saveRound(round) {
    const rounds = getAllRounds();
    const idx = rounds.findIndex(r => r.roundId === round.roundId);
    if (idx >= 0) rounds[idx] = round;
    else rounds.push(round);
    localStorage.setItem(ROUNDS_KEY, JSON.stringify(rounds));
    // Also save to server so all devices see it
    const _pin = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('analyst_pin') : null) || '';
    fetch('/api/golf-rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Analyst-Pin': _pin },
      body: JSON.stringify({ student_id: round.studentId, ...round })
    }).catch(() => {});
  }

  function getRoundsByStudent(studentId) {
    return getAllRounds()
      .filter(r => r.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function getRoundById(roundId) {
    return getAllRounds().find(r => r.roundId === roundId) || null;
  }

  function deleteRound(roundId) {
    const rounds = getAllRounds().filter(r => r.roundId !== roundId);
    localStorage.setItem(ROUNDS_KEY, JSON.stringify(rounds));
  }

  // ── In-progress round ──────────────────────────────────────────────────────

  function saveInProgress(round) {
    localStorage.setItem(IN_PROGRESS_KEY, JSON.stringify(round));
  }

  function getInProgress() {
    try { return JSON.parse(localStorage.getItem(IN_PROGRESS_KEY)); }
    catch(e) { return null; }
  }

  function clearInProgress() {
    localStorage.removeItem(IN_PROGRESS_KEY);
  }

  // ── Student registry ───────────────────────────────────────────────────────

  function getStudents() {
    try { return JSON.parse(localStorage.getItem(STUDENTS_KEY) || '[]'); }
    catch(e) { return []; }
  }

  function saveStudents(students) {
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
  }

  // ── Stats computation ──────────────────────────────────────────────────────

  function computeRoundStats(round) {
    const holes = round.holes || [];

    const totalScore  = holes.reduce((s, h) => s + (h.score || 0), 0);
    const totalPar    = holes.reduce((s, h) => s + (h.par   || 4), 0);
    const scoreToPar  = totalScore - totalPar;
    const totalPutts  = holes.reduce((s, h) => s + (h.putts || 0), 0);

    // Fairways: applicable on par-4 and par-5 holes
    let fairwaysHit = 0, fairwaysApplicable = 0;
    holes.forEach(h => {
      if ((h.par || 4) >= 4) {
        fairwaysApplicable++;
        const teeShot = (h.shots || [])[0];
        if (teeShot && teeShot.result === 'Fairway') fairwaysHit++;
      }
    });

    // GIR: reached green in (par - 2) shots or fewer
    let greensInRegulation = 0;
    holes.forEach(h => {
      const par    = h.par   || 4;
      const putts  = h.putts || 0;
      const score  = h.score || 0;
      if (score > 0 && putts >= 0) {
        if ((score - putts) <= (par - 2)) greensInRegulation++;
      }
    });

    const front9Score = holes.slice(0, 9).reduce( (s, h) => s + (h.score || 0), 0);
    const back9Score  = holes.slice(9, 18).reduce((s, h) => s + (h.score || 0), 0);

    const mentalRatings  = holes.map(h => h.mentalRating || 1);
    const mentalRatingAvg = mentalRatings.length
      ? Math.round(10 * mentalRatings.reduce((a, b) => a + b, 0) / mentalRatings.length) / 10
      : 1;

    const clubsUsed = {};
    let pure = 0, ok = 0, mishit = 0;
    holes.forEach(h => {
      (h.shots || []).forEach(s => {
        clubsUsed[s.club] = (clubsUsed[s.club] || 0) + 1;
        if      (s.quality === 'Pure')   pure++;
        else if (s.quality === 'OK')     ok++;
        else if (s.quality === 'Mishit') mishit++;
      });
    });

    // Tee club breakdown: for par-4 & par-5 holes, which club was used off the tee
    // and how many fairways each club hit
    const teeClubBreakdown = {}; // { club: { attempts, fairways } }
    holes.forEach(h => {
      if ((h.par || 4) >= 4) {
        const teeShot = (h.shots || [])[0];
        if (teeShot && teeShot.club && teeShot.club !== 'Putter') {
          const c = teeShot.club;
          if (!teeClubBreakdown[c]) teeClubBreakdown[c] = { attempts: 0, fairways: 0 };
          teeClubBreakdown[c].attempts++;
          if (teeShot.result === 'Fairway') teeClubBreakdown[c].fairways++;
        }
      }
    });

    // Approach club breakdown: on GIR holes, which club was the last non-putter shot
    const approachClubBreakdown = {}; // { club: count }
    holes.forEach(h => {
      const par   = h.par   || 4;
      const putts = h.putts || 0;
      const score = h.score || 0;
      if (score > 0 && (score - putts) <= (par - 2)) {
        // GIR achieved — find last non-putter shot (the approach)
        const shots = (h.shots || []).slice().reverse();
        const approach = shots.find(s => s.club && s.club !== 'Putter');
        if (approach) {
          approachClubBreakdown[approach.club] = (approachClubBreakdown[approach.club] || 0) + 1;
        }
      }
    });

    return {
      totalScore, scoreToPar, totalPutts,
      fairwaysHit, fairwaysApplicable,
      greensInRegulation,
      front9Score, back9Score,
      mentalRatingAvg,
      mentalByHole: mentalRatings,
      clubsUsed,
      qualityBreakdown: { pure, ok, mishit },
      teeClubBreakdown,
      approachClubBreakdown
    };
  }

  // ── Course comparison stats ────────────────────────────────────────────────

  function getCourseStats(studentId) {
    const rounds = getRoundsByStudent(studentId);
    const byC = {};
    rounds.forEach(r => {
      const c = r.course || 'Unknown';
      if (!byC[c]) byC[c] = { course: c, rounds: [], scoreToPars: [], putts: [], girs: [] };
      const comp = r.computed || computeRoundStats(r);
      byC[c].rounds.push(r);
      byC[c].scoreToPars.push(comp.scoreToPar);
      byC[c].putts.push(comp.totalPutts);
      byC[c].girs.push(comp.greensInRegulation);
    });
    return Object.values(byC).map(d => {
      const avg = arr => arr.length ? Math.round(10 * arr.reduce((a,b)=>a+b,0)/arr.length)/10 : null;
      return {
        course:        d.course,
        roundCount:    d.rounds.length,
        avgScoreToPar: avg(d.scoreToPars),
        avgPutts:      avg(d.putts),
        avgGIR:        avg(d.girs),
        rounds:        d.rounds
      };
    }).sort((a, b) => b.roundCount - a.roundCount);
  }

  // ── ID generation ──────────────────────────────────────────────────────────

  function generateId() {
    return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    getAllRounds, saveRound, getRoundsByStudent, getRoundById, deleteRound,
    saveInProgress, getInProgress, clearInProgress,
    getStudents, saveStudents,
    computeRoundStats, getCourseStats,
    generateId
  };
})();
