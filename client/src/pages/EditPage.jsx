import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fullDate, plural, relativeTime } from '../format.js';
import { ClockIcon, EyeIcon, LockIcon } from '../icons.jsx';
import { confirmOpen } from '../components/PasteList.jsx';
import { byteLength, ContentEditor, MAX_CONTENT_BYTES, TitleLanguageRow, VisibilityField } from '../components/PasteFields.jsx';

export default function EditPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <EditForm />;
}

function EditForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    api.getPasteForEdit(id)
      .then((p) => {
        setOriginal(p);
        // passwordMode: keep the current password, set a new one, or remove it.
        setForm({ title: p.title ?? '', content: p.content, language: p.language, visibility: p.visibility, passwordMode: 'keep', password: '' });
      })
      .catch(setLoadError);
  }, [id]);

  if (loadError) {
    return (
      <div className="card center-card">
        <h1>Can't edit this paste</h1>
        <p className="muted">
          {loadError.status === 404 ? "It doesn't exist, isn't yours, or has already expired." : loadError.message}
        </p>
        <Link className="button primary" to="/dashboard">Back to my pastes</Link>
      </div>
    );
  }
  if (!form) return <div className="loading">Loading…</div>;

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (!form.content.trim()) return setError('Content cannot be empty.');
    if (byteLength(form.content) > MAX_CONTENT_BYTES) return setError('Content is too large (max 512 KB).');
    if (form.passwordMode === 'set' && !form.password) return setError('Enter the new password, or choose to keep the current one.');

    // Send only what changed.
    const changes = {};
    if (form.title.trim() !== (original.title ?? '')) changes.title = form.title.trim() || null;
    if (form.content !== original.content) changes.content = form.content;
    if (form.language !== original.language) changes.language = form.language;
    if (form.visibility !== original.visibility) changes.visibility = form.visibility;
    if (form.passwordMode === 'set') changes.password = form.password;
    if (form.passwordMode === 'remove') changes.password = null;
    if (Object.keys(changes).length === 0) return navigate('/dashboard');

    setSaving(true);
    setError(null);
    try {
      await api.updatePaste(id, changes);
      navigate('/dashboard', { state: { flash: `Saved changes to “${form.title.trim() || 'Untitled'}”.` } });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Edit paste</h1>
          <p className="muted">
            Created {relativeTime(original.created_at)}
            {original.updated_at && <> · last edited {relativeTime(original.updated_at)}</>}
          </p>
        </div>
        <a className="button" href={original.url} target="_blank" rel="noreferrer" onClick={(e) => confirmOpen(e, original)}>View paste</a>
      </div>

      <form className="card" onSubmit={handleSubmit} noValidate>
        <TitleLanguageRow title={form.title} language={form.language} onChange={set} />
        <ContentEditor value={form.content} onChange={(content) => set({ content })} onSubmit={handleSubmit} />

        <div className="settings">
          <VisibilityField value={form.visibility} onChange={(visibility) => set({ visibility })} />

          <fieldset className="setting">
            <legend>Password</legend>
            <div className="segmented" role="radiogroup">
              {(original.has_password
                ? [['keep', 'Keep current'], ['set', 'Change'], ['remove', 'Remove']]
                : [['keep', 'No password'], ['set', 'Add password']]
              ).map(([mode, label]) => (
                <button
                  key={mode} type="button" role="radio" aria-checked={form.passwordMode === mode}
                  className={form.passwordMode === mode ? 'active' : ''} onClick={() => set({ passwordMode: mode, password: '' })}
                >
                  {label}
                </button>
              ))}
            </div>
            {form.passwordMode === 'set' && (
              <input
                className="spaced" type="password" autoComplete="new-password" maxLength={128} placeholder="New password" autoFocus
                aria-label="New password" value={form.password} onChange={(e) => set({ password: e.target.value })}
              />
            )}
            {form.passwordMode === 'remove' && <p className="help">Anyone with the link will be able to open it.</p>}
          </fieldset>
        </div>

        <div className="locked-settings">
          <span className="chip">
            <ClockIcon />
            {original.expires_at ? <span title={fullDate(original.expires_at)}>Expires {relativeTime(original.expires_at)}</span> : 'Never expires'}
          </span>
          <span className="chip">
            <EyeIcon />
            {original.max_views === null ? plural(original.views, 'view') : `${original.views} of ${original.max_views} views used`}
          </span>
          <span className="help"><LockIcon /> Expiry and view limit can't be changed after a paste is created.</span>
        </div>

        {error && <div className="alert" role="alert">{error}</div>}

        <div className="submit-row">
          <Link className="button" to="/dashboard">Cancel</Link>
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? <><span className="spinner" aria-hidden="true" /> Saving…</> : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  );
}
