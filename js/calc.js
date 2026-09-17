// 3. 전향 효과의 크기: a = 2vΩ|sinφ|
import { OMEGA } from './globe.js';

const DEG = Math.PI / 180;
const UNIT = 1e-3;   // 표시 단위: ×10⁻³ m/s²
const fmtLat = (l) => l === 0 ? '0° (적도)' : `${Math.abs(l)}°${l > 0 ? 'N' : 'S'}`;

export function initCalc() {
  const $ = (id) => document.getElementById(id);
  const el = {
    lat: $('calc-lat'), latOut: $('calc-lat-out'), vSeg: $('calc-v'), vTitle: $('calc-v-title'),
    substituted: $('calc-substituted'), result: $('calc-result'), svg: $('calc-svg'),
  };
  const S = { lat: 37, v: 10 };
  const acc = (latDeg, v) => 2 * v * OMEGA * Math.abs(Math.sin(latDeg * DEG));   // m/s²

  // ── 그래프 골격 ──────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const W = 900, H = 480, PAD = { l: 90, r: 30, t: 24, b: 70 };
  const plotH = H - PAD.t - PAD.b;
  const px = (lat) => PAD.l + (lat + 90) / 180 * (W - PAD.l - PAD.r);
  const mk = (tag, attrs = {}, parent = el.svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n); return n;
  };
  const gridG = mk('g'), yAxisG = mk('g');
  for (let lat = -90; lat <= 90; lat += 30) {
    mk('line', { x1: px(lat), x2: px(lat), y1: PAD.t, y2: PAD.t + plotH, stroke: '#e6e9ef', 'stroke-width': lat === 0 ? 2 : 1 });
    mk('text', { x: px(lat), y: PAD.t + plotH + 28, 'text-anchor': 'middle', 'font-size': 16, fill: '#4d5560' }).textContent =
      lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`;
  }
  mk('text', { x: px(-45), y: PAD.t + plotH + 56, 'text-anchor': 'middle', 'font-size': 15, fill: '#7b8491' }).textContent = '남반구';
  mk('text', { x: px(45), y: PAD.t + plotH + 56, 'text-anchor': 'middle', 'font-size': 15, fill: '#7b8491' }).textContent = '북반구';
  mk('text', { x: (PAD.l + W - PAD.r) / 2, y: PAD.t + plotH + 56, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: '#15181d' }).textContent = '위도 φ';
  mk('text', { x: 20, y: PAD.t + plotH / 2, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: '#15181d', transform: `rotate(-90 20 ${PAD.t + plotH / 2})` }).textContent = '전향 가속도 (×10⁻³ m/s²)';
  mk('line', { x1: PAD.l, x2: W - PAD.r, y1: PAD.t + plotH, y2: PAD.t + plotH, stroke: '#7b8491', 'stroke-width': 1.5 });
  const curve = mk('path', { fill: 'none', stroke: '#2a78d6', 'stroke-width': 3.5, 'stroke-linejoin': 'round' });
  const guide = mk('line', { stroke: '#e34948', 'stroke-width': 1.5, 'stroke-dasharray': '6 5' });
  const dot = mk('circle', { r: 9, fill: '#e34948', stroke: '#fff', 'stroke-width': 3 });
  const dotLabel = mk('text', { 'font-size': 17, 'font-weight': 800, fill: '#15181d' });
  const hit = mk('rect', { x: PAD.l, y: PAD.t, width: W - PAD.l - PAD.r, height: plotH, fill: 'transparent' });

  // 극에서의 값 2vΩ를 보기 좋은 눈금 최댓값으로 올리고, 눈금 개수를 함께 정한다 (×10⁻³ 단위)
  const NICE = [[1, 4], [1.5, 3], [2, 4], [3, 3], [4, 4], [5, 5], [8, 4], [10, 5]];
  function yScale() {
    const top = 2 * S.v * OMEGA / UNIT;
    const mag = Math.pow(10, Math.floor(Math.log10(top))), n = top / mag;
    const [nice, div] = NICE.find(([k]) => n <= k);
    return { ymax: nice * mag, div };
  }
  function drawChart() {
    const { ymax, div } = yScale(), py = (a) => PAD.t + plotH - (a / UNIT) / ymax * plotH;
    const dec = ymax < 1 ? 2 : ymax < 10 ? 1 : 0;
    gridG.innerHTML = ''; yAxisG.innerHTML = '';
    for (let i = 0; i <= div; i++) {
      const yv = ymax * i / div, y = PAD.t + plotH - i / div * plotH;
      mk('line', { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y, stroke: '#e6e9ef' }, gridG);
      mk('text', { x: PAD.l - 12, y: y + 6, 'text-anchor': 'end', 'font-size': 15, fill: '#4d5560' }, yAxisG).textContent = yv.toFixed(dec);
    }
    let d = '';
    for (let lat = -90; lat <= 90; lat++) d += `${lat === -90 ? 'M' : 'L'}${px(lat).toFixed(1)},${py(acc(lat, S.v)).toFixed(1)}`;
    curve.setAttribute('d', d);
    const a = acc(S.lat, S.v), x = px(S.lat), y = py(a);
    guide.setAttribute('x1', x); guide.setAttribute('x2', x); guide.setAttribute('y1', PAD.t + plotH); guide.setAttribute('y2', y);
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    const left = S.lat > 20;
    dotLabel.setAttribute('x', x + (left ? -16 : 16)); dotLabel.setAttribute('y', y - 14);
    dotLabel.setAttribute('text-anchor', left ? 'end' : 'start');
    dotLabel.textContent = `${fmtLat(S.lat)}: ${(a / UNIT).toFixed(2)} ×10⁻³ m/s²`;
  }

  function update() {
    const s = Math.abs(Math.sin(S.lat * DEG)), a = acc(S.lat, S.v);
    el.latOut.textContent = fmtLat(S.lat);
    el.vTitle.textContent = `${S.v} m/s`;
    el.substituted.innerHTML = `= 2 × ${S.v} m/s × 7.29×10<sup>−5</sup> rad/s × |sin ${Math.abs(S.lat)}°|<br>= 2 × ${S.v} × 7.29×10<sup>−5</sup> × ${s.toFixed(3)}`;
    el.result.textContent = (a / UNIT).toFixed(2);
    drawChart();
  }

  el.lat.addEventListener('input', () => { S.lat = parseInt(el.lat.value, 10); update(); });
  el.vSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    el.vSeg.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
    S.v = parseInt(b.dataset.v, 10); update();
  });
  hit.addEventListener('click', (e) => {   // 그래프 클릭 → 위도 선택
    const r = el.svg.getBoundingClientRect();
    const xSvg = (e.clientX - r.left) / r.width * W;
    S.lat = Math.round(Math.min(90, Math.max(-90, (xSvg - PAD.l) / (W - PAD.l - PAD.r) * 180 - 90)));
    el.lat.value = S.lat; update();
  });

  update();
  return { onShow: update };
}
