// Token meter collectors: reads each CLI's local usage logs for TODAY.
// claude: ~/.claude/projects/<proj>/*.jsonl plus <proj>/<session>/subagents/*.jsonl, per-message usage
// codex:  ~/.codex/sessions/Y/M/D/rollout-*.jsonl cumulative totals + plan %
// grok:   ~/.grok/sessions/<cwd>/<session>/usage.json, Grok's own per-turn tokens and cost
//         (sessions without usage.json fall back to a labeled char-based estimate)
// Costs are API-RATE VALUE (what today would cost at pay-per-token list prices).
// `npm run meter:check` recounts the raw logs independently and compares.
const fs = require('fs');
const path = require('path');
const os = require('os');

// Anthropic list prices, $/MTok: base input, 5m cache write, 1h cache write, cache read, output.
// Source: platform.claude.com/docs/en/about-claude/pricing (checked 2026-10-16). First match wins.
const P = (inp, w5, w1, r, out) => ({ in: inp, w5, w1, r, out });
const CLAUDE_PRICES = [
  [/fable-5-1|mythos-5-1/, P(10, 12.5, 20, 0.25, 50)],
  [/fable|mythos/,          P(10, 12.5, 20, 1, 50)],
  [/opus-5-5/,              P(4, 5, 8, 0.2, 20)],
  [/opus-5|opus-4-[5-9]/,   P(5, 6.25, 10, 0.5, 25)],
  [/opus-4/,                P(15, 18.75, 30, 1.5, 75)],
  [/sonnet-5-5/,            P(2, 2.5, 4, 0.1, 10)],
  [/sonnet-5/,              P(2, 2.5, 4, 0.2, 10)],
  [/sonnet/,                P(3, 3.75, 6, 0.3, 15)],
  // Haiku 5.5 has two tiers split at 100k prompt tokens per request
  [/haiku-5-5/,             { small: P(0.1, 0.125, 0.2, 0.01, 0.5), large: P(0.5, 0.625, 1, 0.05, 2.5), split: 100000 }],
  [/haiku-4-5/,             P(1, 1.25, 2, 0.1, 5)],
  [/haiku/,                 P(0.8, 1, 1.6, 0.08, 4)],
];
const CLAUDE_FALLBACK = P(4, 5, 8, 0.2, 20); // unknown ids are priced as Opus 5.5 and flagged

// OpenAI list prices, $/MTok, as reported by third-party trackers (OpenAI's page not read), checked
// 2026-10-16. Estimates. Where no cached rate was published, cached = 10% of input (OpenAI's usual).
const CODEX_PRICES = [
  [/^gpt-6-astra$/,   { in: 10, cached: 1, out: 50 }],
  [/^gpt-6\.1-sol$/,  { in: 2, cached: 0.1, out: 10 }],
  [/^gpt-6-sol$/,     { in: 2, cached: 0.2, out: 10 }],
  [/^gpt-6-luna$/,    { in: 0.1, cached: 0.01, out: 0.5 }],
  [/^gpt-5\.6-sol$/,  { in: 4, cached: 0.4, out: 20 }],
  [/^gpt-5\.6-terra$/, { in: 2, cached: 0.2, out: 12 }],
  [/^gpt-5\.6-luna$/, { in: 0.2, cached: 0.02, out: 1.2 }],
  [/^gpt-5\.5$/,      { in: 5, cached: 0.5, out: 30 }],
];
const CODEX_FALLBACK = { in: 10, cached: 1, out: 50 }; // unknown ids are priced as GPT-6-Astra and flagged
const GROK_EST_PRICE = { in: 3, out: 15 }; // only for sessions with no usage.json

