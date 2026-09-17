// 효과음(WebAudio, 외부 파일 없음)과 폭죽 애니메이션
const fx = {
  muted: false,
  ctx: null,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  tone(freq, dur = 0.15, type = 'sine', gain = 0.18, slideTo = null, delay = 0) {
    if (this.muted) return;
    const c = this.ensure(); if (!c) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },

  whoosh() {
    if (this.muted) return;
    const c = this.ensure(); if (!c) return;
    const dur = 0.35, n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(600, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(2400, c.currentTime + dur);
    const g = c.createGain(); g.gain.value = 0.25;
    src.connect(f).connect(g).connect(c.destination); src.start();
  },
  ding() { this.tone(880, 0.12, 'triangle', 0.2); this.tone(1320, 0.25, 'triangle', 0.2, null, 0.1); this.tone(1760, 0.4, 'triangle', 0.15, null, 0.2); },
  thud() { this.tone(160, 0.25, 'sine', 0.3, 60); },
  click() { this.tone(1200, 0.05, 'square', 0.05); },
  wrong() { this.tone(300, 0.2, 'sawtooth', 0.12, 200); this.tone(220, 0.3, 'sawtooth', 0.12, 150, 0.15); },

  // ── 폭죽 ─────────────────────────────────────────────
  _layer: null,
  _parts: [],
  _raf: 0,
  confetti(x, y, count = 90) {
    if (!this._layer) {
      const cv = document.createElement('canvas');
      cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:1000';
      document.body.appendChild(cv); this._layer = cv;
    }
    const colors = ['#e34948', '#2a78d6', '#eda100', '#1baf7a', '#e87ba4', '#4a3aa7'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9;
      this._parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6,
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 4,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        color: colors[i % colors.length], life: 1,
      });
    }
    if (!this._raf) this._raf = requestAnimationFrame(() => this._tick());
  },
  _tick() {
    const cv = this._layer, dpr = window.devicePixelRatio || 1;
    if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    this._parts = this._parts.filter(p => p.life > 0);
    for (const p of this._parts) {
      p.vy += 0.25; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.012;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      g.fillStyle = p.color; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    this._raf = this._parts.length ? requestAnimationFrame(() => this._tick()) : 0;
    if (!this._raf) g.clearRect(0, 0, innerWidth, innerHeight);
  },
  confettiAt(el, count) {
    const r = el.getBoundingClientRect();
    this.confetti(r.left + r.width / 2, r.top + r.height / 2, count);
  },
};

export default fx;
