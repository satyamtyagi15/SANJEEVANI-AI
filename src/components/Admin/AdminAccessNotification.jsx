import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Bell, Check, X, ShieldAlert, User, ChevronRight } from 'lucide-react';

export default function AdminAccessNotification({ adminToken }) {
  const pendingRequests = useQuery(
    api.auth.getPendingAccessRequests, 
    adminToken ? { adminToken } : "skip"
  ) || [];

  const setApprovalMutation = useMutation(api.auth.setApprovalStatus);
  const [processingId, setProcessingId] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);

  if (!pendingRequests || pendingRequests.length === 0) {
    return null; // No pending requests, render nothing
  }

  const handleDecision = async (userId, status) => {
    try {
      setProcessingId(userId);
      await setApprovalMutation({
        adminToken,
        targetUserId: userId,
        status,
      });
    } catch (err) {
      alert("Error updating access status: " + (err.data || err.message));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: '1rem',
      right: '1.5rem',
      zIndex: 9999,
      maxWidth: '460px',
      width: 'calc(100% - 3rem)',
      animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulseBorder {
          0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.5), 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
          50% { box-shadow: 0 0 30px rgba(56, 189, 248, 0.8), 0 10px 30px -5px rgba(0, 0, 0, 0.7); }
        }
      `}</style>

      <div style={{
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '2px solid #38bdf8',
        borderRadius: '16px',
        padding: '1.25rem',
        animation: 'pulseBorder 2.5s infinite',
        color: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: isMinimized ? 0 : '1rem',
          borderBottom: isMinimized ? 'none' : '1px solid #334155',
          paddingBottom: isMinimized ? 0 : '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              background: '#38bdf8',
              color: '#0f172a',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.6)'
            }}>
              <Bell size={16} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#f8fafc' }}>
                Access Request Alert
              </h4>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: '600' }}>
                {pendingRequests.length} {pendingRequests.length === 1 ? 'user waiting' : 'users waiting'} for your approval
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsMinimized(!isMinimized)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: '600'
            }}>
            {isMinimized ? 'Expand' : 'Collapse'}
          </button>
        </div>

        {/* Requests List */}
        {!isMinimized && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '340px', overflowY: 'auto' }}>
            {pendingRequests.map((req) => (
              <div
                key={req._id}
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem'
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <User size={14} color="#38bdf8" />
                      {req.name || 'Unnamed User'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                      {req.email}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.7rem',
                    color: '#fcd34d',
                    background: 'rgba(245, 158, 11, 0.15)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid rgba(245, 158, 11, 0.3)'
                  }}>
                    PENDING
                  </span>
                </div>

                <div style={{
                  fontSize: '0.78rem',
                  color: '#cbd5e1',
                  background: '#0f172a',
                  padding: '0.5rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #1e293b'
                }}>
                  Wants to explore <strong>Sanjeevani AI</strong>. App access is currently blocked.
                </div>

                {/* Allow & Reject Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <button
                    disabled={processingId === req._id}
                    onClick={() => handleDecision(req._id, 'approved')}
                    style={{
                      flex: 1,
                      background: '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0.55rem',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: processingId === req._id ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      transition: 'background 0.2s',
                      boxShadow: '0 0 10px rgba(16, 185, 129, 0.3)'
                    }}>
                    <Check size={16} /> Allow Access
                  </button>

                  <button
                    disabled={processingId === req._id}
                    onClick={() => handleDecision(req._id, 'rejected')}
                    style={{
                      flex: 1,
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#f87171',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      padding: '0.55rem',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      cursor: processingId === req._id ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      transition: 'background 0.2s'
                    }}>
                    <X size={16} /> Reject Access
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

