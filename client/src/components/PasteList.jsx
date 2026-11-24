import { Link } from 'react-router-dom';
import { formatSize, fullDate, relativeTime } from '../format.js';
import { languageName } from '../languages.js';
import { LockIcon } from '../icons.jsx';

/** Opening a paste with a view limit uses up a view, so ask first. */
export function confirmOpen(e, paste) {
  if (paste.max_views === null) return;
  const left = paste.max_views - paste.views;
  if (!window.confirm(`This paste has ${left} view${left === 1 ? '' : 's'} left. Opening it uses one. Continue?`)) e.preventDefault();
}

/** Compact list of paste summaries, used by the archive and profile pages. */
export function PasteList({ pastes, showAuthor = true, empty }) {
  if (pastes.length === 0) return <div className="empty-state">{empty}</div>;
  return (
    <ul className="paste-list">
      {pastes.map((p) => (
        <li key={p.id}>
          <a className="paste-title" href={`/p/${p.id}`} onClick={(e) => confirmOpen(e, p)}>
            {p.has_password && <LockIcon />}
            {p.title || <span className="untitled">Untitled</span>}
          </a>
          <div className="paste-meta">
            <span className="lang">{languageName(p.language)}</span>
            {showAuthor && (p.author ? <Link to={`/u/${encodeURIComponent(p.author)}`}>{p.author}</Link> : <span>Anonymous</span>)}
            <span title={fullDate(p.created_at)}>{relativeTime(p.created_at)}</span>
            <span>{formatSize(p.size)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Pager({ page, hasMore, onChange }) {
  if (page === 1 && !hasMore) return null;
  return (
    <div className="pager">
      <button className="button small" type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Newer</button>
      <span className="muted">Page {page}</span>
      <button className="button small" type="button" disabled={!hasMore} onClick={() => onChange(page + 1)}>Older →</button>
    </div>
  );
}
