interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") return serveHTML(env);
    if (url.pathname === "/api/waitlist" && request.method === "GET") return handleList(request, env);
    if (url.pathname === "/api/waitlist" && request.method === "PATCH") return handleAction(request, env);
    if (url.pathname === "/api/invite" && request.method === "POST") return handleInvite(request, env);

    return new Response("Not found", { status: 404 });
  },
};

// --- API ---

async function handleList(request: Request, env: Env): Promise<Response> {

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  const base = `${env.SUPABASE_URL}/rest/v1`;
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    Prefer: "count=exact",
  };

  let query = `${base}/waitlist?select=*&order=created_at.asc&offset=${offset}&limit=${limit}`;
  if (status) query += `&status=eq.${status}`;

  const res = await fetch(query, { headers });
  const data = await res.json();
  const total = parseInt(res.headers.get("content-range")?.split("/")[1] || "0");

  const [totalAll, pending, approved, rejected] = await Promise.all(
    ["", "pending", "approved", "rejected"].map(async (s) => {
      let q = `${base}/waitlist?select=*&offset=0&limit=0`;
      if (s) q += `&status=eq.${s}`;
      const r = await fetch(q, { headers: { ...headers, Prefer: "count=exact" } });
      return parseInt(r.headers.get("content-range")?.split("/")[1] || "0");
    })
  );

  return Response.json({
    data,
    pagination: { page, limit, total },
    stats: { total: totalAll, pending, approved, rejected },
  });
}

async function handleAction(request: Request, env: Env): Promise<Response> {
  const { ids, action } = (await request.json()) as { ids: string[]; action: string };
  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "ids[] required" }, { status: 400 });
  }
  if (!["approve", "reject"].includes(action)) {
    return Response.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }

  const base = `${env.SUPABASE_URL}/rest/v1`;
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  const newStatus = action === "approve" ? "approved" : "rejected";
  const body: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };
  if (action === "approve") {
    body.approved_at = new Date().toISOString();
    body.approved_by = "admin";
  }

  const idsFilter = ids.map((id) => `"${id}"`).join(",");
  const res = await fetch(`${base}/waitlist?id=in.(${idsFilter})`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: err }, { status: 500 });
  }

  if (action === "approve") {
    const emailRes = await fetch(
      `${base}/waitlist?id=in.(${idsFilter})&select=email`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const entries = (await emailRes.json()) as { email: string }[];
    for (const entry of entries) {
      await syncWaitlistApproval(env, entry.email);
    }
  }

  return Response.json({ success: true, updated: ids.length });
}

