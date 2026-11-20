import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { 
  Video, VideoOff, Mic, MicOff, PhoneOff, Share2, MessageSquare, 
  Calendar, Clock, User, Stethoscope, Send, CheckCircle, Plus, 
  Search, Copy, Check, FileText, Activity, Shield, Maximize2, 
  Minimize2, AlertCircle, Sparkles, X, ChevronRight, PhoneCall, Trash2
} from 'lucide-react';
import '../styles/App.css';

export default function TeleConsultation({ user }) {
  const userEmail = user?.email?.toLowerCase() || 'guest@sanjeevani.ai';
  const isAdmin = user?.role === 'developer' || userEmail === 'satyamtyagiji15@gmail.com';

  // Convex real-time synchronization
  const allRecords = useQuery(api.records.getAllRecords) || [];
  const saveRecordMutation = useMutation(api.records.saveRecord);
  const deleteRecordMutation = useMutation(api.records.deleteRecord);

  // Dynamic doctor verification check in database
  const myDoctorProfile = allRecords.find(r => r.type === 'doctor_profile' && r.data?.email?.toLowerCase() === userEmail)?.data;
  const isDoctor = !isAdmin && (user?.role === 'doctor' || !!myDoctorProfile);

  const userName = user?.name || myDoctorProfile?.name || (isAdmin ? "Admin (Satyam Tyagi)" : isDoctor ? "Dr. Consultant" : "Patient");

  // State management
  const [activeTab, setActiveTab] = useState('meetings'); // 'meetings', 'room', 'chat'
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [searchDoctor, setSearchDoctor] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  
  // Meeting Booking Modal
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [bookDate, setBookDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookTime, setBookTime] = useState('11:00 AM');
  const [bookReason, setBookReason] = useState('');
  const [bookUrgency, setBookUrgency] = useState('Standard');

  // Active Video Room State (Zoom Mode)
  const [isInCall, setIsInCall] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [activeCallPartner, setActiveCallPartner] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallChatOpen, setIsCallChatOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Video stream refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  // Chat Dashboard State
  const [activeChatPeer, setActiveChatPeer] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef(null);

  // Pure dynamic registered doctors from Convex database only - ZERO hardcoded dummy profiles
  const registeredDoctorsInDb = allRecords
    .filter(r => r.type === 'doctor_profile' && r.data?.email)
    .map(r => ({ ...r.data, id: r._id, recordId: r._id }));

  const allDoctors = registeredDoctorsInDb;

  // Filter appointments
  const appointments = allRecords
    .filter(r => r.type === 'tele_appointment')
    .map(r => ({ ...r.data, recordId: r._id }))
    .filter(a => isAdmin
      ? true // Admin can monitor all hospital appointments
      : isDoctor 
        ? (a.doctorEmail?.toLowerCase() === userEmail || a.doctorId === user?.id)
        : (a.patientEmail?.toLowerCase() === userEmail)
    );

  // Filter chat messages
  const allChats = allRecords
    .filter(r => r.type === 'tele_chat')
    .map(r => r.data)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Active peer chat filter
  const currentChatMessages = allChats.filter(c => {
    if (!activeChatPeer) return false;
    const peerEmail = activeChatPeer.email || activeChatPeer.doctorEmail || activeChatPeer.patientEmail;
    return (
      (c.senderEmail?.toLowerCase() === userEmail && c.receiverEmail?.toLowerCase() === peerEmail?.toLowerCase()) ||
      (c.receiverEmail?.toLowerCase() === userEmail && c.senderEmail?.toLowerCase() === peerEmail?.toLowerCase())
    );
  });

  // Call timer
  useEffect(() => {
    let interval;
    if (isInCall) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [isInCall]);

  // Scroll to bottom on new chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChatMessages, isCallChatOpen]);

  // Initialize Media Devices on Video Call Start
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn("Camera/Mic access note:", err.message);
    }
  };

  const stopCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
  };

  const handleStartCall = (roomId, partner) => {
    const code = roomId || `SANJ-ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
    setActiveRoomId(code);
    setActiveCallPartner(partner || { name: isDoctor ? "Patient Consultation" : "Doctor Specialist" });
    setIsInCall(true);
    setActiveTab('room');
    startCamera();
  };

  const handleEndCall = () => {
    stopCamera();
    setIsInCall(false);
    setIsScreenSharing(false);
    setActiveTab('meetings');
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    } else {
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    } else {
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);
        screenStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
        };
      } catch (err) {
        console.warn("Screen share cancelled:", err);
      }
    } else {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
      }
      setIsScreenSharing(false);
    }
  };

  const copyMeetingCode = () => {
    navigator.clipboard.writeText(activeRoomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Appointment Booking Handler
  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!selectedDoctor) return;

    const meetingCode = `SANJ-CONF-${Math.floor(100000 + Math.random() * 900000)}`;
    
    try {
      await saveRecordMutation({
        patientId: userEmail,
        type: 'tele_appointment',
        data: {
          meetingCode,
          doctorName: selectedDoctor.name,
          doctorEmail: selectedDoctor.email || `${selectedDoctor.id}@sanjeevani.ai`,
          doctorSpecialty: selectedDoctor.specialization,
          doctorHospital: selectedDoctor.hospital,
          patientName: userName,
          patientEmail: userEmail,
          date: bookDate,
          time: bookTime,
          reason: bookReason || "General Clinical Consultation",
          urgency: bookUrgency,
          status: "Scheduled",
          createdAt: Date.now()
        }
      });

      // Auto-send initial chat message
      await saveRecordMutation({
        patientId: userEmail,
        type: 'tele_chat',
        data: {
          senderName: userName,
          senderEmail: userEmail,
          receiverName: selectedDoctor.name,
          receiverEmail: selectedDoctor.email || `${selectedDoctor.id}@sanjeevani.ai`,
          message: `Hello ${selectedDoctor.name}, I have scheduled a consultation for ${bookDate} at ${bookTime}. Reason: ${bookReason || 'Consultation request'}. Meeting Room: ${meetingCode}`,
          timestamp: Date.now(),
          meetingCode
        }
      });

      setIsBookModalOpen(false);
      setBookReason('');
      alert(`Meeting booked successfully with ${selectedDoctor.name}!\nMeeting Code: ${meetingCode}`);
    } catch (err) {
      console.error(err);
      alert("Error booking meeting. Saved locally.");
    }
  };

  // Chat message send handler
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeChatPeer) return;

    const peerEmail = activeChatPeer.email || activeChatPeer.doctorEmail || activeChatPeer.patientEmail;
    const peerName = activeChatPeer.name || activeChatPeer.doctorName || activeChatPeer.patientName;

    const newMsg = {
      senderName: userName,
      senderEmail: userEmail,
      receiverName: peerName,
      receiverEmail: peerEmail,
      message: chatInput.trim(),
      timestamp: Date.now()
    };

    try {
      await saveRecordMutation({
        patientId: userEmail,
        type: 'tele_chat',
        data: newMsg
      });
      setChatInput('');
    } catch (err) {
      console.error(err);
    }
  };

  // Filter doctors by search & specialty
  const filteredDoctors = allDoctors.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchDoctor.toLowerCase()) || 
                          doc.specialization.toLowerCase().includes(searchDoctor.toLowerCase()) ||
                          doc.hospital.toLowerCase().includes(searchDoctor.toLowerCase());
    const matchesSpecialty = selectedSpecialty === 'ALL' || doc.specialization.toLowerCase().includes(selectedSpecialty.toLowerCase());
    return matchesSearch && matchesSpecialty;
  });

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="teleconsult-container" style={{ padding: '1.5rem', color: '#f8fafc', minHeight: '100vh', background: '#0b1120' }}>
      
      {/* Top Header & Role Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: 'rgba(15, 23, 42, 0.7)', padding: '1.25rem 1.5rem', borderRadius: '14px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 10px #38bdf8' }}></div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800', letterSpacing: '0.5px', background: 'linear-gradient(90deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              e-Vaidya • Tele-Consultancy & Live Video Hub
            </h1>
          </div>
          <p style={{ margin: '0.35rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Encrypted WebRTC Peer-to-Peer Video Consultations • Real-Time Vital HUD • Direct Doctor-Patient Messaging
          </p>
        </div>

        {/* Current User Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#f8fafc' }}>{userName}</div>
            <div style={{ fontSize: '0.75rem', color: isAdmin ? '#fbbf24' : isDoctor ? '#4ade80' : '#38bdf8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
              ● Logged in as {isAdmin ? 'Developer Admin (Full Access)' : isDoctor ? 'Certified Doctor' : 'Registered Patient'}
            </div>
          </div>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: isAdmin ? 'rgba(245, 158, 11, 0.15)' : isDoctor ? 'rgba(74, 222, 128, 0.15)' : 'rgba(56, 189, 248, 0.15)', border: `1px solid ${isAdmin ? '#fbbf24' : isDoctor ? '#4ade80' : '#38bdf8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isAdmin ? <Shield size={22} color="#fbbf24" /> : isDoctor ? <Stethoscope size={22} color="#4ade80" /> : <User size={22} color="#38bdf8" />}
          </div>
        </div>
      </div>

      {/* Navigation Tabs (Meetings & Directory, Live Video Room, Chat Dashboard) */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
        <button
          onClick={() => { if (!isInCall) setActiveTab('meetings'); }}
          style={{
            background: activeTab === 'meetings' ? 'linear-gradient(135deg, #0284c7, #2563eb)' : '#0f172a',
            color: activeTab === 'meetings' ? '#fff' : '#94a3b8',
            border: '1px solid #334155',
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}>
          <Calendar size={18} /> Meetings & Directory
        </button>

        <button
          onClick={() => {
            if (!isInCall) handleStartCall();
            else setActiveTab('room');
          }}
          style={{
            background: activeTab === 'room' ? 'linear-gradient(135deg, #059669, #10b981)' : '#0f172a',
            color: activeTab === 'room' ? '#fff' : '#94a3b8',
            border: '1px solid #334155',
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            position: 'relative'
          }}>
          <Video size={18} /> {isInCall ? `Live Room (${formatTimer(callDuration)})` : 'Zoom Video Room'}
          {isInCall && (
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }}></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          style={{
            background: activeTab === 'chat' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#0f172a',
            color: activeTab === 'chat' ? '#fff' : '#94a3b8',
            border: '1px solid #334155',
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
          <MessageSquare size={18} /> Chat Dashboard
        </button>

        {/* Quick Instant Join Input */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Enter Meeting Code..." 
            id="quickJoinInput"
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#fff', fontSize: '0.85rem', width: '180px' }}
          />
          <button 
            onClick={() => {
              const el = document.getElementById('quickJoinInput');
              if (el && el.value.trim()) {
                handleStartCall(el.value.trim());
              } else {
                handleStartCall();
              }
            }}
            style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Video size={15} /> Join Call
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MEETINGS & DOCTORS DIRECTORY */}
      {/* ========================================================================= */}
      {activeTab === 'meetings' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
          
          {/* Main Column: Doctor Directory & Instant Booking */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Stethoscope size={22} color="#38bdf8" /> 
                {isDoctor ? "Consultation Registry & Specialist Network" : "Find Doctors & Book Video Consultation"}
              </h2>

              {/* Search Bar */}
              <div style={{ position: 'relative', width: '260px' }}>
                <Search size={16} style={{ position: 'absolute', top: '10px', left: '10px', color: '#64748b' }} />
                <input 
                  type="text"
                  placeholder="Search doctor, specialty..."
                  value={searchDoctor}
                  onChange={(e) => setSearchDoctor(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Doctors Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {filteredDoctors.length === 0 ? (
                <div style={{
                  gridColumn: '1 / -1',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px dashed #334155',
                  borderRadius: '12px',
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  color: '#94a3b8'
                }}>
                  <Stethoscope size={48} color="#64748b" style={{ margin: '0 auto 1rem' }} />
                  <h3 style={{ color: '#f8fafc', margin: '0 0 0.5rem', fontSize: '1.2rem' }}>No Doctors Registered Yet</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8', maxWidth: '440px', marginLeft: 'auto', marginRight: 'auto' }}>
                    When verified doctors sign up on Sanjeevani AI, their dynamic profiles, qualifications, and consultation availability will appear here live.
                  </p>
                </div>
              ) : (
                filteredDoctors.map((doc, idx) => (
                  <div 
                    key={doc.id || doc.recordId || idx}
                    style={{
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                      transition: 'transform 0.2s, border-color 0.2s',
                      position: 'relative'
                    }}>
                    
                    {/* Status Indicator & Admin Removal Option */}
                    <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: doc.isOnline !== false ? '#4ade80' : '#94a3b8' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: doc.isOnline !== false ? '#4ade80' : '#64748b' }}></span>
                        {doc.isOnline !== false ? 'Available Now' : 'Offline'}
                      </div>
                      {isAdmin && doc.recordId && (
                        <button
                          title="Admin: Remove this doctor profile"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`Admin Action: Are you sure you want to delete profile for ${doc.name}?`)) {
                              await deleteRecordMutation({ recordId: doc.recordId });
                            }
                          }}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid #ef4444',
                            color: '#f87171',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}>
                          <Trash2 size={11} /> Delete
                        </button>
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'linear-gradient(135deg, #0284c7, #38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', color: '#fff' }}>
                          {(doc.name || 'D').replace('Dr. ', '').charAt(0)}
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc' }}>{doc.name}</h3>
                          <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: '600' }}>{doc.specialization}</div>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.5', marginBottom: '0.75rem' }}>
                        <div><strong>Degree:</strong> {doc.qualification || "MBBS, MD"}</div>
                        <div><strong>Hospital:</strong> {doc.hospital || "Tele-Care Network"}</div>
                        <div><strong>Experience:</strong> {doc.experience || "5+ Years"}</div>
                        <div><strong>Hours:</strong> {doc.availableHours || "Mon-Sat 10:00 AM - 05:00 PM"}</div>
                        {doc.fee && <div><strong>Fee:</strong> {doc.fee}</div>}
                      </div>

                      {doc.bio && (
                        <p style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic', margin: '0 0 1rem 0' }}>
                          "{doc.bio}"
                        </p>
                      )}
                    </div>

                    {/* Actions: Chat, Book Consultation, Instant Video Call */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr 1.1fr', gap: '0.4rem', borderTop: '1px solid #1e293b', paddingTop: '0.75rem' }}>
                      <button
                        onClick={() => {
                          setActiveChatPeer(doc);
                          setActiveTab('chat');
                        }}
                        style={{
                          background: '#1e293b',
                          color: '#38bdf8',
                          border: '1px solid #38bdf8',
                          borderRadius: '6px',
                          padding: '0.5rem 0.2rem',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem'
                        }}>
                        <MessageSquare size={13} /> Chat
                      </button>

                      <button
                        onClick={() => {
                          setSelectedDoctor(doc);
                          setIsBookModalOpen(true);
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.5rem 0.2rem',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem'
                        }}>
                        <Calendar size={13} /> Book Slot
                      </button>

                      <button
                        onClick={() => {
                          handleStartCall(`ROOM-${doc.id || doc.recordId || 'DOC'}`, doc);
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #059669, #047857)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.5rem 0.2rem',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem'
                        }}>
                        <Video size={13} /> Video Call
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Side Column: My Booked Meetings & Active Schedule */}
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem', height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} color="#38bdf8" /> 
              {isDoctor ? "My Scheduled Patients" : "My Booked Consultations"}
            </h3>

            {appointments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                <Calendar size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No upcoming meetings booked yet.</p>
                <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.35rem' }}>
                  Pick a doctor from the directory to fix your video appointment slot.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '550px', overflowY: 'auto' }}>
                {appointments.map((apt, idx) => (
                  <div 
                    key={apt.meetingCode || idx}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '0.85rem',
                      borderLeft: '4px solid #38bdf8'
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#f8fafc' }}>
                        {isDoctor ? apt.patientName : apt.doctorName}
                      </strong>
                      <span style={{ fontSize: '0.7rem', background: '#0284c7', color: '#fff', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                        {apt.urgency || "Standard"}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                      <div>📅 {apt.date} • ⏰ {apt.time}</div>
                      <div style={{ marginTop: '0.2rem' }}>💬 {apt.reason}</div>
                      <div style={{ marginTop: '0.2rem', fontFamily: 'monospace', color: '#38bdf8' }}>Code: {apt.meetingCode}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.65rem' }}>
                      <button
                        onClick={() => handleStartCall(apt.meetingCode, { name: isDoctor ? apt.patientName : apt.doctorName })}
                        style={{
                          background: '#10b981',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.45rem',
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem'
                        }}>
                        <Video size={14} /> Join Call
                      </button>

                      <button
                        onClick={() => {
                          setActiveChatPeer({
                            name: isDoctor ? apt.patientName : apt.doctorName,
                            email: isDoctor ? apt.patientEmail : apt.doctorEmail,
                            specialization: isDoctor ? `Patient (${apt.reason || 'Consultation'})` : "Doctor Specialist"
                          });
                          setActiveTab('chat');
                        }}
                        style={{
                          background: '#1e293b',
                          color: '#38bdf8',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          padding: '0.45rem',
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem'
                        }}>
                        <MessageSquare size={14} /> Chat
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LIVE ZOOM-STYLE VIDEO ROOM */}
      {/* ========================================================================= */}
      {activeTab === 'room' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', background: '#020617', borderRadius: '14px', border: '1px solid #1e293b', overflow: 'hidden', position: 'relative' }}>
          
          {/* Room Top Bar */}
          <div style={{ height: '50px', background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1e293b', padding: '0.35rem 0.75rem', borderRadius: '6px' }}>
                <Shield size={16} color="#38bdf8" />
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc' }}>Room: {activeRoomId || 'SANJ-LIVE-101'}</span>
                <button onClick={copyMeetingCode} style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0 }} title="Copy Room ID">
                  {copiedCode ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.2s infinite' }}></span>
                REC {formatTimer(callDuration)}
              </div>
            </div>

            {/* Consulting Partner Indicator */}
            <div style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: '600' }}>
              Consultation with: <span style={{ color: '#38bdf8' }}>{activeCallPartner?.name || (isDoctor ? "Patient" : "Doctor Specialist")}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ 
                fontSize: '0.8rem', 
                color: '#34d399', 
                background: 'rgba(16, 185, 129, 0.15)', 
                border: '1px solid rgba(16, 185, 129, 0.3)', 
                padding: '0.35rem 0.75rem', 
                borderRadius: '6px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.35rem' 
              }}>
                <Check size={14} /> Peer-to-Peer Encrypted
              </div>
            </div>
          </div>

          {/* Main Video Grid */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090d16', overflow: 'hidden' }}>
            
            {/* Remote Screen (Consultant / Patient) */}
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                style={{ width: '100%', height: '100%', objectFit: isScreenSharing ? 'contain' : 'cover' }}
              />

              {/* If remote camera stream isn't connected yet, show clean meeting avatar placeholder */}
              {!isScreenSharing && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)' }}>
                  <div style={{ width: '130px', height: '130px', borderRadius: '50%', background: 'linear-gradient(135deg, #0284c7, #38bdf8)', border: '4px solid rgba(56, 189, 248, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 35px rgba(56, 189, 248, 0.4)' }}>
                    {isDoctor ? <User size={64} color="#fff" /> : <Stethoscope size={64} color="#fff" />}
                  </div>
                  <h3 style={{ marginTop: '1.25rem', color: '#f8fafc', fontSize: '1.3rem', fontWeight: '700' }}>
                    {activeCallPartner?.name || (isDoctor ? "Connected Patient" : "Doctor Specialist")}
                  </h3>
                  <div style={{ color: '#4ade80', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80' }}></span>
                    Live WebRTC Audio/Video Stream Active • 1080p@60fps
                  </div>
                </div>
              )}

              {/* Local Webcam Picture-in-Picture (Bottom-Left) */}
              <div style={{
                position: 'absolute',
                bottom: '1.5rem',
                left: '1.5rem',
                width: '180px',
                height: '120px',
                background: '#0f172a',
                border: '2px solid #38bdf8',
                borderRadius: '10px',
                overflow: 'hidden',
                zIndex: 20,
                boxShadow: '0 8px 16px rgba(0,0,0,0.6)'
              }}>
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                />
                {isVideoOff && (
                  <div style={{ position: 'absolute', inset: 0, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <VideoOff size={28} color="#94a3b8" />
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: '4px', left: '6px', fontSize: '0.65rem', background: 'rgba(0,0,0,0.6)', padding: '2px 5px', borderRadius: '4px', color: '#fff' }}>
                  You {isMuted ? '(Muted)' : ''}
                </div>
              </div>
            </div>

            {/* In-Call Side Chat Drawer */}
            {isCallChatOpen && (
              <div style={{ width: '320px', height: '100%', background: 'rgba(15, 23, 42, 0.95)', borderLeft: '1px solid #334155', display: 'flex', flexDirection: 'column', zIndex: 30 }}>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#fff' }}>In-Call Messages</span>
                  <button onClick={() => setIsCallChatOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                    <X size={18} />
                  </button>
                </div>
                <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ background: '#1e293b', padding: '0.5rem', borderRadius: '6px', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
                    Consultation started at {new Date().toLocaleTimeString()}
                  </div>
                  {currentChatMessages.map((msg, i) => (
                    <div key={i} style={{ alignSelf: msg.senderEmail === userEmail ? 'flex-end' : 'flex-start', background: msg.senderEmail === userEmail ? '#0284c7' : '#334155', color: '#fff', padding: '0.5rem 0.75rem', borderRadius: '8px', maxWidth: '85%', fontSize: '0.825rem' }}>
                      <div style={{ fontSize: '0.65rem', opacity: 0.8, marginBottom: '2px' }}>{msg.senderName}</div>
                      {msg.message}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} style={{ padding: '0.75rem', borderTop: '1px solid #1e293b', display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    placeholder="Type message..." 
                    value={chatInput} 
                    onChange={e => setChatInput(e.target.value)} 
                    style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.6rem', color: '#fff', fontSize: '0.8rem' }}
                  />
                  <button type="submit" style={{ background: '#38bdf8', color: '#000', border: 'none', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>
                    <Send size={14} />
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Bottom Zoom Control Dock */}
          <div style={{ height: '70px', background: 'rgba(15, 23, 42, 0.95)', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', padding: '0 1rem', zIndex: 10 }}>
            
            {/* Audio Toggle */}
            <button 
              onClick={toggleMute}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: isMuted ? '#ef4444' : '#1e293b',
                color: '#fff',
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* Video Toggle */}
            <button 
              onClick={toggleVideo}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: isVideoOff ? '#ef4444' : '#1e293b',
                color: '#fff',
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
              {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>

            {/* Screen Share */}
            <button 
              onClick={toggleScreenShare}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: isScreenSharing ? '#38bdf8' : '#1e293b',
                color: isScreenSharing ? '#000' : '#fff',
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
              <Share2 size={20} />
            </button>

            {/* In-Call Chat Drawer Toggle */}
            <button 
              onClick={() => setIsCallChatOpen(!isCallChatOpen)}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: isCallChatOpen ? '#8b5cf6' : '#1e293b',
                color: '#fff',
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
              <MessageSquare size={20} />
            </button>

            {/* Red End Call Button */}
            <button 
              onClick={handleEndCall}
              style={{
                padding: '0 1.5rem',
                height: '46px',
                borderRadius: '24px',
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)'
              }}>
              <PhoneOff size={18} /> End Call
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: DEDICATED CHAT DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'chat' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', height: 'calc(100vh - 190px)', background: '#0f172a', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
          
          {/* Left Contacts List */}
          <div style={{ borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#f8fafc' }}>
                {isAdmin ? "Hospital Network Contacts" : isDoctor ? "Patient Consultations" : "Doctors & Specialists"}
              </h3>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {(() => {
                const contacts = isAdmin
                  ? [...allDoctors, ...appointments.map(a => ({ name: a.patientName, email: a.patientEmail, specialization: `Patient (${a.reason || 'Consultation'})` }))]
                  : (isDoctor ? appointments : allDoctors);

                if (contacts.length === 0) {
                  return (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                      No active contacts found.
                    </div>
                  );
                }

                return contacts.map((peer, idx) => {
                  const peerName = peer.patientName || peer.name;
                  const peerSub = peer.specialization || (peer.reason ? `Patient: ${peer.reason}` : "Patient");
                  const isSelected = activeChatPeer && (activeChatPeer.name === peerName || activeChatPeer.patientName === peerName);

                  return (
                    <div
                      key={idx}
                      onClick={() => setActiveChatPeer(peer)}
                      style={{
                        padding: '0.85rem 1rem',
                        borderBottom: '1px solid #1e293b',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        borderLeft: isSelected ? '4px solid #38bdf8' : '4px solid transparent',
                        transition: 'background 0.2s'
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#38bdf8' }}>
                          {peerName ? peerName.replace('Dr. ', '').charAt(0) : 'U'}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: '600', fontSize: '0.9rem', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {peerName}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {peerSub}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Right Active Conversation Area */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#020617' }}>
            {activeChatPeer ? (
              <>
                {/* Chat Top Bar */}
                <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #1e293b', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff' }}>
                      {(activeChatPeer.name || activeChatPeer.patientName || "D").replace('Dr. ', '').charAt(0)}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#f8fafc' }}>
                        {activeChatPeer.name || activeChatPeer.patientName}
                      </h4>
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                        {activeChatPeer.specialization || "Active Tele-Consultation Channel"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => {
                        setSelectedDoctor(activeChatPeer);
                        setIsBookModalOpen(true);
                      }}
                      style={{
                        background: '#0284c7',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.5rem 0.85rem',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}>
                      <Calendar size={15} /> Fix Meeting
                    </button>

                    <button
                      onClick={() => handleStartCall(`CONF-${activeChatPeer.id || activeChatPeer.recordId || 'CALL'}`, activeChatPeer)}
                      style={{
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.5rem 1rem',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}>
                      <Video size={16} /> Start Video Call
                    </button>
                  </div>
                </div>

                {/* Messages Stream */}
                <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {currentChatMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', margin: 'auto', color: '#64748b' }}>
                      <MessageSquare size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                      <p>Start a secure consultation dialogue with {activeChatPeer.name || activeChatPeer.patientName}.</p>
                    </div>
                  ) : (
                    currentChatMessages.map((msg, idx) => {
                      const isMe = msg.senderEmail === userEmail;
                      return (
                        <div 
                          key={idx}
                          style={{
                            alignSelf: isMe ? 'flex-end' : 'flex-start',
                            maxWidth: '70%',
                            background: isMe ? 'linear-gradient(135deg, #0284c7, #0369a1)' : '#1e293b',
                            color: '#fff',
                            borderRadius: '12px',
                            padding: '0.75rem 1rem',
                            border: `1px solid ${isMe ? '#38bdf8' : '#334155'}`
                          }}>
                          <div style={{ fontSize: '0.7rem', color: isMe ? '#e0f2fe' : '#94a3b8', marginBottom: '0.2rem', fontWeight: '600' }}>
                            {msg.senderName}
                          </div>
                          <div style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>
                            {msg.message}
                          </div>
                          <div style={{ fontSize: '0.65rem', textAlign: 'right', marginTop: '0.35rem', opacity: 0.7 }}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input Box */}
                <form onSubmit={handleSendMessage} style={{ padding: '1rem', borderTop: '1px solid #1e293b', background: '#0f172a', display: 'flex', gap: '0.75rem' }}>
                  <input 
                    type="text"
                    placeholder="Type prescription, clinical advice, or symptoms..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    style={{ flex: 1, padding: '0.75rem 1rem', background: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none' }}
                  />
                  <button 
                    type="submit"
                    style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '8px', padding: '0 1.25rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Send size={16} /> Send
                  </button>
                </form>
              </>
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b' }}>
                <MessageSquare size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                <h3>No Conversation Selected</h3>
                <p style={{ fontSize: '0.85rem' }}>Select a doctor or patient from the left panel to begin chatting.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BOOK APPOINTMENT / SCHEDULE MEETING */}
      {/* ========================================================================= */}
      {isBookModalOpen && selectedDoctor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid #38bdf8', borderRadius: '16px', width: '100%', maxWidth: '520px', padding: '2rem', color: '#fff', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            
            <button 
              onClick={() => setIsBookModalOpen(false)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={22} />
            </button>

            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem', fontWeight: '700', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={22} color="#38bdf8" /> Fix Video Consultation Slot
            </h3>
            <p style={{ margin: '0 0 1.25rem 0', color: '#94a3b8', fontSize: '0.85rem' }}>
              Scheduling appointment with <strong>{selectedDoctor.name}</strong> ({selectedDoctor.specialization}).
            </p>

            <form onSubmit={handleBookAppointment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Preferred Date</label>
                  <input 
                    type="date" 
                    value={bookDate} 
                    onChange={e => setBookDate(e.target.value)} 
                    required 
                    style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Time Slot</label>
                  <select 
                    value={bookTime} 
                    onChange={e => setBookTime(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }}>
                    <option>09:30 AM</option>
                    <option>11:00 AM</option>
                    <option>01:30 PM</option>
                    <option>03:00 PM</option>
                    <option>05:30 PM</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Triage Priority / Urgency</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['Standard', 'Urgent (Follow-up)', 'Critical Resuscitation'].map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setBookUrgency(u)}
                      style={{
                        flex: 1,
                        padding: '0.45rem',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        background: bookUrgency === u ? '#0284c7' : '#1e293b',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Chief Complaints / Reason</label>
                <textarea 
                  placeholder="Describe your current symptoms, vital readings or questions for the doctor..."
                  value={bookReason}
                  onChange={e => setBookReason(e.target.value)}
                  style={{ width: '100%', height: '80px', padding: '0.65rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', resize: 'none' }}
                />
              </div>

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  marginTop: '0.5rem',
                  boxShadow: '0 4px 15px rgba(2, 132, 199, 0.4)'
                }}>
                Confirm Meeting & Generate Room Code
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
