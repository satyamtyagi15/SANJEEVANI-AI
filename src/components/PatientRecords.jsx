import React, { useState } from 'react';
import { Database, FolderOpen, Trash2, Activity, Calendar } from 'lucide-react';
import TriageCard from './TriageCard';
import { showAlert } from '../services/AlertService';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

const PatientRecords = () => {
  const reports = useQuery(api.records.getAllRecords);
  const deleteRecord = useMutation(api.records.deleteRecord);
  
  const [expandedId, setExpandedId] = useState(null);

  const handleDelete = async (e, id) => {
    e.stopPropagation(); // prevent expanding
    if (!window.confirm('Are you sure you want to permanently delete this report from Patient Records?')) return;
    
    try {
      await deleteRecord({ recordId: id });
      showAlert('Report deleted successfully.', 'success');
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      console.error(err);
      showAlert('Failed to delete report.', 'error');
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const isLoading = reports === undefined;

  return (
    <div className="dashboard-section" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', paddingBottom: '1rem' }}>
        <div>
          <h1 style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.8rem', margin: 0 }}>
            <Database size={32} /> Patient Records Database
          </h1>
          <p style={{ color: '#a1a1aa', marginTop: '0.5rem' }}>Permanent storage of all saved ER Triage and AI reports.</p>
        </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reports.map((report) => (
            <div key={report._id} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', overflow: 'hidden' }}>
              {/* Collapsed Header */}
              <div 
                onClick={() => toggleExpand(report._id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', cursor: 'pointer', background: expandedId === report._id ? 'rgba(59, 130, 246, 0.05)' : 'transparent', transition: 'background 0.2s' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <div style={{ width: '120px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '1px', display: 'block' }}>Patient ID</span>
                    <strong style={{ color: '#e4e4e7' }}>{report.patientId}</strong>
                  </div>
                  <div style={{ width: '150px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '1px', display: 'block' }}>Report Type</span>
                    <span style={{ color: '#93c5fd', background: 'rgba(59, 130, 246, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                      {report.type}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '1px', display: 'block' }}>Saved On</span>
                    <span style={{ color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem' }}>
                      <Calendar size={14} /> {new Date(report.savedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ color: '#3b82f6', fontSize: '0.85rem' }}>
                    {expandedId === report._id ? 'Close Record' : 'View Record'}
                  </span>
                  <button 
                    onClick={(e) => handleDelete(e, report._id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem', opacity: 0.7 }}
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
          ))}
        </div>
      )}
    </div>
  );
};

export default PatientRecords;
