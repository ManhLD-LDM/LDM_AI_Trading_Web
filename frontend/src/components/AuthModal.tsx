import React, { useState } from 'react';
import { useTradingStore } from '@/store/useStore';
import { X, Lock, Mail, Loader2, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // States for input focus effects
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const { login } = useTradingStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      
      let body;
      let headers: HeadersInit = {};
      
      if (isLogin) {
        // OAuth2 expects form data for login
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        body = formData;
        headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      } else {
        // Register expects JSON
        body = JSON.stringify({ email, password });
        headers = { 'Content-Type': 'application/json' };
      }

      const host = window.location.hostname;
      const API_URL = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8000`;
      
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Authentication failed');
      }

      const data = await res.json();
      const token = data.access_token;
      
      // Fetch user profile
      const profileRes = await fetch(`${API_URL}/api/user/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (profileRes.ok) {
        const profile = await profileRes.json();
        login({ email: profile.email, preferences: profile.preferences }, token);
        onClose();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-md transform transition-all animate-in fade-in zoom-in-95 duration-300">
        
        {/* Ambient Glows */}
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/30 to-cyan-500/30 rounded-[2rem] blur-xl opacity-50 pointer-events-none" />
        
        <div className="relative bg-slate-900/90 backdrop-blur-2xl border border-slate-700/50 rounded-2xl shadow-2xl p-8 overflow-hidden group">
          
          {/* Subtle Grid Pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

          {/* Close Button */}
          <button 
            onClick={onClose}
            className="absolute right-4 top-4 text-slate-500 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 p-1.5 rounded-full transition-colors z-20"
          >
            <X size={18} />
          </button>
          
          <div className="relative z-10">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4 text-emerald-400">
                <Lock size={24} />
              </div>
              <h2 className="text-3xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
                {isLogin ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="text-slate-400 text-sm">
                {isLogin ? 'Access your algorithmic trading terminal' : 'Join the elite AI trading platform'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <Mail 
                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-300 ${emailFocused ? 'text-emerald-400' : 'text-slate-500'}`} 
                    size={18} 
                  />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    placeholder="Enter your email" 
                    required
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-inner"
                  />
                </div>
              </div>
              
              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock 
                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-300 ${passwordFocused ? 'text-emerald-400' : 'text-slate-500'}`} 
                    size={18} 
                  />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    placeholder="Enter your password" 
                    required
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 animate-in slide-in-from-top-2 duration-200">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button 
                type="submit" 
                disabled={loading}
                className="group relative w-full bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-950 font-bold rounded-xl py-3.5 transition-all duration-300 hover:from-emerald-400 hover:to-emerald-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 active:scale-[0.98] flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed overflow-hidden mt-2"
              >
                {/* Shine effect */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                
                {loading ? (
                  <Loader2 className="animate-spin relative z-10" size={20} />
                ) : (
                  <span className="flex items-center gap-2 relative z-10">
                    {isLogin ? 'Sign In to Terminal' : 'Create Account'}
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                )}
              </button>
            </form>

            <div className="mt-8 text-center text-sm text-slate-400">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button 
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors focus:outline-none"
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
