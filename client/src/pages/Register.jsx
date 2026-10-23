import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export default function Register() {
  const navigate = useNavigate();
  const [pricing, setPricing] = useState({ unitPrice: 249, category: 'EARLY_BIRD', label: 'Early Bird (Till 25 Oct)' });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    participantCount: 2,
    place: '',
    state: 'Andhra Pradesh',
    district: 'NTR'
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    api.getPricing()
      .then(data => {
        if (data.available !== false) {
          setPricing(data);
        }
      })
      .catch(err => console.error('Error fetching pricing:', err));
  }, []);

  const validate = () => {
    const errs = {};
    if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
      errs.fullName = 'Full name must be at least 2 characters';
    }

    const cleanPhone = formData.phone.replace(/[\s-]/g, '');
    const phoneRegex = /^(\+91)?[6-9]\d{9}$/;
    if (!cleanPhone || !phoneRegex.test(cleanPhone)) {
      errs.phone = 'Enter valid 10-digit mobile number';
    }

    if (!formData.participantCount || formData.participantCount < 1) {
      errs.participantCount = 'Min 1 participant required';
    }

    if (!formData.place.trim()) {
      errs.place = 'Place / Town is required';
    }

    if (!formData.state.trim()) {
      errs.state = 'State is required';
    }

    if (!formData.district.trim()) {
      errs.district = 'District is required';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleCountChange = (delta) => {
    setFormData(prev => {
      const nextVal = Math.max(1, Math.min(50, prev.participantCount + delta));
      return { ...prev, participantCount: nextVal };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        fullName: formData.fullName.trim(),
        phone: formData.phone.replace(/[\s-]/g, ''),
        participantCount: parseInt(formData.participantCount, 10),
        place: formData.place.trim(),
        state: formData.state.trim(),
        district: formData.district.trim()
      };

      const res = await api.register(payload);
      const token = res.registration?.access_token || res.registration?.accessToken;
      if (token) {
        navigate(`/payment/${token}`);
      } else {
        throw new Error('Registration token missing');
      }
    } catch (err) {
      console.error('Registration failed:', err);
      setServerError(err.message || 'Registration failed. Please check inputs and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmount = formData.participantCount * (pricing?.unitPrice || 249);

  return (
    <div style={{
      minHeight: '100vh',
      padding: '4rem 1.5rem 5rem',
      backgroundImage: 'radial-gradient(circle at center, rgba(18, 14, 24, 0.92) 0%, #08080c 100%), url(/assets/spooky-ghost.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative'
    }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
        {/* Header Title matching reference Screen 2 */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 className="horror-title" style={{ fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
            SPOOKTACULAR HALLOWEEN PARTY
          </h1>
          <div className="distressed-pill">
            REGISTRATION
          </div>
        </div>

        {/* Form Container Card matching reference */}
        <div style={{
          background: 'rgba(14, 14, 20, 0.92)',
          border: '1px solid #ff450055',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 15px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(255, 69, 0, 0.15)',
          backdropFilter: 'blur(12px)'
        }}>
          {serverError && (
            <div style={{
              background: 'rgba(220, 38, 38, 0.15)',
              border: '1px solid #dc2626',
              color: '#fca5a5',
              padding: '0.85rem',
              borderRadius: '8px',
              marginBottom: '1.25rem',
              fontSize: '0.88rem'
            }}>
              ⚠️ {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Full Name */}
            <div className="form-group">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
                  👤
                </span>
                <input
                  name="fullName"
                  type="text"
                  placeholder="Full Name (Primary Registrant)"
                  value={formData.fullName}
                  onChange={handleChange}
                  className={`form-input ${errors.fullName ? 'error' : ''}`}
                  style={{ paddingLeft: '2.8rem' }}
                  required
                />
              </div>
              {errors.fullName && <div className="form-error">⚠️ {errors.fullName}</div>}
            </div>

            {/* Mobile Number */}
            <div className="form-group">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
                  📞
                </span>
                <input
                  name="phone"
                  type="tel"
                  placeholder="Mobile Number"
                  value={formData.phone}
                  onChange={handleChange}
                  className={`form-input ${errors.phone ? 'error' : ''}`}
                  style={{ paddingLeft: '2.8rem' }}
                  required
                />
              </div>
              {errors.phone && <div className="form-error">⚠️ {errors.phone}</div>}
            </div>

            {/* Number of participants with minus and plus buttons matching reference */}
            <div className="form-group">
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-darker)',
                border: '1px solid var(--border-dark)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.5rem 1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#9ca3af', fontSize: '0.9rem' }}>
                  <span>👥</span>
                  <span>Number of Participants</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => handleCountChange(-1)}
                    disabled={formData.participantCount <= 1}
                    style={{
                      width: '32px',
                      height: '32px',
                      background: '#1f1f2e',
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#ff8c33',
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    -
                  </button>
                  <span style={{
                    minWidth: '28px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-heading)',
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    color: '#fff'
                  }}>
                    {formData.participantCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCountChange(1)}
                    disabled={formData.participantCount >= 50}
                    style={{
                      width: '32px',
                      height: '32px',
                      background: '#1f1f2e',
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#ff8c33',
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
              {errors.participantCount && <div className="form-error">⚠️ {errors.participantCount}</div>}
            </div>

            {/* Place / Town */}
            <div className="form-group">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
                  📍
                </span>
                <input
                  name="place"
                  type="text"
                  placeholder="Place / Town"
                  value={formData.place}
                  onChange={handleChange}
                  className={`form-input ${errors.place ? 'error' : ''}`}
                  style={{ paddingLeft: '2.8rem' }}
                  required
                />
              </div>
              {errors.place && <div className="form-error">⚠️ {errors.place}</div>}
            </div>

            {/* State */}
            <div className="form-group">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
                  🗺️
                </span>
                <input
                  name="state"
                  type="text"
                  placeholder="State"
                  value={formData.state}
                  onChange={handleChange}
                  className={`form-input ${errors.state ? 'error' : ''}`}
                  style={{ paddingLeft: '2.8rem' }}
                  required
                />
              </div>
              {errors.state && <div className="form-error">⚠️ {errors.state}</div>}
            </div>

            {/* District */}
            <div className="form-group">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
                  📌
                </span>
                <input
                  name="district"
                  type="text"
                  placeholder="District"
                  value={formData.district}
                  onChange={handleChange}
                  className={`form-input ${errors.district ? 'error' : ''}`}
                  style={{ paddingLeft: '2.8rem' }}
                  required
                />
              </div>
              {errors.district && <div className="form-error">⚠️ {errors.district}</div>}
            </div>

            {/* PRICE DETAILS Section matching reference */}
            <div style={{
              marginTop: '1.75rem',
              paddingTop: '1.25rem',
              borderTop: '1px dashed #ff450044'
            }}>
              <div style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '0.85rem',
                fontWeight: 800,
                color: '#ff8c33',
                textAlign: 'center',
                letterSpacing: '2px',
                marginBottom: '1rem',
                textTransform: 'uppercase'
              }}>
                PRICE DETAILS
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.4rem 0', fontSize: '0.9rem' }}>
                <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>📅</span> Registration Type
                </span>
                <span style={{ color: '#f3f4f6', fontWeight: 600 }}>
                  {pricing?.label || 'Early Bird (Till 25 Oct)'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.4rem 0', fontSize: '0.9rem' }}>
                <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>🎟️</span> Price per Person
                </span>
                <span style={{ color: '#ff8c33', fontWeight: 700 }}>
                  ₹{pricing?.unitPrice || 249}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.4rem 0', fontSize: '0.9rem' }}>
                <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>👥</span> Number of Participants
                </span>
                <span style={{ color: '#f3f4f6', fontWeight: 600 }}>
                  {formData.participantCount}
                </span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                margin: '1rem 0 0.5rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid rgba(255,255,255,0.08)'
              }}>
                <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>🛡️</span> Total Amount
                </span>
                <span style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.75rem',
                  fontWeight: 900,
                  color: '#ef4444',
                  textShadow: '0 0 10px rgba(239, 68, 68, 0.4)'
                }}>
                  ₹{totalAmount}
                </span>
              </div>
            </div>

            {/* Proceed to Payment Button */}
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-block btn-lg"
              style={{
                marginTop: '1.5rem',
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
              {submitting ? 'Creating Payment Session...' : 'Proceed to Payment ➔'}
            </button>
          </form>
        </div>

        {/* Step Indicator matching reference: (1) Registration -> (2) Payment -> (3) Get Ticket */}
        <div className="step-indicator">
          <div className="step-node active">
            <div className="step-circle">1</div>
            <span>Registration</span>
          </div>
          <div style={{ color: '#4b5563' }}>➔</div>
          <div className="step-node">
            <div className="step-circle">2</div>
            <span>Payment</span>
          </div>
          <div style={{ color: '#4b5563' }}>➔</div>
          <div className="step-node">
            <div className="step-circle">3</div>
            <span>Get Ticket</span>
          </div>
        </div>
      </div>
    </div>
  );
}
