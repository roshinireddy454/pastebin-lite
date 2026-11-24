import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth.jsx';
import Layout from './components/Layout.jsx';
import CreatePage from './pages/CreatePage.jsx';
import EditPage from './pages/EditPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ArchivePage from './pages/ArchivePage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import './styles.css';

const NotFound = () => (
  <div className="card center-card">
    <h1>Page not found</h1>
    <p className="muted">The page you're looking for doesn't exist.</p>
    <Link className="button primary" to="/">Go home</Link>
  </div>
);

// Paste pages (/p/:id, /raw/:id) are rendered by the server, so they're plain links, not routes here.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<CreatePage />} />
            <Route path="login" element={<AuthPage mode="login" />} />
            <Route path="signup" element={<AuthPage mode="signup" />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="edit/:id" element={<EditPage />} />
            <Route path="archive" element={<ArchivePage />} />
            <Route path="u/:username" element={<ProfilePage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
