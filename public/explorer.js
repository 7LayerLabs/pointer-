// Explorer: the sidebar's workspaces and file trees, the file viewer dock, and Go to file (Ctrl+P).
// Read-only by design: the agents in the panes change files, this shows what they changed, live.
(() => {
  const I = d => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
  const IC = {
    chev: I('<path d="M9 6l6 6-6 6"/>'),
    folder: I('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    folderOpen: I('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1"/><path d="M3 7v11a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L21.8 12a1 1 0 0 0-1-1.3H7.4a2 2 0 0 0-1.9 1.4L3 19"/>'),
    file: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
    code: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M10 12l-2 2 2 2M14 12l2 2-2 2"/>'),
    braces: I('<path d="M8 4H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/>'),
    tag: I('<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16"/>'),
    hash: I('<path d="M5 9h15M4 15h15M10 3L8 21M16 3l-2 18"/>'),
    doc: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    image: I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 9"/>'),
    term: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>'),
    gear: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9L7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
    lock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    key: I('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'),
    box: I('<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'),
    db: I('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'),
    x: I('<path d="M6 6l12 12M18 6L6 18"/>'),
    enter: I('<path d="M9 10l-5 5 5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>'),
    reveal: I('<path d="M14 3h7v7M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>'),
    copy: I('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    send: I('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
    branch: I('<circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="8" r="2.2"/><path d="M6 7.2v9.6M18 10.2c0 4-6 3-11 7"/>'),
  };

  // ---------- file type: icon + tint ----------
  const T = { js: '#e8c47c', ts: '#7fa6f5', tsx: '#71c4d3', py: '#8fb6e8', json: '#d9a75f', css: '#c4a1f0', html: '#ef8f6b', md: '#9aa0ac', img: '#8fd19e', sh: '#8fd19e', cfg: '#8a8f9c', lock: '#6b7080', env: '#e8c47c', go: '#71c4d3', rs: '#ef8f6b', java: '#ef7b73', c: '#7fa6f5', sql: '#e8c47c', yml: '#ef7b73', txt: '#8a8f9c', vue: '#8fd19e', rb: '#ef7b73', php: '#a3a8f0' };
  const EXT = {
    js: ['code', T.js], mjs: ['code', T.js], cjs: ['code', T.js], jsx: ['code', T.tsx], ts: ['code', T.ts], tsx: ['code', T.tsx], mts: ['code', T.ts],
    py: ['code', T.py], go: ['code', T.go], rs: ['code', T.rs], java: ['code', T.java], kt: ['code', T.java], swift: ['code', T.rs], c: ['code', T.c], h: ['code', T.c], cpp: ['code', T.c], cs: ['code', T.vue], rb: ['code', T.rb], php: ['code', T.php], lua: ['code', T.c], vue: ['code', T.vue], svelte: ['code', T.rs], dart: ['code', T.tsx],
    json: ['braces', T.json], jsonc: ['braces', T.json], jsonl: ['braces', T.json],
    html: ['tag', T.html], htm: ['tag', T.html], xml: ['tag', T.html], svg: ['image', T.img],
    css: ['hash', T.css], scss: ['hash', T.css], sass: ['hash', T.css], less: ['hash', T.css],
    md: ['doc', T.md], mdx: ['doc', T.md], txt: ['doc', T.txt], rst: ['doc', T.txt], pdf: ['doc', T.java], docx: ['doc', T.ts], csv: ['doc', T.vue], log: ['doc', T.txt],
    png: ['image', T.img], jpg: ['image', T.img], jpeg: ['image', T.img], gif: ['image', T.img], webp: ['image', T.img], ico: ['image', T.img], bmp: ['image', T.img], avif: ['image', T.img],
    sh: ['term', T.sh], bash: ['term', T.sh], zsh: ['term', T.sh], ps1: ['term', T.ts], bat: ['term', T.sh], cmd: ['term', T.sh], command: ['term', T.sh],
    yml: ['gear', T.yml], yaml: ['gear', T.yml], toml: ['gear', T.cfg], ini: ['gear', T.cfg], conf: ['gear', T.cfg], cfg: ['gear', T.cfg],
    lock: ['lock', T.lock], sql: ['db', T.sql], db: ['db', T.sql], sqlite: ['db', T.sql],
  };
  const NAMES = {
    'package.json': ['box', '#8fd19e'], 'package-lock.json': ['lock', T.lock], 'pnpm-lock.yaml': ['lock', T.lock], 'yarn.lock': ['lock', T.lock],
    '.gitignore': ['gear', '#ef8f6b'], '.gitattributes': ['gear', '#ef8f6b'], '.npmrc': ['gear', T.cfg], '.editorconfig': ['gear', T.cfg],
    'dockerfile': ['box', '#7fa6f5'], 'license': ['doc', '#e8c47c'], 'readme.md': ['doc', '#7fa6f5'], 'claude.md': ['doc', '#d97757'], 'agents.md': ['doc', '#10a37f'],
  };
  function typeOf(name) {
    const low = name.toLowerCase();
    if (NAMES[low]) return NAMES[low];
    if (low === '.env' || low.startsWith('.env.')) return ['key', T.env];
    if (/\.(config|rc)\.[cm]?[jt]s$|^tsconfig.*\.json$|^\.[a-z]+rc(\.json)?$/.test(low)) return ['gear', T.cfg];
    return EXT[low.split('.').pop()] || ['file', '#7e828e'];
  }
  const LANG = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', mts: 'typescript', py: 'python', json: 'json', jsonc: 'json', md: 'markdown', mdx: 'markdown', css: 'css', scss: 'scss', less: 'less', html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', bat: 'dos', cmd: 'dos', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', sql: 'sql', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', php: 'php', rb: 'ruby', swift: 'swift', lua: 'lua', diff: 'diff', env: 'bash' };
  const langOf = name => { const low = name.toLowerCase(); if (low === 'dockerfile') return 'dockerfile'; if (low.startsWith('.env')) return 'bash'; return LANG[low.split('.').pop()] || ''; };

  // ---------- data ----------
  const api = async (what, params) => {
    const r = await fetch(`/api/fs/${what}?${new URLSearchParams(params)}`, { cache: 'no-store' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(body.error || `Could not load (${r.status})`);
    return body;
  };
  const keyOf = (root, rel) => `${root.toLowerCase()}|${rel}`;
  const sameRoot = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  const joinRel = (dir, name) => dir ? `${dir}/${name}` : name;
  const parentOf = rel => rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  const baseName = rel => rel.split('/').pop();
  const fmtSize = n => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

  // per workspace: { root, open, dirs: Map(rel -> {entries, truncated} | 'loading'), expanded: Set(rel), git }
  const spaces = new Map();
  let selected = '';
  const fresh = new Map(); // key -> expiry, rows that just changed on disk
  const wsList = $('wsList');

  const EXP_KEY = root => 'vibedeck-ex:' + root.toLowerCase();
  const OPEN_KEY = 'vibedeck-ws-open';
  function loadSet(k) { try { return new Set(JSON.parse(load(k)) || []); } catch { return new Set(); } }
  function saveExpanded(sp) { store(EXP_KEY(sp.root), JSON.stringify([...sp.expanded].slice(0, 200))); }
  function saveOpen() { store(OPEN_KEY, JSON.stringify([...spaces.values()].filter(s => s.open).map(s => s.root.toLowerCase()))); }

  function workspaceRoots() {
    if (needsFolder && !recents.length) return [];
    const list = needsFolder ? [] : [cwd];
    for (const r of recents) if (r && !sameRoot(r, home) && !list.some(x => sameRoot(x, r))) list.push(r);
    return list.slice(0, 10);
  }

  function syncSpaces() {
    const roots = workspaceRoots();
    const openSaved = loadSet(OPEN_KEY);
    const next = new Map();
    for (const root of roots) {
      const k = root.toLowerCase();
      const prev = spaces.get(k);
      const sp = prev || { root, open: openSaved.size ? openSaved.has(k) : false, dirs: new Map(), expanded: loadSet(EXP_KEY(root)), git: null };
      sp.root = root;
      sp.active = !needsFolder && sameRoot(root, cwd);
      if (sp.active && !prev && !openSaved.has(k)) sp.open = true;
      next.set(k, sp);
    }
    spaces.clear();
    next.forEach((v, k) => spaces.set(k, v));
    for (const sp of spaces.values()) if (sp.open) loadSpace(sp);
    render();
    renderBranch();
  }

  async function loadDir(sp, rel, force) {
    if (!force && sp.dirs.has(rel)) return;
    if (!sp.dirs.has(rel)) sp.dirs.set(rel, 'loading');
    try { sp.dirs.set(rel, await api('list', { root: sp.root, rel })); }
    catch (e) {
      if (rel) { sp.dirs.delete(rel); sp.expanded.delete(rel); }
      else sp.dirs.set(rel, { entries: [], error: e.message });
    }
    scheduleRender();
  }
  function loadSpace(sp) {
    loadDir(sp, '');
    sp.expanded.forEach(rel => loadDir(sp, rel));
    refreshGit(sp);
  }
  const gitTimers = new Map();
  function refreshGit(sp, delay = 0) {
    clearTimeout(gitTimers.get(sp.root));
    gitTimers.set(sp.root, setTimeout(async () => {
      try { sp.git = await api('git', { root: sp.root }); } catch { sp.git = null; }
      if (sp.git?.repo) {
        // a folder shows a dot when anything inside it changed
        const dirs = new Map();
        for (const [f, code] of Object.entries(sp.git.files)) {
          let p = parentOf(f);
          while (p) { if (!dirs.has(p)) dirs.set(p, code === 'U' && !dirs.has(p) ? 'U' : 'M'); p = parentOf(p); }
        }
        sp.gitDirs = dirs;
      } else sp.gitDirs = new Map();
      scheduleRender();
      if (sp.active) renderBranch();
    }, delay));
  }

  // ---------- render ----------
  let renderQueued = false;
  function scheduleRender() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); } }

  function gitCode(sp, rel, dir) {
    if (!sp.git?.repo) return '';
    if (sp.git.files[rel]) return sp.git.files[rel];
    // everything inside a brand-new folder is new too (git reports only the folder)
    for (let p = parentOf(rel); p; p = parentOf(p)) if (sp.git.files[p] === 'U') return 'U';
    return dir ? sp.gitDirs?.get(rel) || '' : '';
  }
  const GIT_TITLE = { M: 'Modified', U: 'New file, not in git yet', A: 'Added', D: 'Deleted', C: 'Merge conflict' };

  function rowsFor(sp, rel, depth, out) {
    const d = sp.dirs.get(rel);
    if (d === 'loading' || !d) { if (rel) out.push(`<div class="tr note" style="--d:${depth}">${guides(depth)}<span class="tr-spin"></span>Loading</div>`); return; }
    if (d.error) { out.push(`<div class="tr note err" style="--d:${depth}">${guides(depth)}${esc(d.error)}</div>`); return; }
    if (!d.entries.length && rel) { out.push(`<div class="tr note" style="--d:${depth}">${guides(depth)}Empty folder</div>`); return; }
    const now = Date.now();
    for (const e of d.entries) {
      const r = joinRel(rel, e.name), k = keyOf(sp.root, r);
      const open = e.dir && sp.expanded.has(r);
      const g = gitCode(sp, r, e.dir);
      const [icon, tint] = e.dir ? [open ? 'folderOpen' : 'folder', ''] : typeOf(e.name);
      const cls = ['tr', e.dir ? 'dir' : 'file', open ? 'open' : '', e.heavy ? 'heavy' : '', selected === k ? 'sel' : '', (fresh.get(k) || 0) > now ? 'fresh' : '', g ? 'g' + g : ''].filter(Boolean).join(' ');
      out.push(`<div class="${cls}" style="--d:${depth}" data-root="${esc(sp.root)}" data-rel="${esc(r)}" ${e.dir ? '' : 'draggable="true"'} title="${esc(r)}${g ? '  ' + esc(GIT_TITLE[g] || '') : ''}">
        ${guides(depth)}<span class="tw">${e.dir ? IC.chev : ''}</span><span class="ti" ${tint ? `style="color:${tint}"` : ''}>${IC[icon]}</span><span class="tn">${esc(e.name)}</span>
        ${e.dir ? '' : `<button class="tr-act" data-act="add" title="Add to prompt">${IC.plus}</button>`}
        ${g ? `<span class="tg">${e.dir ? '<i></i>' : g}</span>` : ''}
      </div>`);
      if (open) rowsFor(sp, r, depth + 1, out);
    }
    if (d.truncated) out.push(`<div class="tr note" style="--d:${depth}">${guides(depth)}Showing the first 3,000 items</div>`);
  }
  const guides = depth => depth > 1 ? `<span class="tguides">${'<i></i>'.repeat(depth - 1)}</span>` : '';

  function render() {
    const roots = [...spaces.values()];
    if (!roots.length) {
      wsList.innerHTML = `<div class="ws-empty"><p>No project folder yet. Pick the folder for the code you want the agents to work on.</p><button class="btn sm primary" id="wsChoose">${IC.folder}Choose a folder</button></div>`;
      $('wsChoose').addEventListener('click', () => $('cwdBtn').click());
      return;
    }
    const scroll = wsList.scrollTop;
    wsList.innerHTML = roots.map(sp => {
      const out = [];
      if (sp.open) rowsFor(sp, '', 1, out);
      const changes = sp.git?.repo ? Object.keys(sp.git.files).length : 0;
      return `<div class="ws ${sp.open ? 'open' : ''} ${sp.active ? 'active' : ''}" data-root="${esc(sp.root)}">
        <div class="ws-row" title="${esc(sp.root)}${sp.active ? '\nThe panes are working in this folder' : ''}">
          <span class="tw">${IC.chev}</span>
          <span class="ws-name">${esc(folderName(sp.root))}</span>
          ${sp.active ? '<span class="ws-live" title="The panes are working in this folder"></span>' : ''}
          ${sp.git?.branch ? `<span class="ws-branch mono" title="Git branch${changes ? `, ${changes} file${changes === 1 ? '' : 's'} changed` : ''}">${IC.branch}${esc(sp.git.branch)}</span>` : ''}
          <span class="grow"></span>
          <span class="ws-acts">
            ${sp.active ? '' : `<button class="rail-btn" data-act="switch" title="Open here: move every pane to this folder">${IC.enter}</button>`}
            <button class="rail-btn" data-act="reveal" title="Show in ${navigator.platform.startsWith('Mac') ? 'Finder' : 'File Explorer'}">${IC.reveal}</button>
            ${sp.active ? '' : `<button class="rail-btn" data-act="forget" title="Remove from this list">${IC.x}</button>`}
          </span>
        </div>
        ${sp.open ? `<div class="tree">${out.join('')}</div>` : ''}
      </div>`;
    }).join('');
    wsList.scrollTop = scroll;
  }

  function renderBranch() {
    const sp = [...spaces.values()].find(s => s.active);
    const g = sp?.git;
    $('sbBranch').hidden = !g?.repo;
    if (!g?.repo) return;
    const n = Object.keys(g.files).length;
    $('sbBranchName').textContent = g.branch || 'detached';
    $('sbChanges').textContent = [n ? `${n} changed` : '', g.ahead ? `${g.ahead} to push` : '', g.behind ? `${g.behind} to pull` : ''].filter(Boolean).join(', ');
    $('sbBranch').title = `Git branch ${g.branch}${n ? `. ${n} file${n === 1 ? '' : 's'} changed and not committed.` : '. Nothing to commit.'}`;
  }

  // ---------- tree interactions ----------
  const spaceOf = root => spaces.get(String(root).toLowerCase());
  function promptPath(root, rel) {
    if (!needsFolder && sameRoot(root, cwd)) return /\s/.test(rel) ? `"${rel}"` : rel;
    const sep = root.includes('\\') ? '\\' : '/';
    const full = root.replace(/[\\/]+$/, '') + sep + rel.split('/').join(sep);
    return /\s/.test(full) ? `"${full}"` : full;
  }
  function fullPath(root, rel) { const sep = root.includes('\\') ? '\\' : '/'; return root.replace(/[\\/]+$/, '') + (rel ? sep + rel.split('/').join(sep) : ''); }

  wsList.addEventListener('click', e => {
    const ws = e.target.closest('.ws');
    if (!ws) return;
    const sp = spaceOf(ws.dataset.root);
    if (!sp) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    const row = e.target.closest('.tr[data-rel]');
    if (act === 'switch') return send({ type: 'setcwd', dir: sp.root });
    if (act === 'forget') return send({ type: 'forgetRecent', dir: sp.root });
    if (act === 'reveal') return send({ type: 'openPath', base: sp.root, rel: '' });
    if (act === 'add' && row) return insertIntoPrompt(promptPath(sp.root, row.dataset.rel));
    if (e.target.closest('.ws-row')) {
      sp.open = !sp.open; saveOpen();
      if (sp.open) loadSpace(sp);
      return render();
    }
    if (!row) return;
    const rel = row.dataset.rel;
    selected = keyOf(sp.root, rel);
    if (row.classList.contains('dir')) {
      if (sp.expanded.has(rel)) sp.expanded.delete(rel);
      else { sp.expanded.add(rel); loadDir(sp, rel); }
      saveExpanded(sp);
      render();
    } else {
      // select in place: rebuilding the tree here would swallow a double-click
      wsList.querySelectorAll('.tr.sel').forEach(x => x.classList.remove('sel'));
      row.classList.add('sel');
      openFile(sp.root, rel);
    }
  });
  wsList.addEventListener('dblclick', e => {
    const row = e.target.closest('.tr.file');
    if (row) insertIntoPrompt(promptPath(row.dataset.root, row.dataset.rel));
  });
  wsList.addEventListener('dragstart', e => {
    const row = e.target.closest('.tr.file');
    if (!row) return;
    e.dataTransfer.setData(FILE_DRAG, JSON.stringify({ root: row.dataset.root, rel: row.dataset.rel }));
    e.dataTransfer.setData('text/plain', promptPath(row.dataset.root, row.dataset.rel));
    e.dataTransfer.effectAllowed = 'copy';
    document.body.classList.add('dragging-file');
  });
  document.addEventListener('dragend', () => document.body.classList.remove('dragging-file'));
  // the prompt box takes a dropped file as its path
  promptEl.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes(FILE_DRAG)) e.preventDefault(); });
  promptEl.addEventListener('drop', e => {
    const ref = e.dataTransfer.getData(FILE_DRAG);
    if (!ref) return;
    e.preventDefault();
    try { const f = JSON.parse(ref); insertIntoPrompt(promptPath(f.root, f.rel)); } catch {}
  });

  // right-click menu for files and folders, built on the shared pane menu popover
  function menuAt(x, y, html, onPick) {
    paneMenu.classList.remove('model-menu');
    paneMenu.innerHTML = html;
    paneMenu.hidden = false;
    const w = paneMenu.offsetWidth, h = paneMenu.offsetHeight;
    paneMenu.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x)) + 'px';
    paneMenu.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y)) + 'px';
    paneMenu.onclick = ev => { const b = ev.target.closest('.menu-item'); if (!b || b.disabled) return; closeMenus(); onPick(b.dataset); };
  }
  function fileMenuHtml(root, rel, isDir) {
    const live = [...panes.values()].filter(p => p.term && !p.dead);
    const items = [];
    if (!isDir) items.push(`<button class="menu-item" data-a="open">${IC.doc}Open</button>`);
    items.push(`<button class="menu-item" data-a="add">${IC.plus}Add to prompt</button>`);
    if (live.length) {
      items.push('<div class="menu-label">Type its path into</div>');
      live.forEach(p => items.push(`<button class="menu-item" data-a="pane" data-pane="${esc(p.id)}"><span class="dot" style="background:${color(p.kind)}"></span>${esc(paneTitle(p))}</button>`));
    }
    items.push('<div class="menu-sep"></div>');
    items.push(`<button class="menu-item" data-a="copyRel">${IC.copy}Copy relative path</button>`);
    items.push(`<button class="menu-item" data-a="copyFull">${IC.copy}Copy full path</button>`);
    items.push(`<button class="menu-item" data-a="reveal">${IC.reveal}Show in ${navigator.platform.startsWith('Mac') ? 'Finder' : 'File Explorer'}</button>`);
    return items.join('');
  }
  function fileAction(root, rel, a) {
    if (a.a === 'open') openFile(root, rel);
    else if (a.a === 'add') insertIntoPrompt(promptPath(root, rel));
    else if (a.a === 'pane') { send({ type: 'typePath', pane: a.pane, root, rel }); panes.get(a.pane)?.term?.focus(); }
    else if (a.a === 'copyRel') { navigator.clipboard.writeText(rel); toast('Relative path copied', 'copy'); }
    else if (a.a === 'copyFull') { navigator.clipboard.writeText(fullPath(root, rel)); toast('Full path copied', 'copy'); }
    else if (a.a === 'reveal') send({ type: 'openPath', base: root, rel });
  }
  wsList.addEventListener('contextmenu', e => {
    const row = e.target.closest('.tr[data-rel]');
    if (!row) return;
    e.preventDefault();
    const { root, rel } = row.dataset;
    selected = keyOf(root, rel); render();
    menuAt(e.clientX, e.clientY, fileMenuHtml(root, rel, row.classList.contains('dir')), a => fileAction(root, rel, a));
  });

  $('exRefresh').addEventListener('click', () => {
    for (const sp of spaces.values()) if (sp.open) { [...sp.dirs.keys()].forEach(rel => loadDir(sp, rel, true)); refreshGit(sp); }
    allCache = null;
  });
  $('exCollapse').addEventListener('click', () => {
    for (const sp of spaces.values()) { sp.expanded.clear(); saveExpanded(sp); }
    render();
  });

  // ---------- live updates from disk ----------
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.type !== 'fsChanged') return;
    const sp = spaceOf(msg.root);
    if (!sp) return;
    refreshGit(sp, 500);
    if (msg.gitOnly) return;
    allCache = null;
    const now = Date.now();
    fresh.forEach((until, k) => { if (until < now) fresh.delete(k); });
    if (!msg.rels) { [...sp.dirs.keys()].forEach(rel => loadDir(sp, rel, true)); }
    else {
      const dirs = new Set();
      const until = Date.now() + 2600;
      for (const rel of msg.rels) {
        dirs.add(parentOf(rel));
        fresh.set(keyOf(sp.root, rel), until);
      }
      dirs.forEach(d => { if (sp.dirs.has(d)) loadDir(sp, d, true); });
      tabs.forEach(t => { if (sameRoot(t.root, sp.root) && msg.rels.includes(t.rel)) reloadTab(t); });
      setTimeout(scheduleRender, 2700);
    }
  });
  window.addEventListener('vd:cwd', syncSpaces);

  // ---------- file viewer dock ----------
  const dock = $('dock'), dockBody = $('dockBody');
  let tabs = [], activeTab = null, lineSel = null;
  const DOCK_W = 'vibedeck-dock-w', DOCK_DEFAULT = 520;
  const setDockWidth = w => { dock.style.width = Math.max(320, Math.min(window.innerWidth * 0.6, w)) + 'px'; };
  setDockWidth(Number(load(DOCK_W)) || DOCK_DEFAULT);

  function showDock(on) {
    dock.hidden = !on; $('dockResize').hidden = !on;
    setTimeout(fitAll, 30);
  }
  async function openFile(root, rel) {
    window.dispatchEvent(new CustomEvent('vd:view', { detail: 'workbench' }));
    let t = tabs.find(x => sameRoot(x.root, root) && x.rel === rel);
    if (!t) { t = { root, rel, data: null, scroll: 0 }; tabs.push(t); if (tabs.length > 8) tabs.shift(); }
    if (activeTab && activeTab !== t) activeTab.scroll = dockBody.scrollTop;
    activeTab = t;
    showDock(true);
    renderTabs();
    if (!t.data) { dockBody.innerHTML = '<div class="dock-msg"><span class="tr-spin"></span>Opening</div>'; await reloadTab(t, true); }
    else renderBodyFor(t);
  }
  async function reloadTab(t, first) {
    try { t.data = await api('read', { root: t.root, rel: t.rel }); t.error = ''; }
    catch (e) { t.data = t.data || { kind: 'error' }; t.error = e.message; }
    if (!first) t.updated = Date.now();
    if (t === activeTab) { const s = dockBody.scrollTop; renderBodyFor(t); if (!first) dockBody.scrollTop = s; }
  }
  function closeTab(t) {
    tabs = tabs.filter(x => x !== t);
    if (activeTab === t) { activeTab = tabs[tabs.length - 1] || null; if (activeTab) { renderTabs(); renderBodyFor(activeTab); } }
    if (!tabs.length) showDock(false); else renderTabs();
  }
  function renderTabs() {
    $('dockTabs').innerHTML = tabs.map((t, i) => {
      const [icon, tint] = typeOf(baseName(t.rel));
      return `<div class="dtab ${t === activeTab ? 'on' : ''}" data-i="${i}" title="${esc(fullPath(t.root, t.rel))}"><span class="ti" style="color:${tint}">${IC[icon]}</span><span class="dt-name">${esc(baseName(t.rel))}</span><button class="dt-x" title="Close">${IC.x}</button></div>`;
    }).join('') + `<span class="grow"></span><button class="iconbtn dt-closeall" title="Close the viewer">${IC.x}</button>`;
  }
  $('dockTabs').addEventListener('click', e => {
    if (e.target.closest('.dt-closeall')) { tabs = []; activeTab = null; return showDock(false); }
    const tab = e.target.closest('.dtab');
    if (!tab) return;
    const t = tabs[Number(tab.dataset.i)];
    if (e.target.closest('.dt-x')) return closeTab(t);
    if (t !== activeTab) { if (activeTab) activeTab.scroll = dockBody.scrollTop; activeTab = t; renderTabs(); renderBodyFor(t); dockBody.scrollTop = t.scroll || 0; }
  });
  $('dockTabs').addEventListener('auxclick', e => { const tab = e.target.closest('.dtab'); if (tab && e.button === 1) closeTab(tabs[Number(tab.dataset.i)]); });

  // highlight.js output split per line, re-opening spans that cross a line break
  function splitLines(html) {
    const lines = [], open = [];
    let cur = '';
    const re = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+)/g;
    let m;
    while ((m = re.exec(html))) {
      if (m[1]) { open.push(m[1]); cur += m[1]; }
      else if (m[2]) { open.pop(); cur += m[2]; }
      else if (m[3]) { lines.push(cur + '</span>'.repeat(open.length)); cur = open.join(''); }
      else cur += m[4];
    }
    lines.push(cur);
    return lines;
  }
  function renderBodyFor(t) {
    lineSel = null;
    const d = t.data || {};
    const crumbs = [folderName(t.root), ...t.rel.split('/')];
    $('dockCrumbs').innerHTML = crumbs.map((c, i) => `<span class="${i === crumbs.length - 1 ? 'last' : ''}">${esc(c)}</span>`).join(`<svg class="i sep" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>`);
    $('dockAdd').hidden = !!t.error;
    updateAddLabel();
    if (t.error) { $('dockMeta').textContent = ''; dockBody.innerHTML = `<div class="dock-msg err">${esc(t.error)}</div>`; return; }
    const updated = t.updated && Date.now() - t.updated < 4000;
    if (d.kind === 'image') {
      $('dockMeta').textContent = fmtSize(d.size);
      dockBody.innerHTML = `<div class="dock-img"><img alt="${esc(t.rel)}" src="/api/fs/raw?${new URLSearchParams({ root: t.root, rel: t.rel, v: d.mtime })}"></div>`;
    } else if (d.kind === 'binary' || d.kind === 'large') {
      $('dockMeta').textContent = fmtSize(d.size);
      dockBody.innerHTML = `<div class="dock-msg">${d.kind === 'binary' ? 'This is not a text file, so it cannot be shown here.' : 'This file is over 2 MB, too big to show here.'}<button class="btn sm" data-reveal>${IC.reveal}Show in ${navigator.platform.startsWith('Mac') ? 'Finder' : 'File Explorer'}</button></div>`;
      dockBody.querySelector('[data-reveal]').addEventListener('click', () => send({ type: 'openPath', base: t.root, rel: t.rel }));
    } else {
      const text = (d.text || '').replace(/\r\n/g, '\n');
      const lang = langOf(baseName(t.rel));
      let html;
      try { html = lang && window.hljs?.getLanguage(lang) && text.length < 400000 ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value : esc(text); }
      catch { html = esc(text); }
      const lines = splitLines(html);
      if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      const shown = lines.slice(0, 20000);
      $('dockMeta').innerHTML = `${updated ? '<span class="upd">Updated on disk</span>' : ''}${lines.length.toLocaleString()} line${lines.length === 1 ? '' : 's'}, ${fmtSize(d.size)}`;
      dockBody.innerHTML = `<div class="code hljs" style="--gw:${String(shown.length).length + 1}ch">${shown.map((l, i) => `<div class="ln" data-n="${i + 1}"><span class="n">${i + 1}</span><span class="c">${l || ' '}</span></div>`).join('')}</div>`;
      if (updated) setTimeout(() => { if (activeTab === t) $('dockMeta').querySelector('.upd')?.remove(); }, 4000);
    }
  }
  // selecting code lines turns "Add to prompt" into "Add lines 12-20"
  function updateAddLabel() {
    const b = $('dockAdd');
    b.innerHTML = `${IC.plus}${lineSel ? `Add line${lineSel[0] === lineSel[1] ? ` ${lineSel[0]}` : `s ${lineSel[0]}-${lineSel[1]}`}` : 'Add to prompt'}`;
  }
  dockBody.addEventListener('mouseup', () => {
    const s = window.getSelection();
    let next = null;
    if (s && !s.isCollapsed && dockBody.contains(s.anchorNode)) {
      const a = s.anchorNode.parentElement?.closest('.ln'), b = s.focusNode.parentElement?.closest('.ln');
      if (a && b) { const x = Number(a.dataset.n), y = Number(b.dataset.n); next = [Math.min(x, y), Math.max(x, y)]; }
    }
    lineSel = next; updateAddLabel();
  });
  $('dockAdd').addEventListener('click', () => {
    if (!activeTab) return;
    const p = promptPath(activeTab.root, activeTab.rel);
    insertIntoPrompt(lineSel ? `${p} (lines ${lineSel[0]}${lineSel[1] !== lineSel[0] ? '-' + lineSel[1] : ''})` : p);
  });
  $('dockMore').addEventListener('click', e => {
    if (!activeTab) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = activeTab;
    menuAt(r.right - 220, r.bottom + 6, fileMenuHtml(t.root, t.rel, false).replace(/<button class="menu-item" data-a="open">.*?<\/button>/, ''), a => fileAction(t.root, t.rel, a));
  });
  const dockGrip = $('dockResize');
  dockGrip.addEventListener('dblclick', () => { setDockWidth(DOCK_DEFAULT); store(DOCK_W, String(DOCK_DEFAULT)); setTimeout(fitAll, 30); });
  dockGrip.addEventListener('mousedown', e => {
    e.preventDefault();
    dockGrip.classList.add('active'); document.body.classList.add('resizing');
    const x0 = e.clientX, w0 = dock.offsetWidth;
    const move = ev => { setDockWidth(w0 - (ev.clientX - x0)); clearTimeout(fitTimer); fitTimer = setTimeout(fitAll, 80); };
    const up = () => {
      dockGrip.classList.remove('active'); document.body.classList.remove('resizing');
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      store(DOCK_W, String(dock.offsetWidth)); fitAll();
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });

  // ---------- Go to file (Ctrl+P) ----------
  let allCache = null, quickItems = [], quickIdx = 0;
  const qOverlay = $('quickOverlay'), qInput = $('quickInput'), qList = $('quickList');
  // subsequence match: consecutive letters and file-name hits score higher
  function score(path, q) {
    const low = path.toLowerCase(), base = low.lastIndexOf('/') + 1;
    let i = 0, s = 0, run = 0, last = -2;
    const hits = [];
    for (const ch of q) {
      const at = low.indexOf(ch, i);
      if (at < 0) return null;
      run = at === last + 1 ? run + 1 : 0;
      s += 1 + run * 3 + (at >= base ? 2 : 0) + (at === base || low[at - 1] === '/' || low[at - 1] === '-' || low[at - 1] === '_' || low[at - 1] === '.' ? 3 : 0);
      hits.push(at); last = at; i = at + 1;
    }
    if (low.slice(base).startsWith(q)) s += 12;
    return { s: s - path.length * 0.02, hits };
  }
  const mark = (text, hits, offset) => [...text].map((c, i) => hits.includes(i + offset) ? `<b>${esc(c)}</b>` : esc(c)).join('');
  function renderQuick() {
    const q = qInput.value.trim().toLowerCase().replace(/\\/g, '/');
    const files = allCache?.files || [];
    quickItems = q ? files.map(f => ({ f, m: score(f, q) })).filter(x => x.m).sort((a, b) => b.m.s - a.m.s).slice(0, 80)
      : files.slice(0, 80).map(f => ({ f, m: { hits: [] } }));
    quickIdx = Math.min(quickIdx, Math.max(0, quickItems.length - 1));
    qList.innerHTML = !allCache ? '<div class="quick-empty"><span class="tr-spin"></span>Reading the project</div>'
      : !quickItems.length ? '<div class="quick-empty">No file matches that</div>'
      : quickItems.map((x, i) => {
        const cut = x.f.lastIndexOf('/') + 1;
        const [icon, tint] = typeOf(x.f.slice(cut));
        return `<div class="qi ${i === quickIdx ? 'on' : ''}" data-i="${i}"><span class="ti" style="color:${tint}">${IC[icon]}</span><span class="qn">${mark(x.f.slice(cut), x.m.hits, cut)}</span><span class="qp mono">${mark(x.f.slice(0, cut), x.m.hits, 0)}</span></div>`;
      }).join('');
    $('quickCount').textContent = allCache ? `${allCache.files.length.toLocaleString()} files${allCache.truncated ? ' (first part only)' : ''}` : '';
    qList.querySelector('.qi.on')?.scrollIntoView({ block: 'nearest' });
  }
  async function openQuick() {
    if (needsFolder) return toast('Choose a project folder first.', 'folder');
    qOverlay.classList.add('open');
    qInput.value = ''; quickIdx = 0;
    qInput.focus();
    renderQuick();
    if (!allCache || Date.now() - allCache.at > 30000) {
      try { allCache = { ...(await api('all', { root: cwd })), at: Date.now() }; } catch (e) { allCache = { files: [], at: Date.now() }; toast(e.message, 'warn', true); }
      renderQuick();
    }
  }
  function closeQuick() { qOverlay.classList.remove('open'); }
  function pickQuick(i, add) {
    const x = quickItems[i];
    if (!x) return;
    closeQuick();
    if (add) insertIntoPrompt(promptPath(cwd, x.f));
    else {
      // reveal it in the tree too
      const sp = [...spaces.values()].find(s => s.active);
      if (sp) {
        sp.open = true; let p = parentOf(x.f);
        while (p) { sp.expanded.add(p); loadDir(sp, p); p = parentOf(p); }
        saveExpanded(sp); selected = keyOf(sp.root, x.f); render();
        setTimeout(() => wsList.querySelector('.tr.sel')?.scrollIntoView({ block: 'center' }), 250);
      }
      openFile(cwd, x.f);
    }
  }
  qInput.addEventListener('input', () => { quickIdx = 0; renderQuick(); });
  qInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); quickIdx = Math.min(quickIdx + 1, quickItems.length - 1); renderQuick(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); quickIdx = Math.max(quickIdx - 1, 0); renderQuick(); }
    else if (e.key === 'Enter') { e.preventDefault(); pickQuick(quickIdx, e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); closeQuick(); }
  });
  qList.addEventListener('mousedown', e => { const r = e.target.closest('.qi'); if (r) { e.preventDefault(); pickQuick(Number(r.dataset.i), e.shiftKey); } });
  qOverlay.addEventListener('mousedown', e => { if (e.target === qOverlay) closeQuick(); });
  $('quickBtn').addEventListener('click', openQuick);

  // Ctrl+P and Ctrl+B mean something inside a terminal (shell history, cursor moves), so they stay there
  document.addEventListener('keydown', e => {
    if (document.activeElement?.closest?.('.term')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); openQuick(); }
    else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); window.dispatchEvent(new CustomEvent('vd:toggleRail')); }
    else if (e.key === 'Escape' && qOverlay.classList.contains('open')) closeQuick();
  }, true);
})();
