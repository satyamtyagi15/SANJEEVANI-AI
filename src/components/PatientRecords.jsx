import React, { useState } from 'react';
import { Database, FolderOpen, Trash2, Activity, Calendar, CheckSquare, Square, AlertOctagon } from 'lucide-react';
import TriageCard from './TriageCard';
import { showAlert } from '../services/AlertService';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useCustomAuth } from '../context/AuthContext';

const PatientRecords = () => {
  const { user } = useCustomAuth();
  const reports = useQuery(api.records.getAllRecords);
  const deleteRecord = useMutation(api.records.deleteRecord);
  
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  // Admin permission check (Satyam Tyagi / developer role)
  const isAdmin = user?.role === 'developer' || 
    user?.email === 'satyamtyagiji15@gmail.com' || 
    (user?.email && user.email.toLowerCase().includes('satyam'));

  const handleDelete = async (e, id) => {
    e.stopPropagation(); // prevent expanding
    if (!window.confirm('Are you sure you want to permanently delete this report from Patient Records?')) return;
    
    try {
      await deleteRecord({ recordId: id });
      showAlert('Report deleted successfully.', 'success');
      if (expandedId === id) setExpandedId(null);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error(err);
      showAlert('Failed to delete report.', 'error');
    }
  };

  // Toggle individual record selection
  const handleToggleSelect = (e, id) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle Select All
  const handleToggleSelectAll = () => {
    if (!reports) return;
    if (selectedIds.size === reports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reports.map(r => r._id)));
    }
  };

  // Delete Selected Records
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Are you sure you want to permanently delete the ${count} selected record(s)? This action cannot be undone.`)) return;

    setIsProcessing(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      await Promise.all(idsToDelete.map(id => deleteRecord({ recordId: id })));
      showAlert(`Successfully deleted ${count} selected record(s).`, 'success');
      setSelectedIds(new Set());
      if (idsToDelete.includes(expandedId)) setExpandedId(null);
    } catch (err) {
      console.error(err);
      showAlert('Failed to delete selected records.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete All Records
  const handleDeleteAll = async () => {
    if (!reports || reports.length === 0) return;
    if (!window.confirm(`⚠️ DANGER: Are you sure you want to permanently wipe ALL ${reports.length} records from the entire database? This action cannot be undone.`)) return;

    setIsProcessing(true);
    try {
      await Promise.all(reports.map(r => deleteRecord({ recordId: r._id })));
      showAlert(`Successfully wiped all ${reports.length} records from database.`, 'success');
      setSelectedIds(new Set());
      setExpandedId(null);
    } catch (err) {
      console.error(err);
      showAlert('Failed to delete all records.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const isLoading = reports === undefined;
  const isAllSelected = reports && reports.length > 0 && selectedIds.size === reports.length;

  return (
    <div className="dashboard-section" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      {/* Header with Admin Management Controls */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '1.5rem', 
        borderBottom: '1px solid rgba(59, 130, 246, 0.2)', 
        paddingBottom: '1rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h1 style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.8rem', margin: 0 }}>
            <Database size={32} /> Patient Records Database
          </h1>
          <p style={{ color: '#a1a1aa', marginTop: '0.5rem', margin: 0 }}>
            Permanent storage of all saved ER Triage, Clinical profiles and AI reports.
          </p>
        </div>

        {/* Admin Action Buttons */}
        {reports && reports.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {selectedIds.size > 0 && (
              <button
                disabled={isProcessing}
                onClick={handleDeleteSelected}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  padding: '0.6rem 1.1rem',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.35)',
                  opacity: isProcessing ? 0.6 : 1
                }}>
                <Trash2 size={16} /> Delete Selected ({selectedIds.size})
              </button>
            )}

            <button
              disabled={isProcessing}
              onClick={handleDeleteAll}
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#f87171',
                border: '1px solid #ef4444',
                padding: '0.6rem 1.1rem',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '0.85rem',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                opacity: isProcessing ? 0.6 : 1
              }}>
              <AlertOctagon size={16} /> Delete All Records ({reports.length})
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#71717a' }}>
          <Activity size={48} className="spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <p>Connecting to secure database...</p>
        </div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#71717a' }}>
          <FolderOpen size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <p>No records found in the database. Save a report from ER Triage to see it here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Select All Sub-Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(24, 24, 27, 0.8)',
            border: '1px solid #27272a',
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            fontSize: '0.85rem'
          }}>
            <div 
              onClick={handleToggleSelectAll}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none', color: '#e4e4e7' }}>
              {isAllSelected ? (
                <CheckSquare size={18} color="#3b82f6" />
              ) : (
                <Square size={18} color="#71717a" />
              )}
              <span style={{ fontWeight: '600' }}>
                Select All ({reports.length} Records)
              </span>
            </div>

            {selectedIds.size > 0 && (
              <span style={{ color: '#38bdf8', fontWeight: '500' }}>
                {selectedIds.size} of {reports.length} selected
              </span>
            )}
          </div>

          {/* Records List */}
          {reports.map((report) => {
            const isSelected = selectedIds.has(report._id);
            return (
              <div 
                key={report._id} 
                style={{ 
                  background: isSelected ? 'rgba(59, 130, 246, 0.08)' : '#18181b', 
                  border: isSelected ? '1px solid #3b82f6' : '1px solid #27272a', 
                  borderRadius: '12px', 
                  overflow: 'hidden',
                  transition: 'border 0.2s, background 0.2s'
                }}>
                {/* Collapsed Header */}
                <div 
                  onClick={() => toggleExpand(report._id)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '1rem 1.25rem', 
                    cursor: 'pointer', 
                    background: expandedId === report._id ? 'rgba(59, 130, 246, 0.05)' : 'transparent', 
                    transition: 'background 0.2s',
                    flexWrap: 'wrap',
                    gap: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                    {/* Checkbox */}
                    <div 
                      onClick={(e) => handleToggleSelect(e, report._id)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.2rem' }}>
                      {isSelected ? (
                        <CheckSquare size={19} color="#3b82f6" />
                      ) : (
                        <Square size={19} color="#52525b" />
                      )}
                    </div>

                    <div style={{ minWidth: '130px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '1px', display: 'block' }}>Patient ID</span>
                      <strong style={{ color: '#e4e4e7', fontSize: '0.9rem' }}>{report.patientId}</strong>
                    </div>

                    <div style={{ minWidth: '140px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '1px', display: 'block' }}>Report Type</span>
                      <span style={{ color: '#93c5fd', background: 'rgba(59, 130, 246, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.82rem', fontWeight: '500' }}>
                        {report.type}
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '1px', display: 'block' }}>Saved On</span>
                      <span style={{ color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
                        <Calendar size={14} /> {new Date(report.savedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: '#3b82f6', fontSize: '0.85rem', fontWeight: '500' }}>
                      {expandedId === report._id ? 'Close Record' : 'View Record'}
                    </span>
                    <button 
                      onClick={(e) => handleDelete(e, report._id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem', opacity: 0.8 }}
                      title="Delete Record"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedId === report._id && (
                  <div style={{ borderTop: '1px solid #27272a', padding: '1.5rem', background: '#09090b' }}>
                    {report.type === 'Triage' ? (
                      <TriageCard data={report.data} />
                    ) : (
                      <div style={{ color: '#a1a1aa' }}>
                        <h3 style={{ color: '#e4e4e7', marginTop: 0 }}>{report.type} Data</h3>
                        <pre style={{ background: 'var(--bg-dark)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', border: '1px solid #27272a', fontSize: '0.85rem' }}>
                          {JSON.stringify(report.data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PatientRecords;
