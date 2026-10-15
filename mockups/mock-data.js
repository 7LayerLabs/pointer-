// Shared fake project for the VibeDeck Phase 1 + 2 mockups. Every direction renders this same data,
// so the comparison is about layout and feel, not content. Plain globals: window.MOCK.
window.MOCK = {
  project: { name: 'menu-app', path: 'C:\\code\\menu-app', branch: 'main' },

  // folder tree. status: M changed, A new, D deleted (git-style, vs the last checkpoint)
  tree: [
    { name: 'src', dir: true, open: true, children: [
      { name: 'app', dir: true, open: true, children: [
        { name: 'page.tsx', path: 'src/app/page.tsx', status: 'M' },
        { name: 'layout.tsx', path: 'src/app/layout.tsx' },
      ] },
      { name: 'components', dir: true, open: true, children: [
        { name: 'MenuCard.tsx', path: 'src/components/MenuCard.tsx' },
        { name: 'ThemeToggle.tsx', path: 'src/components/ThemeToggle.tsx', status: 'A' },
      ] },
      { name: 'lib', dir: true, open: true, children: [
        { name: 'pricing.ts', path: 'src/lib/pricing.ts', status: 'M' },
      ] },
      { name: 'styles.css', path: 'src/styles.css', status: 'M' },
    ] },
    { name: 'public', dir: true, open: false, children: [
      { name: 'logo.svg', path: 'public/logo.svg' },
    ] },
    { name: 'node_modules', dir: true, heavy: true, open: false, children: [] },
    { name: 'README.md', path: 'README.md' },
    { name: 'package.json', path: 'package.json' },
    { name: 'AGENTS.md', path: 'AGENTS.md' },
  ],

  // file contents. For changed files: before = last checkpoint, after = on disk now (what the agent wrote)
  files: {
    'src/lib/pricing.ts': {
      lang: 'ts',
      before: `// Menu pricing helpers
export type Item = { name: string; price: number; qty: number };

export function lineTotal(item: Item) {
  return item.price * item.qty;
}

export function subtotal(items: Item[]) {
  let total = 0;
  for (const i of items) total += lineTotal(i);
  return total;
}

export function withTax(amount: number, rate = 0.0625) {
  return amount + amount * rate;
}

export function formatPrice(n: number) {
  return '$' + n;
}
`,
      after: `// Menu pricing helpers
export type Item = { name: string; price: number; qty: number };

export function lineTotal(item: Item) {
  return Math.round(item.price * item.qty * 100) / 100;
}

export function subtotal(items: Item[]) {
  return items.reduce((sum, i) => sum + lineTotal(i), 0);
}

export function withTax(amount: number, rate = 0.0625) {
  return amount + amount * rate;
}

export function formatPrice(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
`,
      by: 'codex',
    },
    'src/app/page.tsx': {
      lang: 'tsx',
      before: `import { MenuCard } from '../components/MenuCard';
import { formatPrice } from '../lib/pricing';
import menu from '../menu.json';

export default function Page() {
  return (
    <main className="menu">
      <h1>Tonight's Menu</h1>
      <div className="grid">
        {menu.map(item => (
          <MenuCard key={item.id} item={item} price={formatPrice(item.price)} />
        ))}
      </div>
    </main>
  );
}
`,
      after: `import { MenuCard } from '../components/MenuCard';
import { ThemeToggle } from '../components/ThemeToggle';
import { formatPrice } from '../lib/pricing';
import menu from '../menu.json';

export default function Page() {
  return (
    <main className="menu">
      <header className="menu-head">
        <h1>Tonight's Menu</h1>
        <ThemeToggle />
      </header>
      <div className="grid">
        {menu.map(item => (
          <MenuCard key={item.id} item={item} price={formatPrice(item.price)} />
        ))}
      </div>
    </main>
  );
}
`,
      by: 'claude',
    },
    'src/components/ThemeToggle.tsx': {
      lang: 'tsx',
      before: null,
      after: `'use client';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  return (
    <button className="theme-toggle" onClick={() => setDark(d => !d)}>
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
`,
      by: 'claude',
    },
    'src/styles.css': {
      lang: 'css',
      before: `.menu { max-width: 960px; margin: 0 auto; padding: 32px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; }
`,
      after: `:root { --bg: #fff; --text: #111; --line: #ddd; }
[data-theme='dark'] { --bg: #111; --text: #f4f4f4; --line: #333; }
body { background: var(--bg); color: var(--text); }
.menu { max-width: 960px; margin: 0 auto; padding: 32px; }
.menu-head { display: flex; justify-content: space-between; align-items: center; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.card { border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
`,
      by: 'claude',
    },
    'src/app/layout.tsx': { lang: 'tsx', text: `import './../styles.css';

export const metadata = { title: 'Menu' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
` },
    'src/components/MenuCard.tsx': { lang: 'tsx', text: `type Props = { item: { id: string; name: string; desc: string }; price: string };

export function MenuCard({ item, price }: Props) {
  return (
    <article className="card">
      <h3>{item.name}</h3>
      <p>{item.desc}</p>
      <strong>{price}</strong>
    </article>
  );
}
` },
    'README.md': { lang: 'md', text: `# menu-app

Tonight's menu for the dining room TV and the website.

## Run it

\`\`\`
npm install
npm run dev
\`\`\`

Open http://localhost:3000.
` },
    'package.json': { lang: 'json', text: `{
  "name": "menu-app",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build" },
  "dependencies": { "next": "16.2.0", "react": "19.2.0", "react-dom": "19.2.0" }
}
` },
    'AGENTS.md': { lang: 'md', text: `# Rules for every agent

- Plain CSS, no Tailwind.
- Prices always go through formatPrice.
- Never commit. A person reviews first.
` },
    'public/logo.svg': { lang: 'xml', text: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#c0392b"/></svg>
` },
  },

  // agents = tasks. state: working | waiting | done | idle
  agents: [
    {
      id: 'a1', cli: 'claude', model: 'Opus 5.5', title: 'Add a dark mode toggle', state: 'working',
      worktree: null, started: '4m', files: ['src/app/page.tsx', 'src/components/ThemeToggle.tsx', 'src/styles.css'], add: 30, del: 3,
      log: [
        ['user', 'Add a dark mode toggle to the menu page. Keep plain CSS.'],
        ['text', "I'll add a small ThemeToggle component and CSS variables for both themes."],
        ['tool', 'Read src/app/page.tsx'],
        ['tool', 'Write src/components/ThemeToggle.tsx  (+15)'],
        ['tool', 'Edit src/app/page.tsx  (+5 -1)'],
        ['tool', 'Edit src/styles.css  (+5 -2)'],
        ['text', 'Now checking that the build still passes.'],
        ['run', 'npm run build'],
        ['out', '  Creating an optimized production build ...'],
      ],
    },
    {
      id: 'a2', cli: 'codex', model: 'GPT-6-Sol', title: 'Fix price rounding', state: 'done',
      worktree: '.vibedeck/worktrees/fix-price-rounding', started: '11m', files: ['src/lib/pricing.ts'], add: 3, del: 4,
      log: [
        ['user', 'Prices show like $12.5 and $3.3333. Fix rounding everywhere.'],
        ['text', 'Rounding belongs in lineTotal, and formatPrice should use Intl.NumberFormat.'],
        ['tool', 'Edit src/lib/pricing.ts  (+3 -4)'],
        ['run', 'npm test'],
        ['out', '  4 passed, 0 failed'],
        ['done', 'Done. lineTotal rounds to cents and formatPrice prints $12.50.'],
      ],
    },
    {
      id: 'a3', cli: 'grok', model: 'grok-4.5', title: 'Add a specials banner', state: 'waiting',
      worktree: '.vibedeck/worktrees/specials-banner', started: '2m', files: [], add: 0, del: 0,
      ask: 'Grok wants to run: npm install framer-motion',
      log: [
        ['user', 'Add a banner at the top for tonight\'s specials, with a slide-in animation.'],
        ['text', 'I want to use framer-motion for the slide-in.'],
        ['ask', 'Allow running: npm install framer-motion ?'],
      ],
    },
  ],

  // the plain shell at the bottom
  shell: [
    'PS C:\\code\\menu-app> npm run dev',
    '',
    '  > menu-app@0.1.0 dev',
    '  > next dev',
    '',
    '   Next.js 16.2.0',
    '   - Local:   http://localhost:3000',
    '',
    ' Ready in 1.4s',
  ],

  // the website the preview panel shows (localhost:3000)
  preview: {
    url: 'http://localhost:3000',
    title: "Tonight's Menu",
    items: [
      { name: 'Chicken Parm', desc: 'House marinara, fresh mozzarella', price: '$18.50' },
      { name: 'Steak Tips', desc: 'Marinated sirloin, garlic mash', price: '$24.00' },
      { name: 'Haddock', desc: 'Baked, lemon crumb, rice pilaf', price: '$21.75' },
      { name: 'Caesar Salad', desc: 'Romaine, parmesan, croutons', price: '$11.00' },
      { name: 'Meatball Sub', desc: 'Toasted, provolone', price: '$13.25' },
      { name: 'Brownie Sundae', desc: 'Vanilla bean, hot fudge', price: '$8.50' },
    ],
  },

  // Ctrl+K command bar
  commands: [
    { label: 'New agent', hint: 'Ctrl+N', group: 'Agents' },
    { label: 'Ask every agent', hint: 'Ctrl+Shift+Enter', group: 'Agents' },
    { label: 'Compare agent results', group: 'Agents' },
    { label: 'Merge Codex: Fix price rounding', group: 'Agents' },
    { label: 'Keep all changes', hint: 'Ctrl+Enter', group: 'Changes' },
    { label: 'Undo all changes', group: 'Changes' },
    { label: 'Rewind to a checkpoint', group: 'Changes' },
    { label: 'Go to file', hint: 'Ctrl+P', group: 'Files' },
    { label: 'Search in files', hint: 'Ctrl+Shift+F', group: 'Files' },
    { label: 'Open project folder', group: 'Files' },
    { label: 'Toggle terminal', hint: 'Ctrl+`', group: 'View' },
    { label: 'Toggle preview', hint: 'Ctrl+Shift+V', group: 'View' },
    { label: 'Commit with AI message', group: 'Git' },
    { label: 'Switch branch', group: 'Git' },
  ],

  colors: { claude: '#d97757', codex: '#10a37f', grok: '#9aa4b5', shell: '#7aa2f7' },
  cliNames: { claude: 'Claude', codex: 'Codex', grok: 'Grok' },
};

// Line diff (Myers) shared by all three mockups: hunks(a, b) -> [{aStart,aLen,bStart,bLen}]
window.MOCK.diff = function (beforeText, afterText) {
  const a = (beforeText || '').split('\n'), b = (afterText || '').split('\n');
  const n = a.length, m = b.length, max = n + m, off = max + 1, v = new Int32Array(2 * max + 3), trace = [];
  let D = -1;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice(off - d, off + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1, y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { D = d; break outer; }
    }
  }
  const ops = []; let x = n, y = m;
  for (let d = D; d > 0; d--) {
    const p = trace[d], at = k => p[k + d], k = x - y;
    const pk = (k === -d || (k !== d && at(k - 1) < at(k + 1))) ? k + 1 : k - 1, px = at(pk), py = px - pk;
    while (x > px && y > py) { ops.push('='); x--; y--; }
    if (pk === k + 1) { ops.push('+'); y--; } else { ops.push('-'); x--; }
  }
  while (x > 0 && y > 0) { ops.push('='); x--; y--; }
  ops.reverse();
  const hunks = []; let ai = 0, bi = 0, cur = null;
  for (const op of ops) {
    if (op === '=') { if (cur) { hunks.push(cur); cur = null; } ai++; bi++; continue; }
    if (!cur) cur = { aStart: ai, aLen: 0, bStart: bi, bLen: 0 };
    if (op === '-') { cur.aLen++; ai++; } else { cur.bLen++; bi++; }
  }
  if (cur) hunks.push(cur);
  return { a, b, hunks };
};

// Tiny syntax colorer for the mockups (keywords, strings, comments, numbers, tags). Returns HTML.
window.MOCK.highlight = function (line, lang) {
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  if (lang === 'md') {
    if (/^#/.test(line)) return `<span class="t-k">${esc(line)}</span>`;
    if (/^\s*-\s/.test(line)) return `<span class="t-p">-</span>${esc(line.replace(/^\s*-/, ''))}`;
    return esc(line);
  }
  const re = /(\/\/.*$|\/\*.*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|export|from|function|return|const|let|for|of|type|default|new|use client|if|else)\b|\b(\d+(?:\.\d+)?)\b|(<\/?[A-Za-z][\w.]*|\/?>)|([{}()[\];,])/g;
  let out = '', last = 0, mm;
  while ((mm = re.exec(line))) {
    out += esc(line.slice(last, mm.index));
    const cls = mm[1] ? 't-c' : mm[2] ? 't-s' : mm[3] ? 't-k' : mm[4] ? 't-n' : mm[5] ? 't-t' : 't-p';
    out += `<span class="${cls}">${esc(mm[0])}</span>`;
    last = mm.index + mm[0].length;
  }
  return out + esc(line.slice(last));
};
