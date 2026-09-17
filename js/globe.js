// 모듈 2: 3D 지구본 위에서 운동하는 물체와 전향력
import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { Line2 } from '../vendor/Line2.js';
import { LineGeometry } from '../vendor/LineGeometry.js';
import { LineMaterial } from '../vendor/LineMaterial.js';
import fx from './fx.js';

export const OMEGA = 7.2921e-5;   // rad/s, 지구 자전 각속도
export const R_EARTH = 6371e3;    // m

const DEG = Math.PI / 180;
const MAX_PTS = 1500;
const SUBSTEP = 30;          // s, 적분 시간 간격
const SAMPLE_EVERY = 60;     // s, 자취 점 간격

const COL = { blue: 0x3b8ff0, red: 0xf05656, orange: 0xff8a3d, grid: 0x7ea6dd, equator: 0xffd166 };

// 위도·경도(rad) → 구면 위 위치. 동쪽 × 북쪽 = 위쪽(오른손 좌표계), y축 = 자전축(북극 +y)
function toVec(phi, lam, r = 1, out = new THREE.Vector3()) {
  const c = Math.cos(phi);
  return out.set(r * c * Math.cos(lam), r * Math.sin(phi), -r * c * Math.sin(lam));
}
const eastVec = (phi, lam, out = new THREE.Vector3()) => out.set(-Math.sin(lam), 0, -Math.cos(lam));
const northVec = (phi, lam, out = new THREE.Vector3()) =>
  out.set(-Math.sin(phi) * Math.cos(lam), Math.cos(phi), Math.sin(phi) * Math.sin(lam));

