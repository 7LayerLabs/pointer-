#!/usr/bin/env node
// Checks the token meter against the raw CLI logs.
//   npm run meter:check            meter vs an independent recount, for today
//   npm run meter:check -- --plan  also show each CLI's own plan-limit report
//   npm run meter:check -- --date 2026-10-09   check a past day instead of today
// The recount uses different methods on purpose: Claude scans every transcript at any depth,
// Codex sums each turn's own usage instead of diffing running totals, Grok sums per-model rows.
// Logs grow while this runs, so small differences in a busy session are normal.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const meter = require('../meter-data');

const HOME = os.homedir();
const dateArg = process.argv[process.argv.indexOf('--date') + 1];
const pick = process.argv.includes('--date') && /^\d{4}-\d\d-\d\d$/.test(dateArg || '') ? new Date(dateArg + 'T12:00:00') : new Date();
const day = (() => { const d = new Date(pick); d.setHours(0, 0, 0, 0); return d.getTime(); })();
const end = day + 864e5;
const inDay = ts => ts >= day && ts < end;

function walk(dir, out = []) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

function recountClaude() {
  const msgs = new Map();
  for (const fp of walk(path.join(HOME, '.claude', 'projects'))) {
    try { if (fs.statSync(fp).mtimeMs < day) continue; } catch { continue; }
    for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
      if (!line.includes('"usage"')) continue;
      try {
        const e = JSON.parse(line);
        if (e.type !== 'assistant' || !e.message?.id || !e.message.usage) continue;
        if (!inDay(Date.parse(e.timestamp))) continue;
        msgs.set(e.message.id, e.message);
      } catch {}
    }
  }
  const t = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
  for (const m of msgs.values()) {
    const u = m.usage;
    const cw = u.cache_creation_input_tokens || 0;
    if (!u.input_tokens && !u.output_tokens && !u.cache_read_input_tokens && !cw) continue;
    t.in += u.input_tokens || 0; t.out += u.output_tokens || 0;
    t.cacheRead += u.cache_read_input_tokens || 0; t.cacheWrite += cw; t.calls++;
  }
  return t;
}

function recountCodex() {
  const t = { in: 0, cached: 0, out: 0, byModel: {} };
  for (let back = 0; back < 3; back++) {
    const d = new Date(day - back * 86400000 + 3600000);
    const dir = path.join(HOME, '.codex', 'sessions', String(d.getFullYear()),
      String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      let prevTotal = null, model = '?';
      for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
        if (line.includes('"turn_context"')) {
          try { model = JSON.parse(line).payload?.model || model; } catch {}
          continue;
        }
        if (!line.includes('"token_count"')) continue;
        try {
          const e = JSON.parse(line);
          const info = e.payload?.info;
          if (!info?.last_token_usage) continue;
          // Codex can repeat a token_count without a new request; the running total tells them apart
          const total = info.total_token_usage?.total_tokens;
          if (total != null && total === prevTotal) continue;
          prevTotal = total;
          if (!inDay(Date.parse(e.timestamp))) continue;
          const u = info.last_token_usage;
          t.in += u.input_tokens || 0; t.cached += u.cached_input_tokens || 0; t.out += u.output_tokens || 0;
          const bm = t.byModel[model] || (t.byModel[model] = { in: 0, out: 0 });
          bm.in += u.input_tokens || 0; bm.out += u.output_tokens || 0;
        } catch {}
      }
    }
  }
  return t;
}

function recountGrok() {
  const t = { in: 0, cached: 0, out: 0, cost: 0, turns: 0 };
  const base = path.join(HOME, '.grok', 'sessions');
  let cwds = [];
  try { cwds = fs.readdirSync(base); } catch { return t; }
  for (const cw of cwds) {
    let ss = [];
    try { ss = fs.readdirSync(path.join(base, cw)); } catch { continue; }
    for (const s of ss) {
      let u;
      try { u = JSON.parse(fs.readFileSync(path.join(base, cw, s, 'usage.json'), 'utf8')); } catch { continue; }
      for (const turn of u.turns || []) {
        if (!inDay(Date.parse(turn.endedAt) || 0)) continue;
        t.turns++;
        for (const m of Object.values(turn.modelUsage || {})) {
          t.in += m.inputTokens || 0; t.cached += m.cachedReadTokens || 0; t.out += m.outputTokens || 0;
          t.cost += (m.costUsdTicks || 0) / 1e10;
        }
      }
    }
  }
  return t;
}

