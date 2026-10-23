import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  // Do not render public navbar on admin pages
  if (location.pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">🎃</span>
          <span className="brand-text">SPOOKTACULAR</span>
        </Link>

        {/* Desktop Links - completely without admin link */}
        <div className="navbar-links" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/" className={isActive('/') ? 'active' : ''}>
            Home
          </Link>
          <a href="/#highlights">
            Highlights
          </a>
          <a href="/#pricing">
            Pricing
          </a>
          <a href="/#venue">
            Venue & Map
          </a>
          <Link to="/lookup" className={isActive('/lookup') ? 'active' : ''}>
            Verify Ticket
          </Link>
          <Link to="/register" className="btn btn-primary btn-sm" style={{ marginLeft: '0.5rem' }}>
            Book Tickets 🔥
          </Link>
        </div>
      </div>
    </nav>
  );
}
