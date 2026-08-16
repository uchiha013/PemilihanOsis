/* eslint-disable @typescript-eslint/no-explicit-any -- D1 row shapes are narrowed immediately after each query. */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import { layout } from "../ui/layout";
import { body, esc, ip, jsonError } from "../utils/http";
import {
  createSession,
  destroySession,
  requireAdmin,
  requireCsrf,
} from "../auth/session";
import {
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from "../utils/crypto";
import { quickCount } from "../services/quick-count";
export const adminRoutes = new Hono<AppEnv>();
async function audit(
  c: Context<AppEnv>,
  action: string,
  target: string,
  metadata: Record<string, unknown> = {},
) {
  await c.env.DB.prepare(
    "INSERT INTO audit_logs(admin_id,action,target,metadata,ip_address) VALUES(?,?,?,?,?)",
  )
    .bind(
      c.get("adminId") || null,
      action,
      target,
      JSON.stringify(metadata),
      ip(c),
    )
    .run();
}
const csrf = (c: Context<AppEnv>) =>
  `<script>window.CSRF=${JSON.stringify(c.get("csrfToken"))};document.addEventListener('submit',e=>{const f=e.target;if(f.method?.toLowerCase()==='post'&&!f.querySelector('[name=csrf]')){const i=document.createElement('input');i.type='hidden';i.name='csrf';i.value=window.CSRF;f.append(i)}})</script>`;
const validCsrf = async (c: Context<AppEnv>) => {
  const b = await body(c);
  return {
    b,
    ok:
      String(b.csrf || c.req.header("X-CSRF-Token") || "") ===
      c.get("csrfToken"),
  };
};
adminRoutes.get("/login", (c) =>
  c.html(
    layout(
      "Login Admin",
      `<form class="card" method="post"><div class="eyebrow">AREA PANITIA</div><h1>Login Admin</h1>${c.req.query("expired") ? '<div class="alert">Sesi berakhir. Silakan login kembali.</div>' : ""}<label>Email</label><input type="email" name="email" autocomplete="email" placeholder="admin@sekolah.sch.id" required><label>Password</label><input type="password" name="password" autocomplete="current-password" required><button style="margin-top:18px;width:100%">Masuk</button></form>`,
    ),
  ),
);
adminRoutes.post("/login", async (c) => {
  const b = await body(c),
    email = String(b.email || "")
      .trim()
      .toLowerCase(),
    password = String(b.password || "");
  const key = await sha256(`${ip(c)}:${email}`);
  const attempt = await c.env.DB.prepare(
    "SELECT attempts,window_started_at FROM login_attempts WHERE key_hash=? AND window_started_at>datetime('now','-15 minutes')",
  )
    .bind(key)
    .first<{ attempts: number }>();
  if ((attempt?.attempts ?? 0) >= 5)
    return c.html(
      layout(
        "Terlalu Banyak Percobaan",
        '<div class="card"><h1>Coba lagi nanti.</h1><p>Terlalu banyak percobaan login.</p></div>',
      ),
      429,
    );
  const admin = await c.env.DB.prepare(
    "SELECT id,password_hash FROM admins WHERE email=?",
  )
    .bind(email)
    .first<{ id: number; password_hash: string }>();
  const ok = admin && (await verifyPassword(password, admin.password_hash));
  if (!ok) {
    await c.env.DB.prepare(
      "INSERT INTO login_attempts(key_hash,attempts,window_started_at) VALUES(?,1,CURRENT_TIMESTAMP) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN window_started_at<=datetime('now','-15 minutes') THEN 1 ELSE attempts+1 END,window_started_at=CASE WHEN window_started_at<=datetime('now','-15 minutes') THEN CURRENT_TIMESTAMP ELSE window_started_at END",
    )
      .bind(key)
      .run();
    return c.html(
      layout(
        "Login Gagal",
        '<div class="card"><h1>Login gagal.</h1><a class="btn" href="/admin/login">Coba lagi</a></div>',
      ),
      401,
    );
  }
  await createSession(c, admin.id);
  c.set("adminId", admin.id);
  await audit(c, "LOGIN", "admin");
  await c.env.DB.prepare("DELETE FROM login_attempts WHERE key_hash=?")
    .bind(key)
    .run();
  return c.redirect("/admin");
});
adminRoutes.post("/setup", async (c) => {
  const count = await c.env.DB.prepare("SELECT COUNT(*) n FROM admins").first<{
    n: number;
  }>();
  if ((count?.n ?? 0) > 0) return jsonError(c, 409, "Admin sudah tersedia.");
  const b = await body(c),
    secret = c.req.header("X-Setup-Secret") || "",
    expected = c.env.SESSION_SECRET;
  if (!expected || secret !== expected)
    return jsonError(c, 403, "Setup secret tidak valid.");
  const email = String(b.email || "")
      .trim()
      .toLowerCase(),
    password = String(b.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return jsonError(c, 400, "Email admin tidak valid.");
  if (password.length < 12)
    return jsonError(c, 400, "Password minimal 12 karakter.");
  await c.env.DB.prepare("INSERT INTO admins(email,password_hash) VALUES(?,?)")
    .bind(email, await hashPassword(password))
    .run();
  return c.json({ ok: true, message: "Admin pertama dibuat." });
});
adminRoutes.use("/*", requireAdmin);
adminRoutes.use("/*", async (c, next) => {
  const adminId = c.get("adminId");
  const admin = await c.env.DB.prepare("SELECT role FROM admins WHERE id=?")
    .bind(adminId)
    .first<{ role: string }>();
  if (admin?.role === "bilik") {
    return c.html(
      layout(
        "Akses Ditolak",
        '<div class="card"><h1>Akun ini tidak punya akses ke panel admin.</h1><p>Silakan buka <a href="/status">/status</a>.</p></div>',
      ),
      403,
    );
  }
  await next();
});
adminRoutes.get("/", async (c) => {
  const d = await quickCount(c.env);
  return c.html(
    layout(
      "Dashboard Admin",
      `<div class="eyebrow">DASHBOARD PANITIA</div><h1>${esc(d.electionName)}</h1><div class="grid"><div class="card stat">Total Siswa<strong>${d.totalStudents}</strong></div><div class="card stat">Sudah Memilih<strong>${d.integrity.votedStudents}</strong></div><div class="card stat">Belum Memilih<strong>${d.notVoted}</strong></div><div class="card stat">Partisipasi<strong>${d.turnoutPercentage}%</strong></div></div><div class="card" style="margin-top:18px"><h2>Status Sistem</h2><p>Election: <span class="badge">${esc(d.status)}</span> · Quick Count: <span class="badge">${d.enabled ? "AKTIF" : "NONAKTIF"}</span></p><div class="progress"><i style="width:${d.turnoutPercentage}%"></i></div><p>Integritas: <strong class="${d.integrity.valid ? "ok" : "bad"}">${d.integrity.valid ? "VALID" : "PERLU DIPERIKSA"}</strong> (${d.integrity.votedStudents} siswa memilih / ${d.integrity.totalVotes} suara)</p></div>${csrf(c)}`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  );
});
adminRoutes.post("/logout", async (c) => {
  const { ok } = await validCsrf(c);
  if (!ok) return c.text("CSRF invalid", 403);
  await audit(c, "LOGOUT", "admin");
  await destroySession(c);
  return c.redirect("/admin/login");
});
adminRoutes.get("/students", async (c) => {
  const q = (c.req.query("q") || "").trim(),
    klass = c.req.query("class") || "",
    status = c.req.query("status") || "",
    limit = 50;
  let where = "WHERE 1=1",
    args: unknown[] = [];
  if (q) {
    where += " AND name LIKE ?";
    args.push(`%${q}%`);
  }
  if (klass) {
    where += " AND class_name=?";
    args.push(klass);
  }
  if (status === "voted") where += " AND has_voted=1";
  if (status === "not") where += " AND has_voted=0";
  const total = await c.env.DB.prepare(
      `SELECT COUNT(*) n FROM students ${where}`,
    )
      .bind(...args)
      .first<{ n: number }>(),
    pages = Math.max(1, Math.ceil((total?.n || 0) / limit)),
    requestedPage = Math.max(1, Number(c.req.query("page")) || 1),
    page = Math.min(requestedPage, pages),
    offset = (page - 1) * limit,
    rows = await c.env.DB.prepare(
      `SELECT * FROM students ${where} ORDER BY class_name,attendance_number LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, offset)
      .all<Record<string, unknown>>(),
    classes = await c.env.DB.prepare(
      "SELECT DISTINCT class_name FROM students ORDER BY class_name",
    ).all<{ class_name: string }>();
  const trs = rows.results
      .map(
        (s) =>
          `<tr><td>${esc(s.name)}</td><td>${esc(s.class_name)}</td><td>${s.attendance_number}</td><td><span class="badge ${s.has_voted ? "green" : ""}">${s.has_voted ? "SUDAH" : "BELUM"}</span></td></tr>`,
      )
      .join(""),
    pageUrl = (target: number) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (klass) params.set("class", klass);
      if (status) params.set("status", status);
      params.set("page", String(target));
      return `/admin/students?${params}`;
    },
    from = total?.n ? offset + 1 : 0,
    to = Math.min(offset + limit, total?.n || 0),
    nav = `<div class="actions" style="justify-content:space-between;margin-top:18px"><span class="muted">Menampilkan ${from}–${to} dari ${total?.n || 0} siswa · Halaman ${page} dari ${pages}</span><span>${page > 1 ? `<a class="btn secondary" href="${pageUrl(page - 1)}">← Sebelumnya</a>` : ""} ${page < pages ? `<a class="btn secondary" href="${pageUrl(page + 1)}">Berikutnya →</a>` : ""}</span></div>`;
  return c.html(
    layout(
      "Siswa",
      `<div class="eyebrow">DATA PEMILIH</div><h1>Manajemen Siswa</h1><div class="actions" style="justify-content:flex-start"><a class="btn" href="/admin/students/import">Import CSV</a><a class="btn secondary" href="/admin/export/students">Export Partisipasi</a></div><form method="get" class="card" style="max-width:none;margin:18px 0;display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px"><input name="q" placeholder="Cari nama" value="${esc(q)}"><select name="class"><option value="">Semua kelas</option>${classes.results.map((x) => `<option ${x.class_name === klass ? "selected" : ""}>${esc(x.class_name)}</option>`).join("")}</select><select name="status"><option value="">Semua status</option><option value="not" ${status === "not" ? "selected" : ""}>Belum</option><option value="voted" ${status === "voted" ? "selected" : ""}>Sudah</option></select><button>Cari</button></form><div class="table-wrap"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Absen</th><th>Status</th></tr></thead><tbody>${trs}</tbody></table></div>${nav}${csrf(c)}`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  );
});

// --- BARU: set username & password login siswa (menggantikan/melengkapi alur QR) ---
adminRoutes.post("/api/students/:id/credentials", async (c) => {
  if (!requireCsrf(c)) return jsonError(c, 403, "CSRF invalid");
  const id = Number(c.req.param("id")),
    b = await body(c);
  const username = String(b.username || "")
      .trim()
      .toLowerCase(),
    password = String(b.password || "");
  if (!/^[a-z0-9._-]{3,40}$/.test(username))
    return jsonError(
      c,
      400,
      "Username minimal 3 karakter, huruf/angka/./_/- saja.",
    );
  if (password.length < 4)
    return jsonError(c, 400, "Password minimal 4 karakter.");
  const existing = await c.env.DB.prepare(
    "SELECT id FROM students WHERE username=? AND id!=?",
  )
    .bind(username, id)
    .first<{ id: number }>();
  if (existing) return jsonError(c, 409, "Username sudah dipakai siswa lain.");
  const result = await c.env.DB.prepare(
    "UPDATE students SET username=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND has_voted=0",
  )
    .bind(username, await hashPassword(password), id)
    .run();
  if (!result.meta.changes)
    return jsonError(
      c,
      409,
      "Kredensial tidak dapat diubah setelah siswa memilih.",
    );
  await audit(c, "SET_STUDENT_CREDENTIALS", "student", {
    studentId: id,
    username,
  });
  return c.json({ ok: true, username });
});
// --- END BARU ---

adminRoutes.get("/students/import", (c) =>
  c.html(
    layout(
      "Import CSV",
      `<div class="eyebrow">IMPORT SISWA</div><h1>Preview & Validasi CSV</h1><div class="card"><p>Format header: <code>nama,kelas,absen,username,password</code></p><p class="muted">Username & password boleh dikosongkan per baris (koma tetap ditulis).</p><label for="file">Pilih file CSV</label><input type="file" id="file" accept=".csv,text/csv"><div id="status" class="alert">Pilih file CSV untuk melihat preview.</div><div id="preview"></div><button id="send" disabled>Upload & Import Siswa</button></div><script>let rows=[];const fileInput=document.getElementById('file'),statusBox=document.getElementById('status'),previewBox=document.getElementById('preview'),sendButton=document.getElementById('send');const safe=v=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));fileInput.addEventListener('change',async()=>{sendButton.disabled=true;rows=[];previewBox.innerHTML='';const selected=fileInput.files[0];if(!selected){statusBox.textContent='Pilih file CSV.';return}try{const text=(await selected.text()).replace(/^\\uFEFF/,'').trim();const lines=text.split(/\\r?\\n/);const header=(lines.shift()||'').toLowerCase().split(',').map(x=>x.trim());if(header.join(',')!=='nama,kelas,absen,username,password')throw new Error('Header harus tepat: nama,kelas,absen,username,password');rows=lines.filter(x=>x.trim()).map((line,index)=>{const p=line.split(',');return {name:(p[0]||'').trim(),className:(p[1]||'').trim(),attendanceNumber:Number((p[2]||'').trim()),username:(p[3]||'').trim().toLowerCase(),password:(p[4]||'').trim(),line:index+2}});const invalid=rows.filter(x=>!x.name||!x.className||!Number.isInteger(x.attendanceNumber)||x.attendanceNumber<1||(x.username&&!/^[a-z0-9._-]{3,40}$/.test(x.username))||(x.username&&x.password.length<4)||(x.username&&!x.password)||(!x.username&&x.password));statusBox.textContent=rows.length+' baris ditemukan · '+invalid.length+' baris tidak valid.';previewBox.innerHTML='<div class="table-wrap"><table><thead><tr><th>Baris</th><th>Nama</th><th>Kelas</th><th>Absen</th><th>Username</th></tr></thead><tbody>'+rows.slice(0,200).map(x=>'<tr><td>'+x.line+'</td><td>'+safe(x.name)+'</td><td>'+safe(x.className)+'</td><td>'+safe(x.attendanceNumber)+'</td><td>'+safe(x.username||'-')+'</td></tr>').join('')+'</tbody></table></div>';sendButton.disabled=rows.length===0||invalid.length>0}catch(error){statusBox.textContent=error.message||'CSV tidak dapat dibaca.'}});sendButton.addEventListener('click',async()=>{sendButton.disabled=true;const size=2;try{for(let i=0;i<rows.length;i+=size){sendButton.textContent='Mengimpor '+Math.min(i+size,rows.length)+'/'+rows.length+'…';const r=await fetch('/admin/api/students/import',{method:'POST',headers:{'content-type':'application/json','X-CSRF-Token':CSRF},body:JSON.stringify({rows:rows.slice(i,i+size)})});const d=await r.json();if(!r.ok)throw Error(d.error||'Import gagal.')}location='/admin/students'}catch(error){statusBox.textContent=error.message||'Import gagal.';sendButton.disabled=false;sendButton.textContent='Upload & Import Siswa'}})</script>${csrf(c)}`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  ),
);
adminRoutes.post("/api/students/import", async (c) => {
  if (!requireCsrf(c)) return jsonError(c, 403, "CSRF invalid");
  const b = await body(c),
    rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length || rows.length > 5)
    return jsonError(c, 400, "Jumlah baris per batch harus 1–5.");
  const usernames: string[] = [];
  const parsed = rows.map((x) => {
    const r = x as Record<string, unknown>,
      name = String(r.name || "").trim(),
      className = String(r.className || "").trim(),
      n = Number(r.attendanceNumber),
      username = String(r.username || "")
        .trim()
        .toLowerCase(),
      password = String(r.password || "");
    if (!name || !className || !Number.isInteger(n) || n < 1)
      throw Error("Data CSV tidak valid.");
    if (username && !/^[a-z0-9._-]{3,40}$/.test(username))
      throw Error("Username tidak valid pada salah satu baris.");
    if (username && password.length < 4)
      throw Error("Password minimal 4 karakter pada salah satu baris.");
    if ((username && !password) || (!username && password))
      throw Error("Username dan password harus diisi berpasangan.");
    if (username) usernames.push(username);
    return { name, className, n, username, password };
  });
  if (new Set(usernames).size !== usernames.length)
    return jsonError(
      c,
      400,
      "Ada username yang sama di lebih dari satu baris CSV.",
    );
  if (usernames.length) {
    const existing = await c.env.DB.prepare(
      `SELECT username FROM students WHERE username IN (${usernames.map(() => "?").join(",")})`,
    )
      .bind(...usernames)
      .all<{ username: string }>();
    if (existing.results.length)
      return jsonError(
        c,
        409,
        `Username sudah terdaftar: ${existing.results.map((x) => x.username).join(", ")}.`,
      );
  }
  try {
    const stmts = [];
    for (const row of parsed) {
      if (row.username) {
        const passwordHash = await hashPassword(row.password);
        stmts.push(
          c.env.DB.prepare(
            "INSERT INTO students(name,class_name,attendance_number,username,password_hash) VALUES(?,?,?,?,?)",
          ).bind(row.name, row.className, row.n, row.username, passwordHash),
        );
      } else
        stmts.push(
          c.env.DB.prepare(
            "INSERT INTO students(name,class_name,attendance_number) VALUES(?,?,?)",
          ).bind(row.name, row.className, row.n),
        );
    }
    await c.env.DB.batch(stmts);
  } catch {
    return jsonError(
      c,
      409,
      "Kelas dan nomor absen harus unik. Periksa baris yang sudah pernah diimpor.",
    );
  }
  await audit(c, "IMPORT_STUDENTS", "students", { count: rows.length });
  return c.json({ ok: true, count: rows.length });
});
adminRoutes.get("/export/students", async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT name,class_name,attendance_number,has_voted,voted_at,username FROM students ORDER BY class_name,attendance_number",
  ).all<any>();
  const quote = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const csv = [
    "Nama,Kelas,Absen,Username,Status Memilih,Waktu Memilih",
    ...r.results.map((x) =>
      [
        x.name,
        x.class_name,
        x.attendance_number,
        x.username || "",
        x.has_voted ? "SUDAH MEMILIH" : "BELUM MEMILIH",
        x.voted_at || "",
      ]
        .map(quote)
        .join(","),
    ),
  ].join("\r\n");
  return new Response("\ufeff" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="partisipasi-siswa.csv"',
    },
  });
});
adminRoutes.get("/candidates", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM candidates ORDER BY candidate_number",
  ).all<any>();
  return c.html(
    layout(
      "Kandidat",
      `<div class="eyebrow">PASANGAN CALON</div><h1>Manajemen Kandidat</h1><div class="grid">${rows.results.map((x: any) => `<form class="card" method="post" style="margin:0"><fieldset><legend>Paslon ${x.candidate_number}</legend><input type="hidden" name="id" value="${x.id}"><label>Nomor urut</label><input type="number" value="${x.candidate_number}" readonly><label>Ketua</label><input name="chairman" value="${esc(x.chairman_name)}" required><label>Wakil</label><input name="vice" value="${esc(x.vice_chairman_name)}" required><label>URL Foto</label><input name="photo" value="${esc(x.photo_url)}"><label>Visi</label><textarea name="vision">${esc(x.vision)}</textarea><label>Misi</label><textarea name="mission">${esc(x.mission)}</textarea></fieldset><button style="margin-top:18px">Simpan Paslon ${x.candidate_number}</button></form>`).join("")}</div>${csrf(c)}`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  );
});
adminRoutes.post("/candidates", async (c) => {
  const { b, ok } = await validCsrf(c);
  if (!ok) return c.text("CSRF invalid", 403);
  const id = Number(b.id),
    chairman = String(b.chairman || "").trim(),
    vice = String(b.vice || "").trim();
  if (!Number.isInteger(id) || !chairman || !vice)
    return c.text("Data paslon tidak valid.", 400);
  const result = await c.env.DB.prepare(
    "UPDATE candidates SET chairman_name=?,vice_chairman_name=?,photo_url=?,vision=?,mission=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  )
    .bind(
      chairman,
      vice,
      String(b.photo || ""),
      String(b.vision || ""),
      String(b.mission || ""),
      id,
    )
    .run();
  if (!result.meta.changes) return c.text("Paslon tidak ditemukan.", 404);
  await audit(c, "UPDATE_CANDIDATE", "candidate", { candidateId: id });
  return c.redirect("/admin/candidates");
});
adminRoutes.get("/results", async (c) => {
  const d = await quickCount(c.env);
  return c.html(
    layout(
      "Hasil Admin",
      `<div class="eyebrow">HASIL INTERNAL</div><h1>Perolehan Suara</h1><div class="grid"><div class="card stat">Total siswa<strong>${d.totalStudents}</strong></div><div class="card stat">Suara masuk<strong>${d.totalVotes}</strong></div><div class="card stat">Belum memilih<strong>${d.notVoted}</strong></div></div><div class="grid" style="margin-top:18px">${d.candidates.map((x: any) => `<div class="card candidate"><div class="num">${String(x.candidateNumber).padStart(2, "0")}</div><h2>${esc(x.chairmanName)} & ${esc(x.viceChairmanName)}</h2><strong>${x.votes ?? 0} suara</strong><div class="progress"><i style="width:${d.totalVotes ? ((x.votes ?? 0) / d.totalVotes) * 100 : 0}%"></i></div><p>${d.totalVotes ? (((x.votes ?? 0) / d.totalVotes) * 100).toFixed(2) : "0.00"}%</p></div>`).join("")}</div><p>Integritas: <strong class="${d.integrity.valid ? "ok" : "bad"}">${d.integrity.valid ? "VALID" : "PERLU DIPERIKSA"}</strong></p>`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  );
});
adminRoutes.get("/settings", async (c) => {
  const s = await c.env.DB.prepare(
    "SELECT * FROM election_settings WHERE id=1",
  ).first<any>();
  return c.html(
    layout(
      "Pengaturan",
      `<div class="eyebrow">KONTROL PEMILIHAN</div><h1>Pengaturan</h1><form class="card" method="post"><label>Nama election</label><input name="election_name" value="${esc(s.election_name)}"><label>Nama sekolah</label><input name="school_name" value="${esc(s.school_name)}"><label>Status</label><select name="status">${["DRAFT", "OPEN", "CLOSED"].map((x) => `<option ${s.status === x ? "selected" : ""}>${x}</option>`).join("")}</select><label>Mulai (UTC)</label><input type="datetime-local" name="start_at" value="${esc(s.start_at || "")}"><label>Selesai (UTC)</label><input type="datetime-local" name="end_at" value="${esc(s.end_at || "")}"><h2>Quick Count</h2><label><input style="width:auto" type="checkbox" name="enabled" ${s.quick_count_enabled ? "checked" : ""}> Aktifkan</label><label>Mode</label><select name="mode">${["OFF", "PARTICIPATION_ONLY", "PERCENTAGE_ONLY", "FULL"].map((x) => `<option ${s.quick_count_mode === x ? "selected" : ""}>${x}</option>`).join("")}</select><label>Refresh (3–60 detik)</label><input type="number" min="3" max="60" name="refresh" value="${s.quick_count_refresh_interval}"><label><input style="width:auto" type="checkbox" name="photos" ${s.show_candidate_photos ? "checked" : ""}> Tampilkan foto</label><label><input style="width:auto" type="checkbox" name="winner" ${s.show_final_winner ? "checked" : ""}> Tampilkan pemenang setelah ditutup</label><button>Simpan</button></form><form class="card" method="post" action="/admin/reset" style="margin-top:22px;border-color:#fca5a5"><h2 class="bad">Reset Pemilihan</h2><p>Menghapus seluruh suara dan mengembalikan status siswa. Ketik <strong>RESET PEMILIHAN</strong>.</p><input name="confirmation"><button class="danger" style="margin-top:12px">Reset</button></form>${csrf(c)}`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  );
});
adminRoutes.post("/settings", async (c) => {
  const { b, ok } = await validCsrf(c);
  if (!ok) return c.text("CSRF invalid", 403);
  const status = String(b.status),
    mode = String(b.mode),
    refresh = Math.max(3, Math.min(60, Number(b.refresh) || 5));
  if (
    !["DRAFT", "OPEN", "CLOSED"].includes(status) ||
    !["OFF", "PARTICIPATION_ONLY", "PERCENTAGE_ONLY", "FULL"].includes(mode)
  )
    return c.text("Invalid", 400);
  await c.env.DB.prepare(
    "UPDATE election_settings SET election_name=?,school_name=?,status=?,start_at=?,end_at=?,quick_count_enabled=?,quick_count_mode=?,quick_count_refresh_interval=?,show_candidate_photos=?,show_final_winner=?,updated_at=CURRENT_TIMESTAMP WHERE id=1",
  )
    .bind(
      String(b.election_name),
      String(b.school_name),
      status,
      b.start_at || null,
      b.end_at || null,
      b.enabled ? 1 : 0,
      mode,
      refresh,
      b.photos ? 1 : 0,
      b.winner ? 1 : 0,
    )
    .run();
  await audit(c, "UPDATE_SETTINGS", "election", {
    status,
    quickCountMode: mode,
  });
  return c.redirect("/admin/settings");
});
adminRoutes.post("/reset", async (c) => {
  const { b, ok } = await validCsrf(c);
  if (!ok) return c.text("CSRF invalid", 403);
  if (b.confirmation !== "RESET PEMILIHAN")
    return c.text("Konfirmasi tidak cocok", 400);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE election_settings SET status='DRAFT' WHERE id=1"),
    c.env.DB.prepare("DELETE FROM votes"),
    c.env.DB.prepare(
      "UPDATE students SET has_voted=0,voted_at=NULL,updated_at=CURRENT_TIMESTAMP",
    ),
  ]);
  await audit(c, "RESET_ELECTION", "election");
  return c.redirect("/admin");
});
adminRoutes.get("/audit", async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT a.*,u.email FROM audit_logs a LEFT JOIN admins u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 500",
  ).all<any>();
  return c.html(
    layout(
      "Audit Log",
      `<div class="eyebrow">JEJAK ADMINISTRASI</div><h1>Audit Log</h1><div class="table-wrap"><table><tr><th>Waktu</th><th>Admin</th><th>Aksi</th><th>Target</th><th>Metadata</th></tr>${r.results.map((x) => `<tr><td>${esc(x.created_at)}</td><td>${esc(x.email || "-")}</td><td>${esc(x.action)}</td><td>${esc(x.target)}</td><td>${esc(x.metadata)}</td></tr>`).join("")}</table></div>`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  );
});

adminRoutes.get("/students/manage", async (c) => {
  const klass = (c.req.query("class") || "").trim(),
    limit = 50,
    requestedPage = Math.max(1, Number(c.req.query("page")) || 1),
    where = klass ? " WHERE class_name=?" : "",
    filterArgs = klass ? [klass] : [],
    election = await c.env.DB.prepare(
      "SELECT status FROM election_settings WHERE id=1",
    ).first<{ status: string }>(),
    total = await c.env.DB.prepare(`SELECT COUNT(*) n FROM students${where}`)
      .bind(...filterArgs)
      .first<{ n: number }>(),
    pages = Math.max(1, Math.ceil((total?.n || 0) / limit)),
    page = Math.min(requestedPage, pages),
    offset = (page - 1) * limit,
    rows = await c.env.DB.prepare(
      `SELECT id,name,class_name,attendance_number,has_voted,username FROM students${where} ORDER BY class_name,attendance_number LIMIT ? OFFSET ?`,
    )
      .bind(...filterArgs, limit, offset)
      .all<{
        id: number;
        name: string;
        class_name: string;
        attendance_number: number;
        has_voted: number;
        username: string | null;
      }>(),
    classes = await c.env.DB.prepare(
      "SELECT DISTINCT class_name FROM students ORDER BY class_name",
    ).all<{ class_name: string }>(),
    draft = election?.status === "DRAFT",
    pageUrl = (target: number) => {
      const params = new URLSearchParams({ page: String(target) });
      if (klass) params.set("class", klass);
      return `/admin/students/manage?${params}`;
    },
    nav = `<div class="actions" style="justify-content:space-between;margin-top:18px"><span class="muted">Halaman ${page} dari ${pages} · ${total?.n || 0} siswa</span><span>${page > 1 ? `<a class="btn secondary" href="${pageUrl(page - 1)}">← Sebelumnya</a>` : ""} ${page < pages ? `<a class="btn secondary" href="${pageUrl(page + 1)}">Berikutnya →</a>` : ""}</span></div>`;
  return c.html(
    layout(
      "CRUD Siswa",
      `<div class="eyebrow">KELOLA DATA SISWA</div><h1>Tambah, Edit & Hapus Siswa</h1>${draft ? "" : `<div class="alert">CRUD siswa dikunci karena status election ${esc(election?.status)}. Ubah status ke DRAFT untuk mengelola data.</div>`}<div class="actions" style="justify-content:flex-start"><a class="btn" href="/admin/students/new">+ Tambah Siswa</a><a class="btn secondary" href="/admin/students/import">Import CSV</a><a class="btn secondary" href="/admin/students">Daftar Siswa</a></div><form method="get" class="card" style="max-width:none;margin:18px 0;display:flex;gap:10px;align-items:end"><label style="margin:0;flex:1">Filter kelas<select name="class"><option value="">Semua kelas</option>${classes.results.map(x=>`<option value="${esc(x.class_name)}" ${x.class_name===klass?"selected":""}>${esc(x.class_name)}</option>`).join("")}</select></label><button>Filter</button><a class="btn secondary" href="/admin/students/manage">Reset</a></form><div class="table-wrap"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Absen</th><th>Status</th><th>Username</th><th>Password</th><th>Aksi</th></tr></thead><tbody>${rows.results.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.class_name)}</td><td>${s.attendance_number}</td><td><span class="badge ${s.has_voted ? "green" : ""}">${s.has_voted ? "SUDAH" : "BELUM"}</span></td><td>${esc(s.username || "-")}</td><td><a class="btn secondary" href="/admin/students/${s.id}/username">Edit Username</a> <a class="btn secondary" href="/admin/students/${s.id}/password">Ganti Password</a></td><td><a class="btn secondary" href="/admin/students/${s.id}/edit">Edit</a> <form method="post" action="/admin/students/${s.id}/delete" style="display:inline" onsubmit="return confirm('Hapus siswa ${esc(s.name)}?')"><button class="danger">Hapus</button></form></td></tr>`).join("")}</tbody></table></div>${nav}${csrf(c)}`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  );
});
adminRoutes.get("/students/new", async (c) =>
  c.html(
    layout(
      "Tambah Siswa",
      `<div class="eyebrow">DATA SISWA</div><h1>Tambah Siswa</h1><form class="card" method="post" action="/admin/students/create"><label>Nama lengkap</label><input name="name" maxlength="120" required><label>Kelas</label><input name="class_name" maxlength="50" placeholder="IXA" required><label>Nomor absen</label><input name="attendance_number" type="number" min="1" required><label>Username login</label><input name="username" maxlength="40" placeholder="contoh: budi01" pattern="[a-z0-9._-]{3,40}" title="huruf kecil/angka/./_/- minimal 3 karakter" required><label>Password login</label><input name="password" type="text" placeholder="minimal 4 karakter" minlength="4" required><div class="actions"><a class="btn secondary" href="/admin/students/manage">Batal</a><button>Simpan Siswa</button></div></form>${csrf(c)}`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  ),
);

adminRoutes.post("/students/create", async (c) => {
  const { b, ok } = await validCsrf(c);
  if (!ok) return c.text("CSRF invalid", 403);
  const name = String(b.name || "").trim(),
    className = String(b.class_name || "").trim(),
    attendance = Number(b.attendance_number),
    username = String(b.username || "")
      .trim()
      .toLowerCase(),
    password = String(b.password || "");
  if (!name || !className || !Number.isInteger(attendance) || attendance < 1)
    return c.text("Data siswa tidak valid.", 400);
  if (!/^[a-z0-9._-]{3,40}$/.test(username))
    return c.text(
      "Username minimal 3 karakter, huruf kecil/angka/./_/- saja.",
      400,
    );
  if (password.length < 4) return c.text("Password minimal 4 karakter.", 400);
  const existing = await c.env.DB.prepare(
    "SELECT id FROM students WHERE username=?",
  )
    .bind(username)
    .first<{ id: number }>();
  if (existing) return c.text("Username sudah dipakai siswa lain.", 409);
  try {
    const result = await c.env.DB.prepare(
      "INSERT INTO students(name,class_name,attendance_number,username,password_hash) VALUES(?,?,?,?,?)",
    )
      .bind(name, className, attendance, username, await hashPassword(password))
      .run();
    await audit(c, "ADD_STUDENT", "student", {
      studentId: result.meta.last_row_id,
      username,
    });
    return c.redirect("/admin/students/manage");
  } catch {
    return c.text("Kelas, nomor absen, atau username sudah digunakan.", 409);
  }
});

adminRoutes.get("/students/:id/edit", async (c) => {
  const student = await c.env.DB.prepare(
    "SELECT id,name,class_name,attendance_number,has_voted,username FROM students WHERE id=?",
  )
    .bind(Number(c.req.param("id")))
    .first<{
      id: number;
      name: string;
      class_name: string;
      attendance_number: number;
      has_voted: number;
      username: string | null;
    }>();
  if (!student) return c.text("Siswa tidak ditemukan.", 404);
  return c.html(
    layout(
      "Edit Siswa",
      `<div class="eyebrow">DATA SISWA</div><h1>Edit Siswa</h1><form class="card" method="post"><label>Nama lengkap</label><input name="name" maxlength="120" value="${esc(student.name)}" required><label>Kelas</label><input name="class_name" maxlength="50" value="${esc(student.class_name)}" required><label>Nomor absen</label><input name="attendance_number" type="number" min="1" value="${student.attendance_number}" required><label>Username login</label><input name="username" maxlength="40" value="${esc(student.username || "")}" placeholder="contoh: budi01" pattern="[a-z0-9._-]{3,40}" title="huruf kecil/angka/./_/- minimal 3 karakter"><label>Password baru</label><input name="password" type="text" placeholder="kosongkan jika tidak ingin mengubah password"><div class="actions"><a class="btn secondary" href="/admin/students/manage">Batal</a><button>Simpan Perubahan</button></div></form>${csrf(c)}`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  );
});

adminRoutes.post("/students/:id/edit", async (c) => {
  const { b, ok } = await validCsrf(c);
  if (!ok) return c.text("CSRF invalid", 403);
  const id = Number(c.req.param("id"));
  const name = String(b.name || "").trim(),
    className = String(b.class_name || "").trim(),
    attendance = Number(b.attendance_number),
    username = String(b.username || "")
      .trim()
      .toLowerCase(),
    password = String(b.password || "");
  if (!name || !className || !Number.isInteger(attendance) || attendance < 1)
    return c.text("Data siswa tidak valid.", 400);
  if (username && !/^[a-z0-9._-]{3,40}$/.test(username))
    return c.text(
      "Username minimal 3 karakter, huruf kecil/angka/./_/- saja.",
      400,
    );
  if (password && password.length < 4)
    return c.text("Password minimal 4 karakter.", 400);
  if (username) {
    const existing = await c.env.DB.prepare(
      "SELECT id FROM students WHERE username=? AND id!=?",
    )
      .bind(username, id)
      .first<{ id: number }>();
    if (existing) return c.text("Username sudah dipakai siswa lain.", 409);
  }
  try {
    const result = password
      ? await c.env.DB.prepare(
          "UPDATE students SET name=?,class_name=?,attendance_number=?,username=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
          .bind(
            name,
            className,
            attendance,
            username || null,
            await hashPassword(password),
            id,
          )
          .run()
      : await c.env.DB.prepare(
          "UPDATE students SET name=?,class_name=?,attendance_number=?,username=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
          .bind(name, className, attendance, username || null, id)
          .run();
    if (!result.meta.changes) return c.text("Siswa tidak ditemukan.", 404);
    await audit(c, "EDIT_STUDENT", "student", { studentId: id });
    return c.redirect("/admin/students/manage");
  } catch {
    return c.text("Kelas, nomor absen, atau username sudah digunakan.", 409);
  }
});

adminRoutes.post("/students/:id/delete", async (c) => {
  const { ok } = await validCsrf(c);
  if (!ok) return c.text("CSRF invalid", 403);
  const id = Number(c.req.param("id"));
  const result = await c.env.DB.prepare("DELETE FROM students WHERE id=?")
    .bind(id)
    .run();
  if (!result.meta.changes) return c.text("Siswa tidak ditemukan.", 404);
  await audit(c, "DELETE_STUDENT", "student", { studentId: id });
  return c.redirect("/admin/students/manage");
});

adminRoutes.get("/students/:id/username", async (c) => {
  const student = await c.env.DB.prepare(
    "SELECT id,name,username FROM students WHERE id=?",
  )
    .bind(Number(c.req.param("id")))
    .first<{ id: number; name: string; username: string | null }>();
  if (!student) return c.text("Siswa tidak ditemukan.", 404);
  return c.html(
    layout(
      "Edit Username",
      `<div class="eyebrow">KREDENSIAL LOGIN</div><h1>Edit Username</h1><form class="card" method="post"><p>${esc(student.name)}</p><label>Username</label><input name="username" value="${esc(student.username || "")}" pattern="[a-z0-9._-]{3,40}" required><div class="actions"><a class="btn secondary" href="/admin/students/manage">Batal</a><button>Simpan Username</button></div></form>${csrf(c)}`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  );
});
adminRoutes.post("/students/:id/username", async (c) => {
  const { b, ok } = await validCsrf(c);
  if (!ok) return c.text("CSRF invalid", 403);
  const id = Number(c.req.param("id")),
    username = String(b.username || "")
      .trim()
      .toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username))
    return c.text("Username tidak valid.", 400);
  const exists = await c.env.DB.prepare(
    "SELECT id FROM students WHERE username=? AND id!=?",
  )
    .bind(username, id)
    .first();
  if (exists) return c.text("Username sudah dipakai siswa lain.", 409);
  await c.env.DB.prepare(
    "UPDATE students SET username=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  )
    .bind(username, id)
    .run();
  await audit(c, "SET_STUDENT_USERNAME", "student", {
    studentId: id,
    username,
  });
  return c.redirect("/admin/students/manage");
});
adminRoutes.get("/students/:id/password", async (c) => {
  const student = await c.env.DB.prepare(
    "SELECT id,name FROM students WHERE id=?",
  )
    .bind(Number(c.req.param("id")))
    .first<{ id: number; name: string }>();
  if (!student) return c.text("Siswa tidak ditemukan.", 404);
  return c.html(
    layout(
      "Ganti Password",
      `<div class="eyebrow">KREDENSIAL LOGIN</div><h1>Ganti Password</h1><form class="card" method="post"><p>${esc(student.name)}</p><p class="muted">Password lama tidak dapat ditampilkan karena tersimpan secara aman.</p><label>Password baru</label><input name="password" type="text" minlength="4" required><div class="actions"><a class="btn secondary" href="/admin/students/manage">Batal</a><button>Simpan Password</button></div></form>${csrf(c)}`,
      { admin: true, csrfToken: c.get("csrfToken") },
    ),
  );
});
adminRoutes.post("/students/:id/password", async (c) => {
  const { b, ok } = await validCsrf(c);
  if (!ok) return c.text("CSRF invalid", 403);
  const id = Number(c.req.param("id")),
    password = String(b.password || "");
  if (password.length < 4) return c.text("Password minimal 4 karakter.", 400);
  await c.env.DB.prepare(
    "UPDATE students SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  )
    .bind(await hashPassword(password), id)
    .run();
  await audit(c, "SET_STUDENT_PASSWORD", "student", { studentId: id });
  return c.redirect("/admin/students/manage");
});
adminRoutes.post("/students/:id/credentials", async (c) => {
  const { b, ok } = await validCsrf(c);
  if (!ok) return c.text("CSRF invalid", 403);
  const id = Number(c.req.param("id"));
  const username = String(b.username || "")
      .trim()
      .toLowerCase(),
    password = String(b.password || "");
  if (!/^[a-z0-9._-]{3,40}$/.test(username))
    return c.text(
      "Username minimal 3 karakter, huruf kecil/angka/./_/- saja.",
      400,
    );
  const existing = await c.env.DB.prepare(
    "SELECT id FROM students WHERE username=? AND id!=?",
  )
    .bind(username, id)
    .first<{ id: number }>();
  if (existing) return c.text("Username sudah dipakai siswa lain.", 409);
  if (password) {
    if (password.length < 4) return c.text("Password minimal 4 karakter.", 400);
    const result = await c.env.DB.prepare(
      "UPDATE students SET username=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
      .bind(username, await hashPassword(password), id)
      .run();
    if (!result.meta.changes) return c.text("Siswa tidak ditemukan.", 404);
  } else {
    const result = await c.env.DB.prepare(
      "UPDATE students SET username=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
      .bind(username, id)
      .run();
    if (!result.meta.changes) return c.text("Siswa tidak ditemukan.", 404);
  }
  await audit(c, "SET_STUDENT_CREDENTIALS", "student", {
    studentId: id,
    username,
  });
  return c.redirect("/admin/students/manage");
});
