import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

const AuthContext = createContext();

export const useCustomAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('sanjeevani_token') || null);
  
  // Validate token with backend
  const userSession = useQuery(api.auth.validateSession, { token: token || undefined });
  const logoutMutation = useMutation(api.auth.logout);
  
  const [isLoaded, setIsLoaded] = useState(false);
  
  useEffect(() => {
    if (token) {
      localStorage.setItem('sanjeevani_token', token);
    } else {
      localStorage.removeItem('sanjeevani_token');
    }
  }, [token]);

  useEffect(() => {
    // Wait until Convex finishes querying
    if (userSession !== undefined) {
      setIsLoaded(true);
      // If token is invalid according to DB, clear it
      if (token && userSession === null) {
        setToken(null);
      }
    }
  }, [userSession, token]);

  const login = (newToken) => {
    setToken(newToken);
  };

  const logout = async () => {
    if (token) {
      try {
        await logoutMutation({ token });
      } catch(e) {
        console.error(e);
      }
    }
    setToken(null);
  };

  const value = {
    isAuthenticated: !!userSession,
    user: userSession,
    token,
    isLoaded,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
