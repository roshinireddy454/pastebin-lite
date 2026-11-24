import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formatSize, fullDate, plural, relativeTime } from '../format.js';
import { languageName } from '../languages.js';
import { CheckIcon, CopyIcon, EditIcon, GlobeIcon, LinkIcon, LockIcon, PlusIcon, TrashIcon } from '../icons.jsx';
import { confirmOpen, Pager } from '../components/PasteList.jsx';

const VIS = { public: [GlobeIcon, 'Public'], unlisted: [LinkIcon, 'Unlisted'], private: [LockIcon, 'Private'] };
const STATUS = { active: 'Active', expired: 'Expired', used_up: 'Views used up' };

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <Dashboard user={user} />;
}

function Dashboard({ user }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState(location.state?.flash ?? null);

  // Show a one-time message passed by the edit page, then clear it so a refresh doesn't repeat it.
  useEffect(() => {
    if (location.state?.flash) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const load = useCallback(() => {
    setError(null);
    api.myPastes(page).then(setData).catch((err) => setError(err.message));
  }, [page]);
  useEffect(load, [load]);

  async function remove(p) {
    if (!window.confirm(`Delete "${p.title || 'Untitled'}"? This can't be undone.`)) return;
    try {
      await api.deletePaste(p.id);
      setFlash(`Deleted “${p.title || 'Untitled'}”.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>My pastes</h1>
          <p className="muted">Signed in as <strong>{user.username}</strong></p>
        </div>
        <Link className="button primary" to="/"><PlusIcon /> New paste</Link>
      </div>

      {data && (
        <div className="stats">
          <Stat label="Total pastes" value={data.stats.total} />
          <Stat label="Active" value={data.stats.active} />
          <Stat label="Total views" value={data.stats.views} />
        </div>
      )}

      {flash && <div className="notice-success" role="status"><CheckIcon size={16} /> {flash}</div>}
      {error && <div className="alert" role="alert">{error}</div>}
      {!data && !error && <div className="loading">Loading…</div>}

      {data && (data.pastes.length === 0 && page === 1 ? (
        <div className="card empty-state">
          <p>You haven't created any pastes yet.</p>
          <Link className="button primary" to="/">Create your first paste</Link>
        </div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Visibility</th>
                <th>Views</th>
                <th>Expires</th>
                <th>Created</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.pastes.map((p) => <Row key={p.id} paste={p} onDelete={() => remove(p)} />)}
            </tbody>
          </table>
        </div>
      ))}

      {data && <Pager page={page} hasMore={data.has_more} onChange={setPage} />}
    </section>
  );
}

const Stat = ({ label, value }) => (
  <div className="stat card">
    <span className="stat-value">{value.toLocaleString()}</span>
    <span className="stat-label">{label}</span>
  </div>
);

function Row({ paste: p, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [Icon, visLabel] = VIS[p.visibility] ?? VIS.unlisted;
  const active = p.status === 'active';

  const copy = async () => {
    await navigator.clipboard.writeText(p.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <tr className={active ? '' : 'inactive'}>
      <td>
        {active ? (
          <a className="paste-title" href={`/p/${p.id}`} onClick={(e) => confirmOpen(e, p)}>
            {p.has_password && <LockIcon />}{p.title || <span className="untitled">Untitled</span>}
          </a>
        ) : (
          <span className="paste-title">{p.title || <span className="untitled">Untitled</span>}</span>
        )}
        <div className="paste-meta"><span className="lang">{languageName(p.language)}</span><span>{formatSize(p.size)}</span></div>
      </td>
      <td><span className="vis"><Icon /> {visLabel}</span></td>
      <td>{p.max_views === null ? plural(p.views, 'view') : `${p.views} / ${p.max_views}`}</td>
      <td title={p.expires_at ? fullDate(p.expires_at) : undefined}>{p.expires_at ? relativeTime(p.expires_at) : 'Never'}</td>
      <td title={fullDate(p.created_at)}>{relativeTime(p.created_at)}</td>
      <td><span className={`status ${p.status}`}>{STATUS[p.status]}</span></td>
      <td className="row-actions">
        {active && (
          <>
            <button className="icon-button small" type="button" onClick={copy} title="Copy link" aria-label="Copy link">
              {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
            </button>
            <Link className="icon-button small" to={`/edit/${p.id}`} title="Edit" aria-label="Edit paste"><EditIcon /></Link>
          </>
        )}
        <button className="icon-button small danger" type="button" onClick={onDelete} title="Delete" aria-label="Delete paste">
          <TrashIcon />
        </button>
      </td>
    </tr>
  );
}
