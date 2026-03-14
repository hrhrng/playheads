import { useState } from 'react';
import AdminLogin from './AdminLogin';
import AdminTable from './AdminTable';
import AdminConfig from './AdminConfig';

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export default function AdminDashboard({ supabaseUrl, supabaseAnonKey }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<'waitlist' | 'config'>('waitlist');

  if (!token) {
    return (
      <AdminLogin
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
        onLogin={setToken}
      />
    );
  }

  return (
    <div className="min-h-screen bg-air-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Waitlist Admin</h1>
          <button
            onClick={() => setToken(null)}
            className="text-xs text-air-400 hover:text-air-900"
          >
            Sign Out
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-air-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setTab('waitlist')}
            className={`text-sm px-4 py-1.5 rounded-md transition-colors ${
              tab === 'waitlist' ? 'bg-white shadow-sm text-air-900' : 'text-air-400'
            }`}
          >
            Waitlist
          </button>
          <button
            onClick={() => setTab('config')}
            className={`text-sm px-4 py-1.5 rounded-md transition-colors ${
              tab === 'config' ? 'bg-white shadow-sm text-air-900' : 'text-air-400'
            }`}
          >
            Settings
          </button>
        </div>

        {/* Content */}
        {tab === 'waitlist' ? (
          <AdminTable token={token} />
        ) : (
          <AdminConfig token={token} />
        )}
      </div>
    </div>
  );
}