const midnight = (now = Date.now()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

// "claude-opus-5-5" -> "opus 5.5"; "claude-sonnet-4-5-20250929" -> "sonnet 4.5"
function claudeLabel(model) {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(model || '');
  return m ? `${m[1]} ${m[2]}${m[3] ? '.' + m[3] : ''}` : (model || 'claude');
}

function claudeMessageCost(model, usage) {
  const hit = CLAUDE_PRICES.find(([re]) => re.test(model || ''));
  let p = hit ? hit[1] : CLAUDE_FALLBACK;
  const cc = usage.cache_creation || {};
  const split = cc.ephemeral_5m_input_tokens || cc.ephemeral_1h_input_tokens;
  const w5 = split ? cc.ephemeral_5m_input_tokens || 0 : usage.cache_creation_input_tokens || 0;
  const w1 = split ? cc.ephemeral_1h_input_tokens || 0 : 0;
  const inp = usage.input_tokens || 0, cr = usage.cache_read_input_tokens || 0, out = usage.output_tokens || 0;
  if (p.split) p = inp + cr + w5 + w1 > p.split ? p.large : p.small;
  const speed = usage.speed === 'fast' ? 2 : 1; // fast mode bills at twice the standard rate
  const cost = speed * (inp * p.in + w5 * p.w5 + w1 * p.w1 + cr * p.r + out * p.out) / 1e6;
  return { cost, inp, out, cr, cw: w5 + w1, priced: !!hit };
}

// Every Claude transcript in a project folder, including subagent transcripts.
function claudeTranscripts(dp) {
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync(dp, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.isFile() && e.name.endsWith('.jsonl')) out.push(path.join(dp, e.name));
    else if (e.isDirectory()) {
      const sd = path.join(dp, e.name, 'subagents');
      try { for (const f of fs.readdirSync(sd)) if (f.endsWith('.jsonl')) out.push(path.join(sd, f)); } catch {}
    }
  }
  return out;
}

// ---------- claude (incremental byte-offset parsing; files are append-only) ----------
let claudeState = null;
function claudeStateFor(home, day) {
  if (!claudeState || claudeState.home !== home || claudeState.day !== day)
    claudeState = { home, day, files: new Map(), msgs: new Map() };
  return claudeState;
}

function collectClaude(opts = {}) {
  const home = opts.home || os.homedir(), day = midnight(opts.now);
  const S = claudeStateFor(home, day);
  const projDir = path.join(home, '.claude', 'projects');
  let dirs = [];
  try { dirs = fs.readdirSync(projDir); } catch { return claudeResult(S, opts); }
  for (const d of dirs) {
    for (const fp of claudeTranscripts(path.join(projDir, d))) {
      let st;
      try { st = fs.statSync(fp); } catch { continue; }
      if (st.mtimeMs < day) continue;
      let rec = S.files.get(fp);
      if (!rec) { rec = { offset: 0, leftover: '', birth: st.birthtimeMs || st.mtimeMs }; S.files.set(fp, rec); }
      if (st.size <= rec.offset) continue;
      let fd;
      try {
        fd = fs.openSync(fp, 'r');
        const len = st.size - rec.offset;
        if (len > 64 * 1024 * 1024) { rec.offset = st.size; fs.closeSync(fd); continue; }
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, rec.offset);
        fs.closeSync(fd);
        rec.offset = st.size;
        const text = rec.leftover + buf.toString('utf8');
        const lines = text.split('\n');
        rec.leftover = lines.pop() || '';
        for (const line of lines) {
          if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
          try {
            const e = JSON.parse(line);
            const m = e.message;
            if (!m || !m.usage || !m.id) continue;
            const ts = e.timestamp ? Date.parse(e.timestamp) : 0;
            if (ts && (ts < day || ts >= day + 864e5)) continue;
            // one API response is logged once per content block with the same id; the last copy is final
            S.msgs.set(m.id, { model: m.model || '?', usage: m.usage, ts, fp, birth: rec.birth });
          } catch {}
        }
      } catch { try { if (fd !== undefined) fs.closeSync(fd); } catch {} }
    }
  }
  return claudeResult(S, opts);
}

