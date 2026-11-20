import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import html2canvas from 'html2canvas';
import { 
  Video, VideoOff, Mic, MicOff, PhoneOff, Share2, MessageSquare, 
  Calendar, Clock, User, Stethoscope, Send, CheckCircle, Plus, 
  Search, Copy, Check, FileText, Activity, Shield, Maximize2, 
  Minimize2, AlertCircle, Sparkles, X, ChevronRight, PhoneCall, Trash2,
  Users, UserCheck, HeartPulse, Radio, Image as ImageIcon, Paperclip, 
  Smile, Film, Music, Download, Flag, ZoomIn, Loader2, Camera
} from 'lucide-react';
import '../styles/App.css';

// Public STUN servers for WebRTC Peer-to-Peer connectivity
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

// Quick Emotes List for Healthcare & Reactions
const EMOTES_LIST = [
  '👍', '❤️', '🙏', '🩺', '💊', '🩹', '💉', '🏥', '👨‍⚕️', '👩‍⚕️', 
  '🤒', '😷', '🧬', '🚑', '📋', '🧪', '🔬', '😊', '😂', '👏', 
  '🤝', '🔥', '💯', '🆗', '⚠️', '⭐'
];

export default function TeleConsultation({ user }) {
  const userEmail = user?.email?.toLowerCase() || 'guest@sanjeevani.ai';
  const isAdmin = user?.role === 'developer' || userEmail === 'satyamtyagiji15@gmail.com';

  // Convex real-time synchronization
  const allRecords = useQuery(api.records.getAllRecords) || [];
  const saveRecordMutation = useMutation(api.records.saveRecord);
  const deleteRecordMutation = useMutation(api.records.deleteRecord);

  // Dynamic doctor verification check in database
  const myDoctorProfile = allRecords.find(
    r => r.type === 'doctor_profile' && 
    (r.data?.email?.toLowerCase() === userEmail || r.patientId?.toLowerCase() === userEmail)
  )?.data;
  
  const isDoctor = !isAdmin && (user?.role === 'doctor' || !!myDoctorProfile);
  const userName = user?.name || myDoctorProfile?.name || (isAdmin ? "Satyam Tyagi (Admin)" : isDoctor ? "Dr. Medical Specialist" : "Patient");

  // State management: ONLY 2 MAIN TABS
  // 'meetings' = Consultation Hub (Directory & Appointments)
  // 'chat'     = Live Chat Dashboard
  const [activeTab, setActiveTab] = useState('meetings');
  const [adminViewMode, setAdminViewMode] = useState('doctors'); // 'doctors' or 'patients' (for Admin only)
  
  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');

  // Booking Modal State (ONLY Doctor fixes meetings)
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [selectedBookingTarget, setSelectedBookingTarget] = useState(null); // Patient object
  const [bookDate, setBookDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookTime, setBookTime] = useState('11:00 AM');
  const [bookReason, setBookReason] = useState('');
  const [bookUrgency, setBookUrgency] = useState('Standard');

  // Active Video Call Room State
  const [isInCall, setIsInCall] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [activeCallPartner, setActiveCallPartner] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallChatOpen, setIsCallChatOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Real WebRTC Connectivity States
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [isPeerConnected, setIsPeerConnected] = useState(false);

  // Video stream refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const pcRef = useRef(null);
  const broadcastChannelRef = useRef(null);
  const processedSignalsRef = useRef(new Set());
  const pendingCandidatesRef = useRef([]);

  // Chat Dashboard State
  const [activeChatPeer, setActiveChatPeer] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [selectedAttachment, setSelectedAttachment] = useState(null); // { type, url, name, size }
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // File input refs for chat attachments
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fullscreen Photo Lightbox State
  const [lightboxImage, setLightboxImage] = useState(null);

  // Live WhatsApp Voice Note Recording State
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioTimerRef = useRef(null);

  // Dual-Sided Incident Report with Screenshot State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportContext, setReportContext] = useState('');
  const [reportScreenshot, setReportScreenshot] = useState(null);
  const [reportReason, setReportReason] = useState('Abusive Language / Harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);

  // Chat scroll refs
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isUserScrolledUp = useRef(false);
  const prevPeerEmailRef = useRef(null);

  // =========================================================================
  // DYNAMIC DATA EXTRACTION (ZERO HARDCODED PROFILES)
  // =========================================================================

  // 1. Registered Certified Doctors
  const allDoctors = allRecords
    .filter(r => r.type === 'doctor_profile' && r.data?.email)
    .map(r => ({ ...r.data, id: r._id, recordId: r._id }));

  // 2. Real Registered Patients
  const allPatients = (() => {
    const patientMap = new Map();

    allRecords.filter(r => r.type === 'patient_profile' && (r.data?.email || r.patientId)).forEach(r => {
      const email = (r.data?.email || r.patientId).toLowerCase();
      if (!patientMap.has(email)) {
        patientMap.set(email, {
          id: r._id,
          name: r.data?.name || email.split('@')[0],
          email: email,
          role: 'patient',
          concern: r.data?.concern || 'General Clinical Consultation',
          lastActive: r.data?.registeredAt || r._creationTime || Date.now(),
          phone: r.data?.phone || 'On File',
          isOnline: true
        });
      }
    });

    allRecords.filter(r => (r.type === 'access_request' || r.type === 'access_approval') && r.data?.email).forEach(r => {
      const email = r.data.email.toLowerCase();
      const isDoc = allRecords.some(d => d.type === 'doctor_profile' && d.data?.email?.toLowerCase() === email);
      const isDev = email === 'satyamtyagiji15@gmail.com';
      if (!isDoc && !isDev && !patientMap.has(email)) {
        patientMap.set(email, {
          id: r._id,
          name: r.data?.name || email.split('@')[0],
          email: email,
          role: 'patient',
          concern: 'Outpatient Tele-Consultation',
          lastActive: r.data?.requestedAt || r.data?.decidedAt || r._creationTime || Date.now(),
          phone: 'Registered Patient',
          isOnline: true
        });
      }
    });

    allRecords.filter(r => r.type === 'tele_appointment' && r.data?.patientEmail).forEach(r => {
      const email = r.data.patientEmail.toLowerCase();
      if (patientMap.has(email)) {
        const existing = patientMap.get(email);
        if (r.data.reason) existing.concern = r.data.reason;
      } else {
        patientMap.set(email, {
          id: r._id,
          name: r.data.patientName || email.split('@')[0],
          email: email,
          role: 'patient',
          concern: r.data.reason || 'Scheduled Video Consultation',
          lastActive: r.data.createdAt || Date.now(),
          phone: 'Booked Patient',
          isOnline: true
        });
      }
    });

    allRecords.filter(r => r.type === 'triage_assessment' && r.patientId).forEach(r => {
      const email = r.patientId.toLowerCase();
      if (email.includes('@') && !patientMap.has(email)) {
        patientMap.set(email, {
          id: r._id,
          name: r.data?.name || email.split('@')[0],
          email: email,
          role: 'patient',
          concern: r.data?.chiefComplaint || 'AI ER Triage Evaluation',
          lastActive: r.data?.timestamp || Date.now(),
          phone: 'Triage Patient',
          isOnline: true
        });
      }
    });

    return Array.from(patientMap.values());
  })();

  // 3. Appointments list
  const appointments = allRecords
    .filter(r => r.type === 'tele_appointment')
    .map(r => ({ ...r.data, recordId: r._id }))
    .filter(a => {
      if (isAdmin) return true;
      if (isDoctor) return a.doctorEmail?.toLowerCase() === userEmail;
      return a.patientEmail?.toLowerCase() === userEmail;
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // 4. Chat messages
  const allChats = allRecords
    .filter(r => r.type === 'tele_chat')
    .map(r => r.data)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const currentChatMessages = allChats.filter(c => {
    if (!activeChatPeer) return false;
    const peerEmail = (activeChatPeer.email || activeChatPeer.doctorEmail || activeChatPeer.patientEmail || '').toLowerCase();
    return (
      (c.senderEmail?.toLowerCase() === userEmail && c.receiverEmail?.toLowerCase() === peerEmail) ||
      (c.receiverEmail?.toLowerCase() === userEmail && c.senderEmail?.toLowerCase() === peerEmail)
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

  // Handle chat peer change and auto-scroll without fighting user scroll
  useEffect(() => {
    const peerEmail = activeChatPeer?.email || activeChatPeer?.patientEmail || activeChatPeer?.doctorEmail;
    if (peerEmail && peerEmail !== prevPeerEmailRef.current) {
      prevPeerEmailRef.current = peerEmail;
      isUserScrolledUp.current = false;
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 50);
    }
  }, [activeChatPeer]);

  // Track user scroll position in chat to allow smooth reading upwards
  const handleChatScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    isUserScrolledUp.current = (scrollHeight - scrollTop - clientHeight) > 80;
  };

  // Image compression utility before uploading (max 1000px, quality 0.75)
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1000;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle attachment selection (image, video, audio, file) with chunked video support up to 25MB
  const handleFileSelect = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert("⚠️ File size exceeds 25MB. Please select a smaller file.");
      return;
    }

    setIsUploading(true);
    try {
      if (type === 'image') {
        const compressedUrl = await compressImage(file);
        setSelectedAttachment({
          type: 'image',
          url: compressedUrl,
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB'
        });
      } else if (type === 'video') {
        // If video is > 400KB, mark as chunked so it's split across records to bypass Convex 1MB document limit
        if (file.size > 400 * 1024) {
          setSelectedAttachment({
            type: 'video',
            isChunked: true,
            file,
            name: file.name,
            size: (file.size / (1024 * 1024)).toFixed(1) + ' MB'
          });
        } else {
          const reader = new FileReader();
          reader.onload = (ev) => {
            setSelectedAttachment({
              type: 'video',
              url: ev.target.result,
              name: file.name,
              size: (file.size / 1024).toFixed(1) + ' KB'
            });
          };
          reader.readAsDataURL(file);
        }
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setSelectedAttachment({
            type,
            url: ev.target.result,
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB'
          });
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      alert("Error attaching file: " + err.message);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Live WhatsApp-Style Voice Note Recording
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecordingAudio(true);
      setRecordingDuration(0);
      audioTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone permission required for voice notes: " + err.message);
    }
  };

  const stopAudioRecording = (shouldSend = true) => {
    if (audioTimerRef.current) {
      clearInterval(audioTimerRef.current);
      audioTimerRef.current = null;
    }
    const recorder = audioRecorderRef.current;
    const finalDuration = recordingDuration;

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = async () => {
        if (shouldSend && audioChunksRef.current.length > 0 && activeChatPeer) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onload = async () => {
            const base64Audio = reader.result;
            const peerEmail = activeChatPeer.email || activeChatPeer.doctorEmail || activeChatPeer.patientEmail;
            const peerName = activeChatPeer.name || activeChatPeer.doctorName || activeChatPeer.patientName;

            const voiceMsg = {
              senderName: userName,
              senderEmail: userEmail,
              receiverName: peerName,
              receiverEmail: peerEmail,
              message: '',
              attachment: {
                type: 'audio',
                url: base64Audio,
                name: `Voice Note (${formatTimer(finalDuration)})`,
                size: 'Audio Recording'
              },
              timestamp: Date.now()
            };

            try {
              await saveRecordMutation({
                patientId: userEmail,
                type: 'tele_chat',
                data: voiceMsg
              });
              setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }, 50);
            } catch (err) {
              alert("Error sending voice note: " + err.message);
            }
          };
          reader.readAsDataURL(audioBlob);
        }

        if (recorder.stream) {
          recorder.stream.getTracks().forEach(t => t.stop());
        }
        audioRecorderRef.current = null;
        audioChunksRef.current = [];
      };
      recorder.stop();
    }

    setIsRecordingAudio(false);
    setRecordingDuration(0);
  };

  // Capture full screen evidence snapshot immediately
  const captureFullScreenshot = async (target = reportTarget, context = reportContext) => {
    try {
      // 1. Snapshot all active video elements into temporary canvases
      const videos = Array.from(document.querySelectorAll('video'));
      const videoFrames = [];
      for (const v of videos) {
        try {
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            const vCanvas = document.createElement('canvas');
            vCanvas.width = Math.min(v.videoWidth, 640);
            vCanvas.height = Math.round((vCanvas.width * v.videoHeight) / v.videoWidth);
            const vCtx = vCanvas.getContext('2d');
            vCtx.drawImage(v, 0, 0, vCanvas.width, vCanvas.height);
            videoFrames.push({
              dataUrl: vCanvas.toDataURL('image/jpeg', 0.7),
            });
          } else {
            videoFrames.push(null);
          }
        } catch (e) {
          console.warn("Video snapshot error:", e);
          videoFrames.push(null);
        }
      }

      // 2. Capture document with html2canvas (target body or main container)
      const targetElement = document.querySelector('.teleconsult-container') || document.body;
      const canvas = await html2canvas(targetElement, {
        backgroundColor: '#0b1120',
        scale: 0.65, // ~70KB payload size to stay well under Convex document limit
        useCORS: true,
        allowTaint: true,
        logging: false,
        ignoreElements: (el) => {
          return el.classList?.contains('report-modal-overlay') || el.id === 'report-modal';
        },
        onclone: (clonedDoc) => {
          // Replace video elements in clone with image snapshots so WebRTC streams render cleanly
          const clonedVideos = Array.from(clonedDoc.querySelectorAll('video'));
          clonedVideos.forEach((cv, idx) => {
            const frame = videoFrames[idx];
            if (frame && frame.dataUrl && cv.parentNode) {
              const img = clonedDoc.createElement('img');
              img.src = frame.dataUrl;
              img.style.width = cv.style.width || '100%';
              img.style.height = cv.style.height || '100%';
              img.style.objectFit = cv.style.objectFit || 'cover';
              img.style.borderRadius = cv.style.borderRadius || '8px';
              img.style.transform = cv.style.transform || 'none';
              cv.parentNode.replaceChild(img, cv);
            }
          });
        }
      });

      return canvas.toDataURL('image/jpeg', 0.65);
    } catch (err) {
      console.error("Full screenshot capture error:", err);
      // High-fidelity fallback canvas with timestamp, target and consultation metadata
      try {
        const fbCanvas = document.createElement('canvas');
        fbCanvas.width = 960;
        fbCanvas.height = 540;
        const ctx = fbCanvas.getContext('2d');
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(0, 0, 960, 540);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(20, 20, 920, 500);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillText('SANJEEVANI AI • INCIDENT EVIDENCE CAPTURE', 50, 75);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '16px Inter, sans-serif';
        ctx.fillText(`Recorded At: ${new Date().toLocaleString()}`, 50, 115);
        ctx.fillText(`Target: ${target?.name || 'User'} (${target?.email || 'N/A'})`, 50, 145);
        ctx.fillText(`Context: ${context || 'Consultation Violation'}`, 50, 175);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText(`Session Peer: ${activeCallPartner?.name || activeChatPeer?.name || 'Active Session'}`, 50, 210);
        ctx.fillText(`Meeting Code: ${activeRoomId || 'Direct Chat'}`, 50, 235);
        return fbCanvas.toDataURL('image/jpeg', 0.65);
      } catch (e) {
        return null;
      }
    }
  };

  // Open Incident Report Modal - Captures live screen IMMEDIATELY on click
  const handleOpenReport = async (target, context) => {
    setIsCapturingScreenshot(true);
    setReportTarget(target);
    setReportContext(context);
    setReportScreenshot(null);
    setReportDetails('');

    try {
      // 1. Capture screen right at the instant Report button is clicked (before modal covers it)
      const screenshotUrl = await captureFullScreenshot(target, context);
      setReportScreenshot(screenshotUrl);
    } catch (err) {
      console.warn("Screen capture failed on click:", err);
    } finally {
      setIsCapturingScreenshot(false);
      // 2. Open report modal with screenshot ready
      setIsReportModalOpen(true);
    }
  };

  // Submit Incident Report to Convex
  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!reportTarget) return;

    try {
      // Ensure screenshot is always attached
      let finalScreenshot = reportScreenshot;
      if (!finalScreenshot) {
        finalScreenshot = await captureFullScreenshot(reportTarget, reportContext);
      }

      await saveRecordMutation({
        patientId: userEmail,
        type: 'incident_report',
        data: {
          reporterName: userName,
          reporterEmail: userEmail,
          reporterRole: isAdmin ? 'Developer Admin' : isDoctor ? 'Doctor Specialist' : 'Registered Patient',
          targetName: reportTarget?.name || reportTarget?.doctorName || reportTarget?.patientName || 'Unknown User',
          targetEmail: reportTarget?.email || reportTarget?.doctorEmail || reportTarget?.patientEmail || 'N/A',
          targetRole: reportTarget?.role || (isDoctor ? 'Patient' : 'Doctor'),
          context: reportContext,
          reason: reportReason,
          details: reportDetails,
          screenshot: finalScreenshot,
          meetingCode: activeRoomId || null,
          timestamp: Date.now(),
          status: 'pending'
        }
      });
      setIsReportModalOpen(false);
      setReportDetails('');
      setReportScreenshot(null);
      alert("✅ Incident report submitted successfully with full-screen evidence. The developer admin will review and take administrative action.");
    } catch (err) {
      alert("Error submitting incident report: " + err.message);
    }
  };

  // Toggle Contact open / close in Left Sidebar
  const handleContactClick = (peer) => {
    const peerEmail = peer.email || peer.patientEmail || peer.doctorEmail;
    const currentActiveEmail = activeChatPeer?.email || activeChatPeer?.patientEmail || activeChatPeer?.doctorEmail;

    if (currentActiveEmail === peerEmail) {
      // Clicking already active peer closes the chat box
      setActiveChatPeer(null);
    } else {
      // Clicking opens the chat box with this peer
      setActiveChatPeer(peer);
      setIsEmojiPickerOpen(false);
    }
  };

  // =========================================================================
  // 100% REAL WORKING WEBRTC PEER-TO-PEER VIDEO & AUDIO ENGINE
  // =========================================================================

  const dispatchSignal = useCallback(async (sigData) => {
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage(sigData);
      } catch (e) {
        console.warn('BroadcastChannel send:', e);
      }
    }
    try {
      await saveRecordMutation({
        patientId: sigData.meetingCode,
        type: 'webrtc_signal',
        data: {
          ...sigData,
          timestamp: Date.now()
        }
      });
    } catch (err) {
      console.warn('Convex signal send:', err);
    }
  }, [saveRecordMutation]);

  const handleIncomingSignal = useCallback(async (sig) => {
    if (!sig || sig.sender?.toLowerCase() === userEmail) return;
    if (sig.meetingCode !== activeRoomId) return;

    const pc = pcRef.current;
    if (!pc) return;

    try {
      if (sig.signalType === 'join') {
        if (pc.signalingState === 'stable') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          dispatchSignal({
            meetingCode: activeRoomId,
            sender: userEmail,
            signalType: 'offer',
            sdp: { type: offer.type, sdp: offer.sdp }
          });
        }
      } else if (sig.signalType === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        while (pendingCandidatesRef.current.length > 0) {
          const c = pendingCandidatesRef.current.shift();
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn);
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        dispatchSignal({
          meetingCode: activeRoomId,
          sender: userEmail,
          signalType: 'answer',
          sdp: { type: answer.type, sdp: answer.sdp }
        });
      } else if (sig.signalType === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
          while (pendingCandidatesRef.current.length > 0) {
            const c = pendingCandidatesRef.current.shift();
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn);
          }
        }
      } else if (sig.signalType === 'candidate') {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(sig.candidate)).catch(console.warn);
        } else {
          pendingCandidatesRef.current.push(sig.candidate);
        }
      } else if (sig.signalType === 'bye') {
        setHasRemoteStream(false);
        setIsPeerConnected(false);
      }
    } catch (err) {
      console.error('WebRTC signal processing error:', err);
    }
  }, [userEmail, activeRoomId, dispatchSignal]);

  // Listen for signals arriving via Convex database
  useEffect(() => {
    if (!isInCall || !activeRoomId) return;

    allRecords.forEach(r => {
      if (r.type === 'webrtc_signal' && r.data?.meetingCode === activeRoomId) {
        if (!processedSignalsRef.current.has(r._id)) {
          processedSignalsRef.current.add(r._id);
          handleIncomingSignal(r.data);
        }
      }
    });
  }, [allRecords, isInCall, activeRoomId, handleIncomingSignal]);

  // Initialize WebRTC Call (MEETING CODE STRICTLY MANDATORY & VERIFIED)
  const startCall = async (meetingCode, partner) => {
    const cleanCode = (meetingCode || '').trim();
    if (!cleanCode) {
      alert("⚠️ Meeting Code is mandatory. You cannot start or join a video call without a valid Meeting Code.");
      return;
    }

    // STRICT VALIDATION: Code must exist in active scheduled appointments
    const matchingAppointment = appointments.find(
      a => (a.meetingCode || '').trim().toUpperCase() === cleanCode.toUpperCase()
    );

    if (!matchingAppointment) {
      alert(`⚠️ Invalid or Cancelled Meeting Code "${cleanCode}".\n\nOnly valid, active consultation codes scheduled by the doctor are permitted. If the meeting was deleted or does not exist, access is strictly denied.`);
      return;
    }

    const matchedPartner = partner || {
      name: isDoctor ? matchingAppointment.patientName : matchingAppointment.doctorName,
      email: isDoctor ? matchingAppointment.patientEmail : matchingAppointment.doctorEmail
    };

    setActiveRoomId(cleanCode);
    setActiveCallPartner(matchedPartner);
    setIsInCall(true);
    setHasRemoteStream(false);
    setIsPeerConnected(false);
    pendingCandidatesRef.current = [];

    // 1. BroadcastChannel for instant local signaling
    const bc = new BroadcastChannel('sanjeevani_webrtc_' + cleanCode);
    broadcastChannelRef.current = bc;
    bc.onmessage = (event) => {
      handleIncomingSignal(event.data);
    };

    // 2. Local Media
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(console.error);
      }
    } catch (err) {
      console.warn("Camera/Mic access note:", err.message);
    }

    // 3. RTCPeerConnection
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    if (stream) {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    }

    pc.ontrack = (event) => {
      console.log("WebRTC Remote Track Received:", event.track.kind);
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.play().catch(console.error);
        }
        setHasRemoteStream(true);
        setIsPeerConnected(true);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        dispatchSignal({
          meetingCode: cleanCode,
          sender: userEmail,
          signalType: 'candidate',
          candidate: event.candidate.toJSON()
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsPeerConnected(true);
        setHasRemoteStream(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setIsPeerConnected(false);
      }
    };

    setTimeout(() => {
      dispatchSignal({
        meetingCode: cleanCode,
        sender: userEmail,
        signalType: 'join'
      });
    }, 400);
  };

  // End Call & Cleanup
  const handleEndCall = () => {
    if (activeRoomId) {
      dispatchSignal({
        meetingCode: activeRoomId,
        sender: userEmail,
        signalType: 'bye'
      });
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.close();
      broadcastChannelRef.current = null;
    }

    setIsInCall(false);
    setHasRemoteStream(false);
    setIsPeerConnected(false);
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
        const screenTrack = screenStream.getVideoTracks()[0];

        if (pcRef.current) {
          const sender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        }

        setIsScreenSharing(true);
        screenTrack.onended = () => {
          stopScreenSharing();
        };
      } catch (err) {
        console.warn("Screen share cancelled:", err);
      }
    } else {
      stopScreenSharing();
    }
  };

  const stopScreenSharing = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (pcRef.current && localStreamRef.current) {
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender && cameraTrack) {
        sender.replaceTrack(cameraTrack);
      }
    }
    setIsScreenSharing(false);
  };

  const copyMeetingCode = () => {
    navigator.clipboard.writeText(activeRoomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Appointment Booking Handler (DOCTOR ONLY)
  const handleDoctorConfirmAppointment = async (e) => {
    e.preventDefault();
    if (!selectedBookingTarget) return;

    const meetingCode = `SANJ-CONF-${Math.floor(100000 + Math.random() * 900000)}`;

    const docName = userName;
    const docEmail = userEmail;
    const patName = selectedBookingTarget.name;
    const patEmail = selectedBookingTarget.email;

    try {
      await saveRecordMutation({
        patientId: patEmail,
        type: 'tele_appointment',
        data: {
          meetingCode,
          doctorName: docName,
          doctorEmail: docEmail,
          doctorSpecialty: myDoctorProfile?.specialization || 'Clinical Specialist',
          doctorHospital: myDoctorProfile?.hospital || 'Tele-Health Network',
          patientName: patName,
          patientEmail: patEmail,
          date: bookDate,
          time: bookTime,
          reason: bookReason || "Video Tele-Consultation",
          urgency: bookUrgency,
          status: "Scheduled",
          createdAt: Date.now()
        }
      });

      // Send meeting invite message into tele_chat
      await saveRecordMutation({
        patientId: userEmail,
        type: 'tele_chat',
        data: {
          senderName: userName,
          senderEmail: userEmail,
          receiverName: selectedBookingTarget.name,
          receiverEmail: selectedBookingTarget.email,
          message: `📅 Meeting scheduled for ${bookDate} at ${bookTime}. Reason: ${bookReason || 'Consultation'}. Room Code: ${meetingCode}`,
          timestamp: Date.now(),
          meetingCode
        }
      });

      setIsBookModalOpen(false);
      setBookReason('');
      alert(`Meeting fixed successfully with Patient ${selectedBookingTarget.name}!\nDate: ${bookDate} at ${bookTime}\nRoom Code: ${meetingCode}`);
    } catch (err) {
      console.error(err);
      alert("Error scheduling appointment: " + (err.message || err));
    }
  };

  // Chat message send handler (Supports text, photo, video, audio, files & emotes with chunked video support)
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!chatInput.trim() && !selectedAttachment) || !activeChatPeer) return;

    const peerEmail = activeChatPeer.email || activeChatPeer.doctorEmail || activeChatPeer.patientEmail;
    const peerName = activeChatPeer.name || activeChatPeer.doctorName || activeChatPeer.patientName;

    setIsUploading(true);
    try {
      // Chunked Video Upload for videos larger than 400KB to bypass Convex 1MB document limit
      if (selectedAttachment?.isChunked && selectedAttachment.file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const base64Data = ev.target.result;
            const fileId = 'vid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
            const chunkSize = 250000;
            const totalChunks = Math.ceil(base64Data.length / chunkSize);

            for (let i = 0; i < totalChunks; i++) {
              const chunkStr = base64Data.substring(i * chunkSize, (i + 1) * chunkSize);
              await saveRecordMutation({
                patientId: userEmail,
                type: 'media_chunk',
                data: {
                  fileId,
                  chunkIndex: i,
                  totalChunks,
                  chunk: chunkStr
                }
              });
            }

            const newMsg = {
              senderName: userName,
              senderEmail: userEmail,
              receiverName: peerName,
              receiverEmail: peerEmail,
              message: chatInput.trim(),
              attachment: {
                type: 'video',
                isChunked: true,
                fileId,
                totalChunks,
                name: selectedAttachment.name,
                size: selectedAttachment.size
              },
              timestamp: Date.now()
            };

            await saveRecordMutation({
              patientId: userEmail,
              type: 'tele_chat',
              data: newMsg
            });

            setChatInput('');
            setSelectedAttachment(null);
            setIsEmojiPickerOpen(false);
            setIsUploading(false);
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          } catch (chunkErr) {
            console.error(chunkErr);
            alert("Error uploading video chunks: " + chunkErr.message);
            setIsUploading(false);
          }
        };
        reader.readAsDataURL(selectedAttachment.file);
        return;
      }

      // Normal text or direct photo / audio / document attachment
      const newMsg = {
        senderName: userName,
        senderEmail: userEmail,
        receiverName: peerName,
        receiverEmail: peerEmail,
        message: chatInput.trim(),
        attachment: selectedAttachment ? { ...selectedAttachment } : null,
        timestamp: Date.now()
      };

      await saveRecordMutation({
        patientId: userEmail,
        type: 'tele_chat',
        data: newMsg
      });
      setChatInput('');
      setSelectedAttachment(null);
      setIsEmojiPickerOpen(false);

      // Smooth scroll to bottom on new message sent by user
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } catch (err) {
      console.error(err);
      alert("Error sending message: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Delete past/scheduled meeting (DOCTOR / ADMIN ONLY)
  const handleDeleteMeeting = async (apt) => {
    const partnerName = isDoctor ? apt.patientName : apt.doctorName;
    if (window.confirm(`Are you sure you want to cancel and delete meeting ${apt.meetingCode} with ${partnerName}?`)) {
      try {
        await deleteRecordMutation({ recordId: apt.recordId });
      } catch (err) {
        alert("Error deleting meeting: " + (err.message || err));
      }
    }
  };

  // Filter Doctors by search & specialty
  const filteredDoctors = allDoctors.filter(doc => {
    const term = searchQuery.toLowerCase();
    const matchesSearch = (doc.name || '').toLowerCase().includes(term) || 
                          (doc.specialization || '').toLowerCase().includes(term) ||
                          (doc.hospital || '').toLowerCase().includes(term);
    const matchesSpecialty = selectedSpecialty === 'ALL' || (doc.specialization || '').toLowerCase().includes(selectedSpecialty.toLowerCase());
    return matchesSearch && matchesSpecialty;
  });

  // Filter Patients by search
  const filteredPatients = allPatients.filter(pat => {
    const term = searchQuery.toLowerCase();
    return (pat.name || '').toLowerCase().includes(term) ||
           (pat.email || '').toLowerCase().includes(term) ||
           (pat.concern || '').toLowerCase().includes(term);
  });

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  // Helper component for chunked video reconstruction in chat
  const ChunkedVideoViewer = ({ attachment }) => {
    const matchingChunks = allRecords.filter(r => r.type === 'media_chunk' && r.data?.fileId === attachment.fileId);
    const totalChunks = attachment.totalChunks || 1;
    const isComplete = matchingChunks.length >= totalChunks;

    if (!isComplete) {
      return (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid #334155', color: '#94a3b8', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Loader2 size={16} className="animate-spin" color="#38bdf8" />
          <span>Assembling video clip ({matchingChunks.length}/{totalChunks} chunks)...</span>
        </div>
      );
    }

    const assembledBase64 = matchingChunks
      .sort((a, b) => (a.data?.chunkIndex || 0) - (b.data?.chunkIndex || 0))
      .map(r => r.data?.chunk || '')
      .join('');

    return (
      <video 
        src={assembledBase64} 
        controls 
        playsInline 
        style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '8px', display: 'block', background: '#000' }}
      />
    );
  };

  // Render Full-Screen Lightbox Modal
  const renderLightboxModal = () => {
    if (!lightboxImage) return null;
    return (
      <div 
        onClick={() => setLightboxImage(null)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.94)',
          backdropFilter: 'blur(8px)',
          zIndex: 999999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
        <div style={{ position: 'absolute', top: '1.25rem', right: '1.5rem', display: 'flex', gap: '1rem', zIndex: 1000000 }}>
          <a 
            href={lightboxImage} 
            download={`sanjeevani_clinical_photo_${Date.now()}.jpg`}
            onClick={e => e.stopPropagation()}
            style={{ background: '#0284c7', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
            <Download size={16} /> Download High-Res
          </a>
          <button 
            onClick={() => setLightboxImage(null)}
            style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ maxWidth: '92vw', maxHeight: '88vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          <img 
            src={lightboxImage} 
            alt="Fullscreen Photo Preview" 
            style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px', border: '2px solid rgba(56, 189, 248, 0.6)', boxShadow: '0 0 45px rgba(0,0,0,0.9)' }} 
          />
        </div>
      </div>
    );
  };

  // Render Incident Report Modal
  const renderReportModal = () => {
    if (!isReportModalOpen) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999, padding: '1rem' }}>
        <div style={{ background: '#0f172a', border: '1px solid #ef4444', borderRadius: '16px', width: '100%', maxWidth: '560px', padding: '1.75rem', color: '#fff', position: 'relative', boxShadow: '0 20px 50px rgba(239,68,68,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
          
          <button 
            onClick={() => { setIsReportModalOpen(false); setReportScreenshot(null); }}
            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={22} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Flag size={22} color="#ef4444" />
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: '#f8fafc' }}>
              Report Incident to Developer Admin
            </h3>
          </div>
          <p style={{ margin: '0 0 1.25rem', color: '#94a3b8', fontSize: '0.85rem' }}>
            Your report will be delivered directly to Developer Admin (Satyam Tyagi) with instant full-screen evidence for review, disciplinary warning, or account ban.
          </p>

          {/* Reported target summary */}
          <div style={{ background: '#1e293b', padding: '0.85rem 1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.75rem', color: '#fca5a5', fontWeight: 'bold', textTransform: 'uppercase' }}>Reported User</div>
            <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.95rem', marginTop: '2px' }}>{reportTarget?.name || reportTarget?.doctorName || reportTarget?.patientName || 'User'}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{reportTarget?.email || reportTarget?.doctorEmail || reportTarget?.patientEmail || 'Active Participant'} • Context: {reportContext}</div>
          </div>

          <form onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '0.35rem', fontWeight: 'bold' }}>Violation Reason</label>
              <select 
                value={reportReason} 
                onChange={e => setReportReason(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}>
                <option>Abusive Language / Harassment</option>
                <option>Inappropriate Visual Conduct / Indecency</option>
                <option>Fraudulent or Impersonated Specialist</option>
                <option>Medical Malpractice / Negligence</option>
                <option>Spam, Phishing or Unwanted Solicitation</option>
                <option>Privacy or Confidentiality Breach</option>
                <option>Other Serious Misconduct</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '0.35rem', fontWeight: 'bold' }}>Detailed Description / Incident Notes</label>
              <textarea 
                placeholder="Explain what occurred during this call or chat..."
                value={reportDetails}
                onChange={e => setReportDetails(e.target.value)}
                required
                style={{ width: '100%', height: '80px', padding: '0.65rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', resize: 'none', fontSize: '0.85rem' }}
              />
            </div>

            {/* Captured Screenshot Preview */}
            <div style={{ marginTop: '0.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 'bold', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Camera size={15} /> Full-Screen Screenshot Evidence:
                </span>
                {reportScreenshot && (
                  <button 
                    type="button"
                    onClick={async () => {
                      setIsCapturingScreenshot(true);
                      const sc = await captureFullScreenshot();
                      setReportScreenshot(sc);
                      setIsCapturingScreenshot(false);
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>
                    Re-capture Screen
                  </button>
                )}
              </div>

              {isCapturingScreenshot ? (
                <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '8px', border: '1px dashed #38bdf8', textAlign: 'center', color: '#38bdf8', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Capturing full screen & video evidence snapshot...</span>
                </div>
              ) : reportScreenshot ? (
                <div 
                  onClick={() => setLightboxImage(reportScreenshot)}
                  title="Click to preview screenshot in full size"
                  style={{ borderRadius: '8px', overflow: 'hidden', border: '2px solid #38bdf8', maxHeight: '160px', position: 'relative', cursor: 'pointer' }}>
                  <img src={reportScreenshot} alt="Evidence" style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Eye size={12} /> Tap to Enlarge
                  </div>
                </div>
              ) : (
                <div style={{ padding: '0.85rem', background: '#1e293b', borderRadius: '8px', border: '1px dashed #ef4444', textAlign: 'center', color: '#fca5a5', fontSize: '0.8rem' }}>
                  <span>⚠️ Evidence capture pending. Click below to take screenshot.</span>
                  <div style={{ marginTop: '0.35rem' }}>
                    <button 
                      type="button"
                      onClick={async () => {
                        setIsCapturingScreenshot(true);
                        const sc = await captureFullScreenshot();
                        setReportScreenshot(sc);
                        setIsCapturingScreenshot(false);
                      }}
                      style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}>
                      📸 Capture Screen Snapshot Now
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => { setIsReportModalOpen(false); setReportScreenshot(null); }}
                style={{ flex: 1, padding: '0.75rem', background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                Cancel
              </button>
              <button
                type="submit"
                style={{ flex: 2, padding: '0.75rem', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(239,68,68,0.4)' }}>
                <Flag size={16} /> Submit Incident Report
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // =========================================================================
  // IF IN ACTIVE VIDEO CALL -> RENDER FULL REAL WEBRTC VIDEO CONSULTATION ROOM
  // =========================================================================
  if (isInCall) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#020617', color: '#fff', position: 'fixed', inset: 0, zIndex: 9999, overflow: 'hidden' }}>
        
        {/* Top Header Bar */}
        <div style={{ height: '56px', background: 'rgba(15, 23, 42, 0.98)', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1e293b', padding: '0.4rem 0.85rem', borderRadius: '6px', border: '1px solid #334155' }}>
              <Shield size={16} color="#38bdf8" />
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc', letterSpacing: '0.5px' }}>Room: {activeRoomId}</span>
              <button onClick={copyMeetingCode} style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0 }} title="Copy Room ID">
                {copiedCode ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.2s infinite' }}></span>
              REC {formatTimer(callDuration)}
            </div>
          </div>

          <div style={{ fontSize: '0.95rem', color: '#e2e8f0', fontWeight: '600' }}>
            Consultation with: <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{activeCallPartner?.name || "Patient / Doctor"}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => handleOpenReport(activeCallPartner, 'Live WebRTC Video Consultation')}
              disabled={isCapturingScreenshot}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                borderRadius: '6px',
                padding: '0.35rem 0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
              }}>
              <Flag size={14} color="#f87171" />
              {isCapturingScreenshot ? 'Capturing Proof...' : 'Report Incident'}
            </button>

            <div style={{ 
              fontSize: '0.8rem', 
              color: isPeerConnected ? '#34d399' : '#f59e0b', 
              background: isPeerConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', 
              border: `1px solid ${isPeerConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`, 
              padding: '0.35rem 0.75rem', 
              borderRadius: '6px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem' 
            }}>
              <Radio size={14} />
              {isPeerConnected ? 'Live WebRTC Connected (Audio + Video)' : 'Connecting Peer Stream...'}
            </div>
          </div>
        </div>

        {/* Main Video Viewport */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090d16', overflow: 'hidden' }}>
          
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            
            {/* The actual remote video element playing live stream */}
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: isScreenSharing ? 'contain' : 'cover',
                display: hasRemoteStream ? 'block' : 'none'
              }}
            />

            {/* If remote stream is connecting, display clean waiting screen */}
            {!hasRemoteStream && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)' }}>
                <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'linear-gradient(135deg, #0284c7, #38bdf8)', border: '4px solid rgba(56, 189, 248, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 35px rgba(56, 189, 248, 0.4)', animation: 'pulse 2s infinite' }}>
                  {isDoctor ? <User size={56} color="#fff" /> : <Stethoscope size={56} color="#fff" />}
                </div>
                <h3 style={{ marginTop: '1.25rem', color: '#f8fafc', fontSize: '1.3rem', fontWeight: '700' }}>
                  {activeCallPartner?.name || (isDoctor ? "Patient" : "Doctor Specialist")}
                </h3>
                <div style={{ color: '#38bdf8', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8', animation: 'ping 1.5s infinite' }}></span>
                  Connecting Real-Time Audio & Video Stream...
                </div>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.5rem', maxWidth: '420px', textAlign: 'center' }}>
                  Waiting for partner to join with Room Code: <strong style={{ color: '#fff' }}>{activeRoomId}</strong>
                </p>
              </div>
            )}

            {/* Local Webcam Picture-in-Picture */}
            <div style={{
              position: 'absolute',
              bottom: '1.5rem',
              left: '1.5rem',
              width: '200px',
              height: '135px',
              background: '#0f172a',
              border: '2px solid #38bdf8',
              borderRadius: '12px',
              overflow: 'hidden',
              zIndex: 20,
              boxShadow: '0 8px 24px rgba(0,0,0,0.7)'
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
                  <VideoOff size={32} color="#94a3b8" />
                </div>
              )}
              <div style={{ position: 'absolute', bottom: '6px', left: '8px', fontSize: '0.7rem', background: 'rgba(0,0,0,0.65)', padding: '2px 6px', borderRadius: '4px', color: '#fff' }}>
                You {isMuted ? '(Muted)' : ''}
              </div>
            </div>
          </div>

          {/* In-Call Side Chat Drawer */}
          {isCallChatOpen && (
            <div style={{ width: '320px', height: '100%', background: 'rgba(15, 23, 42, 0.98)', borderLeft: '1px solid #334155', display: 'flex', flexDirection: 'column', zIndex: 30 }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#fff' }}>In-Call Messages</span>
                <button onClick={() => setIsCallChatOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ background: '#1e293b', padding: '0.5rem', borderRadius: '6px', fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center' }}>
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
                  style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.45rem 0.6rem', color: '#fff', fontSize: '0.8rem' }}
                />
                <button type="submit" style={{ background: '#38bdf8', color: '#000', border: 'none', borderRadius: '6px', padding: '0.45rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>
                  <Send size={14} />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Floating Zoom Control Bar */}
        <div style={{
          height: '75px',
          background: 'rgba(15, 23, 42, 0.98)',
          borderTop: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
          zIndex: 10
        }}>
          <button 
            onClick={toggleMute}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
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

          <button 
            onClick={toggleVideo}
            title={isVideoOff ? "Start Camera" : "Stop Camera"}
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

          <button 
            onClick={toggleScreenShare}
            title={isScreenSharing ? "Stop Screen Share" : "Share Your Screen"}
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: isScreenSharing ? '#0284c7' : '#1e293b',
              color: '#fff',
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
            <Share2 size={20} />
          </button>

          <button 
            onClick={() => setIsCallChatOpen(!isCallChatOpen)}
            title="Toggle In-Call Chat"
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

        {/* Modals inside Call Room */}
        {renderReportModal()}
        {renderLightboxModal()}
      </div>
    );
  }

  // =========================================================================
  // NORMAL INTERFACE (TAB 1: CONSULTATION HUB | TAB 2: LIVE CHAT DASHBOARD)
  // =========================================================================
  return (
    <div className="teleconsult-container" style={{ padding: '1.5rem', color: '#f8fafc', minHeight: '100vh', background: '#0b1120', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Hidden File Inputs for Chat Attachments */}
      <input type="file" ref={imageInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileSelect(e, 'image')} />
      <input type="file" ref={videoInputRef} style={{ display: 'none' }} accept="video/*" onChange={(e) => handleFileSelect(e, 'video')} />
      <input type="file" ref={audioInputRef} style={{ display: 'none' }} accept="audio/*" onChange={(e) => handleFileSelect(e, 'audio')} />
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf,.doc,.docx,.txt,.csv,application/*" onChange={(e) => handleFileSelect(e, 'file')} />

      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: 'rgba(15, 23, 42, 0.75)', padding: '1.25rem 1.5rem', borderRadius: '14px', border: '1px solid rgba(56, 189, 248, 0.25)', backdropFilter: 'blur(12px)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 10px #38bdf8' }}></div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800', letterSpacing: '0.5px', background: 'linear-gradient(90deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              e-Vaidya • Tele-Consultancy & Live Video Hub
            </h1>
          </div>
          <p style={{ margin: '0.35rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Encrypted WebRTC Peer-to-Peer Live Video Consultations • Multimedia Chat • Doctor-Managed Scheduling
          </p>
        </div>

        {/* Current User Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#f8fafc' }}>{userName}</div>
            <div style={{ fontSize: '0.75rem', color: isAdmin ? '#fbbf24' : isDoctor ? '#34d399' : '#38bdf8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
              ● Logged in as {isAdmin ? 'Developer Admin (Full Access)' : isDoctor ? 'Certified Doctor' : 'Registered Patient'}
            </div>
          </div>
          <div style={{ 
            width: '42px', 
            height: '42px', 
            borderRadius: '10px', 
            background: isAdmin ? 'rgba(245, 158, 11, 0.15)' : isDoctor ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.15)', 
            border: `1px solid ${isAdmin ? '#fbbf24' : isDoctor ? '#34d399' : '#38bdf8'}`, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}>
            {isAdmin ? <Shield size={22} color="#fbbf24" /> : isDoctor ? <Stethoscope size={22} color="#34d399" /> : <User size={22} color="#38bdf8" />}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CLEAN 2-TAB NAVIGATION (MEETING CODE STRICTLY MANDATORY TO JOIN) */}
      {/* ========================================================================= */}
      <div style={{ display: 'flex', gap: '0.85rem', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.85rem', flexWrap: 'wrap', alignItems: 'center' }}>
        
        {/* Tab 1: Consultation Hub */}
        <button
          onClick={() => setActiveTab('meetings')}
          style={{
            background: activeTab === 'meetings' ? 'linear-gradient(135deg, #0284c7, #2563eb)' : '#0f172a',
            color: activeTab === 'meetings' ? '#fff' : '#94a3b8',
            border: activeTab === 'meetings' ? '1px solid #38bdf8' : '1px solid #334155',
            padding: '0.65rem 1.35rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: activeTab === 'meetings' ? '0 0 15px rgba(2, 132, 199, 0.35)' : 'none',
            transition: 'all 0.2s ease'
          }}>
          <Calendar size={18} />
          <span>{isDoctor ? "Patient Consultation Hub" : "Find Doctors & Consultations"}</span>
        </button>

        {/* Tab 2: Live Chat Dashboard */}
        <button
          onClick={() => setActiveTab('chat')}
          style={{
            background: activeTab === 'chat' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#0f172a',
            color: activeTab === 'chat' ? '#fff' : '#94a3b8',
            border: activeTab === 'chat' ? '1px solid #a855f7' : '1px solid #334155',
            padding: '0.65rem 1.35rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: activeTab === 'chat' ? '0 0 15px rgba(99, 102, 241, 0.35)' : 'none',
            transition: 'all 0.2s ease'
          }}>
          <MessageSquare size={18} />
          <span>Live Chat Dashboard</span>
        </button>

        {/* Quick Instant Meeting Code Joiner (MEETING CODE STRICTLY MANDATORY) */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Enter Meeting Code (Mandatory)..." 
            id="quickJoinInput"
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#fff', fontSize: '0.85rem', width: '220px' }}
          />
          <button 
            onClick={() => {
              const el = document.getElementById('quickJoinInput');
              const code = el ? el.value.trim() : '';
              if (!code) {
                alert("⚠️ Meeting Code is mandatory. You cannot join a video call without a valid Meeting Code.");
                return;
              }
              startCall(code);
            }}
            style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Video size={15} /> Join Call
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CONSULTATION HUB (DIRECTORY & APPOINTMENTS) */}
      {/* ========================================================================= */}
      {activeTab === 'meetings' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem' }}>
          
          {/* Main Column */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isDoctor ? (
                    <>
                      <Users size={24} color="#34d399" /> 
                      Patient Consultation Queue & Registry
                    </>
                  ) : isAdmin ? (
                    <>
                      <Shield size={24} color="#fbbf24" />
                      Hospital Clinical & Patient Registry
                    </>
                  ) : (
                    <>
                      <Stethoscope size={24} color="#38bdf8" /> 
                      Certified Doctors & Specialist Network
                    </>
                  )}
                </h2>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.825rem', color: '#94a3b8' }}>
                  {isDoctor 
                    ? "Chat with registered patients, schedule consultation meetings, and connect directly on live video."
                    : isAdmin 
                      ? "Oversee registered certified doctors and registered patient records."
                      : "Connect with certified doctors through direct chat to discuss symptoms and get scheduled for video consultation."}
                </p>
              </div>

              {/* Admin Toggle */}
              {isAdmin && (
                <div style={{ display: 'flex', gap: '0.5rem', background: '#0f172a', padding: '0.25rem', borderRadius: '8px', border: '1px solid #334155' }}>
                  <button
                    onClick={() => setAdminViewMode('doctors')}
                    style={{
                      background: adminViewMode === 'doctors' ? '#0284c7' : 'transparent',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}>
                    👨‍⚕️ Doctors ({allDoctors.length})
                  </button>
                  <button
                    onClick={() => setAdminViewMode('patients')}
                    style={{
                      background: adminViewMode === 'patients' ? '#10b981' : 'transparent',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}>
                    👥 Patients ({allPatients.length})
                  </button>
                </div>
              )}

              {/* Search Bar */}
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={16} style={{ position: 'absolute', top: '10px', left: '10px', color: '#64748b' }} />
                <input 
                  type="text"
                  placeholder={isDoctor ? "Search patient by name or concern..." : "Search doctor, specialty, hospital..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* ------------------------------------------------------------------- */}
            {/* VIEW A: FOR DOCTORS -> PATIENTS QUEUE */}
            {/* ------------------------------------------------------------------- */}
            {(isDoctor || (isAdmin && adminViewMode === 'patients')) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                {filteredPatients.length === 0 ? (
                  <div style={{
                    gridColumn: '1 / -1',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px dashed #334155',
                    borderRadius: '12px',
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    color: '#94a3b8'
                  }}>
                    <Users size={48} color="#64748b" style={{ margin: '0 auto 1rem' }} />
                    <h3 style={{ color: '#f8fafc', margin: '0 0 0.5rem', fontSize: '1.2rem' }}>No Patients in Queue</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8', maxWidth: '440px', marginLeft: 'auto', marginRight: 'auto' }}>
                      When patients register or request consultations on Sanjeevani AI, their dynamic records will appear here live.
                    </p>
                  </div>
                ) : (
                  filteredPatients.map((patient, idx) => {
                    // Check if there is an existing scheduled appointment with this patient
                    const existingApt = appointments.find(a => (a.patientEmail || '').toLowerCase() === patient.email?.toLowerCase());

                    return (
                      <div 
                        key={patient.id || patient.email || idx}
                        style={{
                          background: 'rgba(15, 23, 42, 0.85)',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                          padding: '1.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                          position: 'relative'
                        }}>
                        
                        {/* Top Status */}
                        <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#34d399' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }}></span>
                          Ready for Consult
                        </div>

                        <div>
                          {/* Patient Header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'linear-gradient(135deg, #059669, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', color: '#fff' }}>
                              {(patient.name || 'P').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc' }}>{patient.name}</h3>
                              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{patient.email}</div>
                            </div>
                          </div>

                          {/* Health Concern */}
                          <div style={{ background: '#1e293b', padding: '0.65rem 0.85rem', borderRadius: '8px', marginBottom: '0.85rem', borderLeft: '3px solid #38bdf8' }}>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>
                              Primary Health Concern / Symptom:
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#f1f5f9', fontWeight: '600', marginTop: '2px' }}>
                              {patient.concern || "General Clinical Consultation"}
                            </div>
                          </div>

                          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.5', marginBottom: '0.75rem' }}>
                            <div><strong>Status:</strong> Registered Patient</div>
                            <div><strong>Contact:</strong> {patient.phone || patient.email}</div>
                            {existingApt && (
                              <div style={{ color: '#38bdf8', marginTop: '4px' }}>
                                <strong>Active Meeting Code:</strong> {existingApt.meetingCode}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Doctor Action Buttons */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr 1.15fr', gap: '0.4rem', borderTop: '1px solid #1e293b', paddingTop: '0.75rem' }}>
                          <button
                            onClick={() => {
                              setActiveChatPeer({
                                name: patient.name,
                                email: patient.email,
                                role: 'patient',
                                specialization: `Patient: ${patient.concern || 'Consultation'}`
                              });
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
                              setSelectedBookingTarget(patient);
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
                            <Calendar size={13} /> Fix Meeting
                          </button>

                          <button
                            onClick={() => {
                              if (existingApt && existingApt.meetingCode) {
                                startCall(existingApt.meetingCode, patient);
                              } else {
                                alert("⚠️ Please fix a meeting with this patient first using 'Fix Meeting' to generate a valid Meeting Code.");
                                setSelectedBookingTarget(patient);
                                setIsBookModalOpen(true);
                              }
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
                    );
                  })
                )}
              </div>
            ) : (
              /* ------------------------------------------------------------------- */
              /* VIEW B: FOR PATIENTS -> DOCTORS DIRECTORY (CHAT ONLY) */
              /* ------------------------------------------------------------------- */
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
                      When certified doctors sign up on Sanjeevani AI, their profiles, qualifications, and consultation hours will appear here live.
                    </p>
                  </div>
                ) : (
                  filteredDoctors.map((doc, idx) => (
                    <div 
                      key={doc.id || doc.recordId || idx}
                      style={{
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid #334155',
                        borderRadius: '12px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                        position: 'relative'
                      }}>
                      
                      {/* Status */}
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
                              if (window.confirm(`Admin: Delete profile for ${doc.name}?`)) {
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

                      {/* Patient Action: Chat with Doctor directly */}
                      <div style={{ borderTop: '1px solid #1e293b', paddingTop: '0.75rem' }}>
                        <button
                          onClick={() => {
                            setActiveChatPeer(doc);
                            setActiveTab('chat');
                          }}
                          style={{
                            width: '100%',
                            background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.65rem',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)'
                          }}>
                          <MessageSquare size={16} /> Chat with Doctor
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Side Column: Scheduled Consultations */}
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem', height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} color="#38bdf8" /> 
              {isDoctor ? "My Scheduled Patients" : isAdmin ? "All Hospital Meetings" : "My Booked Consultations"}
            </h3>

            {appointments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                <Calendar size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No upcoming meetings booked yet.</p>
                <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.35rem' }}>
                  {isDoctor 
                    ? "Chat with your patients and click 'Fix Meeting' to schedule consultation slots."
                    : "Chat with a doctor to discuss your condition and get a video consultation slot scheduled."}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '550px', overflowY: 'auto' }}>
                {appointments.map((apt, idx) => {
                  const partnerName = isDoctor ? apt.patientName : apt.doctorName;
                  const partnerEmail = isDoctor ? apt.patientEmail : apt.doctorEmail;

                  return (
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
                          {partnerName}
                        </strong>
                        <span style={{ fontSize: '0.7rem', background: '#0284c7', color: '#fff', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                          {apt.urgency || "Standard"}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                        <div>📅 {apt.date} • ⏰ {apt.time}</div>
                        <div style={{ marginTop: '0.2rem' }}>💬 {apt.reason}</div>
                        <div style={{ marginTop: '0.2rem', fontFamily: 'monospace', color: '#38bdf8', fontWeight: 'bold' }}>Code: {apt.meetingCode}</div>
                      </div>

                      {/* Action buttons: Join Video Call & Delete/Cancel Meeting */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <button
                          onClick={() => startCall(apt.meetingCode, { name: partnerName, email: partnerEmail })}
                          style={{
                            flex: 1,
                            background: '#10b981',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '0.5rem',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.35rem',
                            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                          }}>
                          <Video size={14} /> Join Video Call
                        </button>

                        {(isDoctor || isAdmin) && (
                          <button
                            title="Cancel and delete this consultation meeting"
                            onClick={() => handleDeleteMeeting(apt)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #ef4444',
                              color: '#f87171',
                              borderRadius: '6px',
                              padding: '0.5rem 0.65rem',
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.25rem'
                            }}>
                            <Trash2 size={14} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LIVE CHAT DASHBOARD (TOGGLE OPEN/CLOSE, SMOOTH SCROLL, MULTIMEDIA) */}
      {/* ========================================================================= */}
      {activeTab === 'chat' && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: activeChatPeer ? '320px minmax(0, 1fr)' : '1fr', 
          gap: '1rem', 
          height: 'calc(100vh - 190px)', 
          background: '#0f172a', 
          borderRadius: '12px', 
          border: '1px solid #334155', 
          overflow: 'hidden' 
        }}>
          
          {/* Left Contacts List (Names are NEVER hidden, clicking toggles open/close) */}
          <div style={{ borderRight: activeChatPeer ? '1px solid #1e293b' : 'none', display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b', background: '#090d16', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#f8fafc' }}>
                  {isDoctor ? "Patient Consultations" : isAdmin ? "Hospital Directory Contacts" : "Certified Doctors"}
                </h3>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                  Click a contact to open or close chat
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {(() => {
                const contacts = isDoctor 
                  ? allPatients 
                  : (isAdmin ? [...allDoctors, ...allPatients] : allDoctors);

                if (contacts.length === 0) {
                  return (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                      No active contacts found.
                    </div>
                  );
                }

                return contacts.map((peer, idx) => {
                  const peerName = peer.name || peer.patientName || peer.doctorName || 'Contact';
                  const peerSub = peer.specialization || peer.concern || (peer.role === 'doctor' ? 'Certified Doctor' : 'Registered Patient');
                  const peerEmail = (peer.email || peer.patientEmail || peer.doctorEmail || '').toLowerCase();
                  const isSelected = activeChatPeer && (activeChatPeer.email || activeChatPeer.patientEmail || activeChatPeer.doctorEmail || '').toLowerCase() === peerEmail;

                  return (
                    <div
                      key={idx}
                      onClick={() => handleContactClick(peer)}
                      title={isSelected ? "Click to close chat" : "Click to open chat"}
                      style={{
                        padding: '0.85rem',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(56, 189, 248, 0.15)' : '#1e293b',
                        border: isSelected ? '1px solid #38bdf8' : '1px solid transparent',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}>
                      {/* Avatar */}
                      <div style={{ 
                        width: '42px', 
                        height: '42px', 
                        borderRadius: '50%', 
                        background: isSelected ? 'linear-gradient(135deg, #0284c7, #38bdf8)' : '#0f172a', 
                        border: '1px solid #334155', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontWeight: 'bold', 
                        color: '#fff',
                        flexShrink: 0
                      }}>
                        {peerName.replace('Dr. ', '').charAt(0).toUpperCase()}
                      </div>

                      {/* Name & Role (Wrap properly so name never gets cut off) */}
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ 
                          fontWeight: '700', 
                          fontSize: '0.92rem', 
                          color: isSelected ? '#38bdf8' : '#f8fafc',
                          wordBreak: 'break-word',
                          lineHeight: '1.3'
                        }}>
                          {peerName}
                        </div>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: '#94a3b8', 
                          marginTop: '2px',
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap' 
                        }}>
                          {peerSub}
                        </div>
                      </div>

                      {/* Active Status Badge */}
                      {isSelected ? (
                        <span style={{ fontSize: '0.65rem', background: '#38bdf8', color: '#0f172a', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>
                          OPEN
                        </span>
                      ) : (
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Right Active Conversation Area (Only rendered if contact is selected) */}
          {activeChatPeer ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#020617', overflow: 'hidden' }}>
              
              {/* Chat Top Bar */}
              <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #1e293b', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff' }}>
                    {(activeChatPeer.name || "U").replace('Dr. ', '').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#f8fafc' }}>
                      {activeChatPeer.name}
                    </h4>
                    <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                      {activeChatPeer.specialization || activeChatPeer.concern || "Active Consultation Channel"}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {/* Report Incident to Admin Button */}
                  <button
                    onClick={() => handleOpenReport(activeChatPeer, 'Chat Consultation Dialogue')}
                    disabled={isCapturingScreenshot}
                    title="Report this user to Developer Admin with full screenshot evidence"
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid #ef4444',
                      color: '#f87171',
                      borderRadius: '8px',
                      padding: '0.45rem 0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 6px rgba(239, 68, 68, 0.2)'
                    }}>
                    <Flag size={14} color="#f87171" />
                    {isCapturingScreenshot ? 'Capturing...' : 'Report'}
                  </button>

                  {/* ONLY DOCTOR SEES "FIX MEETING" */}
                  {isDoctor && (
                    <button
                      onClick={() => {
                        setSelectedBookingTarget(activeChatPeer);
                        setIsBookModalOpen(true);
                      }}
                      style={{
                        background: '#0284c7',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.45rem 0.85rem',
                        fontSize: '0.825rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        boxShadow: '0 2px 6px rgba(2, 132, 199, 0.4)'
                      }}>
                      <Calendar size={14} /> Fix Meeting
                    </button>
                  )}

                  {/* Close Chat Box Button */}
                  <button
                    onClick={() => setActiveChatPeer(null)}
                    title="Close Chat (View Contacts)"
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid #334155',
                      color: '#cbd5e1',
                      borderRadius: '8px',
                      padding: '0.45rem 0.65rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.8rem',
                      fontWeight: 'bold'
                    }}>
                    <X size={15} /> Close
                  </button>
                </div>
              </div>

              {/* Messages Stream Container (Smooth scrolling enabled, minHeight: 0) */}
              <div 
                ref={chatContainerRef}
                onScroll={handleChatScroll}
                style={{ 
                  flex: 1, 
                  minHeight: 0,
                  padding: '1.25rem', 
                  overflowY: 'auto', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.85rem',
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#475569 #0f172a'
                }}>
                {currentChatMessages.length === 0 ? (
                  <div style={{ textAlign: 'center', margin: 'auto', color: '#64748b' }}>
                    <MessageSquare size={42} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Start a secure clinical consultation dialogue with {activeChatPeer.name}.</p>
                  </div>
                ) : (
                  currentChatMessages.map((msg, idx) => {
                    const isMe = msg.senderEmail?.toLowerCase() === userEmail;
                    return (
                      <div 
                        key={idx}
                        style={{
                          alignSelf: isMe ? 'flex-end' : 'flex-start',
                          maxWidth: '75%',
                          background: isMe ? 'linear-gradient(135deg, #0284c7, #0369a1)' : '#1e293b',
                          color: '#fff',
                          borderRadius: '12px',
                          padding: '0.75rem 1rem',
                          border: isMe ? 'none' : '1px solid #334155',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.35rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isMe ? '#e0f2fe' : '#38bdf8' }}>
                            {isMe ? "You" : msg.senderName}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: isMe ? '#bae6fd' : '#94a3b8' }}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Text Message Content */}
                        {msg.message && (
                          <div style={{ fontSize: '0.88rem', lineHeight: '1.45', wordBreak: 'break-word' }}>
                            {msg.message}
                          </div>
                        )}

                        {/* Attached Multimedia (Photo, Video, Audio, Document) */}
                        {msg.attachment && (
                          <div style={{ marginTop: msg.message ? '0.65rem' : '0' }}>
                            {/* Image Attachment (Tapping opens High-Res Fullscreen Lightbox) */}
                            {msg.attachment.type === 'image' && (
                              <div 
                                onClick={() => setLightboxImage(msg.attachment.url)}
                                style={{ position: 'relative', cursor: 'pointer', display: 'inline-block' }}
                                title="Click to open full-screen high-res preview">
                                <img 
                                  src={msg.attachment.url} 
                                  alt={msg.attachment.name || "Photo attachment"}
                                  style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '8px', display: 'block', border: '1px solid rgba(255,255,255,0.2)' }}
                                />
                                <div style={{
                                  position: 'absolute',
                                  bottom: '6px',
                                  right: '6px',
                                  background: 'rgba(0,0,0,0.7)',
                                  color: '#fff',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                  fontSize: '0.7rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}>
                                  <ZoomIn size={12} /> Fullscreen
                                </div>
                              </div>
                            )}

                            {/* Video Attachment (Direct or Reconstructed Chunks) */}
                            {msg.attachment.type === 'video' && (
                              msg.attachment.isChunked ? (
                                <ChunkedVideoViewer attachment={msg.attachment} />
                              ) : (
                                <video 
                                  src={msg.attachment.url} 
                                  controls 
                                  playsInline 
                                  style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '8px', display: 'block', background: '#000' }}
                                />
                              )
                            )}

                            {/* WhatsApp Voice Note Audio Attachment */}
                            {msg.attachment.type === 'audio' && (
                              <div style={{ background: 'rgba(0,0,0,0.35)', padding: '0.65rem 0.85rem', borderRadius: '10px', minWidth: '250px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ fontSize: '0.72rem', color: '#7dd3fc', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold' }}>
                                  <Mic size={13} color="#38bdf8" /> {msg.attachment.name || "Voice Note"}
                                </div>
                                <audio src={msg.attachment.url} controls style={{ width: '100%', height: '36px' }} />
                              </div>
                            )}

                            {/* Document / File Attachment */}
                            {msg.attachment.type === 'file' && (
                              <a 
                                href={msg.attachment.url} 
                                download={msg.attachment.name || "clinical_file"} 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '0.5rem', 
                                  background: 'rgba(255,255,255,0.1)', 
                                  padding: '0.6rem 0.85rem', 
                                  borderRadius: '8px', 
                                  color: '#38bdf8', 
                                  textDecoration: 'none',
                                  fontSize: '0.825rem',
                                  border: '1px solid rgba(56, 189, 248, 0.3)'
                                }}>
                                <FileText size={18} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {msg.attachment.name} ({msg.attachment.size})
                                </span>
                                <Download size={15} />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Emoji Picker Popup Bar */}
              {isEmojiPickerOpen && (
                <div style={{ background: '#0f172a', borderTop: '1px solid #334155', padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', zIndex: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold', marginRight: '0.5rem' }}>Emotes:</span>
                  {EMOTES_LIST.map((emoji, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setChatInput(prev => prev + emoji)}
                      style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', fontSize: '1.2rem', padding: '0.3rem 0.5rem', cursor: 'pointer', transition: 'transform 0.1s' }}>
                      {emoji}
                    </button>
                  ))}
                  <button 
                    type="button"
                    onClick={() => setIsEmojiPickerOpen(false)}
                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Attachment Preview Bar (If user selected a file to send) */}
              {selectedAttachment && (
                <div style={{ background: '#0f172a', borderTop: '1px solid #38bdf8', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {selectedAttachment.type === 'image' ? <ImageIcon size={18} color="#38bdf8" /> : selectedAttachment.type === 'video' ? <Film size={18} color="#a855f7" /> : selectedAttachment.type === 'audio' ? <Music size={18} color="#10b981" /> : <FileText size={18} color="#f59e0b" />}
                    <span style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: '600' }}>
                      Attached {selectedAttachment.type.toUpperCase()}: {selectedAttachment.name} ({selectedAttachment.size})
                    </span>
                  </div>
                  <button 
                    onClick={() => setSelectedAttachment(null)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 6px' }}>
                    <X size={18} />
                  </button>
                </div>
              )}

              {/* WhatsApp Live Voice Note Recording Bar OR Normal Input Form */}
              {isRecordingAudio ? (
                <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #ef4444', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }}></span>
                    <span style={{ color: '#f87171', fontWeight: 'bold', fontSize: '0.9rem' }}>
                      Recording Voice Note: {formatTimer(recordingDuration)}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>(Speak into microphone)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button 
                      type="button" 
                      onClick={() => stopAudioRecording(false)}
                      title="Discard Recording"
                      style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#f87171', borderRadius: '8px', padding: '0.5rem 0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      <Trash2 size={16} /> Discard
                    </button>
                    <button 
                      type="button" 
                      onClick={() => stopAudioRecording(true)}
                      title="Send Voice Note"
                      style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.5rem 1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 'bold', boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)' }}>
                      <Send size={16} /> Send Voice Note
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendMessage} style={{ padding: '0.85rem 1rem', borderTop: '1px solid #1e293b', background: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  
                  {/* Photo Upload Button */}
                  <button 
                    type="button" 
                    title="Send Photo"
                    onClick={() => imageInputRef.current?.click()}
                    style={{ background: '#1e293b', color: '#38bdf8', border: '1px solid #334155', borderRadius: '8px', padding: '0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon size={18} />
                  </button>

                  {/* Video Upload Button */}
                  <button 
                    type="button" 
                    title="Send Video Clip (Supports up to 25MB)"
                    onClick={() => videoInputRef.current?.click()}
                    style={{ background: '#1e293b', color: '#a855f7', border: '1px solid #334155', borderRadius: '8px', padding: '0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Film size={18} />
                  </button>

                  {/* WhatsApp Voice Note Record Button */}
                  <button 
                    type="button" 
                    title="Record Live Voice Note (WhatsApp style)"
                    onClick={startAudioRecording}
                    style={{ background: '#1e293b', color: '#34d399', border: '1px solid #334155', borderRadius: '8px', padding: '0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                    <Mic size={18} />
                  </button>

                  {/* Document / File Upload Button */}
                  <button 
                    type="button" 
                    title="Send Document or Medical File"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ background: '#1e293b', color: '#f59e0b', border: '1px solid #334155', borderRadius: '8px', padding: '0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Paperclip size={18} />
                  </button>

                  {/* Emoji / Emote Picker Toggle */}
                  <button 
                    type="button" 
                    title="Insert Emotes"
                    onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                    style={{ background: isEmojiPickerOpen ? '#0284c7' : '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '8px', padding: '0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Smile size={18} />
                  </button>

                  {/* Text Input */}
                  <input 
                    type="text"
                    placeholder="Type message, prescription notes, symptoms..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    style={{ flex: 1, padding: '0.7rem 1rem', background: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
                  />

                  {/* Send Button */}
                  <button 
                    type="submit"
                    disabled={isUploading || (!chatInput.trim() && !selectedAttachment)}
                    style={{ 
                      background: (chatInput.trim() || selectedAttachment) ? '#38bdf8' : '#334155', 
                      color: '#0f172a', 
                      border: 'none', 
                      borderRadius: '8px', 
                      padding: '0.7rem 1.25rem', 
                      fontWeight: 'bold', 
                      cursor: (chatInput.trim() || selectedAttachment) ? 'pointer' : 'default', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.4rem',
                      transition: 'all 0.2s'
                    }}>
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    <span>{isUploading ? 'Sending...' : 'Send'}</span>
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b', padding: '2rem' }}>
              <MessageSquare size={52} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <h3 style={{ color: '#cbd5e1', margin: '0 0 0.5rem' }}>No Conversation Selected</h3>
              <p style={{ fontSize: '0.88rem', margin: 0 }}>Click on any patient or doctor from the contacts list to open their consultation chat.</p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FIX MEETING (DOCTOR ONLY) */}
      {/* ========================================================================= */}
      {isBookModalOpen && selectedBookingTarget && (
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
              Scheduling consultation with Patient <strong>{selectedBookingTarget.name}</strong> ({selectedBookingTarget.email}).
            </p>

            <form onSubmit={handleDoctorConfirmAppointment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    <option>08:00 PM</option>
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
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Chief Complaints / Clinical Notes</label>
                <textarea 
                  placeholder="Describe consultation agenda, symptoms discussed in chat, or clinical instructions..."
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

      {/* Incident Report & Lightbox Modals */}
      {renderReportModal()}
      {renderLightboxModal()}

    </div>
  );
}
