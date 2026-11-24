const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STYLE = `
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --fg:#1b1f24; --muted:#5d6670; --border:#d9dee3; --accent:#2563eb; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1216; --card:#171b21; --fg:#e6e9ed; --muted:#9aa4ae; --border:#2a3038; --accent:#60a5fa; } }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--fg); }
  main { max-width: 880px; margin: 0 auto; padding: 32px 20px; }
  header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
  .brand { font-weight:700; font-size:18px; color:var(--fg); text-decoration:none; }
  a { color: var(--accent); }
  .card { background:var(--card); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
  .meta { display:flex; gap:20px; flex-wrap:wrap; padding:10px 16px; border-bottom:1px solid var(--border); color:var(--muted); font-size:13px; }
  pre { margin:0; padding:16px; overflow:auto; white-space:pre-wrap; word-break:break-word;
        font:13.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  .empty { padding:40px 16px; text-align:center; }
  .empty h1 { margin:0 0 8px; font-size:22px; }
  .empty p { margin:0 0 16px; color:var(--muted); }
`;

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>
<header><a class="brand" href="/">Pastebin Lite</a><a href="/">New paste</a></header>
${body}
</main></body>
</html>`;
}

export function renderPaste(paste) {
  const meta = [];
  if (paste.expires_at) {
    meta.push(`Expires <time datetime="${paste.expires_at}">${escapeHtml(paste.expires_at.replace('T', ' ').replace(/\.\d+Z$/, ' UTC'))}</time>`);
  }
  if (paste.remaining_views !== null) {
    meta.push(`${paste.remaining_views} view${paste.remaining_views === 1 ? '' : 's'} remaining`);
  }
  if (meta.length === 0) meta.push('Never expires');

  return layout('Paste · Pastebin Lite', `
<div class="card">
  <div class="meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>
  <pre id="content">${escapeHtml(paste.content)}</pre>
</div>`);
}

export function renderNotFound() {
  return layout('Paste not available · Pastebin Lite', `
<div class="card empty">
  <h1>Paste not available</h1>
  <p>This paste doesn't exist, has expired, or has reached its view limit.</p>
  <a href="/">Create a new paste</a>
</div>`);
}
