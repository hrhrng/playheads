import { useState, useEffect } from 'react';

interface Config {
  auto_approve_enabled: boolean;
  auto_approve_per_day: number;
  auto_approved_today: number;
  last_reset_date: string;
}

export default function AdminConfig({ token }: { token: string }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [cronResult, setCronResult] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch('/api/admin/config', { headers })
      .then((r) => r.json())
      .then(setConfig);
  }, [token]);

  async function save(updates: Partial<Config>) {
    setSaving(true);
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    setConfig(data);
    setSaving(false);
  }

  async function triggerCron() {
    setCronResult(null);
    const res = await fetch('/api/admin/cron', {
      method: 'POST',
      headers: { 'x-cron-secret': 'manual-trigger' },
    });
    const data = await res.json();
    setCronResult(data.message || data.error || 'Done');
    // Refresh config
    const configRes = await fetch('/api/admin/config', { headers });
    setConfig(await configRes.json());
  }

  if (!config) return <div className="text-sm text-air-400">Loading config...</div>;

  return (
    <div className="bg-white rounded-xl border border-air-100 p-6 space-y-5">
      <h3 className="font-semibold text-sm">Auto-Approve Settings</h3>

      <div className="flex items-center justify-between">
        <label className="text-sm text-air-500">Enable auto-approve</label>
        <button
          onClick={() => save({ auto_approve_enabled: !config.auto_approve_enabled })}
          disabled={saving}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            config.auto_approve_enabled ? 'bg-green-500' : 'bg-air-200'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            config.auto_approve_enabled ? 'translate-x-5' : ''
          }`} />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-air-500">Per-day limit</label>
        <input
          type="number"
          min={1}
          max={1000}
          value={config.auto_approve_per_day}
          onChange={(e) => setConfig({ ...config, auto_approve_per_day: parseInt(e.target.value) || 1 })}
          onBlur={() => save({ auto_approve_per_day: config.auto_approve_per_day })}
          className="w-20 h-8 px-2 text-sm text-center rounded-lg border border-air-200 focus:outline-none focus:border-air-900"
        />
      </div>

      <div className="flex items-center justify-between text-sm text-air-400">
        <span>Approved today</span>
        <span className="font-mono">{config.auto_approved_today} / {config.auto_approve_per_day}</span>
      </div>

      <div className="flex items-center justify-between text-sm text-air-400">
        <span>Last reset</span>
        <span className="font-mono">{config.last_reset_date}</span>
      </div>

      <div className="pt-3 border-t border-air-100">
        <button
          onClick={triggerCron}
          className="text-xs px-4 py-2 rounded-lg bg-air-100 text-air-500 hover:bg-air-200 transition-colors"
        >
          Trigger Cron Manually
        </button>
        {cronResult && (
          <p className="text-xs text-air-400 mt-2">{cronResult}</p>
        )}
      </div>
    </div>
  );
}
