import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../utils/api';

export default function TicketValidator() {
  const [searchParams] = useSearchParams();
  const initialTicket = searchParams.get('ticket') || '';

  const [ticketInput, setTicketInput] = useState(initialTicket);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleValidate = async (ticketToValidate) => {
    const num = (ticketToValidate || ticketInput).trim();
    if (!num) {
      setError('Please enter a ticket number');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await api.validateTicket(num);
      setResult(res);
    } catch (err) {
      console.error('Validation error:', err);
      setError(err.message || 'Error occurred while verifying ticket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTicket) {
      handleValidate(initialTicket);
    }
  }, [initialTicket]);

  return (
    <div className="container" style={{ padding: '6rem 1.5rem 4rem', maxWidth: '600px' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <span style={{ fontSize: '2.5rem' }}>🎟️</span>
        <h1 className="section-title" style={{ marginTop: '0.5rem' }}>Ticket Verification</h1>
        <p className="section-subtitle">
          Verify ticket authenticity for Spooktacular Halloween Party 2026
        </p>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <form onSubmit={(e) => { e.preventDefault(); handleValidate(); }}>
          <div className="form-group">
            <label className="form-label" htmlFor="ticketNumberInput">
              Ticket Number, Registration ID, or Phone
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="ticketNumberInput"
                type="text"
                placeholder="e.g. SPH-2026-EE70DDEA, SPH-20261024-XXXXXX, or Phone"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                className="form-input"
                style={{ flex: 1 }}
              />
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Checking...' : 'Verify'}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div style={{
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid var(--fire-red)',
            color: '#fca5a5',
            padding: '1rem',
            borderRadius: 'var(--radius-sm)',
            marginTop: '1rem',
            fontSize: '0.9rem'
          }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Validation Result */}
      {result && (
        <div className="card" style={{
          border: `2px solid ${result.valid ? 'var(--status-approved)' : 'var(--status-rejected)'}`,
          boxShadow: result.valid ? '0 0 30px rgba(34, 197, 94, 0.15)' : '0 0 30px rgba(239, 68, 68, 0.15)',
          padding: '2rem'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '3rem' }}>{result.valid ? '✅' : '❌'}</span>
            <h2 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.5rem',
              color: result.valid ? 'var(--status-approved)' : 'var(--status-rejected)',
              marginTop: '0.5rem'
            }}>
              {result.valid ? 'VALID ENTRY TICKET' : 'INVALID TICKET'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {result.valid ? 'This pass is legitimate and authorized for event entry.' : (result.message || 'No active registration found for this query.')}
            </p>
          </div>

          {result.valid && (
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '1.25rem',
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '0.75rem 1.25rem',
              fontSize: '0.92rem'
            }}>
              <span style={{ color: 'var(--text-muted)' }}>Ticket No:</span>
              <strong style={{ color: 'var(--text-accent)' }}>{result.ticketNumber}</strong>

              {result.registrationId && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>Reg ID:</span>
                  <strong style={{ color: '#9ca3af', fontFamily: 'monospace' }}>{result.registrationId}</strong>
                </>
              )}

              <span style={{ color: 'var(--text-muted)' }}>Attendee Name:</span>
              <strong style={{ color: 'var(--text-white)' }}>{result.name}</strong>

              {result.phone && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>Phone:</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{result.phone}</span>
                </>
              )}

              {result.place && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>Location:</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{result.place}</span>
                </>
              )}

              <span style={{ color: 'var(--text-muted)' }}>Entry Allowance:</span>
              <span><strong>{result.participants}</strong> Person{result.participants > 1 ? 's' : ''}</span>

              <span style={{ color: 'var(--text-muted)' }}>Registration Status:</span>
              <span style={{
                color: result.status === 'APPROVED' || result.status === 'PAYMENT_VERIFIED' ? 'var(--status-approved)' : 'var(--status-pending)',
                fontWeight: 700
              }}>
                {result.status}
              </span>

              {result.issuedAt && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>Issued At:</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {new Date(result.issuedAt).toLocaleString('en-IN')}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Back to Event Homepage
        </Link>
      </div>
    </div>
  );
}
