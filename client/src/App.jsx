import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import SpookyBackground from './components/SpookyBackground';
import MusicPlayer from './components/MusicPlayer';
import { MusicProvider } from './context/MusicContext';

import Home from './pages/Home';
import Register from './pages/Register';
import Payment from './pages/Payment';
import TicketConfirmation from './pages/TicketConfirmation';
import TicketValidator from './pages/TicketValidator';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import api from './utils/api';

// Route change scroll to top helper
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const [adminUser, setAdminUser] = useState(null);

  useEffect(() => {
    // Check if admin is logged in
    api.adminMe()
      .then(res => setAdminUser(res.admin))
      .catch(() => setAdminUser(null));
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
          </main>

          <Footer />
        </div>
      </MusicProvider>
    </Router>
  );
}

