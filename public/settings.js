// Settings: a small store saved in this app's local storage, and the Settings window
// (gear in the title bar, or Ctrl+,). Other scripts read values with VDSettings.get(name) and hear
// about changes through the 'vd:settings' window event.
(function () {
  const KEY = 'vibedeck-settings';
  const DEFAULTS = {
    promptHighlight: { on: true, color: '#2dd4bf', strength: 'soft' },
    answerColors: { style: 'fade', summary: '#4ade80', work: '#8b90a0' },
  };
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
  const HL_COLORS = [
    ['#2dd4bf', 'Teal'], ['#fb923c', 'Orange'], ['#facc15', 'Yellow'], ['#f472b6', 'Pink'],
    ['#a78bfa', 'Purple'], ['#60a5fa', 'Blue'], ['#4ade80', 'Green'], ['#f87171', 'Red'],
  ];
  const SUMMARY_COLORS = [
    ['#4ade80', 'Green'], ['#2dd4bf', 'Teal'], ['#60a5fa', 'Blue'], ['#facc15', 'Yellow'],
    ['#fb923c', 'Orange'], ['#f472b6', 'Pink'], ['#a78bfa', 'Purple'], ['#f3f4f7', 'White'],
  ];
  const WORK_COLORS = [
    ['#8b90a0', 'Gray'], ['#64748b', 'Slate'], ['#7fa6f5', 'Blue'], ['#c4a1f0', 'Purple'],
    ['#71c4d3', 'Cyan'], ['#e8c47c', 'Amber'], ['#ef7b73', 'Red'],
  ];
  const LOOKS = [
    ['fade', 'Fade the work', 'Steps dim back, summary gets a soft band'],
    ['two', 'Two colors', 'Work in one color, summary in another'],
    ['card', 'Summary card', 'Summary gets a tinted block'],
    ['off', 'Off', 'Panes look as they always have'],
  ];
  const $ = id => document.getElementById(id);
  const ov = $('settingsOverlay');

  // a row of color swatches, with a custom picker and (for the prompt highlight) Off
  function swatches(el, list, withOff) {
    el.innerHTML = list.map(([c, n]) =>
      `<button class="swatch" data-color="${c}" title="${n}" style="--sw:${c}"><span></span><em>${n}</em></button>`).join('')
      + `<label class="swatch custom" title="Pick any color"><input type="color"><span></span><em>Custom</em></label>`
      + (withOff ? `<button class="swatch off" data-off="1" title="No highlight"><span></span><em>Off</em></button>` : '');
  }
  function paintSwatches(el, list, color, on = true) {
    const custom = on && !list.some(([c]) => c === color);
    el.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on',
      b.dataset.off ? !on : b.classList.contains('custom') ? custom : on && b.dataset.color === color));
    el.querySelector('input[type=color]').value = color;
    el.querySelector('.custom').style.setProperty('--sw', color);
  }
  function onSwatch(el, pick) {
    el.addEventListener('click', e => {
      const b = e.target.closest('button.swatch');
      if (b) pick(b.dataset.off ? null : b.dataset.color);
    });
    el.querySelector('input[type=color]').addEventListener('input', e => pick(e.target.value));
  }

  // prompt highlight
  const hl = $('hlSwatches');
  swatches(hl, HL_COLORS, true);
  onSwatch(hl, c => set('promptHighlight', c ? { on: true, color: c } : { on: false }));
  $('hlStrength').addEventListener('click', e => {
    const b = e.target.closest('button[data-s]');
    if (b) set('promptHighlight', { strength: b.dataset.s, on: true });
  });

  // answer colors
  const looks = $('acStyle'), acSum = $('acSummary'), acWork = $('acWork');
  looks.innerHTML = LOOKS.map(([id, name, help]) =>
    `<button class="look ${id}" data-style="${id}"><span class="mini"><i class="y"></i><i class="w"></i><i class="w"></i><i class="s"></i><i class="s"></i><i class="s"></i></span><b>${name}</b><em>${help}</em></button>`).join('');
  looks.addEventListener('click', e => {
    const b = e.target.closest('button.look');
    if (b) set('answerColors', { style: b.dataset.style });
  });
  swatches(acSum, SUMMARY_COLORS);
  swatches(acWork, WORK_COLORS);
  onSwatch(acSum, c => set('answerColors', { summary: c, ...(get('answerColors').style === 'off' ? { style: 'fade' } : {}) }));
  onSwatch(acWork, c => set('answerColors', { work: c, style: 'two' }));

  function paint() {
    const h = get('promptHighlight');
    paintSwatches(hl, HL_COLORS, h.color, h.on);
    document.querySelectorAll('#hlStrength button').forEach(b => b.classList.toggle('on', b.dataset.s === h.strength));
    $('hlStrength').classList.toggle('disabled', !h.on);
    const L = window.PromptMarks?.look();
    for (const pv of [$('hlPreview'), $('acPreview')]) {
      pv.classList.toggle('none', !L);
      if (L) { pv.style.setProperty('--hl', L.color); pv.style.setProperty('--hl-tint', L.tint); }
    }

    const a = get('answerColors');
    const A = window.AnswerMarks?.look();
    const vars = el => {
      el.style.setProperty('--ac-sum', a.summary);
      el.style.setProperty('--ac-work', a.work);
      el.style.setProperty('--ac-tint', A ? A.tint : 'transparent');
      el.style.setProperty('--hl', L ? L.color : '#5b5f6b');
    };
    looks.querySelectorAll('.look').forEach(b => { b.classList.toggle('on', b.dataset.style === a.style); vars(b); });
    paintSwatches(acSum, SUMMARY_COLORS, a.summary);
    paintSwatches(acWork, WORK_COLORS, a.work);
    acSum.classList.toggle('disabled', a.style === 'off');
    acWork.classList.toggle('disabled', a.style !== 'two');
    $('acWorkNote').textContent = a.style === 'two' ? '' : 'Used by Two colors. Picking one switches to it.';
    const pv = $('acPreview');
    pv.classList.remove('fade', 'two', 'card', 'off');
    pv.classList.add(a.style);
    vars(pv);
  }

  window.addEventListener('vd:settings', e => {
    if (e.detail === 'promptHighlight') window.PromptMarks?.restyle();
    if (e.detail === 'answerColors') window.AnswerMarks?.restyle();
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
