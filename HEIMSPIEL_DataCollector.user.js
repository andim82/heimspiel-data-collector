// ==UserScript==
// @name         HEIM:SPIEL Website Data Collector
// @namespace    https://heimspiel.de
// @version      29.1.0
// @description  Strukturiertes Auslesen von Procyclingstats.com Daten für die HEIM:SPIEL Datenbank
// @author       HEIM:SPIEL
// @match        https://www.procyclingstats.com/race/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_info
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/andim82/heimspiel-data-collector/main/HEIMSPIEL_DataCollector.user.js
// @downloadURL  https://raw.githubusercontent.com/andim82/heimspiel-data-collector/main/HEIMSPIEL_DataCollector.user.js
// ==/UserScript==

(function () {
  'use strict';

  const LOGO_URL = 'https://heimspiel.de/wp-content/uploads/2022/09/logo-weiss-transparent-rgb.png';

  const INTERNAL_VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '0.0.0';
  const DISPLAY_VERSION = `1.0.${INTERNAL_VERSION.replace(/\./g, '')}`;

  const MRA_OPTIONS = [
    { id: '0',  label: 'AT:0 – Zeit Einzelwertung (Stage)' },
    { id: '32', label: 'AT:32 – Punkte Sprint (Today)' },
    { id: '31', label: 'AT:31 – Punkte Bergwertung (Today)' },
    { id: '33', label: 'AT:33 – Nachwuchswertung (Today)' },
    { id: '34', label: 'AT:34 – Zeit Teamwertung (Today)' },
    { id: '40', label: 'AT:40 – Fahrerwertung Teamzeitfahren' },
    { id: '41', label: 'AT:41 – Startliste' },
    { id: '61', label: 'AT:61 – Einzelwertung gesamt (GC)' },
    { id: '62', label: 'AT:62 – Bergwertung gesamt (KOM)' },
    { id: '63', label: 'AT:63 – Sprintwertung gesamt (Points)' },
    { id: '64', label: 'AT:64 – Teamwertung gesamt' },
    { id: '65', label: 'AT:65 – Nachwuchswertung gesamt (Youth)' },
  ];

  const TYPE_LABELS = {
    stage: 'Stage (Tagesergebnis)', gc: 'GC (Gesamtklassement)',
    points: 'Punktewertung', kom: 'Bergwertung (KOM)',
    youth: 'Jugendwertung (Youth)', teams: 'Teamwertung',
    startlist: 'Startliste', unknown: 'Unbekannte Seite',
  };

  const MRA_MAP = {
    stage:     { general: '0',  today: '0' },
    gc:        { general: '61', today: '61' },
    points:    { general: '63', today: '32' },
    kom:       { general: '62', today: '31' },
    youth:     { general: '65', today: '33' },
    teams:     { general: '64', today: '34' },
    startlist: { general: '41', today: '41' },
    unknown:   { general: '0',  today: '0' },
  };

  const HAS_TODAY = new Set(['points', 'kom', 'youth', 'teams']);

  const TIME_MRAS   = new Set(['0','34','40','61','65','64','33']);
  const POINTS_MRAS = new Set(['32','31','62','63']);

  // Non-numeric result/status markers (DNS/DNF/DNQ/DSQ/OTL/NR) that in the
  // AAA V1 export must be moved into the "comment" column instead of
  // "match_result".
  const STATUS_MARKERS = /^(dns|dnf|dnq|dsq|otl|nr)$/i;

  // ─── URL DETECTION ────────────────────────────────────────────────────────

  function detectPageType() {
    const u = window.location.pathname.toLowerCase();
    if (u.includes('/startlist')) return 'startlist';
    if (u.match(/stage-\d+-gc$/)) return 'gc';
    if (u.match(/stage-\d+-points$/)) return 'points';
    if (u.match(/stage-\d+-kom$/)) return 'kom';
    if (u.match(/stage-\d+-youth$/)) return 'youth';
    if (u.match(/stage-\d+-teams-gc$/)) return 'teams';
    if (u.match(/stage-\d+$/)) return 'stage';
    return 'unknown';
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  function slugify(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 \-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function isSameTimeMarker(t) {
    const s = (t || '').trim();
    return s === ',,' || s === ',' || s === '″' || s === '"' || s === "''" || s === '';
  }

  function isTTFormat(t) {
    return /^\d{1,3}\.\d{2},\d{2}$/.test((t || '').trim());
  }

  function parseTTTime(raw) {
    const m = raw.trim().match(/^(\d+)\.(\d{2}),\d{2}$/);
    if (!m) return raw;
    const totalMin = parseInt(m[1], 10);
    const h  = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    const ss = parseInt(m[2], 10);
    return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  }

  function parseTTGap(raw) {
    const m = raw.trim().match(/^(\d+)\.(\d{2}),\d{2}$/);
    if (!m) return '+' + raw;
    return `+${String(parseInt(m[1],10)).padStart(2,'0')}:${String(parseInt(m[2],10)).padStart(2,'0')}`;
  }

  function extractTimeText(td) {
    if (!td) return '';
    const clone = td.cloneNode(true);
    clone.querySelectorAll('span,sup,sub,img,svg').forEach(el => el.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  function dedupeTime(t) {
    if (!t) return t;
    let s = t.trim();
    s = s.replace(/[\*\u2217\u204e\uff0a]/g, '+');
    if (s.length % 2 === 0) {
      const half = s.length / 2;
      if (s.slice(0, half) === s.slice(half)) return s.slice(0, half);
    }
    const m1 = s.match(/^([+]?\d+:\d{2}:\d{2})\1$/);
    if (m1) return m1[1];
    const m2 = s.match(/^([+]?\d+:\d{2})\1$/);
    if (m2) return m2[1];
    return s;
  }

  // ─── VISIBILITY ───────────────────────────────────────────────────────────

  function isVisible(el) {
    if (!el) return false;
    if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
    try {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    } catch(e) { return false; }
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      try {
        const ps = window.getComputedStyle(parent);
        if (ps.display === 'none' || ps.visibility === 'hidden') return false;
      } catch(e) { return false; }
      parent = parent.parentElement;
    }
    return true;
  }

  // ─── DOM HELPERS ──────────────────────────────────────────────────────────

  function cleanCellText(td) {
    if (!td) return '';
    const clone = td.cloneNode(true);
    clone.querySelectorAll('img,svg,span.flag,span[class*="icon"],span[class*="nat"],span[class*="flag"],sup,sub').forEach(e => e.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  function extractTeamName(td, riderTd) {
    // CONFIRMED PCS-SIDE DATA BUG: on some result rows (e.g. rank-trend
    // tables with "Prev"/"▼▲"/"Time won/lost" columns), the dedicated
    // team <td class="cu600"> can contain a swapped/incorrect team link —
    // verified via live DOM inspection where two adjacent riders had their
    // team <td> contents literally exchanged with each other. However,
    // PCS ALSO independently embeds the rider's correct team name in a
    // hidden mobile-only element inside the RIDER cell itself:
    // <div class="showIfMobile ..."> Team Name </div>, sitting right next
    // to that rider's name/link — and this value has been confirmed
    // correct in the buggy rows. We therefore prefer that mobile div's
    // text (scoped to the SAME row/rider) whenever it is present, and
    // only fall back to the dedicated team <td> when it's missing.
    if (riderTd) {
      const mobileDiv = riderTd.querySelector('.showIfMobile');
      if (mobileDiv) {
        const t = extractVisibleText(mobileDiv).trim();
        if (t) return t;
      }
      const directText = cleanCellText(riderTd);
      const m = directText.match(/([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*\s*[-|]\s*[A-Z].*)$/);
      if (m && m[1]) return m[1].trim();
    }
    if (!td) return '';
    // PCS can embed MULTIPLE <a> links in the team cell for riders with an
    // already-announced transfer (e.g. a hidden old/future-team link plus
    // the visible current-team link). querySelector('a') would blindly grab
    // whichever link comes FIRST in the DOM, regardless of visibility —
    // if that happens to be the hidden one, the wrong team gets extracted
    // (e.g. rider shown under a team they no longer/not yet ride for).
    // We therefore prefer the first genuinely VISIBLE link, and only fall
    // back to the first link in the DOM if none are visible.
    const links = Array.from(td.querySelectorAll('a'));
    const visibleLink = links.find(l => isVisible(l));
    const a = visibleLink || links[0];
    if (a) return extractVisibleText(a);
    return cleanCellText(td);
  }

  // ─── VISIBLE-TEXT EXTRACTION ────────────────────────────────────────────────
  // PCS occasionally embeds a HIDDEN nested element inside a rider/team link
  // (e.g. a future/transfer team badge for riders with an already-announced
  // team change, hidden via CSS display:none/visibility:hidden but still
  // present in the DOM). el.textContent reads that hidden text too, which
  // silently corrupts the scraped name by appending an unrelated team name
  // directly after it (no separator) — e.g. "Martinez LennyBahrain - Victorious".
  // This walks the DOM tree and only concatenates text from nodes that are
  // actually visible, filtering out any such hidden artefacts robustly.
  function extractVisibleText(el) {
    if (!el) return '';
    let out = '';
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // PCS duplicates the team name inside the rider-name cell for the
        // mobile view via <div class="showIfMobile">Teamname</div>. On
        // narrow viewports/zoom levels the media query makes this element
        // GENUINELY visible, so isVisible() lets it through and the team
        // name gets appended directly to the rider name with no separator
        // (e.g. "Martinez LennyBahrain - Victorious"). This element is
        // therefore always excluded, regardless of its actual visibility.
        if (child.classList && child.classList.contains('showIfMobile')) continue;
        if (!isVisible(child)) continue;
        out += extractVisibleText(child);
      }
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  // ─── KNOWN TEAM NAMES (robust suffix-stripping) ──────────────────────────
  // PCS sometimes concatenates a team name directly onto the rider name
  // with no separator (e.g. "Martinez LennyBahrain - Victorious"). This
  // can happen via a sibling mobile-duplicate <div> or other DOM quirks
  // that the visibility-based filtering in extractVisibleText() cannot
  // reliably catch in every layout. As a robust safety net, we read the
  // full, authoritative list of team names in this race from the
  // "all teams" filter dropdown (present on every PCS results page) and
  // strip any such known team name if it appears appended to a rider name.
  let _knownTeamNamesCache = null;
  function getKnownTeamNames() {
    if (_knownTeamNamesCache) return _knownTeamNamesCache;
    const opts = Array.from(document.querySelectorAll('select.filterResults[data-type="team"] option'))
      .map(o => (o.textContent || '').trim())
      .filter(t => t && t.toLowerCase() !== 'all teams');
    _knownTeamNamesCache = opts.sort((a, b) => b.length - a.length);
    return _knownTeamNamesCache;
  }

  function stripKnownTeamSuffix(name, teamNameHint) {
    if (!name) return name;
    let result = name;
    const hint = (teamNameHint || '').trim();
    if (hint && result.endsWith(hint) && result.length > hint.length) {
      return result.slice(0, result.length - hint.length).trim();
    }
    const known = getKnownTeamNames();
    for (const t of known) {
      if (t && result.endsWith(t) && result.length > t.length) {
        return result.slice(0, result.length - t.length).trim();
      }
    }
    return result;
  }

    function extractRiderName(riderTd, teamName) {
    if (!riderTd) return '';
    const riderLink = riderTd.querySelector('a[href*="/rider/"]');
    if (riderLink) return stripKnownTeamSuffix(extractVisibleText(riderLink), teamName);
    const raw  = cleanCellText(riderTd);
    const team = (teamName || '').trim();
    if (team && raw.endsWith(team)) return raw.slice(0, raw.length - team.length).trim();
    if (team && raw.includes(team)) return raw.slice(0, raw.indexOf(team)).trim();
    return stripKnownTeamSuffix(raw, teamName);
  }

  // ─── RIDER NAME SPLIT (for AAA V1 export: "NACHNAME Vorname") ─────────────
  // PCS marks the surname with <span class="uppercase">Nachname</span> Vorname
  // inside the rider link. When present, this gives a 100% reliable split.
  // Some rows (rare PCS inconsistency) omit the span entirely — in that case
  // we fall back to a heuristic (last word = firstname, everything before it
  // = surname), which matches PCS's own naming convention. The surname is
  // ALWAYS forced to upper case in the output, regardless of source casing,
  // per editorial requirement.
  function splitNameHeuristic(full) {
    const parts = (full || '').trim().split(/\s+/);
    if (parts.length < 2) return { surname: (full||'').toUpperCase(), firstname: '', full: full||'' };
    const firstname = parts[parts.length - 1];
    const surname = parts.slice(0, -1).join(' ').toUpperCase();
    return { surname, firstname, full };
  }

  function extractRiderNameParts(riderTd, teamName) {
    if (!riderTd) return { surname: '', firstname: '', full: '' };
    const riderLink = riderTd.querySelector('a[href*="/rider/"]');

    if (riderLink) {
      const rawFull = extractVisibleText(riderLink);
      const full = stripKnownTeamSuffix(rawFull, teamName);
      const upperSpan = riderLink.querySelector('span.uppercase');
      if (upperSpan && isVisible(upperSpan)) {
        const surname = extractVisibleText(upperSpan).toUpperCase();
        const clone = riderLink.cloneNode(true);
        const spanClone = clone.querySelector('span.uppercase');
        if (spanClone) spanClone.remove();
        // Re-derive firstname from the already-hidden-filtered `full` string
        // by stripping the surname prefix, instead of reading textContent
        // off the clone (which would reintroduce any hidden nested text).
        // `full` has already had any appended team-name suffix stripped.
        const upperText = extractVisibleText(upperSpan);
        const firstname = full.startsWith(upperText)
          ? stripKnownTeamSuffix(full.slice(upperText.length).trim(), teamName)
          : stripKnownTeamSuffix(full.replace(surname, '').trim(), teamName);
        return { surname, firstname, full };
      }
      return splitNameHeuristic(full);
    }

    const raw  = cleanCellText(riderTd);
    const team = (teamName || '').trim();
    let full = raw;
    if (team && raw.endsWith(team)) full = raw.slice(0, raw.length - team.length).trim();
    else if (team && raw.includes(team)) full = raw.slice(0, raw.indexOf(team)).trim();
    full = stripKnownTeamSuffix(full, teamName);
    return splitNameHeuristic(full);
  }

  // ─── COLUMN MAP ───────────────────────────────────────────────────────────

  function getColMap(table) {
    let hrow = table.querySelector('thead tr') || table.querySelector('tr');
    if (!hrow) return null;
    const cells = Array.from(hrow.querySelectorAll('th,td'));
    const map = { total: cells.length };
    cells.forEach((c, i) => {
      const t = c.textContent.trim().toLowerCase();
      if ((t==='rnk'||t==='rank'||t==='#') && map.rnk===undefined)     map.rnk   = i;
      else if ((t==='rider'||t==='name') && map.rider===undefined)      map.rider = i;
      else if (t==='team' && map.team===undefined)                      map.team  = i;
      else if (t==='uci' && map.uci===undefined)                        map.uci   = i;
      else if ((t==='pnt'||t==='pts') && map.pnt===undefined)           map.pnt   = i;
      else if ((t==='time'||t==='zeit') && map.time===undefined)        map.time  = i;
      else if ((t==='bonis'||t==='bonus') && map.bonus===undefined)     map.bonus = i;
      else if (t==='prev' && map.prev===undefined)                      map.prev  = i;
      else if ((t==='▲▼'||t==='trend') && map.trend===undefined)        map.trend = i;
    });
    return (map.rider!==undefined && map.team!==undefined) ? map : null;
  }

  // ─── FIND VISIBLE RESULTS TABLE ───────────────────────────────────────────

  function findVisibleResultsTable() {
    // PCS can render TWO different eligible result tables for the same
    // GC/points/kom page: the plain results table, and a "history/trend"
    // variant (columns "prev", "▼▲" rank-change arrows, "time won/lost")
    // with a confirmed PCS-side data bug where adjacent same-bib rows can
    // have swapped rider/team pairings. Between two otherwise-equal
    // candidates, the plain one is always preferred.
    const isTrendTable = (t) => !!t.querySelector('td.time_wonlost, a.TimeWonLostFromRider');

    // AUTHORITATIVE SIGNAL: PCS wraps each tab's whole results panel in
    // <div class="resTab" data-id="..."> inside <div id="resultsCont">.
    // The INACTIVE tab's panel carries an extra "hide" class AND an inline
    // style="display: none" (confirmed via live DOM inspection); the
    // ACTIVE tab's panel (matching whatever tab — GC/Stage/Points/KOM —
    // the user currently has open) has neither. This is a structural
    // PCS-authored marker of "which tab is currently selected", unlike
    // generic computed-style visibility checks, which can be fooled by
    // unrelated CSS (overflow containers, animations, etc.) and were the
    // root cause of earlier regressions in this function. Restrict the
    // search to tables inside the active resTab panel whenever one exists.
    let searchRoots = [document];
    const resultsCont = document.getElementById('resultsCont');
    if (resultsCont) {
      const activeTabs = Array.from(resultsCont.querySelectorAll(':scope > div.resTab'))
        .filter(d => !d.classList.contains('hide') && d.style.display !== 'none');
      if (activeTabs.length) searchRoots = activeTabs;
    }

    let candidates = [];
    for (const root of searchRoots) {
      for (const t of root.querySelectorAll('table')) {
        const map = getColMap(t);
        if (!map) continue;
        const bodyRows = Array.from(t.querySelectorAll('tbody tr'));
        let hasRankRow = false;
        for (const row of bodyRows) {
          const rnkTxt = (row.querySelectorAll('td')[map.rnk!==undefined?map.rnk:0]?.textContent||'').trim();
          if (/^\d+$/.test(rnkTxt)||/^(dns|dnf|dnq|nr|dsq|otl)$/i.test(rnkTxt)) { hasRankRow=true; break; }
        }
        if (!hasRankRow) continue;
        const rowCount = bodyRows.length;
        candidates.push({ t, rowCount, trend: isTrendTable(t), visible: isVisible(t) });
      }
    }
    if (!candidates.length) return null;
    // Secondary tie-breaker (only relevant if the active resTab panel
    // itself contains more than one qualifying table, e.g. plain + trend
    // variant nested together): prefer visible over hidden, then plain
    // over trend, then more rows over fewer.
    const visibleCands = candidates.filter(c => c.visible);
    const pool = visibleCands.length ? visibleCands : candidates;
    const plain = pool.filter(c => !c.trend);
    const finalPool = plain.length ? plain : pool;
    finalPool.sort((a,b) => b.rowCount - a.rowCount);
    return finalPool[0].t;
  }

  // ─── TEAMS TABLE ──────────────────────────────────────────────────────────

  function scrapeTeamsTable(mraId) {
    for (const t of document.querySelectorAll('table')) {
      if (!isVisible(t)) continue;
      const hrow = t.querySelector('thead tr') || t.querySelector('tr');
      if (!hrow) continue;
      const headers = Array.from(hrow.querySelectorAll('th,td')).map(c=>c.textContent.trim().toLowerCase());
      const hasRnk = headers.some(h=>h==='rnk'||h==='rank');
      const hasTeam = headers.some(h=>h==='team');
      const hasRider= headers.some(h=>h==='rider'||h==='name');
      if (!hasRnk || !hasTeam) continue;
      if (hasRider) continue;

      const visRows = Array.from(t.querySelectorAll('tbody tr')).filter(r=>isVisible(r));
      if (!visRows.length) continue;

      const cmap = {};
      headers.forEach((h,i)=>{
        if (h==='rnk'||h==='rank') cmap.rnk=i;
        if (h==='team') cmap.team=i;
        if (h==='time'||h==='zeit') cmap.time=i;
        if (h==='+time'||h==='+ time'||h==='+zeit'||h==='gap') cmap.gap=i;
      });

      const entries=[],deferred=[];
      let maxRank=0, isTT=false;

      const hasGapCol = cmap.gap!==undefined;

      if (!hasGapCol && cmap.time!==undefined) {
        for (const row of visRows) {
          const raw=extractTimeText(row.querySelectorAll('td')[cmap.time]);
          if (raw&&!isSameTimeMarker(raw)){isTT=isTTFormat(raw);break;}
        }
      }

      for (const row of visRows) {
        const tds=row.querySelectorAll('td');
        if (tds.length<2) continue;
        if (Array.from(tds).some(td=>parseInt(td.getAttribute('colspan')||'1')>2)) continue;
        const rnkRaw=(tds[cmap.rnk!==undefined?cmap.rnk:0]?.textContent||'').trim();
        if (!rnkRaw||/^[-–▲▼]+$/.test(rnkRaw)||rnkRaw.toLowerCase()==='rnk') continue;
        const isNonNumeric=!/^\d+$/.test(rnkRaw);
        const rankNum=isNonNumeric?null:parseInt(rnkRaw,10);
        if (rankNum!==null&&rankNum>maxRank) maxRank=rankNum;
        const teamTd=tds[cmap.team];
        const teamName=extractTeamName(teamTd);
        if (!teamName) continue;
        let resultValue='';
        if (hasGapCol) {
          if (rankNum===1 && cmap.time!==undefined && tds[cmap.time]) {
            resultValue = dedupeTime(extractTimeText(tds[cmap.time])).replace(/\.\d+$/, '');
          } else if (tds[cmap.gap]) {
            const gapRaw = dedupeTime(extractTimeText(tds[cmap.gap]));
            if (!isSameTimeMarker(gapRaw)) {
              resultValue = gapRaw.startsWith('+') ? gapRaw : (gapRaw ? '+'+gapRaw : '');
            }
          }
        } else if (cmap.time!==undefined&&tds[cmap.time]) {
          const raw=dedupeTime(extractTimeText(tds[cmap.time]));
          if (!isSameTimeMarker(raw)) {
            resultValue=isTT?(entries.length===0?parseTTTime(raw):parseTTGap(raw)):raw;
          }
        }
        if (isNonNumeric) deferred.push({rankText:rnkRaw,rankNum:null,isNonNumeric:true,riderName:teamName,teamName,resultValue:rnkRaw});
        else entries.push({rankText:rnkRaw,rankNum,isNonNumeric:false,riderName:teamName,teamName,resultValue});
      }

      let nextRank=maxRank+1;
      for (const e of deferred){e.rankNum=nextRank++;entries.push(e);}

      if (!hasGapCol) {
        let last='';
        for (let i=0;i<entries.length;i++){
          const e=entries[i];
          if (e.resultValue && !isSameTimeMarker(e.resultValue)) {
            last=e.resultValue;
          } else {
            e.resultValue = '';
            if (i===1 && last) { e.resultValue='0:00'; last='0:00'; }
            else e.resultValue=last;
          }
        }
        for (let i=1;i<entries.length;i++) {
          const v=entries[i].resultValue;
          if (v && !v.startsWith('+') && /^\d/.test(v)) entries[i].resultValue='+'+v;
        }
      }

      if (entries.length) return { entries, error: null };
    }
    return { entries: [], error: null };
  }

  // ─── TEAMS TIME LIST (TTT block-list layout, no <table>) ──────────────────

  function scrapeTeamsTimeList() {
    const teamLinks = Array.from(document.querySelectorAll('li a[href^="team/"], li a[href*="/team/"]'))
      .filter(a => isVisible(a) && extractVisibleText(a).length >= 3);
    if (!teamLinks.length) return { entries: [], error: null };

    const entries = [];
    const seenTeams = new Set();

    for (const link of teamLinks) {
      const li = link.closest('li');
      if (!li || seenTeams.has(li)) continue;

      const teamName = extractVisibleText(link);
      if (!teamName) continue;

      let rankBlock = link.closest('div.w50, div[class*="w50"]');
      let rankNum = null;
      if (rankBlock) {
        const rankDiv = rankBlock.querySelector('div.w10, div[class*="w10"]');
        const rnkTxt = (rankDiv?.textContent || '').trim();
        if (/^\d+$/.test(rnkTxt)) rankNum = parseInt(rnkTxt, 10);
      }
      if (rankNum === null) continue;

      let resultValue = '';
      const timeSpeedBlock = rankBlock ? rankBlock.parentElement?.querySelector('.timeSpeed') : null;
      if (timeSpeedBlock) {
        const timeDiv = timeSpeedBlock.querySelector('.time');
        const gapDiv = timeDiv ? timeDiv.nextElementSibling : null;
        if (rankNum === 1) {
          const rawTime = dedupeTime((timeDiv?.textContent || '').trim());
          resultValue = rawTime.replace(/\.\d+$/, '');
        } else {
          const gapRaw = dedupeTime((gapDiv?.textContent || '').trim());
          if (gapRaw && !isSameTimeMarker(gapRaw)) {
            resultValue = gapRaw.startsWith('+') ? gapRaw : '+' + gapRaw;
          }
        }
      }

      seenTeams.add(li);
      entries.push({ riderName: teamName, teamName, rankNum, resultValue });
    }

    entries.sort((a, b) => a.rankNum - b.rankNum);
    return { entries, error: entries.length ? null : 'Keine Team-Zeiten gefunden.' };
  }

  // ─── SCRAPE MAIN TABLE ────────────────────────────────────────────────────

  // innerText liefert nur sichtbar gerenderten Text (respektiert
  // display:none/visibility:hidden und die tatsaechliche Render-Reihenfolge).
  // Versteckte Duplikat-/Trend-Zeilen mit vertauschten Rider-Bloecken
  // (bekannter PCS-Bug, siehe isTrendTable/time_wonlost) werden dadurch
  // automatisch ignoriert, weil sie nie visuell angezeigt werden. Das
  // Ergebnis dient als autoritative Referenz fuer Rang->Fahrername-Zuordnung.
  function getVisibleRowOrder(table) {
    const raw = table.innerText || '';
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const rowOrder = [];
    for (const line of lines) {
      const rnkMatch = line.match(/^(\d+)\b/);
      if (!rnkMatch) continue;
      rowOrder.push({ rankNum: parseInt(rnkMatch[1], 10), lineText: line });
    }
    return rowOrder;
  }

  // Gleicht die per DOM extrahierten `entries` (koennen bei bestimmten
  // Raengen falsch gepaarte Rider/Team-Bloecke enthalten, ein bestaetigter
  // PCS-seitiger Bug in bestimmten Tabellen-Varianten) gegen die
  // innerText-Ground-Truth ab. Fuer jeden Rang wird geprueft, ob der
  // DOM-ermittelte Rider-Name tatsaechlich in der sichtbar gerenderten
  // Zeile fuer diesen Rang vorkommt. Ist das nicht der Fall, wird der
  // korrekte Identity-Block (Name, Team, nameParts) aus der Zeile eines
  // ANDEREN Rangs uebernommen, der textlich passt - Rang und Zeit bleiben
  // dabei unangetastet, da diese laut Analyse bereits korrekt sind.
  function reconcileWithVisibleOrder(entries, table) {
    const rowOrder = getVisibleRowOrder(table);
    if (!rowOrder.length) return entries;

    const byRank = {};
    rowOrder.forEach(r => { byRank[r.rankNum] = r.lineText; });

    const usedIdx = new Set();

    for (const e of entries) {
      const lineText = byRank[e.rankNum];
      if (!lineText) continue;

      const nameGuess = (e.nameParts && e.nameParts.full) ? e.nameParts.full : e.riderName;
      if (nameGuess && lineText.includes(nameGuess)) continue; // bereits korrekt

      // Rider passt NICHT zur sichtbaren Zeile dieses Rangs -> suche, welcher
      // andere Eintrag textlich zu dieser Zeile passt, und tausche die
      // Identity-Bloecke (nicht rankNum/resultValue) zwischen beiden Zeilen.
      for (let j = 0; j < entries.length; j++) {
        if (usedIdx.has(j)) continue;
        const other = entries[j];
        if (other.rankNum === e.rankNum) continue;
        const otherLine = byRank[other.rankNum];
        if (!otherLine) continue;
        const otherNameGuess = (other.nameParts && other.nameParts.full) ? other.nameParts.full : other.riderName;
        if (otherNameGuess && lineText.includes(otherNameGuess)) {
          const tmpName = e.riderName, tmpTeam = e.teamName, tmpParts = e.nameParts;
          e.riderName = other.riderName; e.teamName = other.teamName; e.nameParts = other.nameParts;
          other.riderName = tmpName; other.teamName = tmpTeam; other.nameParts = tmpParts;
          usedIdx.add(j);
          break;
        }
      }
    }
    return entries;
  }

  function scrapeTable(table, mraId) {
    const map = getColMap(table);
    if (!map) return {entries:[],error:'Keine Rider/Team-Spalten erkannt.'};

    const isTime   = TIME_MRAS.has(mraId);
    const isPoints = POINTS_MRAS.has(mraId);

    let isTT=false;
    if (isTime && map.time!==undefined) {
      for (const row of table.querySelectorAll('tbody tr')) {
        const tds=row.querySelectorAll('td');
        if (tds.length<3) continue;
        const raw=extractTimeText(tds[map.time]);
        if (raw&&!isSameTimeMarker(raw)){isTT=isTTFormat(raw);break;}
      }
    }

    let maxRank=0;
    const entries=[],deferred=[];

    for (const row of table.querySelectorAll('tbody tr')) {
      // NOTE: rows are intentionally NOT filtered by isVisible(row) here.
      // findVisibleResultsTable() can legitimately select a table that PCS
      // currently keeps CSS-hidden (display:none up the ancestor chain)
      // while a different, buggy "trend" table is toggled visible instead
      // — the hidden one is still the authoritative, correct data source.
      // isVisible(row) checks the full ancestor chain, so it would reject
      // every single row of a hidden-but-selected table and produce zero
      // entries ("Keine sichtbaren Einträge gefunden"). Row-level noise
      // (stray non-data rows) is already filtered below by rankRaw/tds
      // checks, so this extra visibility gate is both redundant and wrong.
      const tds=row.querySelectorAll('td');
      if (tds.length<3) continue;
      if (Array.from(tds).some(td=>parseInt(td.getAttribute('colspan')||'1')>2)) continue;

      const rnkIdx=map.rnk!==undefined?map.rnk:0;
      const rankRaw=(tds[rnkIdx]?.textContent||'').trim();
      if (!rankRaw||/^[-–▲▼]+$/.test(rankRaw)||rankRaw.toLowerCase()==='rnk') continue;

      const isNonNumeric=!/^\d+$/.test(rankRaw);
      const rankNum=isNonNumeric?null:parseInt(rankRaw,10);
      if (rankNum!==null&&rankNum>maxRank) maxRank=rankNum;

      // Locate the rider/team cells by CONTENT (their characteristic link),
      // not by fixed column index. A single row with an extra/missing cell
      // (e.g. jersey icon, sponsor badge) shifts tds[] positions only for
      // that row, which previously caused rider+team to be read from the
      // wrong cell for adjacent rows (rank/time stayed correct, rider and
      // team got mismatched/swapped). This is robust regardless of the
      // exact cell count in any given row.
      const riderLinkEl = row.querySelector('a[href*="/rider/"]');
      const riderTdActual = riderLinkEl ? riderLinkEl.closest('td') : tds[map.rider];
      const teamLinkEl = row.querySelector('a[href*="/team/"]');
      const teamTdActual = teamLinkEl ? teamLinkEl.closest('td') : tds[map.team];

      const teamName=extractTeamName(teamTdActual, riderTdActual);
      if (!teamName) continue;
      const riderName=extractRiderName(riderTdActual,teamName);
      if (!riderName||riderName.length>60) continue;
      if (/relegated|from \d+th to \d+/i.test(riderName)) continue;
      const nameParts=extractRiderNameParts(riderTdActual,teamName);

      let resultValue='';
      if (isTime) {
        if (map.time!==undefined&&tds[map.time]) {
          const raw=dedupeTime(extractTimeText(tds[map.time]));
          if (!isSameTimeMarker(raw)) {
            resultValue=isTT?(entries.length===0?parseTTTime(raw):parseTTGap(raw)):raw;
            if (entries.length===0) resultValue=resultValue.replace(/\.\d+$/, '');
          }
        }
      } else if (isPoints) {
        if (map.pnt!==undefined&&tds[map.pnt]) {
          const v=tds[map.pnt].textContent.trim();
          if (/^-?\d+$/.test(v)) resultValue=v;
        }
        if (!resultValue&&map.pnt===undefined) {
          const skipCols=new Set([map.rnk,map.prev,map.trend,map.uci,map.bonus,map.time].filter(x=>x!==undefined));
          for (let i=tds.length-1;i>(map.rnk||0)+1;i--) {
            if (skipCols.has(i)) continue;
            const v=tds[i].textContent.trim();
            if (/^\d+$/.test(v)){resultValue=v;break;}
          }
        }
      }

      if (isNonNumeric) deferred.push({rankText:rankRaw,rankNum:null,isNonNumeric:true,riderName,teamName,resultValue:rankRaw,nameParts});
      else entries.push({rankText:rankRaw,rankNum,isNonNumeric:false,riderName,teamName,resultValue,nameParts});
    }

    let nextRank=maxRank+1;
    for (const e of deferred){e.rankNum=nextRank++;entries.push(e);}

    if (isTime) {
      // Fill same-time markers:
      // Rank 1  → keep winner time as-is
      // Rank 2  → if PCS shows empty (same as winner) → '0:00'; also updates
      //           the reference so rank 3+ inherit "same as leader" (0:00),
      //           not the winner's absolute time.
      // Rank 3+ → empty/marker → fill with last known real time
      // After fill: prefix '+' to all follow-up times (ranks 2+)
      let last='';
      for (let i=0;i<entries.length;i++) {
        const e=entries[i];
        if (e.resultValue && !isSameTimeMarker(e.resultValue)) {
          last=e.resultValue;
        } else {
          e.resultValue = '';
          if (i===1 && last) {
            e.resultValue='0:00';
            last='0:00';
          } else {
            e.resultValue=last;
          }
        }
      }
      for (let i=1;i<entries.length;i++) {
        const v=entries[i].resultValue;
        if (v && !v.startsWith('+') && /^\d/.test(v)) {
          entries[i].resultValue='+'+v;
        }
      }
    }

    if (isTime) {
      // Ground-Truth-Abgleich gegen den sichtbar gerenderten Text der
      // Tabelle, um den bestaetigten PCS-Bug (vertauschte Rider/Team-
      // Bloecke bei bestimmten benachbarten Raengen) zu korrigieren.
      reconcileWithVisibleOrder(entries, table);
    }

    return {entries,error:entries.length?null:'Keine sichtbaren Einträge gefunden.'};
  }

  // ─── SCRAPE TODAY POINTS (multi-table sum) ────────────────────────────────

  function scrapeTodayPoints() {
    const totals={}, riderNames={}, teamNames={}, ridersParts={};
    let tablesFound=0;

    for (const table of document.querySelectorAll('table')) {
      if (!isVisible(table)) continue;
      const map=getColMap(table);
      if (!map||map.pnt===undefined||map.rider===undefined||map.team===undefined) continue;
      const visRows=Array.from(table.querySelectorAll('tbody tr')).filter(r=>isVisible(r));
      if (visRows.length>25) continue;
      if (!visRows.some(r=>/^\d+$/.test((r.querySelectorAll('td')[map.rnk!==undefined?map.rnk:0]?.textContent||'').trim()))) continue;

      tablesFound++;

      for (const row of visRows) {
        const tds=row.querySelectorAll('td');
        if (tds.length<=map.pnt) continue;
        if (!/^\d+$/.test((tds[map.rnk!==undefined?map.rnk:0]?.textContent||'').trim())) continue;

        const riderLinkEl2 = row.querySelector('a[href*="/rider/"]');
        const riderTdActual2 = riderLinkEl2 ? riderLinkEl2.closest('td') : tds[map.rider];
        const teamLinkEl2 = row.querySelector('a[href*="/team/"]');
        const teamTdActual2 = teamLinkEl2 ? teamLinkEl2.closest('td') : tds[map.team];

        const teamName=extractTeamName(teamTdActual2, riderTdActual2);
        const riderLink=riderTdActual2?.querySelector('a[href*="/rider/"]');
        const riderKey=riderLink?riderLink.getAttribute('href').split('/rider/')[1]||'':null;
        const riderName=riderLink
          ?stripKnownTeamSuffix(extractVisibleText(riderLink),teamName)
          :extractRiderName(riderTdActual2,teamName);
        if (!riderName||!teamName) continue;

        const pts=parseInt(tds[map.pnt].textContent.trim(),10);
        if (isNaN(pts)||pts<=0) continue;

        const key=riderKey||slugify(riderName);
        if (!totals[key]){
          totals[key]=0;
          riderNames[key]=riderName;
          teamNames[key]=teamName;
          ridersParts[key]=extractRiderNameParts(riderTdActual2,teamName);
        }
        totals[key]+=pts;
      }
    }

    if (tablesFound===0) return [];

    const sorted=Object.entries(totals)
      .map(([key,pts])=>({riderName:riderNames[key],teamName:teamNames[key],resultValue:pts,nameParts:ridersParts[key]}))
      .sort((a,b)=>b.resultValue-a.resultValue);

    let rank=1;
    for (let i=0;i<sorted.length;i++) {
      sorted[i].rankNum=(i>0&&sorted[i].resultValue===sorted[i-1].resultValue)?sorted[i-1].rankNum:rank;
      rank++;
    }
    return sorted;
  }

  // ─── STARTLIST ────────────────────────────────────────────────────────────

  function scrapeStartlist() {
    const entries = [], seen = new Set();

    const KNOWN_BAD_PREFIXES = new Set(['DS','TT','GC','GP','TDF','UCI','CX','MTB','TTT']);

    function isValidRiderName(name) {
      if (!name || name.length < 6 || name.length > 65) return false;
      const parts = name.trim().split(/\s+/);
      if (parts.length < 2) return false;

      const firstnameParts = [];
      for (let i = parts.length - 1; i >= 0; i--) {
        const w = parts[i];
        if (!w || !w[0].match(/[A-Za-z\u00C0-\u024F]/)) return false;
        const wNorm = w.replace(/ß/g, 'SS');
        if (w[0] === w[0].toUpperCase() && wNorm !== wNorm.toUpperCase()) {
          firstnameParts.unshift(w);
        } else {
          break;
        }
      }
      if (!firstnameParts.length) return false;

      const surnameParts = parts.slice(0, parts.length - firstnameParts.length);
      if (!surnameParts.length) return false;
      if (KNOWN_BAD_PREFIXES.has(surnameParts[0].toUpperCase())) return false;

      for (const sp of surnameParts) {
        const spNorm = sp.replace(/ß/g, 'SS');
        if (spNorm !== spNorm.toUpperCase()) return false;
        if (!sp[0].match(/[A-Z\u00C0-\u024F]/)) return false;
        if (sp.length < 3 && surnameParts.length === 1) return false;
        if (sp.length < 2) return false;
      }
      return true;
    }

    function parseLI(li) {
      let bib = '', name = '';
      for (const child of li.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName;
          if (tag === 'IMG' || tag === 'SVG') continue;
          if (tag === 'SPAN' && /flag|nat|country/i.test(child.className || '')) continue;
        }
        const ct = (child.textContent || '').replace(/\s+/g, ' ').trim();
        if (!ct) continue;
        if (!bib && /^(-|\d{1,3})$/.test(ct)) {
          bib = ct === '-' ? '' : ct;
        } else if (!name && ct.length >= 2) {
          name = ct.replace(/\s*[\(*#].*$/, '').replace(/\s*\*\s*$/, '').trim();
        }
      }
      if (!name) {
        const full = (li.textContent || '').replace(/\s+/g, ' ').trim();
        const m = full.match(/^(-|\d{1,3})\s*([A-ZÁÀÂÄÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÖÕØŒŠŽÞÐÚÙÛÜÝ\u00C0-\u024F][A-Za-z\u00C0-\u024F0-9 \-\'\.]+)/);
        if (m) {
          bib = m[1] === '-' ? '' : m[1];
          name = m[2].replace(/\s*[\(*#].*$/, '').trim();
        }
      }
      if (!name) return null;
      if (!isValidRiderName(name)) return null;
      return { bib, name };
    }

    const processedTeams = new Set();
    const processedContainers = new Set();

    const teamLinks = Array.from(document.querySelectorAll('a[href*="/team/"]'))
      .filter(a => {
        const t = extractVisibleText(a);
        return t.length >= 3 && !/statistics|statistics in race/i.test(t);
      });

    for (const tLink of teamLinks) {
      const teamName = extractVisibleText(tLink);
      if (!teamName || processedTeams.has(teamName)) continue;

      let container = tLink.parentElement;
      let riderContainer = null;
      while (container && container !== document.body) {
        if (container.querySelectorAll('li').length >= 2) {
          riderContainer = container;
          break;
        }
        container = container.parentElement;
      }
      if (!riderContainer) continue;
      if (processedContainers.has(riderContainer)) continue;
      processedContainers.add(riderContainer);
      processedTeams.add(teamName);

      for (const li of riderContainer.querySelectorAll('li')) {
        if (li.contains(tLink)) continue;
        if (li.querySelector('a[href*="/team/"]')) continue;
        const parsed = parseLI(li);
        if (!parsed) continue;
        const key = teamName + '|' + parsed.name;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ riderName: parsed.name, teamName, rankNum: parsed.bib, resultValue: '-', nameParts: splitNameHeuristic(parsed.name) });
      }
    }

    if (entries.length === 0) {
      const walker = document.createTreeWalker(
        document.body, NodeFilter.SHOW_ELEMENT,
        { acceptNode(node) {
            const tag = node.tagName;
            if (tag === 'A' && node.href && node.href.includes('/team/')) return NodeFilter.FILTER_ACCEPT;
            if (['H2','H3','H4','H5','STRONG','B'].includes(tag)) return NodeFilter.FILTER_ACCEPT;
            if (tag === 'LI') return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
      let currentTeam = null;
      let node;
      while ((node = walker.nextNode())) {
        const tag = node.tagName;
        if (tag === 'A' && node.href && node.href.includes('/team/')) {
          const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (t.length > 3 && !/statistics/i.test(t)) currentTeam = t;
          continue;
        }
        if (['H2','H3','H4','H5','STRONG','B'].includes(tag)) {
          const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (/\((WT|PRT|CT|PT)\)/.test(t) && !node.querySelector('a[href*="/team/"]')) currentTeam = t;
          continue;
        }
        if (tag === 'LI' && currentTeam) {
          const parsed = parseLI(node);
          if (!parsed) continue;
          const key = currentTeam + '|' + parsed.name;
          if (seen.has(key)) continue;
          seen.add(key);
          entries.push({ riderName: parsed.name, teamName: currentTeam, rankNum: parsed.bib, resultValue: '-', nameParts: splitNameHeuristic(parsed.name) });
        }
      }
    }

    const anyHasBib = entries.some(e => e.rankNum !== '' && e.rankNum !== undefined);
    const bibFiltered = anyHasBib
      ? entries.filter(e => e.rankNum !== '' && e.rankNum !== undefined)
      : entries;

    const teamCounts = new Map();
    for (const e of bibFiltered) teamCounts.set(e.teamName, (teamCounts.get(e.teamName) || 0) + 1);
    const teamDeduped = bibFiltered.filter(e => teamCounts.get(e.teamName) > 1);

    function normForCompare(s) { return (s || '').toLowerCase().replace(/[^a-z]/g, ''); }

    function similarity(a, b) {
      a = normForCompare(a); b = normForCompare(b);
      if (!a || !b) return 0;
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          dp[i][j] = a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
      const dist = dp[m][n];
      return 1 - dist / Math.max(m, n);
    }

    const allTeamNames = Array.from(new Set(teamDeduped.map(e => e.teamName)));
    const SIMILARITY_THRESHOLD = 0.85;
    const filtered = teamDeduped.filter(e => {
      return !allTeamNames.some(tn => similarity(e.riderName, tn) >= SIMILARITY_THRESHOLD);
    });

    return filtered;
  }

  // ─── EXTRACT DATA (router) ─────────────────────────────────────────────────

  function extractData(mraId, isToday) {
    try {
      if (mraId==='41') {
        const entries=scrapeStartlist();
        if (!entries.length) return {csv:'',count:0,error:'Keine Startlistendaten gefunden.'};
        return {csv:buildCSV(entries,'41'),count:entries.length,entries,mraId:'41',forceTeams:false};
      }

      if (mraId==='64'||mraId==='34') {
        const result=scrapeTeamsTable(mraId);
        if (result.entries.length) return {csv:buildCSV(result.entries,mraId),count:result.entries.length,entries:result.entries,mraId,forceTeams:false};
      }

      let entries=[];

      if (isToday && POINTS_MRAS.has(mraId)) {
        entries=scrapeTodayPoints();
      }
      if (!entries.length && POINTS_MRAS.has(mraId)) {
        const tryToday=scrapeTodayPoints();
        if (tryToday.length) entries=tryToday;
      }

      if (!entries.length) {
        const table=findVisibleResultsTable();
        if (!table) {
          const ttListFallback=scrapeTeamsTimeList();
          if (ttListFallback.entries.length) {
            return {csv:buildCSV(ttListFallback.entries,mraId,true),count:ttListFallback.entries.length,entries:ttListFallback.entries,mraId,forceTeams:true};
          }
          const ttFallback=scrapeTeamsTable(mraId);
          if (ttFallback.entries.length) {
            return {csv:buildCSV(ttFallback.entries,mraId,true),count:ttFallback.entries.length,entries:ttFallback.entries,mraId,forceTeams:true};
          }
          return {csv:'',count:0,error:'Keine sichtbare Ergebnistabelle gefunden.\n\n• Seite evtl. noch nicht vollständig geladen\n• Falscher Tab aktiv\n\n↺ Neu laden klicken.'};
        }
        const result=scrapeTable(table,mraId);
        if (result.error) return {csv:'',count:0,error:result.error};
        entries=result.entries;
      }

      if (!entries.length) return {csv:'',count:0,error:'Tabelle leer – ↺ Neu laden.'};
      return {csv:buildCSV(entries,mraId),count:entries.length,entries,mraId,forceTeams:false};

    } catch(err) {
      console.error('[HS v10]',err);
      return {csv:'',count:0,error:'JS-Fehler: '+err.message};
    }
  }

  // ─── CSV BUILDERS ───────────────────────────────────────────────────────────

  function buildCSV(entries, mraId, forceTeams) {
    const isSL=mraId==='41';
    const isTeams=forceTeams||(mraId==='64'||mraId==='34');
    if (outputFormat==='v1') return buildCSV_AAAV1(entries, isTeams);
    const hdr=isSL
      ?`source_team_id;source_team_name;source_person_id;source_person_name;at${mraId}-rank`
      : isTeams
        ? `source_team_id;source_team_name;at${mraId}-match_result;at${mraId}-rank`
        : `source_team_id;source_team_name;source_person_id;source_person_name;at${mraId}-match_result;at${mraId}-rank`;
    const lines=[hdr];
    for (const e of entries) {
      const tid='pc_'+slugify(e.teamName);
      const pid='pc_'+slugify(e.riderName);
      lines.push(isSL
        ?`${tid};${e.teamName};${pid};${e.riderName};${e.rankNum}`
        : isTeams
          ? `${tid};${e.teamName};${e.resultValue};${e.rankNum}`
          : `${tid};${e.teamName};${pid};${e.riderName};${e.resultValue};${e.rankNum}`
      );
    }
    return lines.join('\n');
  }

  // ─── AAA V1 CSV (legacy upload format) ─────────────────────────────────────
  // Comma-separated, NO header row. Column order:
  // Team-Pseudo-ID,Teamname,Person-Pseudo-ID,Person-Vorname,Person-Nachname,
  // Person-Fullname,rank,match_result,comment,place
  //
  // - Team-Pseudo-ID reuses the raw team NAME (not a pc_ slug) in both
  //   column 1 and 2, per legacy AAA V1 spec.
  // - Person-Pseudo-ID / Vorname / Nachname (cols 3-5) always stay empty.
  // - Person-Fullname (col 6) is "NACHNAME Vorname" — surname forced upper
  //   case regardless of source HTML casing.
  // - match_result stays empty for DNF/DNS/DSQ/OTL/NR rows — the status
  //   text goes into "comment" instead.
  function csvEscapeV1(v) {
    const s = (v==null?'':String(v));
    if (/[",\n]/.test(s)) return '"'+s.replace(/"/g,'""')+'"';
    return s;
  }

  function buildCSV_AAAV1(entries, isTeams) {
    const lines=[];
    for (const e of entries) {
      const teamName = e.teamName || '';
      let fullName='', matchResult='', comment='';
      // resultValue can be a number (e.g. aggregated points from
      // scrapeTodayPoints) as well as a string (times, status markers) —
      // always coerce to String() before calling .trim()/.test() on it.
      const rvStr = String(e.resultValue==null?'':e.resultValue).trim();

      if (isTeams) {
        if (STATUS_MARKERS.test(rvStr)) comment=rvStr.toUpperCase();
        else matchResult=rvStr;
      } else {
        const parts = e.nameParts || splitNameHeuristic(e.riderName||'');
        fullName = parts.surname ? `${parts.surname} ${parts.firstname}`.trim() : (e.riderName||'').toUpperCase();
        if (STATUS_MARKERS.test(rvStr)) comment=rvStr.toUpperCase();
        else matchResult=rvStr;
      }

      lines.push([
        csvEscapeV1(teamName),
        csvEscapeV1(teamName),
        '', '', '',
        csvEscapeV1(fullName),
        csvEscapeV1(e.rankNum!=null?e.rankNum:(e.rankText||'')),
        csvEscapeV1(matchResult),
        csvEscapeV1(comment),
        ''
      ].join(','));
    }
    return lines.join('\n');
  }

  // ─── STYLES ───────────────────────────────────────────────────────────────

  GM_addStyle(`
    #hs-panel {
      all: initial; position: fixed !important; bottom: 20px !important; right: 20px !important;
      z-index: 2147483647 !important; width: 390px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      font-size: 13px !important; border-radius: 12px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.65) !important; overflow: hidden !important;
      display: flex !important; flex-direction: column !important;
      background: #1c1c1c !important; color: #e2e2e2 !important;
      isolation: isolate !important; transform: translateZ(0) !important; line-height: normal !important;
    }
    #hs-panel * { box-sizing: border-box !important; font-family: inherit !important; }
    #hs-hdr {
      background: #111 !important; padding: 10px 14px !important;
      display: flex !important; align-items: center !important; gap: 10px !important;
      cursor: pointer !important; user-select: none !important; border-bottom: 1px solid #2a2a2a !important;
    }
    #hs-logo { height: 22px !important; object-fit: contain !important; flex-shrink: 0 !important; display: block !important; }
    #hs-title { font-size: 12px !important; font-weight: 600 !important; color: #fff !important; flex: 1 !important; line-height: 1.3 !important; }
    #hs-title em { color: #e84f2e !important; font-style: normal !important; }
    #hs-tog { background: none !important; border: none !important; color: #777 !important; font-size: 15px !important; cursor: pointer !important; padding: 0 !important; flex-shrink: 0 !important; }
    #hs-bdy { padding: 12px 14px !important; display: flex !important; flex-direction: column !important; gap: 10px !important; }
    #hs-bdy.hs-hide { display: none !important; }
    .hs-info { background: #252525 !important; border-radius: 8px !important; padding: 8px 10px !important; font-size: 11px !important; color: #999 !important; line-height: 1.6 !important; }
    .hs-info strong { color: #eee !important; font-size: 12px !important; }
    .hs-badge { display: inline-block !important; background: #e84f2e !important; color: #fff !important; border-radius: 4px !important; padding: 1px 6px !important; font-size: 10px !important; font-weight: 700 !important; margin-left: 4px !important; vertical-align: middle !important; }
    #hs-view-row { display: flex !important; align-items: center !important; gap: 6px !important; }
    #hs-view-row span.hs-vl { font-size: 11px !important; color: #888 !important; }
    #hs-fmt-row { display: flex !important; align-items: center !important; gap: 6px !important; }
    #hs-fmt-row span.hs-vl { font-size: 11px !important; color: #888 !important; }
    .hs-pill {
      background: #2a2a2a !important; border: 1px solid #3c3c3c !important; border-radius: 20px !important;
      padding: 3px 10px !important; font-size: 11px !important; color: #777 !important;
      cursor: pointer !important; transition: all .15s !important; user-select: none !important;
      font-weight: 500 !important; opacity: .95 !important;
    }
    .hs-pill:hover { border-color: #555 !important; color: #aaa !important; }
    .hs-pill.active { background: #1a3a1a !important; border-color: #3a7a3a !important; color: #56c05a !important; font-weight: 700 !important; }
    .hs-lbl { font-size: 11px !important; color: #888 !important; font-weight: 500 !important; display: block !important; margin-bottom: 4px !important; }
    #hs-sel { width: 100% !important; background: #2a2a2a !important; color: #e2e2e2 !important; border: 1px solid #3c3c3c !important; border-radius: 6px !important; padding: 6px 8px !important; font-size: 12px !important; outline: none !important; cursor: pointer !important; }
    #hs-sel:focus { border-color: #e84f2e !important; }
    #hs-status { font-size: 11px !important; color: #888 !important; min-height: 16px !important; }
    .hs-ok { color: #56c05a !important; font-weight: 600 !important; }
    .hs-err { color: #e84f2e !important; font-weight: 600 !important; }
    #hs-errmsg { background: #2c1515 !important; border: 1px solid #5e2020 !important; border-radius: 6px !important; padding: 8px 10px !important; color: #e07070 !important; font-size: 11px !important; line-height: 1.5 !important; display: none !important; white-space: pre-wrap !important; }
    #hs-errmsg.vis { display: block !important; }
    #hs-csv { background: #111 !important; border: 1px solid #2a2a2a !important; border-radius: 7px !important; padding: 8px 10px !important; font-family: 'Courier New', monospace !important; font-size: 10px !important; color: #bbb !important; height: 140px !important; overflow-y: auto !important; white-space: pre !important; line-height: 1.5 !important; word-break: break-all !important; user-select: text !important; }
    #hs-btns { display: flex !important; gap: 8px !important; }
    #hs-copy { flex: 1 !important; background: #e84f2e !important; color: #fff !important; border: none !important; border-radius: 7px !important; padding: 8px 0 !important; font-size: 12px !important; font-weight: 600 !important; cursor: pointer !important; }
    #hs-copy:hover { background: #c93e24 !important; }
    #hs-copy.ok { background: #2d7a2d !important; }
    #hs-rnew { background: #2a2a2a !important; color: #ccc !important; border: 1px solid #3c3c3c !important; border-radius: 7px !important; padding: 8px 12px !important; font-size: 12px !important; cursor: pointer !important; white-space: nowrap !important; }
    #hs-rnew:hover { background: #3a3a3a !important; }
    #hs-foot { font-size: 10px !important; color: #b8b8b8 !important; text-align: center !important; padding-bottom: 2px !important; line-height: 1.45 !important; white-space: pre-line !important; }
    #hs-loader { display: none !important; align-items: center !important; justify-content: center !important; gap: 8px !important; background: #111 !important; border: 1px solid #2a2a2a !important; border-radius: 7px !important; padding: 16px 10px !important; min-height: 140px !important; color: #bdbdbd !important; font-size: 12px !important; }
    #hs-loader.vis { display: flex !important; }
    .hs-spin { width: 16px !important; height: 16px !important; border: 2px solid #4a4a4a !important; border-top-color: #e84f2e !important; border-radius: 50% !important; animation: hs-spin 0.8s linear infinite !important; }
    @keyframes hs-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `);

  // ─── STATE ────────────────────────────────────────────────────────────────

  let pageType   = detectPageType();
  let isToday    = false;
  let currentMRA = MRA_MAP[pageType]?.general || '0';
  let outputFormat = 'v2'; // 'v2' (default, AAA V2) or 'v1' (legacy AAA V1)
  let currentCSV = '';
  let minimised  = false;
  let extractTimer = null;
  let lastEntries = null;
  let lastMraForEntries = null;
  let lastForceTeamsForEntries = null;

  function scheduleExtraction(delayMs) {
    if (extractTimer) clearTimeout(extractTimer);
    extractTimer = setTimeout(() => { extractTimer=null; runExtraction(); }, delayMs||50);
  }

  // ─── VIEW SWITCH (called from pill clicks) ────────────────────────────────

  function showLoader() {
    const loaderEl = panel.querySelector('#hs-loader');
    const csvEl    = panel.querySelector('#hs-csv');
    const statusEl = panel.querySelector('#hs-status');
    const errEl    = panel.querySelector('#hs-errmsg');
    if (loaderEl) loaderEl.classList.add('vis');
    if (csvEl)    { csvEl.style.display='none'; csvEl.textContent=''; }
    if (statusEl) statusEl.innerHTML='⏳ Extrahiere…';
    if (errEl)    { errEl.textContent=''; errEl.classList.remove('vis'); }
    currentCSV = '';
  }

  function setView(today) {
    isToday = today;
    const mraMap = MRA_MAP[pageType] || MRA_MAP.unknown;
    currentMRA = today ? mraMap.today : mraMap.general;
    updatePills();
    updateBadgeAndSelect();
    showLoader();
    scheduleExtraction(200);
  }

  function updatePills() {
    const gen  = panel.querySelector('#hs-pill-gen');
    const tod  = panel.querySelector('#hs-pill-today');
    const row  = panel.querySelector('#hs-view-row');
    if (!gen||!tod) return;
    gen.classList.toggle('active', !isToday);
    tod.classList.toggle('active', isToday);
    if (row) row.style.display = HAS_TODAY.has(pageType) ? 'flex' : 'none';
  }

  function updateFormatPills() {
    const v2 = panel.querySelector('#hs-pill-v2');
    const v1 = panel.querySelector('#hs-pill-v1');
    if (!v2||!v1) return;
    v2.classList.toggle('active', outputFormat==='v2');
    v1.classList.toggle('active', outputFormat==='v1');
  }

  function updateBadgeAndSelect() {
    const badge = panel.querySelector('#hs-badge');
    const sel   = panel.querySelector('#hs-sel');
    if (badge) badge.textContent = `AT:${currentMRA}`;
    if (sel)   sel.value = currentMRA;
  }

  // Rebuild CSV from the last scraped entries using the currently selected
  // output format, WITHOUT re-scraping the page. Used both when switching
  // AAA V1/V2 and when changing the MRA dropdown.
  function rebuildCSVFromLastEntries() {
    if (!lastEntries) return;
    const csv = buildCSV(lastEntries, lastMraForEntries, lastForceTeamsForEntries);
    currentCSV = csv;
    const csvEl = panel.querySelector('#hs-csv');
    if (csvEl) csvEl.textContent = csv;
    try { GM_setClipboard(csv); } catch(e) { navigator.clipboard?.writeText(csv).catch(()=>{}); }
  }

  // ─── PANEL BUILD ─────────────────────────────────────────────────────────

  const panel = document.createElement('div');
  panel.id = 'hs-panel';
  document.body.appendChild(panel);

  function buildPanel() {
    const mraMap = MRA_MAP[pageType] || MRA_MAP.unknown;
    currentMRA = isToday ? mraMap.today : mraMap.general;

    panel.innerHTML = `
      <div id="hs-hdr">
        <img id="hs-logo" src="${LOGO_URL}" alt="HS" onerror="this.style.display='none'">
        <div id="hs-title">HEIM:SPIEL<br><em>Website Data Collector</em></div>
        <button id="hs-tog">▼</button>
      </div>
      <div id="hs-bdy">
        <div class="hs-info">
          <strong id="hs-tl">${TYPE_LABELS[pageType]||'Seite'}</strong>
          <span class="hs-badge" id="hs-badge">AT:${currentMRA}</span><br>
          <span id="hs-url">${(()=>{const p=window.location.pathname;return p.length>50?'…'+p.slice(-47):p;})()}</span>
        </div>
        <div id="hs-view-row" style="display:${HAS_TODAY.has(pageType)?'flex':'none'} !important">
          <span class="hs-vl">Ansicht:</span>
          <span class="hs-pill${!isToday?' active':''}" id="hs-pill-gen">Gesamt</span>
          <span class="hs-pill${isToday?' active':''}" id="hs-pill-today">Tageswertung</span>
        </div>
        <div id="hs-fmt-row">
          <span class="hs-vl">Format:</span>
          <span class="hs-pill${outputFormat==='v2'?' active':''}" id="hs-pill-v2">AAA V2</span>
          <span class="hs-pill${outputFormat==='v1'?' active':''}" id="hs-pill-v1">AAA V1</span>
        </div>
        <div>
          <label class="hs-lbl" for="hs-sel">Match Result At (MRA):</label>
          <select id="hs-sel">
            ${MRA_OPTIONS.map(o=>`<option value="${o.id}"${o.id===currentMRA?' selected':''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <div id="hs-status">Bereit.</div>
        <div id="hs-errmsg"></div>
        <div id="hs-loader"><span class="hs-spin"></span><span>Wird geladen…</span></div>
        <div id="hs-csv"></div>
        <div id="hs-btns">
          <button id="hs-copy">📋 In Zwischenablage kopieren</button>
          <button id="hs-rnew">↺ Neu laden</button>
        </div>
        <div id="hs-foot">HEIM:SPIEL Website Data Collector V. ${DISPLAY_VERSION}\nFeedback & Support: andreas.meyer@heimspiel.de</div>
      </div>`;

    // Events
    panel.querySelector('#hs-hdr').addEventListener('click', () => {
      minimised=!minimised;
      panel.querySelector('#hs-bdy').classList.toggle('hs-hide',minimised);
      panel.querySelector('#hs-tog').textContent=minimised?'▲':'▼';
    });
    panel.querySelector('#hs-pill-gen').addEventListener('click', e => { e.stopPropagation(); if (!isToday) return; setView(false); });
    panel.querySelector('#hs-pill-today').addEventListener('click', e => { e.stopPropagation(); if (isToday) return; if (!HAS_TODAY.has(pageType)) return; setView(true); });
    panel.querySelector('#hs-pill-v2').addEventListener('click', e => {
      e.stopPropagation();
      if (outputFormat==='v2') return;
      outputFormat='v2';
      updateFormatPills();
      rebuildCSVFromLastEntries();
    });
    panel.querySelector('#hs-pill-v1').addEventListener('click', e => {
      e.stopPropagation();
      if (outputFormat==='v1') return;
      outputFormat='v1';
      updateFormatPills();
      rebuildCSVFromLastEntries();
    });
    panel.querySelector('#hs-sel').addEventListener('change', e => {
      currentMRA=e.target.value;
      panel.querySelector('#hs-badge').textContent=`AT:${currentMRA}`;
      lastMraForEntries = currentMRA;
      if (outputFormat==='v1') {
        // AAA V1 has no MRA-specific header, nothing to rebuild.
        return;
      }
      if (currentCSV) {
        const csvLines = currentCSV.split('\n');
        const oldHeader = csvLines[0];
        const newHeader = oldHeader.replace(/at\d+-match_result/g, `at${currentMRA}-match_result`)
                                   .replace(/at\d+-rank/g, `at${currentMRA}-rank`);
        csvLines[0] = newHeader;
        currentCSV = csvLines.join('\n');
        const csvEl = panel.querySelector('#hs-csv');
        if (csvEl) csvEl.textContent = currentCSV;
      }
    });
    panel.querySelector('#hs-rnew').addEventListener('click', e => {
      e.stopPropagation();
      scheduleExtraction(50);
    });
    panel.querySelector('#hs-copy').addEventListener('click', e => {
      e.stopPropagation();
      if (!currentCSV) return;
      try { GM_setClipboard(currentCSV); } catch(e2) { navigator.clipboard?.writeText(currentCSV); }
      const btn=panel.querySelector('#hs-copy');
      btn.textContent='✓ Kopiert!'; btn.classList.add('ok');
      setTimeout(()=>{btn.textContent='📋 In Zwischenablage kopieren';btn.classList.remove('ok');},2000);
    });
  }

  // ─── EXTRACTION ───────────────────────────────────────────────────────────

  function runExtraction() {
    const statusEl = panel.querySelector('#hs-status');
    const errEl    = panel.querySelector('#hs-errmsg');
    const csvEl    = panel.querySelector('#hs-csv');
    const loaderEl = panel.querySelector('#hs-loader');
    if (statusEl) statusEl.innerHTML='⏳ Extrahiere…';
    if (errEl)    { errEl.textContent=''; errEl.classList.remove('vis'); }
    if (csvEl)    { csvEl.textContent=''; csvEl.style.display='none'; }
    if (loaderEl) loaderEl.classList.add('vis');
    currentCSV='';

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const {csv,count,error,entries,mraId,forceTeams} = extractData(currentMRA, isToday);

      if (error||!csv) {
        if (loaderEl) loaderEl.classList.remove('vis');
        if (csvEl) csvEl.style.display='';
        if (statusEl) statusEl.innerHTML='<span class="hs-err">✗ Keine Daten</span>';
        if (errEl)    { errEl.textContent=error||'Unbekannter Fehler.'; errEl.classList.add('vis'); }
        lastEntries=null;
        return;
      }

      lastEntries=entries;
      lastMraForEntries=mraId;
      lastForceTeamsForEntries=forceTeams;
      currentCSV=csv;
      if (loaderEl) loaderEl.classList.remove('vis');
      if (csvEl)    { csvEl.style.display=''; csvEl.textContent=csv; }
      if (statusEl) statusEl.innerHTML=`<span class="hs-ok">✓</span> ${count} Einträge extrahiert`;

      try {
        GM_setClipboard(csv);
        if (statusEl) statusEl.innerHTML=`<span class="hs-ok">✓</span> ${count} Einträge · <span class="hs-ok">✓ In Zwischenablage</span>`;
      } catch(e) { navigator.clipboard?.writeText(csv).catch(()=>{}); }
    }));
  }

  // ─── URL WATCH ────────────────────────────────────────────────────────────

  let lastURL = location.href;

  function onURLChange() {
    pageType   = detectPageType();
    isToday    = false;
    const mraMap = MRA_MAP[pageType] || MRA_MAP.unknown;
    currentMRA = mraMap.general;
    buildPanel();
    showLoader();
    scheduleExtraction(1500);
  }

  setInterval(() => {
    if (location.href !== lastURL) { lastURL=location.href; onURLChange(); }
  }, 500);

  const _push = history.pushState.bind(history);
  const _repl = history.replaceState.bind(history);
  history.pushState    = (...a) => { _push(...a); onURLChange(); };
  history.replaceState = (...a) => { _repl(...a); onURLChange(); };
  window.addEventListener('popstate', onURLChange);

  document.addEventListener('click', e => {
    const t=e.target.closest('a,button,[class*="View"]');
    if (!t) return;
    const cl=(t.className||'').toString();
    const txt=t.textContent.trim().toUpperCase();
    if (/ViewToday/i.test(cl)||(txt==='TODAY'||txt==='HEUTE')) {
      setTimeout(()=>setView(true),500);
    } else if (/ViewGeneral/i.test(cl)||(txt==='GENERAL'||txt==='GESAMT')) {
      setTimeout(()=>setView(false),500);
    }
  }, true);

  // ─── INIT ─────────────────────────────────────────────────────────────────

  buildPanel();

  showLoader();

  let _initDone = false;
  function _contentIsReady() {
    if (findVisibleResultsTable()) return true;
    if (document.querySelector('table tbody tr')) return true;
    if (pageType === 'startlist') {
      if (document.querySelector('a[href*="/rider/"]')) return true;
      const teamLinks = document.querySelectorAll('a[href*="/team/"]');
      for (const tl of teamLinks) {
        if (!isVisible(tl)) continue;
        const txt = tl.textContent.trim();
        if (txt.length < 3 || /statistics|in race/i.test(txt)) continue;
        let p = tl.parentElement;
        let depth = 0;
        while (p && p !== document.body && depth < 8) {
          if (p.querySelectorAll('li').length >= 2) return true;
          p = p.parentElement; depth++;
        }
      }
    }
    return false;
  }

  function _tryInit() {
    if (_initDone) return;
    if (_contentIsReady()) {
      _initDone = true;
      if (_initObserver) { _initObserver.disconnect(); _initObserver = null; }
      scheduleExtraction(300);
    }
  }

  let _initObserver = null;

  function _startObserver() {
    if (_initDone) return;
    _initObserver = new MutationObserver(() => _tryInit());
    _initObserver.observe(document.body || document.documentElement, {
      childList: true, subtree: true
    });
    setTimeout(() => {
      if (!_initDone) {
        _initDone = true;
        if (_initObserver) { _initObserver.disconnect(); _initObserver = null; }
        scheduleExtraction(100);
      }
    }, 8000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    _tryInit();
    if (!_initDone) _startObserver();
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      _tryInit();
      if (!_initDone) _startObserver();
    }, { once: true });
  }

})();
