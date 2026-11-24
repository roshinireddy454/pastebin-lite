import { createHash } from 'node:crypto';

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Same design tokens as the React app (client/src/styles.css).
const LIGHT = `color-scheme:light;--bg:#f5f6fa;--surface:#fff;--surface-2:#f8f9fc;--fg:#111827;--muted:#6b7280;--border:#e5e7eb;--border-strong:#d1d5db;--accent:#4f46e5;--accent-soft:#eef2ff;--danger:#b91c1c;--danger-soft:#fef2f2;--glow:#e0e7ff;--shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.06);`;
const DARK = `color-scheme:dark;--bg:#0b0d12;--surface:#141821;--surface-2:#0f131a;--fg:#e8eaf0;--muted:#9aa3b2;--border:#252b37;--border-strong:#343b4a;--accent:#818cf8;--accent-soft:rgba(99,102,241,.16);--danger:#f87171;--danger-soft:rgba(248,113,113,.12);--glow:rgba(99,102,241,.18);--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35);`;

const STYLE = `
:root{${LIGHT}}
:root[data-theme="dark"]{${DARK}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK}}}
*{box-sizing:border-box}
body{margin:0;font:15px/1.55 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--fg);
  background:radial-gradient(1200px 500px at 50% -200px,var(--glow) 0%,transparent 70%) no-repeat,var(--bg);-webkit-font-smoothing:antialiased}
.top{max-width:960px;margin:0 auto;padding:20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--fg);text-decoration:none;font-weight:700;font-size:17px}
.brand svg rect{fill:var(--accent)}
.brand svg path:last-child{stroke:var(--accent)}
.nav{display:flex;gap:8px}
.btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:10px;border:1px solid var(--border);
  background:var(--surface);color:var(--fg);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;text-decoration:none}
.btn:hover{border-color:var(--border-strong);background:var(--surface-2)}
.btn.icon{width:36px;padding:0;justify-content:center}
.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
main{max-width:960px;margin:0 auto;padding:4px 20px 40px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface-2)}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:var(--surface);font-size:12.5px;color:var(--muted)}
.chip.warn{color:var(--accent);background:var(--accent-soft);border-color:transparent}
pre{margin:0;padding:18px;overflow:auto;white-space:pre-wrap;word-break:break-word;tab-size:4;
  font:13.5px/1.65 "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.empty{padding:56px 24px;text-align:center}
.empty .badge{width:52px;height:52px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;background:var(--danger-soft);color:var(--danger)}
.empty h1{margin:0 0 6px;font-size:22px}
.empty p{margin:0 auto 22px;max-width:420px;color:var(--muted)}
.empty .btn{background:var(--accent);border-color:var(--accent);color:#fff;height:40px;padding:0 18px}
.sun{display:none}
:root[data-theme="dark"] .sun{display:block}:root[data-theme="dark"] .moon{display:none}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .sun{display:block}:root:not([data-theme="light"]) .moon{display:none}}
`;

// The only script on the page: theme toggle + copy button. It's allowed by its exact hash in the CSP,
// so nothing else (in particular nothing inside the paste) can ever execute.
const SCRIPT = `(function(){
var root=document.documentElement;
var t=document.getElementById('theme');
if(t)t.addEventListener('click',function(){
var cur=root.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
var next=cur==='dark'?'light':'dark';
root.setAttribute('data-theme',next);
document.cookie='theme='+next+'; path=/; max-age=31536000; SameSite=Lax';
});
var c=document.getElementById('copy');
if(c)c.addEventListener('click',function(){
var text=document.getElementById('content').textContent;
navigator.clipboard.writeText(text).then(function(){
var label=c.querySelector('span');label.textContent='Copied';
setTimeout(function(){label.textContent='Copy';},1500);
});
});
})();`;
const SCRIPT_HASH = createHash('sha256').update(SCRIPT).digest('base64');

export const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  `script-src 'sha256-${SCRIPT_HASH}'`,
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const icon = (path, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const ICONS = {
  logo: `<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8"/><path d="M10 8h8.5l4.5 4.5V24H10z" fill="#fff"/><path d="M13 16h7M13 19.5h7" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>', 18),
  moon: icon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>', 18),
  copy: icon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 15),
  clock: icon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', 13),
  eye: icon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', 13),
  x: icon('<path d="M18 6 6 18M6 6l12 12"/>', 24),
};

function layout(title, body, theme) {
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : '';
  return `<!DOCTYPE html>
<html lang="en"${themeAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>
</head>
<body>
<header class="top">
  <a class="brand" href="/">${ICONS.logo}<span>Pastebin Lite</span></a>
  <nav class="nav">
    <button class="btn icon" id="theme" type="button" aria-label="Toggle dark mode" title="Toggle dark mode"><span class="moon">${ICONS.moon}</span><span class="sun">${ICONS.sun}</span></button>
    <a class="btn" href="/">New paste</a>
  </nav>
</header>
<main>
${body}
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}

const formatUtc = (iso) => iso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

export function renderPaste(paste, theme) {
  const chips = [];
  if (paste.expires_at) {
    chips.push(`<span class="chip">${ICONS.clock}Expires <time datetime="${paste.expires_at}">${formatUtc(paste.expires_at)}</time></span>`);
  }
  if (paste.remaining_views !== null) {
    const n = paste.remaining_views;
    const text = n === 0 ? 'This was the last view' : `${n} view${n === 1 ? '' : 's'} remaining`;
    chips.push(`<span class="chip${n === 0 ? ' warn' : ''}">${ICONS.eye}${text}</span>`);
  }
  if (chips.length === 0) chips.push(`<span class="chip">${ICONS.clock}Never expires</span>`);

  return layout('Paste · Pastebin Lite', `
<div class="card">
  <div class="bar">
    <div class="chips">${chips.join('')}</div>
    <button class="btn" id="copy" type="button">${ICONS.copy}<span>Copy</span></button>
  </div>
  <pre id="content">${escapeHtml(paste.content)}</pre>
</div>`, theme);
}

export function renderNotFound(theme) {
  return layout('Paste not available · Pastebin Lite', `
<div class="card empty">
  <div class="badge">${ICONS.x}</div>
  <h1>Paste not available</h1>
  <p>This paste doesn't exist, has expired, or has reached its view limit.</p>
  <a class="btn" href="/">Create a new paste</a>
</div>`, theme);
}
