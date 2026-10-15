// Review page: what the agents changed since the last checkpoint, as red/green blocks with Keep and
// Undo on each one, plus the checkpoint timeline with Rewind. VibeDeck snapshots the project before
// every broadcast, relay, pipeline and typed prompt (lib/checkpoints.js), so nothing is ever lost.
(() => {
  const view = $('view-review');
  const I = d => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
  const IC = {
    check: I('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    rewind: I('<path d="M11 19l-9-7 9-7z"/><path d="M22 19l-9-7 9-7z"/>'),
    flag: I('<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>'),
    up: I('<path d="M6 15l6-6 6 6"/>'),
    down: I('<path d="M6 9l6 6 6-6"/>'),
    open: I('<path d="M14 3h7v7M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>'),
    eye: I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    spark: I('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
  };
  const STATUS = { M: ['M', 'Changed'], A: ['A', 'New file'], D: ['D', 'Deleted'] };
  const CONTEXT = 3;

  view.innerHTML = `
    <div class="rv">
      <aside class="rv-side">
        <div class="rv-head">
          <div class="eyebrow">Review</div>
          <h2 id="rvTitle">Nothing to review</h2>
          <div class="rv-since" id="rvSince"></div>
          <div class="rv-acts">
            <button class="btn sm primary" id="rvKeepAll" title="Keep every change (Ctrl+Enter)">${IC.check}Keep all</button>
            <button class="btn sm" id="rvUndoAll" title="Put every file back the way it was at the checkpoint">${IC.undo}Undo all</button>
          </div>
        </div>
        <div class="rv-files" id="rvFiles"></div>
        <div class="rv-sec"><span class="eyebrow">Checkpoints</span><span class="grow"></span><button class="btn sm ghost" id="rvSave" title="Save a checkpoint of the project right now">${IC.flag}Save now</button></div>
        <div class="rv-cps" id="rvCps"></div>
      </aside>
      <div class="rv-main">
        <div class="rv-bar" id="rvBar" hidden>
          <div class="crumbs mono" id="rvCrumbs"></div>
          <span class="grow"></span>
          <span class="rv-count mono" id="rvCount"></span>
          <button class="iconbtn" id="rvPrev" title="Previous change (K)">${IC.up}</button>
          <button class="iconbtn" id="rvNext" title="Next change (J)">${IC.down}</button>
          <span class="tb-sep"></span>
          <button class="btn sm" id="rvOpen" title="Open in the file viewer">${IC.open}Open</button>
          <button class="btn sm" id="rvUndoFile" title="Undo every change in this file">${IC.undo}Undo file</button>
          <button class="btn sm primary" id="rvKeepFile" title="Keep every change in this file">${IC.check}Keep file</button>
        </div>
        <div class="rv-body" id="rvBody"></div>
        <div class="rv-keys"><span><span class="kbd">J</span><span class="kbd">K</span> next and previous change</span><span><span class="kbd">Y</span> keep</span><span><span class="kbd">N</span> undo</span><span><span class="kbd">Shift J</span><span class="kbd">Shift K</span> next and previous file</span><span><span class="kbd">Ctrl Enter</span> keep all</span></div>
      </div>
    </div>`;

  // ---------- data ----------
  let files = [], review = null, cps = [], sel = '', file = null, blocks = [], cur = 0, busy = false, shown = false;
  const expanded = new Set(); // gaps the user opened, by "start-end"
  const openFolds = new Set(); // folded undo-point rows the user opened
  async function call(what, body) {
    const r = await fetch('/api/cp/' + what, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(Error(out.error || `Could not load (${r.status})`), { status: r.status });
    return out;
  }
  const qs = o => '?' + new URLSearchParams(o);

  let loading = null;
  async function refresh() {
    if (needsFolder) { files = []; cps = []; review = null; return renderAll(); }
    if (loading) { loading.again = true; return; }
    loading = { again: false };
    try {
      const [ch, ls] = await Promise.all([call('changes'), shown ? call('list') : Promise.resolve(null)]);
      files = ch.files || []; review = ch.review;
      if (ls) cps = ls.checkpoints || [];
      if (sel && !files.some(f => f.rel === sel)) sel = '';
      if (!sel && files.length && shown) sel = files[0].rel;
      renderBadge();
      if (shown) { renderSide(); await loadFile(); }
    } catch (e) { if (shown) $('rvFiles').innerHTML = `<div class="rv-empty err">${esc(e.message)}</div>`; }
    const again = loading.again;
    loading = null;
    if (again) refresh();
  }
  let fsTimer = null;
  const soon = (ms = 1200) => { clearTimeout(fsTimer); fsTimer = setTimeout(refresh, ms); };

  async function loadFile() {
    if (!sel) { file = null; blocks = []; return renderMain(); }
    const keepCur = file && file.rel === sel;
    try { file = await call('file' + qs({ rel: sel })); }
    catch (e) { file = { rel: sel, error: e.message }; }
    const a = textOf(file.before), b = textOf(file.after);
    blocks = a !== null && b !== null ? LineDiff.hunks(LineDiff.split(a), LineDiff.split(b)) : [];
    if (!keepCur) { cur = 0; expanded.clear(); }
    cur = Math.min(cur, Math.max(0, blocks.length - 1));
    renderMain(!keepCur);
  }
  // text for diffing: a missing file is empty, a binary or huge one cannot be diffed
  const textOf = side => !side ? null : !side.exists ? '' : side.kind === 'text' ? side.text : null;

  // ---------- render: side ----------
  const baseName = rel => rel.split('/').pop();
  const dirName = rel => rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  function renderBadge() {
    const c = $('navReviewCnt');
    c.textContent = files.length ? String(files.length) : '';
    c.classList.toggle('live', files.length > 0);
    $('sbReview').hidden = !files.length;
    $('sbReviewText').textContent = `${files.length} file${files.length === 1 ? '' : 's'} to review`;
  }
  function since() {
    if (!review?.fromTs) return '';
    const cp = cps.find(c => c.id === review.from);
    return `Compared with <b>${esc(cp ? cp.label : 'a checkpoint')}</b>, ${esc(fmtWhen(review.fromTs))}`;
  }
  function renderSide() {
    const adds = files.reduce((n, f) => n + (f.add || 0), 0), dels = files.reduce((n, f) => n + (f.del || 0), 0);
    $('rvTitle').innerHTML = files.length ? `${files.length} file${files.length === 1 ? '' : 's'} changed <span class="rv-tot mono"><b class="ad">+${adds}</b> <b class="dl">-${dels}</b></span>` : 'Nothing to review';
    $('rvSince').innerHTML = since();
    $('rvKeepAll').disabled = $('rvUndoAll').disabled = !files.length || busy;
    $('rvFiles').innerHTML = files.length ? files.map(f => {
      const [code, title] = STATUS[f.status];
      return `<div class="rv-file ${f.rel === sel ? 'on' : ''}" data-rel="${esc(f.rel)}" title="${esc(f.rel)}. ${title}">
        <span class="rv-st s${code}">${code}</span>
        <span class="rv-fn">${esc(baseName(f.rel))}</span><span class="rv-fd mono">${esc(dirName(f.rel))}</span>
        <span class="grow"></span>
        ${f.binary ? '<span class="rv-n mono">binary</span>' : `<span class="rv-n mono"><b class="ad">+${f.add}</b> <b class="dl">-${f.del}</b></span>`}
      </div>`;
    }).join('') : `<div class="rv-empty">${review ? 'Every change is reviewed. New edits from the agents show up here as they happen.' : 'VibeDeck saves a checkpoint before every broadcast. Send a prompt and whatever the agents change shows up here.'}</div>`;
    // back-to-back undo points fold into one row until opened
    const rows = [];
    for (const c of cps) {
      const prev = rows[rows.length - 1];
      if (c.kind === 'safety' && prev && prev.kind === 'safety' && prev.label === c.label && !openFolds.has(prev.id)) { prev.more = (prev.more || 0) + 1; continue; }
      rows.push({ ...c, more: 0 });
    }
    $('rvCps').innerHTML = rows.length ? rows.map(c => `
      <div class="rv-cp ${c.id === review?.from ? 'base' : ''} k-${esc(c.kind)}" data-id="${esc(c.id)}">
        <span class="rv-dot"></span>
        <div class="rv-cpt"><div class="rv-cpl">${esc(c.label)}${c.more ? `<button class="rv-more" data-fold="${esc(c.id)}">+${c.more} earlier</button>` : ''}<span class="rv-when">${esc(fmtWhen(c.ts))}</span></div>${c.prompt ? `<div class="rv-cpp">${esc(c.prompt)}</div>` : ''}</div>
        <span class="rv-cpa">
          <button class="btn sm ghost" data-act="from" title="Review everything that changed since this checkpoint">${IC.eye}Review</button>
          <button class="btn sm ghost danger" data-act="rewind" title="Put the whole project back to this moment. A checkpoint is saved first, so you can come back.">${IC.rewind}Rewind</button>
        </span>
      </div>`).join('') : '<div class="rv-empty">No checkpoints yet.</div>';
  }

  // ---------- render: diff ----------
  function hl(text, rel) {
    const lang = window.vdLangOf ? window.vdLangOf(baseName(rel)) : '';
    let html;
    try { html = lang && window.hljs?.getLanguage(lang) && text.length < 400000 ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value : esc(text); }
    catch { html = esc(text); }
    return splitLines(html);
  }
  function splitLines(html) {
    const lines = [], open = [];
    let line = '';
    const re = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+)/g;
    let m;
    while ((m = re.exec(html))) {
      if (m[1]) { open.push(m[1]); line += m[1]; }
      else if (m[2]) { open.pop(); line += m[2]; }
      else if (m[3]) { lines.push(line + '</span>'.repeat(open.length)); line = open.join(''); }
      else line += m[4];
    }
    lines.push(line);
    return lines;
  }
  const row = (cls, an, bn, html) => `<div class="dl-row ${cls}"><span class="dn">${an ?? ''}</span><span class="dn">${bn ?? ''}</span><span class="dm">${cls === 'del' ? '-' : cls === 'add' ? '+' : ''}</span><span class="dc">${html || ' '}</span></div>`;

  function renderMain(scroll) {
    const body = $('rvBody');
    $('rvBar').hidden = !file;
    if (!file) { body.innerHTML = `<div class="rv-blank">${IC.spark}<p>${files.length ? 'Pick a file on the left.' : 'Nothing waiting for review.'}</p></div>`; return; }
    const f = files.find(x => x.rel === sel) || { status: 'M' };
    $('rvCrumbs').innerHTML = `<span class="rv-st s${f.status}">${f.status}</span>` + sel.split('/').map((c, i, all) => `<span class="${i === all.length - 1 ? 'last' : ''}">${esc(c)}</span>`).join('<svg class="i sep" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>');
    $('rvCount').textContent = blocks.length ? `${cur + 1} of ${blocks.length}` : '';
    $('rvPrev').disabled = $('rvNext').disabled = blocks.length < 2;
    $('rvOpen').disabled = !file.after?.exists;
    $('rvKeepFile').disabled = $('rvUndoFile').disabled = busy;
    if (file.error) { body.innerHTML = `<div class="rv-blank err"><p>${esc(file.error)}</p></div>`; return; }
    const a = textOf(file.before), b = textOf(file.after);
    if (a === null || b === null) {
      const side = a === null ? file.before : file.after;
      body.innerHTML = `<div class="rv-blank"><p>${side.kind === 'large' ? 'This file is too big to show as a diff.' : 'This is not a text file, so there is no line diff.'} Use Keep file or Undo file.</p></div>`;
      return;
    }
    const A = LineDiff.split(a), B = LineDiff.split(b);
    if (A.length && A[A.length - 1] === '' && B.length && B[B.length - 1] === '') { A.pop(); B.pop(); }
    const ha = hl(A.join('\n'), sel), hb = hl(B.join('\n'), sel);
    const out = [];
    let ai = 0, bi = 0;
    const gap = (from, to, bOff) => {
      // unchanged lines between blocks: a few around each block, the rest folded
      if (to - from <= CONTEXT * 2 + 2 || expanded.has(`${from}-${to}`)) { for (let i = from; i < to; i++) out.push(row('ctx', i + 1, i + bOff + 1, ha[i])); return; }
      const head = from === 0 ? 0 : CONTEXT, tail = to === A.length ? 0 : CONTEXT;
      for (let i = from; i < from + head; i++) out.push(row('ctx', i + 1, i + bOff + 1, ha[i]));
      out.push(`<button class="dl-gap" data-gap="${from}-${to}">${to - from - head - tail} unchanged lines</button>`);
      for (let i = to - tail; i < to; i++) out.push(row('ctx', i + 1, i + bOff + 1, ha[i]));
    };
    blocks.forEach((h, n) => {
      gap(ai, h.aStart, bi - ai);
      out.push(`<div class="dl-block ${n === cur ? 'cur' : ''}" data-n="${n}">`);
      for (let i = 0; i < h.aLen; i++) out.push(row('del', h.aStart + i + 1, null, ha[h.aStart + i]));
      for (let i = 0; i < h.bLen; i++) out.push(row('add', null, h.bStart + i + 1, hb[h.bStart + i]));
      out.push(`<div class="dl-tools"><button class="btn sm" data-act="undo" title="Undo this change (N)">${IC.undo}Undo</button><button class="btn sm primary" data-act="keep" title="Keep this change (Y)">${IC.check}Keep</button><span class="mono">${n + 1} of ${blocks.length}</span></div></div>`);
      ai = h.aStart + h.aLen; bi = h.bStart + h.bLen;
    });
    gap(ai, A.length, bi - ai);
    body.innerHTML = `<div class="diff hljs" style="--gw:${String(Math.max(A.length, B.length)).length + 1}ch">${out.join('')}</div>`;
    if (scroll) body.scrollTop = 0;
    if (scroll && blocks.length) focusBlock(false);
  }
  function focusBlock(smooth = true) {
    const body = $('rvBody');
    body.querySelectorAll('.dl-block.cur').forEach(x => x.classList.remove('cur'));
    const el = body.querySelector(`.dl-block[data-n="${cur}"]`);
    if (!el) return;
    el.classList.add('cur');
    $('rvCount').textContent = `${cur + 1} of ${blocks.length}`;
    const top = el.offsetTop - body.clientHeight * 0.25;
    if (el.offsetTop < body.scrollTop + 40 || el.offsetTop + Math.min(el.offsetHeight, 200) > body.scrollTop + body.clientHeight - 40) body.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }
  const renderAll = () => { renderBadge(); if (shown) { renderSide(); renderMain(); } };

  // ---------- actions ----------
  async function act(fn, okText, icon) {
    if (busy) return;
    busy = true; renderSide(); view.classList.add('busy');
    try { const out = await fn(); if (okText) toast(typeof okText === 'function' ? okText(out) : okText, icon || 'check'); }
    catch (e) { toast(e.message, 'warn', true); }
    busy = false; view.classList.remove('busy');
    await refresh();
  }
  function blockAction(kind, n = cur) {
    const h = blocks[n];
    if (!h || !file) return;
    const A = LineDiff.split(textOf(file.before)), B = LineDiff.split(textOf(file.after));
    if (kind === 'keep') act(() => call('keep', { rel: sel, text: LineDiff.join(LineDiff.keep(A, B, h)) }));
    else act(() => call('undo', { rel: sel, text: LineDiff.join(LineDiff.undo(A, B, h)), expect: file.hash }));
  }
  // second click within 4s confirms a big step
  function confirmClick(btn, label, fn) {
    if (btn.dataset.armed) { delete btn.dataset.armed; btn.classList.remove('armed'); return fn(); }
    btn.dataset.armed = '1'; btn.classList.add('armed');
    const html = btn.innerHTML;
    btn.innerHTML = `${IC.undo}${label}`;
    setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = html; } }, 4000);
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  $('rvKeepAll').addEventListener('click', () => act(() => call('keepAll', {}), `Kept ${plural(files.length, 'file')}`));
  $('rvUndoAll').addEventListener('click', e => confirmClick(e.currentTarget, 'Confirm undo all', () =>
    act(() => call('undoAll', {}), out => `Put back ${plural(out.files, 'file')}. A checkpoint was saved first.`, 'restart')));
  $('rvKeepFile').addEventListener('click', () => act(() => call('keep', { rel: sel, whole: true })));
  $('rvUndoFile').addEventListener('click', () => act(() => call('undo', { rel: sel, whole: true })));
  $('rvOpen').addEventListener('click', () => window.vdOpenFile?.(cwd, sel));
  $('rvPrev').addEventListener('click', () => step(-1));
  $('rvNext').addEventListener('click', () => step(1));
  $('rvSave').addEventListener('click', () => act(() => call('save', {}), out => out?.created === false ? 'Nothing changed since the last checkpoint' : 'Checkpoint saved', 'save'));
  function step(d) { if (!blocks.length) return; cur = (cur + d + blocks.length) % blocks.length; focusBlock(); }
  function stepFile(d) {
    if (!files.length) return;
    const i = files.findIndex(f => f.rel === sel);
    sel = files[(i + d + files.length) % files.length].rel;
    renderSide(); loadFile();
  }

  $('rvFiles').addEventListener('click', e => {
    const r = e.target.closest('.rv-file');
    if (!r || r.dataset.rel === sel) return;
    sel = r.dataset.rel; renderSide(); loadFile();
  });
  $('rvBody').addEventListener('click', e => {
    const g = e.target.closest('.dl-gap');
    if (g) { expanded.add(g.dataset.gap); return renderMain(); }
    const blk = e.target.closest('.dl-block');
    if (!blk) return;
    const n = Number(blk.dataset.n);
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a) return blockAction(a, n);
    if (n !== cur) { cur = n; focusBlock(); }
  });
  $('rvCps').addEventListener('click', e => {
    const fold = e.target.closest('[data-fold]');
    if (fold) { openFolds.add(fold.dataset.fold); return renderSide(); }
    const b = e.target.closest('[data-act]');
    const c = cps.find(x => x.id === e.target.closest('.rv-cp')?.dataset.id);
    if (!b || !c) return;
    if (b.dataset.act === 'from') act(() => call('reviewFrom', { id: c.id }), `Showing everything changed since ${c.label.toLowerCase()}, ${fmtWhen(c.ts)}`, 'eye');
    else confirmClick(b, 'Confirm rewind', () => act(() => call('rewind', { id: c.id }),
      out => `Rewound ${plural(out.files, 'file')} to ${fmtWhen(c.ts)}. "Before rewind" at the top brings them back.`, 'restart'));
  });

  document.addEventListener('keydown', e => {
    if (!shown || e.altKey || e.metaKey) return;
    const t = e.target;
    if (t.closest?.('input,textarea,select,.term,[contenteditable]')) return;
    if (document.querySelector('.overlay.open')) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey) { if (e.key === 'Enter' && files.length) { e.preventDefault(); $('rvKeepAll').click(); } return; }
    if (k === 'j') { e.preventDefault(); e.shiftKey ? stepFile(1) : step(1); }
    else if (k === 'k') { e.preventDefault(); e.shiftKey ? stepFile(-1) : step(-1); }
    else if (k === 'y' && !e.shiftKey) { e.preventDefault(); blocks.length ? blockAction('keep') : file && $('rvKeepFile').click(); }
    else if (k === 'n' && !e.shiftKey) { e.preventDefault(); blocks.length ? blockAction('undo') : file && $('rvUndoFile').click(); }
  });

  // ---------- wiring ----------
  window.addEventListener('vd:shown', e => {
    shown = e.detail === 'review';
    if (shown) { renderSide(); renderMain(); refresh(); }
  });
  window.addEventListener('vd:cwd', () => { sel = ''; file = null; cps = []; soon(200); });
  $('sbReview').addEventListener('click', () => window.dispatchEvent(new CustomEvent('vd:view', { detail: 'review' })));
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'fsChanged' && !msg.gitOnly && (!msg.root || sameRootCwd(msg.root))) soon();
    else if (msg.type === 'reviewChanged' || msg.type === 'checkpoint') soon(150);
    else if (msg.type === 'roundDone' || msg.type === 'roundFailed') soon(400);
  });
  const sameRootCwd = r => String(r).toLowerCase() === String(cwd).toLowerCase();
})();
