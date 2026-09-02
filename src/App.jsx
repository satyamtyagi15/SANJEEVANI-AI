import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Stethoscope, Mic, Pill, ScanEye, Users, Activity, Dna, Palette, Camera, ShieldCheck, Database, Menu, X, LogOut, Code, MessageSquare, Send } from 'lucide-react';
import { useCustomAuth } from './context/AuthContext';
import CustomAuth from './components/Auth/CustomAuth';
import DeveloperDashboard from './components/Admin/DeveloperDashboard';
import PatientKiosk from './components/PatientKiosk';
import DoctorDashboard from './components/DoctorDashboard';
import EpidemicAlert from './components/EpidemicAlert';
import AutoScribe from './components/AutoScribe';
import PharmaAI from './components/PharmaAI';
import VisionAI from './components/VisionAI';
import MultiAgent from './components/MultiAgent';
import DigitalTwin from './components/DigitalTwin';
import GenomicScanner from './components/GenomicScanner';
import ArtTherapy from './components/ArtTherapy';
import PainTracker from './components/PainTracker';
import CustomAlert from './components/CustomAlert';
import PatientFollowUp from './components/PatientFollowUp';
import GuardianDashboard from './components/GuardianDashboard';
import PatientRecords from './components/PatientRecords';
import ChatInterface from './components/ChatInterface';
import { epidemicService } from './services/EpidemicService';
import './styles/App.css';

