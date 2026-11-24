import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useTheme } from '../theme.js';
import { Logo, LogOutIcon, MoonIcon, PlusIcon, SunIcon } from '../icons.jsx';

export default function Layout() {
  const [theme, toggleTheme] = useTheme();
  const { user, loading } = useAuth();

  return (
    <div className="page">
      <header className="topbar">
        <Link className="brand" to="/"><Logo /> <span>Pastebin Lite</span></Link>
        <nav className="nav">
          <NavLink className="nav-link" to="/" end>New paste</NavLink>
          <NavLink className="nav-link" to="/archive">Archive</NavLink>
          {!loading && (user ? (
            <>
              <NavLink className="nav-link" to="/dashboard">My pastes</NavLink>
              <UserMenu />
            </>
          ) : (
            <>
              <NavLink className="nav-link" to="/login">Log in</NavLink>
              <Link className="button small primary" to="/signup">Sign up</Link>
            </>
          ))}
          <button
            className="icon-button" type="button" onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </nav>
      </header>

      <main className="container">
        <Outlet />
      </main>

      <footer className="footer">Pastebin Lite · Share text securely with expiring links</footer>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button className="avatar-button" type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{user.username[0].toUpperCase()}</span>
        <span className="menu-name">{user.username}</span>
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          <div className="menu-header">
            <strong>{user.username}</strong>
            <span>{user.email}</span>
          </div>
          <Link role="menuitem" to="/dashboard">My pastes</Link>
          <Link role="menuitem" to={`/u/${encodeURIComponent(user.username)}`}>Public profile</Link>
          <Link role="menuitem" to="/"><PlusIcon /> New paste</Link>
          <button
            role="menuitem" type="button"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <LogOutIcon /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
