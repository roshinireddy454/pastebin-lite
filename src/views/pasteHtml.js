import { createHash } from 'node:crypto';
import { limits } from '../config.js';
import { highlight, languageExtension, languageName } from '../lib/languages.js';

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------------------
// Styles. Same design tokens as the React app (client/src/styles.css).
// ---------------------------------------------------------------------------
const LIGHT = `color-scheme:light;--bg:#f5f6fa;--surface:#fff;--surface-2:#f8f9fc;--fg:#111827;--muted:#6b7280;--border:#e5e7eb;--border-strong:#d1d5db;--accent:#4f46e5;--accent-strong:#4f46e5;--accent-soft:#eef2ff;--danger:#b91c1c;--danger-soft:#fef2f2;--warn:#b45309;--warn-soft:#fffbeb;--glow:#e0e7ff;--shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.06);
--hl-comment:#6a737d;--hl-keyword:#d73a49;--hl-string:#032f62;--hl-number:#005cc5;--hl-title:#6f42c1;--hl-attr:#005cc5;--hl-built:#e36209;--hl-meta:#22863a;`;
const DARK = `color-scheme:dark;--bg:#0b0d12;--surface:#141821;--surface-2:#0f131a;--fg:#e8eaf0;--muted:#9aa3b2;--border:#252b37;--border-strong:#343b4a;--accent:#818cf8;--accent-strong:#6366f1;--accent-soft:rgba(99,102,241,.16);--danger:#f87171;--danger-soft:rgba(248,113,113,.12);--warn:#fbbf24;--warn-soft:rgba(251,191,36,.1);--glow:rgba(99,102,241,.18);--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35);
--hl-comment:#8b949e;--hl-keyword:#ff7b72;--hl-string:#a5d6ff;--hl-number:#79c0ff;--hl-title:#d2a8ff;--hl-attr:#79c0ff;--hl-built:#ffa657;--hl-meta:#7ee787;`;

