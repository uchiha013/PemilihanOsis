import { Hono } from "hono";
import type { AppEnv } from "../types";
import { layout } from "../ui/layout";
import { esc } from "../utils/http";
import { quickCount } from "../services/quick-count";

export const debugRoutes = new Hono<AppEnv>();

/*
 * PUBLIC HTML ROUTES
 * Tidak ada:
 * - login
 * - session
 * - admin authentication
 * - CSRF
 * - role checking
 * - audit admin
 */

/* Dashboard */
debugRoutes.get("/", async (c) => {
  const d = await quickCount(c.env);

  return c.html(
    layout(
      "Dashboard",
      `
      <div class="eyebrow">DASHBOARD</div>

      <h1>${esc(d.electionName)}</h1>

      <div class="grid">
        <div class="card stat">
          Total Siswa
          <strong>${d.totalStudents}</strong>
        </div>

        <div class="card stat">
          Sudah Memilih
          <strong>${d.integrity.votedStudents}</strong>
        </div>

        <div class="card stat">
          Belum Memilih
          <strong>${d.notVoted}</strong>
        </div>

        <div class="card stat">
          Partisipasi
          <strong>${d.turnoutPercentage}%</strong>
        </div>
      </div>

      <div class="card" style="margin-top:18px">
        <h2>Status Sistem</h2>

        <p>
          Election:
          <span class="badge">${esc(d.status)}</span>
        </p>

        <div class="progress">
          <i style="width:${d.turnoutPercentage}%"></i>
        </div>

        <p>
          Integritas:
          <strong class="${d.integrity.valid ? "ok" : "bad"}">
            ${d.integrity.valid ? "VALID" : "PERLU DIPERIKSA"}
          </strong>
        </p>
      </div>

      <div class="actions">
        <a class="btn" href="/admin/students">
          Siswa
        </a>

        <a class="btn" href="/admin/candidates">
          Kandidat
        </a>

        <a class="btn" href="/admin/results">
          Hasil
        </a>

        <a class="btn" href="/admin/settings">
          Pengaturan
        </a>
      </div>
      `,
    ),
  );
});


/* =========================================================
   SISWA
   ========================================================= */

debugRoutes.get("/students", async (c) => {
  const rows = await c.env.DB.prepare(
    `
    SELECT
      id,
      name,
      class_name,
      attendance_number,
      has_voted,
      username
    FROM students
    ORDER BY class_name, attendance_number
    `,
  ).all<any>();

  return c.html(
    layout(
      "Siswa",
      `
      <div class="eyebrow">DATA SISWA</div>

      <h1>Daftar Siswa</h1>

      <div class="actions">
        <a class="btn" href="/admin/students/import">
          Import CSV
        </a>

        <a class="btn secondary" href="/admin/export/students">
          Export
        </a>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Kelas</th>
              <th>Absen</th>
              <th>Username</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            ${rows.results
              .map(
                (s: any) => `
                <tr>
                  <td>${esc(s.name)}</td>
                  <td>${esc(s.class_name)}</td>
                  <td>${s.attendance_number}</td>
                  <td>${esc(s.username || "-")}</td>
                  <td>
                    <span class="badge ${
                      s.has_voted ? "green" : ""
                    }">
                      ${
                        s.has_voted
                          ? "SUDAH"
                          : "BELUM"
                      }
                    </span>
                  </td>
                </tr>
              `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      `,
    ),
  );
});


/* =========================================================
   EXPORT SISWA
   ========================================================= */

debugRoutes.get("/export/students", async (c) => {
  const r = await c.env.DB.prepare(
    `
    SELECT
      name,
      class_name,
      attendance_number,
      has_voted,
      voted_at,
      username
    FROM students
    ORDER BY class_name, attendance_number
    `,
  ).all<any>();

  const quote = (x: unknown) =>
    `"${String(x ?? "").replace(/"/g, '""')}"`;

  const csv = [
    "Nama,Kelas,Absen,Username,Status Memilih,Waktu Memilih",

    ...r.results.map((x: any) =>
      [
        x.name,
        x.class_name,
        x.attendance_number,
        x.username || "",
        x.has_voted
          ? "SUDAH MEMILIH"
          : "BELUM MEMILIH",
        x.voted_at || "",
      ]
        .map(quote)
        .join(","),
    ),
  ].join("\r\n");

  return new Response("\ufeff" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="partisipasi-siswa.csv"',
    },
  });
});


/* =========================================================
   KANDIDAT
   ========================================================= */

