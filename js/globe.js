// 2. 지구에서의 운동: 지표면을 따라 운동하는 물체가 어느 쪽으로 휘어 보이는가
import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { Line2 } from '../vendor/Line2.js';
import { LineGeometry } from '../vendor/LineGeometry.js';
import { LineMaterial } from '../vendor/LineMaterial.js';

export const OMEGA = 7.2921e-5;   // rad/s, 지구 자전 각속도
export const R_EARTH = 6371e3;    // m

const DEG = Math.PI / 180;
const MAX_PTS = 1500;
const SUBSTEP = 30;          // s
const SAMPLE_EVERY = 60;     // s
const REVEAL_AFTER = 2 * 3600;   // 예측 결과를 보여 주는 시각(시뮬레이션 시간)

const COL = { blue: 0x3b8ff0, red: 0xff5a5a, orange: 0xff8a3d, grid: 0x6f93c4, equator: 0xd9b95a };

// 위도·경도(rad) → 구면 위 위치. 동쪽 × 북쪽 = 위쪽, y축 = 자전축(북극 +y)
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
  const $ = (id) => document.getElementById(id);
  const el = {
    latSeg: $('globe-lat-seg'), heading: $('globe-heading'), predict: $('globe-predict'),
    run: $('globe-run'), reset: $('globe-reset'), explain: $('globe-explain'),
    lat: $('globe-lat'), latOut: $('globe-lat-out'), v: $('globe-v'), vOut: $('globe-v-out'),
    duration: $('globe-duration'), timescale: $('globe-timescale'),
    view: $('globe-view'), omegaSeg: $('globe-omega'), preset: $('globe-preset'),
  };
  const S = {
    lat: 45, lon: 0, heading: 0, v: 200, durationH: 6, timescale: 1200, omegaMult: 1,
    view: 'earth', prediction: null, objects: [],
  };
  const fatLines = [];

  // ── 장면 ──────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 1.4; controls.maxDistance = 6;

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(4, 3, 2); scene.add(sun);

  const stars = (() => {
    const n = 1200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos.set([40 * s * Math.cos(th), 40 * u, 40 * s * Math.sin(th)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ea, size: 0.2, transparent: true, opacity: 0.7 }));
    scene.add(p); return p;
  })();

  const earth = new THREE.Group(); scene.add(earth);
  const globeMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshPhongMaterial({ color: 0x1f5ea8, specular: 0x224466, shininess: 18 }));
  earth.add(globeMesh);

  // 위·경도 격자(은은하게), 적도(조금 더 뚜렷하게)
  {
    const pts = [], push = (a, b) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let latD = -60; latD <= 60; latD += 30) {
      const phi = latD * DEG;
      for (let i = 0; i < 180; i++) push(toVec(phi, i * 2 * DEG, 1.002), toVec(phi, (i + 1) * 2 * DEG, 1.002));
    }
    for (let lonD = 0; lonD < 360; lonD += 30) {
      for (let i = -45; i < 45; i++) push(toVec(i * 2 * DEG, lonD * DEG, 1.002), toVec((i + 1) * 2 * DEG, lonD * DEG, 1.002));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    earth.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COL.grid, transparent: true, opacity: 0.35 })));
    const eq = [];
    for (let i = 0; i <= 256; i++) { const p = toVec(0, i / 256 * Math.PI * 2, 1.003); eq.push(p.x, p.y, p.z); }
    earth.add(new Line2(new LineGeometry().setPositions(eq), fatMaterial(COL.equator, 2, false, 0.8)));
  }
  // 자전축과 자전 방향
  {
    earth.add(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 2.6, 12), new THREE.MeshBasicMaterial({ color: 0xd9e2f2 })));
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.01, 8, 48, Math.PI * 1.5), new THREE.MeshBasicMaterial({ color: 0xd9e2f2 }));
    torus.rotation.x = -Math.PI / 2; torus.position.y = 1.18; earth.add(torus);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.08, 12), new THREE.MeshBasicMaterial({ color: 0xd9e2f2 }));
    cone.position.set(0, 1.18, 0.16);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    earth.add(cone);
  }
  // 위도 라벨: 작게, 경로(경도 0 부근)를 피해 동쪽 35°에
  for (const [text, latD] of [['60°N', 60], ['30°N', 30], ['적도', 0], ['30°S', -30], ['60°S', -60]]) {
    const sp = makeLabel(text); sp.position.copy(toVec(latD * DEG, 35 * DEG, 1.04)); earth.add(sp);
  }
  const nLabel = makeLabel('N'); nLabel.position.set(0, 1.42, 0); earth.add(nLabel);

  // 출발 지점 고리
  const launchRing = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.042, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
  launchRing.renderOrder = 4; earth.add(launchRing);
  function placeLaunchRing() {
    const p = toVec(S.lat * DEG, S.lon * DEG, 1.012);
    launchRing.position.copy(p); launchRing.lookAt(p.clone().multiplyScalar(2));
  }

  function fatMaterial(color, width, dashed = false, opacity = 1) {
    const m = new LineMaterial({ color, linewidth: width, dashed, dashSize: 0.03, gapSize: 0.02, transparent: true, opacity });
    m.resolution.set(container.clientWidth, container.clientHeight);
    fatLines.push(m); return m;
  }
  function makeLabel(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.font = '700 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(5,10,25,.7)'; g.strokeText(text, 128, 48);
    g.fillStyle = '#dfe6f2'; g.fillText(text, 128, 48);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, opacity: 0.85 }));
    sp.scale.set(0.24, 0.09, 1); sp.renderOrder = 5; return sp;
  }

  // ── 카메라를 출발 지점 쪽으로 ────────────────────────
  function aimCamera(latDeg, lonDeg, dist = 2.7) {
    const p = toVec(latDeg * DEG, lonDeg * DEG, 1);
    // 살짝 위에서 내려다보도록 y를 더한다
    const dir = new THREE.Vector3(p.x, p.y + 0.25, p.z).normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.target.set(0, 0, 0); controls.update();
  }

  // ── 물체 ─────────────────────────────────────────────
  function launch(latDeg, headingDeg, v, lonDeg = 0) {
    const phi = latDeg * DEG, lam = lonDeg * DEG, th = headingDeg * DEG;
    const o = {
      phi, lam, lat0: latDeg, vE: v * Math.sin(th), vN: v * Math.cos(th), v, mult: S.omegaMult,
      ephi: phi, elam: lam, evE: v * Math.sin(th), evN: v * Math.cos(th),
      t: 0, sinceSample: 0, tEnd: S.durationH * 3600, done: false,
      pts: [], epts: [], group: new THREE.Group(),
    };
    o.line = new Line2(new LineGeometry(), fatMaterial(COL.red, 6));
    o.eline = new Line2(new LineGeometry(), fatMaterial(COL.blue, 3, true));
    o.line.visible = false; o.eline.visible = false;
    const dir0 = eastVec(phi, lam).multiplyScalar(o.vE).addScaledVector(northVec(phi, lam), o.vN).normalize();
    o.arrow0 = new THREE.ArrowHelper(dir0, toVec(phi, lam, 1.012), 0.3, COL.blue, 0.1, 0.06);
    o.fArrow = new THREE.ArrowHelper(dir0, toVec(phi, lam, 1.012), 0.2, COL.orange, 0.08, 0.05);
    o.fArrow.visible = false;
    o.marker = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    o.marker.position.copy(toVec(phi, lam, 1.012));
    o.group.add(o.line, o.eline, o.arrow0, o.fArrow, o.marker);
    earth.add(o.group);
    samplePoint(o);
    S.objects.push(o);
    return o;
  }
  function samplePoint(o) {
    if (o.pts.length / 3 >= MAX_PTS) return;
    const p = toVec(o.phi, o.lam, 1.01); o.pts.push(p.x, p.y, p.z);
    const e = toVec(o.ephi, o.elam, 1.007); o.epts.push(e.x, e.y, e.z);
    if (o.pts.length >= 6) {
      o.line.geometry.dispose(); o.line.geometry = new LineGeometry().setPositions(o.pts); o.line.visible = true;
      o.eline.geometry.dispose(); o.eline.geometry = new LineGeometry().setPositions(o.epts);
      o.eline.computeLineDistances(); o.eline.visible = true;
    }
  }
  // 지구에 고정된 좌표계에서의 수평 운동: dvE/dt = f·vN, dvN/dt = −f·vE,  f = 2Ω sinφ
  function stepObject(o, dt) {
    const f = 2 * OMEGA * o.mult * Math.sin(o.phi);
    const a = f * dt, c = Math.cos(a), s = Math.sin(a);
    const vE = o.vE * c + o.vN * s, vN = -o.vE * s + o.vN * c;
    o.vE = vE; o.vN = vN;
    o.phi += vN / R_EARTH * dt;
    o.lam += vE / (R_EARTH * Math.cos(o.phi)) * dt;
    if (Math.abs(o.phi) > 89.5 * DEG) { o.phi = Math.sign(o.phi) * 89.5 * DEG; o.done = true; }
    o.ephi += o.evN / R_EARTH * dt;
    o.elam += o.evE / (R_EARTH * Math.cos(o.ephi)) * dt;
    if (Math.abs(o.ephi) > 89.5 * DEG) o.ephi = Math.sign(o.ephi) * 89.5 * DEG;
    o.t += dt; o.sinceSample += dt;
    if (o.sinceSample >= SAMPLE_EVERY) { o.sinceSample = 0; samplePoint(o); }
    if (o.t >= o.tEnd) o.done = true;
  }
  function updateVisuals(o) {
    const pos = toVec(o.phi, o.lam, 1.012);
    o.marker.position.copy(pos);
    const f = 2 * OMEGA * o.mult * Math.sin(o.phi);
    const aE = f * o.vN, aN = -f * o.vE, mag = Math.hypot(aE, aN);
    if (mag > 1e-12 && !o.done) {
      const d = eastVec(o.phi, o.lam).multiplyScalar(aE).addScaledVector(northVec(o.phi, o.lam), aN).normalize();
      o.fArrow.position.copy(pos); o.fArrow.setDirection(d); o.fArrow.visible = true;
    } else o.fArrow.visible = false;
  }
  function clearAll() {
    for (const o of S.objects) { earth.remove(o.group); o.line.geometry.dispose(); o.eline.geometry.dispose(); }
    S.objects = [];
  }

  // ── 설명 문장 ─────────────────────────────────────────
  const DIR_KO = { left: '왼쪽', right: '오른쪽', none: '휘지 않음' };
  const expected = (latDeg) => latDeg > 3 ? 'right' : latDeg < -3 ? 'left' : 'none';
  function sentence(latDeg) {
    const e = expected(latDeg);
    if (e === 'right') return '<b>북반구</b>에서는 지표면을 따라 운동하는 물체가 진행 방향의 <b>오른쪽</b>으로 휘어 보입니다.';
    if (e === 'left') return '<b>남반구</b>에서는 지표면을 따라 운동하는 물체가 진행 방향의 <b>왼쪽</b>으로 휘어 보입니다.';
    return '<b>적도</b>에서는 수평 방향의 전향 효과가 <b>0</b>이라 휘지 않습니다. (물체가 적도를 벗어나면 조금씩 휘기 시작합니다.)';
  }
  function setExplain(html) { el.explain.innerHTML = html; }

  function run() {
    clearAll();
    const o = launch(S.lat, S.heading, S.v, S.lon);
    o.watch = { pred: S.prediction, revealed: false };
    aimCamera(S.lat, S.lon);
    setExplain(S.prediction
      ? `예측: <b>${DIR_KO[S.prediction]}</b> — 경로를 지켜보세요.`
      : '경로를 지켜보세요. 붉은 선이 실제로 보이는 경로, 파란 점선이 휘지 않았을 때의 경로입니다.');
  }
  function reveal(o) {
    o.watch.revealed = true;
    const ans = expected(o.lat0);
    const s = sentence(o.lat0);
    if (o.watch.pred) {
      const ok = o.watch.pred === ans;
      setExplain(`${ok ? '<span class="ok">예측이 맞았습니다.</span>' : `<span class="bad">예측과 다릅니다.</span> 결과는 <b>${DIR_KO[ans]}</b>.`} ${s}`);
    } else setExplain(`결과: <b>${DIR_KO[ans]}</b>. ${s}`);
  }

  // ── 루프 ─────────────────────────────────────────────
  let last = null;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!section.classList.contains('is-active')) { last = null; return; }
    const dtReal = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    if (dtReal > 0) {
      const simDt = dtReal * S.timescale;
      let anyActive = false;
      for (const o of S.objects) {
        if (o.done) continue;
        anyActive = true;
        let rem = simDt;
        while (rem > 0 && !o.done) { const dt = Math.min(SUBSTEP, rem); stepObject(o, dt); rem -= dt; }
        updateVisuals(o);
        if (o.watch && !o.watch.revealed && (o.t >= REVEAL_AFTER || o.done)) reveal(o);
      }
      if (anyActive) {
        const dAng = OMEGA * S.omegaMult * simDt;
        if (S.view === 'space') earth.rotation.y += dAng; else stars.rotation.y -= dAng;
      }
      launchRing.scale.setScalar(1 + 0.2 * Math.sin(now / 250));
    }
    controls.update();
    renderer.render(scene, camera);
  }
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    for (const m of fatLines) m.resolution.set(w, h);
  }

  // ── 조작 ─────────────────────────────────────────────
  function fmtLat(l) { return l === 0 ? '0° (적도)' : `${Math.abs(l)}°${l > 0 ? 'N' : 'S'}`; }
  function syncLat() {
    el.lat.value = S.lat; el.latOut.textContent = fmtLat(S.lat);
    el.latSeg.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', parseInt(b.dataset.lat, 10) === S.lat));
    placeLaunchRing();
  }
  const seg = (root, attr, cb) => root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    root.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
    cb(b.dataset[attr]);
  });
  seg(el.latSeg, 'lat', (v) => { S.lat = parseInt(v, 10); S.lon = 0; syncLat(); aimCamera(S.lat, S.lon); });
  seg(el.heading, 'heading', (v) => { S.heading = parseInt(v, 10); });
  seg(el.predict, 'p', (v) => { S.prediction = v; run(); });
  seg(el.view, 'view', (v) => { S.view = v; earth.rotation.y = 0; stars.rotation.y = 0; });
  seg(el.omegaSeg, 'mult', (v) => { S.omegaMult = parseFloat(v); });
  el.run.addEventListener('click', () => { S.prediction = null; el.predict.querySelectorAll('button').forEach(x => x.classList.remove('is-active')); run(); });
  el.reset.addEventListener('click', () => {
    clearAll(); S.prediction = null;
    el.predict.querySelectorAll('button').forEach(x => x.classList.remove('is-active'));
    setExplain('위도와 방향을 고르고, 어느 쪽으로 휠지 예측한 뒤 실행하세요.');
  });
  el.lat.addEventListener('input', () => { S.lat = parseInt(el.lat.value, 10); syncLat(); });
  el.v.addEventListener('input', () => { S.v = parseInt(el.v.value, 10); el.vOut.textContent = `${S.v} m/s`; });
  el.duration.addEventListener('change', () => { S.durationH = parseFloat(el.duration.value); });
  el.timescale.addEventListener('change', () => { S.timescale = parseFloat(el.timescale.value); });
  el.preset.addEventListener('click', () => {
    clearAll(); S.prediction = null;
    for (const lat of [60, 30, 0, -30, -60]) { launch(lat, 0, 150, S.lon - 8); launch(lat, 180, 150, S.lon + 8); }
    aimCamera(0, S.lon, 3.4);
    setExplain('다섯 위도에서 남북으로 동시에 출발했습니다. 북반구는 오른쪽, 남반구는 왼쪽으로 휘고 적도 부근에서는 거의 휘지 않습니다.');
  });

  // 지구본 클릭 → 출발 위도
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
    S.lat = Math.max(-85, Math.min(85, Math.round(Math.asin(Math.max(-1, Math.min(1, p.y))) / DEG)));
    S.lon = Math.round(Math.atan2(-p.z, p.x) / DEG);
    syncLat();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (e) => {
    if (!section.classList.contains('is-active') || ['INPUT', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'Enter') el.run.click();
  });

  syncLat();
  el.vOut.textContent = `${S.v} m/s`;
  aimCamera(S.lat, S.lon);
  resize();
  requestAnimationFrame(loop);
  return { onShow: () => requestAnimationFrame(resize) };
}
