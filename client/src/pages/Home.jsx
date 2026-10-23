import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CountdownTimer from '../components/CountdownTimer';
import api from '../utils/api';

export default function Home() {
  const [pricing, setPricing] = useState(null);

  useEffect(() => {
    api.getPricing()
      .then(data => setPricing(data))
      .catch(err => console.error('Failed to load pricing:', err));
  }, []);

  const highlights = [
    { icon: '🎧', title: 'DJ NIGHT' },
    { icon: '🎮', title: 'GAMES & FUN' },
    { icon: '🎭', title: 'COSTUME CONTEST' },
    { icon: '📸', title: 'PHOTO BOOTH' },
    { icon: '🍔', title: 'FOOD & MORE' }
  ];

  return (
    <div style={{ position: 'relative', overflowX: 'hidden' }}>
      {/* Top Left Floating Badge matching reference Screen 1 */}
      <div style={{
        position: 'absolute',
        top: '1.25rem',
        left: '1.5rem',
        zIndex: 10,
        background: 'rgba(0,0,0,0.85)',
        border: '2px solid #ff4500',
        borderRadius: '10px',
        padding: '0.4rem 0.8rem',
        boxShadow: '0 0 15px rgba(255, 69, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1.1
      }}>
        <span style={{ fontSize: '1.1rem', marginBottom: '2px' }}>🎃</span>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.72rem', fontWeight: 900, color: '#ff6b00', letterSpacing: '1px' }}>
          SPOOKY
        </span>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.72rem', fontWeight: 900, color: '#f3f4f6', letterSpacing: '1px' }}>
          VIBES
        </span>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 800, color: '#ff4500', letterSpacing: '1px' }}>
          GOOD TIMES
        </span>
      </div>

      {/* Main Hero Container */}
      <section style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '5rem 1.5rem 3rem',
        backgroundImage: 'radial-gradient(ellipse at center top, rgba(255, 69, 0, 0.15) 0%, rgba(10, 10, 15, 0.95) 80%), url(/assets/halloween-hero.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat'
      }}>
        {/* Dark overlay for contrast */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(180deg, rgba(8,8,12,0.4) 0%, rgba(8,8,12,0.85) 65%, #08080c 100%)',
          zIndex: 1
        }} />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: '900px', margin: '0 auto' }}>
          {/* Tagline */}
          <p style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'clamp(0.9rem, 2.5vw, 1.25rem)',
            fontWeight: 800,
            color: '#ff8c33',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            marginBottom: '0.5rem',
            textShadow: '0 0 10px rgba(255, 140, 51, 0.6)'
          }}>
            JOIN US FOR A SPOOKTACULAR NIGHT
          </p>

          {/* Big Distressed Title */}
          <h1 className="horror-title" style={{
            fontSize: 'clamp(3rem, 10vw, 6.5rem)',
            lineHeight: 0.95,
            margin: '0.25rem 0 1rem',
            textTransform: 'uppercase'
          }}>
            HALLOWEEN <span style={{ color: '#ff8c33' }}>PARTY</span>
          </h1>

          {/* Highlights Row matching reference Screen 1 */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '0.75rem',
            margin: '1.5rem 0'
          }}>
            {highlights.map((h, i) => (
              <div key={i} style={{
                background: 'rgba(18, 18, 26, 0.85)',
                border: '1px solid #ff450066',
                borderRadius: '8px',
                padding: '0.5rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(6px)'
              }}>
                <span style={{ fontSize: '1.1rem' }}>{h.icon}</span>
                <span style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  color: '#f3f4f6',
                  letterSpacing: '1px'
                }}>
                  {h.title}
                </span>
              </div>
            ))}
          </div>

          {/* Banner Pill */}
          <div style={{
            display: 'inline-block',
            background: 'linear-gradient(90deg, #ff4500, #dc2626)',
            color: '#fff',
            fontFamily: 'var(--font-heading)',
            fontWeight: 800,
            fontSize: 'clamp(0.75rem, 2vw, 0.95rem)',
            letterSpacing: '2px',
            padding: '0.4rem 1.25rem',
            borderRadius: '50px',
            boxShadow: '0 0 15px rgba(255, 69, 0, 0.4)',
            margin: '0.75rem 0 1.5rem'
          }}>
            DRESS SPOOKY • DANCE CRAZY • MAKE MEMORIES
          </div>

          {/* Date and Venue Box matching reference */}
          <div style={{
            background: 'rgba(15, 15, 22, 0.9)',
            border: '1px solid rgba(255, 107, 0, 0.4)',
            borderRadius: '16px',
            padding: '1.25rem',
            maxWidth: '720px',
            margin: '0 auto 1.75rem',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(10px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
            textAlign: 'left'
          }}>
            {/* Date Box */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>📅</span>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 900, color: '#ff8c33', lineHeight: 1 }}>
                  31st OCT 2026
                </div>
                <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.2rem' }}>
                  Gates Open: 6:00 PM IST Onwards
                </div>
              </div>
            </div>

            {/* Venue Box with Map link */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.75rem', color: '#ff6b00' }}>📍</span>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
                  MKV CONVENTION
                </div>
                <div style={{ fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.4, margin: '0.2rem 0 0.4rem' }}>
                  PSCMR College of Engineering and Technology, College Street, Fish Market Area, Vijayawada, Andhra Pradesh, India.
                </div>
                <a
                  href="https://maps.google.com/?q=PSCMR+College+of+Engineering+and+Technology+Vijayawada"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#ff8c33',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  Get Directions on Google Maps ↗
                </a>
              </div>
            </div>
          </div>

          {/* Pricing Row & Register Button matching reference */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.25rem',
            margin: '1rem 0'
          }}>
            {/* Early bird red badge */}
            <div style={{
              background: '#b91c1c',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              color: '#ffffff',
              textAlign: 'center',
              boxShadow: '0 0 15px rgba(220, 38, 38, 0.4)'
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '1px' }}>EARLY BIRD</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, lineHeight: 1 }}>₹249</div>
              <div style={{ fontSize: '0.65rem', opacity: 0.9 }}>ONLY TILL 25 OCT</div>
            </div>

            {/* Regular fee */}
            <div style={{ textAlign: 'left', color: '#9ca3af', fontSize: '0.85rem' }}>
              <div>REGISTRATION FEE</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ff8c33', lineHeight: 1 }}>₹299</div>
              <div style={{ fontSize: '0.75rem' }}>26 - 30 OCT</div>
            </div>

            {/* Orange CTA Register Now Button */}
            <Link
              to="/register"
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #ff6b00, #ff3b00)',
                color: '#ffffff',
                fontFamily: 'var(--font-heading)',
                fontSize: '1.2rem',
                fontWeight: 900,
                letterSpacing: '1px',
                padding: '0.9rem 2.25rem',
                borderRadius: '50px',
                boxShadow: '0 6px 25px rgba(255, 107, 0, 0.5)',
                textDecoration: 'none'
              }}
            >
              Register Now ➔
            </Link>
          </div>

          {/* Open to all banner text */}
          <p style={{
            fontSize: '0.85rem',
            color: '#a89880',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            fontWeight: 700,
            marginTop: '0.75rem'
          }}>
            OPEN TO ALL PEOPLE IN VIJAYAWADA
          </p>

          <CountdownTimer targetDate="2026-10-31T18:00:00+05:30" />

          {/* WhatsApp Support Section matching requirement */}
          <div style={{
            background: 'rgba(15, 15, 20, 0.8)',
            border: '1px solid rgba(255, 107, 0, 0.25)',
            borderRadius: '12px',
            padding: '1rem',
            maxWidth: '540px',
            margin: '2rem auto 0',
            textAlign: 'center'
          }}>
            <div style={{ color: '#ef4444', fontSize: '0.82rem', fontWeight: 800, letterSpacing: '1px', marginBottom: '0.5rem' }}>
              ⚠️ WHATSAPP DM ONLY, NO CALLS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1.25rem' }}>
              <a
                href="https://wa.me/919398494121?text=Hi%2C%20I%20have%20a%20query%20about%20Spooktacular%20Halloween%20Party%202026"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#4ade80', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <span>💬</span> 9398494121
              </a>
              <a
                href="https://wa.me/917569583272?text=Hi%2C%20I%20have%20a%20query%20about%20Spooktacular%20Halloween%20Party%202026"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#4ade80', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <span>💬</span> +91 75695 83272
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