export function initGlobe() {
  const section = document.getElementById('module-globe');
  const container = document.getElementById('globe-canvas');

  const el = {
    lat: document.getElementById('globe-lat'), latOut: document.getElementById('globe-lat-out'),
    heading: document.getElementById('globe-heading'),
    v: document.getElementById('globe-v'), vOut: document.getElementById('globe-v-out'),
    duration: document.getElementById('globe-duration'),
    timescale: document.getElementById('globe-timescale'),
    launch: document.getElementById('globe-launch'),
    pause: document.getElementById('globe-pause'),
    clear: document.getElementById('globe-clear'),
    preset: document.getElementById('globe-preset-textbook'),
    view: document.getElementById('globe-view'),
    hud: document.getElementById('globe-hud'),
    roTime: document.getElementById('ro-time'), roLat: document.getElementById('ro-lat'),
    roSin: document.getElementById('ro-sin'), roAcc: document.getElementById('ro-acc'),
    roDir: document.getElementById('ro-dir'),
    omegaSeg: document.getElementById('globe-omega'),
    predict: document.getElementById('globe-predict'),
    quizResult: document.getElementById('globe-quiz-result'),
    quizScore: document.getElementById('globe-score'),
  };

  const S = {
    lat: 40, lon: 0, heading: 0, v: 150, durationH: 6, timescale: 900, omegaMult: 1,
    paused: false, view: 'earth', objects: [], quizCorrect: 0, quizTotal: 0,
  };

  const fatLines = [];   // 굵은 선 재질(해상도 갱신용)

  // ── 장면 ──────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(2.9, 1.5, 0.9);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 1.5; controls.maxDistance = 7;

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(4, 3, 2); scene.add(sun);

  // 별(정지계에 고정). '지구와 함께 회전' 시점에서는 별이 반대로 돈다.
  const stars = (() => {
    const n = 1600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 40;
      const s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ea, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
    scene.add(p); return p;
  })();

  const earth = new THREE.Group(); scene.add(earth);

  // 지구 본체
  const globeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshPhongMaterial({ color: 0x1f5ea8, specular: 0x224466, shininess: 18 })
  );
  earth.add(globeMesh);

  // 발사 지점 표시(맥동하는 고리)
  const launchRing = new THREE.Mesh(
    new THREE.RingGeometry(0.035, 0.05, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false })
  );
  launchRing.renderOrder = 4;
  earth.add(launchRing);
  function placeLaunchRing() {
    const phi = S.lat * DEG, lam = S.lon * DEG;
    const p = toVec(phi, lam, 1.012);
    launchRing.position.copy(p);
    launchRing.lookAt(p.clone().multiplyScalar(2));
  }

  // 위·경도 격자
  {
    const pts = [];
    const push = (a, b) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let latD = -60; latD <= 60; latD += 30) {
      if (latD === 0) continue;
      const phi = latD * DEG;
      for (let i = 0; i < 180; i++) push(toVec(phi, i * 2 * DEG, 1.002), toVec(phi, (i + 1) * 2 * DEG, 1.002));
    }
    for (let lonD = 0; lonD < 360; lonD += 30) {
      const lam = lonD * DEG;
      for (let i = -45; i < 45; i++) push(toVec(i * 2 * DEG, lam, 1.002), toVec((i + 1) * 2 * DEG, lam, 1.002));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    earth.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COL.grid, transparent: true, opacity: 0.55 })));
    // 적도(굵게)
    const eq = [];
    for (let i = 0; i <= 256; i++) { const p = toVec(0, i / 256 * Math.PI * 2, 1.004); eq.push(p.x, p.y, p.z); }
    const eqLine = new Line2(new LineGeometry().setPositions(eq), fatMaterial(COL.equator, 3));
    earth.add(eqLine);
  }

  // 자전축 + 극 표시 + 자전 방향 화살표
  {
    const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 2.7, 12), new THREE.MeshBasicMaterial({ color: 0xd9e2f2 }));
    earth.add(axis);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 48, Math.PI * 1.5), new THREE.MeshBasicMaterial({ color: COL.equator }));
    torus.rotation.x = -Math.PI / 2; torus.position.y = 1.2; earth.add(torus);
    // 화살촉: 토러스 끝점(각 1.5π) 접선 방향
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 12), new THREE.MeshBasicMaterial({ color: COL.equator }));
    // 토러스는 x축 −90° 회전 → 로컬 (cos a, sin a, 0) 이 월드 (cos a, 0, −sin a)  (a = 1.5π → (0, 0, 1))
    cone.position.set(0, 1.2, 0.2);
    // 자전 방향(북극에서 내려다보면 반시계): 각 a 증가 방향 접선 = (−sin a, 0, −cos a) → (1, 0, 0)
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    earth.add(cone);
  }

  // 글자 라벨(스프라이트)
  const labels = [
    ['북극 N', 90, 0, 1.36], ['남극 S', -90, 0, 1.36],
    ['60°N', 60, 0, 1.08], ['30°N', 30, 0, 1.08], ['적도 0°', 0, 0, 1.08], ['30°S', -30, 0, 1.08], ['60°S', -60, 0, 1.08],
  ];
  for (const [text, latD, lonD, r] of labels) {
    const sp = makeLabel(text); sp.position.copy(toVec(latD * DEG, lonD * DEG, r)); earth.add(sp);
  }

  // ── 굵은 선 재질 ───────────────────────────────────────
  function fatMaterial(color, width, dashed = false) {
    const m = new LineMaterial({ color, linewidth: width, dashed, dashSize: 0.03, gapSize: 0.02, transparent: true });
    m.resolution.set(container.clientWidth, container.clientHeight);
    fatLines.push(m);
    return m;
  }

  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,200,120,.8)'); gr.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  function makeLabel(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.font = '700 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(5,10,25,.85)'; g.strokeText(text, 128, 48);
    g.fillStyle = '#ffffff'; g.fillText(text, 128, 48);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(0.42, 0.158, 1); sp.renderOrder = 5;
    return sp;
  }

  // ── 물체 ─────────────────────────────────────────────
  function launch(latDeg, headingDeg, v, lonDeg = 0) {
    const phi = latDeg * DEG, lam = lonDeg * DEG, th = headingDeg * DEG;
    const o = {
      phi, lam, vE: v * Math.sin(th), vN: v * Math.cos(th), v,
      phi0: phi, lam0: lam, ephi: phi, elam: lam, evE: v * Math.sin(th), evN: v * Math.cos(th),
      t: 0, sinceSample: 0, tEnd: S.durationH * 3600, done: false, mult: S.omegaMult,
      pts: [], epts: [], group: new THREE.Group(),
    };
    // 실제 경로(붉은 굵은 선)
    o.line = new Line2(new LineGeometry(), fatMaterial(COL.red, 4));
    // 전향력이 없을 때의 경로(파란 점선)
    o.eline = new Line2(new LineGeometry(), fatMaterial(COL.blue, 2.5, true));
    o.line.visible = false; o.eline.visible = false;
    // 처음 운동 방향(파란 화살표)
    const dir0 = eastVec(phi, lam).multiplyScalar(o.vE).addScaledVector(northVec(phi, lam), o.vN).normalize();
    o.arrow0 = new THREE.ArrowHelper(dir0, toVec(phi, lam, 1.01), 0.28, COL.blue, 0.09, 0.05);
    // 전향력 화살표(주황), 현재 속도 화살표
    o.fArrow = new THREE.ArrowHelper(dir0, toVec(phi, lam, 1.01), 0.2, COL.orange, 0.08, 0.045);
    o.fArrow.visible = false;
    // 현재 위치 표시
    o.marker = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    o.marker.position.copy(toVec(phi, lam, 1.01));
    o.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    o.glow.scale.set(0.09, 0.09, 1); o.glow.position.copy(o.marker.position); o.glow.material.opacity = 0.7;
    o.group.add(o.line, o.eline, o.arrow0, o.fArrow, o.marker, o.glow);
    earth.add(o.group);
    samplePoint(o);
    S.objects.push(o);
    S.paused = false; el.pause.textContent = '⏸ 일시정지';
    fx.whoosh();
    return o;
  }

  function samplePoint(o) {
    if (o.pts.length / 3 >= MAX_PTS) return;
    const p = toVec(o.phi, o.lam, 1.008); o.pts.push(p.x, p.y, p.z);
    const e = toVec(o.ephi, o.elam, 1.006); o.epts.push(e.x, e.y, e.z);
    if (o.pts.length >= 6) {
      o.line.geometry.dispose(); o.line.geometry = new LineGeometry().setPositions(o.pts); o.line.visible = true;
      o.eline.geometry.dispose(); o.eline.geometry = new LineGeometry().setPositions(o.epts);
      o.eline.computeLineDistances(); o.eline.visible = true;
    }
  }

  // 회전계(지구)에서의 수평 운동: dvE/dt = f·vN, dvN/dt = −f·vE,  f = 2Ω sinφ
  function stepObject(o, dt) {
    const f = 2 * OMEGA * o.mult * Math.sin(o.phi);
    const a = f * dt, c = Math.cos(a), s = Math.sin(a);
    const vE = o.vE * c + o.vN * s, vN = -o.vE * s + o.vN * c;
    o.vE = vE; o.vN = vN;
    o.phi += vN / R_EARTH * dt;
    o.lam += vE / (R_EARTH * Math.cos(o.phi)) * dt;
    if (Math.abs(o.phi) > 89.5 * DEG) { o.phi = Math.sign(o.phi) * 89.5 * DEG; o.done = true; }
    // 전향력이 없을 때(같은 초기 속도, 방향 유지)
    o.ephi += o.evN / R_EARTH * dt;
    o.elam += o.evE / (R_EARTH * Math.cos(o.ephi)) * dt;
    if (Math.abs(o.ephi) > 89.5 * DEG) o.ephi = Math.sign(o.ephi) * 89.5 * DEG;
    o.t += dt; o.sinceSample += dt;
    if (o.sinceSample >= SAMPLE_EVERY) { o.sinceSample = 0; samplePoint(o); }
    if (o.t >= o.tEnd) o.done = true;
  }

  function updateVisuals(o) {
    const pos = toVec(o.phi, o.lam, 1.01);
    o.marker.position.copy(pos);
    o.glow.position.copy(pos);
    const pulse = o.done ? 0.06 : 0.085 + 0.025 * Math.sin(performance.now() / 120);
    o.glow.scale.set(pulse, pulse, 1);
    const f = 2 * OMEGA * o.mult * Math.sin(o.phi);
    // 전향력 방향: (f·vN, −f·vE) (동, 북 성분)
    const aE = f * o.vN, aN = -f * o.vE, mag = Math.hypot(aE, aN);
    if (mag > 1e-12 && !o.done) {
      const d = eastVec(o.phi, o.lam).multiplyScalar(aE).addScaledVector(northVec(o.phi, o.lam), aN).normalize();
      o.fArrow.position.copy(pos); o.fArrow.setDirection(d); o.fArrow.visible = true;
    } else {
      o.fArrow.visible = false;
    }
  }

  function clearAll() {
    for (const o of S.objects) {
      earth.remove(o.group);
      o.line.geometry.dispose(); o.eline.geometry.dispose();
    }
    S.objects = [];
    updateReadout();
  }

  // ── 표시 값 ───────────────────────────────────────────
  const sci = (x) => {
    if (x === 0) return '0';
    const [m, e] = x.toExponential(2).split('e');
    return `${m}×10<sup>${parseInt(e, 10)}</sup>`;
  };
  function updateReadout() {
    const o = S.objects[S.objects.length - 1];
    if (!o) {
      for (const k of ['roTime', 'roLat', 'roSin', 'roAcc', 'roDir']) el[k].textContent = '–';
      return;
    }
    const h = Math.floor(o.t / 3600), m = Math.floor((o.t % 3600) / 60);
    el.roTime.textContent = `${h}시간 ${String(m).padStart(2, '0')}분${o.done ? ' (추적 종료)' : ''}`;
    const latD = o.phi / DEG;
    el.roLat.textContent = `${Math.abs(latD).toFixed(1)}°${latD >= 0 ? 'N' : 'S'}`;
    el.roSin.textContent = Math.sin(o.phi).toFixed(3);
    el.roAcc.innerHTML = `${sci(2 * o.v * OMEGA * o.mult * Math.abs(Math.sin(o.phi)))} m/s²${o.mult > 1 ? ` (자전 ${o.mult}×)` : ''}`;
    const s = Math.sin(o.phi);
    el.roDir.textContent = Math.abs(s) < 0.02 ? '거의 없음 (적도 부근)' : s > 0 ? '운동 방향의 오른쪽' : '운동 방향의 왼쪽';
  }
  function updateControlsOut() {
    const l = S.lat, g = Math.round(S.lon);
    const lonTxt = g === 0 ? '' : ` · 경도 ${Math.abs(g)}°${g > 0 ? 'E' : 'W'}`;
    el.latOut.textContent = (l === 0 ? '0° (적도)' : `${Math.abs(l)}°${l > 0 ? 'N' : 'S'}`) + lonTxt;
    el.vOut.textContent = `${S.v} m/s`;
    placeLaunchRing();
  }

  // ── 예측 퀴즈 ─────────────────────────────────────────
  const DIR_KO = { left: '왼쪽', right: '오른쪽', none: '휘지 않음' };
  function expectedDeflection(latDeg) { return latDeg > 3 ? 'right' : latDeg < -3 ? 'left' : 'none'; }
  function revealQuiz(o) {
    o.quiz.revealed = true;
    const ok = o.quiz.pred === o.quiz.answer;
    S.quizTotal++; if (ok) S.quizCorrect++;
    el.quizScore.textContent = `정답 ${S.quizCorrect} / 문제 ${S.quizTotal}`;
    const why = o.quiz.answer === 'none'
      ? '적도 부근에서는 sin φ ≈ 0 이라 전향력이 거의 없습니다.'
      : `${o.quiz.answer === 'right' ? '북반구' : '남반구'}에서는 전향력이 운동 방향의 ${DIR_KO[o.quiz.answer]} 직각 방향으로 작용합니다.`;
    el.quizResult.innerHTML = ok
      ? `<b class="ok">🎉 정답!</b> ${why}`
      : `<b class="bad">아쉬워요.</b> 정답은 <b>${DIR_KO[o.quiz.answer]}</b>. ${why}`;
    if (ok) { fx.ding(); fx.confettiAt(el.quizResult, 80); } else fx.wrong();
  }

  // ── 지구본 클릭으로 발사 지점 선택 ───────────────────
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y); downAt = null;
    if (moved > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(globeMesh, false)[0];
    if (!hit) return;
    const p = earth.worldToLocal(hit.point.clone());
    const phi = Math.asin(Math.max(-1, Math.min(1, p.y))), lam = Math.atan2(-p.z, p.x);
    S.lat = Math.max(-85, Math.min(85, Math.round(phi / DEG)));
    S.lon = Math.round(lam / DEG);
    el.lat.value = S.lat;
    updateControlsOut();
    fx.click();
    el.hud.textContent = `발사 지점: ${el.latOut.textContent} · ▶ 발사 또는 예측 퀴즈로 발사하세요`;
  });

  // ── 루프 ─────────────────────────────────────────────
  let last = null;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!section.classList.contains('is-active')) { last = null; return; }
    const dtReal = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!S.paused && dtReal > 0) {
      const simDt = dtReal * S.timescale;
      let anyActive = false;
      for (const o of S.objects) {
        if (o.done) continue;
        anyActive = true;
        let rem = simDt;
        while (rem > 0 && !o.done) { const dt = Math.min(SUBSTEP, rem); stepObject(o, dt); rem -= dt; }
        updateVisuals(o);
        if (o.quiz && !o.quiz.revealed && (o.t >= 2 * 3600 || o.done)) revealQuiz(o);
      }
      // 자전: 우주 시점에서는 지구가 돌고, 지구 시점에서는 별이 반대로 돈다
      const dAng = OMEGA * S.omegaMult * simDt;
      launchRing.scale.setScalar(1 + 0.25 * Math.sin(performance.now() / 250));
      if (S.view === 'space') earth.rotation.y += dAng; else stars.rotation.y -= dAng;
      if (anyActive) updateReadout();
    }
    controls.update();
    renderer.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    for (const m of fatLines) m.resolution.set(w, h);
  }

  // ── 이벤트 ────────────────────────────────────────────
  el.lat.addEventListener('input', () => { S.lat = parseInt(el.lat.value, 10); updateControlsOut(); });
  el.v.addEventListener('input', () => { S.v = parseInt(el.v.value, 10); updateControlsOut(); });
  el.heading.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.heading = parseInt(b.dataset.heading, 10);
    el.heading.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
  });
  el.duration.addEventListener('change', () => { S.durationH = parseFloat(el.duration.value); });
  el.timescale.addEventListener('change', () => { S.timescale = parseFloat(el.timescale.value); });
  el.launch.addEventListener('click', () => { launch(S.lat, S.heading, S.v, S.lon); updateReadout(); });
  el.omegaSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.omegaMult = parseFloat(b.dataset.mult);
    el.omegaSeg.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
    el.hud.textContent = S.omegaMult > 1
      ? `지구가 실제보다 ${S.omegaMult}배 빨리 자전한다면? 전향력도 ${S.omegaMult}배가 되어 경로가 훨씬 많이 휩니다.`
      : '실제 지구 자전 속도(하루에 한 바퀴)입니다.';
    fx.click();
  });
  el.predict.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const o = launch(S.lat, S.heading, S.v, S.lon);
    o.quiz = { pred: b.dataset.p, answer: expectedDeflection(S.lat), revealed: false };
    el.quizResult.innerHTML = `예측: <b>${DIR_KO[b.dataset.p]}</b> … 2시간 뒤 결과가 공개됩니다. 경로를 지켜보세요!`;
    updateReadout();
  });
  el.pause.addEventListener('click', () => { S.paused = !S.paused; el.pause.textContent = S.paused ? '▶ 계속' : '⏸ 일시정지'; });
  el.clear.addEventListener('click', clearAll);
  el.preset.addEventListener('click', () => {
    clearAll();
    // 교과서 그림 Ⅱ-6: 60°N·30°N·0°·30°S·60°S 에서 북쪽과 남쪽으로 발사
    for (const lat of [60, 30, 0, -30, -60]) {
      launch(lat, 0, 150, S.lon - 8);
      launch(lat, 180, 150, S.lon + 8);
    }
    updateReadout();
    el.hud.textContent = '교과서 그림 Ⅱ-6 재현: 북반구는 오른쪽, 남반구는 왼쪽으로 휘고 적도에서는 거의 휘지 않습니다.';
  });
  el.view.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.view = b.dataset.view;
    el.view.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
    earth.rotation.y = 0; stars.rotation.y = 0;
    el.hud.textContent = S.view === 'space'
      ? '우주에서 보기: 지구가 서쪽→동쪽으로 자전합니다.'
      : '지구와 함께 회전: 지구는 멈춰 보이고 별이 반대로 돕니다.';
  });
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (e) => {
    if (!section.classList.contains('is-active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); el.pause.click(); }
    if (e.key === 'Enter') el.launch.click();
  });

  updateControlsOut();
  updateReadout();
  resize();
  requestAnimationFrame(loop);

  return { onShow: () => requestAnimationFrame(resize) };
}
