// 모듈 3: 전향력의 크기 2vΩsinφ 탐구
import { OMEGA } from './globe.js';
import fx from './fx.js';

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
    quizQ: document.getElementById('calc-quiz-q'), quizOpts: document.getElementById('calc-quiz-options'),
    quizResult: document.getElementById('calc-quiz-result'), quizNew: document.getElementById('calc-quiz-new'),
    quizScore: document.getElementById('calc-score'),
  };
  const S = { lat: 37, v: 10, quizCorrect: 0, quizTotal: 0, quiz: null };
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

  // ── 도전 퀴즈 ─────────────────────────────────────────
  const CITIES = [
    ['서울', 37], ['도쿄', 36], ['오슬로', 60], ['런던', 51], ['뉴욕', 41], ['카이로', 30],
    ['시드니', -34], ['케이프타운', -34], ['부에노스아이레스', -35], ['웰링턴', -41],
    ['키토', 0], ['싱가포르', 1], ['나이로비', -1],
  ];
  const MOVERS = [['바람', 10], ['해류', 1], ['비행기', 250], ['야구공', 40], ['태풍 속 공기', 30]];
  const HEADINGS = ['북쪽', '동쪽', '남쪽', '서쪽'];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sinNorm = (lat) => Math.abs(Math.sin(lat * DEG));

  function newQuiz() {
    const type = pick(['dir', 'dir', 'compare', 'compare', 'calc']);
    let q;
    if (type === 'dir') {
      const [city, lat] = pick(CITIES), [mover, v] = pick(MOVERS), hd = pick(HEADINGS);
      const ans = Math.abs(lat) <= 2 ? 'none' : lat > 0 ? 'right' : 'left';
      q = {
        text: `<b>${city}</b>(위도 ${fmtLat(lat)})에서 ${hd}으로 움직이는 ${mover}(${v} m/s). 전향력은 어느 쪽으로 작용할까요?`,
        options: [['left', '운동 방향의 왼쪽'], ['none', '거의 작용하지 않음'], ['right', '운동 방향의 오른쪽']],
        answer: ans, apply: { lat, v },
        explain: ans === 'none' ? `적도 부근(sin φ ≈ 0)이라 전향력이 거의 0입니다.` :
          `${lat > 0 ? '북반구' : '남반구'}이므로 운동 방향의 ${ans === 'right' ? '오른쪽' : '왼쪽'} 직각 방향입니다. 크기는 ${sci(acc(lat, v))} m/s².`,
      };
    } else if (type === 'compare') {
      let a, b;
      do { a = [pick(CITIES), pick(MOVERS)]; b = [pick(CITIES), pick(MOVERS)]; }
      while (Math.abs(acc(a[0][1], a[1][1]) - acc(b[0][1], b[1][1])) < 1e-6);
      const aA = acc(a[0][1], a[1][1]), aB = acc(b[0][1], b[1][1]);
      q = {
        text: `전향력이 더 <b>큰</b> 쪽은?<br>Ⓐ ${a[0][0]}(${fmtLat(a[0][1])})의 ${a[1][0]} ${a[1][1]} m/s<br>Ⓑ ${b[0][0]}(${fmtLat(b[0][1])})의 ${b[1][0]} ${b[1][1]} m/s`,
        options: [['A', 'Ⓐ'], ['B', 'Ⓑ']],
        answer: aA > aB ? 'A' : 'B', apply: aA > aB ? { lat: a[0][1], v: a[1][1] } : { lat: b[0][1], v: b[1][1] },
        explain: `Ⓐ = 2×${a[1][1]}×Ω×${sinNorm(a[0][1]).toFixed(2)} = ${sci(aA)} m/s², Ⓑ = 2×${b[1][1]}×Ω×${sinNorm(b[0][1]).toFixed(2)} = ${sci(aB)} m/s². 속력과 sin φ를 함께 봐야 합니다.`,
      };
    } else {
      const lat = pick([30, 45, 60, 90, -30, -60]), v = pick([10, 20, 50, 100]);
      const right = acc(lat, v);
      // 오답: 2를 빼먹은 값, sin 대신 cos을 쓴 값(45°·90°처럼 겹치면 5배 값), 10배 값
      const cosD = 2 * v * OMEGA * Math.abs(Math.cos(lat * DEG));
      const wrongs = [right / 2, (cosD < right / 5 || Math.abs(cosD - right) < 1e-9) ? right * 5 : cosD, right * 10];
      const opts = [['ok', sci(right)], ['w1', sci(wrongs[0])], ['w2', sci(wrongs[1])], ['w3', sci(wrongs[2])]]
        .sort(() => Math.random() - 0.5);
      q = {
        text: `위도 <b>${fmtLat(lat)}</b>에서 <b>${v} m/s</b>로 움직이는 물체에 작용하는 전향력의 크기는? (Ω = 7.29×10⁻⁵ rad/s, sin ${Math.abs(lat)}° = ${sinNorm(lat).toFixed(3)})`,
        options: opts.map(([k, t]) => [k, `${t} m/s²`]),
        answer: 'ok', apply: { lat, v },
        explain: `2 × ${v} × 7.29×10⁻⁵ × ${sinNorm(lat).toFixed(3)} = ${sci(right)} m/s²`,
      };
    }
    S.quiz = q;
    el.quizQ.innerHTML = q.text;
    el.quizResult.innerHTML = '';
    el.quizOpts.innerHTML = '';
    for (const [key, label] of q.options) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.k = key; b.innerHTML = label;
      el.quizOpts.appendChild(b);
    }
    fx.click();
  }
  function answerQuiz(key) {
    const q = S.quiz; if (!q || q.done) return;
    q.done = true;
    const ok = key === q.answer;
    S.quizTotal++; if (ok) S.quizCorrect++;
    el.quizScore.textContent = `정답 ${S.quizCorrect} / 문제 ${S.quizTotal}`;
    el.quizOpts.querySelectorAll('button').forEach(b => {
      b.disabled = true;
      if (b.dataset.k === q.answer) b.classList.add('is-correct');
      else if (b.dataset.k === key) b.classList.add('is-wrong');
    });
    el.quizResult.innerHTML = (ok ? '<b class="ok">🎉 정답!</b> ' : '<b class="bad">아쉬워요.</b> ') + q.explain;
    if (ok) { fx.ding(); fx.confettiAt(el.quizResult, 80); } else fx.wrong();
    // 그래프와 계산기를 문제 상황으로 이동
    S.lat = q.apply.lat; S.v = q.apply.v; el.lat.value = S.lat; el.v.value = S.v; update();
  }
  el.quizNew.addEventListener('click', newQuiz);
  el.quizOpts.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) answerQuiz(b.dataset.k); });

  update();
  return { onShow: update };
}
