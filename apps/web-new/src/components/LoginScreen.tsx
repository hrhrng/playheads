
import { useState } from 'react';
import { useAuthStore } from '../store/authStore';

export const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const signInWithOtp = useAuthStore(state => state.signInWithOtp);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        const { error } = await signInWithOtp(email);

        if (error) {
            setMessage({ type: 'error', text: error.message });
        } else {
            setMessage({ type: 'success', text: 'Check your email for the login link!' });
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center p-6 relative">
            <div className="flex flex-col items-center space-y-12 max-w-sm w-full animate-fade-in">
                <div className="w-40 h-40 rounded-full overflow-hidden grayscale hover:grayscale-0 transition-all duration-700">
                    <img src="/logo.jpg" alt="Playhead" className="w-full h-full object-cover scale-105" />
                </div>

                <div className="text-center space-y-3">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-sans">Playhead</h1>
                    <div className="h-px w-12 bg-slate-200 mx-auto" />
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Sonic Intelligence</p>
                </div>

                <form onSubmit={handleLogin} className="w-full space-y-4 pt-4">
                    {message && (
                        <div className={`p-3 text-sm rounded-md text-center ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                            {message.text}
                        </div>
                    )}

                    <input
                        type="email"
                        placeholder="Your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full h-12 px-4 rounded-lg border border-slate-200 focus:outline-none focus:border-slate-900 transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 rounded-lg bg-black text-white font-medium text-sm transition-colors flex items-center justify-center gap-3 hover:bg-gray-800 disabled:opacity-50"
                    >
                        {loading ? 'Sending Magic Link...' : 'Sign In with Email'}
                    </button>
                </form>

                <div className="absolute bottom-8 text-slate-300 text-[10px] font-mono">v2.1.0</div>
            </div>
        </div>
    );
};