const rows = [];
let fails = 0;
function cmp(group, label, recount, shown) {
  const diff = Math.abs(shown - recount);
  const ok = diff <= Math.max(2, Math.max(shown, recount) * 0.02);
  if (!ok) fails++;
  rows.push([group, label, String(recount), String(shown), ok ? 'MATCH' : 'DIFF']);
}

const rc = { claude: recountClaude(), codex: recountCodex(), grok: recountGrok() };
const m = meter.collect({ now: pick.getTime() });
const c = m.claude.daily, x = m.codex.daily, g = m.grok.daily;
cmp('Claude', 'calls', rc.claude.calls, c.calls);
cmp('Claude', 'input', rc.claude.in, c.in);
cmp('Claude', 'output', rc.claude.out, c.out);
cmp('Claude', 'cache read', rc.claude.cacheRead, c.cacheRead);
cmp('Claude', 'cache write', rc.claude.cacheWrite, c.cacheWrite);
cmp('Codex', 'input', rc.codex.in, x.in);
cmp('Codex', 'cached input', rc.codex.cached, x.cached);
cmp('Codex', 'output', rc.codex.out, x.out);
// each model's share, so a mid-session model switch is billed to the right model
for (const name of new Set([...Object.keys(rc.codex.byModel), ...Object.keys(x.byModel || {})])) {
  const a = rc.codex.byModel[name] || { in: 0, out: 0 }, b = (x.byModel || {})[name] || { in: 0, out: 0 };
  cmp('Codex', `${name} input`, a.in, b.in);
  cmp('Codex', `${name} output`, a.out, b.out);
}
cmp('Grok', 'turns', rc.grok.turns, g.turns);
cmp('Grok', 'input', rc.grok.in, g.in);
cmp('Grok', 'output', rc.grok.out, g.out);
cmp('Grok', 'cost x100', Math.round(rc.grok.cost * 100), Math.round(g.cost * 100));

const head = ['AI', 'number', 'recount', 'meter', ''];
const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
const line = r => r.map((v, i) => v.padEnd(w[i])).join('  ');
console.log(`Token meter check for ${new Date(day).toDateString()}\n`);
console.log(line(head));
for (const r of rows) console.log(line(r));
console.log(`\nDollar values at list prices: Claude $${c.cost.toFixed(2)}${c.models.length ? ` (${c.models.map(x => `${x.name} $${x.cost.toFixed(2)}`).join(', ')})` : ''}, ` +
  `Codex $${x.cost.toFixed(2)}${x.estimated ? ' (unknown model, rough)' : ''}, Grok $${g.cost.toFixed(2)}${g.estimated ? ' (includes estimates)' : ''}`);
if (x.unpriced?.length) console.log(`No list price for: ${x.unpriced.join(', ')} (priced as GPT-6-Astra). Add it to CODEX_PRICES in meter-data.js.`);
if (c.unpriced.length) console.log(`No list price for: ${c.unpriced.join(', ')} (priced as Opus 5.5). Add it to CLAUDE_PRICES in meter-data.js.`);
if (g.estimated) console.log('Some Grok sessions have no usage.json, so their tokens are estimates and will not match the recount.');

(async () => {
  if (process.argv.includes('--plan')) {
    const limits = require('../lib/limits');
    console.log('\nPlan limits, as each CLI reports them (these drive the sidebar bars):');
    const cx = limits.codexUsage();
    console.log('  Codex:', cx ? cx.windows.map(w => `${w.pct}% of ${w.label}${w.resets ? `, resets ${w.resets}` : ''}`).join('; ') : 'no record yet');
    const cmd = process.platform === 'win32' ? path.join(process.env.APPDATA || '', 'npm', 'claude.cmd') : 'claude';
    const cl = await limits.claudeUsage({ command: fs.existsSync(cmd) ? cmd : 'claude', env: process.env });
    console.log('  Claude:', cl ? cl.windows.map(w => `${w.pct}% of ${w.label}${w.resets ? `, resets ${w.resets}` : ''}`).join('; ') : 'could not read /usage');
    console.log('  Compare Claude with claude.ai > Settings > Usage, and Codex with /status inside codex.');
  }
  console.log(fails ? `\n${fails} number(s) differ by more than 2%.` : '\nAll numbers match.');
  process.exitCode = fails ? 1 : 0;
})();
