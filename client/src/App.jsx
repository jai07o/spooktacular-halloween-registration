import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import SpookyBackground from './components/SpookyBackground';
import MusicPlayer from './components/MusicPlayer';
import { MusicProvider } from './context/MusicContext';

import Home from './pages/Home';
import api from './utils/api';

// Code-split pages to dramatically reduce initial bundle size and speed up page load
const Register = React.lazy(() => import('./pages/Register'));
const Payment = React.lazy(() => import('./pages/Payment'));
const TicketConfirmation = React.lazy(() => import('./pages/TicketConfirmation'));
const TicketValidator = React.lazy(() => import('./pages/TicketValidator'));
const AdminLogin = React.lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));

// Route change scroll to top helper
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Lightweight page fallback during lazy load
function PageFallback() {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '1rem',
      color: '#ff6b00',
      fontFamily: 'var(--font-heading)'
    }}>
      <div style={{ fontSize: '2.5rem', animation: 'spin 1.5s linear infinite' }}>🎃</div>
      <div style={{ fontSize: '0.9rem', color: '#9ca3af', letterSpacing: '1px' }}>LOADING EXPERIENCE...</div>
    </div>
  );
}

export default function App() {
  const [adminUser, setAdminUser] = useState(null);

  useEffect(() => {
    // Only check admin auth when navigating to admin routes to prevent slowing down regular attendee visits
    if (window.location.pathname.startsWith('/admin')) {
      api.adminMe()
        .then(res => setAdminUser(res.admin))
        .catch(() => setAdminUser(null));
    }
  }, []);

  return (
    <Router>
      <MusicProvider>
        <ScrollToTop />
        <div className="page-wrapper">
          <SpookyBackground />
          <Navbar />
          <MusicPlayer />

          <main style={{ minHeight: 'calc(100vh - 350px)' }}>
            <React.Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/register" element={<Register />} />
                <Route path="/payment/:token" element={<Payment />} />
                <Route path="/ticket/:token" element={<TicketConfirmation />} />
                <Route path="/lookup" element={<TicketValidator />} />
                <Route path="/validate" element={<TicketValidator />} />

                {/* Admin Routes */}
                <Route 
                  path="/admin" 
                  element={adminUser ? <Navigate to="/admin/dashboard" replace /> : <AdminLogin onLoginSuccess={setAdminUser} />} 
                />
                <Route 
                  path="/admin/login" 
                  element={<AdminLogin onLoginSuccess={setAdminUser} />} 
                />
                <Route 
                  path="/admin/dashboard" 
                  element={<AdminDashboard />} 
                />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </React.Suspense>
          </main>

          <Footer />
        </div>
      </MusicProvider>
    </Router>
  );
}