const STYLE = `
:root{${LIGHT}}
:root[data-theme="dark"]{${DARK}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK}}}
*{box-sizing:border-box}
body{margin:0;font:15px/1.55 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--fg);
  background:radial-gradient(1200px 500px at 50% -200px,var(--glow) 0%,transparent 70%) no-repeat,var(--bg);-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.top{max-width:1040px;margin:0 auto;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--fg);text-decoration:none;font-weight:700;font-size:17px}
.brand svg rect{fill:var(--accent)}.brand svg path:last-child{stroke:var(--accent)}
.nav{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.nav a.link{color:var(--muted);text-decoration:none;font-size:14px;font-weight:500;padding:7px 10px;border-radius:8px}
.nav a.link:hover{color:var(--fg);background:var(--surface)}
.btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 13px;border-radius:10px;border:1px solid var(--border);
  background:var(--surface);color:var(--fg);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:hover{border-color:var(--border-strong);background:var(--surface-2)}
.btn.primary{background:var(--accent-strong);border-color:var(--accent-strong);color:#fff}
.btn.primary:hover{filter:brightness(1.1);background:var(--accent-strong)}
.btn.icon{width:36px;padding:0;justify-content:center}
.btn.danger:hover{color:var(--danger);border-color:var(--danger);background:var(--danger-soft)}
.chip-user{display:inline-flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--fg);text-decoration:none;font-size:14px;font-weight:600}
.chip-user:hover{border-color:var(--border-strong)}
.avatar{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#fff;font-weight:700;font-size:13px}
:root[data-theme="dark"] .avatar{background:#6366f1}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .avatar{background:#6366f1}}
.btn:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
main{max-width:1040px;margin:0 auto;padding:4px 20px 48px}
.head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin:6px 0 16px}
.head h1{margin:0 0 6px;font-size:24px;letter-spacing:-.01em;word-break:break-word}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;color:var(--muted);font-size:13.5px}
.meta a{color:var(--fg);font-weight:600;text-decoration:none}.meta a:hover{text-decoration:underline}
.tools{display:flex;gap:6px;flex-wrap:wrap}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface-2)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;border:1px solid var(--border);background:var(--surface);font-size:12.5px;color:var(--muted)}
.chip.accent{color:var(--accent);background:var(--accent-soft);border-color:transparent;font-weight:600}
.notice{display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--warn-soft);color:var(--warn);font-size:13.5px}
.code{display:flex;font:13px/1.65 "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.gutter{margin:0;padding:16px 12px 16px 16px;text-align:right;color:var(--muted);opacity:.6;user-select:none;border-right:1px solid var(--border);background:var(--surface-2);font:inherit}
.code pre{margin:0;padding:16px 18px;overflow:auto;flex:1;min-width:0;font:inherit;tab-size:4}
.code pre.gutter{flex:none;overflow:visible}
.code pre.wrap{white-space:pre-wrap;word-break:break-word}
.code pre code{font:inherit}
.hljs-comment,.hljs-quote{color:var(--hl-comment);font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-type,.hljs-doctag{color:var(--hl-keyword)}
.hljs-string,.hljs-regexp,.hljs-template-tag,.hljs-template-variable,.hljs-addition{color:var(--hl-string)}
.hljs-number,.hljs-symbol,.hljs-bullet,.hljs-variable,.hljs-link{color:var(--hl-number)}
.hljs-title,.hljs-section,.hljs-name,.hljs-selector-id,.hljs-selector-class{color:var(--hl-title)}
.hljs-attr,.hljs-attribute,.hljs-property,.hljs-params{color:var(--hl-attr)}
.hljs-built_in,.hljs-class .hljs-title{color:var(--hl-built)}
.hljs-meta,.hljs-tag,.hljs-deletion{color:var(--hl-meta)}
.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}
.center{max-width:460px;margin:24px auto 0;padding:40px 28px;text-align:center}
.badge{width:52px;height:52px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center}
.badge.err{background:var(--danger-soft);color:var(--danger)}.badge.lock{background:var(--accent-soft);color:var(--accent)}
.center h1{margin:0 0 6px;font-size:22px}
.center p{margin:0 auto 22px;color:var(--muted)}
.unlock{display:flex;flex-direction:column;gap:10px;text-align:left}
.unlock input{height:42px;padding:0 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--fg);font:inherit}
.unlock .btn{height:42px;justify-content:center}
.error{color:var(--danger);font-size:13.5px;margin:0}
.sun{display:none}
:root[data-theme="dark"] .sun{display:block}:root[data-theme="dark"] .moon{display:none}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .sun{display:block}:root:not([data-theme="light"]) .moon{display:none}}
@media (max-width:640px){.gutter{display:none}.head h1{font-size:20px}}
`;

// ---------------------------------------------------------------------------
// The only script on these pages. It is allowed by its exact hash in the CSP, so
// nothing else (in particular nothing inside a paste) can ever execute.
// ---------------------------------------------------------------------------
const SCRIPT = `(function(){
var root=document.documentElement;
var on=function(id,fn){var el=document.getElementById(id);if(el)el.addEventListener('click',function(){fn(el);});};
var text=function(){var c=document.getElementById('content');return c?c.textContent:'';};
var flash=function(el,msg){var s=el.querySelector('span');var old=s.textContent;s.textContent=msg;setTimeout(function(){s.textContent=old;},1500);};
on('theme',function(){
var cur=root.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
var next=cur==='dark'?'light':'dark';
root.setAttribute('data-theme',next);
document.cookie='theme='+next+'; path=/; max-age=31536000; SameSite=Lax';
});
on('copy',function(el){navigator.clipboard.writeText(text()).then(function(){flash(el,'Copied');});});
on('download',function(el){
var a=document.createElement('a');
a.href=URL.createObjectURL(new Blob([text()],{type:'text/plain;charset=utf-8'}));
a.download=el.getAttribute('data-filename');document.body.appendChild(a);a.click();a.remove();
setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
});
on('clone',function(el){
try{sessionStorage.setItem('pastebin:clone',JSON.stringify({content:text(),title:el.getAttribute('data-title'),language:el.getAttribute('data-language')}));}catch(e){}
location.href='/?clone=1';
});
on('delete',function(el){
if(!confirm('Delete this paste? This cannot be undone.'))return;
fetch('/api/pastes/'+el.getAttribute('data-id'),{method:'DELETE',credentials:'same-origin'}).then(function(r){
if(r.ok){location.href='/dashboard';}else{alert('Could not delete this paste.');}
},function(){alert('Network error. Please try again.');});
});
document.querySelectorAll('time[data-local]').forEach(function(t){t.textContent=new Date(t.getAttribute('datetime')).toLocaleString();});
})();`;
const SCRIPT_HASH = createHash('sha256').update(SCRIPT).digest('base64');

