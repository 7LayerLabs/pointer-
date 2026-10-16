// The two parts of every finished answer, each with its own look: the part where the AI shows its
// work (files read, commands run, progress notes) and the summary it ends with. When a turn
// finishes, the server reads the prompt and the closing message from the CLI's own log (paneFinal).
// This finds those lines in the pane and decorates them: the summary's lines, and the work lines
// between your prompt and the summary. Text is compared by its letters and digits only, so the
// CLI's markdown rendering, bullets and table borders don't get in the way. Lines that can't be
// found are left as they are; nothing is ever colored by guess.
// Looks come from Settings (answerColors): fade the work, two colors, summary card, or off.
//
// Claude Code can run full screen (the terminal's "alternate screen"): there is no scrollback, the
// CLI redraws the screen itself as you scroll, and the terminal hides decoration elements. So every
// look is drawn with cell colors (text and background), which work on both screens, and on the
// alternate screen the pane is searched again after each redraw. The summary's side bar is an
// element, so it shows on the normal screen only.
(function () {
  const MAX_ANSWERS = 30, MAX_LINES = 6000, BG = '#0b0c0f', FADED = '#62666f';
  const panes = new Set();
  const akey = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  // a pane line's key. Grok prints the time at the right end of each message's first line, and may
  // draw a scrollbar in the last column.
  const CLOCK = /\s{2,}\d{1,2}:\d{2}(?::\d{2})?\s?(?:[AaPp][Mm])?\s*$/;
  const lineKey = line => line ? akey(line.translateToString(true).replace(/[\s│┃║|█▐▕▏░▒▓╎╏┆┇┊┋]+$/, '').replace(CLOCK, '')) : '';
  const okColor = c => /^#[0-9a-f]{6}$/i.test(c || '');
  function mix(a, b, t) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return '#' + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
  }

  function look() {
    const s = (window.VDSettings && VDSettings.get('answerColors')) || {};
    if (s.style === 'off') return null;
    const style = ['fade', 'two', 'card'].includes(s.style) ? s.style : 'fade';
    const summary = okColor(s.summary) ? s.summary : '#4ade80', work = okColor(s.work) ? s.work : '#8b90a0';
    return { style, summary, work, tint: mix(summary, BG, style === 'card' ? 0.2 : 0.1) };
  }

  // ---------- finding an answer in the pane ----------
  // Follow the summary down from line i: each line with text must continue it. A link's address,
  // or a stretch the CLI drew differently, may be skipped. Returns the last line that matched, or
  // -1 when too little of the summary was found there.
  function walk(keys, fk, i, limit, from = 0) {
    let off = from + keys[i].length, last = i, misses = 0;
    for (let j = i + 1; j < limit && off < fk.length; j++) {
      const k = keys[j];
      if (!k) continue;
      const at = fk.indexOf(k, off);
      if (at >= 0 && at - off <= 300) { off = at + k.length; last = j; misses = 0; }
      else if (++misses > 2) break;
    }
    const got = off - from;
    return got >= Math.min(fk.length - from, 30) || (!from && off >= fk.length * 0.8) ? last : -1;
  }
  // the newest place above `limit` where the summary starts
  function findAnswer(keys, fk, limit) {
    if (fk.length < 2) return null;
    for (let i = limit - 1; i >= 0; i--) {
      const k = keys[i];
      if (!k || !fk.startsWith(k)) continue;
      const end = walk(keys, fk, i, limit);
      if (end >= 0) return { start: i, end };
    }
    // its opening scrolled off the top: the first lines on screen may continue it
    const top = keys.findIndex(k => k);
    if (top >= 0 && top < limit && keys[top].length >= 12) {
      const at = fk.indexOf(keys[top]);
      const end = at > 0 ? walk(keys, fk, top, limit, at) : -1;
      if (end >= 0) return { start: top, end, cut: true };
    }
    return null;
  }
  // your prompt, the nearest one above the summary (it may wrap over several lines)
  function findPrompt(keys, qk, before) {
    if (qk.length < 2) return null;
    for (let i = before - 1; i >= 0 && before - i < 4000; i--) {
      const k = keys[i];
      if (!k || !qk.startsWith(k) || k.length < Math.min(6, qk.length)) continue;
      let off = k.length, last = i, blanks = 0;
      for (let j = i + 1; off < qk.length && j < before; j++) {
        const kj = keys[j];
        if (!kj) { if (++blanks > 2) break; continue; }
        if (!qk.startsWith(kj, off)) break;
        off += kj.length; last = j; blanks = 0;
      }
      if (off === qk.length || off >= 40) return { start: i, end: last };
    }
    return null;
  }

  // ---------- decorating ----------
  function clear(p) {
    for (const d of p.answers.decos) d.deco.dispose();
    p.answers.decos = [];
  }
  function add(p, cursorAbs, ln, opts, paint) {
    const t = p.term;
    const marker = t.registerMarker(ln - cursorAbs);
    if (!marker) return;
    const deco = t.registerDecoration({ marker, width: t.cols, ...opts });
    if (!deco) { marker.dispose(); return; }
    deco.onRender(el => { el.style.pointerEvents = 'none'; paint?.(el); });
    p.answers.decos.push({ marker, deco });
  }
  function decorate(p, L, workFrom, start, end) {
    const b = p.term.buffer.active, cursorAbs = b.baseY + b.cursorY;
    if (workFrom >= 0 && L.style !== 'card') for (let ln = workFrom; ln < start; ln++)
      add(p, cursorAbs, ln, { foregroundColor: L.style === 'two' ? L.work : FADED, layer: 'top' });
    for (let ln = start; ln <= end; ln++) {
      const ruler = ln === start ? { overviewRulerOptions: { color: L.summary, position: 'right' } } : {};
      if (L.style === 'two') add(p, cursorAbs, ln, { foregroundColor: L.summary, layer: 'top', ...ruler });
      else add(p, cursorAbs, ln, { backgroundColor: L.tint, layer: 'bottom', ...ruler }, el => { el.style.boxShadow = `inset 3px 0 0 ${L.summary}`; });
    }
  }

  function scan(p) {
    const t = p.term, st = p.answers;
    if (!t || p.dead) return;
    clear(p);
    const L = look();
    if (!L || !st.list.length) return;
    const b = t.buffer.active, total = b.length;
    st.len = total;
    const keys = new Array(total);
    for (let i = 0; i < total; i++) keys[i] = lineKey(b.getLine(i));
    // newest answer first, each one searched above the one after it
    let limit = total, used = 0;
    for (let n = st.list.length - 1; n >= 0 && used < MAX_LINES && limit > 0; n--) {
      const a = st.list[n];
      const ans = findAnswer(keys, akey(a.final), limit);
      if (!ans) continue;
      const q = findPrompt(keys, akey(a.asked), ans.start);
      const workFrom = q && ans.start - q.end <= 3000 ? q.end + 1 : -1;
      decorate(p, L, workFrom, ans.start, ans.end);
      used += ans.end - Math.max(workFrom, ans.start) + 1;
      limit = q ? q.start : ans.start;
    }
  }
  // after the pane has drawn what it has been sent so far. A search already waiting is kept, so a
  // CLI that never stops drawing (a spinner) still gets searched.
  function schedule(p, delay = 200) {
    const st = p.answers;
    if (!st || !p.term || st.timer) return;
    st.timer = setTimeout(() => { st.timer = 0; try { p.term.write('', () => scan(p)); } catch {} }, delay);
  }

  function attach(p) {
    if (!p.term) return;
    p.answers = { list: [], decos: [], timer: 0, len: 0 };
    panes.add(p);
    p.term.onResize(() => schedule(p, 600));
    p.term.onWriteParsed(() => {
      const st = p.answers;
      if (!st.list.length) return;
      // full screen: the CLI redrew it (new output, or you scrolled inside the CLI)
      if (p.term.buffer.active.type === 'alternate') schedule(p, 150);
      // the screen and scrollback were cleared (/clear, Ctrl+L), or old lines dropped off the top
      else if (st.decos.length && (st.decos[0].marker.isDisposed || st.decos[st.decos.length - 1].marker.isDisposed)) schedule(p, 300);
    });
  }
  function detach(p) { if (p?.answers) { clear(p); clearTimeout(p.answers.timer); } panes.delete(p); }
  function push(p, a) {
    const st = p.answers;
    if (!a || typeof a.final !== 'string') return;
    if (st.list.some(x => x.final === a.final && x.asked === a.asked)) return;
    st.list.push({ asked: String(a.asked || ''), final: a.final });
    if (st.list.length > MAX_ANSWERS) st.list.shift();
  }

  window.AnswerMarks = {
    attach, detach, look,
    // a turn just finished: the CLI may still be drawing its last lines, so look twice
    add: (p, a) => { if (!p?.answers) return; push(p, a); schedule(p, 250); setTimeout(() => schedule(p), 1800); },
    load: (p, list) => { if (!p?.answers) return; (list || []).forEach(a => push(p, a)); schedule(p, 400); },
    reset: p => { if (p?.answers) { clear(p); p.answers.list = []; } },
    restyle: () => panes.forEach(p => schedule(p, 0)),
  };
})();
