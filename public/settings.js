// Settings: a small store saved in this app's local storage, and the Settings window
// (gear in the title bar, or Ctrl+,). Other scripts read values with VDSettings.get(name) and hear
// about changes through the 'vd:settings' window event.
(function () {
  const KEY = 'vibedeck-settings';
  const DEFAULTS = { promptHighlight: { on: true, color: '#2dd4bf', strength: 'soft' } };
  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}

  const get = name => ({ ...DEFAULTS[name], ...(data[name] || {}) });
  function set(name, patch) {
    data[name] = { ...get(name), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    window.dispatchEvent(new CustomEvent('vd:settings', { detail: name }));
  }
  window.VDSettings = { get, set };

  // ---------- the window ----------
  const SWATCHES = [
    ['#2dd4bf', 'Teal'], ['#fb923c', 'Orange'], ['#facc15', 'Yellow'], ['#f472b6', 'Pink'],
    ['#a78bfa', 'Purple'], ['#60a5fa', 'Blue'], ['#4ade80', 'Green'], ['#f87171', 'Red'],
  ];
  const $ = id => document.getElementById(id);
  const ov = $('settingsOverlay');
  const sw = $('hlSwatches');

  sw.innerHTML = SWATCHES.map(([c, n]) =>
    `<button class="swatch" data-color="${c}" title="${n}" style="--sw:${c}"><span></span><em>${n}</em></button>`).join('')
    + `<label class="swatch custom" title="Pick any color"><input type="color" id="hlCustom"><span></span><em>Custom</em></label>`
    + `<button class="swatch off" data-off="1" title="No highlight"><span></span><em>Off</em></button>`;

  function paint() {
    const h = get('promptHighlight');
    const custom = h.on && !SWATCHES.some(([c]) => c === h.color);
    sw.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on',
      b.dataset.off ? !h.on : b.classList.contains('custom') ? custom : h.on && b.dataset.color === h.color));
    $('hlCustom').value = h.color;
    sw.querySelector('.custom').style.setProperty('--sw', h.color);
    document.querySelectorAll('#hlStrength button').forEach(b => b.classList.toggle('on', b.dataset.s === h.strength));
    $('hlStrength').classList.toggle('disabled', !h.on);
    const L = window.PromptMarks?.look();
    const pv = $('hlPreview');
    pv.classList.toggle('none', !L);
    if (L) { pv.style.setProperty('--hl', L.color); pv.style.setProperty('--hl-tint', L.tint); }
  }

  sw.addEventListener('click', e => {
    const b = e.target.closest('button.swatch');
    if (!b) return;
    if (b.dataset.off) set('promptHighlight', { on: false });
    else set('promptHighlight', { on: true, color: b.dataset.color });
  });
  $('hlCustom').addEventListener('input', e => set('promptHighlight', { on: true, color: e.target.value }));
  $('hlStrength').addEventListener('click', e => {
    const b = e.target.closest('button[data-s]');
    if (b) set('promptHighlight', { strength: b.dataset.s, on: true });
  });
  window.addEventListener('vd:settings', e => {
    if (e.detail === 'promptHighlight') window.PromptMarks?.restyle();
    paint();
  });

  const open = () => { paint(); ov.classList.add('open'); };
  const close = () => ov.classList.remove('open');
  $('settingsBtn').addEventListener('click', open);
  $('settingsClose').addEventListener('click', close);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === ',') { e.preventDefault(); ov.classList.contains('open') ? close() : open(); }
    else if (e.key === 'Escape' && ov.classList.contains('open')) { e.stopPropagation(); close(); }
  }, true);
})();