function claudeResult(S, opts) {
  const daily = summarizeClaude(S, () => true);
  // session slice: transcripts CREATED since the pane spawned, in this deck's
  // project dir; excludes fleet agents (other dirs) and pre-existing claude
  // sessions like Claude Code conversations already running in this dir
  const since = opts?.since?.claude;
  let session = null;
  if (since) {
    const home = opts.home || os.homedir();
    const projKey = String(opts.cwd || home).replace(/[^a-zA-Z0-9]/g, '-');
    const projPath = path.join(home, '.claude', 'projects', projKey) + path.sep;
    // deck helpers (judge, notes rewriter) run headless from THIS folder;
    // their cost is deck usage too, so the session meter counts them
    const selfKey = String(__dirname).replace(/[^a-zA-Z0-9]/g, '-');
    const selfPath = path.join(home, '.claude', 'projects', selfKey) + path.sep;
    session = summarizeClaude(S, m => m.birth >= since - 5000 && (m.fp.startsWith(projPath) || m.fp.startsWith(selfPath)));
  }
  return { daily, session };
}

function summarizeClaude(S, filter) {
  const byModel = {};
  const out = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, calls: 0, cost: 0, models: [], unpriced: [], firstTs: null, lastTs: null };
  for (const m of S.msgs.values()) {
    if (!filter(m)) continue;
    const c = claudeMessageCost(m.model, m.usage);
    if (!c.inp && !c.out && !c.cr && !c.cw) continue; // placeholder entries (model "<synthetic>")
    if (m.ts) { out.firstTs = Math.min(out.firstTs ?? m.ts, m.ts); out.lastTs = Math.max(out.lastTs ?? 0, m.ts); }
    const name = claudeLabel(m.model);
    if (!c.priced && !out.unpriced.includes(m.model)) out.unpriced.push(m.model);
    const t = byModel[name] || (byModel[name] = { name, cost: 0, calls: 0 });
    t.cost += c.cost; t.calls++;
    out.in += c.inp; out.out += c.out; out.cacheRead += c.cr; out.cacheWrite += c.cw;
    out.calls++; out.cost += c.cost;
  }
  out.models = Object.values(byModel).sort((a, b) => b.cost - a.cost);
  return out;
}

// ---------- codex ----------
// A rollout logs a running total in every token_count event, and a turn_context naming the model
// before each turn. Each step up in the running total is billed to the model in effect at that
// moment, so switching models mid-session prices every turn at its own model, and a session that
// started yesterday counts only the part used today.
const codexCache = new Map(); // path -> { size, day, parsed }
function parseRollout(fp, day) {
  let st;
  try { st = fs.statSync(fp); } catch { return null; }
  const hit = codexCache.get(fp);
  if (hit && hit.size === st.size && hit.day === day) return hit.parsed;
  const end = day + 864e5;
  let text;
  try { text = fs.readFileSync(fp, 'utf8'); } catch { return null; }
  const first = text.slice(0, 500).match(/"timestamp":"([^"]+)"/);
  const anyModel = text.match(/"model":"([^"]+)"/);
  const parsed = { start: first ? Date.parse(first[1]) || null : null, byModel: {}, lastTs: 0, limits: null };
  let model = anyModel ? anyModel[1] : '', prev = null;
  for (const line of text.split('\n')) {
    if (line.includes('"turn_context"')) {
      const mm = line.match(/"model":"([^"]+)"/);
      if (mm) model = mm[1];
      continue;
    }
    if (!line.includes('"token_count"')) continue;
    try {
      const e = JSON.parse(line);
      const ts = Date.parse(e.timestamp) || 0;
      if (ts >= end) break;
      if (e.payload?.rate_limits) parsed.limits = { ts, rl: e.payload.rate_limits };
      const u = e.payload?.info?.total_token_usage;
      if (!u) continue;
      const step = { in: (u.input_tokens || 0) - (prev?.input_tokens || 0),
        cached: (u.cached_input_tokens || 0) - (prev?.cached_input_tokens || 0),
        out: (u.output_tokens || 0) - (prev?.output_tokens || 0) };
      prev = u;
      if (ts < day || (step.in <= 0 && step.out <= 0)) continue; // before today, or a repeated report
      const t = parsed.byModel[model] || (parsed.byModel[model] = { in: 0, cached: 0, out: 0 });
      t.in += step.in; t.cached += step.cached; t.out += step.out;
      if (ts > parsed.lastTs) parsed.lastTs = ts;
    } catch {}
  }
  codexCache.set(fp, { size: st.size, day, parsed });
  return parsed;
}

