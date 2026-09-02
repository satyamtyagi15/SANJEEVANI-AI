import React, { useState, useEffect } from 'react';
import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useCustomAuth } from '../../context/AuthContext';
import { ShieldCheck, UserX, Key, Trash2, Search, LogOut } from 'lucide-react';

export default function DeveloperDashboard() {
  const { token, user, logout } = useCustomAuth();
  
  const users = useQuery(api.auth.getAllUsers, token ? { adminToken: token } : "skip") || [];
  const feedbacks = useQuery(api.feedback.getAllFeedback, token ? { adminToken: token } : "skip") || [];
  
  const banMutation = useMutation(api.auth.toggleBanStatus);
  const deleteMutation = useMutation(api.auth.deleteUserAccount);
  const changePassword = useMutation(api.auth.changeUserPassword);
  const resolveFeedbackMutation = useMutation(api.feedback.resolveFeedback);

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("users");
  const [newPasswords, setNewPasswords] = useState({});
  const [replyText, setReplyText] = useState({});

  if (!user || user.role !== 'developer') {
    return <div style={{ padding: '2rem', color: '#f87171' }}>Access Denied. Developer only.</div>;
  }

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
      
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab("users")}
          style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', background: activeTab === "users" ? '#3b82f6' : '#1e293b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          Users Management
        </button>
        <button 
          onClick={() => setActiveTab("feedbacks")}
          style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', background: activeTab === "feedbacks" ? '#3b82f6' : '#1e293b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          User Feedbacks
        </button>
      </div>

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
                  <th style={{ padding: '1rem' }}>Email</th>
                  <th style={{ padding: '1rem' }}>Name</th>
                  <th style={{ padding: '1rem' }}>Status</th>
                  <th style={{ padding: '1rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u._id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '1rem' }}>{u.email}</td>
                    <td style={{ padding: '1rem' }}>{u.name || '-'}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ color: u.isBanned ? '#f87171' : '#4ade80' }}>
                        {u.isBanned ? 'Banned' : 'Active'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {u.role !== 'developer' && (
                        <>
                          <button onClick={() => handleBan(u._id)} style={{ background: u.isBanned ? '#4ade80' : '#f59e0b', color: '#fff', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <UserX size={14} /> {u.isBanned ? 'Unban' : 'Ban'}
                          </button>
                          <button onClick={() => handleDelete(u._id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Trash2 size={14} /> Delete
                          </button>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <input 
                              type="text" 
                              placeholder="New Pass" 
                              value={newPasswords[u._id] || ''}
                              onChange={(e) => setNewPasswords(prev => ({ ...prev, [u._id]: e.target.value }))}
                              style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: '#fff', width: '100px' }}
                            />
                            <button onClick={() => handleChangePassword(u._id)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Key size={14} /> Change
                            </button>
                          </div>
                        </>
                      )}
                      {u.role === 'developer' && <span style={{ color: '#94a3b8' }}>Admin</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
