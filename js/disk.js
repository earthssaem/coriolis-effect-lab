// 모듈 1: 회전 원반 위에서 공 던지기 (+ 공 받기 도전)
// 같은 운동을 두 좌표계(정지계 / 회전계)에서 나란히 그린다.
import fx from './fx.js';

const R = 1;            // 원반 반지름 (시뮬레이션 단위)
const PR = 0.8;         // 사람이 서 있는 반지름
const A_THROWER = -Math.PI / 2;   // 던지는 사람: 아래쪽
const A_CATCHER = Math.PI / 2;    // 받는 사람: 위쪽
const CATCH_R = 0.11;   // 받는 사람이 잡을 수 있는 범위
const TRAIL_SAMPLES = 240;

const COLORS = {
  blue: '#2a78d6', red: '#e34948', orange: '#eb6834', green: '#1baf7a',
  disk: '#f3dcb6', disk2: '#e6c896', rim: '#a97c3f',
  floor: '#dfe4ec', text: '#15181d', text2: '#4d5560',
  thrower: '#1baf7a', catcher: '#e87ba4',
};

export function initDisk() {
  const cvA = document.getElementById('disk-inertial');
  const cvB = document.getElementById('disk-rotating');
  const section = document.getElementById('module-disk');

  const S = {
    omega: 0.4, dir: 1, v: 0.6, aimDeg: 0, t: 0, tEnd: 1, rate: 1,
    running: false, landed: false, caught: false, dragging: false, dragPt: null,
    includeThrower: false, showExpected: true, showTrail: true, showForce: true,
    hits: 0, throws: 0,
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    play: $('disk-play'), reset: $('disk-reset'), rate: $('disk-rate'),
    time: $('disk-time'), timeOut: $('disk-time-out'),
    omega: $('disk-omega'), omegaOut: $('disk-omega-out'),
    v: $('disk-v'), vOut: $('disk-v-out'),
    aim: $('disk-aim'), aimOut: $('disk-aim-out'), solve: $('disk-solve'),
    dir: $('disk-dir'),
    showExpected: $('disk-show-expected'), showTrail: $('disk-show-trail'),
    showForce: $('disk-show-force'), includeThrower: $('disk-include-thrower'),
    status: $('disk-status'), rotNote: $('disk-rot-note'), score: $('disk-score'),
  };

  // ── 물리 ────────────────────────────────────────────────
  const personPos = (a0, t) => {
    const a = a0 + S.dir * S.omega * t;
    return { x: PR * Math.cos(a), y: PR * Math.sin(a) };
  };
  // 던지는 순간 회전계에서 본 던지는 방향(단위 벡터): 받는 사람 방향에서 aimDeg 만큼 돌린 것
  function aimDir(aimDeg = S.aimDeg) {
    const p0 = personPos(A_THROWER, 0), c0 = personPos(A_CATCHER, 0);
    const base = Math.atan2(c0.y - p0.y, c0.x - p0.x) + aimDeg * Math.PI / 180;
    return { x: Math.cos(base), y: Math.sin(base) };
  }
  function ballVel(aimDeg = S.aimDeg) {
    const p0 = personPos(A_THROWER, 0), d = aimDir(aimDeg);
    let vx = S.v * d.x, vy = S.v * d.y;
    if (S.includeThrower) {          // 던지는 사람의 접선 속도 ω × r
      vx += -S.dir * S.omega * p0.y;
      vy += S.dir * S.omega * p0.x;
    }
    return { vx, vy };
  }
  function ballPosInertial(t, aimDeg) {
    const p0 = personPos(A_THROWER, 0), v = ballVel(aimDeg);
    return { x: p0.x + v.vx * t, y: p0.y + v.vy * t };
  }
  function toRotating(p, t) {
    const a = -S.dir * S.omega * t, c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  }
  function ballPosRotating(t, aimDeg) { return toRotating(ballPosInertial(t, aimDeg), t); }
  // 공이 원반 가장자리를 벗어나는 시각 (|p0 + v t| = R)
  function landingTime(aimDeg) {
    const p0 = personPos(A_THROWER, 0), v = ballVel(aimDeg);
    const a = v.vx * v.vx + v.vy * v.vy;
    const b = 2 * (p0.x * v.vx + p0.y * v.vy);
    const c = p0.x * p0.x + p0.y * p0.y - R * R;
    const disc = Math.max(0, b * b - 4 * a * c);
    return (-b + Math.sqrt(disc)) / (2 * a);
  }
  const catcher0 = () => personPos(A_CATCHER, 0);
  function distToCatcher(t, aimDeg) {
    const p = ballPosRotating(t, aimDeg), c = catcher0();
    return Math.hypot(p.x - c.x, p.y - c.y);
  }
  // 받는 사람이 처음으로 공을 잡는 시각(없으면 null)
  function catchTime(aimDeg) {
    const tl = landingTime(aimDeg), n = 300;
    for (let i = 1; i <= n; i++) {
      const t = tl * i / n;
      if (distToCatcher(t, aimDeg) < CATCH_R) {
        let lo = tl * (i - 1) / n, hi = t;
        for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (distToCatcher(m, aimDeg) < CATCH_R) hi = m; else lo = m; }
        return hi;
      }
    }
    return null;
  }
  function minDistToCatcher(aimDeg) {
    const tl = landingTime(aimDeg); let best = Infinity;
    for (let i = 0; i <= 200; i++) best = Math.min(best, distToCatcher(tl * i / 200, aimDeg));
    return best;
  }
  function bestAim() {
    let best = 0, bestD = Infinity;
    for (let a = -85; a <= 85; a += 1) { const d = minDistToCatcher(a); if (d < bestD) { bestD = d; best = a; } }
    for (let a = best - 1; a <= best + 1; a += 0.1) { const d = minDistToCatcher(a); if (d < bestD) { bestD = d; best = a; } }
    return { aim: Math.round(best * 10) / 10, dist: bestD };
  }
  function recomputeEnd() {
    const tc = catchTime();
    S.tEnd = tc ?? landingTime();
    S.willCatch = tc != null;
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

  function faces() {
    if (S.dragging) return { thrower: '🤔', catcher: '🙂' };
    if (S.landed && S.caught) return { thrower: '😄', catcher: '🤩' };
    if (S.landed) return { thrower: '😅', catcher: '😮' };
    if (S.t > 0) return { thrower: '😮', catcher: '😯' };
    return { thrower: '🙂', catcher: '🙂' };
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
    const toPx = (p) => ({ x: cx + p.x * sc, y: cy - p.y * sc });

    // 1) 교실 바닥(정지계에 고정): 회전계에서는 바닥이 반대로 도는 것처럼 보인다
    W(() => {
      ctx.rotate(worldRot);
      ctx.strokeStyle = COLORS.floor; ctx.lineWidth = lw(1);
      const ext = 1.9;
      for (let g = -2; g <= 2; g += 0.25) {
        ctx.beginPath(); ctx.moveTo(g, -ext); ctx.lineTo(g, ext); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-ext, g); ctx.lineTo(ext, g); ctx.stroke();
      }
      ctx.fillStyle = '#c9d3e3';
      ctx.fillRect(-0.9, 1.04, 0.5, 0.06);
      ctx.fillRect(-1.12, -0.25, 0.06, 0.5);
    });
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-worldRot);
    ctx.fillStyle = COLORS.text2; ctx.font = `600 ${Math.max(11, size * 0.026)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('창문', -0.65 * sc, -1.13 * sc);
    ctx.restore();

    // 2) 원반
    W(() => {
      ctx.rotate(diskRot);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.disk; ctx.fill();
      ctx.fillStyle = COLORS.disk2;
      for (let k = 0; k < 12; k += 2) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, k * Math.PI / 6, (k + 1) * Math.PI / 6); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = COLORS.rim; ctx.lineWidth = lw(4);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = COLORS.rim; ctx.beginPath(); ctx.arc(0, 0, 0.035, 0, Math.PI * 2); ctx.fill();
      if (S.omega > 0) {
        ctx.strokeStyle = 'rgba(80,50,10,.55)'; ctx.lineWidth = lw(3);
        const r = 0.5, a0 = Math.PI * 0.15, a1 = Math.PI * 0.45;
        ctx.beginPath(); ctx.arc(0, 0, r, a0, a1, S.dir < 0); ctx.stroke();
        const ae = S.dir > 0 ? a1 : a0;
        const tx = r * Math.cos(ae), ty = r * Math.sin(ae);
        const tang = S.dir > 0 ? ae + Math.PI / 2 : ae - Math.PI / 2;
        arrowHead(ctx, tx, ty, tang, 0.07, 'rgba(80,50,10,.55)');
      }
      // 받는 사람의 잡기 범위(원반에 고정)
      const c = personPos(A_CATCHER, 0);
      ctx.setLineDash([lw(4), lw(4)]); ctx.strokeStyle = 'rgba(232,123,164,.9)'; ctx.lineWidth = lw(2);
      ctx.beginPath(); ctx.arc(c.x, c.y, CATCH_R, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
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
    // 3b) 조준선(원반에 고정): 실제로 던지는 방향
    if (S.aimDeg !== 0 || S.dragging) {
      W(() => {
        // 조준선은 원반에 붙어 있다: 정지계에서는 원반과 함께 돌고, 회전계에서는 고정
        const p = frame === 'inertial' ? personPos(A_THROWER, S.t) : personPos(A_THROWER, 0), d = aimDir();
        const ang = Math.atan2(d.y, d.x) + diskRot;
        const len = 1.5;
        ctx.setLineDash([lw(5), lw(6)]); ctx.strokeStyle = COLORS.green; ctx.lineWidth = lw(3);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + len * Math.cos(ang), p.y + len * Math.sin(ang)); ctx.stroke();
        ctx.setLineDash([]);
      });
      // 조준 화살표(짧게, 굵게)
      W(() => {
        const p = frame === 'inertial' ? personPos(A_THROWER, S.t) : personPos(A_THROWER, 0), d = aimDir();
        const ang = Math.atan2(d.y, d.x) + diskRot;
        const L = 0.32 + (S.v - 0.3) * 0.25;
        const ex = p.x + L * Math.cos(ang), ey = p.y + L * Math.sin(ang);
        ctx.strokeStyle = COLORS.green; ctx.lineWidth = lw(5); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        arrowHead(ctx, ex, ey, ang, 0.08, COLORS.green);
      });
    }

    // 4) 공의 자취
    if (S.showTrail && S.t > 0) {
      W(() => {
        ctx.strokeStyle = COLORS.red; ctx.lineWidth = lw(4); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i <= TRAIL_SAMPLES; i++) {
          const t = S.t * i / TRAIL_SAMPLES;
          const p = frame === 'inertial' ? ballPosInertial(t) : ballPosRotating(t);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      });
    }

    // 5) 사람
    const f = faces();
    const thrower = frame === 'inertial' ? personPos(A_THROWER, S.t) : personPos(A_THROWER, 0);
    const catcher = frame === 'inertial' ? personPos(A_CATCHER, S.t) : personPos(A_CATCHER, 0);
    drawPerson(ctx, toPx(thrower), size, COLORS.thrower, '던지는 사람', f.thrower);
    drawPerson(ctx, toPx(catcher), size, COLORS.catcher, '받는 사람', f.catcher);

    // 6) 공 + 전향력 화살표
    const ball = frame === 'inertial' ? ballPosInertial(S.t) : ballPosRotating(S.t);
    if (frame === 'rotating' && S.showForce && S.omega > 0 && S.t > 0 && !S.landed) {
      const fc = coriolis(S.t);
      const mag = Math.hypot(fc.fx, fc.fy);
      if (mag > 1e-6) {
        const len = Math.min(0.42, 0.18 + mag * 0.12);
        const ex = ball.x + len * fc.fx / mag, ey = ball.y + len * fc.fy / mag;
        W(() => {
          ctx.strokeStyle = COLORS.orange; ctx.lineWidth = lw(4); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ex, ey); ctx.stroke();
          arrowHead(ctx, ex, ey, Math.atan2(fc.fy, fc.fx), 0.075, COLORS.orange);
        });
        label(ctx, cx + ex * sc, cy - ey * sc, '전향력', COLORS.orange, size, Math.atan2(fc.fy, fc.fx));
      }
    }
    if (frame === 'inertial' && S.t > 0 && !S.landed) {
      const v = ballVel(), m = Math.hypot(v.vx, v.vy);
      W(() => {
        ctx.strokeStyle = 'rgba(21,24,29,.55)'; ctx.lineWidth = lw(3);
        const ex = ball.x + 0.2 * v.vx / m, ey = ball.y + 0.2 * v.vy / m;
        ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ex, ey); ctx.stroke();
        arrowHead(ctx, ex, ey, Math.atan2(v.vy, v.vx), 0.06, 'rgba(21,24,29,.55)');
      });
    }
    // 공(잡혔으면 받는 사람 손에)
    const bp = toPx(ball);
    ctx.save();
    ctx.beginPath(); ctx.arc(bp.x, bp.y, size * 0.022, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = COLORS.red; ctx.stroke();
    ctx.restore();

    // 7) 결과 스탬프
    if (S.landed && frame === 'rotating') {
      ctx.save();
      ctx.font = `900 ${size * 0.075}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = S.caught ? 'rgba(27,175,122,.92)' : 'rgba(227,73,72,.9)';
      ctx.translate(cx, cy - size * 0.02); ctx.rotate(-0.12);
      ctx.fillText(S.caught ? '명중!' : '놓쳤다!', 0, 0);
      ctx.restore();
    }
    // 8) 드래그 안내
    if (frame === 'rotating' && S.t === 0 && !S.dragging) {
      ctx.save();
      ctx.font = `600 ${Math.max(12, size * 0.028)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(21,24,29,.55)';
      ctx.fillText('던지는 사람을 끌어서 조준 → 놓으면 던지기', cx, size - size * 0.03);
      ctx.restore();
    }
  }

  function arrowHead(ctx, x, y, ang, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-s, s * 0.55); ctx.lineTo(-s, -s * 0.55); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawPerson(ctx, p, size, shirt, name, face) {
    const r = size * 0.035;
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.35, 0, Math.PI * 2); ctx.fillStyle = shirt; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.stroke();
    ctx.font = `${r * 1.7}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(face, p.x, p.y + r * 0.08);
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${Math.max(12, size * 0.03)}px sans-serif`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(name, p.x, p.y + r * 2.7);
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
    el.time.max = S.tEnd.toFixed(3);
    el.time.value = Math.min(S.t, S.tEnd);
    el.timeOut.textContent = `${S.t.toFixed(1)} s`;
    el.omegaOut.textContent = S.omega === 0 ? '정지' : `${S.omega.toFixed(2)} rad/s (한 바퀴 ${(2 * Math.PI / S.omega).toFixed(1)} s)`;
    el.vOut.textContent = `${S.v.toFixed(2)} 반지름/s`;
    el.aim.value = S.aimDeg;
    el.aimOut.textContent = S.aimDeg === 0 ? '정면' : `${Math.abs(S.aimDeg).toFixed(0)}° ${S.aimDeg > 0 ? '왼쪽' : '오른쪽'}`;
    el.score.textContent = `명중 ${S.hits} / 시도 ${S.throws}`;
  }
  function updateStatus() {
    const side = S.dir > 0 ? '오른쪽' : '왼쪽';
    if (S.omega === 0) {
      el.rotNote.innerHTML = '원반이 멈춰 있어 두 화면이 같다.';
    } else {
      el.rotNote.innerHTML = `원반은 멈춰 있고, 공이 <b>${side}으로 휘어져</b> 보인다.`;
    }
    if (S.landed) {
      const angDeg = (S.omega * S.t * 180 / Math.PI).toFixed(0);
      if (S.caught) {
        el.status.innerHTML = `🎉 <b>명중!</b> 공이 날아가는 ${S.t.toFixed(1)}초 동안 원반이 ${angDeg}° 돌았지만, 미리 ${S.aimDeg === 0 ? '정면으로' : `${Math.abs(S.aimDeg)}° ${S.aimDeg > 0 ? '왼쪽' : '오른쪽'}으로`} 던진 덕분에 받는 사람에게 도착했습니다.`;
      } else {
        const land = ballPosRotating(S.t), c = personPos(A_CATCHER, 0), p = personPos(A_THROWER, 0);
        const ex = c.x - p.x, ey = c.y - p.y;
        const cross = ex * (land.y - p.y) - ey * (land.x - p.x);
        const seen = cross < 0 ? '오른쪽' : '왼쪽';
        el.status.innerHTML = `공이 날아가는 ${S.t.toFixed(1)}초 동안 원반이 ${angDeg}° 돌았습니다. 밖에서 보면 공은 직선으로 갔지만, 원반 위 사람에게는 목표에서 <b>${seen}으로 치우쳐</b> 떨어진 것으로 보입니다. 어느 쪽으로 미리 조준해야 할까요?`;
      }
    } else if (S.dragging) {
      el.status.textContent = '조준 중… 놓으면 던집니다.';
    } else if (S.t > 0) {
      el.status.textContent = '공이 날아가는 중… 두 화면의 경로를 비교해 보세요.';
    } else {
      el.status.innerHTML = '<b>도전!</b> 회전하는 원반 위에서 받는 사람에게 공을 정확히 던져 보세요. 오른쪽 화면에서 던지는 사람을 끌어 조준하거나, 조준 각도 슬라이더를 쓰세요.';
    }
  }

  // ── 애니메이션 ────────────────────────────────────────
  let last = null;
  function loop(now) {
    if (S.running) {
      const dt = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      S.t += dt * S.rate;
      if (S.t >= S.tEnd) finish();
      updateOutputs(); updateStatus(); draw();
    } else {
      last = null;
    }
    requestAnimationFrame(loop);
  }
  function finish() {
    S.t = S.tEnd; S.running = false; S.landed = true; S.caught = S.willCatch;
    el.play.textContent = '▶ 던지기';
    if (S.caught) { S.hits++; fx.ding(); fx.confettiAt(cvB, 120); } else { fx.thud(); }
  }
  function throwBall() {
    recomputeEnd();
    S.t = 0; S.landed = false; S.caught = false; S.running = true; S.throws++;
    el.play.textContent = '⏸ 일시정지';
    fx.whoosh();
    updateOutputs(); updateStatus(); draw();
  }
  function reset() {
    recomputeEnd();
    S.t = 0; S.running = false; S.landed = false; S.caught = false;
    el.play.textContent = '▶ 던지기';
    updateOutputs(); updateStatus(); draw();
  }
  function setTime(t) {
    recomputeEnd();
    S.t = Math.min(Math.max(0, t), S.tEnd);
    S.landed = S.t >= S.tEnd - 1e-9;
    S.caught = S.landed && S.willCatch;
    updateOutputs(); updateStatus(); draw();
  }

  // ── 드래그 조준(회전계 화면) ───────────────────────────
  function toWorld(e) {
    const r = cvB.getBoundingClientRect(), size = r.width, sc = size * 0.40;
    return { x: (e.clientX - r.left - size / 2) / sc, y: -(e.clientY - r.top - size / 2) / sc };
  }
  cvB.addEventListener('pointerdown', (e) => {
    const p = toWorld(e), th = personPos(A_THROWER, 0);
    if (Math.hypot(p.x - th.x, p.y - th.y) > 0.2) return;
    if (S.running) return;
    S.dragging = true; S.t = 0; S.landed = false; S.caught = false;
    cvB.setPointerCapture(e.pointerId);
    fx.click();
    updateStatus(); draw();
  });
  cvB.addEventListener('pointermove', (e) => {
    const p = toWorld(e), th = personPos(A_THROWER, 0);
    if (!S.dragging) {
      cvB.style.cursor = Math.hypot(p.x - th.x, p.y - th.y) <= 0.2 && !S.running ? 'grab' : 'default';
      return;
    }
    const dx = p.x - th.x, dy = p.y - th.y, L = Math.hypot(dx, dy);
    if (L < 0.03) return;
    const c0 = personPos(A_CATCHER, 0);
    const base = Math.atan2(c0.y - th.y, c0.x - th.x);
    let a = (Math.atan2(dy, dx) - base) * 180 / Math.PI;
    a = ((a + 540) % 360) - 180;
    S.aimDeg = Math.round(Math.max(-85, Math.min(85, a)));
    S.v = Math.round(Math.max(0.3, Math.min(1.5, L * 1.6)) * 20) / 20;
    el.v.value = S.v;
    updateOutputs(); draw();
  });
  const endDrag = (e) => {
    if (!S.dragging) return;
    S.dragging = false; cvB.style.cursor = 'default';
    throwBall();
  };
  cvB.addEventListener('pointerup', endDrag);
  cvB.addEventListener('pointercancel', () => { S.dragging = false; draw(); });

  // ── 이벤트 ────────────────────────────────────────────
  el.play.addEventListener('click', () => {
    if (S.landed || S.t === 0) { throwBall(); return; }
    S.running = !S.running;
    el.play.textContent = S.running ? '⏸ 일시정지' : '▶ 계속';
  });
  el.reset.addEventListener('click', reset);
  el.rate.addEventListener('change', () => { S.rate = parseFloat(el.rate.value); });
  el.time.addEventListener('input', () => { S.running = false; el.play.textContent = '▶ 던지기'; setTime(parseFloat(el.time.value)); });
  el.omega.addEventListener('input', () => { S.omega = parseFloat(el.omega.value); setTime(S.t); });
  el.v.addEventListener('input', () => { S.v = parseFloat(el.v.value); setTime(S.t); });
  el.aim.addEventListener('input', () => { S.aimDeg = parseFloat(el.aim.value); setTime(S.t); });
  el.solve.addEventListener('click', () => {
    const b = bestAim();
    S.aimDeg = b.aim; S.running = false;
    setTime(0);
    fx.click();
    el.status.innerHTML = b.dist < CATCH_R
      ? `💡 이 회전 속도와 공 속력에서는 약 <b>${Math.abs(b.aim).toFixed(0)}° ${b.aim > 0 ? '왼쪽' : b.aim < 0 ? '오른쪽' : ''}</b>으로 미리 조준해야 합니다. 조준선(초록)을 확인하고 ▶ 던지기를 눌러 보세요.`
      : `이 조건에서는 어떻게 조준해도 받는 사람에게 닿지 않습니다(가장 가까운 거리 ${b.dist.toFixed(2)}). 공을 더 빠르게 던지거나 회전을 늦춰 보세요.`;
  });
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
