import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useCustomAuth } from '../../context/AuthContext';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { Mail, Lock, CheckCircle, XCircle, User, Activity } from 'lucide-react';
import { jwtDecode } from "jwt-decode";
import '../../styles/App.css'; // inherit sci-fi styling

export default function CustomAuth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [needsGooglePassword, setNeedsGooglePassword] = useState(false);
  
  const { login } = useCustomAuth();
  const signUpMutation = useMutation(api.auth.signUp);
  const loginMutation = useMutation(api.auth.login);
  const googleLoginMutation = useMutation(api.auth.googleLogin);

  // Password validation rules (Instagram exact rules)
  const hasMinLength = password.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumberOrSpecial = /[^a-zA-Z]/.test(password);
  
  const isValidPassword = hasMinLength && hasLetter && hasNumberOrSpecial;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (needsGooglePassword) {
        if (!isValidPassword) {
          setError("Please satisfy all password rules.");
          return;
        }
        const res = await signUpMutation({ email, password, name });
        login(res.token);
      } else if (isLogin) {
        const res = await loginMutation({ email, password });
        login(res.token);
      } else {
        if (!isValidPassword) {
          setError("Please satisfy all password rules.");
          return;
        }
        const res = await signUpMutation({ email, password, name });
        login(res.token);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential);
      const res = await googleLoginMutation({ email: decoded.email, name: decoded.name });
      
      if (res.status === "logged_in") {
        login(res.token);
      } else if (res.status === "needs_password") {
        setEmail(decoded.email);
        setName(decoded.name || '');
        setNeedsGooglePassword(true);
        setIsLogin(false);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '2rem', borderRadius: '12px', border: '1px solid #334155', width: '100%', maxWidth: '400px', boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <Activity size={40} color="#3b82f6" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>SANJEEVANI AI</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            {needsGooglePassword ? "Complete Google Setup" : (isLogin ? "Welcome Back" : "Create an Account")}
          </p>
        </div>

        {error && <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem', border: '1px solid #ef4444' }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(!isLogin || needsGooglePassword) && (
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', top: '10px', left: '10px', color: '#64748b' }} />
              <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', outline: 'none' }} />
            </div>
          )}
          
          <div style={{ position: 'relative' }}>
            <Mail size={18} style={{ position: 'absolute', top: '10px', left: '10px', color: '#64748b' }} />
            <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={needsGooglePassword} style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.5rem', background: needsGooglePassword ? '#1e293b' : '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', outline: 'none' }} />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={18} style={{ position: 'absolute', top: '10px', left: '10px', color: '#64748b' }} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', outline: 'none' }} />
          </div>

          {(!isLogin || needsGooglePassword) && (
            <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ color: hasMinLength ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {hasMinLength ? <CheckCircle size={12} /> : <XCircle size={12} />} At least 6 characters long
              </div>
              <div style={{ color: hasLetter ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {hasLetter ? <CheckCircle size={12} /> : <XCircle size={12} />} Contains a letter
              </div>
              <div style={{ color: hasNumberOrSpecial ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {hasNumberOrSpecial ? <CheckCircle size={12} /> : <XCircle size={12} />} Contains a number or symbol
              </div>
            </div>
          )}

          <button type="submit" style={{ background: '#3b82f6', color: '#fff', padding: '0.75rem', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}>
            {needsGooglePassword ? "Complete Signup" : (isLogin ? "Sign In" : "Sign Up")}
          </button>
        </form>

        {!needsGooglePassword && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', background: '#334155' }}></div>
              <span style={{ margin: '0 1rem', color: '#64748b', fontSize: '0.8rem' }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: '#334155' }}></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
               <GoogleOAuthProvider clientId="787459168867-0v2orf3qo56uocsi84iroscoahhuovdm.apps.googleusercontent.com">
                 <GoogleLogin
                   onSuccess={handleGoogleSuccess}
                   onError={() => setError('Google Login Failed')}
                   useOneTap
                 />
               </GoogleOAuthProvider>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.875rem', color: '#94a3b8' }}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <span onClick={() => { setIsLogin(!isLogin); setError(''); }} style={{ color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' }}>
                {isLogin ? "Sign up" : "Sign in"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