debugRoutes.get("/candidates", async (c) => {
  const rows = await c.env.DB.prepare(
    `
    SELECT *
    FROM candidates
    ORDER BY candidate_number
    `,
  ).all<any>();

  return c.html(
    layout(
      "Kandidat",
      `
      <div class="eyebrow">PASANGAN CALON</div>

      <h1>Kandidat</h1>

      <div class="grid">
        ${rows.results
          .map(
            (x: any) => `
            <div class="card candidate">

              <div class="num">
                ${String(
                  x.candidate_number,
                ).padStart(2, "0")}
              </div>

              ${
                x.photo_url
                  ? `
                    <img
                      src="${esc(x.photo_url)}"
                      alt="${esc(
                        x.chairman_name,
                      )}"
                      style="
                        max-width:180px;
                        max-height:180px;
                        object-fit:cover;
                        border-radius:12px;
                      "
                    >
                  `
                  : ""
              }

              <h2>
                ${esc(x.chairman_name)}
                &
                ${esc(
                  x.vice_chairman_name,
                )}
              </h2>

              <h3>Visi</h3>
              <p>${esc(x.vision || "")}</p>

              <h3>Misi</h3>
              <p>${esc(x.mission || "")}</p>

            </div>
          `,
          )
          .join("")}
      </div>
      `,
    ),
  );
});


/* =========================================================
   HASIL
   ========================================================= */

debugRoutes.get("/results", async (c) => {
  const d = await quickCount(c.env);

  return c.html(
    layout(
      "Hasil",
      `
      <div class="eyebrow">HASIL PEMILIHAN</div>

      <h1>Perolehan Suara</h1>

      <div class="grid">

        <div class="card stat">
          Total Siswa
          <strong>${d.totalStudents}</strong>
        </div>

        <div class="card stat">
          Suara Masuk
          <strong>${d.totalVotes}</strong>
        </div>

        <div class="card stat">
          Belum Memilih
          <strong>${d.notVoted}</strong>
        </div>

      </div>

      <div
        class="grid"
        style="margin-top:18px"
      >
        ${d.candidates
          .map(
            (x: any) => `
            <div class="card candidate">

              <div class="num">
                ${String(
                  x.candidateNumber,
                ).padStart(2, "0")}
              </div>

              <h2>
                ${esc(x.chairmanName)}
                &
                ${esc(
                  x.viceChairmanName,
                )}
              </h2>

              <strong>
                ${x.votes ?? 0} suara
              </strong>

              <div class="progress">
                <i style="width:${
                  d.totalVotes
                    ? ((x.votes ?? 0) /
                        d.totalVotes) *
                      100
                    : 0
                }%"></i>
              </div>

              <p>
                ${
                  d.totalVotes
                    ? (
                        ((x.votes ?? 0) /
                          d.totalVotes) *
                        100
                      ).toFixed(2)
                    : "0.00"
                }%
              </p>

            </div>
          `,
          )
          .join("")}
      </div>
      `,
    ),
  );
});


/* =========================================================
   PENGATURAN — HANYA TAMPIL HTML
   ========================================================= */

debugRoutes.get("/settings", async (c) => {
  const s = await c.env.DB.prepare(
    `
    SELECT *
    FROM election_settings
    WHERE id=1
    `,
  ).first<any>();

  return c.html(
    layout(
      "Pengaturan",
      `
      <div class="eyebrow">
        PENGATURAN
      </div>

      <h1>Pengaturan Pemilihan</h1>

      <div class="card">

        <p>
          <strong>Nama election:</strong>
          ${esc(s?.election_name || "")}
        </p>

        <p>
          <strong>Nama sekolah:</strong>
          ${esc(s?.school_name || "")}
        </p>

        <p>
          <strong>Status:</strong>
          <span class="badge">
            ${esc(s?.status || "")}
          </span>
        </p>

        <p>
          <strong>Quick Count:</strong>
          ${
            s?.quick_count_enabled
              ? "AKTIF"
              : "NONAKTIF"
          }
        </p>

        <p>
          <strong>Mode:</strong>
          ${esc(
            s?.quick_count_mode || "",
          )}
        </p>

      </div>
      `,
    ),
  );
});


/* =========================================================
   IMPORT — TAMPILAN SAJA
   ========================================================= */

debugRoutes.get("/students/import", (c) => {
  return c.html(
    layout(
      "Import CSV",
      `
      <div class="eyebrow">
        IMPORT SISWA
      </div>

      <h1>Import CSV</h1>

      <div class="card">

        <p>
          Format CSV:
        </p>

        <code>
          nama,kelas,absen,username,password
        </code>

        <br><br>

        <input
          type="file"
          accept=".csv,text/csv">

        <div class="alert">
          Halaman import CSV siap digunakan.
        </div>

      </div>
      `,
    ),
  );
});