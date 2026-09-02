import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useCustomAuth } from '../../context/AuthContext';
import { ShieldCheck, UserX, Key, Trash2 } from 'lucide-react';

export default function DeveloperDashboard() {
  const { token, user } = useCustomAuth();
  const users = useQuery(api.auth.getAllUsers, { adminToken: token });
  const banUser = useMutation(api.auth.banUser);
  const deleteUser = useMutation(api.auth.deleteUserAccount);
  const changePassword = useMutation(api.auth.changeUserPassword);
  
  const [newPasswords, setNewPasswords] = useState({});

  if (!user || user.role !== 'developer') {
    return <div style={{ padding: '2rem', color: '#f87171' }}>Access Denied. Developer only.</div>;
  }

  const handleBan = async (targetUserId) => {
    try { await banUser({ adminToken: token, targetUserId }); } 
    catch(e) { alert(e.message); }
  };

  const handleDelete = async (targetUserId) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      try { await deleteUser({ adminToken: token, targetUserId }); } 
      catch(e) { alert(e.message); }
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

  return (
    <div style={{ padding: '2rem', color: '#fff', background: '#0f172a', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <ShieldCheck size={32} color="#3b82f6" />
        <h1 style={{ margin: 0 }}>Developer Dashboard</h1>
      </div>
      
      <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#334155', textAlign: 'left' }}>
              <th style={{ padding: '1rem' }}>Email</th>
              <th style={{ padding: '1rem' }}>Name</th>
              <th style={{ padding: '1rem' }}>Password (Plaintext)</th>
              <th style={{ padding: '1rem' }}>Status</th>
              <th style={{ padding: '1rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users?.map(u => (
              <tr key={u._id} style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ padding: '1rem' }}>{u.email}</td>
                <td style={{ padding: '1rem' }}>{u.name || '-'}</td>
                <td style={{ padding: '1rem', fontFamily: 'monospace', color: '#fef08a' }}>{u.password}</td>
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
            {!users && <tr><td colSpan="5" style={{ padding: '1rem', textAlign: 'center' }}>Loading...</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
