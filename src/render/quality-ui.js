// Settings share the existing glass panels; no second persistent mobile bar.
export function attachQualityUI(app, viewport) {
  const panel = document.getElementById('qualityPanel');
  const buttons = [...document.querySelectorAll('[data-quality-open]')];
  const switches = [...panel.querySelectorAll('[data-quality-switch]')], choices = [...panel.querySelectorAll('[data-quality-choice]')];
  let opener = null;
  function close(restoreFocus = false) {
    panel.hidden = true;
    buttons.forEach(b => b.setAttribute('aria-expanded', 'false'));
    if (restoreFocus) {
      const target = opener?.offsetParent ? opener : document.querySelector('#mobileDock [data-panel="tools"]');
      (target?.offsetParent ? target : app.renderer.domElement).focus({ preventScroll: true });
    }
  }
  function sync() {
    const q = app.quality;
    document.body.classList.toggle('quality-low', q.tier === 'low');
    for (const b of panel.querySelectorAll('[data-quality-preset]')) b.setAttribute('aria-pressed', String(b.dataset.qualityPreset === q.preset));
    document.getElementById('qualityResolution').value = q.resolution;
    document.getElementById('qualityResolutionValue').value = `${Math.round(q.resolution * 100)}%`;
    // 开关和多选一：值都从当前画质来；依赖别的开关的（data-quality-needs）在那个开关关着时置灰
    for (const input of switches) {
      const off = input.dataset.qualityNeeds ? !q[input.dataset.qualityNeeds] : false;
      input.checked = !!q[input.dataset.qualitySwitch]; input.disabled = off;
      input.closest('.quality-row').classList.toggle('is-off', off);
    }
    for (const group of choices) {
      const off = group.dataset.qualityNeeds ? !q[group.dataset.qualityNeeds] : false;
      group.closest('.quality-row').classList.toggle('is-off', off);
      for (const b of group.querySelectorAll('button')) { b.setAttribute('aria-pressed', String(b.dataset.value === String(q[group.dataset.qualityChoice]))); b.disabled = off; }
    }
    document.getElementById('qualityCrowd').value = q.crowdDensity;
    document.getElementById('qualityCrowdValue').value = `${Math.round(q.crowdDensity * 100)}%`;
    document.getElementById('qualityStatus').textContent = `${q.preset === 'auto' ? '自动 · ' : ''}${q.label}${q.custom ? ' · 已微调' : ''} · 最高 ${q.maxFps} 帧/秒${q.autoReduced ? ' · 已按运行速度降低画质' : ''}`;
    document.getElementById('qualityHint').textContent = q.custom ? '微调已保存。重新选择档位会恢复该档默认设置。' : q.preset === 'auto' ? '手机优先流畅；运行持续变慢时自动降低画质。设置保存在这台设备。'
      : q.preset === 'ultra' ? '「极致」把环境光遮蔽、高光柔光和室内灯光都打开，适合有独立显卡的电脑；卡顿时退回「精细」。' : '立即生效并保存在这台设备。想优先省电、减少发热，可选「流畅」。';
  }
  for (const b of buttons) b.addEventListener('click', () => {
    const open = panel.hidden;
    if (!open) { close(true); return; }
    opener = b;
    viewport.closePanel();
    document.body.classList.remove('ex-places');
    document.getElementById('directory').classList.add('collapsed');
    document.querySelector('[data-act="directory"]')?.setAttribute('aria-pressed', 'false');
    if (document.pointerLockElement) document.exitPointerLock();
    window.dispatchEvent(new Event('mall-ui-visibility'));
    panel.hidden = false;
    buttons.forEach(button => button.setAttribute('aria-expanded', 'true'));
    sync();
    panel.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  });
  document.getElementById('qualityClose').addEventListener('click', () => close(true));
  panel.addEventListener('keydown', e => {
    // Controls use their native keys without also walking/flying the character.
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
  });
  panel.addEventListener('click', e => {
    const preset = e.target.closest('[data-quality-preset]');
    if (preset) app.setQuality(preset.dataset.qualityPreset);
  });
  for (const input of switches) input.addEventListener('change', () => app.customizeQuality({ [input.dataset.qualitySwitch]: input.checked }));
  for (const group of choices) group.addEventListener('click', e => {
    const b = e.target.closest('button[data-value]');
    if (!b || b.disabled) return;
    const key = group.dataset.qualityChoice;
    // 数字项（帧率、阴影精度、灯的盏数）存成数字，其余存成字符串
    app.customizeQuality({ [key]: /^\d+$/.test(b.dataset.value) ? Number(b.dataset.value) : b.dataset.value });
  });
  for (const [id, key, out] of [['qualityResolution', 'resolution', 'qualityResolutionValue'], ['qualityCrowd', 'crowdDensity', 'qualityCrowdValue']]) {
    const input = document.getElementById(id);
    input.addEventListener('input', () => { document.getElementById(out).value = `${Math.round(Number(input.value) * 100)}%`; });
    // Commit on release, avoiding repeated shader/buffer rebuilds while dragging.
    input.addEventListener('change', () => app.customizeQuality({ [key]: Number(input.value) }));
  }
  app.onQuality(sync);
  app.renderer.domElement.addEventListener('pointerdown', () => close(), true);
  window.addEventListener('mall-panel-change', () => close());
  window.addEventListener('mall-ui-visibility', () => {
    if (document.body.classList.contains('ui-hidden')) close();
  });
  window.addEventListener('resize', () => close());
  sync();
  return { close };
}
