// 1. 회전 원반: 같은 공을 정지한 관찰자와 회전하는 관찰자가 동시에 본다.
const R = 1;                      // 원반 반지름
const PR = 0.8;                   // 사람이 서 있는 반지름
const A_THROWER = -Math.PI / 2;   // 던지는 사람: 아래
const A_CATCHER = Math.PI / 2;    // 받는 사람: 위
const V = 0.6;                    // 공의 속력(반지름/s), 고정
const TRAIL_SAMPLES = 240;

const C = {
  blue: '#2a78d6', red: '#e34948', orange: '#eb6834',
  disk: '#f3dcb6', disk2: '#e6c896', rim: '#a97c3f', floor: '#e3e7ee',
  text: '#15181d', text2: '#4d5560', thrower: '#1baf7a', catcher: '#e87ba4', skin: '#f6d2b0',
};

export function initDisk() {
  const section = document.getElementById('module-disk');
  const cvA = document.getElementById('disk-inertial');
  const cvB = document.getElementById('disk-rotating');
  const $ = (id) => document.getElementById(id);
  const el = {
    play: $('disk-play'), reset: $('disk-reset'), interpret: $('disk-interpret'),
    time: $('disk-time'), timeOut: $('disk-time-out'),
    omega: $('disk-omega'), omegaOut: $('disk-omega-out'),
    dir: $('disk-dir'), conclusion: $('disk-conclusion'),
  };
  const S = { omega: 0.4, dir: 1, t: 0, tEnd: 1, running: false, landed: false, interpret: false };

  // ── 물리 ──────────────────────────────────────────────
  const personPos = (a0, t) => {
    const a = a0 + S.dir * S.omega * t;
    return { x: PR * Math.cos(a), y: PR * Math.sin(a) };
  };
  // 던지는 순간, 받는 사람을 향해 던진다(정지계에서 등속 직선 운동)
  function ballVel() {
    const p = personPos(A_THROWER, 0), c = personPos(A_CATCHER, 0);
    const dx = c.x - p.x, dy = c.y - p.y, L = Math.hypot(dx, dy);
    return { vx: V * dx / L, vy: V * dy / L };
  }
  function posInertial(t) {
    const p = personPos(A_THROWER, 0), v = ballVel();
    return { x: p.x + v.vx * t, y: p.y + v.vy * t };
  }
  function toRotating(p, t) {
    const a = -S.dir * S.omega * t, c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  }
  const posRotating = (t) => toRotating(posInertial(t), t);
  function landingTime() {
    const p = personPos(A_THROWER, 0), v = ballVel();
    const a = v.vx * v.vx + v.vy * v.vy, b = 2 * (p.x * v.vx + p.y * v.vy), c = p.x * p.x + p.y * p.y - R * R;
    return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
  }
  // 회전계에서의 상대 속도와 전향력(단위 질량): F = −2Ω×v,  Ω = dir·ω ẑ → F = 2·dir·ω·(v_y, −v_x)
  function coriolisAt(t) {
    const h = 1e-3, t0 = Math.max(0, t - h), t1 = t + h;
    const p0 = posRotating(t0), p1 = posRotating(t1);
    const vx = (p1.x - p0.x) / (t1 - t0), vy = (p1.y - p0.y) / (t1 - t0);
    return { fx: 2 * S.dir * S.omega * vy, fy: -2 * S.dir * S.omega * vx };
  }

  // ── 캔버스 크기 ───────────────────────────────────────
  function fit() {
    const box = cvA.parentElement;
    const size = Math.max(200, Math.floor(Math.min(box.clientWidth, box.clientHeight)));
    for (const cv of [cvA, cvB]) {
      const dpr = window.devicePixelRatio || 1;
      cv.style.width = size + 'px'; cv.style.height = size + 'px';
      cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    }
    draw();
  }

  // ── 그리기 ────────────────────────────────────────────
  function draw() {
    if (!section.classList.contains('is-active')) return;
    drawFrame(cvA, 'inertial');
    drawFrame(cvB, 'rotating');
  }

  function drawFrame(cv, frame) {
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1, size = cv.width / dpr;
    const cx = size / 2, cy = size / 2, sc = size * 0.40;
    const alpha = S.dir * S.omega * S.t;
    const inertial = frame === 'inertial';
    const worldRot = inertial ? 0 : -alpha;   // 회전계: 바깥 세계가 −α 회전
    const diskRot = inertial ? alpha : 0;     // 정지계: 원반이 α 회전

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const W = (fn) => { ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, -sc); fn(); ctx.restore(); };
    const lw = (px) => px / sc;
    const toPx = (p) => ({ x: cx + p.x * sc, y: cy - p.y * sc });

    // 교실 바닥(정지계에 고정)
    W(() => {
      ctx.rotate(worldRot);
      ctx.strokeStyle = C.floor; ctx.lineWidth = lw(1);
      for (let g = -2; g <= 2; g += 0.25) {
        ctx.beginPath(); ctx.moveTo(g, -2); ctx.lineTo(g, 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-2, g); ctx.lineTo(2, g); ctx.stroke();
      }
      ctx.fillStyle = '#c9d3e3';
      ctx.fillRect(-0.9, 1.04, 0.5, 0.06);
    });
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-worldRot);
    ctx.fillStyle = C.text2; ctx.font = `600 ${Math.max(11, size * 0.026)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('창문', -0.65 * sc, -1.13 * sc);
    ctx.restore();

    // 원반
    W(() => {
      ctx.rotate(diskRot);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = C.disk; ctx.fill();
      ctx.fillStyle = C.disk2;
      for (let k = 0; k < 12; k += 2) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, k * Math.PI / 6, (k + 1) * Math.PI / 6); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = C.rim; ctx.lineWidth = lw(4);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.rim; ctx.beginPath(); ctx.arc(0, 0, 0.03, 0, Math.PI * 2); ctx.fill();
      if (S.omega > 0) {   // 회전 방향 화살표
        ctx.strokeStyle = 'rgba(80,50,10,.5)'; ctx.lineWidth = lw(3);
        const r = 0.5, a0 = Math.PI * 0.15, a1 = Math.PI * 0.45;
        ctx.beginPath(); ctx.arc(0, 0, r, a0, a1, S.dir < 0); ctx.stroke();
        const ae = S.dir > 0 ? a1 : a0;
        arrowHead(ctx, r * Math.cos(ae), r * Math.sin(ae), S.dir > 0 ? ae + Math.PI / 2 : ae - Math.PI / 2, 0.07, 'rgba(80,50,10,.5)');
      }
    });

    // 해석: 예상 경로(던지는 사람 → 받는 사람, 원반에 고정)
    if (S.interpret) {
      W(() => {
        ctx.rotate(worldRot);
        const p = personPos(A_THROWER, S.t), c = personPos(A_CATCHER, S.t);
        ctx.setLineDash([lw(9), lw(8)]); ctx.strokeStyle = C.blue; ctx.lineWidth = lw(3);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(c.x, c.y); ctx.stroke(); ctx.setLineDash([]);
        const ang = Math.atan2(c.y - p.y, c.x - p.x);
        arrowHead(ctx, c.x - 0.14 * Math.cos(ang), c.y - 0.14 * Math.sin(ang), ang, 0.07, C.blue);
      });
    }

    // 공의 자취
    if (S.t > 0) {
      W(() => {
        ctx.strokeStyle = C.red; ctx.lineWidth = lw(4); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i <= TRAIL_SAMPLES; i++) {
          const t = S.t * i / TRAIL_SAMPLES, p = inertial ? posInertial(t) : posRotating(t);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      });
    }

    // 해석: 회전계에서 경로를 따라 전향력 화살표(항상 운동 방향에 수직, 방향이 계속 바뀜)
    if (S.interpret && !inertial && S.omega > 0 && S.t > 0) {
      const n = 5;
      for (let i = 1; i <= n; i++) {
        const t = S.tEnd * i / (n + 1);
        if (t > S.t) break;
        drawForce(ctx, W, lw, t, 0.2);
      }
      if (!S.landed) drawForce(ctx, W, lw, S.t, 0.24);
      const last = posRotating(Math.min(S.t, S.tEnd * 2 / 6));
      const f = coriolisAt(Math.min(S.t, S.tEnd * 2 / 6)), m = Math.hypot(f.fx, f.fy) || 1;
      const lp = toPx({ x: last.x + 0.34 * f.fx / m, y: last.y + 0.34 * f.fy / m });
      ctx.save(); ctx.font = `800 ${Math.max(12, size * 0.03)}px sans-serif`; ctx.fillStyle = C.orange;
      ctx.textAlign = f.fx >= 0 ? 'left' : 'right'; ctx.fillText('전향력', lp.x, lp.y + 5); ctx.restore();
    }

    // 사람
    const th = inertial ? personPos(A_THROWER, S.t) : personPos(A_THROWER, 0);
    const ca = inertial ? personPos(A_CATCHER, S.t) : personPos(A_CATCHER, 0);
    drawPerson(ctx, toPx(th), size, C.thrower, '던지는 사람');
    drawPerson(ctx, toPx(ca), size, C.catcher, '받는 사람');

    // 정지계: 공의 속도 화살표(직선 운동 강조)
    const ball = inertial ? posInertial(S.t) : posRotating(S.t);
    if (inertial && S.t > 0 && !S.landed) {
      const v = ballVel(), m = Math.hypot(v.vx, v.vy);
      W(() => {
        ctx.strokeStyle = 'rgba(21,24,29,.5)'; ctx.lineWidth = lw(3);
        const ex = ball.x + 0.2 * v.vx / m, ey = ball.y + 0.2 * v.vy / m;
        ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ex, ey); ctx.stroke();
        arrowHead(ctx, ex, ey, Math.atan2(v.vy, v.vx), 0.06, 'rgba(21,24,29,.5)');
      });
    }
    // 공
    const bp = toPx(ball);
    ctx.save();
    ctx.beginPath(); ctx.arc(bp.x, bp.y, size * 0.022, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.red; ctx.stroke();
    ctx.restore();
  }

  function drawForce(ctx, W, lw, t, len) {
    const p = posRotating(t), f = coriolisAt(t), m = Math.hypot(f.fx, f.fy);
    if (m < 1e-6) return;
    const ex = p.x + len * f.fx / m, ey = p.y + len * f.fy / m;
    W(() => {
      ctx.strokeStyle = C.orange; ctx.lineWidth = lw(3.5); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
      arrowHead(ctx, ex, ey, Math.atan2(f.fy, f.fx), 0.065, C.orange);
      ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(p.x, p.y, 0.014, 0, Math.PI * 2); ctx.fill();
    });
  }
  function arrowHead(ctx, x, y, ang, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s, s * 0.55); ctx.lineTo(-s, -s * 0.55); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawPerson(ctx, p, size, shirt, name) {
    const r = size * 0.035;
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.35, 0, Math.PI * 2); ctx.fillStyle = shirt; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.8, 0, Math.PI * 2); ctx.fillStyle = C.skin; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.stroke();
    ctx.font = `700 ${Math.max(12, size * 0.03)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = C.text;
    ctx.fillText(name, p.x, p.y + r * 2.7);
    ctx.restore();
  }

  // ── 상태 ──────────────────────────────────────────────
  function updateUI() {
    el.time.max = S.tEnd.toFixed(3); el.time.value = Math.min(S.t, S.tEnd);
    el.timeOut.textContent = `${S.t.toFixed(1)} s`;
    el.omegaOut.textContent = S.omega === 0 ? '정지' : `한 바퀴 ${(2 * Math.PI / S.omega).toFixed(0)} s`;
    el.interpret.disabled = S.t === 0;
    el.interpret.classList.toggle('is-active', S.interpret);
    el.interpret.textContent = S.interpret ? '해석 숨기기' : '해석 보기';
    el.play.textContent = S.running ? '⏸ 일시정지' : (S.t > 0 && !S.landed ? '▶ 계속' : '▶ 던지기');

    const side = S.dir > 0 ? '오른쪽' : '왼쪽';
    el.conclusion.classList.toggle('muted', S.t === 0);
    if (S.t === 0) {
      el.conclusion.textContent = '공을 던지고 두 화면을 비교해 보세요.';
    } else if (S.omega === 0) {
      el.conclusion.textContent = '원반이 멈춰 있으면 두 관찰자 모두 공이 직선으로 날아가는 것을 봅니다.';
    } else if (S.interpret) {
      el.conclusion.innerHTML = `밖에서 본 공은 <b>직선</b>으로 날아갔고, 원반 위 관찰자에게는 <b>${side}으로 휘어져</b> 보입니다. ` +
        `공에 다른 힘이 작용한 것이 아니라 <b>관찰자가 회전</b>하기 때문입니다. 이 휘어짐을 설명하려고 도입한 가상의 힘이 <b>전향력</b>이며, ` +
        `항상 운동 방향에 <b>수직</b>이라 운동 방향이 바뀌면 힘의 방향도 함께 바뀝니다.`;
    } else if (S.landed) {
      el.conclusion.innerHTML = `공이 날아가는 동안 원반이 ${(S.omega * S.t * 180 / Math.PI).toFixed(0)}° 돌았습니다. ` +
        `밖에서는 직선, 원반 위에서는 <b>${side}으로 휘어진</b> 경로로 보입니다. 왜 그럴까요? → 해석 보기`;
    } else {
      el.conclusion.textContent = '공이 날아가는 중… 두 화면의 경로를 비교해 보세요.';
    }
  }
  function setTime(t) {
    S.tEnd = landingTime();
    S.t = Math.min(Math.max(0, t), S.tEnd);
    S.landed = S.t >= S.tEnd - 1e-9;
    if (S.t === 0) S.interpret = false;
    updateUI(); draw();
  }
  function reset() { S.running = false; setTime(0); }

  // ── 애니메이션 ────────────────────────────────────────
  let last = null;
  function loop(now) {
    if (S.running) {
      const dt = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      S.t += dt;
      if (S.t >= S.tEnd) { S.t = S.tEnd; S.running = false; S.landed = true; }
      updateUI(); draw();
    } else last = null;
    requestAnimationFrame(loop);
  }

  // ── 이벤트 ────────────────────────────────────────────
  el.play.addEventListener('click', () => {
    if (S.landed) { setTime(0); }
    S.running = !S.running;
    updateUI();
  });
  el.reset.addEventListener('click', reset);
  el.interpret.addEventListener('click', () => { S.interpret = !S.interpret; updateUI(); draw(); });
  el.time.addEventListener('input', () => { S.running = false; setTime(parseFloat(el.time.value)); });
  el.omega.addEventListener('input', () => { S.omega = parseFloat(el.omega.value); setTime(S.t); });
  el.dir.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.dir = parseInt(b.dataset.dir, 10);
    el.dir.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
    setTime(S.t);
  });
  window.addEventListener('resize', fit);
  new ResizeObserver(() => fit()).observe(cvA.parentElement);   // 결론 문장 줄 수가 바뀌어도 캔버스가 넘치지 않게
  window.addEventListener('keydown', (e) => {
    if (!section.classList.contains('is-active') || ['INPUT', 'SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); el.play.click(); }
    if (e.key === 'r' || e.key === 'R') reset();
  });

  reset();
  fit();
  requestAnimationFrame(loop);
  return { onShow: () => requestAnimationFrame(fit) };
}