function codexCost(model, t) {
  const hit = CODEX_PRICES.find(([re]) => re.test(model));
  const p = hit ? hit[1] : CODEX_FALLBACK;
  return { cost: ((t.in - t.cached) * p.in + t.cached * p.cached + t.out * p.out) / 1e6, priced: !!hit };
}

function collectCodex(opts = {}) {
  const home = opts.home || os.homedir(), day = midnight(opts.now);
  const files = [];
  for (const back of [0, 1]) { // today's folder, plus yesterday's for sessions still running past midnight
    const d = new Date(day - back * 86400000 + 3600000);
    const dir = path.join(home, '.codex', 'sessions', String(d.getFullYear()),
      String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) files.push(path.join(dir, f)); } catch {}
  }
  const since = opts?.since?.codex;
  const zero = () => ({ in: 0, cached: 0, out: 0, cost: 0, sessions: 0, models: [], byModel: {}, unpriced: [],
    estimated: false, planPct: null, planWindowDays: null, firstTs: null, lastTs: null });
  const daily = zero();
  const session = since ? zero() : null;
  let limits = null;
  for (const fp of files) {
    const r = parseRollout(fp, day);
    if (!r) continue;
    if (r.limits && (!limits || r.limits.ts > limits.ts)) limits = r.limits;
    const used = Object.entries(r.byModel);
    if (!used.length) continue;
    const buckets = [daily];
    if (session && r.start && r.start >= since) buckets.push(session); // session = rollouts started after the pane spawned
    for (const b of buckets) {
      b.sessions++;
      for (const [model, t] of used) {
        const { cost, priced } = codexCost(model, t);
        b.in += t.in; b.cached += t.cached; b.out += t.out; b.cost += cost;
        const m = b.byModel[model] || (b.byModel[model] = { name: model, cost: 0, in: 0, out: 0 });
        m.cost += cost; m.in += t.in; m.out += t.out;
        if (!priced) { b.estimated = true; if (!b.unpriced.includes(model)) b.unpriced.push(model); }
      }
      const first = Math.max(r.start || day, day);
      if (!b.firstTs || first < b.firstTs) b.firstTs = first;
      if (r.lastTs > (b.lastTs || 0)) b.lastTs = r.lastTs;
    }
  }
  // models in order of what they cost today, so the badge shows the main one
  for (const b of [daily, session]) if (b) b.models = Object.values(b.byModel).sort((x, y) => y.cost - x.cost).map(m => m.name);
  // newest plan window: Codex reports the weekly window as primary or secondary depending on the plan
  if (limits) {
    const ws = [limits.rl.primary, limits.rl.secondary].filter(Boolean);
    const w = ws.sort((a, b) => (b.window_minutes || 0) - (a.window_minutes || 0))[0];
    if (w) for (const b of [daily, session]) if (b) {
      b.planPct = Number(w.used_percent) || 0;
      b.planWindowDays = Math.max(1, Math.round((w.window_minutes || 0) / 1440));
    }
  }
  return { daily, session };
}

// ---------- grok ----------
// Grok writes exact tokens and cost per turn to usage.json. Older sessions without it get a rough
// estimate from message text, flagged so the page can say so.
const grokCache = new Map(); // chat_history path -> { mtimeMs, estIn, estOut, msgs }
function grokEstimate(fp, st) {
  const hit = grokCache.get(fp);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit;
  let estIn = 0, estOut = 0, msgs = 0, replies = 0;
  try {
    for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        const role = e.type === 'user' || e.role === 'user' ? 'user'
          : e.type === 'assistant' || e.role === 'assistant' ? 'assistant' : null;
        if (!role) continue;
        const content = e.content ?? e.message?.content ?? '';
        const text = typeof content === 'string' ? content
          : Array.isArray(content) ? content.map(b => b?.text || '').join('') : '';
        const t = Math.round(text.length / 4);
        if (role === 'user') estIn += t; else { estOut += t; replies++; }
        msgs++;
      } catch {}
    }
  } catch {}
  const rec = { mtimeMs: st.mtimeMs, estIn, estOut, msgs, replies };
  grokCache.set(fp, rec);
  return rec;
}

