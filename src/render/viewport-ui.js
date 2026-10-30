import { attachGlassLens } from './liquid-glass.js';
// Compact controls and a genuinely clear canvas, shared by orbit and walking.
export function attachViewportUI(app) {
  const compact = matchMedia('(max-width: 900px), (pointer: coarse), (max-height: 520px)');
  const body = document.body, canvas = app.renderer.domElement;
  const dock = document.getElementById('mobileDock'), directory = document.getElementById('directory');
  let panel = null, hidden = false, previousLabels = false, exploring = false, hintTimer;
  const hint = document.getElementById('cleanHint');
  const glass = attachGlassLens(dock, 'button');
  let lastButton = dock.querySelector('[data-panel="floors"]');
  function setPanel(next) {
    window.dispatchEvent(new Event('mall-panel-change'));
    panel = next;
    for (const name of ['floors', 'tools', 'directory']) body.classList.toggle(`mobile-${name}`, name === panel);
    for (const b of dock.querySelectorAll('[data-panel]')) b.setAttribute('aria-expanded', String(b.dataset.panel === panel));
    lastButton = dock.querySelector('[aria-expanded="true"]') || lastButton;
    glass.select(lastButton);
    if (compact.matches) directory.classList.toggle('collapsed', panel !== 'directory');
    document.querySelector('[data-act="directory"]')?.setAttribute('aria-pressed', String(!directory.classList.contains('collapsed')));
  }
  function closePanel() { if (compact.matches) setPanel(null); }
  function setHidden(on) {
    if (on === hidden) return;
    hidden = on;
    if (on) {
      previousLabels = app.state.labels;
      closePanel(); body.classList.remove('ex-places');
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
    body.classList.toggle('ui-hidden', on);
    clearTimeout(hintTimer); hint.hidden = !on;
    if (on) hintTimer = setTimeout(() => { hint.hidden = true; }, 1800);
    app.setLabels(on ? false : previousLabels);
    window.dispatchEvent(new Event('mall-ui-visibility'));
    canvas.focus({ preventScroll: true });
  }
  for (const b of document.querySelectorAll('[data-ui-hide]')) b.addEventListener('click', () => setHidden(true));
  let scrub = null, suppressClick = false;
  dock.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    const button = e.target.closest('button');
    if (!button) return;
    lastButton = button; glass.select(button);
    if (button.dataset.panel) scrub = { id: e.pointerId, x: e.clientX, button, moved: false };
  });
  dock.addEventListener('pointermove', e => {
    if (!scrub || scrub.id !== e.pointerId) return;
    if (!scrub.moved && Math.abs(e.clientX - scrub.x) < 8) return;
    scrub.moved = true;
    if (!dock.hasPointerCapture(e.pointerId)) dock.setPointerCapture(e.pointerId);
    const x = e.clientX - dock.getBoundingClientRect().left;
    const buttons = [...dock.querySelectorAll('[data-panel]')];
    scrub.button = buttons.reduce((a, b) => Math.abs(b.offsetLeft + b.offsetWidth / 2 - x) < Math.abs(a.offsetLeft + a.offsetWidth / 2 - x) ? b : a);
    glass.select(scrub.button);
  });
  dock.addEventListener('pointerup', e => {
    if (!scrub || scrub.id !== e.pointerId) return;
    if (scrub.moved) {
      suppressClick = true;
      setPanel(scrub.button.dataset.panel);
      setTimeout(() => { suppressClick = false; }, 0);
    }
    scrub = null;
  });
  dock.addEventListener('pointercancel', () => { scrub = null; glass.select(lastButton); });
  dock.addEventListener('click', e => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    const b = e.target.closest('[data-panel]');
    if (b) setPanel(panel === b.dataset.panel ? null : b.dataset.panel);
  });
  document.getElementById('mobileExplore').addEventListener('click', () => { closePanel(); app.enterExplore(); });
  document.getElementById('dirClose').addEventListener('click', () => {
    directory.classList.add('collapsed'); body.classList.remove('ex-places'); setPanel(null);
  });
  compact.addEventListener('change', () => {
    setPanel(null); directory.classList.add('collapsed'); body.classList.remove('ex-places');
    window.dispatchEvent(new Event('mall-ui-visibility'));
  });
  matchMedia('(orientation: portrait)').addEventListener('change', () => { closePanel(); body.classList.remove('ex-places'); window.dispatchEvent(new Event('mall-ui-visibility')); });
  setPanel(null);
  // A tap restores; drags and multi-touch zoom never unexpectedly open controls.
  let tap = null;
  canvas.addEventListener('pointerdown', e => {
    if (!hidden) return;
    if (tap || !e.isPrimary) { if (tap) tap.cancelled = true; return; }
    tap = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), cancelled: false };
  }, true);
  canvas.addEventListener('pointermove', e => {
    if (tap?.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 7) tap.cancelled = true;
  }, true);
  canvas.addEventListener('pointercancel', () => { tap = null; }, true);
  canvas.addEventListener('pointerup', e => {
    if (!tap || e.pointerId !== tap.id) return;
    const restore = hidden && !tap.cancelled && performance.now() - tap.at < 450;
    tap = null;
    if (restore) { e.stopImmediatePropagation(); setHidden(false); }
  }, true);
  window.addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea, [contenteditable="true"]') || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.key.toLowerCase() === 'h' || (hidden && e.key === 'Escape')) { e.preventDefault(); setHidden(!hidden); }
  });
  return { compact, closePanel, sync(s) {
    if (!!s.explore !== exploring) { exploring = !!s.explore; closePanel(); }
    const current = s.focus ? app.ctx.lvById[s.focus]?.short : s.building ? app.ctx.bById[s.building]?.short : '园区';
    dock.querySelector('[data-panel="floors"] span').textContent = current ? `${current} ▴` : '楼层';
  } };
}
