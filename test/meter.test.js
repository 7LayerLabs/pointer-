'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const meter = require('../meter-data');

const now = Date.now();
const day = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); })();
const iso = t => new Date(t).toISOString();
const write = (fp, text) => { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, text); };
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-meter-'));
  const proj = path.join(home, '.claude', 'projects', 'C--work');
  const msg = (id, model, usage, t) => ({ type: 'assistant', timestamp: iso(t), message: { id, model, usage } });
  write(path.join(proj, 'main.jsonl'), jsonl([
    // logged once per content block: the same id twice, only the last copy counts
    msg('a1', 'claude-opus-5-5', { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0 }, day + 1000),
    msg('a1', 'claude-opus-5-5', { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 2000 } }, day + 2000),
    msg('old', 'claude-opus-5-5', { input_tokens: 999, output_tokens: 999 }, day - 3600000),
    msg('syn', '<synthetic>', { input_tokens: 0, output_tokens: 0 }, day + 3000),
    msg('f1', 'claude-opus-4-8', { input_tokens: 100, output_tokens: 100, speed: 'fast' }, day + 4000),
  ]));
  write(path.join(proj, 'sess-1', 'subagents', 'agent-x.jsonl'), jsonl([
    msg('s1', 'claude-haiku-5-5', { input_tokens: 1000, output_tokens: 10, cache_read_input_tokens: 200000 }, day + 5000),
  ]));

  // Codex: a session that started yesterday and kept going after midnight, reporting its weekly
  // window as primary with no secondary
  const y = new Date(day - 86400000 + 3600000);
  const ydir = path.join(home, '.codex', 'sessions', String(y.getFullYear()), String(y.getMonth() + 1).padStart(2, '0'), String(y.getDate()).padStart(2, '0'));
  const tc = (t, total, rl) => ({ timestamp: iso(t), type: 'event_msg', payload: { type: 'token_count',
    info: { total_token_usage: total }, rate_limits: rl } });
  write(path.join(ydir, 'rollout-a.jsonl'), jsonl([
    { timestamp: iso(day - 7200000), type: 'turn_context', payload: { model: 'gpt-6-astra' } },
    tc(day - 3600000, { input_tokens: 1000, cached_input_tokens: 500, output_tokens: 50 }),
    tc(day + 3600000, { input_tokens: 3000, cached_input_tokens: 1500, output_tokens: 250 },
      { primary: { used_percent: 7, window_minutes: 10080 }, secondary: null }),
    // switched models mid-session: this turn is billed to Luna, not Astra
    { timestamp: iso(day + 5400000), type: 'turn_context', payload: { model: 'gpt-6-luna' } },
    tc(day + 7200000, { input_tokens: 4000, cached_input_tokens: 1500, output_tokens: 350 }),
  ]));

  // Grok: one real session with usage.json (one turn yesterday, one today), one idle pane
  const g = path.join(home, '.grok', 'sessions', 'C%3A%5Cwork');
  write(path.join(g, 's1', 'chat_history.jsonl'), jsonl([{ type: 'user', content: 'hi' }, { type: 'assistant', content: 'yo' }]));
  write(path.join(g, 's1', 'usage.json'), JSON.stringify({ turns: [
    { endedAt: iso(day - 600000), inputTokens: 9e6, outputTokens: 9e6, costUsdTicks: 9e10, primaryModelId: 'grok-4.5-build' },
    { endedAt: iso(day + 600000), inputTokens: 40000, cachedReadTokens: 30000, outputTokens: 500, costUsdTicks: 123456789, primaryModelId: 'grok-4.5-build' },
  ] }));
  write(path.join(g, 'idle', 'chat_history.jsonl'), jsonl([{ type: 'system', content: 'x'.repeat(4000) }, { type: 'user', content: 'x'.repeat(80000) }]));
  return home;
}

test('meter: Claude counts subagents, dedupes repeated ids, prices per model', () => {
  const home = fakeHome();
  const c = meter.collect({ home, now }).claude.daily;
  assert.strictEqual(c.calls, 3); // a1, f1, s1; "old" is yesterday and "<synthetic>" is empty
  assert.strictEqual(c.out, 100 + 100 + 10);
  assert.strictEqual(c.cacheRead, 1000 + 200000);
  assert.strictEqual(c.cacheWrite, 2000);
  // opus 5.5: 10*$4 + 100*$20 + 1000*$0.20 + 2000*$8 (1h write)
  const opus55 = (10 * 4 + 100 * 20 + 1000 * 0.2 + 2000 * 8) / 1e6;
  // opus 4.8 in fast mode bills double: 2 * (100*$5 + 100*$25)
  const opus48 = 2 * (100 * 5 + 100 * 25) / 1e6;
  // haiku 5.5 over 100k prompt tokens uses the higher tier: 1000*$0.50 + 10*$2.50 + 200000*$0.05
  const haiku = (1000 * 0.5 + 10 * 2.5 + 200000 * 0.05) / 1e6;
  near(c.cost, opus55 + opus48 + haiku);
  assert.deepStrictEqual(c.models.map(m => m.name).sort(), ['haiku 5.5', 'opus 4.8', 'opus 5.5']);
  assert.deepStrictEqual(c.unpriced, []);
});

test('meter: Codex counts only today\'s part of a cross-midnight session, bills each turn to its model, finds the weekly window', () => {
  const x = meter.collect({ home: fakeHome(), now }).codex.daily;
  assert.strictEqual(x.in, 3000);
  assert.strictEqual(x.cached, 1000);
  assert.strictEqual(x.out, 300);
  assert.deepStrictEqual(x.models, ['gpt-6-astra', 'gpt-6-luna']);
  assert.strictEqual(x.byModel['gpt-6-astra'].in, 2000);
  assert.strictEqual(x.byModel['gpt-6-luna'].out, 100);
  near(x.cost, (1000 * 10 + 1000 * 1 + 200 * 50) / 1e6 + (1000 * 0.1 + 100 * 0.5) / 1e6);
  assert.deepStrictEqual(x.unpriced, []);
  assert.strictEqual(x.planPct, 7);
  assert.strictEqual(x.planWindowDays, 7);
});

test('meter: Grok uses its own usage records for today only and skips panes that never got an answer', () => {
  const g = meter.collect({ home: fakeHome(), now }).grok.daily;
  assert.strictEqual(g.turns, 1);
  assert.strictEqual(g.sessions, 1);
  assert.strictEqual(g.in, 40000);
  assert.strictEqual(g.cached, 30000);
  assert.strictEqual(g.out, 500);
  near(g.cost, 0.0123456789);
  assert.strictEqual(g.estimated, false);
});

test('meter: model labels', () => {
  assert.strictEqual(meter.claudeLabel('claude-opus-5-5'), 'opus 5.5');
  assert.strictEqual(meter.claudeLabel('claude-sonnet-4-5-20250929'), 'sonnet 4.5');
  assert.strictEqual(meter.claudeLabel('claude-opus-4-20250514'), 'opus 4');
  assert.strictEqual(meter.claudeLabel('claude-fable-5-1'), 'fable 5.1');
});
