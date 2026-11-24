import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Pager, PasteList } from '../components/PasteList.jsx';

export default function ProfilePage() {
  const { username } = useParams();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => setPage(1), [username]);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.userProfile(username, page)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err));
    return () => { cancelled = true; };
  }, [username, page]);

  if (error?.status === 404) {
    return (
      <div className="card center-card">
        <h1>User not found</h1>
        <p className="muted">There's no user called “{username}”.</p>
        <Link className="button primary" to="/archive">Browse the archive</Link>
      </div>
    );
  }
  if (error) return <div className="alert" role="alert">{error.message}</div>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <section>
      <div className="profile card">
        <span className="avatar large">{data.user.username[0].toUpperCase()}</span>
        <div>
          <h1>{data.user.username}</h1>
          <p className="muted">Member since {new Date(data.user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</p>
        </div>
      </div>

      <h2 className="section-title">Public pastes</h2>
      <div className="card">
        <PasteList pastes={data.pastes} showAuthor={false} empty={`${data.user.username} hasn't shared any public pastes yet.`} />
      </div>
      <Pager page={page} hasMore={data.has_more} onChange={setPage} />
    </section>
  );
}
