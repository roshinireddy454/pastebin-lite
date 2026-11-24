import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { SearchIcon } from '../icons.jsx';
import { Pager, PasteList } from '../components/PasteList.jsx';

export default function ArchivePage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [input, setInput] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Debounce typing into the URL (?q=...), which drives the request.
  useEffect(() => {
    const t = setTimeout(() => {
      if (input.trim() !== q) setParams(input.trim() ? { q: input.trim() } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [input, q, setParams]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.publicPastes({ q, page })
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [q, page]);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Public archive</h1>
          <p className="muted">Recently shared public pastes. Unlisted and private pastes never appear here.</p>
        </div>
      </div>

      <div className="search">
        <SearchIcon />
        <input type="search" placeholder="Search by title…" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Search pastes" />
      </div>

      {error && <div className="alert" role="alert">{error}</div>}
      {!data && !error && <div className="loading">Loading…</div>}
      {data && (
        <div className="card">
          <PasteList pastes={data.pastes} empty={q ? `No public pastes match “${q}”.` : 'No public pastes yet.'} />
        </div>
      )}
      {data && (
        <Pager
          page={page} hasMore={data.has_more}
          onChange={(p) => setParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}
        />
      )}
    </section>
  );
}
