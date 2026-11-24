import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

// Only allow redirects to paths on this site (prevents open redirects via ?next=//evil.example or /\evil.example).
const safeNext = (next) => (next && /^\/(?![/\\])/.test(next) && !next.includes('\\') ? next : '/dashboard');

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [fields, setFields] = useState({ username: '', email: '', login: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.value }));

  if (user) return <Navigate to={next} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (isSignup && fields.password.length < 8) return setError('Password must be at least 8 characters.');
    setSubmitting(true);
    setError(null);
    try {
      if (isSignup) await signup({ username: fields.username.trim(), email: fields.email.trim(), password: fields.password });
      else await login({ login: fields.login.trim(), password: fields.password });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  const otherLink = `${isSignup ? '/login' : '/signup'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <section className="auth">
      <div className="card auth-card">
        <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted">
          {isSignup ? 'Keep track of your pastes, make them private, and get a public profile.' : 'Log in to manage your pastes.'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {isSignup ? (
            <>
              <div className="field">
                <label className="legend" htmlFor="username">Username</label>
                <input id="username" autoComplete="username" required value={fields.username} onChange={set('username')} placeholder="e.g. ada_lovelace" />
                <p className="help">3–24 characters: letters, numbers, _ or -</p>
              </div>
              <div className="field">
                <label className="legend" htmlFor="email">Email</label>
                <input id="email" type="email" autoComplete="email" required value={fields.email} onChange={set('email')} placeholder="you@example.com" />
              </div>
            </>
          ) : (
            <div className="field">
              <label className="legend" htmlFor="login">Username or email</label>
              <input id="login" autoComplete="username" required value={fields.login} onChange={set('login')} autoFocus />
            </div>
          )}
          <div className="field">
            <label className="legend" htmlFor="password">Password</label>
            <input
              id="password" type="password" required value={fields.password} onChange={set('password')}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
            {isSignup && <p className="help">At least 8 characters.</p>}
          </div>

          {error && <div className="alert" role="alert">{error}</div>}

          <button className="button primary block" type="submit" disabled={submitting}>
            {submitting ? <><span className="spinner" aria-hidden="true" /> Please wait…</> : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          {isSignup ? 'Already have an account?' : 'New here?'} <Link to={otherLink}>{isSignup ? 'Log in' : 'Create an account'}</Link>
        </p>
      </div>
    </section>
  );
}
