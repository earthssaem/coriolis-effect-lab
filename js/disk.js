// 모듈 1: 회전 원반 위에서 공 던지기
// 같은 운동을 두 좌표계(정지계 / 회전계)에서 나란히 그린다.

const R = 1;            // 원반 반지름 (시뮬레이션 단위)
const PR = 0.8;         // 사람이 서 있는 반지름
const A_THROWER = -Math.PI / 2;   // 던지는 사람: 아래쪽
const A_CATCHER = Math.PI / 2;    // 받는 사람: 위쪽
const TRAIL_SAMPLES = 240;

const COLORS = {
  blue: '#2a78d6', red: '#e34948', orange: '#eb6834',
  disk: '#f3dcb6', disk2: '#e6c896', rim: '#a97c3f',
  floor: '#dfe4ec', text: '#15181d', text2: '#4d5560',
  thrower: '#1baf7a', catcher: '#e87ba4', skin: '#f6d2b0',
};

export function initDisk() {
  const cvA = document.getElementById('disk-inertial');
  const cvB = document.getElementById('disk-rotating');
  const section = document.getElementById('module-disk');

  const S = {
    omega: 0.4, dir: 1, v: 0.6, t: 0, rate: 1,
    running: false, landed: false,
    includeThrower: false, showExpected: true, showTrail: true, showForce: true,
  };

  const el = {
    play: document.getElementById('disk-play'),
    reset: document.getElementById('disk-reset'),
    rate: document.getElementById('disk-rate'),
    time: document.getElementById('disk-time'),
    timeOut: document.getElementById('disk-time-out'),
    omega: document.getElementById('disk-omega'),
    omegaOut: document.getElementById('disk-omega-out'),
    v: document.getElementById('disk-v'),
    vOut: document.getElementById('disk-v-out'),
    dir: document.getElementById('disk-dir'),
    showExpected: document.getElementById('disk-show-expected'),
    showTrail: document.getElementById('disk-show-trail'),
    showForce: document.getElementById('disk-show-force'),
    includeThrower: document.getElementById('disk-include-thrower'),
    status: document.getElementById('disk-status'),
    rotNote: document.getElementById('disk-rot-note'),
  };

  // ── 물리 ────────────────────────────────────────────────
  const personPos = (a0, t) => {
    const a = a0 + S.dir * S.omega * t;
    return { x: PR * Math.cos(a), y: PR * Math.sin(a) };
  };
  function ballVel() {
    const p0 = personPos(A_THROWER, 0), c0 = personPos(A_CATCHER, 0);
    const dx = c0.x - p0.x, dy = c0.y - p0.y, L = Math.hypot(dx, dy);
    let vx = S.v * dx / L, vy = S.v * dy / L;
    if (S.includeThrower) {          // 던지는 사람의 접선 속도 ω × r
      vx += -S.dir * S.omega * p0.y;
      vy += S.dir * S.omega * p0.x;
    }
    return { vx, vy };
  }
  function ballPosInertial(t) {
    const p0 = personPos(A_THROWER, 0), v = ballVel();
    return { x: p0.x + v.vx * t, y: p0.y + v.vy * t };
  }
  function toRotating(p, t) {
    const a = -S.dir * S.omega * t, c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  }
  function ballPosRotating(t) { return toRotating(ballPosInertial(t), t); }
  // 공이 원반 가장자리를 벗어나는 시각 (|p0 + v t| = R)
  function landingTime() {
    const p0 = personPos(A_THROWER, 0), v = ballVel();
    const a = v.vx * v.vx + v.vy * v.vy;
    const b = 2 * (p0.x * v.vx + p0.y * v.vy);
    const c = p0.x * p0.x + p0.y * p0.y - R * R;
    const disc = Math.max(0, b * b - 4 * a * c);
    return (-b + Math.sqrt(disc)) / (2 * a);
  }
  function relVelRotating(t) {
    const h = 1e-3;
    const p1 = ballPosRotating(t + h), p0 = ballPosRotating(Math.max(0, t - h));
    const dt = t - h < 0 ? t + h : 2 * h;
    return { vx: (p1.x - p0.x) / dt, vy: (p1.y - p0.y) / dt };
  }
  // 회전계에서의 전향력(단위 질량): F = −2Ω×v_rel,  Ω = dir·ω ẑ  →  F = 2·dir·ω·(v_y, −v_x)
  function coriolis(t) {
    const v = relVelRotating(t);
    return { fx: 2 * S.dir * S.omega * v.vy, fy: -2 * S.dir * S.omega * v.vx };
  }

  // ── 캔버스 준비 ────────────────────────────────────────
  function fitCanvases() {
    const box = cvA.parentElement;
    const controls = section.querySelector('.controls');
    const avail = window.innerHeight - box.getBoundingClientRect().top - controls.offsetHeight - 90;
    const size = Math.max(260, Math.floor(Math.min(box.clientWidth, avail)));
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
    const dpr = window.devicePixelRatio || 1;
    const size = cv.width / dpr;
    const cx = size / 2, cy = size / 2, sc = size * 0.40;
    const alpha = S.dir * S.omega * S.t;              // 원반이 돈 각도
    const worldRot = frame === 'inertial' ? 0 : -alpha; // 회전계는 전체를 −α 회전
    const diskRot = frame === 'inertial' ? alpha : 0;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // 월드 좌표: 중심 원점, y축 위쪽
    const W = (fn) => { ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, -sc); fn(); ctx.restore(); };
    const lw = (px) => px / sc;

    // 1) 교실 바닥(정지계에 고정): 회전계에서는 바닥이 반대로 도는 것처럼 보인다
    W(() => {
      ctx.rotate(worldRot);
      ctx.strokeStyle = COLORS.floor; ctx.lineWidth = lw(1);
      const ext = 1.9;
      for (let g = -2; g <= 2; g += 0.25) {
        ctx.beginPath(); ctx.moveTo(g, -ext); ctx.lineTo(g, ext); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-ext, g); ctx.lineTo(ext, g); ctx.stroke();
      }
      // 창문 표시(정지한 기준물)
      ctx.fillStyle = '#c9d3e3';
      ctx.fillRect(-0.9, 1.04, 0.5, 0.06);
      ctx.fillRect(-1.12, -0.25, 0.06, 0.5);
    });
    // 창문 글자(픽셀 좌표로)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-worldRot);
    ctx.fillStyle = COLORS.text2; ctx.font = `600 ${Math.max(11, size * 0.026)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('창문', -0.65 * sc, -1.13 * sc);
    ctx.restore();

    // 2) 원반
    W(() => {
      ctx.rotate(diskRot);
      // 바닥판
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.disk; ctx.fill();
      // 회전이 보이도록 부채꼴 무늬
      ctx.fillStyle = COLORS.disk2;
      for (let k = 0; k < 12; k += 2) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, k * Math.PI / 6, (k + 1) * Math.PI / 6); ctx.closePath(); ctx.fill();
      }
      // 테두리 · 중심
      ctx.strokeStyle = COLORS.rim; ctx.lineWidth = lw(4);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = COLORS.rim; ctx.beginPath(); ctx.arc(0, 0, 0.035, 0, Math.PI * 2); ctx.fill();
      // 원반 회전 방향 화살표(원반에 붙어 있음)
      if (S.omega > 0) {
        ctx.strokeStyle = 'rgba(80,50,10,.55)'; ctx.lineWidth = lw(3);
        const r = 0.5, a0 = Math.PI * 0.15, a1 = Math.PI * 0.45;
        ctx.beginPath(); ctx.arc(0, 0, r, a0, a1, S.dir < 0); ctx.stroke();
        const ae = S.dir > 0 ? a1 : a0;
        const tx = r * Math.cos(ae), ty = r * Math.sin(ae);
        const tang = S.dir > 0 ? ae + Math.PI / 2 : ae - Math.PI / 2;
        arrowHead(ctx, tx, ty, tang, 0.07, 'rgba(80,50,10,.55)');
      }
    });

    // 3) 예상 경로: 던지는 사람 → 받는 사람 (원반에 고정된 직선)
    if (S.showExpected) {
      W(() => {
        ctx.rotate(worldRot);
        const p = personPos(A_THROWER, S.t), c = personPos(A_CATCHER, S.t);
        ctx.setLineDash([lw(9), lw(8)]); ctx.strokeStyle = COLORS.blue; ctx.lineWidth = lw(3);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(c.x, c.y); ctx.stroke();
        ctx.setLineDash([]);
        const ang = Math.atan2(c.y - p.y, c.x - p.x);
        arrowHead(ctx, c.x - 0.14 * Math.cos(ang), c.y - 0.14 * Math.sin(ang), ang, 0.07, COLORS.blue);
      });
    }

    // 4) 공의 자취
    if (S.showTrail && S.t > 0) {
      W(() => {
        ctx.strokeStyle = COLORS.red; ctx.lineWidth = lw(4); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        const n = TRAIL_SAMPLES;
        for (let i = 0; i <= n; i++) {
          const t = S.t * i / n;
          const p = frame === 'inertial' ? ballPosInertial(t) : ballPosRotating(t);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      });
    }

    // 5) 사람
    const thrower = frame === 'inertial' ? personPos(A_THROWER, S.t) : personPos(A_THROWER, 0);
    const catcher = frame === 'inertial' ? personPos(A_CATCHER, S.t) : personPos(A_CATCHER, 0);
    drawPerson(ctx, cx + thrower.x * sc, cy - thrower.y * sc, size, COLORS.thrower, '던지는 사람');
    drawPerson(ctx, cx + catcher.x * sc, cy - catcher.y * sc, size, COLORS.catcher, '받는 사람');

    // 6) 공 + 전향력 화살표
    const ball = frame === 'inertial' ? ballPosInertial(S.t) : ballPosRotating(S.t);
    if (frame === 'rotating' && S.showForce && S.omega > 0 && S.t > 0 && !S.landed) {
      const f = coriolis(S.t);
      const mag = Math.hypot(f.fx, f.fy);
      if (mag > 1e-6) {
        const len = Math.min(0.42, 0.18 + mag * 0.12);
        const ex = ball.x + len * f.fx / mag, ey = ball.y + len * f.fy / mag;
        W(() => {
          ctx.strokeStyle = COLORS.orange; ctx.lineWidth = lw(4); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ex, ey); ctx.stroke();
          arrowHead(ctx, ex, ey, Math.atan2(f.fy, f.fx), 0.075, COLORS.orange);
        });
        label(ctx, cx + ex * sc, cy - ey * sc, '전향력', COLORS.orange, size, Math.atan2(f.fy, f.fx));
      }
    }
    // 정지계에서는 공의 실제 속도 화살표(직선 운동 강조)
    if (frame === 'inertial' && S.t > 0 && !S.landed) {
      const v = ballVel(), m = Math.hypot(v.vx, v.vy);
      W(() => {
        ctx.strokeStyle = 'rgba(21,24,29,.55)'; ctx.lineWidth = lw(3);
        const ex = ball.x + 0.2 * v.vx / m, ey = ball.y + 0.2 * v.vy / m;
        ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ex, ey); ctx.stroke();
        arrowHead(ctx, ex, ey, Math.atan2(v.vy, v.vx), 0.06, 'rgba(21,24,29,.55)');
      });
    }
    // 공
    ctx.save();
    ctx.beginPath(); ctx.arc(cx + ball.x * sc, cy - ball.y * sc, size * 0.022, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = COLORS.red; ctx.stroke();
    ctx.restore();
  }

  function arrowHead(ctx, x, y, ang, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-s, s * 0.55); ctx.lineTo(-s, -s * 0.55); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawPerson(ctx, x, y, size, shirt, name) {
    const r = size * 0.035;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, Math.PI * 2); ctx.fillStyle = shirt; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fillStyle = COLORS.skin; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
    ctx.font = `700 ${Math.max(12, size * 0.03)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(name, x, y + r * 2.6);
    ctx.restore();
  }
  function label(ctx, x, y, text, color, size, ang) {
    ctx.save();
    ctx.font = `800 ${Math.max(12, size * 0.03)}px sans-serif`;
    ctx.textAlign = Math.cos(ang) >= 0 ? 'left' : 'right';
    ctx.fillStyle = color;
    ctx.fillText(text, x + Math.cos(ang) * 10, y - Math.sin(ang) * 10 + 5);
    ctx.restore();
  }

  // ── 상태 표시 ─────────────────────────────────────────
  function updateOutputs() {
    const tl = landingTime();
    el.time.max = tl.toFixed(3);
    el.time.value = Math.min(S.t, tl);
    el.timeOut.textContent = `${S.t.toFixed(1)} s`;
    el.omegaOut.textContent = S.omega === 0 ? '정지' : `${S.omega.toFixed(2)} rad/s (한 바퀴 ${(2 * Math.PI / S.omega).toFixed(1)} s)`;
    el.vOut.textContent = `${S.v.toFixed(2)} 반지름/s`;
  }
  function updateStatus() {
    if (S.omega === 0) {
      el.status.textContent = '원반이 멈춰 있으면 두 관찰자 모두 공이 직선으로 날아가는 것을 봅니다. 회전 속도를 올려 보세요.';
      el.rotNote.innerHTML = '원반이 멈춰 있어 두 화면이 같다.';
      return;
    }
    const side = S.dir > 0 ? '오른쪽' : '왼쪽';
    el.rotNote.innerHTML = `원반은 멈춰 있고, 공이 <b>${side}으로 휘어져</b> 보인다.`;
    if (S.landed) {
      const land = ballPosRotating(S.t), c = personPos(A_CATCHER, 0), p = personPos(A_THROWER, 0);
      const ex = c.x - p.x, ey = c.y - p.y;
      const cross = ex * (land.y - p.y) - ey * (land.x - p.x); // >0 이면 예상 경로의 왼쪽
      const seen = cross < 0 ? '오른쪽' : '왼쪽';
      const angDeg = (S.omega * S.t * 180 / Math.PI).toFixed(0);
      el.status.innerHTML = `공이 날아가는 ${S.t.toFixed(1)}초 동안 원반이 ${angDeg}° 돌았습니다. ` +
        `밖에서 보면 공은 직선으로 갔지만, 원반 위 사람에게는 목표 지점에서 <b>${seen}으로 치우쳐</b> 떨어진 것으로 보입니다.`;
    } else if (S.t > 0) {
      el.status.textContent = '공이 날아가는 중… 두 화면의 경로를 비교해 보세요.';
    } else {
      el.status.textContent = '▶ 던지기를 누르면 아래쪽 사람이 위쪽 사람에게 공을 던집니다.';
    }
  }

  // ── 애니메이션 ────────────────────────────────────────
  let last = null;
  function loop(now) {
    if (S.running) {
      const dt = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      S.t += dt * S.rate;
      const tl = landingTime();
      if (S.t >= tl) { S.t = tl; S.running = false; S.landed = true; el.play.textContent = '▶ 던지기'; }
      updateOutputs(); updateStatus(); draw();
    } else {
      last = null;
    }
    requestAnimationFrame(loop);
  }

  function reset() {
    S.t = 0; S.running = false; S.landed = false;
    el.play.textContent = '▶ 던지기';
    updateOutputs(); updateStatus(); draw();
  }
  function setTime(t) {
    const tl = landingTime();
    S.t = Math.min(Math.max(0, t), tl);
    S.landed = S.t >= tl - 1e-9;
    updateOutputs(); updateStatus(); draw();
  }

  // ── 이벤트 ────────────────────────────────────────────
  el.play.addEventListener('click', () => {
    if (S.landed) reset();
    S.running = !S.running;
    el.play.textContent = S.running ? '⏸ 일시정지' : '▶ 던지기';
  });
  el.reset.addEventListener('click', reset);
  el.rate.addEventListener('change', () => { S.rate = parseFloat(el.rate.value); });
  el.time.addEventListener('input', () => { S.running = false; el.play.textContent = '▶ 던지기'; setTime(parseFloat(el.time.value)); });
  el.omega.addEventListener('input', () => { S.omega = parseFloat(el.omega.value); setTime(S.t); });
  el.v.addEventListener('input', () => { S.v = parseFloat(el.v.value); setTime(S.t); });
  el.dir.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.dir = parseInt(b.dataset.dir, 10);
    el.dir.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
    setTime(S.t);
  });
  el.showExpected.addEventListener('change', () => { S.showExpected = el.showExpected.checked; draw(); });
  el.showTrail.addEventListener('change', () => { S.showTrail = el.showTrail.checked; draw(); });
  el.showForce.addEventListener('change', () => { S.showForce = el.showForce.checked; draw(); });
  el.includeThrower.addEventListener('change', () => { S.includeThrower = el.includeThrower.checked; setTime(S.t); });

  window.addEventListener('resize', fitCanvases);
  window.addEventListener('keydown', (e) => {
    if (!section.classList.contains('is-active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); el.play.click(); }
    if (e.key === 'r' || e.key === 'R') reset();
  });

  reset();
  fitCanvases();
  requestAnimationFrame(loop);

  return { onShow: fitCanvases };
}
