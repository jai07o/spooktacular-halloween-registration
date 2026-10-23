import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';

export default function AdminLogin({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Please provide both username and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.adminLogin({ username: username.trim(), password });
      if (res.success && res.admin) {
        if (onLoginSuccess) onLoginSuccess(res.admin);
        navigate('/admin/dashboard');
      } else {
        throw new Error('Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ padding: '7rem 1.5rem 4rem', maxWidth: '440px' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <span style={{ fontSize: '2.5rem' }}>🔐</span>
        <h1 className="section-title" style={{ marginTop: '0.5rem', fontSize: '1.8rem' }}>Admin Portal</h1>
        <p className="section-subtitle">
          Spooktacular Halloween Party Operations
        </p>
      </div>

      <div className="card" style={{ border: '1px solid var(--border-orange)', boxShadow: 'var(--shadow-deep)' }}>
        {error && (
          <div style={{
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid var(--fire-red)',
            color: '#fca5a5',
            padding: '0.85rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.25rem',
            fontSize: '0.88rem'
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="adminUsername">Username</label>
            <input
              id="adminUsername"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
              placeholder="e.g. admin"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="adminPassword">Password</label>
            <input
              id="adminPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="••••••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-block btn-lg"
            style={{ marginTop: '1.5rem' }}
          >
            {loading ? 'Authenticating...' : 'Sign In to Dashboard 🔒'}
          </button>
        </form>

        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--border-dark)',
          textAlign: 'center'
        }}>
          <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.85rem' }}>
            ← Return to Public Website
          </Link>
        </div>
      </div>
    </div>
  );
}
