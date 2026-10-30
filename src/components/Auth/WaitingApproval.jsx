import React from 'react';
import { ShieldAlert, Clock, LogOut, Lock, Sparkles, RefreshCw } from 'lucide-react';
import '../../styles/App.css';

export default function WaitingApproval({ user, isRejected, onLogout }) {
  const rejected = isRejected || user?.approvalStatus === 'rejected';

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'radial-gradient(ellipse at top, #0f172a 0%, #020617 100%)',
      color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background glowing effects */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: rejected 
          ? 'radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)'
          : 'radial-gradient(circle, rgba(59, 130, 246, 0.18) 0%, transparent 70%)',
        filter: 'blur(60px)',
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none'
      }}></div>

      <div style={{
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: rejected ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: '20px',
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: '520px',
        boxShadow: rejected 
          ? '0 20px 40px -15px rgba(239, 68, 68, 0.25)'
          : '0 20px 50px -15px rgba(59, 130, 246, 0.3)',
        position: 'relative',
        zIndex: 10,
        textAlign: 'center'
      }}>
        {/* Animated Status Icon */}
        <div style={{
          width: '84px',
          height: '84px',
          borderRadius: '50%',
          background: rejected ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
          border: rejected ? '2px solid #ef4444' : '2px solid #3b82f6',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          margin: '0 auto 1.5rem',
          boxShadow: rejected ? '0 0 25px rgba(239, 68, 68, 0.4)' : '0 0 25px rgba(59, 130, 246, 0.4)',
          position: 'relative'
        }}>
          {rejected ? (
            <ShieldAlert size={42} color="#ef4444" />
          ) : (
            <Clock size={42} color="#3b82f6" />
          )}
          {!rejected && (
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 10px #38bdf8',
              animation: 'pulse 1.8s infinite'
            }}></span>
          )}
        </div>

        {/* Title & Tagline */}
        <div style={{
          fontSize: '0.8rem',
          fontWeight: '700',
          letterSpacing: '3px',
          color: rejected ? '#f87171' : '#38bdf8',
          textTransform: 'uppercase',
          marginBottom: '0.5rem'
        }}>
          SANJEEVANI AI • ACCESS VERIFICATION
        </div>

        <h2 style={{
          fontSize: '1.75rem',
          fontWeight: '800',
          margin: '0 0 0.75rem',
          color: '#ffffff',
          letterSpacing: '-0.5px'
        }}>
          {rejected ? 'Access Request Rejected' : "Waiting for Admin's Approval"}
        </h2>

        <p style={{
          color: '#94a3b8',
          fontSize: '0.95rem',
          lineHeight: '1.6',
          margin: '0 0 1.5rem'
        }}>
          {rejected ? (
            <>
              Administrator (<strong>Satyam</strong>) has rejected your access request for account <span style={{ color: '#f87171' }}>{user?.email}</span>. Please contact the administrator if you believe this is an error.
            </>
          ) : (
            <>
              Hello <strong style={{ color: '#f1f5f9' }}>{user?.name || user?.email}</strong>! Your request to explore the <strong>Sanjeevani AI Medical Command Center</strong> has been sent to the administrator (<strong>Satyam</strong>).
            </>
          )}
        </p>

        {/* Real-time Status Card */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.75rem',
          textAlign: 'left'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Live Status
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.25rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '700',
              background: rejected ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              color: rejected ? '#fca5a5' : '#fcd34d',
              border: rejected ? '1px solid #ef4444' : '1px solid #f59e0b'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: rejected ? '#ef4444' : '#f59e0b'
              }}></span>
              {rejected ? 'REJECTED' : 'PENDING APPROVAL'}
            </span>
          </div>

          <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
            {!rejected ? (
              <>
                🔒 <strong>All clinical features are locked:</strong> ER Triage, Digital Twin, Vision AI, AutoScribe, Guardian Monitor, and Pharmacovigilance.
                <div style={{ marginTop: '0.5rem', color: '#38bdf8', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={14} />
                  <span>The screen will automatically unlock in real-time as soon as admin clicks "Allow Access".</span>
                </div>
              </>
            ) : (
              <span>Your access privileges have been denied. Contact <strong style={{ color: '#fff' }}>satyamtyagiji15@gmail.com</strong>.</span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              flex: 1,
              background: 'rgba(51, 65, 85, 0.8)',
              color: '#f8fafc',
              border: '1px solid #475569',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}>
            <RefreshCw size={16} /> Check Status
          </button>

          <button
            onClick={onLogout}
            style={{
              flex: 1,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#fca5a5',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
