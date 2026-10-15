// Line diff for the Review page: which blocks of lines changed between two versions of a file,
// and how to keep or undo one block. Myers' algorithm on whole lines. Loaded by the page and by tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LineDiff = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_EDITS = 4000; // past this the middle is shown as one changed block

  const split = text => String(text ?? '').split('\n');
  const join = lines => lines.join('\n');

  // shortest edit script for a -> b: '=' same, '-' only in a, '+' only in b
  function script(a, b) {
    const n = a.length, m = b.length, max = n + m, off = max + 1;
    const v = new Int32Array(2 * max + 3);
    const trace = [];
    for (let d = 0; d <= max; d++) {
      if (d > MAX_EDITS) return null;
      trace.push(v.slice(off - d, off + d + 1));
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) return backtrack(trace, d, n, m);
      }
    }
    return null;
  }
  function backtrack(trace, D, n, m) {
    const ops = [];
    let x = n, y = m;
    for (let d = D; d > 0; d--) {
      const prev = trace[d], at = k => prev[k + d];
      const k = x - y;
      const pk = (k === -d || (k !== d && at(k - 1) < at(k + 1))) ? k + 1 : k - 1;
      const px = at(pk), py = px - pk;
      while (x > px && y > py) { ops.push('='); x--; y--; }
      if (pk === k + 1) { ops.push('+'); y--; } else { ops.push('-'); x--; }
    }
    while (x > 0 && y > 0) { ops.push('='); x--; y--; }
    return ops.reverse();
  }

  // changed blocks: { aStart, aLen, bStart, bLen } with 0-based line numbers
  function hunks(a, b) {
    let pre = 0;
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    let suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    const am = a.slice(pre, a.length - suf), bm = b.slice(pre, b.length - suf);
    if (!am.length && !bm.length) return [];
    const ops = script(am, bm);
    if (!ops) return [{ aStart: pre, aLen: am.length, bStart: pre, bLen: bm.length }];
    const out = [];
    let ai = pre, bi = pre, cur = null;
    for (const op of ops) {
      if (op === '=') { if (cur) { out.push(cur); cur = null; } ai++; bi++; continue; }
      if (!cur) cur = { aStart: ai, aLen: 0, bStart: bi, bLen: 0 };
      if (op === '-') { cur.aLen++; ai++; } else { cur.bLen++; bi++; }
    }
    if (cur) out.push(cur);
    return out;
  }

  // keep: the baseline takes the new lines of this block. undo: the file takes the old lines back.
  const keep = (a, b, h) => [...a.slice(0, h.aStart), ...b.slice(h.bStart, h.bStart + h.bLen), ...a.slice(h.aStart + h.aLen)];
  const undo = (a, b, h) => [...b.slice(0, h.bStart), ...a.slice(h.aStart, h.aStart + h.aLen), ...b.slice(h.bStart + h.bLen)];

  return { split, join, hunks, keep, undo };
});
