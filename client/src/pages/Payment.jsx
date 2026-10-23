import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { useMusic } from '../context/MusicContext';

export default function Payment() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { triggerJumpScareAudio } = useMusic();

  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState(null);
  const [paymentSession, setPaymentSession] = useState(null);
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes in seconds
  const [utrReference, setUtrReference] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isJumpScare, setIsJumpScare] = useState(false);

  const UPI_ID = 'mohith.deepu@ybl';

  const fetchRegistration = async () => {
    try {
      setLoading(true);
      const data = await api.getRegistration(token);
      setRegistration(data.registration);
      setPaymentSession(data.paymentSession);

      // If approved or under review, redirect to ticket confirmation
      if (['PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED', 'UNDER_REVIEW', 'APPROVED'].includes(data.registration.status)) {
        navigate(`/ticket/${token}`);
        return;
      }

      if (data.paymentSession && data.paymentSession.expiresAt) {
        const remaining = Math.max(0, Math.floor((new Date(data.paymentSession.expiresAt) - new Date()) / 1000));
        setTimeLeft(remaining);
      }
    } catch (err) {
      console.error('Fetch registration error:', err);
      setErrorMessage(err.message || 'Failed to load registration details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchRegistration();
    }
  }, [token]);

  // Server-persisted 3-minute timer countdown
  useEffect(() => {
    if (timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft]);

  // Subtle periodic ghost jump-scare animation every 22 seconds with synchronized audio cue
  useEffect(() => {
    const jumpScareTimer = setInterval(() => {
      setIsJumpScare(true);
      if (triggerJumpScareAudio) {
        triggerJumpScareAudio();
      }
      setTimeout(() => {
        setIsJumpScare(false);
      }, 1200);
    }, 22000);

    return () => clearInterval(jumpScareTimer);
  }, [triggerJumpScareAudio]);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(UPI_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanUtr = utrReference.trim();
    if (!cleanUtr) {
      setErrorMessage('Please enter your UTR / Transaction Reference Number.');
      return;
    }

    if (cleanUtr.length < 6 || cleanUtr.length > 30) {
      setErrorMessage('Transaction reference must be 6-30 alphanumeric characters.');
      return;
    }

    setSubmitting(true);
    try {
      await api.submitPayment({
        registrationId: registration.id,
        sessionId: paymentSession?.sessionId || paymentSession?.id,
        utrReference: cleanUtr
      });

      // Navigate to ticket view
      navigate(`/ticket/${token}`);
    } catch (err) {
      console.error('Payment submission failed:', err);
      setErrorMessage(err.message || 'Failed to submit payment. Please verify the UTR number.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '8rem 1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', animation: 'spin 1.5s linear infinite' }}>🎃</div>
        <p style={{ color: '#9ca3af', marginTop: '1rem' }}>Loading payment details...</p>
      </div>
    );
  }

  if (!registration) {
    return (
      <div style={{ padding: '8rem 1.5rem', textAlign: 'center' }}>
        <h2 style={{ color: '#ef4444' }}>Registration Not Found</h2>
        <p style={{ color: '#9ca3af', margin: '1rem 0' }}>The access link may be invalid or expired.</p>
        <Link to="/register" className="btn btn-primary">Start New Registration</Link>
      </div>
    );
  }

  const isExpired = timeLeft <= 0 || registration.status === 'EXPIRED';

  // =====================================================
  // SCREEN 5: EXPIRED PAYMENT SCREEN MATCHING REFERENCE
  // =====================================================
  if (isExpired) {
    return (
      <div style={{
        minHeight: '100vh',
        padding: '5rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        backgroundImage: 'radial-gradient(circle at center, rgba(10, 8, 14, 0.75) 0%, #050508 100%), url(/assets/spooky-ghost.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative'
      }}>
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '520px', padding: '2rem' }}>
          {/* Frightening Ghost Image in Center */}
          <div style={{ marginBottom: '1.5rem' }}>
            <img
              src="/assets/spooky-ghost.jpg"
              alt="Hooded Ghost"
              style={{
                width: '180px',
                height: '180px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid #dc2626',
                boxShadow: '0 0 30px rgba(220, 38, 38, 0.7)',
                filter: 'drop-shadow(0 0 15px #ff0000)'
              }}
            />
          </div>

          <h1 className="horror-title" style={{ fontSize: 'clamp(2rem, 6vw, 3rem)', color: '#dc2626', marginBottom: '0.75rem' }}>
            PAYMENT TIME EXPIRED
          </h1>

          <p style={{ color: '#d1d5db', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem' }}>
            Your payment session has expired.<br />
            Please start a new registration to continue.
          </p>

          <Link
            to="/register"
            className="btn btn-danger"
            style={{
              background: '#dc2626',
              color: '#ffffff',
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: '1rem',
              padding: '0.85rem 2rem',
              borderRadius: '50px',
              boxShadow: '0 4px 20px rgba(220, 38, 38, 0.5)',
              textDecoration: 'none'
            }}
          >
            Back to Registration ➔
          </Link>
        </div>
      </div>
    );
  }

  // Calculate mm:ss for 3-minute timer
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const upiPayUrl = `upi://pay?pa=${UPI_ID}&pn=Spooktacular%20Halloween%20Party&am=${registration.total_amount}&cu=INR`;

  // =====================================================
  // SCREEN 3: PAYMENT SCREEN WITH GHOST JUMP-SCARE
  // =====================================================
  return (
    <div style={{
      minHeight: '100vh',
      padding: '3rem 1.5rem 5rem',
      position: 'relative',
      overflow: 'hidden',
      background: '#07070a'
    }}>
      {/* Ghost Background Canvas with Glowing Eyes and Jump-Scare */}
      <div
        className={`ghost-background-canvas ${isJumpScare ? 'jumpscare' : ''}`}
        style={{
          backgroundImage: 'radial-gradient(circle at 75% 40%, rgba(255, 0, 0, 0.25) 0%, transparent 60%), url(/assets/spooky-ghost.jpg)'
        }}
      />

      {/* Spooky Fog / Dark gradient over ghost */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'linear-gradient(90deg, rgba(7,7,10,0.92) 0%, rgba(7,7,10,0.75) 55%, rgba(7,7,10,0.4) 100%)',
        zIndex: 1,
        pointerEvents: 'none'
      }} />

      <div style={{ maxWidth: '960px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
        {/* Header matching reference Screen 3 */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <h1 className="horror-title" style={{ fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
            SPOOKTACULAR HALLOWEEN PARTY
          </h1>
          <div className="distressed-pill">
            PAYMENT
          </div>
        </div>

        {/* Main Content Layout matching Screen 3 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '2rem',
          alignItems: 'start'
        }}>
          {/* Left / Center Card: Registration Info & Payment Form */}
          <div style={{
            background: 'rgba(14, 14, 20, 0.94)',
            border: '1px solid #ff450066',
            borderRadius: '16px',
            padding: '2rem',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 25px rgba(255, 69, 0, 0.2)',
            backdropFilter: 'blur(16px)'
          }}>
            {/* Top Registration Summary matching reference Screen 3 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '0.4rem 1rem',
              paddingBottom: '1rem',
              marginBottom: '1.25rem',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              fontSize: '0.9rem'
            }}>
              <span style={{ color: '#9ca3af' }}>Registration ID</span>
              <strong style={{ color: '#f3f4f6' }}>{registration.id}</strong>

              <span style={{ color: '#9ca3af' }}>Name</span>
              <strong style={{ color: '#f3f4f6' }}>{registration.full_name}</strong>

              <span style={{ color: '#9ca3af' }}>Participants</span>
              <strong style={{ color: '#f3f4f6' }}>{registration.participant_count}</strong>

              <span style={{ color: '#9ca3af', alignSelf: 'center' }}>Total Amount</span>
              <span style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.5rem',
                fontWeight: 900,
                color: '#ef4444',
                textShadow: '0 0 10px rgba(239, 68, 68, 0.4)'
              }}>
                ₹{registration.total_amount}
              </span>
            </div>

            {/* White PhonePe QR Card matching reference Screen 3 */}
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '1.5rem 1rem 1rem',
              textAlign: 'center',
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              margin: '0 auto 1.5rem',
              maxWidth: '320px',
              color: '#111827'
            }}>
              {/* PhonePe Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                marginBottom: '0.75rem',
                color: '#5f259f',
                fontWeight: 800,
                fontSize: '1.2rem',
                fontFamily: 'var(--font-heading)'
              }}>
                <span style={{
                  background: '#5f259f',
                  color: '#fff',
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem'
                }}>
                  पे
                </span>
                <span>PhonePe</span>
              </div>

              {/* QR Image */}
              <div style={{ margin: '0 auto', maxWidth: '210px' }}>
                <img
                  src="/assets/phonepe-qr.png"
                  alt="PhonePe QR Code"
                  style={{
                    width: '100%',
                    borderRadius: '8px',
                    display: 'block'
                  }}
                />
              </div>

              {/* UPI ID Box with One-Click Copy matching reference */}
              <div style={{
                marginTop: '1rem',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '0.45rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.85rem'
              }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>UPI ID</div>
                  <strong style={{ color: '#111827', letterSpacing: '0.5px' }}>{UPI_ID}</strong>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  style={{
                    background: copied ? '#22c55e' : '#5f259f',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              {/* Clickable Mobile UPI Intent button */}
              <div style={{ marginTop: '0.75rem' }}>
                <a
                  href={upiPayUrl}
                  style={{
                    display: 'inline-block',
                    background: '#5f259f',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.4rem 0.8rem',
                    borderRadius: '50px',
                    textDecoration: 'none'
                  }}
                >
                  📱 Pay Directly via UPI App
                </a>
              </div>
            </div>

            {/* Red Warning Banner matching reference */}
            <div style={{
              color: '#ef4444',
              textAlign: 'center',
              fontWeight: 800,
              fontSize: '0.88rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem'
            }}>
              <span>⚠️</span> Scan QR and Pay Exact Amount
            </div>

            {/* Time Left To Complete Payment matching reference Screen 3 */}
            <div style={{
              textAlign: 'center',
              padding: '0.85rem',
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: '12px',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.25rem' }}>
                Time Left to Complete Payment
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontFamily: 'var(--font-heading)',
                fontSize: '2.5rem',
                fontWeight: 900,
                color: '#ef4444',
                lineHeight: 1,
                textShadow: '0 0 15px rgba(239, 68, 68, 0.7)'
              }}>
                <span>🕒</span>
                <span>{formattedTime}</span>
              </div>
            </div>

            {errorMessage && (
              <div style={{
                background: 'rgba(220, 38, 38, 0.15)',
                border: '1px solid #dc2626',
                color: '#fca5a5',
                padding: '0.85rem',
                borderRadius: '8px',
                marginBottom: '1.25rem',
                fontSize: '0.88rem'
              }}>
                ⚠️ {errorMessage}
              </div>
            )}

            {/* UTR Form matching reference Screen 3 */}
            <form onSubmit={handleSubmitPayment}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, color: '#f3f4f6', fontSize: '0.9rem' }}>
                  Enter UTR / Transaction Reference Number
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
                    📄
                  </span>
                  <input
                    type="text"
                    placeholder="Enter UTR / Transaction ID"
                    value={utrReference}
                    onChange={(e) => setUtrReference(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.8rem' }}
                    maxLength={30}
                    required
                  />
                </div>
                <small style={{ color: '#9ca3af', fontSize: '0.78rem', marginTop: '0.35rem', display: 'block' }}>
                  💡 Found in payment receipt/details as "UPI Ref No" or "UTR"
                </small>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary btn-block btn-lg"
                style={{
                  marginTop: '1.25rem',
                  background: 'linear-gradient(135deg, #ff6b00, #ff3b00)',
                  color: '#ffffff',
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.1rem',
                  fontWeight: 900,
                  letterSpacing: '1px',
                  borderRadius: '50px',
                  boxShadow: '0 6px 20px rgba(255, 107, 0, 0.4)'
                }}
              >
                {submitting ? 'Submitting Reference...' : 'Submit Payment ➔'}
              </button>
            </form>
          </div>

          {/* Right Column: Spooky Ghost Text matching Screen 3 */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '2rem 1rem',
            textAlign: 'center'
          }}>
            <h2 className="bloody-warning-text" style={{ marginBottom: '1.5rem' }}>
              PAY NOW<br />BEFORE IT<br />DISAPPEARS...
            </h2>

            <div style={{
              background: 'rgba(10, 10, 15, 0.85)',
              border: '1px solid rgba(255, 69, 0, 0.3)',
              borderRadius: '12px',
              padding: '1.25rem',
              maxWidth: '340px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
            }}>
              <div style={{ color: '#ef4444', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '1px', marginBottom: '0.5rem' }}>
                ⚠️ WHATSAPP DM ONLY, NO CALLS
              </div>
              <p style={{ color: '#9ca3af', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                Need help with payment or UTR? Contact organizers directly:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <a
                  href="https://wa.me/919398494121"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#4ade80', textDecoration: 'none', fontWeight: 700, fontSize: '0.88rem' }}
                >
                  💬 9398494121
                </a>
                <a
                  href="https://wa.me/917569583272"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#4ade80', textDecoration: 'none', fontWeight: 700, fontSize: '0.88rem' }}
                >
                  💬 +91 75695 83272
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
