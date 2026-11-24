import { useEffect, useRef, useState } from 'react';
import { createPaste } from './api.js';

const EXPIRY_OPTIONS = [
  { label: 'Never', seconds: 0 },
  { label: '10 minutes', seconds: 10 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '1 week', seconds: 7 * 24 * 60 * 60 },
  { label: 'Custom…', seconds: -1 },
];
const UNIT_SECONDS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
const MAX_CONTENT_BYTES = 512 * 1024;
const MAX_VIEWS = 1_000_000_000;

const byteLength = (s) => new TextEncoder().encode(s).length;
const isPositiveInt = (s) => /^\d+$/.test(s) && Number(s) >= 1;

function validate({ content, expiry, customValue, maxViews }) {
  if (!content.trim()) return 'Enter some content to share.';
  if (byteLength(content) > MAX_CONTENT_BYTES) return 'Content is too large (max 512 KB).';
  if (expiry === -1 && !isPositiveInt(customValue)) return 'Custom expiry must be a whole number of at least 1.';
  if (maxViews !== '' && (!isPositiveInt(maxViews) || Number(maxViews) > MAX_VIEWS)) {
    return 'Max views must be a whole number of at least 1.';
  }
  return null;
}

export default function App() {
  const [content, setContent] = useState('');
  const [expiry, setExpiry] = useState(0);
  const [customValue, setCustomValue] = useState('30');
  const [customUnit, setCustomUnit] = useState('minutes');
  const [maxViews, setMaxViews] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === 'submitting') return;
    const form = { content, expiry, customValue, customUnit, maxViews };
    const problem = validate(form);
    if (problem) return setError(problem);

    const ttlSeconds = expiry === -1 ? Number(customValue) * UNIT_SECONDS[customUnit] : expiry;
    setStatus('submitting');
    setError(null);
    try {
      const data = await createPaste({ content, ttlSeconds, maxViews: maxViews ? Number(maxViews) : null });
      setResult({ ...data, ttlSeconds, maxViews: maxViews ? Number(maxViews) : null });
    } catch (err) {
      setError(err.message);
    } finally {
      setStatus('idle');
    }
  }

  function reset() {
    setResult(null);
    setContent('');
    setMaxViews('');
    setExpiry(0);
  }

  return (
    <main className="container">
      <header className="header">
        <a className="brand" href="/">Pastebin Lite</a>
        <span className="tagline">Share text with a link</span>
      </header>

      {result ? (
        <Result result={result} onNew={reset} />
      ) : (
        <form className="card" onSubmit={handleSubmit} noValidate>
          <label className="label" htmlFor="content">Content</label>
          <textarea
            id="content"
            className="textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(e);
            }}
            placeholder="Paste or type your text here…"
            spellCheck={false}
            autoFocus
          />
          <div className="hint">{content.length.toLocaleString()} characters · Ctrl/⌘ + Enter to create</div>

          <div className="options">
            <div className="field">
              <label className="label" htmlFor="expiry">Expires after</label>
              <select id="expiry" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.seconds} value={o.seconds}>{o.label}</option>
                ))}
              </select>
              {expiry === -1 && (
                <div className="inline">
                  <input
                    type="number" min="1" step="1" inputMode="numeric" aria-label="Custom expiry amount"
                    value={customValue} onChange={(e) => setCustomValue(e.target.value)}
                  />
                  <select aria-label="Custom expiry unit" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)}>
                    {Object.keys(UNIT_SECONDS).map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="maxViews">Max views</label>
              <input
                id="maxViews" type="number" min="1" step="1" inputMode="numeric" placeholder="Unlimited"
                value={maxViews} onChange={(e) => setMaxViews(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="error" role="alert">{error}</p>}

          <button className="button primary" type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Creating…' : 'Create paste'}
          </button>
        </form>
      )}
    </main>
  );
}

function describeLimits({ ttlSeconds, maxViews }) {
  const parts = [];
  if (ttlSeconds) parts.push(`expires ${new Date(Date.now() + ttlSeconds * 1000).toLocaleString()}`);
  if (maxViews) parts.push(`can be viewed ${maxViews} time${maxViews === 1 ? '' : 's'}`);
  return parts.length ? `This paste ${parts.join(' and ')}.` : 'This paste never expires.';
}

function Result({ result, onNew }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.url);
    } catch {
      inputRef.current?.select(); // clipboard API unavailable: select so the user can copy manually
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="card">
      <h1 className="title">Paste created</h1>
      <p className="muted">{describeLimits(result)} Opening the link counts as a view.</p>
      <div className="share">
        <input ref={inputRef} className="url" readOnly value={result.url} onFocus={(e) => e.target.select()} aria-label="Share URL" />
        <button className="button primary" type="button" onClick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
      </div>
      <div className="actions">
        <a className="button" href={result.url} target="_blank" rel="noreferrer">Open paste</a>
        <button className="button" type="button" onClick={onNew}>Create another</button>
      </div>
    </section>
  );
}
