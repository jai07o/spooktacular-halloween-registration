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
      setError('Please enter a ticket number, registration ID, or phone number');
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

  const isApproved = Boolean(result && (result.valid || result.status === 'VERIFIED' || result.status === 'APPROVED' || result.status === 'PAYMENT_VERIFIED'));
  const isPending = Boolean(result && !isApproved && (result.pendingApproval || result.status === 'PAYMENT_UNDER_REVIEW' || result.status === 'UNDER_REVIEW'));
  const isCancelled = Boolean(result && !isApproved && !isPending && result.status === 'CANCELLED');
  const isNotFound = Boolean(result && !isApproved && !isPending && !isCancelled);

  return (
    <div className="container" style={{ padding: '6rem 1.5rem 4rem', maxWidth: '640px' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <span style={{ fontSize: '2.5rem' }}>🎟️</span>
        <h1 className="section-title" style={{ marginTop: '0.5rem' }}>Ticket Verification</h1>
        <p className="section-subtitle">
          Verify ticket authenticity & status for Spooktacular Halloween Party 2026
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
          border: `2px solid ${
            isApproved
              ? '#22c55e'
              : isPending
              ? '#f59e0b'
              : '#ef4444'
          }`,
          boxShadow: isApproved
            ? '0 0 35px rgba(34, 197, 94, 0.25)'
            : isPending
            ? '0 0 35px rgba(245, 158, 11, 0.25)'
            : '0 0 35px rgba(239, 68, 68, 0.2)',
          padding: '2rem'
        }}>
          {/* Header State */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '3.5rem', display: 'block', marginBottom: '0.5rem' }}>
              {isApproved ? '✅' : isPending ? '⏳' : isCancelled ? '❌' : '🔍'}
            </span>

            <h2 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.55rem',
              fontWeight: 900,
              color: isApproved ? '#22c55e' : isPending ? '#fbbf24' : '#ef4444',
              marginTop: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              {isApproved
                ? 'VERIFIED & APPROVED'
                : isPending
                ? 'PENDING APPROVAL BY ADMIN'
                : isCancelled
                ? 'TICKET CANCELLED'
                : 'TICKET NOT FOUND'}
            </h2>

            <div style={{ marginTop: '0.5rem', marginBottom: '0.75rem' }}>
              {isApproved && (
                <span style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid #22c55e',
                  color: '#4ade80',
                  padding: '0.35rem 0.9rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  letterSpacing: '1px'
                }}>
                  ✓ OFFICIAL ENTRY PASS
                </span>
              )}
              {isPending && (
                <span style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid #f59e0b',
                  color: '#fbbf24',
                  padding: '0.35rem 0.9rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  letterSpacing: '1px'
                }}>
                  ⏳ PAYMENT SUBMITTED — UNDER ADMIN REVIEW
                </span>
              )}
              {isCancelled && (
                <span style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  color: '#f87171',
                  padding: '0.35rem 0.9rem',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  letterSpacing: '1px'
                }}>
                  REVOKED / CANCELLED
                </span>
              )}
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5, margin: '0 auto', maxWidth: '500px' }}>
              {isApproved
                ? 'This ticket is verified and approved by administration. Authorized for event entry.'
                : isPending
                ? 'Payment reference submitted. Your registration is awaiting administrator verification. Once approved, your official ticket will become active and verified.'
                : isCancelled
                ? (result.message || 'This registration has been cancelled or revoked by administration. It is not valid for event entry.')
                : (result.message || 'No ticket or registration matched this query. Please check your ticket number, registration ID, or 10-digit phone number.')}
            </p>
          </div>

          {/* Details Table for Approved or Pending */}
          {(isApproved || isPending || result.name) && (
            <div style={{
              background: 'rgba(0,0,0,0.35)',
              borderRadius: 'var(--radius-sm)',
              padding: '1.25rem',
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '0.75rem 1.25rem',
              fontSize: '0.92rem',
              border: '1px solid rgba(255,255,255,0.06)'
            }}>
              {result.ticketNumber && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>Ticket No:</span>
                  <strong style={{ color: '#ff8c33', fontFamily: 'var(--font-heading)', fontSize: '1.05rem' }}>
                    {result.ticketNumber}
                  </strong>
                </>
              )}

              {result.registrationId && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>Reg ID:</span>
                  <strong style={{ color: '#9ca3af', fontFamily: 'monospace' }}>{result.registrationId}</strong>
                </>
              )}

              {result.name && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>Attendee Name:</span>
                  <strong style={{ color: 'var(--text-white)' }}>{result.name}</strong>
                </>
              )}

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

              {result.participants && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>Entry Allowance:</span>
                  <span><strong>{result.participants}</strong> Person{result.participants > 1 ? 's' : ''}</span>
                </>
              )}

              <span style={{ color: 'var(--text-muted)' }}>Event Date:</span>
              <strong style={{ color: '#e5e7eb' }}>31st October 2026</strong>

              <span style={{ color: 'var(--text-muted)' }}>Venue:</span>
              <span style={{ color: '#d1d5db', fontSize: '0.85rem' }}>MKV Convention, PSCMR CET, Vijayawada</span>

              <span style={{ color: 'var(--text-muted)' }}>Status:</span>
              <span style={{
                color: isApproved ? '#22c55e' : isPending ? '#fbbf24' : '#ef4444',
                fontWeight: 800
              }}>
                {isApproved ? '✓ VERIFIED & APPROVED' : isPending ? '⏳ PENDING APPROVAL BY ADMIN' : result.status}
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

          {/* Action Buttons */}
          <div style={{
            marginTop: '1.75rem',
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}>
            {/* If Approved: Download Original Ticket Button */}
            {isApproved && result.accessToken && (
              <Link
                to={`/ticket/${result.accessToken}`}
                className="btn btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: '#fff',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 800,
                  padding: '0.85rem 2rem',
                  borderRadius: '50px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 20px rgba(34, 197, 94, 0.4)',
                  fontSize: '1rem'
                }}
              >
                📥 Download Original Ticket
              </Link>
            )}

            {/* If Pending: View Status Page & Refresh */}
            {isPending && result.accessToken && (
              <Link
                to={`/ticket/${result.accessToken}`}
                className="btn btn-secondary"
                style={{
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fbbf24',
                  border: '1px solid #f59e0b',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  padding: '0.75rem 1.5rem',
                  borderRadius: '50px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                👁️ View Registration Status
              </Link>
            )}

            {isPending && (
              <button
                type="button"
                onClick={() => handleValidate()}
                className="btn btn-ghost"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#f3f4f6',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  padding: '0.75rem 1.5rem',
                  borderRadius: '50px',
                  border: '1px solid rgba(255,255,255,0.2)'
                }}
              >
                🔄 Refresh Status
              </button>
            )}
          </div>
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
