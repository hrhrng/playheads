import { useState, useEffect, useCallback } from 'react';

interface WaitlistEntry {
  id: string;
  email: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

interface Stats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export default function AdminTable({ token }: { token: string }) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [filter, setFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filter) params.set('status', filter);

    const res = await fetch(`/api/admin/waitlist?${params}`, { headers });
    if (res.ok) {
      const json = await res.json();
      setEntries(json.data || []);
      setStats(json.stats || { total: 0, pending: 0, approved: 0, rejected: 0 });
      setTotalPages(Math.ceil((json.pagination?.total || 0) / (json.pagination?.limit || 50)));
    }
    setLoading(false);
    setSelected(new Set());
  }, [page, filter, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAction(ids: string[], action: 'approve' | 'reject') {
    await fetch('/api/admin/waitlist', {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action }),
    });
    fetchData();
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  }

  const statItems = [
    { label: 'Total', value: stats.total, color: 'bg-air-100 text-air-900' },
    { label: 'Pending', value: stats.pending, color: 'bg-yellow-50 text-yellow-700' },
    { label: 'Approved', value: stats.approved, color: 'bg-green-50 text-green-700' },
    { label: 'Rejected', value: stats.rejected, color: 'bg-red-50 text-red-700' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {statItems.map((s) => (
          <div key={s.label} className={`${s.color} rounded-xl p-4 text-center`}>
            <div className="text-2xl font-semibold">{s.value ?? 0}</div>
            <div className="text-xs mt-1 opacity-70">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters & bulk actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {['', 'pending', 'approved', 'rejected'].map((s) => (
            <button
              key={s}
              onClick={() => { setFilter(s); setPage(1); }}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                filter === s ? 'bg-black text-white' : 'bg-air-100 text-air-500 hover:bg-air-200'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => handleAction([...selected], 'approve')}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700"
            >
              Approve ({selected.size})
            </button>
            <button
              onClick={() => handleAction([...selected], 'reject')}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700"
            >
              Reject ({selected.size})
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-air-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-air-400 text-sm">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-air-400 text-sm">No entries found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-air-100 text-air-400 text-xs">
                <th className="p-3 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === entries.length && entries.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Joined</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-air-50 hover:bg-air-50">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(entry.id)}
                      onChange={() => toggleSelect(entry.id)}
                    />
                  </td>
                  <td className="p-3 font-mono text-xs">{entry.email}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      entry.status === 'approved' ? 'bg-green-50 text-green-700' :
                      entry.status === 'rejected' ? 'bg-red-50 text-red-700' :
                      'bg-yellow-50 text-yellow-700'
                    }`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="p-3 text-air-400 text-xs">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right">
                    {entry.status === 'pending' && (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleAction([entry.id], 'approve')}
                          className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction([entry.id], 'reject')}
                          className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="text-xs px-3 py-1.5 rounded-lg bg-air-100 text-air-500 hover:bg-air-200 disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs px-3 py-1.5 text-air-400">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="text-xs px-3 py-1.5 rounded-lg bg-air-100 text-air-500 hover:bg-air-200 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
