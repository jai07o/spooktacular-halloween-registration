import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Footer() {
  const location = useLocation();

  if (location.pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <footer style={{ 
      borderTop: '1px solid var(--border-dark)', 
      background: 'var(--bg-darker)', 
      padding: '3rem 1.5rem 2rem', 
      position: 'relative', 
      zIndex: 2,
      marginTop: '4rem'
    }}>
      <div className="container" style={{ maxWidth: 'var(--container-max)', margin: '0 auto' }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
          gap: '2.5rem',
          marginBottom: '2.5rem'
        }}>
          {/* Brand Col */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.75rem' }}>🎃</span>
              <h3 style={{ 
                fontFamily: 'var(--font-display)', 
                color: 'var(--orange-primary)', 
                fontSize: '1.5rem',
                letterSpacing: '1px' 
              }}>
                SPOOKTACULAR 2026
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.6 }}>
              Vijayawada's biggest and most electrifying Halloween celebration! Dress spooky, dance crazy, and create unforgettable memories with us.
            </p>
            <p style={{ color: 'var(--text-accent)', fontSize: '0.85rem', fontWeight: 600 }}>
              "OPEN TO ALL PEOPLE IN VIJAYAWADA"
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 style={{ color: 'var(--text-white)', fontSize: '1rem', marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>
              Quick Links
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <li>
                <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
                  Event Overview
                </Link>
              </li>
              <li>
                <Link to="/register" style={{ color: 'var(--text-accent)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>
                  Book Passes & Tickets
                </Link>
              </li>
              <li>
                <Link to="/lookup" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
                  Verify / Download Ticket
                </Link>
              </li>
              <li>
                <a href="/#pricing" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
                  Pricing & Rules
                </a>
              </li>
            </ul>
          </div>

          {/* Event Venue & Time */}
          <div>
            <h4 style={{ color: 'var(--text-white)', fontSize: '1rem', marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>
              Location & Schedule
            </h4>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              <p style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span>📍</span>
                <span>
                  <strong>MKV Convention</strong>, PSCMR College of Engineering and Technology, College Street, Fish Market Area, Vijayawada, Andhra Pradesh, India.
                </span>
              </p>
              <p style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span>📅</span>
                <span>Saturday, 31 October 2026</span>
              </p>
              <p style={{ display: 'flex', gap: '0.5rem' }}>
                <span>⏰</span>
                <span>Doors Open: 6:00 PM IST onwards</span>
              </p>
            </div>
          </div>

          {/* WhatsApp Support & Payment Help */}
          <div>
            <h4 style={{ color: 'var(--text-white)', fontSize: '1rem', marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>
              WhatsApp Support
            </h4>
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--fire-red)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.5rem 0.75rem',
              color: '#fca5a5',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '1px',
              marginBottom: '0.75rem',
              textAlign: 'center'
            }}>
              ⚠️ WHATSAPP DM ONLY, NO CALLS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <a
                href="https://wa.me/919398494121?text=Hi%2C%20I%20have%20a%20query%20about%20Spooktacular%20Halloween%20Party%202026"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#4ade80', textDecoration: 'none', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <span>💬</span> <strong>9398494121</strong>
              </a>
              <a
                href="https://wa.me/917569583272?text=Hi%2C%20I%20have%20a%20query%20about%20Spooktacular%20Halloween%20Party%202026"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#4ade80', textDecoration: 'none', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <span>💬</span> <strong>+91 75695 83272</strong>
              </a>
            </div>
            <div style={{ 
              background: 'rgba(255,107,0,0.06)', 
              border: '1px solid var(--border-orange)', 
              borderRadius: 'var(--radius-sm)', 
              padding: '0.6rem 0.8rem',
              fontSize: '0.82rem',
              color: 'var(--text-primary)'
            }}>
              <span>Official UPI ID: </span>
              <strong style={{ color: 'var(--text-accent)' }}>mohith.deepu@ybl</strong>
            </div>
          </div>
        </div>

        {/* Bottom copyright */}
        <div style={{ 
          borderTop: '1px solid var(--border-dark)', 
          paddingTop: '1.5rem', 
          display: 'flex', 
          flexWrap: 'wrap', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.82rem',
          color: 'var(--text-muted)'
        }}>
          <div>
            © 2026 Spooktacular Halloween Party. All rights reserved. Vijayawada, AP.
          </div>
          <div>
            DRESS SPOOKY • DANCE CRAZY • MAKE MEMORIES 👻
          </div>
        </div>
      </div>
    </footer>
  );
}
