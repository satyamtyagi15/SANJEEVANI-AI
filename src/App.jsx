import React, { useState } from 'react';
import { Stethoscope, Mic, Pill, ScanEye, Users, Activity, Dna, Palette, Camera, ShieldCheck } from 'lucide-react';
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
import { epidemicService } from './services/EpidemicService';
import './styles/App.css';

function App() {
  const [activeModule, setActiveModule] = useState('triage');
  const [triageQueue, setTriageQueue] = useState([]);
  const [followUpPatientId, setFollowUpPatientId] = useState(null);
  const [outbreakData, setOutbreakData] = useState(null);

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

  return (
    <div className="super-app-layout">
      <CustomAlert />
      {/* Sci-Fi Sidebar Navigation */}
      <nav className="sci-fi-sidebar">
        <div className="sidebar-logo">
          <div className="logo-pulse"></div>
          <h1>SANJEEVANI</h1>
          <span>AI COMMAND CENTER</span>
        </div>
        
        <ul className="nav-menu">
          <li className={activeModule === 'triage' ? 'active' : ''} onClick={() => setActiveModule('triage')}>
            <Stethoscope size={20} /> <span>Multi-Agent System</span>
          </li>
          <li className={activeModule === 'guardian' ? 'active' : ''} onClick={() => setActiveModule('guardian')}>
            <ShieldCheck size={20} /> <span>Guardian Monitor</span>
          </li>
          <li className={activeModule === 'scribe' ? 'active' : ''} onClick={() => setActiveModule('scribe')}>
            <Mic size={20} /> <span>Auto-Scribe</span>
          </li>
          <li className={activeModule === 'pharma' ? 'active' : ''} onClick={() => setActiveModule('pharma')}>
            <Pill size={20} /> <span>Pharma AI</span>
          </li>
          <li className={activeModule === 'vision' ? 'active' : ''} onClick={() => setActiveModule('vision')}>
            <ScanEye size={20} /> <span>Vision AI</span>
          </li>
          <li className={activeModule === 'multi-agent' ? 'active' : ''} onClick={() => setActiveModule('multi-agent')}>
            <Users size={20} /> <span>Multi-Agent AI</span>
          </li>
          <li className={activeModule === 'digital-twin' ? 'active' : ''} onClick={() => setActiveModule('digital-twin')}>
            <Activity size={20} /> <span>AI Digital Twin</span>
          </li>
          <li className={activeModule === 'genomic' ? 'active' : ''} onClick={() => setActiveModule('genomic')}>
            <Dna size={20} /> <span>Genomic AI</span>
          </li>
          <li className={activeModule === 'art-therapy' ? 'active' : ''} onClick={() => setActiveModule('art-therapy')}>
            <Palette size={20} /> <span>Art Therapy</span>
          </li>
          <li className={activeModule === 'pain-tracker' ? 'active' : ''} onClick={() => setActiveModule('pain-tracker')}>
            <Camera size={20} /> <span>Pain Tracker</span>
          </li>
        </ul>
        
        <div className="system-status">
          <div className="status-dot"></div>
          <span>SYSTEMS ONLINE</span>
        </div>
        
        <button 
          onClick={() => {
            const id = window.prompt("Enter the Patient ID you just discharged (e.g., PT-1234):");
            if (id) setFollowUpPatientId(id);
          }}
          style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid #3b82f6', margin: '1rem', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
        >
          Test Guardian Alert SMS
        </button>
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
      </main>
    </div>
  );
}

export default App;
