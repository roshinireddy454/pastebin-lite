import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatDuration } from '../format.js';
import { languageName } from '../languages.js';
import { CheckIcon, ClockIcon, CopyIcon, EyeIcon, FireIcon, LockIcon } from '../icons.jsx';
import { byteLength, ContentEditor, MAX_CONTENT_BYTES, TitleLanguageRow, VISIBILITY, VisibilityField } from '../components/PasteFields.jsx';

const EXPIRY_OPTIONS = [
  { label: 'Never', seconds: 0 },
  { label: '10 min', seconds: 10 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '1 week', seconds: 7 * 24 * 60 * 60 },
  { label: 'Custom', seconds: -1 },
];
const UNIT_SECONDS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
const MAX_VIEWS = 1_000_000_000;
const isPositiveInt = (s) => /^\d+$/.test(s) && Number(s) >= 1;

const EMPTY = {
  title: '', content: '', language: 'plaintext', expiry: 0, customValue: '30', customUnit: 'minutes',
  maxViews: '', burn: false, visibility: 'unlisted', password: '',
};

function validate(f) {
  if (!f.content.trim()) return 'Enter some content to share.';
  if (byteLength(f.content) > MAX_CONTENT_BYTES) return 'Content is too large (max 512 KB).';
  if (f.expiry === -1 && !isPositiveInt(f.customValue)) return 'Custom expiry must be a whole number of at least 1.';
  if (!f.burn && f.maxViews !== '' && (!isPositiveInt(f.maxViews) || Number(f.maxViews) > MAX_VIEWS)) {
    return 'Max views must be a whole number of at least 1.';
  }
  return null;
}

export default function CreatePage() {
  const { user, loading } = useAuth();
  const [result, setResult] = useState(null);

  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <GuestGate />;
  if (result) return <Result result={result} onNew={() => setResult(null)} />;
  return <CreateForm user={user} onCreated={setResult} />;
}

/** Guests can view pastes but need an account to create them on the website. */
function GuestGate() {
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);
  return (
    <>
      <section className="hero">
        <h1>Share text in seconds</h1>
        <p>Paste code or notes, get a link. Add a title, syntax highlighting, a password, or make it disappear on its own.</p>
      </section>
      <div className="card gate">
        <div className="gate-icon"><LockIcon size={22} /></div>
        <h2>Log in to create a paste</h2>
        <p className="muted">
          Anyone with a link can view a paste. Creating, editing and deleting pastes needs a free account,
          so every paste has an owner who can manage it.
        </p>
        <div className="actions">
          <Link className="button primary" to={`/signup?next=${next}`}>Create a free account</Link>
          <Link className="button" to={`/login?next=${next}`}>Log in</Link>
        </div>
        <p className="help center">Or browse the <Link to="/archive">public archive</Link>.</p>
      </div>
    </>
  );
}

