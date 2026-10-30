// One optical surface moves between real controls. No duplicate text layers.
export function attachGlassLens(track, selector) {
  const lens = track.querySelector('.dock-lens') || document.createElement('span');
  lens.classList.add('glass-lens');
  lens.setAttribute('aria-hidden', 'true');
  track.classList.add('liquid-track');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = null, position = null, target = null, frame = 0, last = 0;
  const velocity = { x: 0, y: 0, w: 0, h: 0 };

  function paint() {
    if (!position) return;
    const stretch = reduced.matches ? 0 : Math.min(.13, Math.abs(velocity.x) / 3800);
    lens.style.width = `${position.w}px`;
    lens.style.height = `${position.h}px`;
    lens.style.transform = `translate3d(${position.x}px,${position.y}px,0) scale(${1 + stretch},${1 - stretch * .45})`;
  }
  function step(now) {
    const dt = Math.min((now - last) / 1000 || 1 / 60, 1 / 30);
    last = now;
    let settled = true;
    for (const key of ['x', 'y', 'w', 'h']) {
      velocity[key] += ((target[key] - position[key]) * 360 - velocity[key] * 30) * dt;
      position[key] += velocity[key] * dt;
      if (Math.abs(target[key] - position[key]) > .1 || Math.abs(velocity[key]) > .2) settled = false;
    }
    if (settled) {
      position = { ...target };
      for (const key of Object.keys(velocity)) velocity[key] = 0;
      frame = 0;
    } else frame = requestAnimationFrame(step);
    paint();
  }
  function select(button, { animate = true } = {}) {
    if (lens.parentElement !== track) track.prepend(lens);
    active = button && track.contains(button) ? button : null;
    for (const control of track.querySelectorAll(selector)) {
      control.toggleAttribute('data-glass-active', control === active);
    }
    track.classList.toggle('has-selection', !!active);
    if (!active) {
      cancelAnimationFrame(frame); frame = 0; position = null;
      return;
    }
    // Hidden drawers are measured by ResizeObserver as soon as they open.
    if (!track.clientWidth || !track.clientHeight) return;
    target = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight };
    if (!position || reduced.matches || !animate) {
      cancelAnimationFrame(frame); frame = 0;
      position = { ...target };
      for (const key of Object.keys(velocity)) velocity[key] = 0;
      paint();
    } else if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  }
  const resize = new ResizeObserver(() => select(active, { animate: false }));
  resize.observe(track);
  const onMotion = () => select(active, { animate: false });
  reduced.addEventListener('change', onMotion);
  return {
    select,
    sync() { select(track.querySelector('[aria-pressed="true"]')); },
    dispose() {
      cancelAnimationFrame(frame); resize.disconnect();
      reduced.removeEventListener('change', onMotion); lens.remove();
    },
  };
}