function App() {
  const { isAuthenticated, isLoaded, user, logout, token } = useCustomAuth();
  const [activeModule, setActiveModule] = useState('triage');
  const [triageQueue, setTriageQueue] = useState([]);
  const [followUpPatientId, setFollowUpPatientId] = useState(null);
  const [outbreakData, setOutbreakData] = useState(null);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  const submitFeedbackMutation = useMutation(api.feedback.submit);
  const myFeedbacks = useQuery(api.feedback.getMyFeedback, token ? { token } : "skip") || [];

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim()) return;
    try {
      await submitFeedbackMutation({ token, message: feedbackText });
      setFeedbackText("");
      alert("Feedback submitted successfully!");
    } catch (e) {
      alert("Error submitting feedback: " + (e.data || e.message));
    }
  };

  // Check URL for magic links
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const followupId = params.get('followup');
    if (followupId) {
      setFollowUpPatientId(followupId);
      // Clean URL without reloading
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleTriageComplete = (newTriageData) => {
    setTriageQueue((prevQueue) => {
      if (prevQueue.some(item => item.id === newTriageData.id)) return prevQueue;
      return [newTriageData, ...prevQueue];
    });
    const outbreakResult = epidemicService.addCase(newTriageData);
    if (outbreakResult) setOutbreakData(outbreakResult);
  };

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: '#fff' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <CustomAuth />;
  }

  if (user?.role === 'developer' && activeModule === 'developer') {
    return (
      <div className="super-app-layout">
        <nav className="sci-fi-sidebar open">
          <div className="sidebar-logo">
            <h1>ADMIN</h1>
          </div>
          <ul className="nav-menu">
            <li className="active"><Code size={20}/> <span>Dashboard</span></li>
            <li onClick={() => setActiveModule('triage')}><Stethoscope size={20}/> <span>Back to App</span></li>
            <li onClick={logout}><LogOut size={20} color="#f87171" /> <span style={{color: '#f87171'}}>Logout</span></li>
          </ul>
        </nav>
        <main className="module-content" style={{ padding: 0 }}>
          <DeveloperDashboard />
        </main>
      </div>
    );
  }

  return (
    <div className="super-app-layout">
      {/* Mobile Nav Toggle Header */}
      <div className="mobile-nav-header">
        <div className="mobile-logo">
          <h1>SANJEEVANI</h1>
        </div>
        <button className="mobile-menu-btn" onClick={() => setIsNavOpen(!isNavOpen)}>
          {isNavOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      <CustomAlert />
      
      {/* Sci-Fi Sidebar Navigation */}
      <nav className={`sci-fi-sidebar ${isNavOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-pulse"></div>
          <h1>SANJEEVANI</h1>
          <span>AI COMMAND CENTER</span>
        </div>
        
        <ul className="nav-menu">
          <li className={activeModule === 'triage' ? 'active' : ''} onClick={() => { setActiveModule('triage'); setIsNavOpen(false); }}>
            <Stethoscope size={20} /> <span>AI ER Triage</span>
          </li>
          <li className={activeModule === 'guardian' ? 'active' : ''} onClick={() => { setActiveModule('guardian'); setIsNavOpen(false); }}>
            <ShieldCheck size={20} /> <span>Guardian Monitor</span>
          </li>
          <li className={activeModule === 'records' ? 'active' : ''} onClick={() => { setActiveModule('records'); setIsNavOpen(false); }}>
            <Database size={20} /> <span>Patient Records</span>
          </li>
          <li className={activeModule === 'scribe' ? 'active' : ''} onClick={() => { setActiveModule('scribe'); setIsNavOpen(false); }}>
            <Mic size={20} /> <span>Auto-Scribe</span>
          </li>
          <li className={activeModule === 'pharma' ? 'active' : ''} onClick={() => { setActiveModule('pharma'); setIsNavOpen(false); }}>
            <Pill size={20} /> <span>Pharma AI</span>
          </li>
          <li className={activeModule === 'vision' ? 'active' : ''} onClick={() => { setActiveModule('vision'); setIsNavOpen(false); }}>
            <ScanEye size={20} /> <span>Vision AI</span>
          </li>
          <li className={activeModule === 'multi-agent' ? 'active' : ''} onClick={() => { setActiveModule('multi-agent'); setIsNavOpen(false); }}>
            <Users size={20} /> <span>Multi-Agent AI</span>
          </li>
          <li className={activeModule === 'digital-twin' ? 'active' : ''} onClick={() => { setActiveModule('digital-twin'); setIsNavOpen(false); }}>
            <Activity size={20} /> <span>AI Digital Twin</span>
          </li>
          <li className={activeModule === 'genomic' ? 'active' : ''} onClick={() => { setActiveModule('genomic'); setIsNavOpen(false); }}>
            <Dna size={20} /> <span>Genomic AI</span>
          </li>
          <li className={activeModule === 'art-therapy' ? 'active' : ''} onClick={() => { setActiveModule('art-therapy'); setIsNavOpen(false); }}>
            <Palette size={20} /> <span>Art Therapy</span>
          </li>
          <li className={activeModule === 'pain-tracker' ? 'active' : ''} onClick={() => { setActiveModule('pain-tracker'); setIsNavOpen(false); }}>
            <Camera size={20} /> <span>Pain Tracker</span>
          </li>
          {user?.role === 'developer' && (
            <li className={activeModule === 'developer' ? 'active' : ''} onClick={() => { setActiveModule('developer'); setIsNavOpen(false); }}>
              <Code size={20} color="#fcd34d" /> <span style={{ color: '#fcd34d' }}>Dev Dashboard</span>
            </li>
          )}
          <li onClick={logout}>
            <LogOut size={20} color="#f87171" /> <span style={{ color: '#f87171' }}>Logout</span>
          </li>
        </ul>
        
        <div className="system-status">
          <div className="status-dot"></div>
          <span>SYSTEMS ONLINE</span>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="module-content">
        {activeModule === 'triage' && (
          <div className="app-container">
            <PatientKiosk onTriageComplete={handleTriageComplete} />
            <DoctorDashboard triageQueue={triageQueue} />
            <EpidemicAlert outbreakData={outbreakData} onClose={() => setOutbreakData(null)} />
          </div>
        )}
        
        {activeModule === 'guardian' && <GuardianDashboard />}
        {activeModule === 'records' && <PatientRecords />}
        {activeModule === 'scribe' && <AutoScribe />}
        {activeModule === 'pharma' && <PharmaAI />}
        {activeModule === 'vision' && <VisionAI />}
        {activeModule === 'multi-agent' && <MultiAgent />}
        {activeModule === 'digital-twin' && <DigitalTwin />}
        {activeModule === 'genomic' && <GenomicScanner />}
        {activeModule === 'art-therapy' && <ArtTherapy />}
        {activeModule === 'pain-tracker' && <PainTracker />}
        
        {followUpPatientId && (
          <PatientFollowUp patientId={followUpPatientId} onClose={() => setFollowUpPatientId(null)} />
        )}

        {isCopilotOpen && (
          <ChatInterface
            agentName="Medical Co-Pilot"
            agentRole="Clinical Decision Support"
            onClose={() => setIsCopilotOpen(false)}
          />
        )}

        <button 
          onClick={() => setIsFeedbackOpen(true)}
          style={{
            position: 'fixed', bottom: '2rem', right: '2rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '50px', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)', zIndex: 100
          }}>
          <MessageSquare size={20} /> Report / Feedback
        </button>

        {isFeedbackOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ background: '#1e293b', width: '90%', maxWidth: '500px', borderRadius: '12px', padding: '2rem', border: '1px solid #334155', position: 'relative' }}>
              <button onClick={() => setIsFeedbackOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={24} />
              </button>
              <h2 style={{ color: '#fff', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquare size={24} color="#3b82f6" /> Developer Feedback
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Have a problem or feature request? Send it directly to the developer.
              </p>
              <textarea 
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Type your feedback or report here..."
                style={{ width: '100%', height: '120px', padding: '1rem', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff', resize: 'none', marginBottom: '1rem' }}
              />
              <button onClick={handleFeedbackSubmit} style={{ width: '100%', background: '#3b82f6', color: '#fff', border: 'none', padding: '1rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                <Send size={18} /> Submit Feedback
              </button>

              {myFeedbacks.length > 0 && (
                <div style={{ marginTop: '2rem', maxHeight: '200px', overflowY: 'auto' }}>
                  <h3 style={{ color: '#cbd5e1', fontSize: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>Your Previous Feedbacks</h3>
                  {myFeedbacks.map(fb => (
                    <div key={fb._id} style={{ padding: '1rem', background: '#0f172a', borderRadius: '8px', marginTop: '1rem', borderLeft: fb.status === 'resolved' ? '3px solid #4ade80' : '3px solid #fbbf24' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: fb.status === 'resolved' ? '#4ade80' : '#fbbf24' }}>
                          {fb.status.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(fb.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 0.5rem 0' }}>{fb.message}</p>
                      {fb.adminReply && (
                        <div style={{ background: '#064e3b', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                          <strong style={{ color: '#34d399' }}>Developer Reply:</strong>
                          <p style={{ color: '#a7f3d0', margin: '0.25rem 0 0 0' }}>{fb.adminReply}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