export const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  `script-src 'sha256-${SCRIPT_HASH}'`,
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const icon = (path, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const ICONS = {
  logo: `<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8"/><path d="M10 8h8.5l4.5 4.5V24H10z" fill="#fff"/><path d="M13 16h7M13 19.5h7" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>', 18),
  moon: icon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>', 18),
  copy: icon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 15),
  download: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', 15),
  raw: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>', 15),
  clone: icon('<path d="M12 5v14M5 12h14"/>', 15),
  edit: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>', 15),
  trash: icon('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>', 15),
  clock: icon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', 13),
  eye: icon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', 13),
  lock: icon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 13),
  globe: icon('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', 13),
  link: icon('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', 13),
  fire: icon('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14 0-5.5 3-7 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>', 16),
  x: icon('<path d="M18 6 6 18M6 6l12 12"/>', 24),
  bigLock: icon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 24),
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
function layout(title, body, { theme, user }) {
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : '';
  const account = user
    ? `<a class="link" href="/dashboard">My pastes</a><a class="chip-user" href="/u/${encodeURIComponent(user.username)}"><span class="avatar">${escapeHtml(user.username[0].toUpperCase())}</span>${escapeHtml(user.username)}</a>`
    : `<a class="link" href="/login">Log in</a><a class="btn" href="/signup">Sign up</a>`;
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
    <a class="link" href="/">New paste</a>
    <a class="link" href="/archive">Archive</a>
    ${account}
    <button class="btn icon" id="theme" type="button" aria-label="Toggle dark mode" title="Toggle dark mode"><span class="moon">${ICONS.moon}</span><span class="sun">${ICONS.sun}</span></button>
  </nav>
</header>
<main>
${body}
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}

const time = (ms) => {
  const iso = new Date(ms).toISOString();
  return `<time datetime="${iso}" data-local>${iso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}</time>`;
};

const VISIBILITY_LABEL = { public: ['Public', ICONS.globe], unlisted: ['Unlisted', ICONS.link], private: ['Private', ICONS.lock] };

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
export function renderPaste(paste, ctx) {
  const remaining = paste.maxViews === null ? null : paste.maxViews - paste.viewCount;
  const title = paste.title || 'Untitled paste';
  const [visLabel, visIcon] = VISIBILITY_LABEL[paste.visibility] ?? VISIBILITY_LABEL.unlisted;

  const author = paste.author
    ? `<span>by <a href="/u/${encodeURIComponent(paste.author)}">${escapeHtml(paste.author)}</a></span>`
    : '<span>by Anonymous</span>';

  const chips = [`<span class="chip accent">${escapeHtml(languageName(paste.language))}</span>`, `<span class="chip">${visIcon}${visLabel}</span>`];
  chips.push(paste.expiresAt
    ? `<span class="chip">${ICONS.clock}Expires&nbsp;${time(paste.expiresAt)}</span>`
    : `<span class="chip">${ICONS.clock}Never expires</span>`);
  chips.push(remaining === null
    ? `<span class="chip">${ICONS.eye}${paste.viewCount} view${paste.viewCount === 1 ? '' : 's'}</span>`
    : `<span class="chip">${ICONS.eye}${remaining} view${remaining === 1 ? '' : 's'} remaining</span>`);

  // Raw view counts as another view and can't carry a password, so it's only offered
  // for pastes without a view limit or password.
  const rawLink = remaining === null && !paste.hasPassword
    ? `<a class="btn" href="/raw/${paste.id}" target="_blank" rel="noopener">${ICONS.raw}<span>Raw</span></a>` : '';
  const filename = `${(paste.title || paste.id).replace(/[^\w.-]+/g, '_').slice(0, 60)}.${languageExtension(paste.language)}`;

  const notice = remaining === 0
    ? `<div class="notice">${ICONS.fire}<span>This was the last allowed view. The paste is now gone, so copy or download it if you need it.</span></div>`
    : '';

  const bytes = Buffer.byteLength(paste.content, 'utf8');
  const highlighted = bytes <= limits.highlightMaxBytes ? highlight(paste.content, paste.language) : null;
  let code;
  if (highlighted !== null) {
    const lines = paste.content.split('\n').length - (paste.content.endsWith('\n') ? 1 : 0);
    const numbers = Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1).join('\n');
    code = `<div class="code"><pre class="gutter" aria-hidden="true">${numbers}</pre><pre><code id="content" class="hljs">${highlighted}</code></pre></div>`;
  } else {
    code = `<div class="code"><pre class="wrap" id="content">${escapeHtml(paste.content)}</pre></div>`;
  }

  // Owners can edit and delete; once the last view is used the paste is gone, so there's nothing to manage.
  const ownerTools = paste.isOwner && remaining !== 0
    ? `<a class="btn" href="/edit/${paste.id}">${ICONS.edit}<span>Edit</span></a>
    <button class="btn danger" id="delete" type="button" data-id="${paste.id}">${ICONS.trash}<span>Delete</span></button>`
    : '';

  return layout(`${title} · Pastebin Lite`, `
<div class="head">
  <div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${author}<span>${time(paste.createdAt)}</span>${paste.updatedAt ? `<span>Edited ${time(paste.updatedAt)}</span>` : ''}<span>${bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`}</span></div>
  </div>
  <div class="tools">
    ${ownerTools}
    <button class="btn" id="copy" type="button">${ICONS.copy}<span>Copy</span></button>
    <button class="btn" id="download" type="button" data-filename="${escapeHtml(filename)}">${ICONS.download}<span>Download</span></button>
    ${rawLink}
    <button class="btn" id="clone" type="button" data-title="${escapeHtml(paste.title ?? '')}" data-language="${escapeHtml(paste.language)}">${ICONS.clone}<span>Clone</span></button>
  </div>
</div>
<div class="card">
  <div class="bar">${chips.join('')}</div>
  ${notice}
  ${code}
</div>`, ctx);
}

export function renderLocked(id, wrongPassword, ctx) {
  return layout('Password required · Pastebin Lite', `
<div class="card center">
  <div class="badge lock">${ICONS.bigLock}</div>
  <h1>Password required</h1>
  <p>This paste is protected. Enter the password to view it.</p>
  <form class="unlock" method="post" action="/p/${id}">
    <input type="password" name="password" placeholder="Password" aria-label="Password" required autofocus autocomplete="off">
    ${wrongPassword ? '<p class="error" role="alert">Incorrect password. Please try again.</p>' : ''}
    <button class="btn primary" type="submit">Unlock paste</button>
  </form>
</div>`, ctx);
}

export function renderNotFound(ctx) {
  return layout('Paste not available · Pastebin Lite', `
<div class="card center">
  <div class="badge err">${ICONS.x}</div>
  <h1>Paste not available</h1>
  <p>This paste doesn't exist, has expired, or has reached its view limit.</p>
  <a class="btn primary" href="/">Create a new paste</a>
</div>`, ctx);
}
