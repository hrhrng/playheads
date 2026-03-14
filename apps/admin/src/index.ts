interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  ADMIN_EMAILS: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") return serveHTML(env);
    if (url.pathname === "/api/waitlist" && request.method === "GET") return handleList(request, env);
    if (url.pathname === "/api/waitlist" && request.method === "PATCH") return handleAction(request, env);

    return new Response("Not found", { status: 404 });
  },
};

// --- Auth ---

async function verifyAdmin(request: Request, env: Env): Promise<{ email: string } | null> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!res.ok) return null;

  const user = (await res.json()) as { email?: string };
  if (!user.email) return null;

  const admins = env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase());
  if (!admins.includes(user.email.toLowerCase())) return null;

  return { email: user.email };
}

// --- API ---

async function handleList(request: Request, env: Env): Promise<Response> {
  const admin = await verifyAdmin(request, env);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

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

  // Stats
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
  const admin = await verifyAdmin(request, env);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

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
    body.approved_by = admin.email;
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

  // Sync user_metadata for approved users
  if (action === "approve") {
    // Get emails for approved IDs
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

async function syncWaitlistApproval(env: Env, email: string): Promise<void> {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  // List users to find by email
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
<title>Playhead Admin</title>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; background: #F9FAFB; color: #111827; font-size: 14px; }
  .container { max-width: 900px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 18px; font-weight: 600; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .btn { padding: 6px 14px; border-radius: 8px; border: none; font-size: 12px; cursor: pointer; font-weight: 500; }
  .btn-black { background: #111; color: #fff; }
  .btn-black:hover { background: #333; }
  .btn-green { background: #dcfce7; color: #15803d; }
  .btn-green:hover { background: #bbf7d0; }
  .btn-red { background: #fef2f2; color: #b91c1c; }
  .btn-red:hover { background: #fecaca; }
  .btn-ghost { background: #f3f4f6; color: #6b7280; }
  .btn-ghost:hover { background: #e5e7eb; }
  .btn-ghost.active { background: #111; color: #fff; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .stat { text-align: center; padding: 16px; border-radius: 12px; }
  .stat-num { font-size: 24px; font-weight: 600; }
  .stat-label { font-size: 11px; margin-top: 4px; opacity: 0.7; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 8px; }
  .filters { display: flex; gap: 6px; }
  .bulk { display: flex; gap: 6px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #f3f4f6; }
  th { text-align: left; padding: 10px 12px; font-size: 11px; color: #9ca3af; font-weight: 500; border-bottom: 1px solid #f3f4f6; }
  td { padding: 10px 12px; border-bottom: 1px solid #fafafa; }
  tr:hover td { background: #fafafa; }
  .email { font-family: monospace; font-size: 12px; }
  .badge { font-size: 11px; padding: 2px 10px; border-radius: 999px; display: inline-block; }
  .badge-pending { background: #fefce8; color: #a16207; }
  .badge-approved { background: #dcfce7; color: #15803d; }
  .badge-rejected { background: #fef2f2; color: #b91c1c; }
  .date { color: #9ca3af; font-size: 12px; }
  .actions { text-align: right; }
  .actions .btn { margin-left: 4px; }
  .pagination { display: flex; justify-content: center; gap: 8px; margin-top: 16px; align-items: center; }
  .pagination span { font-size: 12px; color: #9ca3af; }
  .login { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .login-box { width: 100%; max-width: 360px; padding: 24px; }
  .login-box h1 { text-align: center; margin-bottom: 4px; }
  .login-box p { text-align: center; color: #9ca3af; font-size: 13px; margin-bottom: 20px; }
  input[type="email"], input[type="text"] { width: 100%; height: 44px; padding: 0 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; outline: none; }
  input:focus { border-color: #111; }
  .login-box .btn { width: 100%; height: 44px; margin-top: 10px; font-size: 14px; }
  .msg { padding: 10px; border-radius: 8px; text-align: center; font-size: 13px; margin-bottom: 12px; }
  .msg-ok { background: #dcfce7; color: #15803d; }
  .msg-err { background: #fef2f2; color: #b91c1c; }
  .signout { font-size: 12px; color: #9ca3af; cursor: pointer; border: none; background: none; }
  .signout:hover { color: #111; }
  .otp-input { text-align: center; font-family: monospace; font-size: 20px; letter-spacing: 0.3em; }
</style>
</head>
<body>
<div id="app"></div>
<script>
const SUPABASE_URL = "${env.SUPABASE_URL}";
const SUPABASE_ANON_KEY = "${env.SUPABASE_ANON_KEY}";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let token = null;
let entries = [];
let stats = { total: 0, pending: 0, approved: 0, rejected: 0 };
let filter = '';
let page = 1;
let totalPages = 1;
let selected = new Set();
let loading = false;
let loginStep = 'email'; // email | otp
let loginEmail = '';
let loginMsg = '';
let loginMsgType = '';

function render() {
  document.getElementById('app').innerHTML = token ? renderDashboard() : renderLogin();
  bind();
}

function renderLogin() {
  return \`<div class="login"><div class="login-box">
    <h1>Admin Login</h1>
    <p>Sign in with your admin email</p>
    \${loginMsg ? \`<div class="msg \${loginMsgType === 'error' ? 'msg-err' : 'msg-ok'}">\${loginMsg}</div>\` : ''}
    \${loginStep === 'email' ? \`
      <form id="loginForm">
        <input type="email" id="loginEmail" placeholder="admin@example.com" required value="\${loginEmail}" />
        <button type="submit" class="btn btn-black">Send Login Code</button>
      </form>
    \` : \`
      <form id="otpForm">
        <input type="text" id="otpCode" placeholder="Enter 6-digit code" class="otp-input" required maxlength="6" />
        <button type="submit" class="btn btn-black">Verify</button>
      </form>
    \`}
  </div></div>\`;
}

function renderDashboard() {
  const statItems = [
    { label: 'Total', value: stats.total, bg: '#f3f4f6', color: '#111827' },
    { label: 'Pending', value: stats.pending, bg: '#fefce8', color: '#a16207' },
    { label: 'Approved', value: stats.approved, bg: '#dcfce7', color: '#15803d' },
    { label: 'Rejected', value: stats.rejected, bg: '#fef2f2', color: '#b91c1c' },
  ];

  const rows = entries.map(e => \`<tr>
    <td><input type="checkbox" data-id="\${e.id}" \${selected.has(e.id) ? 'checked' : ''} /></td>
    <td class="email">\${e.email}</td>
    <td><span class="badge badge-\${e.status}">\${e.status}</span></td>
    <td class="date">\${new Date(e.created_at).toLocaleDateString()}</td>
    <td class="actions">\${e.status === 'pending' ? \`
      <button class="btn btn-green" onclick="doAction(['\${e.id}'],'approve')">Approve</button>
      <button class="btn btn-red" onclick="doAction(['\${e.id}'],'reject')">Reject</button>
    \` : ''}</td>
  </tr>\`).join('');

  return \`<div class="container">
    <div class="header">
      <h1>Waitlist Admin</h1>
      <button class="signout" onclick="signout()">Sign Out</button>
    </div>
    <div class="stats">
      \${statItems.map(s => \`<div class="stat" style="background:\${s.bg};color:\${s.color}">
        <div class="stat-num">\${s.value ?? 0}</div>
        <div class="stat-label">\${s.label}</div>
      </div>\`).join('')}
    </div>
    <div class="toolbar">
      <div class="filters">
        \${['', 'pending', 'approved', 'rejected'].map(s => \`
          <button class="btn btn-ghost \${filter === s ? 'active' : ''}" onclick="setFilter('\${s}')">\${s || 'All'}</button>
        \`).join('')}
      </div>
      <div class="bulk" id="bulk" style="display:\${selected.size > 0 ? 'flex' : 'none'}">
        <button class="btn btn-green" onclick="bulkAction('approve')">Approve (\${selected.size})</button>
        <button class="btn btn-red" onclick="bulkAction('reject')">Reject (\${selected.size})</button>
      </div>
    </div>
    \${loading ? '<p style="text-align:center;color:#9ca3af;padding:40px">Loading...</p>' :
      entries.length === 0 ? '<p style="text-align:center;color:#9ca3af;padding:40px">No entries.</p>' : \`
      <table>
        <thead><tr>
          <th><input type="checkbox" id="selectAll" \${selected.size === entries.length && entries.length > 0 ? 'checked' : ''} /></th>
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

function bind() {
  const lf = document.getElementById('loginForm');
  if (lf) lf.onsubmit = async (e) => {
    e.preventDefault();
    loginEmail = document.getElementById('loginEmail').value;
    const { error } = await sb.auth.signInWithOtp({ email: loginEmail, options: { shouldCreateUser: false } });
    if (error) { loginMsg = error.message; loginMsgType = 'error'; }
    else { loginStep = 'otp'; loginMsg = 'Check your email for a code.'; loginMsgType = 'ok'; }
    render();
  };
  const of = document.getElementById('otpForm');
  if (of) of.onsubmit = async (e) => {
    e.preventDefault();
    const code = document.getElementById('otpCode').value;
    const { data, error } = await sb.auth.verifyOtp({ email: loginEmail, token: code, type: 'email' });
    if (error) { loginMsg = error.message; loginMsgType = 'error'; render(); return; }
    if (data.session) { token = data.session.access_token; await fetchData(); }
  };
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
}

async function fetchData() {
  loading = true; render();
  const params = new URLSearchParams({ page: String(page) });
  if (filter) params.set('status', filter);
  const res = await fetch('/api/waitlist?' + params, { headers: { Authorization: 'Bearer ' + token } });
  if (res.status === 401) { token = null; render(); return; }
  const json = await res.json();
  entries = json.data || [];
  stats = json.stats || stats;
  totalPages = Math.ceil((json.pagination?.total || 0) / (json.pagination?.limit || 50));
  selected.clear();
  loading = false;
  render();
}

window.setFilter = (f) => { filter = f; page = 1; fetchData(); };
window.setPage = (p) => { page = p; fetchData(); };
window.signout = () => { token = null; loginStep = 'email'; loginMsg = ''; render(); };

window.doAction = async (ids, action) => {
  await fetch('/api/waitlist', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action }),
  });
  fetchData();
};
window.bulkAction = (action) => { doAction([...selected], action); };

render();
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
