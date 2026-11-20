import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useCustomAuth } from '../../context/AuthContext';
import { 
  Mail, Lock, CheckCircle, XCircle, User, Activity, 
  Stethoscope, Building, Award, Clock, DollarSign, Phone, FileText
} from 'lucide-react';
import '../../styles/App.css'; // inherit sci-fi styling

export default function CustomAuth() {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState('patient'); // 'patient' or 'doctor'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  // Doctor-specific profile fields
  const [specialization, setSpecialization] = useState('');
  const [qualification, setQualification] = useState('');
  const [experience, setExperience] = useState('');
  const [hospital, setHospital] = useState('');
  const [availableHours, setAvailableHours] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [needsGooglePassword, setNeedsGooglePassword] = useState(false);
  
  const { login } = useCustomAuth();
  const signUpMutation = useMutation(api.auth.signUp);
  const loginMutation = useMutation(api.auth.login);
  const saveRecordMutation = useMutation(api.records.saveRecord);

  // Password validation rules
  const hasMinLength = password.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumberOrSpecial = /[^a-zA-Z]/.test(password);
  const isValidPassword = hasMinLength && hasLetter && hasNumberOrSpecial;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    try {
      const cleanEmail = email.trim().toLowerCase();

      if (isLogin) {
        const res = await loginMutation({ email: cleanEmail, password });
        login(res.token);
      } else {
        if (!isValidPassword) {
          setError("Password must be at least 6 characters, contain letters and a number/symbol.");
          return;
        }

        const displayName = role === 'doctor' 
          ? (!name.trim().startsWith('Dr.') ? `Dr. ${name.trim()}` : name.trim()) 
          : name.trim();

        // 1. SignUp with exact compatible parameters including role & clinical profile
        const res = await signUpMutation({
          email: cleanEmail,
          password,
          name: displayName,
          role: role,
          specialization: role === 'doctor' ? (specialization.trim() || 'General Physician & Consultant') : undefined,
          qualification: role === 'doctor' ? (qualification.trim() || 'MBBS, MD') : undefined,
          experience: role === 'doctor' ? (experience.trim() || '5+ Years') : undefined,
          hospital: role === 'doctor' ? (hospital.trim() || 'Indirapuram Hospital / Tele-Health') : undefined,
          availableHours: role === 'doctor' ? (availableHours.trim() || 'Mon - Sat: 10:00 AM - 08:00 PM') : undefined,
          consultationFee: role === 'doctor' ? (consultationFee.trim() || '₹500 / session') : undefined,
          bio: role === 'doctor' ? (bio.trim() || 'Verified medical specialist on Sanjeevani AI Clinical Network.') : undefined,
          phone: phone.trim() || undefined,
        });

        // 2. If Doctor, immediately store full certified profile in Convex database
        if (role === 'doctor') {
          await saveRecordMutation({
            patientId: cleanEmail,
            type: 'doctor_profile',
            data: {
              name: displayName,
              email: cleanEmail,
              role: 'doctor',
              specialization: specialization.trim() || 'General Physician & Consultant',
              qualification: qualification.trim() || 'MBBS, MD',
              experience: experience.trim() ? (experience.trim().includes('Year') ? experience.trim() : `${experience.trim()} Years`) : '5+ Years',
              hospital: hospital.trim() || 'Indirapuram Hospital / Tele-Health',
              availableHours: availableHours.trim() || 'Mon - Sat: 10:00 AM - 08:00 PM',
              fee: consultationFee.trim() ? (consultationFee.trim().startsWith('₹') ? consultationFee.trim() : `₹${consultationFee.trim()}`) : '₹500 / session',
              phone: phone.trim() || '',
              bio: bio.trim() || 'Verified medical specialist on Sanjeevani AI Clinical Network.',
              rating: '5.0 ★',
              isOnline: true,
            }
          });
        } else {
          await saveRecordMutation({
            patientId: cleanEmail,
            type: 'patient_profile',
            data: {
              name: displayName,
              email: cleanEmail,
              role: 'patient',
              concern: 'General Clinical Consultation',
              registeredAt: Date.now()
            }
          });
        }

        // 3. Register access request with status 'pending' (STRICT ADMIN APPROVAL GATEKEEPER)
        // Admin (Satyam Tyagi) must explicitly approve from Dev Dashboard before user can enter.
        await saveRecordMutation({
          patientId: cleanEmail,
          type: 'access_request',
          data: {
            email: cleanEmail,
            name: displayName,
            role: role,
            requestedAt: Date.now(),
            status: 'pending'
          }
        });

        // 4. Auto-login into pending state or prompt to sign in
        if (res && res.token) {
          login(res.token);
        } else {
          setIsLogin(true);
          setPassword('');
          setSuccessMsg(
            role === 'doctor' 
              ? "Doctor profile registered! Waiting for Developer Admin approval before access is granted." 
              : "Patient account registered! Waiting for Developer Admin approval before access is granted."
          );
        }
      }
    } catch (err) {
      const errMsg = err.data || err.message || "An error occurred during authentication";
      setError(errMsg);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      justifyContent: 'center', 
      alignItems: 'center', 
      background: 'radial-gradient(circle at top, #0f172a 0%, #020617 100%)', 
      color: '#fff', 
      fontFamily: 'Inter, sans-serif',
      padding: '2rem 1rem'
    }}>
      <div style={{ 
        background: 'rgba(30, 41, 59, 0.85)', 
        backdropFilter: 'blur(16px)',
        padding: '2.5rem 2rem', 
        borderRadius: '16px', 
        border: '1px solid rgba(59, 130, 246, 0.3)', 
        width: '100%', 
        maxWidth: role === 'doctor' && !isLogin ? '580px' : '440px', 
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 30px rgba(59, 130, 246, 0.2)',
        maxHeight: '92vh',
        overflowY: 'auto',
        transition: 'all 0.3s ease'
      }}>
        {/* Header Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.2))', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 1rem',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)'
          }}>
            <Activity size={34} color="#38bdf8" />
          </div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.5px' }}>
            SANJEEVANI AI
          </h2>
          <span style={{ fontSize: '0.75rem', letterSpacing: '2px', color: '#38bdf8', fontWeight: 600, textTransform: 'uppercase' }}>
            Clinical & Tele-Consultancy Network
          </span>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.6rem' }}>
            {needsGooglePassword ? "Complete Google Setup" : (isLogin ? "Sign in to access your portal" : "Create your dedicated account")}
          </p>
        </div>

        {/* Role Selector: Doctor vs Patient */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '8px', 
          background: '#090d16', 
          padding: '4px', 
          borderRadius: '10px', 
          marginBottom: '1.5rem',
          border: '1px solid #1e293b'
        }}>
          <button
            type="button"
            onClick={() => { setRole('patient'); setError(''); }}
            style={{
              padding: '0.65rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: role === 'patient' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
              color: role === 'patient' ? '#fff' : '#94a3b8',
              boxShadow: role === 'patient' ? '0 4px 12px rgba(37, 99, 235, 0.35)' : 'none',
              transition: 'all 0.2s'
            }}>
            <User size={16} /> Patient / User
          </button>
          <button
            type="button"
            onClick={() => { setRole('doctor'); setError(''); }}
            style={{
              padding: '0.65rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: role === 'doctor' ? 'linear-gradient(135deg, #059669, #047857)' : 'transparent',
              color: role === 'doctor' ? '#fff' : '#94a3b8',
              boxShadow: role === 'doctor' ? '0 4px 12px rgba(5, 150, 105, 0.35)' : 'none',
              transition: 'all 0.2s'
            }}>
            <Stethoscope size={16} /> Doctor / Specialist
          </button>
        </div>

        {/* Doctor Mode Info Badge */}
        {role === 'doctor' && (
          <div style={{ 
            background: 'rgba(5, 150, 105, 0.15)', 
            border: '1px solid rgba(16, 185, 129, 0.3)', 
            padding: '0.6rem 0.8rem', 
            borderRadius: '8px', 
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.8rem',
            color: '#6ee7b7'
          }}>
            <Stethoscope size={18} color="#34d399" />
            <span>
              {isLogin 
                ? "Doctor Mode: Signing in with clinical specialist credentials."
                : "Doctor Registration: Create your certified ID & Live Tele-Consultancy profile."}
            </span>
          </div>
        )}

        {/* Notifications */}
        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', border: '1px solid #ef4444' }}>
            {error}
          </div>
        )}
        {successMsg && (
          <div style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', border: '1px solid #10b981' }}>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {/* Full Name */}
          {(!isLogin || needsGooglePassword) && (
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: '#64748b' }} />
              <input 
                type="text" 
                placeholder={role === 'doctor' ? "Dr. Full Name (e.g. Dr. Satyam Tyagi)" : "Full Name"} 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
                style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem' }} 
              />
            </div>
          )}

          {/* Doctor-Specific Sign Up Fields */}
          {!isLogin && role === 'doctor' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ position: 'relative' }}>
                  <Award size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: '#64748b' }} />
                  <input 
                    type="text" 
                    placeholder="Specialization (e.g. Cardiology)" 
                    value={specialization} 
                    onChange={(e) => setSpecialization(e.target.value)} 
                    required 
                    style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }} 
                  />
                </div>
                <div style={{ position: 'relative' }}>
                  <FileText size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: '#64748b' }} />
                  <input 
                    type="text" 
                    placeholder="Qualification (MBBS, MD)" 
                    value={qualification} 
                    onChange={(e) => setQualification(e.target.value)} 
                    required 
                    style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ position: 'relative' }}>
                  <Building size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: '#64748b' }} />
                  <input 
                    type="text" 
                    placeholder="Hospital / Clinic Name" 
                    value={hospital} 
                    onChange={(e) => setHospital(e.target.value)} 
                    required 
                    style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }} 
                  />
                </div>
                <div style={{ position: 'relative' }}>
                  <Clock size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: '#64748b' }} />
                  <input 
                    type="text" 
                    placeholder="Experience (e.g. 6+ Years)" 
                    value={experience} 
                    onChange={(e) => setExperience(e.target.value)} 
                    required 
                    style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ position: 'relative' }}>
                  <Clock size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: '#64748b' }} />
                  <input 
                    type="text" 
                    placeholder="Hours (e.g. 10 AM - 5 PM)" 
                    value={availableHours} 
                    onChange={(e) => setAvailableHours(e.target.value)} 
                    style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }} 
                  />
                </div>
                <div style={{ position: 'relative' }}>
                  <DollarSign size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: '#64748b' }} />
                  <input 
                    type="text" 
                    placeholder="Consult Fee (e.g. ₹500 / Free)" 
                    value={consultationFee} 
                    onChange={(e) => setConsultationFee(e.target.value)} 
                    style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }} 
                  />
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <Phone size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: '#64748b' }} />
                <input 
                  type="tel" 
                  placeholder="Doctor Contact Phone / Tele-OPD Line" 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }} 
                />
              </div>
            </>
          )}
          
          {/* Email Address */}
          <div style={{ position: 'relative' }}>
            <Mail size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: '#64748b' }} />
            <input 
              type="email" 
              placeholder={role === 'doctor' ? "Doctor Official Email (e.g. dr.name@hospital.com)" : "Email Address"} 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              disabled={needsGooglePassword} 
              style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.6rem', background: needsGooglePassword ? '#1e293b' : '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem' }} 
            />
          </div>

          {/* Password */}
          <div style={{ position: 'relative' }}>
            <Lock size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: '#64748b' }} />
            <input 
              type="password" 
              placeholder="Password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem' }} 
            />
          </div>

          {/* Password Validation Indicators on Signup */}
          {(!isLogin || needsGooglePassword) && (
            <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '-0.3rem', marginBottom: '0.4rem', paddingLeft: '4px' }}>
              <div style={{ color: hasMinLength ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {hasMinLength ? <CheckCircle size={12} /> : <XCircle size={12} />} At least 6 characters long
              </div>
              <div style={{ color: hasLetter ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {hasLetter ? <CheckCircle size={12} /> : <XCircle size={12} />} Contains at least one letter
              </div>
              <div style={{ color: hasNumberOrSpecial ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {hasNumberOrSpecial ? <CheckCircle size={12} /> : <XCircle size={12} />} Contains a number or symbol
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit" 
            style={{ 
              background: role === 'doctor' 
                ? 'linear-gradient(135deg, #059669, #047857)' 
                : 'linear-gradient(135deg, #2563eb, #1d4ed8)', 
              color: '#fff', 
              padding: '0.85rem', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontWeight: 700, 
              fontSize: '0.95rem',
              letterSpacing: '0.5px',
              transition: 'all 0.2s',
              boxShadow: role === 'doctor' 
                ? '0 4px 15px rgba(5, 150, 105, 0.4)' 
                : '0 4px 15px rgba(37, 99, 235, 0.4)'
            }}>
            {isLogin 
              ? (role === 'doctor' ? "Sign In as Doctor" : "Sign In as Patient") 
              : (role === 'doctor' ? "Register Doctor Clinical Profile" : "Create Patient Account")}
          </button>
        </form>

        {/* Toggle Login / Register */}
        <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#94a3b8', marginTop: '1.5rem', borderTop: '1px solid #1e293b', paddingTop: '1rem' }}>
          {isLogin ? "Don't have an account? " : "Already registered? "}
          <span 
            onClick={() => { setIsLogin(!isLogin); setError(''); setSuccessMsg(''); }} 
            style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>
            {isLogin ? (role === 'doctor' ? "Create Doctor ID" : "Sign up as Patient") : "Sign in here"}
          </span>
        </div>
      </div>
    </div>
  );
}
