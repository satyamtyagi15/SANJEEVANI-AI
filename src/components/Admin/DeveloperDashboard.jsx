import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useCustomAuth } from '../../context/AuthContext';
import { ShieldCheck, UserX, Key, Trash2, Search, LogOut, Check, X, Bell } from 'lucide-react';

export default function DeveloperDashboard() {
  const { token, user, logout } = useCustomAuth();
  
  const users = useQuery(api.auth.getAllUsers, token ? { adminToken: token } : "skip") || [];
  const feedbacks = useQuery(api.feedback.getAllFeedback, token ? { adminToken: token } : "skip") || [];
  const records = useQuery(api.records.getAllRecords) || [];
  
  const banMutation = useMutation(api.auth.banUser);
  const deleteMutation = useMutation(api.auth.deleteUserAccount);
  const changePassword = useMutation(api.auth.changeUserPassword);
  const resolveFeedbackMutation = useMutation(api.feedback.resolveFeedback);
  const saveRecordMutation = useMutation(api.records.saveRecord);
  const deleteRecordMutation = useMutation(api.records.deleteRecord);

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("requests");
  const [newPasswords, setNewPasswords] = useState({});
  const [replyText, setReplyText] = useState({});
  const [actionLoading, setActionLoading] = useState(null);

  if (!user || user.role !== 'developer') {
    return <div style={{ padding: '2rem', color: '#f87171' }}>Access Denied. Developer only.</div>;
  }

  // Approved and Rejected Sets
  const approvalsMap = new Map();
  records.forEach(r => {
    if (r.type === 'access_approval' && r.data?.email) {
      approvalsMap.set(r.data.email.toLowerCase(), r);
    }
  });

  // Distinct pending requests
  const pendingMap = new Map();
  records.forEach(r => {
    if (r.type === 'access_request' && r.data?.email) {
      const email = r.data.email.toLowerCase();
      const existingApproval = approvalsMap.get(email);
      if (!existingApproval && !pendingMap.has(email)) {
        pendingMap.set(email, r);
      }
    }
  });

  const pendingRequests = Array.from(pendingMap.values());

  const handleBan = async (targetUserId) => {
    try { await banMutation({ adminToken: token, targetUserId }); } 
    catch(e) { alert(e.message); }
  };

  const handleDelete = async (targetUserId) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      try { await deleteMutation({ adminToken: token, targetUserId }); } 
      catch(e) { console.error(e); alert(e.message); }
    }
  };

  const handleChangePassword = async (targetUserId) => {
    const pwd = newPasswords[targetUserId];
    if (!pwd || pwd.length < 8) {
      alert("Please enter a valid password (min 8 chars) in the input box to change it.");
      return;
    }
    try {
      await changePassword({ adminToken: token, targetUserId, newPassword: pwd });
      alert("Password changed successfully!");
      setNewPasswords(prev => ({ ...prev, [targetUserId]: '' }));
    } catch(e) {
      alert(e.message);
    }
  };

  const handleApproval = async (email, name, status, reqRecordId = null) => {
    try {
      setActionLoading(email);
      // Remove any existing approval/rejection for this email
      const existingApproval = approvalsMap.get(email.toLowerCase());
      if (existingApproval) {
        await deleteRecordMutation({ recordId: existingApproval._id });
      }

      // Add new approval status
      await saveRecordMutation({
        patientId: email,
        type: 'access_approval',
        data: {
          email,
          name: name || email,
          status, // 'approved' or 'rejected'
          decidedAt: Date.now()
        }
      });

      // If resolving a pending request, delete the request item
      if (reqRecordId) {
        await deleteRecordMutation({ recordId: reqRecordId });
      }
    } catch (e) {
      alert("Error updating access status: " + (e.message || e));
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveFeedback = async (feedbackId) => {
    if (!replyText[feedbackId]) {
      alert("Please enter a reply to resolve the feedback.");
      return;
    }
    try {
      await resolveFeedbackMutation({ adminToken: token, feedbackId, reply: replyText[feedbackId] });
      alert("Feedback resolved!");
    } catch (err) {
      alert(err.data || err.message);
    }
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(search.toLowerCase()) || 
    (u.name && u.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ padding: '2rem', color: '#fff', background: '#0f172a', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <ShieldCheck size={32} color="#3b82f6" />
          <h1 style={{ margin: 0 }}>Developer Dashboard</h1>
        </div>
        <button onClick={logout} style={{ background: '#ef4444', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 'bold', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LogOut size={16} /> Logout Admin
        </button>
      </div>
      
      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveTab("requests")}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            background: activeTab === "requests" ? '#3b82f6' : '#1e293b',
            color: '#fff',
            border: activeTab === "requests" ? '1px solid #60a5fa' : '1px solid #334155',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
          <Bell size={18} color={pendingRequests.length > 0 ? '#fcd34d' : '#94a3b8'} />
          <span>Access Requests</span>
          {pendingRequests.length > 0 && (
            <span style={{
              background: '#ef4444',
              color: '#fff',
              fontSize: '0.75rem',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px',
              fontWeight: 'bold',
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)'
            }}>
              {pendingRequests.length} NEW
            </span>
          )}
        </button>

        <button 
          onClick={() => setActiveTab("users")}
          style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', background: activeTab === "users" ? '#3b82f6' : '#1e293b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          All Users ({users.length})
        </button>

        <button 
          onClick={() => setActiveTab("feedbacks")}
          style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', background: activeTab === "feedbacks" ? '#3b82f6' : '#1e293b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          User Feedbacks ({feedbacks.length})
        </button>
      </div>

      {/* Access Requests Tab */}
      {activeTab === "requests" && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem', color: '#f8fafc' }}>
              Pending Access Approvals
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
              These users want to explore Sanjeevani AI. They are currently locked on the <em>"Waiting for Admin's Approval"</em> screen. Allow or reject access below.
            </p>
          </div>

          {pendingRequests.length === 0 ? (
            <div style={{
              background: '#1e293b',
              borderRadius: '12px',
              padding: '3rem',
              textAlign: 'center',
              border: '1px solid #334155'
            }}>
              <ShieldCheck size={48} color="#10b981" style={{ margin: '0 auto 1rem' }} />
              <h3 style={{ margin: '0 0 0.5rem', color: '#f1f5f9' }}>All Caught Up!</h3>
              <p style={{ color: '#94a3b8', margin: 0 }}>No users are currently waiting for access approval.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
              {pendingRequests.map(req => {
                const email = req.data?.email;
                return (
                  <div key={req._id} style={{
                    background: '#1e293b',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '1px solid #f59e0b',
                    boxShadow: '0 4px 15px rgba(245, 158, 11, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', color: '#fff' }}>
                          {req.data?.name || 'Unnamed User'}
                        </h3>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{email}</div>
                      </div>
                      <span style={{
                        background: 'rgba(245, 158, 11, 0.2)',
                        color: '#fcd34d',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        padding: '0.25rem 0.65rem',
                        borderRadius: '999px',
                        border: '1px solid #f59e0b'
                      }}>
                        WAITING
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1', background: '#0f172a', padding: '0.75rem', borderRadius: '8px' }}>
                      <div><strong>Requested:</strong> {new Date(req.savedAt || req.data?.requestedAt || Date.now()).toLocaleString()}</div>
                      <div style={{ marginTop: '0.25rem', color: '#38bdf8' }}>Status: Blocked until approved</div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto' }}>
                      <button
                        disabled={actionLoading === email}
                        onClick={() => handleApproval(email, req.data?.name, 'approved', req._id)}
                        style={{
                          flex: 1,
                          background: '#10b981',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
                        }}>
                        <Check size={18} /> Allow Access
                      </button>

                      <button
                        disabled={actionLoading === email}
                        onClick={() => handleApproval(email, req.data?.name, 'rejected', req._id)}
                        style={{
                          flex: 1,
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: '#f87171',
                          border: '1px solid #ef4444',
                          borderRadius: '8px',
                          padding: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem'
                        }}>
                        <X size={18} /> Reject Access
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Users Management Tab */}
      {activeTab === "users" && (
        <>
          <div style={{ marginBottom: '1.5rem', position: 'relative', maxWidth: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: '#fff' }}
            />
          </div>
          <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#334155', textAlign: 'left' }}>
                  <th style={{ padding: '1rem' }}>User Info</th>
                  <th style={{ padding: '1rem' }}>Password</th>
                  <th style={{ padding: '1rem' }}>Access Status</th>
                  <th style={{ padding: '1rem' }}>Account Status</th>
                  <th style={{ padding: '1rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const emailLower = u.email?.toLowerCase();
                  const approvalRecord = approvalsMap.get(emailLower);
                  const isApproved = u.role === 'developer' || approvalRecord?.data?.status === 'approved';
                  const isRejected = approvalRecord?.data?.status === 'rejected';

                  return (
                    <tr key={u._id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: '600', color: '#fff' }}>{u.name || 'Unnamed'}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{u.email}</div>
                        {u.role === 'developer' && (
                          <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 'bold' }}>ADMIN (DEVELOPER)</span>
                        )}
                      </td>

                      <td style={{ padding: '1rem', fontFamily: 'monospace', color: '#fbbf24', fontSize: '0.9rem' }}>
                        {u.password || '-'}
                      </td>

                      {/* App Access Approval Column */}
                      <td style={{ padding: '1rem' }}>
                        {u.role === 'developer' ? (
                          <span style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '0.85rem' }}>Full Developer Access</span>
                        ) : isApproved ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                              background: 'rgba(16, 185, 129, 0.2)',
                              color: '#34d399',
                              padding: '0.25rem 0.65rem',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              border: '1px solid #10b981'
                            }}>
                              APPROVED
                            </span>
                            <button
                              onClick={() => handleApproval(u.email, u.name, 'rejected')}
                              style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>
                              Revoke
                            </button>
                          </div>
                        ) : isRejected ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#f87171',
                              padding: '0.25rem 0.65rem',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              border: '1px solid #ef4444'
                            }}>
                              REJECTED
                            </span>
                            <button
                              onClick={() => handleApproval(u.email, u.name, 'approved')}
                              style={{ background: 'transparent', border: 'none', color: '#34d399', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>
                              Allow
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                              background: 'rgba(245, 158, 11, 0.2)',
                              color: '#fcd34d',
                              padding: '0.25rem 0.65rem',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              border: '1px solid #f59e0b'
                            }}>
                              PENDING
                            </span>
                            <button
                              onClick={() => handleApproval(u.email, u.name, 'approved')}
                              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                              Allow
                            </button>
                            <button
                              onClick={() => handleApproval(u.email, u.name, 'rejected')}
                              style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                              Reject
                            </button>
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '1rem' }}>
                        <span style={{ color: u.isBanned ? '#f87171' : '#4ade80', fontWeight: '600', fontSize: '0.85rem' }}>
                          {u.isBanned ? 'Banned' : 'Active'}
                        </span>
                      </td>

                      <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {u.role !== 'developer' && (
                          <>
                            <button onClick={() => handleBan(u._id)} style={{ background: u.isBanned ? '#4ade80' : '#f59e0b', color: '#fff', border: 'none', padding: '0.45rem 0.65rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
                              <UserX size={14} /> {u.isBanned ? 'Unban' : 'Ban'}
                            </button>
                            <button onClick={() => handleDelete(u._id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.45rem 0.65rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
                              <Trash2 size={14} /> Delete
                            </button>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <input 
                                type="text" 
                                placeholder="New Pass" 
                                value={newPasswords[u._id] || ''}
                                onChange={(e) => setNewPasswords(prev => ({ ...prev, [u._id]: e.target.value }))}
                                style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: '#fff', width: '90px', fontSize: '0.8rem' }}
                              />
                              <button onClick={() => handleChangePassword(u._id)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.45rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
                                <Key size={14} />
                              </button>
                            </div>
                          </>
                        )}
                        {u.role === 'developer' && <span style={{ color: '#94a3b8' }}>Admin</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Feedbacks Tab */}
      {activeTab === "feedbacks" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {feedbacks.map((fb) => (
            <div key={fb._id} style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '8px', borderLeft: fb.status === 'resolved' ? '4px solid #4ade80' : '4px solid #fbbf24' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0', color: '#e2e8f0' }}>From: {fb.userEmail}</h3>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {new Date(fb.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ background: fb.status === 'resolved' ? '#064e3b' : '#78350f', color: fb.status === 'resolved' ? '#34d399' : '#fbbf24', padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 'bold', height: 'fit-content' }}>
                  {fb.status.toUpperCase()}
                </div>
              </div>
              <p style={{ color: '#cbd5e1', lineHeight: '1.6', background: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
                {fb.message}
              </p>
              
              {fb.status === 'pending' ? (
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    placeholder="Type your reply to resolve..." 
                    value={replyText[fb._id] || ''}
                    onChange={(e) => setReplyText({...replyText, [fb._id]: e.target.value})}
                    style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
                  />
                  <button onClick={() => handleResolveFeedback(fb._id)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0 1.5rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Resolve
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: '1rem', padding: '1rem', background: '#064e3b', borderRadius: '8px', border: '1px solid #059669' }}>
                  <strong style={{ color: '#34d399' }}>Admin Reply:</strong>
                  <p style={{ color: '#a7f3d0', margin: '0.5rem 0 0 0' }}>{fb.adminReply}</p>
                </div>
              )}
            </div>
          ))}
          {feedbacks.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '3rem' }}>
              No feedbacks found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
