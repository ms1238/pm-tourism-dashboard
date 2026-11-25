'use strict';
// PM 연계 탭: data/pmtour.json (scripts/pm_tour.py) — 숙소·관광지에서 대중교통까지의 거리, 마지막 1~3km, PM 공급·규제,
// 사고 합성데이터를 지금 고른 지역(app.js의 state: 전국 → 시도별, 시도 → 시군구별, 시군구 → 그 시군구)으로 보여 줌.
// 시도를 고르면 지도에 그 시도의 숙소·관광지를 도보권 / PM 10분권 / 먼 곳으로 칠함.
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const fmt = n => n == null ? '-' : Math.round(n).toLocaleString('ko-KR');
  const pc = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
  const won = v => v == null ? '' : (v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만원';
  const V = (document.currentScript?.src.match(/[?&]v=([^&]+)/) || [])[1];
  const dv = u => V ? `${u}?v=${V}` : u;
  const COL = ['#2b8a3e', '#f08c00', '#c92a2a'], CLS = ['도보권', 'PM 10분권', '먼 곳'];
  const PM_TABS = ['pmgap', 'lastmile', 'pmsup', 'pmsafe'];
  let P = null, U = [], tab = '', sorts = {}, tables = {};

  const ready = fetch(dv('data/pmtour.json')).then(r => r.ok ? r.json() : null).then(d => {
    if (!d) return;
    P = d;
    U = d.units.map(u => Object.fromEntries(d.cols.map((c, i) => [c, u[i]])));
  }).catch(() => {});
  const ctx = () => window.PMT_CTX;
  const S = () => ctx().S;
  const nameOf = u => u.gi == null ? S()[u.si].name : `${S()[u.si].name} ${S()[u.si].sgg[u.gi]}`;
  const short = u => u.gi == null ? S()[u.si].name : S()[u.si].sgg[u.gi];
  const N = ['lod', 'lod_walk', 'lod_pm', 'lod_far', 'lod_l13', 'lod_t13', 'tour', 'tour_walk', 'tour_pm', 'tour_far', 'tour_l13', 'vis', 'fleet', 'park', 'bike_km', 'bike_ded_km', 'acc', 'acc_ks'];
  function sum(list, si) {  // a 시도 (or 전국) row from its 시군구
    const o = { si, gi: null, n: list.length, nobus: list.every(u => u.nobus) ? 1 : 0 };
    for (const k of N) { const v = list.map(u => u[k]).filter(v => v != null); o[k] = v.length ? v.reduce((a, b) => a + b, 0) : null; }
    o.ops_n = list.filter(u => u.ops === 1).length; o.tow_n = list.filter(u => u.tow).length; o.btow_n = list.filter(u => u.btow).length;
    o.dpark_n = list.filter(u => u.dpark).length; o.nokick_n = list.filter(u => u.nokick).length;
    const fees = list.map(u => u.fee).filter(Boolean).sort((a, b) => a - b); o.fee_med = fees.length ? fees[Math.floor(fees.length / 2)] : null;
    return o;
  }
  // the rows of the current scope and the scope's own total
  function scope() {
    const st = ctx().state;
    if (st.sido < 0) {
      const rows = S().map((_, si) => sum(U.filter(u => u.si === si), si));
      return { rows, total: sum(U, -1), level: 'sido', label: '전국' };
    }
    const mine = U.filter(u => u.si === st.sido);
    if (st.sgg >= 0) { const u = mine.find(x => x.gi === st.sgg); return { rows: u ? [u] : [], total: u ? sum([u], st.sido) : sum([], st.sido), level: 'one', label: nameOf(u || { si: st.sido, gi: st.sgg }), unit: u }; }
    return { rows: mine, total: sum(mine, st.sido), level: 'sgg', label: S()[st.sido].name };
  }
  const kpis = (id, list) => { $(id).innerHTML = list.map(([v, t]) => `<div class="kpi"><b>${v}</b><span>${t}</span></div>`).join(''); };
  // a sortable table: cols [{k, h, f(row) → html, v(row) → sort value, l (left)}]
  function table(id, cols, rows, def) {
    const s = sorts[id] ||= def;
    const val = (r, k) => { const c = cols.find(x => x.k === k); return c?.v ? c.v(r) : r[k]; };
    const data = [...rows].sort((a, b) => { const p = val(a, s.k), q = val(b, s.k); return (p == null) - (q == null) || (typeof p === 'string' ? p.localeCompare(q) : (p - q)) * (s.asc ? 1 : -1); });
    $(id).innerHTML = '<thead><tr>' + cols.map(c => `<th data-k="${c.k}" style="cursor:pointer;${c.l ? 'text-align:left' : ''}">${c.h}${s.k === c.k ? (s.asc ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr></thead><tbody>' +
      data.map(r => '<tr>' + cols.map(c => `<td style="${c.l ? 'text-align:left' : ''}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join('') + '</tr>').join('') + '</tbody>';
    $(id).querySelectorAll('th').forEach(th => th.onclick = () => { sorts[id] = { k: th.dataset.k, asc: s.k === th.dataset.k ? !s.asc : false }; render(); });
    tables[id] = { cols, data };
  }
  const share = (a, b) => b ? a / b : null;
  const pctCell = (a, b) => b ? `${pc(a, b)} <small style="color:var(--muted)">${fmt(a)}</small>` : '-';
  const gapNote = '정류장 자료 부족';

  // ── 관광 이동 공백 ──
  function renderGap(sc) {
    const m = P.meta, t = sc.total;
    $('pmgap-sub').innerHTML = `${esc(sc.label)} · 영업 중인 숙소와 관광지(관광지·문화시설·레포츠)에서 가장 가까운 '쓸 만한' 대중교통(노선 ${m.good_routes}개 이상 버스 정류장 또는 철도역)까지의 직선거리. ` +
      CLS.map((c, i) => `<span class="pmt-dot" style="background:${COL[i]}"></span>${c}`).join(' ') +
      ` (도보권 ${m.walk_m}m 이내 · PM 10분권 ${(m.pm10_m / 1000).toFixed(1)}km 이내 · 먼 곳 그 밖)`;
    kpis('pmgap-kpis', [
      [pc(t.lod_pm + t.lod_far, t.lod), `숙소 중 대중교통 도보권 밖 (${fmt(t.lod_pm + t.lod_far)}곳)`],
      [pc(t.lod_pm, t.lod_pm + t.lod_far), '그중 PM 10분이면 닿는 숙소'],
      [pc(t.tour_pm + t.tour_far, t.tour), `관광지 중 도보권 밖 (${fmt(t.tour_pm + t.tour_far)}곳)`],
      [pc(t.tour_pm, t.tour_pm + t.tour_far), '그중 PM 10분이면 닿는 관광지']]);
    $('pmgap-title').textContent = sc.level === 'sido' ? '시도별' : sc.level === 'sgg' ? '시군구별' : '이 시군구';
    table('pmgap-table', [
      { k: 'name', h: '지역', l: 1, v: r => nameOf(r), f: r => esc(short(r)) + (r.nobus ? ` <small style="color:var(--muted)">${gapNote}</small>` : '') },
      { k: 'lod', h: '숙소(영업)', f: r => fmt(r.lod) },
      { k: 'lodout', h: '숙소 도보권 밖', v: r => share(r.lod_pm + r.lod_far, r.lod), f: r => pctCell(r.lod_pm + r.lod_far, r.lod) },
      { k: 'lodpm', h: '숙소 PM 10분권', v: r => share(r.lod_pm, r.lod), f: r => pctCell(r.lod_pm, r.lod) },
      { k: 'lodfar', h: '숙소 먼 곳', v: r => share(r.lod_far, r.lod), f: r => pctCell(r.lod_far, r.lod) },
      { k: 'tour', h: '관광지', f: r => fmt(r.tour) },
      { k: 'tourout', h: '관광지 도보권 밖', v: r => share(r.tour_pm + r.tour_far, r.tour), f: r => pctCell(r.tour_pm + r.tour_far, r.tour) },
      { k: 'tourpm', h: '관광지 PM 10분권', v: r => share(r.tour_pm, r.tour), f: r => pctCell(r.tour_pm, r.tour) },
      { k: 'vis', h: '외지인 방문(연인원)', f: r => fmt(r.vis) }], sc.rows, { k: 'lodout', asc: false });
    $('pmgap-note').textContent = `거리는 직선거리이고 경사는 반영하지 않았습니다. 좌표가 정확한 영업 중 숙소만 셉니다. 외지인 방문은 한국관광공사 데이터랩의 최근 4분기 연인원(${m.visits_last || ''}까지)입니다. 버스 정류장 자료가 크게 부족한 시군구는 거리를 계산하지 않습니다. 정류장: 국토교통부 버스정류장 위치정보(${m.stops_collected || ''}), 철도역: OpenStreetMap.`;
    spots(sc);
  }
  async function spots(sc) {
    const card = $('pmgap-spots-card');
    if (sc.level !== 'one' || !sc.unit || sc.unit.nobus) { card.hidden = true; return; }
    const [tour, code] = await Promise.all([fetch(dv(`data/tour/${sc.unit.si}.json`)).then(r => r.json()), fetch(dv(`data/pmtour/${sc.unit.si}.json`)).then(r => r.json())]).catch(() => [null, null]);
    if (!tour || !code) { card.hidden = true; return; }
    const list = tour.map((t, i) => ({ t, k: code.tour[i] })).filter(x => x.t[3] === sc.unit.gi && (x.k === '1' || x.k === '2'));
    card.hidden = !list.length;
    table('pmgap-spots', [
      { k: 'n', h: '관광지', l: 1, v: x => x.t[4], f: x => esc(x.t[4]) },
      { k: 'k', h: '대중교통에서', l: 1, v: x => +x.k, f: x => `<span class="pmt-dot" style="background:${COL[+x.k]}"></span>${CLS[+x.k]}` },
      { k: 'l3', h: '반경 3km 숙소', v: x => x.t[9], f: x => fmt(x.t[9]) },
      { k: 'a', h: '주소', l: 1, v: x => x.t[5], f: x => esc(x.t[5]) }], list, { k: 'l3', asc: false });
  }

  // ── 마지막 1~3km ──
  function opportunity(list) {  // 관광 PM 기회 점수: three factors, percentile within the list, averaged (0~100)
    const ok = list.filter(u => !u.nobus && u.lod + u.tour >= 30);
    const f = { pm: u => (u.lod_pm + u.tour_pm) / (u.lod + u.tour), l13: u => (u.lod_l13 + u.lod_t13 + u.tour_l13) / (u.lod + u.tour), vis: u => u.vis };
    const pr = {};
    for (const [k, g] of Object.entries(f)) { const v = ok.map(g).filter(x => x != null).sort((a, b) => a - b); pr[k] = x => x == null || !v.length ? null : (v.filter(y => y < x).length + v.filter(y => y <= x).length) / 2 / v.length; }
    return ok.map(u => { const p = Object.keys(f).map(k => pr[k](f[k](u))).filter(x => x != null); return { ...u, f_pm: f.pm(u), f_l13: f.l13(u), score: p.length >= 2 ? p.reduce((a, b) => a + b, 0) / p.length * 100 : null }; });
  }
  function renderLast(sc) {
    const t = sc.total, st = ctx().state;
    $('lastmile-sub').innerHTML = `${esc(sc.label)} · 걷기엔 멀고 택시를 타기엔 가까운 1~3km는 PM이 가장 쓸모 있는 거리입니다. 숙소에서 가장 가까운 '쓸 만한' 대중교통(노선 ${P.meta.good_routes}개 이상 정류장·철도역), 가장 가까운 관광지까지의 직선거리로 셉니다.`;
    kpis('lastmile-kpis', [
      [pc(t.lod_l13, t.lod), `숙소 → 대중교통 1~3km (${fmt(t.lod_l13)}곳)`],
      [pc(t.lod_t13, t.lod), `숙소 → 가장 가까운 관광지 1~3km (${fmt(t.lod_t13)}곳)`],
      [pc(t.tour_l13, t.tour), `관광지 → 대중교통 1~3km (${fmt(t.tour_l13)}곳)`],
      [fmt(t.vis), '외지인 방문 연인원 (최근 4분기)']]);
    const base = st.sido < 0 ? U : U.filter(u => u.si === st.sido);
    const rk = opportunity(base).filter(u => u.score != null).sort((a, b) => b.score - a.score);
    rk.forEach((u, i) => { u.rank = i + 1; });
    $('lastmile-title').textContent = `관광 PM 기회 순위 · ${st.sido < 0 ? '전국' : S()[st.sido].name} 시군구`;
    const towTxt = u => u.tow ? (u.fee ? won(u.fee) : '견인') + (u.grace ? ` · ${esc(/즉시/.test(u.grace) ? '즉시' : u.grace)}` : '') : '없음';
    table('lastmile-table', [
      { k: 'rank', h: '순위', f: u => u.rank },
      { k: 'name', h: '지역', l: 1, v: u => nameOf(u), f: u => (st.sgg >= 0 && u.si === st.sido && u.gi === st.sgg ? '<b>' : '') + esc(st.sido < 0 ? nameOf(u) : short(u)) + (st.sgg >= 0 && u.si === st.sido && u.gi === st.sgg ? '</b>' : '') },
      { k: 'score', h: '점수', f: u => u.score.toFixed(0) },
      { k: 'f_pm', h: '숙소·관광지 PM 10분권', f: u => pc(u.f_pm, 1) },
      { k: 'f_l13', h: '1~3km 비중', f: u => pc(u.f_l13, 1) },
      { k: 'vis', h: '외지인 방문', f: u => fmt(u.vis) },
      { k: 'ops', h: '공유 PM', v: u => u.ops, f: u => u.ops == null ? '-' : u.ops ? '운영' : '<b>미운영</b>' },
      { k: 'fee', h: 'PM 견인', v: u => u.tow ? u.fee || 1 : 0, f: towTxt }], rk.slice(0, 50), { k: 'rank', asc: true });
    $('lastmile-note').textContent = '점수 = ① 숙소·관광지 중 PM 10분권 비율 ② 1~3km 비중(숙소→대중교통, 숙소→관광지, 관광지→대중교통) ③ 외지인 방문 연인원을, 표에 나온 시군구 사이 순위(백분위)로 바꿔 평균한 값(0~100)입니다. 숙소와 관광지가 합쳐 30곳 미만이거나 정류장 자료가 부족한 시군구는 뺍니다. 상위 50곳까지 보여 줍니다.';
  }

  // ── PM 공급·규제 ──
  function renderSup(sc) {
    const t = sc.total, many = sc.level !== 'one';
    $('pmsup-sub').textContent = `${sc.label} · 공유 PM 운영(${(P.meta.pm_ops_date || '').slice(0, 4)}년 말 조사, 그 뒤 기기 자료가 있으면 그것을 우선), PM 기기·주차구역(지역마다 기준일 다름), 견인·규제, 자전거도로(${P.meta.bike_date || ''}).`;
    const units = sc.level === 'sido' ? U : sc.level === 'sgg' ? U.filter(u => u.si === sc.rows[0]?.si) : sc.rows;
    const n = units.length;
    kpis('pmsup-kpis', [
      [`${units.filter(u => u.ops === 1).length} / ${n}`, '공유 PM 운영 시군구'],
      [fmt(t.fleet), 'PM 기기 (시군구 자료가 있는 곳 합계)'],
      [`${units.filter(u => u.tow).length}곳`, 'PM 견인' + (t.fee_med ? ` (견인료 중앙값 ${won(t.fee_med)})` : '')],
      [`${units.filter(u => u.dpark).length} · ${units.filter(u => u.nokick).length}`, '지정주차제 · E-scooter Free Zone 운영 시군구']]);
    const yn = v => v == null ? '-' : v ? '있음' : '없음';
    const cnt = (r, k, kn) => many && r.gi == null ? `${r[kn]} / ${r.n}` : yn(r[k]);
    table('pmsup-table', [
      { k: 'name', h: '지역', l: 1, v: r => nameOf(r), f: r => esc(short(r)) },
      { k: 'ops', h: '공유 PM 운영', v: r => r.gi == null ? r.ops_n / r.n : r.ops, f: r => r.gi == null ? `${r.ops_n} / ${r.n}` : r.ops == null ? '-' : r.ops ? '운영' : '<b>미운영</b>' },
      { k: 'fleet', h: 'PM 기기', f: r => r.fleet == null ? '-' : fmt(r.fleet) + (r.fleet_date ? ` <small style="color:var(--muted)">${esc(r.fleet_date)}</small>` : '') },
      { k: 'park', h: 'PM 주차구역', f: r => fmt(r.park) },
      { k: 'fee', h: 'PM 견인', v: r => r.gi == null ? r.tow_n / r.n : r.tow ? r.fee || 1 : 0, f: r => r.gi == null ? `${r.tow_n} / ${r.n}` : r.tow ? (r.fee ? won(r.fee) : '견인') : '없음' },
      { k: 'grace', h: '유예시간', l: 1, v: r => r.grace || '', f: r => r.gi == null ? '' : esc(r.tow ? (r.grace || '자료 없음') : '-') + (r.note && r.tow ? ` <small style="color:var(--muted)">${esc(r.note)}</small>` : '') },
      { k: 'btow', h: '자전거 견인', v: r => r.gi == null ? r.btow_n / r.n : r.btow, f: r => cnt(r, 'btow', 'btow_n') },
      { k: 'dpark', h: '지정주차제', v: r => r.gi == null ? r.dpark_n / r.n : r.dpark, f: r => cnt(r, 'dpark', 'dpark_n') },
      { k: 'nokick', h: 'E-scooter Free Zone', v: r => r.gi == null ? r.nokick_n / r.n : r.nokick, f: r => cnt(r, 'nokick', 'nokick_n') },
      { k: 'bike_km', h: '자전거도로 km', f: r => fmt(r.bike_km) },
      { k: 'bike_ded_km', h: '전용도로 km', f: r => fmt(r.bike_ded_km) }], sc.rows, { k: 'name', asc: true });
    $('pmsup-note').textContent = '시도 행의 "n / m"은 시군구 m곳 중 해당하는 곳 수입니다. 서울처럼 PM 기기가 시도 전체로만 집계된 곳은 시군구 기기 수를 비워 둡니다. E-scooter Free Zone은 그 지자체 안에 운영 구간이 있다는 뜻입니다(지자체 전체가 아님). 견인 여부·견인료·유예시간은 지자체별 견인 운영 현황 표가 있으면 그것을, 없으면 조례 분석을 따릅니다.';
  }

  // ── 안전 (합성데이터) ──
  function renderSafe(sc) {
    const t = sc.total;
    $('pmsafe-sub').textContent = `${sc.label} · ${P.meta.acc_title || '도로교통공단 PM 교통사고 합성데이터'}`;
    kpis('pmsafe-kpis', [[fmt(t.acc), '합성 사고 기록'], [fmt(t.acc_ks), '사망·중상자'], [t.vis && t.acc != null ? (t.acc / t.vis * 1e7).toFixed(2) : '-', '외지인 방문 1천만 명(연인원)당 기록'], ['합성', '실제 통계 아님']]);
    table('pmsafe-table', [
      { k: 'name', h: '지역', l: 1, v: r => nameOf(r), f: r => esc(short(r)) },
      { k: 'acc', h: '기록', f: r => fmt(r.acc) },
      { k: 'acc_ks', h: '사망·중상자', f: r => fmt(r.acc_ks) },
      { k: 'vis', h: '외지인 방문(연인원)', f: r => fmt(r.vis) },
      { k: 'per', h: '방문 1천만 명당 기록', v: r => r.vis && r.acc != null ? r.acc / r.vis : null, f: r => r.vis && r.acc != null ? (r.acc / r.vis * 1e7).toFixed(2) : '-' }], sc.rows, { k: 'acc', asc: false });
    $('pmsafe-note').textContent = '합성데이터는 기록이 다루는 기간이 적혀 있지 않습니다. 구가 있는 시는 시 단위로만 기록돼 있어 시로 묶었습니다. 관광객이 많은 곳의 사고 경향을 대략 비교하는 용도로만 쓰세요.';
  }

  // ── 지도: 고른 시도의 숙소·관광지를 대중교통 거리로 칠함 (관광 이동 공백·마지막 1~3km 탭) ──
  let mapKey = '';
  async function drawMap() {
    const c = ctx(), map = c.map;
    if (!map) return;
    if (!c.isMapReady()) { map.once('load', () => setTimeout(drawMap, 0)); return; }
    const on = (tab === 'pmgap' || tab === 'lastmile') && c.state.sido >= 0;
    if (!map.getSource('pmt')) {
      map.addSource('pmt', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const color = ['match', ['get', 'k'], 0, COL[0], 1, COL[1], COL[2]];
      map.addLayer({ id: 'pmt-lod', type: 'circle', source: 'pmt', filter: ['==', ['get', 't'], 0], paint: { 'circle-color': color, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 1.5, 13, 4], 'circle-opacity': 0.8 } });
      map.addLayer({ id: 'pmt-tour', type: 'circle', source: 'pmt', filter: ['==', ['get', 't'], 1], paint: { 'circle-color': color, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 3, 13, 7], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
      for (const l of ['pmt-lod', 'pmt-tour']) map.on('click', l, e => { const p = e.features[0].properties;
        new maplibregl.Popup({ maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(`<b>${esc(p.n)}</b><br>${p.t ? '관광지' : '숙소'} · 대중교통에서 <b style="color:${COL[p.k]}">${CLS[p.k]}</b>`).addTo(map); });
    }
    for (const l of ['pmt-lod', 'pmt-tour']) map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none');
    if (!on) return;
    const key = `${c.state.sido}:${c.state.sgg}`;
    if (key === mapKey) return;
    mapKey = key;
    const si = c.state.sido, gi = c.state.sgg;
    const [pts, tour, code] = await Promise.all([`data/pts/${si}.json`, `data/tour/${si}.json`, `data/pmtour/${si}.json`].map(u => fetch(dv(u)).then(r => r.json()))).catch(() => [null, null, null]);
    if (!pts || key !== mapKey) return;
    const f = [];
    pts.rows.forEach((r, i) => { const k = code.lod[i]; if (k !== '9' && (gi < 0 || r[3] === gi)) f.push({ type: 'Feature', properties: { t: 0, k: +k, n: r[9] }, geometry: { type: 'Point', coordinates: [r[1], r[0]] } }); });
    tour.forEach((t, i) => { const k = code.tour[i]; if (k !== '9' && (gi < 0 || t[3] === gi)) f.push({ type: 'Feature', properties: { t: 1, k: +k, n: t[4] }, geometry: { type: 'Point', coordinates: [t[1], t[0]] } }); });
    map.getSource('pmt').setData({ type: 'FeatureCollection', features: f });
  }

  function render() {
    if (!P || !PM_TABS.includes(tab)) return;
    const sc = scope();
    ({ pmgap: renderGap, lastmile: renderLast, pmsup: renderSup, pmsafe: renderSafe })[tab](sc);
  }
  function csv(id) {
    const t = tables[id]; if (!t) return;
    const strip = h => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const q = v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const lines = [t.cols.map(c => q(strip(c.h))).join(','), ...t.data.map(r => t.cols.map(c => q(strip(c.f ? c.f(r) : r[c.k]))).join(','))];
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })), download: `PM연계_${id}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  }
  document.addEventListener('click', e => { const b = e.target.closest('.pmt-csv'); if (b) csv(b.dataset.t); });
  window.PMT = {
    tab: t => { tab = t; ready.then(() => { render(); drawMap(); }); },
    update: () => ready.then(() => { render(); drawMap(); }),
  };
})();