function CreateForm({ user, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [params, setParams] = useSearchParams();
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // "Clone" on a paste page stores its content in sessionStorage and opens /?clone=1.
  useEffect(() => {
    if (params.get('clone') !== '1') return;
    try {
      const data = JSON.parse(sessionStorage.getItem('pastebin:clone') || 'null');
      if (data?.content) {
        setForm((f) => ({ ...f, content: data.content, title: data.title ? `Copy of ${data.title}`.slice(0, 100) : '', language: data.language || 'plaintext' }));
      }
    } catch { /* ignore malformed data */ }
    sessionStorage.removeItem('pastebin:clone');
    setParams({}, { replace: true });
  }, [params, setParams]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const problem = validate(form);
    if (problem) return setError(problem);

    const ttlSeconds = form.expiry === -1 ? Number(form.customValue) * UNIT_SECONDS[form.customUnit] : form.expiry;
    const maxViews = form.burn ? 1 : form.maxViews ? Number(form.maxViews) : null;
    const body = { content: form.content, language: form.language, visibility: form.visibility };
    if (form.title.trim()) body.title = form.title.trim();
    if (ttlSeconds) body.ttl_seconds = ttlSeconds;
    if (maxViews) body.max_views = maxViews;
    if (form.password) body.password = form.password;

    setSubmitting(true);
    setError(null);
    try {
      const data = await api.createPaste(body);
      onCreated({
        ...data, ttlSeconds, maxViews, burn: form.burn, visibility: form.visibility, hasPassword: Boolean(form.password),
        language: form.language, title: form.title.trim(), createdAt: Date.now(),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="hero">
        <h1>Share text in seconds</h1>
        <p>Paste code or notes, get a link. Add a title, syntax highlighting, a password, or make it disappear on its own.</p>
      </section>

      <form className="card" onSubmit={handleSubmit} noValidate>
        <TitleLanguageRow title={form.title} language={form.language} onChange={set} />
        <ContentEditor value={form.content} onChange={(content) => set({ content })} onSubmit={handleSubmit} autoFocus />

        <div className="settings">
          <fieldset className="setting">
            <legend>Expires after</legend>
            <div className="pills" role="group">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.seconds} type="button" className={`pill${form.expiry === o.seconds ? ' active' : ''}`}
                  aria-pressed={form.expiry === o.seconds} onClick={() => set({ expiry: o.seconds })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {form.expiry === -1 && (
              <div className="custom-row">
                <input
                  type="number" min="1" step="1" inputMode="numeric" aria-label="Custom expiry amount" className="custom-amount"
                  value={form.customValue} onChange={(e) => set({ customValue: e.target.value })}
                />
                <select aria-label="Custom expiry unit" className="custom-unit" value={form.customUnit} onChange={(e) => set({ customUnit: e.target.value })}>
                  {Object.keys(UNIT_SECONDS).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            )}
          </fieldset>

          <div className="setting">
            <label className="legend" htmlFor="maxViews">Max views</label>
            <input
              id="maxViews" type="number" min="1" step="1" inputMode="numeric"
              placeholder={form.burn ? '1 (burn after read)' : 'Unlimited'} disabled={form.burn}
              value={form.burn ? '' : form.maxViews} onChange={(e) => set({ maxViews: e.target.value })}
            />
            <label className="toggle">
              <input type="checkbox" checked={form.burn} onChange={(e) => set({ burn: e.target.checked })} />
              <span className="switch" aria-hidden="true" />
              <span><FireIcon /> Burn after read</span>
            </label>
          </div>

          <VisibilityField value={form.visibility} onChange={(visibility) => set({ visibility })} />

          <div className="setting">
            <label className="legend" htmlFor="password">Password <span className="optional">optional</span></label>
            <input
              id="password" type="password" autoComplete="new-password" maxLength={128} placeholder="No password"
              value={form.password} onChange={(e) => set({ password: e.target.value })}
            />
            <p className="help">Viewers must enter it to open the paste.</p>
          </div>
        </div>

        {error && <div className="alert" role="alert">{error}</div>}

        <div className="submit-row">
          <span className="kbd-hint">
            Saving to <strong>{user.username}</strong>'s pastes · <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd>
          </span>
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? <><span className="spinner" aria-hidden="true" /> Creating…</> : 'Create paste'}
          </button>
        </div>
      </form>
    </>
  );
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

  const vis = VISIBILITY.find((v) => v.id === result.visibility);

  return (
    <section className="card result">
      <div className="success-badge"><CheckIcon size={22} /></div>
      <h1>{result.title ? `“${result.title}” is ready` : 'Your paste is ready'}</h1>
      <p className="muted">
        {result.visibility === 'private' ? 'Only you can open this link while logged in.' : 'Share this link. Anyone who has it can view the paste.'}
      </p>

      <div className="share">
        <input ref={inputRef} readOnly value={result.url} onFocus={(e) => e.target.select()} aria-label="Share URL" />
        <button className="button primary" type="button" onClick={copy}>
          {copied ? <><CheckIcon size={16} /> Copied</> : <><CopyIcon /> Copy link</>}
        </button>
      </div>

      <div className="chips">
        <span className="chip">{languageName(result.language)}</span>
        <span className="chip"><vis.icon /> {vis.label}</span>
        <span className="chip"><ClockIcon />{result.ttlSeconds ? `Expires in ${formatDuration(result.ttlSeconds)}` : 'Never expires'}</span>
        <span className="chip">
          {result.burn
            ? <><FireIcon /> Burns after first view</>
            : <><EyeIcon /> {result.maxViews ? `${result.maxViews} view${result.maxViews === 1 ? '' : 's'} allowed` : 'Unlimited views'}</>}
        </span>
        {result.hasPassword && <span className="chip"><LockIcon /> Password protected</span>}
      </div>
      {result.maxViews && <p className="help center">Opening the link yourself uses one of the views.</p>}

      <div className="actions">
        <a className="button" href={result.url} target="_blank" rel="noreferrer">Open paste</a>
        <Link className="button" to={`/edit/${result.id}`}>Edit</Link>
        <button className="button" type="button" onClick={onNew}>Create another</button>
      </div>
    </section>
  );
}