async function handleInvite(request: Request, env: Env): Promise<Response> {
  const { email } = (await request.json()) as { email: string };
  if (!email || typeof email !== "string") {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return Response.json({ error: "Invalid email format" }, { status: 400 });
  }

  const base = `${env.SUPABASE_URL}/rest/v1`;
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  // Check if already exists
  const checkRes = await fetch(
    `${base}/waitlist?email=eq.${encodeURIComponent(normalized)}&select=id,status`,
    { headers }
  );
  const existing = (await checkRes.json()) as { id: string; status: string }[];

  if (existing.length > 0) {
    if (existing[0].status === "approved") {
      return Response.json({ success: true, message: "Already approved" });
    }
    // Update to approved
    await fetch(`${base}/waitlist?id=eq.${existing[0].id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: "admin",
        updated_at: new Date().toISOString(),
      }),
    });
  } else {
    // Insert as approved
    await fetch(`${base}/waitlist`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        email: normalized,
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: "admin",
      }),
    });
  }

  await syncWaitlistApproval(env, normalized);
  return Response.json({ success: true, message: `${normalized} has been granted access` });
}

async function syncWaitlistApproval(env: Env, email: string): Promise<void> {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, { headers });
  if (!res.ok) return;

  const data = (await res.json()) as { users: { id: string; email?: string; user_metadata?: Record<string, unknown> }[] };
  const user = data.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return;

  await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      user_metadata: { ...user.user_metadata, waitlist_approved: true },
    }),
  });
}

// --- HTML ---

function serveHTML(env: Env): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/png" href="data:image/png;base64,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" />
<title>The Playheads Admin</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; color: #111827; font-size: 14px; }

  /* Layout */
  .app { display: flex; height: 100vh; background: #f8f9fb; }

  /* Sidebar */
  .sidebar { width: 220px; background: #111827; color: #fff; display: flex; flex-direction: column; flex-shrink: 0; }
  .sidebar-brand { padding: 20px 20px 24px; display: flex; align-items: center; gap: 10px; }
  .sidebar-brand h1 { font-size: 16px; font-weight: 600; letter-spacing: -0.3px; }
  .sidebar-brand span { font-size: 10px; background: rgba(255,255,255,0.12); padding: 2px 8px; border-radius: 4px; font-weight: 500; color: #9ca3af; }
  .sidebar-nav { flex: 1; padding: 0 8px; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; cursor: pointer; color: #9ca3af; font-size: 13px; font-weight: 500; transition: all 0.15s; margin-bottom: 2px; border: none; background: none; width: 100%; text-align: left; }
  .nav-item:hover { color: #fff; background: rgba(255,255,255,0.06); }
  .nav-item.active { color: #fff; background: rgba(255,255,255,0.1); }
  .nav-item svg { width: 18px; height: 18px; opacity: 0.7; }
  .nav-item.active svg { opacity: 1; }
  /* Main */
  .main { flex: 1; overflow-y: auto; }
  .main-header { padding: 20px 32px; border-bottom: 1px solid #eee; background: #fff; display: flex; justify-content: space-between; align-items: center; }
  .main-header h2 { font-size: 16px; font-weight: 600; }
  .main-body { padding: 24px 32px; }

  /* Buttons */
  .btn { padding: 7px 14px; border-radius: 8px; border: none; font-size: 12px; cursor: pointer; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s; }
  .btn-primary { background: #111; color: #fff; }
  .btn-primary:hover { background: #333; }
  .btn-green { background: #dcfce7; color: #15803d; }
  .btn-green:hover { background: #bbf7d0; }
  .btn-red { background: #fef2f2; color: #b91c1c; }
  .btn-red:hover { background: #fecaca; }
  .btn-ghost { background: #f3f4f6; color: #6b7280; }
  .btn-ghost:hover { background: #e5e7eb; }
  .btn-ghost.active { background: #111; color: #fff; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Stats */
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .stat { padding: 18px; border-radius: 12px; background: #fff; border: 1px solid #f0f0f0; }
  .stat-num { font-size: 28px; font-weight: 600; }
  .stat-label { font-size: 12px; margin-top: 4px; color: #9ca3af; }

  /* Toolbar */
  .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 8px; }
  .filters { display: flex; gap: 6px; }
  .bulk { display: flex; gap: 6px; }

  /* Table */
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #f0f0f0; }
  th { text-align: left; padding: 10px 14px; font-size: 11px; color: #9ca3af; font-weight: 500; border-bottom: 1px solid #f0f0f0; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 11px 14px; border-bottom: 1px solid #fafafa; }
  tr:hover td { background: #fafbfc; }
  .email-cell { font-family: "SF Mono", SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .badge { font-size: 11px; padding: 2px 10px; border-radius: 999px; display: inline-block; font-weight: 500; }
  .badge-pending { background: #fefce8; color: #a16207; }
  .badge-approved { background: #dcfce7; color: #15803d; }
  .badge-rejected { background: #fef2f2; color: #b91c1c; }
  .date { color: #9ca3af; font-size: 12px; }
  .actions { text-align: right; }
  .actions .btn { margin-left: 4px; }
  .pagination { display: flex; justify-content: center; gap: 8px; margin-top: 16px; align-items: center; }
  .pagination span { font-size: 12px; color: #9ca3af; }
  .empty { text-align: center; color: #9ca3af; padding: 48px; }

  /* Modal */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(2px); }
  .modal { background: #fff; border-radius: 16px; width: 100%; max-width: 420px; padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
  .modal h3 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
  .modal p { font-size: 13px; color: #6b7280; margin-bottom: 20px; }
  .modal .form-group { margin-bottom: 16px; }
  .modal label { font-size: 12px; font-weight: 500; color: #6b7280; display: block; margin-bottom: 6px; }
  .modal input { width: 100%; height: 42px; padding: 0 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; outline: none; }
  .modal input:focus { border-color: #111; box-shadow: 0 0 0 3px rgba(17,17,17,0.06); }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .modal .msg { padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  .msg-ok { background: #dcfce7; color: #15803d; }
  .msg-err { background: #fef2f2; color: #b91c1c; }

  /* Toast */
  .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 200; box-shadow: 0 4px 20px rgba(0,0,0,0.12); animation: toast-in 0.3s ease; }
  @keyframes toast-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
</style>
</head>
<body>
<div id="app"></div>
<script>
// State
let currentPage = 'waitlist';
let entries = [];
let stats = { total: 0, pending: 0, approved: 0, rejected: 0 };
let filter = '';
let page = 1;
let totalPages = 1;
let selected = new Set();
let loading = false;
let showInviteModal = false;
let inviteMsg = '';
let inviteMsgType = '';

// Icons (inline SVG)
const icons = {
  waitlist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

// Render
function render() {
  document.getElementById('app').innerHTML = renderApp();
  bind();
}

function renderApp() {
  const navItems = [
    { id: 'waitlist', label: 'Waitlist', icon: icons.waitlist },
  ];

  return \`<div class="app">
    <div class="sidebar">
      <div class="sidebar-brand">
        <h1>The Playheads</h1>
        <span>Admin</span>
      </div>
      <div class="sidebar-nav">
        \${navItems.map(n => \`
          <button class="nav-item \${currentPage === n.id ? 'active' : ''}" onclick="navigateTo('\${n.id}')">
            \${n.icon} \${n.label}
          </button>
        \`).join('')}
      </div>
    </div>
    <div class="main">
      \${renderPageContent()}
    </div>
    \${showInviteModal ? renderInviteModal() : ''}
  </div>\`;
}

function renderPageContent() {
  if (currentPage === 'waitlist') return renderWaitlistPage();
  return '<div class="main-body"><p class="empty">Coming soon</p></div>';
}

function renderWaitlistPage() {
  const statItems = [
    { label: 'Total', value: stats.total, color: '#111827' },
    { label: 'Pending', value: stats.pending, color: '#a16207' },
    { label: 'Approved', value: stats.approved, color: '#15803d' },
    { label: 'Rejected', value: stats.rejected, color: '#b91c1c' },
  ];

  const rows = entries.map(e => \`<tr>
    <td><input type="checkbox" data-id="\${e.id}" \${selected.has(e.id) ? 'checked' : ''} /></td>
    <td class="email-cell">\${e.email}</td>
    <td><span class="badge badge-\${e.status}">\${e.status}</span></td>
    <td class="date">\${new Date(e.created_at).toLocaleDateString()}</td>
    <td class="actions">\${e.status === 'pending' ? \`
      <button class="btn btn-green" onclick="doAction(['\${e.id}'],'approve')">Approve</button>
      <button class="btn btn-red" onclick="doAction(['\${e.id}'],'reject')">Reject</button>
    \` : ''}</td>
  </tr>\`).join('');

  return \`
    <div class="main-header">
      <h2>Waitlist</h2>
      <button class="btn btn-primary" onclick="openInvite()">\${icons.plus} Grant Access</button>
    </div>
    <div class="main-body">
      <div class="stats">
        \${statItems.map(s => \`<div class="stat">
          <div class="stat-num" style="color:\${s.color}">\${s.value ?? 0}</div>
          <div class="stat-label">\${s.label}</div>
        </div>\`).join('')}
      </div>
      <div class="toolbar">
        <div class="filters">
          \${['', 'pending', 'approved', 'rejected'].map(s => \`
            <button class="btn btn-ghost \${filter === s ? 'active' : ''}" onclick="setFilter('\${s}')">\${s || 'All'}</button>
          \`).join('')}
        </div>
        <div class="bulk" style="display:\${selected.size > 0 ? 'flex' : 'none'}">
          <button class="btn btn-green" onclick="bulkAction('approve')">Approve (\${selected.size})</button>
          <button class="btn btn-red" onclick="bulkAction('reject')">Reject (\${selected.size})</button>
        </div>
      </div>
      \${loading ? '<p class="empty">Loading...</p>' :
        entries.length === 0 ? '<p class="empty">No entries</p>' : \`
        <table>
          <thead><tr>
            <th style="width:40px"><input type="checkbox" id="selectAll" \${selected.size === entries.length && entries.length > 0 ? 'checked' : ''} /></th>
            <th>Email</th><th>Status</th><th>Joined</th><th style="text-align:right">Actions</th>
          </tr></thead>
          <tbody>\${rows}</tbody>
        </table>\`}
      \${totalPages > 1 ? \`<div class="pagination">
        <button class="btn btn-ghost" onclick="setPage(\${page - 1})" \${page <= 1 ? 'disabled' : ''}>Prev</button>
        <span>Page \${page} / \${totalPages}</span>
        <button class="btn btn-ghost" onclick="setPage(\${page + 1})" \${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>\` : ''}
    </div>\`;
}

function renderInviteModal() {
  return \`<div class="modal-overlay" id="modalOverlay">
    <div class="modal">
      <h3>Grant Access</h3>
      <p>Manually grant access to an email address. They will be added to the waitlist as approved.</p>
      \${inviteMsg ? \`<div class="msg \${inviteMsgType === 'error' ? 'msg-err' : 'msg-ok'}">\${inviteMsg}</div>\` : ''}
      <form id="inviteForm">
        <div class="form-group">
          <label>Email address</label>
          <input type="email" id="inviteEmail" placeholder="user@example.com" required />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="closeInvite()">Cancel</button>
          <button type="submit" class="btn btn-primary">Grant Access</button>
        </div>
      </form>
    </div>
  </div>\`;
}

// Bind events
function bind() {
  const sa = document.getElementById('selectAll');
  if (sa) sa.onchange = () => {
    if (selected.size === entries.length) selected.clear();
    else entries.forEach(e => selected.add(e.id));
    render();
  };
  document.querySelectorAll('input[data-id]').forEach(el => {
    el.onchange = () => {
      const id = el.dataset.id;
      selected.has(id) ? selected.delete(id) : selected.add(id);
      render();
    };
  });

  const inf = document.getElementById('inviteForm');
  if (inf) inf.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('inviteEmail').value;
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        inviteMsg = data.message || 'Access granted!';
        inviteMsgType = 'ok';
        render();
        setTimeout(() => { closeInvite(); fetchData(); }, 1200);
      } else {
        inviteMsg = data.error || 'Failed to grant access';
        inviteMsgType = 'error';
        render();
      }
    } catch {
      inviteMsg = 'Network error';
      inviteMsgType = 'error';
      render();
    }
  };

  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.onclick = (e) => {
    if (e.target === overlay) closeInvite();
  };
}

// Data
async function fetchData() {
  loading = true; render();
  const params = new URLSearchParams({ page: String(page) });
  if (filter) params.set('status', filter);
  const res = await fetch('/api/waitlist?' + params);
  const json = await res.json();
  entries = json.data || [];
  stats = json.stats || stats;
  totalPages = Math.ceil((json.pagination?.total || 0) / (json.pagination?.limit || 50));
  selected.clear();
  loading = false;
  render();
}

// Actions
window.navigateTo = (p) => { currentPage = p; render(); };
window.setFilter = (f) => { filter = f; page = 1; fetchData(); };
window.setPage = (p) => { page = p; fetchData(); };
window.openInvite = () => { showInviteModal = true; inviteMsg = ''; render(); document.getElementById('inviteEmail')?.focus(); };
window.closeInvite = () => { showInviteModal = false; inviteMsg = ''; render(); };

window.doAction = async (ids, action) => {
  await fetch('/api/waitlist', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action }),
  });
  fetchData();
};
window.bulkAction = (action) => { doAction([...selected], action); };

fetchData();
<\/script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
