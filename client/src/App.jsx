import { useEffect, useRef, useState } from 'react';
import { createPaste } from './api.js';
import { useTheme } from './theme.js';
import { CheckIcon, ClockIcon, CopyIcon, EyeIcon, Logo, MoonIcon, SunIcon } from './icons.jsx';

const EXPIRY_OPTIONS = [
  { label: 'Never', seconds: 0 },
  { label: '10 min', seconds: 10 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '1 week', seconds: 7 * 24 * 60 * 60 },
  { label: 'Custom', seconds: -1 },
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
  const [theme, toggleTheme] = useTheme();
  const [result, setResult] = useState(null);

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="/"><Logo /> <span>Pastebin Lite</span></a>
        <button
          className="icon-button" type="button" onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main className="container">
        {result ? (
          <Result result={result} onNew={() => setResult(null)} />
        ) : (
          <>
            <section className="hero">
              <h1>Share text in seconds</h1>
              <p>Paste anything, get a link. Optionally make it disappear after a set time or number of views.</p>
            </section>
            <CreateForm onCreated={setResult} />
          </>
        )}
      </main>

      <footer className="footer">Links are unguessable · Expired pastes can't be recovered</footer>
    </div>
  );
}

function CreateForm({ onCreated }) {
  const [content, setContent] = useState('');
  const [expiry, setExpiry] = useState(0);
  const [customValue, setCustomValue] = useState('30');
  const [customUnit, setCustomUnit] = useState('minutes');
  const [maxViews, setMaxViews] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const problem = validate({ content, expiry, customValue, maxViews });
    if (problem) return setError(problem);

    const ttlSeconds = expiry === -1 ? Number(customValue) * UNIT_SECONDS[customUnit] : expiry;
    const views = maxViews ? Number(maxViews) : null;
    setSubmitting(true);
    setError(null);
    try {
      const data = await createPaste({ content, ttlSeconds, maxViews: views });
      onCreated({ ...data, ttlSeconds, maxViews: views, createdAt: Date.now() });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <div className="editor">
        <div className="editor-bar">
          <label htmlFor="content">Content</label>
          <span>{content.length.toLocaleString()} characters</span>
        </div>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(e);
          }}
          placeholder="Paste or type your text here…"
          spellCheck={false}
          autoFocus
        />
      </div>

      <div className="settings">
        <fieldset className="setting">
          <legend>Expires after</legend>
          <div className="pills" role="group">
            {EXPIRY_OPTIONS.map((o) => (
              <button
                key={o.seconds} type="button"
                className={`pill${expiry === o.seconds ? ' active' : ''}`}
                aria-pressed={expiry === o.seconds}
                onClick={() => setExpiry(o.seconds)}
              >
                {o.label}
              </button>
            ))}
          </div>
          {expiry === -1 && (
            <div className="custom-row">
              <input
                type="number" min="1" step="1" inputMode="numeric" aria-label="Custom expiry amount"
                className="custom-amount" value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
              />
              <select aria-label="Custom expiry unit" className="custom-unit" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)}>
                {Object.keys(UNIT_SECONDS).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
        </fieldset>

        <div className="setting">
          <label className="legend" htmlFor="maxViews">Max views</label>
          <input
            id="maxViews" type="number" min="1" step="1" inputMode="numeric" placeholder="Unlimited"
            value={maxViews} onChange={(e) => setMaxViews(e.target.value)}
          />
          <p className="help">Leave empty for unlimited views.</p>
        </div>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="submit-row">
        <span className="kbd-hint"><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd></span>
        <button className="button primary" type="submit" disabled={submitting}>
          {submitting ? <><span className="spinner" aria-hidden="true" /> Creating…</> : 'Create paste'}
        </button>
      </div>
    </form>
  );
}

function formatDuration(seconds) {
  const units = [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  for (const [name, size] of units) {
    if (seconds % size === 0) {
      const n = seconds / size;
      return `${n} ${name}${n === 1 ? '' : 's'}`;
    }
  }
  return `${seconds} seconds`;
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

  const expiresAt = result.ttlSeconds ? new Date(result.createdAt + result.ttlSeconds * 1000) : null;

  return (
    <section className="card result">
      <div className="success-badge"><CheckIcon width={22} height={22} /></div>
      <h1>Your paste is ready</h1>
      <p className="muted">Share this link. Anyone who has it can view the paste.</p>

      <div className="share">
        <input ref={inputRef} readOnly value={result.url} onFocus={(e) => e.target.select()} aria-label="Share URL" />
        <button className="button primary" type="button" onClick={copy}>
          {copied ? <><CheckIcon width={16} height={16} /> Copied</> : <><CopyIcon /> Copy link</>}
        </button>
      </div>

      <div className="chips">
        <span className="chip">
          <ClockIcon />
          {expiresAt ? `Expires in ${formatDuration(result.ttlSeconds)} · ${expiresAt.toLocaleString()}` : 'Never expires'}
        </span>
        <span className="chip">
          <EyeIcon />
          {result.maxViews ? `${result.maxViews} view${result.maxViews === 1 ? '' : 's'} allowed` : 'Unlimited views'}
        </span>
      </div>
      {result.maxViews && <p className="help center">Opening the link yourself uses one of the views.</p>}

      <div className="actions">
        <a className="button" href={result.url} target="_blank" rel="noreferrer">Open paste</a>
        <button className="button" type="button" onClick={onNew}>Create another</button>
      </div>
    </section>
  );
}