function grokToday(sp, day) {
  let u;
  try { u = JSON.parse(fs.readFileSync(path.join(sp, 'usage.json'), 'utf8')); } catch { return null; }
  const t = { in: 0, cached: 0, out: 0, cost: 0, turns: 0, models: [], lastTs: 0 };
  // count each turn on the day it ended, so a session spanning midnight splits correctly
  for (const turn of u.turns || []) {
    const ts = Date.parse(turn.endedAt) || 0;
    if (ts < day || ts >= day + 864e5) continue;
    t.in += turn.inputTokens || 0;
    t.cached += turn.cachedReadTokens || 0;
    t.out += turn.outputTokens || 0;
    t.cost += (turn.costUsdTicks || 0) / 1e10; // Grok stores cost in 1e-10 dollar ticks
    t.turns++;
    if (turn.primaryModelId && !t.models.includes(turn.primaryModelId)) t.models.push(turn.primaryModelId);
    t.lastTs = Math.max(t.lastTs, ts);
  }
  return t;
}

function collectGrok(opts = {}) {
  const home = opts.home || os.homedir(), day = midnight(opts.now);
  const base = path.join(home, '.grok', 'sessions');
  const since = opts?.since?.grok;
  const zero = () => ({ in: 0, cached: 0, out: 0, cost: 0, turns: 0, sessions: 0, models: [], estimated: false, firstTs: null, lastTs: null });
  const daily = zero();
  const session = since ? zero() : null;
  let cwds = [];
  try { cwds = fs.readdirSync(base); } catch { return { daily, session }; }
  for (const cw of cwds) {
    const dp = path.join(base, cw);
    let sessions = [];
    try { sessions = fs.readdirSync(dp, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { continue; }
    for (const s of sessions) {
      const sp = path.join(dp, s);
      let t;
      try {
        const st = fs.statSync(path.join(sp, 'chat_history.jsonl'));
        if (st.mtimeMs < day) continue;
        t = grokToday(sp, day);
        if (!t) {
          const e = grokEstimate(path.join(sp, 'chat_history.jsonl'), st);
          if (!e.replies) continue; // a pane that opened but never got an answer made no model call
          t = { in: e.estIn, cached: 0, out: e.estOut, turns: e.replies, models: [], lastTs: st.mtimeMs, estimated: true,
                cost: (e.estIn * GROK_EST_PRICE.in + e.estOut * GROK_EST_PRICE.out) / 1e6 };
        }
      } catch { continue; }
      if (!t.turns) continue;
      let created = 0;
      try { created = Date.parse(JSON.parse(fs.readFileSync(path.join(sp, 'summary.json'), 'utf8')).created_at) || 0; } catch {}
      const buckets = [daily];
      if (session && created >= since) buckets.push(session); // session = grok sessions started after the pane spawned
      for (const b of buckets) {
        b.in += t.in; b.cached += t.cached; b.out += t.out; b.cost += t.cost; b.turns += t.turns; b.sessions++;
        if (t.estimated) b.estimated = true;
        for (const m of t.models) if (!b.models.includes(m)) b.models.push(m);
        if (t.lastTs > (b.lastTs || 0)) b.lastTs = t.lastTs;
        const c = Math.max(created, day);
        if (!b.firstTs || c < b.firstTs) b.firstTs = c;
      }
    }
  }
  return { daily, session };
}

module.exports = {
  collect(opts) {
    return { ts: Date.now(), since: opts?.since || {},
             claude: collectClaude(opts), codex: collectCodex(opts), grok: collectGrok(opts) };
  },
  claudeMessageCost, claudeLabel, CLAUDE_PRICES,
};
