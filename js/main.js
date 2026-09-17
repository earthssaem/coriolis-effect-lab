// 진입점: 모듈 초기화와 화면 전환
import { initDisk } from './disk.js';
import { initGlobe } from './globe.js';
import { initCalc } from './calc.js';

const modules = {
  disk: initDisk(),
  globe: initGlobe(),
  calc: initCalc(),
};

const tabs = [...document.querySelectorAll('.tab')];
const sections = {
  disk: document.getElementById('module-disk'),
  globe: document.getElementById('module-globe'),
  calc: document.getElementById('module-calc'),
};

function show(name) {
  if (!sections[name]) return;
  for (const k in sections) sections[k].classList.toggle('is-active', k === name);
  tabs.forEach(t => t.classList.toggle('is-active', t.dataset.module === name));
  history.replaceState(null, '', `#${name}`);
  modules[name].onShow?.();
}

tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.module)));
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === '1') show('disk');
  if (e.key === '2') show('globe');
  if (e.key === '3') show('calc');
});

const initial = location.hash.replace('#', '');
show(sections[initial] ? initial : 'disk');
