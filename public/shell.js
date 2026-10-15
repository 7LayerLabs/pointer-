// App shell: page switching, the sidebar frame, status bar provider meters, and the "choose a folder" gate.
(() => {
  const VIEWS = { workbench: 'Workbench', review: 'Review', pipelines: 'Pipelines', history: 'History', connections: 'Connections' };
  let current = 'workbench';
  let health = [];

  function setView(name) {
    if (!VIEWS[name]) name = 'workbench';
    current = name;
    for (const v of Object.keys(VIEWS)) $('view-' + v).hidden = v !== name;
    document.querySelectorAll('.nav[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.title = name === 'workbench' ? 'VibeDeck' : `${VIEWS[name]} | VibeDeck`;
    $('wbTools').hidden = name !== 'workbench' || needsFolder;
    store('vibedeck-view', name);
    closeMenus();
    window.dispatchEvent(new CustomEvent('vd:shown', { detail: name }));
    if (name === 'workbench') setTimeout(fitAll, 30);
  }
  document.querySelectorAll('.nav[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  window.addEventListener('vd:view', e => setView(e.detail));

  window.addEventListener('vd:cwd', e => {
    const gate = e.detail.needsFolder;
    $('folderGate').hidden = !gate;
    $('deck').hidden = gate;
    $('composer').hidden = gate;
    $('wbTools').hidden = current !== 'workbench' || gate;
    $('crumbPath').textContent = gate ? 'No project folder' : e.detail.cwd;
    $('crumbPath').title = gate ? '' : e.detail.cwd;
    if (!gate) setTimeout(fitAll, 30);
  });

  const INSTALL = { claude: 'npm i -g @anthropic-ai/claude-code', codex: 'npm i -g @openai/codex', grok: 'Install the Grok CLI from x.ai' };
  // ---------- usage meters: each CLI's own report of how much of its plan is used ----------
  let usage = {};
  const money = n => n >= 10 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
  const tokens = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);
  const bar = (pct, cls, title) => `<div class="meter ${cls}" title="${esc(title)}"><div class="meter-fill" style="width:${Math.max(2, Math.min(100, pct))}%"></div></div>`;
  const level = pct => pct >= 85 ? 'hot' : pct >= 60 ? 'warm' : '';
  // compact = sidebar (the tightest limit only); full = Connections page (every window)
  function usageHtml(kind, full) {
    const u = usage[kind];
    if (kind === 'grok') {
      if (!u) return full ? '<div class="meter-txt">No Grok usage recorded this week yet.</div>' : '';
      const rel = u.busiestCost > 0 ? (u.today.cost / u.busiestCost) * 100 : 0;
      const title = `Grok reports no plan limit, so this bar compares today with your busiest day this week (${money(u.busiestCost)}).`;
      return `${bar(rel, '', title)}<div class="meter-txt" title="${esc(title)}">${tokens(u.today.tokens)} tokens, ${money(u.today.cost)} today</div>`;
    }
    if (!u || !u.windows?.length) return full ? `<div class="meter-txt">Usage appears after ${kindName(kind)} is used once.</div>` : '';
    const wins = full ? u.windows : [u.windows.reduce((a, b) => (b.pct > a.pct ? b : a))];
    const where = kind === 'claude' ? "Claude's /usage" : "Codex's own logs";
    return wins.map(w => {
      const title = `${w.pct}% of your ${w.label} limit used${w.resets ? `, resets ${w.resets}` : ''}. From ${where}.`;
      return `${bar(w.pct, level(w.pct), title)}<div class="meter-txt" title="${esc(title)}">${w.pct}% of ${esc(w.label)} limit${full && w.resets ? `, resets ${esc(w.resets)}` : ''}</div>`;
    }).join('');
  }
  window.vdUsageHtml = usageHtml;

  // the status bar's short form: the tightest plan limit, or Grok's spend today
  function usageShort(kind) {
    const u = usage[kind];
    if (kind === 'grok') return u ? { text: money(u.today.cost), pct: u.busiestCost > 0 ? (u.today.cost / u.busiestCost) * 100 : 0, title: `${tokens(u.today.tokens)} tokens, ${money(u.today.cost)} today` } : null;
    if (!u || !u.windows?.length) return null;
    const w = u.windows.reduce((a, b) => (b.pct > a.pct ? b : a));
    return { text: `${w.pct}%`, pct: w.pct, title: `${w.pct}% of your ${w.label} limit used${w.resets ? `, resets ${w.resets}` : ''}` };
  }
  function renderProviders() {
    $('provList').innerHTML = health.map(h => {
      const u = h.ok ? usageShort(h.id) : null;
      const title = !h.ok ? `${kindName(h.id)} is not installed. ${INSTALL[h.id] || ''}`
        : `${kindName(h.id)} CLI${h.version ? ' v' + h.version : ''}${u ? '. ' + u.title : ''}. Click for details.`;
      return `<button class="sb-item prov ${h.ok ? '' : 'off'} ${u ? level(u.pct) : ''}" data-kind="${esc(h.id)}" title="${esc(title)}" style="--kind:${color(h.id)}">
        <span class="pdot"></span>${esc(kindName(h.id))}${u ? `<span class="sb-meter"><span style="width:${Math.max(4, Math.min(100, u.pct))}%"></span></span><span class="sb-num">${esc(u.text)}</span>` : h.ok ? '' : '<span class="sb-num">Missing</span>'}
      </button>`;
    }).join('');
  }
  $('provList').addEventListener('click', e => { if (e.target.closest('.prov')) setView('connections'); });

  // ---------- sidebar frame: show/hide (Ctrl+B) and drag to resize ----------
  const RAIL_W = 'vibedeck-rail-w', RAIL_OFF = 'vibedeck-rail-off', RAIL_DEFAULT = 272;
  const appEl = document.querySelector('.app');
  const setRailWidth = w => appEl.style.setProperty('--rail-w', Math.max(200, Math.min(520, w)) + 'px');
  setRailWidth(Number(load(RAIL_W)) || RAIL_DEFAULT);
  const setRail = on => { appEl.classList.toggle('rail-off', !on); $('railToggle').classList.toggle('on', on); store(RAIL_OFF, on ? '0' : '1'); setTimeout(fitAll, 30); };
  setRail(load(RAIL_OFF) !== '1');
  $('railToggle').addEventListener('click', () => setRail(appEl.classList.contains('rail-off')));
  window.addEventListener('vd:toggleRail', () => setRail(appEl.classList.contains('rail-off')));
  const grip = $('railResize');
  grip.addEventListener('dblclick', () => { setRailWidth(RAIL_DEFAULT); store(RAIL_W, String(RAIL_DEFAULT)); setTimeout(fitAll, 30); });
  grip.addEventListener('mousedown', e => {
    e.preventDefault();
    grip.classList.add('active'); document.body.classList.add('resizing');
    const x0 = e.clientX, w0 = $('rail').offsetWidth;
    const move = ev => setRailWidth(w0 + ev.clientX - x0);
    const up = () => {
      grip.classList.remove('active'); document.body.classList.remove('resizing');
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      store(RAIL_W, String($('rail').offsetWidth)); fitAll();
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });

  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'init') {
      // the desktop app draws its own title bar; leave room for the native window buttons
      document.body.classList.toggle('framed', !!msg.desktop);
      document.body.classList.toggle('mac', msg.platform === 'darwin');
      health = msg.health || [];
      usage = msg.usage || {};
      renderProviders();
      $('appVersion').textContent = msg.version ? 'v' + msg.version : '';
      window.vdHealth = health;
      let saved = load('vibedeck-view');
      setView(saved && VIEWS[saved] ? saved : 'workbench');
    } else if (msg.type === 'usage') {
      usage = msg.usage || {};
      renderProviders();
      window.dispatchEvent(new CustomEvent('vd:usage'));
    } else if (msg.type === 'health') {
      health = msg.health || [];
      window.vdHealth = health;
      renderProviders();
      window.dispatchEvent(new CustomEvent('vd:health', { detail: health }));
    }
  });
})();
