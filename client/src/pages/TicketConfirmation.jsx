import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../utils/api';
import QrCodeDisplay from '../components/QrCodeDisplay';

export default function TicketConfirmation() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState(null);
  const [error, setError] = useState('');

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const data = await api.getRegistration(token);
      setRegistration(data.registration);
    } catch (err) {
      console.error('Fetch registration error:', err);
      setError(err.message || 'Failed to retrieve ticket information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchStatus();
    }
  }, [token]);

  const handlePrint = () => {
    window.print();
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Spooktacular Halloween Party 2026 Ticket',
        text: `My ticket for Spooktacular Halloween Party 2026 is ready! Pass: ${registration?.ticket_number || registration?.id}`,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Ticket link copied to clipboard!');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '8rem 1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', animation: 'spin 1.5s linear infinite' }}>🎃</div>
        <p style={{ color: '#9ca3af', marginTop: '1rem' }}>Loading your Halloween pass...</p>
      </div>
    );
  }

  if (error || !registration) {
    return (
      <div style={{ padding: '8rem 1.5rem', textAlign: 'center' }}>
        <h2 style={{ color: '#ef4444' }}>Unable to Load Ticket</h2>
        <p style={{ color: '#9ca3af', margin: '1rem 0' }}>{error || 'Registration not found'}</p>
        <Link to="/" className="btn btn-primary">Return to Home</Link>
      </div>
    );
  }

  const isConfirmed = registration.status === 'PAYMENT_VERIFIED' || registration.status === 'APPROVED';
  const isPendingReview = registration.status === 'PAYMENT_UNDER_REVIEW' || registration.status === 'UNDER_REVIEW';
  const isRejected = registration.status === 'PAYMENT_REJECTED' || registration.status === 'REJECTED';
  const isCancelled = registration.status === 'CANCELLED' || (!isPendingReview && !isConfirmed && Boolean(registration.ticket_number) && registration.ticket_is_valid === 0);

  const ticketNumber = registration.ticket_number || `REG-${registration.id.replace('SPH-', '')}`;
  const validationUrl = `${window.location.origin}/lookup?ticket=${ticketNumber}`;

  return (
    <div style={{
      minHeight: '100vh',
      padding: '4rem 1.5rem 5rem',
      backgroundImage: 'radial-gradient(circle at center, rgba(18, 14, 24, 0.95) 0%, #08080c 100%), url(/assets/halloween-hero.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative'
    }}>
      <div style={{ maxWidth: '820px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
        {/* Header matching reference Screen 4 */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="horror-title" style={{ fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
            SPOOKTACULAR HALLOWEEN PARTY
          </h1>
          <div className="distressed-pill">
            {isCancelled ? 'TICKET CANCELLED' : isPendingReview ? 'PENDING APPROVAL BY ADMIN' : isConfirmed ? 'VERIFIED & APPROVED' : 'YOUR TICKET IS READY!'}
          </div>
        </div>

        {/* Cancellation Alert if cancelled */}
        {isCancelled && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '2px solid #ef4444',
            borderRadius: '12px',
            padding: '1.25rem',
            color: '#fca5a5',
            textAlign: 'center',
            marginBottom: '2rem'
          }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>❌ Registration & Ticket Revoked</h3>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>
              {registration.cancellation_reason || 'This registration was cancelled or archived by administration. It is no longer valid for venue entry.'}
            </p>
          </div>
        )}

        {/* Review Notice if pending verification */}
        {isPendingReview && !isCancelled && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '2px solid #f59e0b',
            borderRadius: '12px',
            padding: '1.25rem',
            color: '#fcd34d',
            textAlign: 'center',
            marginBottom: '1.75rem'
          }}>
            <h3 style={{ fontSize: '1.15rem', marginBottom: '0.4rem', color: '#fbbf24', fontWeight: 800 }}>
              ⏳ Payment Submitted — Pending Approval by Admin
            </h3>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#e5e7eb', lineHeight: 1.5 }}>
              Your transaction reference (UTR) has been submitted and is waiting for administrator approval.<br />
              Once approved by admin, your ticket will be marked as <strong style={{ color: '#4ade80' }}>VERIFIED & APPROVED</strong> and ready to download!
            </p>
          </div>
        )}

        {/* =====================================================
            SCREEN 4: HORIZONTAL BOARDING PASS CARD
           ===================================================== */}
        <div className="boarding-pass-card" id="printable-ticket" style={{ opacity: isCancelled ? 0.6 : 1 }}>
          {/* Left section: Jack-o'-lantern artwork + "HALLOWEEN PARTY" */}
          <div className="boarding-pass-left">
            <div className="boarding-pass-left-content">
              <span style={{ fontSize: '3.5rem', display: 'block', marginBottom: '0.5rem', filter: 'drop-shadow(0 0 15px #ff6b00)' }}>
                🎃
              </span>
              <h2 className="horror-title" style={{ fontSize: '1.8rem', color: '#ff6b00', lineHeight: 1, textTransform: 'uppercase' }}>
                HALLOWEEN<br /><span style={{ color: '#fff' }}>PARTY</span>
              </h2>
              <div style={{ fontSize: '0.75rem', color: '#ff8c33', fontWeight: 800, letterSpacing: '2px', marginTop: '0.75rem' }}>
                ENTRY PASS
              </div>
            </div>
          </div>

          {/* Right section: Ticket Details & QR Code matching reference */}
          <div className="boarding-pass-right">
            <div>
              {/* Top row: Ticket Number & Confirmed Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}>
                    {isConfirmed ? 'Official Ticket Number' : 'Registration Reference'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 900, color: '#111827' }}>
                    {ticketNumber}
                  </div>
                </div>

                <div>
                  {isConfirmed && !isCancelled && (
                    <span className="confirmed-badge" style={{ background: '#22c55e', color: '#fff', padding: '0.35rem 0.9rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '1px' }}>
                      ✓ VERIFIED & APPROVED
                    </span>
                  )}
                  {isPendingReview && !isCancelled && (
                    <span style={{
                      background: '#f59e0b',
                      color: '#fff',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      padding: '0.35rem 0.85rem',
                      borderRadius: '6px',
                      letterSpacing: '1px'
                    }}>
                      ⏳ PENDING ADMIN APPROVAL
                    </span>
                  )}
                  {isCancelled && (
                    <span style={{
                      background: '#ef4444',
                      color: '#fff',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      padding: '0.3rem 0.8rem',
                      borderRadius: '6px',
                      letterSpacing: '1px'
                    }}>
                      CANCELLED
                    </span>
                  )}
                </div>
              </div>

              {/* Main Ticket Grid & QR Code */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '1.5rem', alignItems: 'center' }}>
                {/* Details list */}
                <div style={{ flex: '1 1 240px', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase' }}>Name</span>
                    <strong style={{ color: '#111827', fontSize: '1rem' }}>{registration.full_name}</strong>
                  </div>

                  <div>
                    <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase' }}>Participants</span>
                    <strong style={{ color: '#111827' }}>{registration.participant_count} Person{registration.participant_count > 1 ? 's' : ''}</strong>
                  </div>

                  <div>
                    <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase' }}>Date</span>
                    <strong style={{ color: '#111827' }}>31st October 2026</strong>
                  </div>

                  <div>
                    <span style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase' }}>Venue</span>
                    <strong style={{ color: '#111827', fontSize: '0.82rem', lineHeight: 1.3, display: 'block' }}>
                      MKV Convention, PSCMR CET, College Street, Fish Market Area, Vijayawada
                    </strong>
                  </div>
                </div>

                {/* Entry QR Code */}
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <QrCodeDisplay text={validationUrl} size={135} />
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, marginTop: '0.25rem' }}>
                    {isConfirmed ? 'Scan at Entry' : 'Verification QR'}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Slogan matching reference Screen 4 */}
            <div style={{
              marginTop: '1.5rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid #e5e7eb',
              textAlign: 'center',
              fontFamily: 'var(--font-heading)',
              fontSize: '0.78rem',
              fontWeight: 800,
              letterSpacing: '1px',
              color: '#ff6b00'
            }}>
              DRESS SPOOKY • DANCE CRAZY • MAKE MEMORIES
            </div>
          </div>
        </div>

        {/* Buttons Row matching reference Screen 4 */}
        <div className="no-print" style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '1rem',
          marginTop: '2rem'
        }}>
          {isConfirmed && !isCancelled && (
            <button
              onClick={handlePrint}
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff',
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                padding: '0.75rem 1.75rem',
                borderRadius: '50px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              📥 Download Original Ticket
            </button>
          )}

          {isPendingReview && !isCancelled && (
            <button
              onClick={fetchStatus}
              className="btn btn-secondary"
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                border: '1px solid #f59e0b',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                padding: '0.75rem 1.75rem',
                borderRadius: '50px',
                cursor: 'pointer'
              }}
            >
              🔄 Refresh Status
            </button>
          )}

          <button
            onClick={handleShare}
            className="btn btn-ghost"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#f3f4f6',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              padding: '0.75rem 1.5rem',
              borderRadius: '50px',
              border: '1px solid rgba(255,255,255,0.2)',
              cursor: 'pointer'
            }}
          >
            ↗ Share Ticket
          </button>

          <Link
            to="/"
            className="btn btn-ghost"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#f3f4f6',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              padding: '0.75rem 1.5rem',
              borderRadius: '50px',
              border: '1px solid rgba(255,255,255,0.2)',
              textDecoration: 'none'
            }}
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
