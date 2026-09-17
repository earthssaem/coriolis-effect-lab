// 모듈 3: 전향력의 크기 2vΩsinφ 탐구
import { OMEGA } from './globe.js';

const DEG = Math.PI / 180;
const G = 9.8;

// 숫자 → "8.78×10⁻⁴" 형태(HTML)
function sci(x, digits = 2) {
  if (x === 0) return '0';
  const [m, e] = x.toExponential(digits).split('e');
  return `${m}×10<sup>${parseInt(e, 10)}</sup>`;
}
function fmtLength(m) {
  if (m < 1e-3) return `${(m * 1e6).toFixed(1)} µm`;
  if (m < 1) return `${(m * 1e3).toFixed(2)} mm`;
  if (m < 1e3) return `${m.toFixed(1)} m`;
  return `${(m / 1e3).toFixed(1)} km`;
}
function fmtLat(l) { return l === 0 ? '0° (적도)' : `${Math.abs(l)}°${l > 0 ? 'N' : 'S'}`; }

export function initCalc() {
  const el = {
    lat: document.getElementById('calc-lat'), latOut: document.getElementById('calc-lat-out'),
    v: document.getElementById('calc-v'), vOut: document.getElementById('calc-v-out'),
    latPresets: document.getElementById('calc-lat-presets'),
    vPresets: document.getElementById('calc-v-presets'),
    substituted: document.getElementById('calc-substituted'),
    result: document.getElementById('calc-result'),
    dir: document.getElementById('calc-dir'),
    gravity: document.getElementById('calc-gravity'),
    s1: document.getElementById('calc-shift1s'), s1h: document.getElementById('calc-shift1h'), s10m: document.getElementById('calc-shift10m'),
    svg: document.getElementById('calc-svg'),
    tip: document.getElementById('calc-tip'),
  };
  const S = { lat: 37, v: 10 };
  const acc = (latDeg, v) => 2 * v * OMEGA * Math.abs(Math.sin(latDeg * DEG));

  // ── 그래프 골격(SVG) ──────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const W = 900, H = 520, PAD = { l: 96, r: 30, t: 30, b: 78 };
  const px = (lat) => PAD.l + (lat + 90) / 180 * (W - PAD.l - PAD.r);
  const plotH = H - PAD.t - PAD.b;
  const mk = (tag, attrs = {}, parent = el.svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n); return n;
  };

  // 반구 배경 + 설명
  mk('rect', { x: px(-90), y: PAD.t, width: px(0) - px(-90), height: plotH, fill: '#fbe1e0', opacity: 0.35 });
  mk('rect', { x: px(0), y: PAD.t, width: px(90) - px(0), height: plotH, fill: '#dbe8fa', opacity: 0.45 });
  mk('text', { x: (px(-90) + px(0)) / 2, y: PAD.t + 26, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 700, fill: '#9b2524' }).textContent = '남반구 · 운동 방향의 왼쪽으로';
  mk('text', { x: (px(0) + px(90)) / 2, y: PAD.t + 26, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 700, fill: '#1b4f91' }).textContent = '북반구 · 운동 방향의 오른쪽으로';

  const gridG = mk('g');
  const yAxisG = mk('g');
  // x축 눈금
  for (let lat = -90; lat <= 90; lat += 30) {
    mk('line', { x1: px(lat), x2: px(lat), y1: PAD.t, y2: PAD.t + plotH, stroke: '#d6dbe3', 'stroke-width': lat === 0 ? 2 : 1 });
    mk('text', { x: px(lat), y: PAD.t + plotH + 28, 'text-anchor': 'middle', 'font-size': 16, fill: '#4d5560' }).textContent =
      lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`;
  }
  mk('text', { x: (PAD.l + W - PAD.r) / 2, y: H - 22, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: '#15181d' }).textContent = '위도 φ';
  mk('text', { x: 22, y: PAD.t + plotH / 2, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: '#15181d', transform: `rotate(-90 22 ${PAD.t + plotH / 2})` }).textContent = '전향력의 크기 (×10⁻⁴ m/s²)';
  mk('line', { x1: PAD.l, x2: W - PAD.r, y1: PAD.t + plotH, y2: PAD.t + plotH, stroke: '#7b8491', 'stroke-width': 1.5 });

  const curve = mk('path', { fill: 'none', stroke: '#2a78d6', 'stroke-width': 3, 'stroke-linejoin': 'round' });
  const guide = mk('line', { stroke: '#e34948', 'stroke-width': 1.5, 'stroke-dasharray': '6 5' });
  const dot = mk('circle', { r: 9, fill: '#e34948', stroke: '#fff', 'stroke-width': 3 });
  const dotLabel = mk('text', { 'font-size': 17, 'font-weight': 800, fill: '#15181d' });
  const hover = mk('circle', { r: 6, fill: '#15181d', opacity: 0 });
  // 포인터 영역
  const hit = mk('rect', { x: PAD.l, y: PAD.t, width: W - PAD.l - PAD.r, height: plotH, fill: 'transparent' });

  function yScaleMax() {
    // 축 최대: 2vΩ(극에서의 값)를 보기 좋은 값으로 올림
    const top = 2 * Math.max(S.v, 1) * OMEGA / 1e-4;   // ×10⁻⁴ 단위
    const mag = Math.pow(10, Math.floor(Math.log10(top)));
    const n = top / mag;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return nice * mag;
  }
  function drawChart() {
    const ymax = yScaleMax();
    const py = (a) => PAD.t + plotH - (a / 1e-4) / ymax * plotH;
    // y 눈금
    gridG.innerHTML = ''; yAxisG.innerHTML = '';
    for (let i = 0; i <= 4; i++) {
      const yv = ymax * i / 4, y = PAD.t + plotH - i / 4 * plotH;
      mk('line', { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y, stroke: '#e6e9ef', 'stroke-width': 1 }, gridG);
      mk('text', { x: PAD.l - 12, y: y + 6, 'text-anchor': 'end', 'font-size': 15, fill: '#4d5560' }, yAxisG).textContent =
        yv >= 100 ? yv.toFixed(0) : yv >= 10 ? yv.toFixed(1) : yv.toFixed(2);
    }
    // 곡선
    let d = '';
    for (let lat = -90; lat <= 90; lat += 1) d += `${lat === -90 ? 'M' : 'L'}${px(lat).toFixed(1)},${py(acc(lat, S.v)).toFixed(1)}`;
    curve.setAttribute('d', d);
    // 현재 위도 표시
    const a = acc(S.lat, S.v), x = px(S.lat), y = py(a);
    guide.setAttribute('x1', x); guide.setAttribute('x2', x); guide.setAttribute('y1', PAD.t + plotH); guide.setAttribute('y2', y);
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    const left = S.lat > 20;
    dotLabel.setAttribute('x', x + (left ? -16 : 16)); dotLabel.setAttribute('y', y - 14);
    dotLabel.setAttribute('text-anchor', left ? 'end' : 'start');
    dotLabel.textContent = `φ = ${fmtLat(S.lat)} → ${(a / 1e-4).toFixed(2)} ×10⁻⁴ m/s²`;
    return { py };
  }

  // ── 수치 카드 ────────────────────────────────────────
  function updateNumbers() {
    const sinv = Math.sin(S.lat * DEG), a = acc(S.lat, S.v);
    el.latOut.textContent = fmtLat(S.lat);
    el.vOut.textContent = `${S.v} m/s`;
    el.substituted.innerHTML =
      `= 2 × ${S.v} m/s × ${sci(OMEGA)} rad/s × sin(${Math.abs(S.lat)}°)` +
      `<br>= 2 × ${S.v} × ${sci(OMEGA)} × ${Math.abs(sinv).toFixed(3)}`;
    el.result.innerHTML = a === 0 ? '0' : sci(a);
    el.dir.textContent = S.v === 0 ? '움직이지 않는 물체에는 전향력이 작용하지 않습니다.'
      : S.lat === 0 ? '적도에서는 sin φ = 0 이므로 전향력이 0입니다.'
      : S.lat > 0 ? '북반구: 운동 방향의 오른쪽 직각 방향으로 작용' : '남반구: 운동 방향의 왼쪽 직각 방향으로 작용';
    el.gravity.innerHTML = a === 0 ? '–' : `중력의 약 1/${Math.round(G / a).toLocaleString('ko-KR')}`;
    el.s1.textContent = fmtLength(0.5 * a * 1);
    el.s1h.textContent = fmtLength(0.5 * a * 3600 ** 2);
    el.s10m.textContent = fmtLength(0.5 * a * 600 ** 2);
  }

  function update() { updateNumbers(); drawChart(); }

  // ── 이벤트 ────────────────────────────────────────────
  el.lat.addEventListener('input', () => { S.lat = parseInt(el.lat.value, 10); update(); });
  el.v.addEventListener('input', () => { S.v = parseInt(el.v.value, 10); update(); });
  el.latPresets.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.lat = parseInt(b.dataset.lat, 10); el.lat.value = S.lat; update();
  });
  el.vPresets.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.v = parseInt(b.dataset.v, 10); el.v.value = S.v; update();
  });

  // 그래프 위 마우스: 툴팁 + 클릭으로 위도 선택
  const latFromEvent = (e) => {
    const r = el.svg.getBoundingClientRect();
    const xSvg = (e.clientX - r.left) / r.width * W;
    return Math.round(Math.min(90, Math.max(-90, (xSvg - PAD.l) / (W - PAD.l - PAD.r) * 180 - 90)));
  };
  hit.addEventListener('mousemove', (e) => {
    const lat = latFromEvent(e), a = acc(lat, S.v);
    const { py } = drawChart();
    hover.setAttribute('cx', px(lat)); hover.setAttribute('cy', py(a)); hover.setAttribute('opacity', 0.8);
    const wrap = el.svg.parentElement.getBoundingClientRect();
    const r = el.svg.getBoundingClientRect();
    el.tip.style.left = `${r.left - wrap.left + px(lat) / W * r.width}px`;
    el.tip.style.top = `${r.top - wrap.top + py(a) / H * r.height}px`;
    el.tip.innerHTML = `φ = ${fmtLat(lat)} · sinφ = ${Math.abs(Math.sin(lat * DEG)).toFixed(3)} · ${sci(a)} m/s²`;
    el.tip.hidden = false;
  });
  hit.addEventListener('mouseleave', () => { hover.setAttribute('opacity', 0); el.tip.hidden = true; });
  hit.addEventListener('click', (e) => { S.lat = latFromEvent(e); el.lat.value = S.lat; update(); });

  update();
  return { onShow: update };
}
