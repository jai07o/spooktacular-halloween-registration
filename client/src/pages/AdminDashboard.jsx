import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState('dashboard');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Modals & Details
  const [inspectReg, setInspectReg] = useState(null);
  const [inspectDetails, setInspectDetails] = useState(null);

  // Reject Modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState(null);
  const [rejectReason, setRejectReason] = useState('Invalid or unverified UPI transaction reference');

  // Two-Step Remove Modal
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removeStep, setRemoveStep] = useState(1); // 1 = Review details & input reason, 2 = Final confirmation
  const [removeTargetReg, setRemoveTargetReg] = useState(null);
  const [removeReason, setRemoveReason] = useState('Cancelled by administrator request');

  // Duplicate Detector State & Modals
  const [duplicateScan, setDuplicateScan] = useState(null);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolvePair, setResolvePair] = useState(null);
  const [resolveReason, setResolveReason] = useState('Duplicate registration reconciliation');
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagTargetId, setFlagTargetId] = useState(null);
  const [flagReason, setFlagReason] = useState('Suspicious duplicate payment claim');

  // Permanent Delete & Delete All States
  const [permanentDeleteModalOpen, setPermanentDeleteModalOpen] = useState(false);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState(null);
  const [permanentDeleteInputId, setPermanentDeleteInputId] = useState('');
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState('');

  const [feedbackMessage, setFeedbackMessage] = useState(null);

  // Check auth
  useEffect(() => {
    api.adminMe()
      .then(res => setAdminUser(res.admin))
      .catch(() => navigate('/admin/login'));
  }, [navigate]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchStats = async () => {
    try {
      const data = await api.adminStatistics();
      setStats(data);
    } catch (err) {
      console.error('Error fetching statistics:', err);
    }
  };

  const fetchRegistrations = async (page = 1) => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        search: debouncedSearch,
        status: statusFilter
      };
      const res = await api.adminRegistrations(params);
      setRegistrations(res.registrations || []);
      setPagination({
        page: res.page || 1,
        limit: res.limit || 20,
        total: res.total || 0,
        totalPages: res.totalPages || 1
      });
    } catch (err) {
      console.error('Error fetching registrations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminUser) {
      fetchStats();
      fetchRegistrations(1);
    }
  }, [adminUser, debouncedSearch, statusFilter]);

  // Handle Tab navigation
  const handleNavClick = (tabKey, statusKey = '') => {
    setActiveTab(tabKey);
    if (tabKey === 'export') {
      handleExport();
      return;
    }
    if (tabKey === 'logout') {
      handleLogout();
      return;
    }
    setStatusFilter(statusKey);
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Approve payment and issue official SPH-2026 entry ticket?')) return;

    setActionLoading(true);
    try {
      const res = await api.adminApprove(id);
      setFeedbackMessage({ type: 'success', text: `Approved successfully! Ticket: ${res.ticketNumber}` });
      fetchStats();
      fetchRegistrations(pagination.page);
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Approval failed' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  const openRejectModal = (id) => {
    setRejectTargetId(id);
    setRejectReason('Invalid or unverified UPI transaction reference');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectTargetId) return;

    setActionLoading(true);
    try {
      await api.adminReject(rejectTargetId, rejectReason);
      setFeedbackMessage({ type: 'success', text: 'Registration payment rejected and status updated.' });
      setRejectModalOpen(false);
      setRejectTargetId(null);
      fetchStats();
      fetchRegistrations(pagination.page);
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Rejection failed' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  // Two-Step Removal Workflow
  const openRemoveModal = (reg) => {
    setRemoveTargetReg(reg);
    setRemoveReason('Requested by attendee / Duplicate entry');
    setRemoveStep(1);
    setRemoveModalOpen(true);
  };

  const handleProceedToRemoveStep2 = () => {
    if (!removeReason.trim()) {
      alert('Please provide a reason for removal.');
      return;
    }
    setRemoveStep(2);
  };

  const handleExecuteRemoval = async () => {
    if (!removeTargetReg) return;

    setActionLoading(true);
    try {
      const res = await api.adminRemove(removeTargetReg.id, removeReason.trim());
      setFeedbackMessage({
        type: 'success',
        text: `Registration ${removeTargetReg.id} safely removed and archived.${res.revokedTicket ? ` Revoked ticket: ${res.revokedTicket}` : ''}`
      });
      setRemoveModalOpen(false);
      setRemoveTargetReg(null);
      fetchStats();
      fetchRegistrations(pagination.page);
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Removal failed' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMessage(null), 4500);
    }
  };

  // Restore Archived Registration
  const handleRestore = async (id) => {
    if (!window.confirm('Restore this registration to PENDING_PAYMENT status? (Revoked tickets will NOT be automatically restored)')) return;

    setActionLoading(true);
    try {
      await api.adminRestore(id);
      setFeedbackMessage({ type: 'success', text: 'Registration restored to PENDING_PAYMENT.' });
      fetchStats();
      fetchRegistrations(pagination.page);
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Restore failed' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  // Duplicate Detector Handlers
  const handleScanDuplicates = async () => {
    setScanningDuplicates(true);
    try {
      const data = await api.adminScanDuplicates();
      setDuplicateScan(data);
      setFeedbackMessage({
        type: 'success',
        text: `Scan complete: Found ${data.totalDuplicateGroups} duplicate/conflict groups (${data.summary.duplicateRegistrationsCount} reg, ${data.summary.duplicateUtrCount} UTR, ${data.summary.flaggedForReviewCount} flagged).`
      });
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: 'Failed to scan duplicates: ' + err.message });
    } finally {
      setScanningDuplicates(false);
      setTimeout(() => setFeedbackMessage(null), 4500);
    }
  };

  const openResolveModal = (primary, duplicate) => {
    setResolvePair({ primary, duplicate });
    setResolveReason(`Reconciled: Retaining canonical registration ${primary.id} and archiving duplicate ${duplicate.id}`);
    setResolveModalOpen(true);
  };

  const handleExecuteResolve = async () => {
    if (!resolvePair) return;
    setActionLoading(true);
    try {
      const res = await api.adminResolveDuplicate({
        primaryId: resolvePair.primary.id,
        duplicateId: resolvePair.duplicate.id,
        reason: resolveReason.trim()
      });
      setFeedbackMessage({
        type: 'success',
        text: `Duplicate reconciled successfully: ${res.duplicateRegistrationId} marked as CANCELLED.${res.revokedTicket ? ` Revoked ticket: ${res.revokedTicket}` : ''}`
      });
      setResolveModalOpen(false);
      setResolvePair(null);
      fetchStats();
      fetchRegistrations(pagination.page);
      handleScanDuplicates();
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: 'Reconciliation failed: ' + err.message });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  const openFlagModal = (id) => {
    setFlagTargetId(id);
    setFlagReason('Flagged for manual review due to conflicting payment claim or multiple matching records');
    setFlagModalOpen(true);
  };

  const handleExecuteFlag = async () => {
    if (!flagTargetId) return;
    setActionLoading(true);
    try {
      await api.adminFlagDuplicate(flagTargetId, flagReason.trim());
      setFeedbackMessage({ type: 'success', text: `Registration ${flagTargetId} flagged for review.` });
      setFlagModalOpen(false);
      setFlagTargetId(null);
      fetchStats();
      fetchRegistrations(pagination.page);
      if (duplicateScan) handleScanDuplicates();
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: 'Flagging failed: ' + err.message });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  // Detect cloned UTRs across loaded registrations
  const duplicateUtrSet = React.useMemo(() => {
    const counts = {};
    (registrations || []).forEach(r => {
      const utr = (r.utr_normalized || r.utr_reference || '').trim().toUpperCase();
      if (utr) {
        counts[utr] = (counts[utr] || 0) + 1;
      }
    });
    const dupes = new Set();
    Object.entries(counts).forEach(([utr, count]) => {
      if (count > 1) dupes.add(utr);
    });
    return dupes;
  }, [registrations]);

  // Permanent Delete Handlers (No restore possible)
  const openPermanentDeleteModal = (regOrId) => {
    if (typeof regOrId === 'object' && regOrId !== null) {
      setPermanentDeleteTarget(regOrId);
      setPermanentDeleteInputId(regOrId.id);
    } else if (typeof regOrId === 'string' && regOrId.trim()) {
      setPermanentDeleteTarget({ id: regOrId.trim() });
      setPermanentDeleteInputId(regOrId.trim());
    } else {
      setPermanentDeleteTarget(null);
      setPermanentDeleteInputId('');
    }
    setPermanentDeleteModalOpen(true);
  };

  const handleExecutePermanentDelete = async () => {
    const targetId = (permanentDeleteTarget?.id || permanentDeleteInputId).trim();
    if (!targetId) {
      alert('Please enter or select a Registration ID to permanently delete.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.adminPermanentDelete(targetId);
      setFeedbackMessage({
        type: 'success',
        text: res.message || `Registration ${targetId} permanently deleted from database (no restore possible).`
      });
      setPermanentDeleteModalOpen(false);
      setPermanentDeleteTarget(null);
      setPermanentDeleteInputId('');
      if (inspectReg && inspectReg.id === targetId) {
        setInspectReg(null);
        setInspectDetails(null);
      }
      fetchStats();
      fetchRegistrations(pagination.page);
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Permanent deletion failed' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  // Delete All Registrations (Wipe Database - No restore possible)
  const openDeleteAllModal = () => {
    setDeleteAllConfirmation('');
    setDeleteAllModalOpen(true);
  };

  const handleExecuteDeleteAll = async () => {
    if (deleteAllConfirmation.trim() !== 'DELETE ALL') {
      alert('You must type "DELETE ALL" to confirm.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.adminDeleteAll('DELETE ALL');
      setFeedbackMessage({
        type: 'success',
        text: res.message || 'All registrations, tickets, and payment submissions permanently deleted from database (no restore possible).'
      });
      setDeleteAllModalOpen(false);
      setDeleteAllConfirmation('');
      setInspectReg(null);
      setInspectDetails(null);
      fetchStats();
      fetchRegistrations(1);
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Delete all failed' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  // Inspect full registration details
  const handleInspect = async (id) => {
    try {
      const res = await api.adminRegistration(id);
      setInspectReg(res.registration);
      setInspectDetails(res);
    } catch (err) {
      alert('Failed to load registration details: ' + err.message);
    }
  };

  const handleExport = async () => {
    try {
      const response = await api.adminExport({
        search: debouncedSearch,
        status: statusFilter
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Spooktacular_Registrations_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export data: ' + err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await api.adminLogout();
      navigate('/admin/login');
    } catch (err) {
      navigate('/admin/login');
    }
  };

  return (
    <div className="admin-shell">
      {/* =====================================================
          SCREEN 6: LEFT SIDEBAR NAVIGATION
         ===================================================== */}
      <aside className="admin-sidebar">
        {/* Brand Header */}
        <div style={{ padding: '0 1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.6rem' }}>🎃</span>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 900, color: '#ff6b00', lineHeight: 1.1 }}>
              HALLOWEEN PARTY
            </div>
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', letterSpacing: '1px' }}>
              ADMIN DASHBOARD
            </div>
          </div>
        </div>

        {/* Navigation list matching Screen 6 */}
        <nav className="admin-sidebar-nav">
          <button
            onClick={() => handleNavClick('dashboard', '')}
            className={`admin-nav-button ${activeTab === 'dashboard' && !statusFilter ? 'active' : ''}`}
          >
            <span>📊</span> Dashboard
          </button>

          <button
            onClick={() => handleNavClick('registrations', '')}
            className={`admin-nav-button ${activeTab === 'registrations' ? 'active' : ''}`}
          >
            <span>👥</span> Registrations
          </button>

          <button
            onClick={() => handleNavClick('pending', 'UNDER_REVIEW')}
            className={`admin-nav-button ${statusFilter === 'UNDER_REVIEW' ? 'active' : ''}`}
          >
            <span>⏳</span> Pending Payments
          </button>

          <button
            onClick={() => handleNavClick('approved', 'APPROVED')}
            className={`admin-nav-button ${statusFilter === 'APPROVED' ? 'active' : ''}`}
          >
            <span>✅</span> Approved Payments
          </button>

          <button
            onClick={() => handleNavClick('rejected', 'REJECTED')}
            className={`admin-nav-button ${statusFilter === 'REJECTED' ? 'active' : ''}`}
          >
            <span>❌</span> Rejected Payments
          </button>

          <button
            onClick={() => handleNavClick('expired', 'EXPIRED')}
            className={`admin-nav-button ${statusFilter === 'EXPIRED' ? 'active' : ''}`}
          >
            <span>⏱️</span> Expired Sessions
          </button>

          <button
            onClick={() => handleNavClick('cancelled', 'CANCELLED')}
            className={`admin-nav-button ${statusFilter === 'CANCELLED' ? 'active' : ''}`}
          >
            <span>🚫</span> Cancelled / Archived
          </button>

          <button
            onClick={() => handleNavClick('flagged', 'FLAGGED_FOR_REVIEW')}
            className={`admin-nav-button ${statusFilter === 'FLAGGED_FOR_REVIEW' ? 'active' : ''}`}
          >
            <span>🚩</span> Flagged Review
            {stats?.flaggedDuplicates > 0 && (
              <span style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.1rem 0.45rem',
                borderRadius: '999px',
                marginLeft: 'auto'
              }}>
                {stats.flaggedDuplicates}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('duplicates');
              handleScanDuplicates();
            }}
            className={`admin-nav-button ${activeTab === 'duplicates' ? 'active' : ''}`}
            style={{
              borderLeft: activeTab === 'duplicates' ? '3px solid #ff6b00' : 'none',
              background: activeTab === 'duplicates' ? 'rgba(255, 107, 0, 0.12)' : 'transparent'
            }}
          >
            <span>🔍</span> Duplicate Detector
          </button>

          <button
            onClick={() => handleNavClick('tickets', 'APPROVED')}
            className={`admin-nav-button ${activeTab === 'tickets' ? 'active' : ''}`}
          >
            <span>🎟️</span> Tickets
          </button>

          <button
            onClick={() => handleNavClick('export')}
            className="admin-nav-button"
          >
            <span>📁</span> Export to Excel
          </button>

          <div style={{ margin: '1rem 0', borderTop: '1px solid #1f1f2e' }} />

          <button
            onClick={() => handleNavClick('logout')}
            className="admin-nav-button"
            style={{ color: '#ef4444' }}
          >
            <span>🚪</span> Logout
          </button>
        </nav>

        {/* Bottom user badge */}
        <div style={{ marginTop: 'auto', padding: '1rem 1.25rem', borderTop: '1px solid #1f1f2e', fontSize: '0.78rem', color: '#6b7280' }}>
          <div>Signed in as:</div>
          <strong style={{ color: '#ff8c33' }}>{adminUser?.username}</strong>
        </div>
      </aside>

      {/* =====================================================
          SCREEN 6: MAIN CONTENT AREA
         ===================================================== */}
      <main className="admin-content-area">
        {/* Top Feedback Banner */}
        {feedbackMessage && (
          <div style={{
            background: feedbackMessage.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${feedbackMessage.type === 'success' ? '#22c55e' : '#ef4444'}`,
            color: feedbackMessage.type === 'success' ? '#86efac' : '#fca5a5',
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem'
          }}>
            {feedbackMessage.text}
          </div>
        )}

        {/* Deduplication Health Shield Banner */}
        <div style={{
          background: 'linear-gradient(90deg, rgba(255, 107, 0, 0.1), rgba(34, 197, 94, 0.08))',
          border: '1px solid rgba(255, 107, 0, 0.3)',
          borderRadius: '10px',
          padding: '0.85rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.86rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#e5e7eb' }}>
            <span style={{ fontSize: '1.25rem' }}>🛡️</span>
            <div>
              <strong style={{ color: '#ff8c33' }}>Clean Data Engine Active:</strong> All metrics, participant counts ({stats?.totalParticipants || 0}), and collections (₹{Number(stats?.totalRevenue || 0).toLocaleString()}) are strictly derived from unique, valid registrations. Cancelled, expired, and duplicate records are safely segregated.
            </div>
          </div>
          <button
            onClick={() => {
              setActiveTab('duplicates');
              handleScanDuplicates();
            }}
            className="btn btn-ghost btn-sm"
            style={{
              fontSize: '0.78rem',
              color: '#ff8c33',
              border: '1px solid #ff8c3388',
              padding: '0.35rem 0.85rem',
              borderRadius: '6px',
              fontWeight: 700
            }}
          >
            {scanningDuplicates ? 'Scanning...' : 'Run Duplicate Scan ➔'}
          </button>
        </div>

        {/* Compact Stats Row matching Screen 6 */}
        {stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.85rem',
            marginBottom: '2rem'
          }}>
            <div className="compact-stat-card">
              <div className="stat-label">Active Regs</div>
              <div className="stat-value">{stats.totalRegistrations || 0}</div>
            </div>

            <div className="compact-stat-card">
              <div className="stat-label">Participants</div>
              <div className="stat-value">{stats.totalParticipants || 0}</div>
            </div>

            <div className="compact-stat-card">
              <div className="stat-label" style={{ color: '#4ade80' }}>Verified Rev.</div>
              <div className="stat-value" style={{ color: '#4ade80' }}>
                ₹{Number(stats.totalRevenue || 0).toLocaleString()}
              </div>
            </div>

            <div className="compact-stat-card">
              <div className="stat-label" style={{ color: '#f59e0b' }}>Under Review</div>
              <div className="stat-value" style={{ color: '#fbbf24' }}>
                {stats.byStatus?.UNDER_REVIEW || 0}
              </div>
            </div>

            <div className="compact-stat-card">
              <div className="stat-label" style={{ color: '#22c55e' }}>Approved</div>
              <div className="stat-value" style={{ color: '#4ade80' }}>
                {stats.byStatus?.APPROVED || 0}
              </div>
            </div>

            <div className="compact-stat-card">
              <div className="stat-label" style={{ color: '#ef4444' }}>Rejected</div>
              <div className="stat-value" style={{ color: '#f87171' }}>
                {stats.byStatus?.REJECTED || 0}
              </div>
            </div>

            <div className="compact-stat-card">
              <div className="stat-label" style={{ color: '#9ca3af' }}>Expired</div>
              <div className="stat-value" style={{ color: '#9ca3af' }}>
                {stats.byStatus?.EXPIRED || 0}
              </div>
            </div>

            <div className="compact-stat-card">
              <div className="stat-label" style={{ color: '#c084fc' }}>Cancelled</div>
              <div className="stat-value" style={{ color: '#c084fc' }}>
                {stats.byStatus?.CANCELLED || 0}
              </div>
            </div>

            {stats.flaggedDuplicates > 0 && (
              <div className="compact-stat-card" style={{ border: '1px solid #ef4444' }}>
                <div className="stat-label" style={{ color: '#ef4444' }}>Flagged Review</div>
                <div className="stat-value" style={{ color: '#f87171' }}>
                  {stats.flaggedDuplicates}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'duplicates' ? (
          <div className="duplicate-detector-workspace">
            {/* Header */}
            <div style={{
              background: '#0d0d14',
              border: '1px solid #1f1f2e',
              borderRadius: '12px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', color: '#ff6b00', fontSize: '1.35rem', margin: '0 0 0.3rem' }}>
                  🔍 Duplicate Identification & Sanitization Center
                </h2>
                <p style={{ color: '#9ca3af', fontSize: '0.86rem', margin: 0 }}>
                  Automated detection of duplicate UTR payment claims, identical tickets, and conflicting registrations. Legitimate multi-registrations by the same person are preserved.
                </p>
              </div>

              <button
                onClick={handleScanDuplicates}
                disabled={scanningDuplicates}
                className="btn btn-primary btn-sm"
                style={{
                  background: 'linear-gradient(135deg, #ff6b00, #ff3b00)',
                  fontWeight: 800,
                  padding: '0.65rem 1.35rem',
                  borderRadius: '8px'
                }}
              >
                {scanningDuplicates ? 'Scanning Database...' : '🔄 Rescan Database'}
              </button>
            </div>

            {/* Summary Metrics */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div className="compact-stat-card" style={{ border: duplicateScan?.summary?.duplicateUtrCount > 0 ? '1px solid #ef4444' : '1px solid #1f1f2e' }}>
                <div className="stat-label" style={{ color: duplicateScan?.summary?.duplicateUtrCount > 0 ? '#f87171' : '#9ca3af' }}>
                  Duplicate UTR Claims
                </div>
                <div className="stat-value" style={{ color: duplicateScan?.summary?.duplicateUtrCount > 0 ? '#ef4444' : '#fff' }}>
                  {duplicateScan?.summary?.duplicateUtrCount || 0}
                </div>
              </div>

              <div className="compact-stat-card">
                <div className="stat-label">Duplicate Reg IDs</div>
                <div className="stat-value">
                  {duplicateScan?.summary?.duplicateRegistrationsCount || 0}
                </div>
              </div>

              <div className="compact-stat-card" style={{ border: duplicateScan?.summary?.flaggedForReviewCount > 0 ? '1px solid #f59e0b' : '1px solid #1f1f2e' }}>
                <div className="stat-label" style={{ color: '#fbbf24' }}>Flagged For Review</div>
                <div className="stat-value" style={{ color: '#fbbf24' }}>
                  {duplicateScan?.summary?.flaggedForReviewCount || 0}
                </div>
              </div>

              <div className="compact-stat-card">
                <div className="stat-label" style={{ color: '#60a5fa' }}>Same Phone (Legitimate)</div>
                <div className="stat-value" style={{ color: '#60a5fa' }}>
                  {duplicateScan?.summary?.samePhoneGroupsCount || 0}
                </div>
              </div>
            </div>

            {/* 1. Duplicate UTR Claims Section */}
            <div style={{ background: '#0d0d14', border: '1px solid #1f1f2e', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.25rem' }}>💳</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f3f4f6', fontFamily: 'var(--font-heading)' }}>
                  Duplicate UTR / Payment Reference Claims ({duplicateScan?.duplicateUtrs?.length || 0})
                </h3>
              </div>

              {(!duplicateScan?.duplicateUtrs || duplicateScan.duplicateUtrs.length === 0) ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#10b981', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px' }}>
                  ✅ Zero duplicate UTR claims found. Every transaction reference is strictly unique.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {duplicateScan.duplicateUtrs.map((group, gIdx) => (
                    <div key={gIdx} style={{
                      background: '#12121c',
                      border: '1px solid #ef444466',
                      borderRadius: '8px',
                      padding: '1rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Conflict UTR: </span>
                          <strong style={{ color: '#fbbf24', fontFamily: 'monospace', fontSize: '1rem' }}>{group.utr_normalized}</strong>
                          <span style={{ marginLeft: '0.75rem', color: '#ef4444', fontSize: '0.8rem', fontWeight: 700 }}>
                            ⚠️ Claimed {group.count} times
                          </span>
                        </div>
                        {group.registrations.length >= 2 && (
                          <button
                            onClick={() => openResolveModal(group.registrations[0], group.registrations[1])}
                            className="btn btn-primary btn-sm"
                            style={{
                              background: '#ef4444',
                              color: '#fff',
                              fontSize: '0.78rem',
                              padding: '0.35rem 0.8rem',
                              fontWeight: 700
                            }}
                          >
                            Reconcile Duplicate Claim
                          </button>
                        )}
                      </div>

                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ color: '#9ca3af', borderBottom: '1px solid #2a2a3e' }}>
                              <th style={{ padding: '0.5rem' }}>Reg ID</th>
                              <th style={{ padding: '0.5rem' }}>Registrant</th>
                              <th style={{ padding: '0.5rem' }}>Phone</th>
                              <th style={{ padding: '0.5rem' }}>Amount</th>
                              <th style={{ padding: '0.5rem' }}>Status</th>
                              <th style={{ padding: '0.5rem' }}>Ticket</th>
                              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.registrations.map((r, rIdx) => (
                              <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>
                                  {r.id} {rIdx === 0 && <span style={{ color: '#10b981', fontSize: '0.7rem' }}>(Earliest)</span>}
                                </td>
                                <td style={{ padding: '0.5rem', fontWeight: 600 }}>{r.full_name}</td>
                                <td style={{ padding: '0.5rem', color: '#9ca3af' }}>{r.phone}</td>
                                <td style={{ padding: '0.5rem', color: '#ff8c33', fontWeight: 700 }}>₹{r.total_amount}</td>
                                <td style={{ padding: '0.5rem' }}>
                                  <span style={{ color: r.status === 'PAYMENT_VERIFIED' ? '#4ade80' : '#fbbf24' }}>
                                    {r.status}
                                  </span>
                                </td>
                                <td style={{ padding: '0.5rem' }}>{r.ticket_number || '—'}</td>
                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                  <button
                                    onClick={() => handleInspect(r.id)}
                                    style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', padding: '0.2rem 0.4rem', borderRadius: '4px', cursor: 'pointer', marginRight: '0.4rem' }}
                                  >
                                    👁️
                                  </button>
                                  <button
                                    onClick={() => openFlagModal(r.id)}
                                    style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171', padding: '0.2rem 0.45rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                                  >
                                    🚩 Flag
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Flagged for Manual Review Section */}
            <div style={{ background: '#0d0d14', border: '1px solid #1f1f2e', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🚩</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f3f4f6', fontFamily: 'var(--font-heading)' }}>
                  Flagged for Review / Disputed Records ({duplicateScan?.flaggedForReview?.length || 0})
                </h3>
              </div>

              {(!duplicateScan?.flaggedForReview || duplicateScan.flaggedForReview.length === 0) ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', background: '#12121c', borderRadius: '8px' }}>
                  No registrations currently flagged for review.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.84rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: '#9ca3af', borderBottom: '1px solid #2a2a3e' }}>
                        <th style={{ padding: '0.6rem' }}>Reg ID</th>
                        <th style={{ padding: '0.6rem' }}>Registrant</th>
                        <th style={{ padding: '0.6rem' }}>Phone</th>
                        <th style={{ padding: '0.6rem' }}>Amount</th>
                        <th style={{ padding: '0.6rem' }}>Flag Reason</th>
                        <th style={{ padding: '0.6rem', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicateScan.flaggedForReview.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '0.6rem', fontFamily: 'monospace' }}>{r.id}</td>
                          <td style={{ padding: '0.6rem', fontWeight: 600 }}>{r.full_name}</td>
                          <td style={{ padding: '0.6rem', color: '#9ca3af' }}>{r.phone}</td>
                          <td style={{ padding: '0.6rem', color: '#ff8c33', fontWeight: 700 }}>₹{r.total_amount}</td>
                          <td style={{ padding: '0.6rem', color: '#f87171', fontSize: '0.8rem' }}>
                            {r.duplicate_flag_reason || 'Flagged for review'}
                          </td>
                          <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                            <button
                              onClick={() => handleInspect(r.id)}
                              style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', marginRight: '0.4rem' }}
                            >
                              👁️ Inspect
                            </button>
                            <button
                              onClick={() => openRemoveModal(r)}
                              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' }}
                            >
                              🗑️ Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 3. Multi-Registrations by Same Phone (Preserved & Legitimate) */}
            <div style={{ background: '#0d0d14', border: '1px solid #1f1f2e', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>📱</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#60a5fa', fontFamily: 'var(--font-heading)' }}>
                  Same Phone Number Registrations ({duplicateScan?.samePhoneGroups?.length || 0} groups)
                </h3>
              </div>
              <p style={{ color: '#9ca3af', fontSize: '0.84rem', margin: '0 0 1rem' }}>
                ℹ️ <strong>Policy Adherence:</strong> Attendees frequently register separately for different family members or friend groups. Matching phone numbers are <strong>never automatically marked as duplicates</strong> and remain distinct in the database as long as their payment claims are independent.
              </p>

              {(!duplicateScan?.samePhoneGroups || duplicateScan.samePhoneGroups.length === 0) ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', background: '#12121c', borderRadius: '8px' }}>
                  No multi-registration phone numbers found.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {duplicateScan.samePhoneGroups.map((g, idx) => (
                    <div key={idx} style={{ background: '#12121c', borderRadius: '8px', padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <strong style={{ color: '#fff' }}>Phone: {g.phone}</strong>
                        <span style={{ marginLeft: '0.75rem', color: '#60a5fa', fontSize: '0.82rem' }}>
                          ({g.count} distinct registrations - {g.total_participants} total participants)
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setSearchTerm(g.phone);
                          setActiveTab('registrations');
                        }}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.78rem', color: '#ff8c33', border: '1px solid #ff8c3366', padding: '0.25rem 0.6rem' }}
                      >
                        View in Registrations ➔
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Search, Filter & Excel Export Bar matching reference */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.5rem',
              background: '#0d0d14',
              border: '1px solid #1f1f2e',
              borderRadius: '12px',
              padding: '1rem'
            }}>
              {/* Search Input */}
              <div style={{ flex: '1 1 280px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}>
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Search by name, phone, UTR, ticket no..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.5rem', background: '#12121c' }}
                />
              </div>

              {/* Status Dropdown */}
              <div style={{ width: '180px' }}>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="form-select"
                  style={{ background: '#12121c' }}
                >
                  <option value="">All Statuses</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="PENDING_PAYMENT">Pending</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="CANCELLED">Cancelled / Archived</option>
                  <option value="FLAGGED_FOR_REVIEW">Flagged for Review</option>
                </select>
              </div>

              {/* Export to Excel Orange Button matching Screen 6 */}
              <button
                type="button"
                onClick={handleExport}
                className="btn btn-primary btn-sm"
                style={{
                  background: 'linear-gradient(135deg, #ff6b00, #ff3b00)',
                  color: '#ffffff',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 800,
                  padding: '0.65rem 1.25rem',
                  borderRadius: '8px'
                }}
              >
                📁 Export to Excel
              </button>

              {/* Delete Permanently Button in Database */}
              <button
                type="button"
                onClick={() => openPermanentDeleteModal()}
                className="btn btn-sm"
                title="Permanently delete registration details from database (No restore possible)"
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  color: '#f87171',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 800,
                  padding: '0.65rem 1.15rem',
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer'
                }}
              >
                🗑️ Delete Permanently
              </button>

              {/* Delete All Button (Wipe Database) */}
              <button
                type="button"
                onClick={openDeleteAllModal}
                className="btn btn-sm"
                title="Permanently delete ALL database registrations (No restore possible)"
                style={{
                  background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                  border: '1px solid #ef4444',
                  color: '#ffffff',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 800,
                  padding: '0.65rem 1.25rem',
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 0 15px rgba(220, 38, 38, 0.4)',
                  cursor: 'pointer'
                }}
              >
                💥 Delete All
              </button>
            </div>

        {/* Data Table matching reference Screen 6 */}
        <div style={{
          background: '#0d0d14',
          border: '1px solid #1f1f2e',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: '#11111a', borderBottom: '1px solid #1f1f2e', color: '#9ca3af' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Reg ID</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Name</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Phone</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Participants</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Amount</th>
                  <th style={{ padding: '0.85rem 1rem' }}>UTR / TXN</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Ticket No</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
                      Loading data...
                    </td>
                  </tr>
                ) : registrations.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
                      No records found.
                    </td>
                  </tr>
                ) : (
                  registrations.map(reg => {
                    // Badge styles
                    const isApproved = reg.status === 'PAYMENT_VERIFIED' || reg.status === 'APPROVED';
                    const isReview = reg.status === 'PAYMENT_UNDER_REVIEW' || reg.status === 'UNDER_REVIEW';
                    const isReject = reg.status === 'PAYMENT_REJECTED' || reg.status === 'REJECTED';
                    const isPending = reg.status === 'PENDING_PAYMENT';
                    const isCancelled = reg.status === 'CANCELLED';
                    const isFlagged = reg.status === 'FLAGGED_FOR_REVIEW' || reg.is_flagged_duplicate === 1;

                    const normUtr = (reg.utr_normalized || reg.utr_reference || '').trim().toUpperCase();
                    const isClonedUtr = Boolean(normUtr && duplicateUtrSet.has(normUtr));

                    return (
                      <tr key={reg.id} style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        transition: 'background 0.15s',
                        background: isFlagged || isClonedUtr ? 'rgba(239, 68, 68, 0.05)' : 'transparent'
                      }}>
                        <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', color: '#9ca3af' }}>
                          {reg.id}
                          {reg.is_flagged_duplicate === 1 && (
                            <span title={reg.duplicate_flag_reason || 'Flagged for review'} style={{ marginLeft: '0.4rem', cursor: 'help' }}>🚩</span>
                          )}
                        </td>

                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#f3f4f6' }}>
                          {reg.full_name}
                        </td>

                        <td style={{ padding: '0.85rem 1rem', color: '#9ca3af' }}>
                          {reg.phone}
                        </td>

                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700 }}>
                          {reg.participant_count}
                        </td>

                        <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#ff8c33' }}>
                          ₹{reg.total_amount}
                        </td>

                        <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          <span style={{ color: isClonedUtr ? '#ef4444' : '#d1d5db', fontWeight: isClonedUtr ? 800 : 500 }}>
                            {reg.utr_reference || '—'}
                          </span>
                          {isClonedUtr && (
                            <span style={{
                              display: 'inline-block',
                              background: '#ef4444',
                              color: '#fff',
                              fontSize: '0.65rem',
                              fontWeight: 900,
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              marginLeft: '0.4rem',
                              letterSpacing: '0.5px'
                            }}>
                              ⚠️ CLONE UTR
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: isFlagged ? 'rgba(239, 68, 68, 0.2)'
                              : isApproved ? 'rgba(34, 197, 94, 0.15)'
                              : isReview ? 'rgba(245, 158, 11, 0.15)'
                              : isReject ? 'rgba(239, 68, 68, 0.15)'
                              : isCancelled ? 'rgba(192, 132, 252, 0.15)'
                              : 'rgba(255, 107, 0, 0.15)',
                            color: isFlagged ? '#f87171'
                              : isApproved ? '#4ade80'
                              : isReview ? '#fbbf24'
                              : isReject ? '#f87171'
                              : isCancelled ? '#c084fc'
                              : '#fb923c',
                            border: `1px solid ${isFlagged ? '#ef4444'
                              : isApproved ? '#22c55e'
                              : isReview ? '#f59e0b'
                              : isReject ? '#ef4444'
                              : isCancelled ? '#a855f7'
                              : '#ea580c'}`
                          }}>
                            {isFlagged ? 'Flagged Review'
                              : isApproved ? 'Approved'
                              : isReview ? 'Under Review'
                              : isReject ? 'Rejected'
                              : isCancelled ? 'Cancelled'
                              : 'Pending'}
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                          {reg.ticket_number ? (
                            <span style={{ color: reg.ticket_is_valid === 0 ? '#ef4444' : '#4ade80', fontWeight: 600 }}>
                              {reg.ticket_number} {reg.ticket_is_valid === 0 ? '(Revoked)' : ''}
                            </span>
                          ) : (
                            <span style={{ color: '#6b7280' }}>—</span>
                          )}
                        </td>

                        {/* Actions column */}
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                            {/* Inspect Eye Icon */}
                            <button
                              onClick={() => handleInspect(reg.id)}
                              title="View Details"
                              style={{
                                background: 'transparent',
                                border: '1px solid #374151',
                                borderRadius: '6px',
                                color: '#9ca3af',
                                padding: '0.3rem 0.5rem',
                                cursor: 'pointer'
                              }}
                            >
                              👁️
                            </button>

                            {/* Approve Button */}
                            {isReview && (
                              <button
                                onClick={() => handleApprove(reg.id)}
                                disabled={actionLoading}
                                title="Approve Payment"
                                style={{
                                  background: '#16a34a',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '0.3rem 0.6rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Approve
                              </button>
                            )}

                            {/* Reject Button */}
                            {isReview && (
                              <button
                                onClick={() => openRejectModal(reg.id)}
                                disabled={actionLoading}
                                title="Reject Payment"
                                style={{
                                  background: '#dc2626',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '0.3rem 0.6rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Reject
                              </button>
                            )}

                            {/* Flag for Review Button */}
                            {!isCancelled && !isFlagged && (
                              <button
                                onClick={() => openFlagModal(reg.id)}
                                disabled={actionLoading}
                                title="Flag for Review / Suspicious Duplicate Claim"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#f87171',
                                  border: '1px solid #ef444444',
                                  borderRadius: '6px',
                                  padding: '0.3rem 0.5rem',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer'
                                }}
                              >
                                🚩 Flag
                              </button>
                            )}

                            {/* Restore Button (for Cancelled records) */}
                            {isCancelled && (
                              <button
                                onClick={() => handleRestore(reg.id)}
                                disabled={actionLoading}
                                title="Restore Registration"
                                style={{
                                  background: '#2563eb',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '0.3rem 0.6rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Restore
                              </button>
                            )}

                            {/* REMOVE REGISTRATION BUTTON */}
                            {!isCancelled && (
                              <button
                                type="button"
                                onClick={() => openRemoveModal(reg)}
                                disabled={actionLoading}
                                title="Remove / Cancel Registration"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#ef4444',
                                  border: '1px solid #ef444466',
                                  borderRadius: '6px',
                                  padding: '0.3rem 0.55rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                🗑️ Remove
                              </button>
                            )}

                            {/* PERMANENT HARD DELETE (NO RESTORE) */}
                            <button
                              type="button"
                              onClick={() => openPermanentDeleteModal(reg)}
                              disabled={actionLoading}
                              title="Permanently delete details in database (No restore possible)"
                              style={{
                                background: '#dc2626',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '0.3rem 0.55rem',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                cursor: 'pointer'
                              }}
                            >
                              💥 Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })

                )}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div style={{
            padding: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#11111a',
            borderTop: '1px solid #1f1f2e',
            fontSize: '0.85rem',
            color: '#9ca3af'
          }}>
            <div>
              Showing {registrations.length} of {pagination.total} records
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => fetchRegistrations(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                className="btn btn-ghost btn-sm"
              >
                Previous
              </button>
              <span style={{ padding: '0.4rem 0.8rem', color: '#fff' }}>
                Page {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchRegistrations(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="btn btn-ghost btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        </div>
        </>
        )}

        {/* =====================================================
            TWO-STEP REMOVAL CONFIRMATION MODAL (REQUIREMENT 2 & 3)
           ===================================================== */}
        {removeModalOpen && removeTargetReg && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem'
          }}>
            <div style={{
              background: '#11111a',
              border: '2px solid #ef4444',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '2rem',
              boxShadow: '0 20px 60px rgba(239, 68, 68, 0.3)'
            }}>
              {removeStep === 1 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '1.8rem' }}>⚠️</span>
                    <h3 style={{ color: '#ef4444', fontSize: '1.25rem', margin: 0, fontFamily: 'var(--font-heading)' }}>
                      Remove Registration (Step 1 of 2)
                    </h3>
                  </div>

                  {/* Summary of target registration */}
                  <div style={{
                    background: '#181826',
                    border: '1px solid #2a2a3e',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1.25rem',
                    fontSize: '0.88rem',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '0.4rem 1rem'
                  }}>
                    <span style={{ color: '#9ca3af' }}>Registration ID:</span>
                    <strong style={{ color: '#fff' }}>{removeTargetReg.id}</strong>

                    <span style={{ color: '#9ca3af' }}>Registrant Name:</span>
                    <strong style={{ color: '#fff' }}>{removeTargetReg.full_name}</strong>

                    <span style={{ color: '#9ca3af' }}>Participants:</span>
                    <span style={{ color: '#fff' }}>{removeTargetReg.participant_count}</span>

                    <span style={{ color: '#9ca3af' }}>Total Amount:</span>
                    <span style={{ color: '#ff8c33', fontWeight: 700 }}>₹{removeTargetReg.total_amount}</span>

                    <span style={{ color: '#9ca3af' }}>Current Status:</span>
                    <span style={{ color: '#fff' }}>{removeTargetReg.status}</span>

                    {removeTargetReg.ticket_number && (
                      <>
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>Issued Ticket:</span>
                        <strong style={{ color: '#ef4444' }}>{removeTargetReg.ticket_number} (Will be revoked)</strong>
                      </>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: '#f3f4f6' }}>
                      Reason for Removal <span className="required">*</span>
                    </label>
                    <textarea
                      value={removeReason}
                      onChange={(e) => setRemoveReason(e.target.value)}
                      className="form-input"
                      rows="3"
                      placeholder="e.g. Duplicate registration, refunded payment, requested by attendee..."
                      style={{ resize: 'vertical' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setRemoveModalOpen(false)}
                      className="btn btn-ghost btn-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleProceedToRemoveStep2}
                      className="btn btn-danger btn-sm"
                    >
                      Proceed to Confirm ➔
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <span style={{ fontSize: '3rem' }}>🚨</span>
                    <h3 style={{ color: '#ef4444', fontSize: '1.35rem', marginTop: '0.5rem', fontFamily: 'var(--font-heading)' }}>
                      Final Confirmation (Step 2 of 2)
                    </h3>
                    <p style={{ color: '#d1d5db', fontSize: '0.9rem', lineHeight: 1.5, margin: '1rem 0 0' }}>
                      Are you completely sure you want to cancel and archive registration <strong>{removeTargetReg.id}</strong>?
                    </p>
                    {removeTargetReg.ticket_number && (
                      <div style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid #ef4444',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        color: '#fca5a5',
                        fontSize: '0.85rem',
                        marginTop: '1rem'
                      }}>
                        ⚠️ Ticket <strong>{removeTargetReg.ticket_number}</strong> will be revoked and invalidated at gate verification.
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setRemoveStep(1)}
                      className="btn btn-ghost btn-sm"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteRemoval}
                      disabled={actionLoading}
                      className="btn btn-danger btn-sm"
                      style={{ padding: '0.6rem 1.5rem', fontWeight: 800 }}
                    >
                      {actionLoading ? 'Archiving...' : 'Yes, Confirm Removal'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* =====================================================
            REJECT MODAL
           ===================================================== */}
        {rejectModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem'
          }}>
            <div style={{ background: '#11111a', border: '1px solid #ef4444', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '1.75rem' }}>
              <h3 style={{ color: '#ef4444', marginBottom: '0.75rem', fontFamily: 'var(--font-heading)' }}>
                Reject Payment Submission
              </h3>
              <p style={{ color: '#9ca3af', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Specify rejection reason. This will be displayed on the attendee's ticket lookup page.
              </p>

              <div className="form-group">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="form-input"
                  rows="3"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReject}
                  disabled={actionLoading || !rejectReason.trim()}
                  className="btn btn-danger btn-sm"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            INSPECT DETAILS MODAL
           ===================================================== */}
        {inspectReg && inspectDetails && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem'
          }}>
            <div style={{
              background: '#11111a',
              border: '1px solid #ff6b00',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '2rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ color: '#ff8c33', margin: 0, fontFamily: 'var(--font-heading)' }}>
                  Registration Inspection: {inspectReg.id}
                </h3>
                <button
                  onClick={() => setInspectReg(null)}
                  style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ background: '#181826', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1rem' }}>
                  <span style={{ color: '#9ca3af' }}>Name:</span>
                  <strong>{inspectReg.full_name}</strong>

                  <span style={{ color: '#9ca3af' }}>Phone:</span>
                  <span>{inspectReg.phone}</span>

                  <span style={{ color: '#9ca3af' }}>Participants:</span>
                  <span>{inspectReg.participant_count}</span>

                  <span style={{ color: '#9ca3af' }}>Amount:</span>
                  <span style={{ color: '#ff8c33', fontWeight: 700 }}>₹{inspectReg.total_amount}</span>

                  <span style={{ color: '#9ca3af' }}>Location:</span>
                  <span>{inspectReg.place}, {inspectReg.district}, {inspectReg.state}</span>

                  <span style={{ color: '#9ca3af' }}>Status:</span>
                  <strong style={{ color: '#4ade80' }}>{inspectReg.status}</strong>

                  {inspectReg.cancellation_reason && (
                    <>
                      <span style={{ color: '#ef4444' }}>Cancel Reason:</span>
                      <span style={{ color: '#fca5a5' }}>{inspectReg.cancellation_reason}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Submissions History */}
              <h4 style={{ color: '#f3f4f6', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                Payment Submissions & UTRs ({inspectDetails.paymentSubmissions?.length || 0})
              </h4>
              <div style={{ maxHeight: '160px', overflowY: 'auto', background: '#0a0a0f', borderRadius: '8px', padding: '0.75rem', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
                {inspectDetails.paymentSubmissions?.length ? (
                  inspectDetails.paymentSubmissions.map((s, idx) => (
                    <div key={idx} style={{ padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>UTR: <strong style={{ color: '#fbbf24' }}>{s.utr_reference}</strong> ({s.status})</div>
                      <div style={{ color: '#6b7280' }}>Submitted: {new Date(s.submitted_at).toLocaleString()}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#6b7280' }}>No submissions recorded</div>
                )}
              </div>

              {/* Audit Trail */}
              <h4 style={{ color: '#f3f4f6', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                Audit Trail ({inspectDetails.auditLog?.length || 0})
              </h4>
              <div style={{ maxHeight: '160px', overflowY: 'auto', background: '#0a0a0f', borderRadius: '8px', padding: '0.75rem', fontSize: '0.82rem' }}>
                {inspectDetails.auditLog?.length ? (
                  inspectDetails.auditLog.map((a, idx) => (
                    <div key={idx} style={{ padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div><strong>{a.action}</strong> by {a.admin_username}</div>
                      <div style={{ color: '#9ca3af' }}>{a.details}</div>
                      <div style={{ color: '#6b7280' }}>{new Date(a.created_at).toLocaleString()}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#6b7280' }}>No audit logs</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    openPermanentDeleteModal(inspectReg);
                  }}
                  style={{
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.45rem 1rem',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  💥 Permanently Delete in Database
                </button>
                <button
                  type="button"
                  onClick={() => setInspectReg(null)}
                  className="btn btn-ghost btn-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            SAFE DUPLICATE RECONCILIATION MODAL
           ===================================================== */}
        {resolveModalOpen && resolvePair && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem'
          }}>
            <div style={{
              background: '#11111a',
              border: '2px solid #ff6b00',
              borderRadius: '16px',
              maxWidth: '620px',
              width: '100%',
              padding: '2rem',
              boxShadow: '0 20px 60px rgba(255, 107, 0, 0.25)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '1.8rem' }}>⚖️</span>
                <h3 style={{ color: '#ff8c33', fontSize: '1.25rem', margin: 0, fontFamily: 'var(--font-heading)' }}>
                  Safe Duplicate Reconciliation
                </h3>
              </div>

              {/* Pair Comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                {/* Canonical to keep */}
                <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid #22c55e', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    ✅ KEEP AS CANONICAL
                  </div>
                  <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <div>ID: <strong style={{ fontFamily: 'monospace' }}>{resolvePair.primary.id}</strong></div>
                    <div>Name: <strong>{resolvePair.primary.full_name}</strong></div>
                    <div>Phone: {resolvePair.primary.phone}</div>
                    <div>Amount: ₹{resolvePair.primary.total_amount}</div>
                    <div>Status: <span style={{ color: '#4ade80' }}>{resolvePair.primary.status}</span></div>
                    {resolvePair.primary.ticket_number && (
                      <div style={{ color: '#4ade80' }}>Ticket: {resolvePair.primary.ticket_number}</div>
                    )}
                  </div>
                </div>

                {/* Duplicate to archive */}
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid #ef4444', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ color: '#f87171', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    ❌ CANCEL & ARCHIVE
                  </div>
                  <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <div>ID: <strong style={{ fontFamily: 'monospace' }}>{resolvePair.duplicate.id}</strong></div>
                    <div>Name: <strong>{resolvePair.duplicate.full_name}</strong></div>
                    <div>Phone: {resolvePair.duplicate.phone}</div>
                    <div>Amount: ₹{resolvePair.duplicate.total_amount}</div>
                    <div>Status: <span style={{ color: '#f87171' }}>{resolvePair.duplicate.status}</span></div>
                    {resolvePair.duplicate.ticket_number && (
                      <div style={{ color: '#ef4444' }}>Ticket: {resolvePair.duplicate.ticket_number} (Revoking)</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Safety notice */}
              <div style={{
                background: '#181826',
                border: '1px solid #2a2a3e',
                borderRadius: '8px',
                padding: '0.85rem',
                fontSize: '0.82rem',
                color: '#d1d5db',
                marginBottom: '1.25rem',
                lineHeight: 1.5
              }}>
                🛡️ <strong>Preserving Data & Audit Integrity:</strong> The duplicate record is retained with status <code>CANCELLED</code> and an audit trail. Financial records are preserved for dispute resolution. If a ticket was issued for the duplicate, it will be invalidated at entry gates.
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: '#f3f4f6' }}>
                  Reconciliation Note / Reason <span className="required">*</span>
                </label>
                <textarea
                  value={resolveReason}
                  onChange={(e) => setResolveReason(e.target.value)}
                  className="form-input"
                  rows="2"
                  style={{ resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setResolveModalOpen(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteResolve}
                  disabled={actionLoading || !resolveReason.trim()}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#ff6b00', fontWeight: 700 }}
                >
                  {actionLoading ? 'Reconciling...' : 'Confirm Reconciliation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            FLAG FOR REVIEW MODAL
           ===================================================== */}
        {flagModalOpen && flagTargetId && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem'
          }}>
            <div style={{
              background: '#11111a',
              border: '2px solid #ef4444',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '1.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.8rem' }}>🚩</span>
                <h3 style={{ color: '#ef4444', fontSize: '1.25rem', margin: 0, fontFamily: 'var(--font-heading)' }}>
                  Flag Registration for Review
                </h3>
              </div>

              <p style={{ color: '#9ca3af', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Flagging registration <strong style={{ color: '#fff' }}>{flagTargetId}</strong> will segregate it into the review queue and prevent approval until verified.
              </p>

              <div className="form-group">
                <label className="form-label" style={{ color: '#f3f4f6' }}>
                  Reason for Flagging <span className="required">*</span>
                </label>
                <textarea
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="form-input"
                  rows="3"
                  placeholder="e.g. Conflicting transaction claim, suspicious duplicate..."
                  style={{ resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setFlagModalOpen(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteFlag}
                  disabled={actionLoading || !flagReason.trim()}
                  className="btn btn-danger btn-sm"
                  style={{ fontWeight: 700 }}
                >
                  {actionLoading ? 'Flagging...' : 'Confirm Flag'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            PERMANENT DELETE REGISTRATION MODAL (NO RESTORE)
           ===================================================== */}
        {permanentDeleteModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '1rem'
          }}>
            <div style={{
              background: '#11111a',
              border: '2px solid #ef4444',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '2rem',
              boxShadow: '0 25px 70px rgba(239, 68, 68, 0.35)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '2rem' }}>💥</span>
                <h3 style={{ color: '#ef4444', fontSize: '1.3rem', margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 900 }}>
                  Permanent Delete in Database
                </h3>
              </div>

              <div style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                color: '#fca5a5',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                marginBottom: '1.25rem'
              }}>
                <strong>⚠️ IRREVERSIBLE ACTION:</strong> This will permanently delete this registration, associated tickets, payment sessions, and UTR submissions from the database. <strong>There is NO restore possible.</strong>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ color: '#f3f4f6', fontWeight: 700 }}>
                  Registration ID to Permanently Delete:
                </label>
                <input
                  type="text"
                  value={permanentDeleteInputId}
                  onChange={(e) => setPermanentDeleteInputId(e.target.value)}
                  placeholder="e.g. SPH-20261024-XXXXXX"
                  className="form-input"
                  style={{ background: '#0a0a0f', fontFamily: 'monospace', fontSize: '0.95rem' }}
                />
              </div>

              {permanentDeleteTarget?.full_name && (
                <div style={{ background: '#0a0a0f', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                  <div style={{ color: '#9ca3af' }}>Name: <strong style={{ color: '#fff' }}>{permanentDeleteTarget.full_name}</strong></div>
                  <div style={{ color: '#9ca3af' }}>Phone: <span style={{ color: '#d1d5db' }}>{permanentDeleteTarget.phone}</span></div>
                  {permanentDeleteTarget.utr_reference && (
                    <div style={{ color: '#9ca3af' }}>UTR: <span style={{ color: '#fbbf24', fontFamily: 'monospace' }}>{permanentDeleteTarget.utr_reference}</span></div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setPermanentDeleteModalOpen(false);
                    setPermanentDeleteTarget(null);
                  }}
                  className="btn btn-ghost btn-sm"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecutePermanentDelete}
                  disabled={actionLoading || !permanentDeleteInputId.trim()}
                  className="btn btn-danger btn-sm"
                  style={{
                    background: '#dc2626',
                    color: '#fff',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 800,
                    padding: '0.55rem 1.25rem'
                  }}
                >
                  {actionLoading ? 'Deleting...' : '💥 Permanently Delete (No Restore)'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            DELETE ALL REGISTRATIONS MODAL (WIPE DB - NO RESTORE)
           ===================================================== */}
        {deleteAllModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.9)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1300,
            padding: '1rem'
          }}>
            <div style={{
              background: '#0e0b12',
              border: '3px solid #dc2626',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              padding: '2.25rem',
              boxShadow: '0 0 80px rgba(220, 38, 38, 0.5)'
            }}>
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.5rem' }}>🚨</span>
                <h2 style={{
                  color: '#ef4444',
                  fontSize: '1.45rem',
                  margin: 0,
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 900,
                  letterSpacing: '1px',
                  textTransform: 'uppercase'
                }}>
                  Permanent Database Purge: Delete All
                </h2>
                <div style={{ color: '#f87171', fontWeight: 800, fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  ALL REGISTRATIONS, TICKETS &amp; PAYMENTS WILL BE DESTROYED
                </div>
              </div>

              <div style={{
                background: 'rgba(220, 38, 38, 0.15)',
                border: '1px solid #dc2626',
                borderRadius: '8px',
                padding: '1rem',
                color: '#fca5a5',
                fontSize: '0.88rem',
                lineHeight: 1.5,
                marginBottom: '1.5rem'
              }}>
                <p style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>
                  ⚠️ This action will permanently erase:
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  <li>All attendee registrations</li>
                  <li>All payment reference submissions &amp; sessions</li>
                  <li>All issued tickets &amp; QR access codes</li>
                </ul>
                <p style={{ margin: '0.75rem 0 0', fontWeight: 800, color: '#f87171' }}>
                  There is NO RESTORE possible after this action.
                </p>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ color: '#f3f4f6', fontSize: '0.88rem', fontWeight: 700 }}>
                  To confirm permanent deletion of all data, type <strong style={{ color: '#ef4444' }}>DELETE ALL</strong> below:
                </label>
                <input
                  type="text"
                  value={deleteAllConfirmation}
                  onChange={(e) => setDeleteAllConfirmation(e.target.value)}
                  placeholder="DELETE ALL"
                  className="form-input"
                  style={{
                    background: '#000',
                    border: '2px solid #dc2626',
                    color: '#fff',
                    fontWeight: 900,
                    letterSpacing: '2px',
                    textAlign: 'center',
                    fontSize: '1.05rem',
                    textTransform: 'uppercase'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteAllModalOpen(false);
                    setDeleteAllConfirmation('');
                  }}
                  className="btn btn-ghost btn-sm"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDeleteAll}
                  disabled={actionLoading || deleteAllConfirmation.trim() !== 'DELETE ALL'}
                  className="btn btn-danger btn-sm"
                  style={{
                    background: 'linear-gradient(135deg, #dc2626, #7f1d1d)',
                    color: '#fff',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 900,
                    padding: '0.65rem 1.5rem',
                    boxShadow: '0 0 20px rgba(220, 38, 38, 0.4)'
                  }}
                >
                  {actionLoading ? 'Purging Database...' : '💥 Confirm Delete All (Wipe Database)'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

