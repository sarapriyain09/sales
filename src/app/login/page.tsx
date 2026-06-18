'use client';
import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activation, setActivation] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', company: '', phone: '' });
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');
  const [showSignup, setShowSignup] = useState(false);
  const showPostRegistrationPanel = isDemoMode && Boolean(registerSuccess);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setActivation(params.get('activated'));

    const host = window.location.hostname.toLowerCase();
    const isDemoHost = host === 'democrm.splendidtechnology.co.uk';
    const isDemoEnv = process.env.NEXT_PUBLIC_DEMO_MODE === '1' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
    setIsDemoMode(isDemoHost || isDemoEnv);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.ok) {
      router.push('/sales');
      router.refresh();
    } else {
      setError('Invalid email or password.');
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegisterError('');
    setRegisterSuccess('');
    setRegistering(true);
    const res = await fetch('/api/demo/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerForm),
    });
    const data = await res.json().catch(() => ({}));
    setRegistering(false);

    if (!res.ok) {
      if (typeof data?.email === 'string') {
        setEmail(data.email);
      } else if (registerForm.email.trim()) {
        setEmail(registerForm.email.trim().toLowerCase());
      }
      setRegisterError(data.error ?? 'Registration failed.');
      return;
    }

    setEmail(registerForm.email.trim().toLowerCase());
    setPassword('');
    setRegisterSuccess('Activation email sent. Please check your inbox, click the activation link, and then sign in.');
  }

  function handleRegisterAgain() {
    setRegisterSuccess('');
    setRegisterError('');
    setRegisterForm({ name: '', email: '', password: '', company: '', phone: '' });
    setShowSignup(true);
  }

  function handleShowLogin() {
    setRegisterSuccess('');
    setRegisterError('');
    setShowSignup(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white font-bold text-xl mb-4">ST</div>
          <h1 className="text-2xl font-bold text-slate-900">Splendid Sales</h1>
          <p className="text-sm text-slate-600 mt-1">{isDemoMode ? 'Demo Access' : 'Splendid Technology - Sales System'}</p>
        </div>

        {showPostRegistrationPanel && (
          <div className="bg-white border border-emerald-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <h2 className="text-base font-semibold text-emerald-800">Activation Email Sent</h2>
            <p className="text-sm text-slate-700">{registerSuccess}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleRegisterAgain}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg text-sm transition-colors"
              >
                Register Again
              </button>
              <button
                type="button"
                onClick={handleShowLogin}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-sm transition-colors"
              >
                Login
              </button>
            </div>
          </div>
        )}

        {isDemoMode && showSignup && !showPostRegistrationPanel && (
          <form onSubmit={handleRegister} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm mb-4">
            <h2 className="text-sm font-semibold text-slate-800">New visitor registration</h2>
            <p className="text-xs text-slate-600">Register once so we can track demo usage and confirm your email.</p>
            {registerError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{registerError}</div>}
            <input
              type="text"
              placeholder="Full name"
              value={registerForm.name}
              onChange={e => setRegisterForm(p => ({ ...p, name: e.target.value }))}
              required
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="Email"
              value={registerForm.email}
              onChange={e => setRegisterForm(p => ({ ...p, email: e.target.value }))}
              required
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="password"
              placeholder="Create password (min 8 chars)"
              value={registerForm.password}
              onChange={e => setRegisterForm(p => ({ ...p, password: e.target.value }))}
              required
              minLength={8}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Company (optional)"
              value={registerForm.company}
              onChange={e => setRegisterForm(p => ({ ...p, company: e.target.value }))}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Phone (optional)"
              value={registerForm.phone}
              onChange={e => setRegisterForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleShowLogin}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg text-sm transition-colors"
              >
                Back to Login
              </button>
              <button
                type="submit"
                disabled={registering}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-semibold rounded-lg text-sm transition-colors"
              >
                {registering ? 'Registering…' : 'Register for Demo'}
              </button>
            </div>
          </form>
        )}

        {!showSignup && !showPostRegistrationPanel && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-8 space-y-5 shadow-sm">
          {isDemoMode && activation === '1' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
              Email verified. You can now sign in.
            </div>
          )}
          {isDemoMode && activation === 'expired' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
              Activation link expired. Register again to receive a new link.
            </div>
          )}
          {isDemoMode && activation === 'invalid' && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              Activation link is invalid. Register again to receive a valid link.
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="block text-xs text-slate-600 mb-1.5 font-medium">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@splendidtechnology.co.uk"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1.5 font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <div className="mt-2 text-right">
              <a
                href="mailto:info@splendidtechnology.co.uk?subject=CRM%20Password%20Reset"
                className="text-xs text-blue-600 hover:text-blue-500 underline underline-offset-2"
              >
                Forgot password?
              </a>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {isDemoMode && (
            <button
              type="button"
              onClick={() => {
                setRegisterError('');
                setRegisterSuccess('');
                setShowSignup(true);
              }}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm transition-colors"
            >
              Sign up
            </button>
          )}
        </form>
        )}

        <p className="text-center text-xs text-slate-500 mt-4">
          Internal use only · Splendid Technology
        </p>
      </div>
    </div>
  );
}
