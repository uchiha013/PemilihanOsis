import { Hono } from 'hono';
import QRCode from 'qrcode';

import type { AppEnv } from '../types';

import { layout } from '../ui/layout';

import {
  body,
  esc,
  ip,
  jsonError,
} from '../utils/http';

import { qrMatrixToPng } from '../utils/png';

import { requireAdmin } from '../auth/session';

import {
  randomToken,
  sha256,
  verifyPassword,
} from '../utils/crypto';

import {
  castAnonymousVote,
  electionState,
  findVoter,
} from '../services/voting';

import { quickCount } from '../services/quick-count';


// ============================================================
// PUBLIC ROUTES
// ============================================================

export const publicRoutes = new Hono<AppEnv>();


// ============================================================
// AUTHORIZATION
// ============================================================

publicRoutes.use(
  '/quick-count',
  requireAdmin,
);

publicRoutes.use(
  '/api/public/quick-count',
  requireAdmin,
);

publicRoutes.use(
  '/status/*',
  requireAdmin,
);

publicRoutes.use(
  '/api/status/*',
  requireAdmin,
);


// ============================================================
// CONFIGURATION
// ============================================================

const BILIK_COUNT = 8;

function bilikClasses(n: number): string[] {
  return [
    `X${n}`,
    `XI${n}`,
    `XII${n}`,
  ];
}


// ============================================================
// STATUS BILIK
// ============================================================

publicRoutes.get(
  '/status',
  (c) => {

    const links = Array
      .from(
        { length: BILIK_COUNT },
        (_, index) => index + 1,
      )
      .map(
        (n) =>
          `<a class="btn" href="/status/${n}">
            Bilik ${n}
          </a>`,
      )
      .join(' ');

    return c.html(
      layout(
        'Status Bilik',

        `
          <div class="eyebrow">
            MONITOR ANTI-GOLPUT
          </div>

          <h1>
            Pilih Bilik
          </h1>

          <p class="muted">
            Bilik N memantau kelas XN, XIN, XIIN.
            Contoh Bilik 1 memantau X1, XI1, XII1.
          </p>

          <div
            class="actions"
            style="flex-wrap: wrap"
          >
            ${links}
          </div>
        `,

        {
          admin: true,
        },
      ),
    );
  },
);


// ============================================================
// DETAIL STATUS BILIK
// ============================================================

publicRoutes.get(
  '/status/:bilik',
  (c) => {

    const bilik = Number(
      c.req.param('bilik'),
    );

    if (
      !Number.isInteger(bilik) ||
      bilik < 1 ||
      bilik > BILIK_COUNT
    ) {
      return c.text(
        'Bilik tidak valid (1-8).',
        400,
      );
    }

    const classes = bilikClasses(bilik);

    return c.html(
      layout(
        `Status Bilik ${bilik}`,

        `
          <div class="eyebrow">
            MONITOR ANTI-GOLPUT · BILIK ${bilik}
          </div>

          <h1>
            Status Pemilih —
            ${classes.join(' / ')}
          </h1>

          <div
            class="grid"
            id="summary"
          ></div>

          <div
            id="content"
            style="margin-top: 18px"
          >
            <div class="card">
              Memuat data...
            </div>
          </div>

          <p
            id="updated"
            class="muted"
          ></p>

          <script>

            const bilik = ${bilik};

            const safe = (value) =>
              String(value).replace(
                /[&<>"']/g,
                (char) => ({
                  '&': '&amp;',
                  '<': '&lt;',
                  '>': '&gt;',
                  '"': '&quot;',
                  "'": '&#39;',
                }[char])
              );


            async function load() {

              try {

                const response = await fetch(
                  '/api/status/' + bilik
                );

                if (!response.ok) {
                  throw Error();
                }

                const rows =
                  await response.json();

                render(rows);

                document.querySelector(
                  '#updated'
                ).textContent =
                  'Terakhir diperbarui: ' +
                  new Date().toLocaleTimeString(
                    'id-ID'
                  );

              } catch (error) {

                document.querySelector(
                  '#updated'
                ).textContent =
                  'Koneksi terputus. ' +
                  'Mencoba memperbarui kembali…';
              }

              setTimeout(
                load,
                5000
              );
            }


            function render(rows) {

              const icon = (status) => {

                if (status === 'voted') {
                  return '✅';
                }

                if (status === 'error') {
                  return '⚠️';
                }

                return '❌';
              };


              const label = (status) => {

                if (status === 'voted') {
                  return 'Sudah Memilih';
                }

                if (status === 'error') {
                  return 'Akun Belum Siap';
                }

                return 'Belum Memilih';
              };


              const voted =
                rows.filter(
                  x => x.status === 'voted'
                ).length;


              const error =
                rows.filter(
                  x => x.status === 'error'
                ).length;


              document.querySelector(
                '#summary'
              ).innerHTML = \`

                <div class="card stat">
                  Total Siswa
                  <strong>
                    \${rows.length}
                  </strong>
                </div>

                <div class="card stat">
                  Sudah Memilih
                  <strong>
                    \${voted}
                  </strong>
                </div>

                <div class="card stat">
                  Belum Memilih
                  <strong>
                    \${rows.length - voted - error}
                  </strong>
                </div>

                <div class="card stat">
                  Akun Belum Siap
                  <strong>
                    \${error}
                  </strong>
                </div>

              \`;


              let html = \`

                <div class="table-wrap">

                  <table>

                    <thead>
                      <tr>
                        <th></th>
                        <th>Nama</th>
                        <th>Kelas</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>

              \`;


              for (const student of rows) {

                html += \`

                  <tr>

                    <td style="font-size: 22px">
                      \${icon(student.status)}
                    </td>

                    <td>
                      \${safe(student.name)}
                    </td>

                    <td>
                      \${safe(student.className)}
                    </td>

                    <td>
                      \${label(student.status)}
                    </td>

                  </tr>

                \`;
              }


              html += \`

                    </tbody>

                  </table>

                </div>

              \`;


              document.querySelector(
                '#content'
              ).innerHTML =
                rows.length
                  ? html
                  : \`
                    <div class="card">
                      Belum ada data siswa
                      untuk kelas bilik ini.
                    </div>
                  \`;
            }


            load();

          </script>
        `,

        {
          admin: true,
          wide: true,
        },
      ),
    );
  },
);

publicRoutes.get(
  '/api/status/:bilik',
  async (c) => {

    const bilik = Number(
      c.req.param('bilik'),
    );

    if (
      !Number.isInteger(bilik) ||
      bilik < 1 ||
      bilik > BILIK_COUNT
    ) {
      return jsonError(
        c,
        400,
        'Bilik tidak valid.',
      );
    }


    const classes =
      bilikClasses(bilik);


    const rows =
      await c.env.DB
        .prepare(`
          SELECT
            name,
            class_name,
            attendance_number,
            has_voted,
            username,
            password_hash
          FROM students
          WHERE class_name IN (?, ?, ?)
          ORDER BY
            class_name,
            attendance_number
        `)
        .bind(...classes)
        .all<{
          name: string;
          class_name: string;
          attendance_number: number;
          has_voted: number;
          username: string | null;
          password_hash: string | null;
        }>();


    const data =
      rows.results.map(
        (student) => ({

          name: student.name,

          className:
            `${student.class_name} · ` +
            `Absen ${student.attendance_number}`,

          status:
            student.has_voted
              ? 'voted'
              : (
                  !student.username ||
                  !student.password_hash
                )
                ? 'error'
                : 'not_voted',

        }),
      );


    return c.json(data);
  },
);


// ============================================================
// HALAMAN LOGIN SISWA
// ============================================================

publicRoutes.get(
  '/',
  (c) => {

    const error =
      c.req.query('error');


    return c.html(
      layout(
        'Pemilihan OSIS',

        `
          <section class="hero">

            <div class="eyebrow">
              PEMILU OSIS PERIODE 2026/2027
            </div>

            <h1>
              Suaramu menentukan
              <br>
              masa depan OSIS.
            </h1>

            <p>
              Pemilihan Ketua & Wakil Ketua OSIS
              yang aman, anonim, dan transparan.
            </p>


            <form
              class="card"
              method="post"
              action="/login"
              autocomplete="off"
            >

              <!-- Honeypot -->
              <input
                type="text"
                name="hp_check"
                style="
                  position:absolute;
                  left:-9999px
                "
                tabindex="-1"
                autocomplete="off"
              >


              ${
                error
                  ? `
                    <div class="alert">
                      ${esc(error)}
                    </div>
                  `
                  : ''
              }


              <label>
                Username
              </label>

              <input
                name="username"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                required
                autofocus
              >


              <label>
                Password
              </label>

              <input
                type="password"
                name="password"
                autocomplete="new-password"
                required
              >


              <button
                style="
                  margin-top: 30px;
                  width: 70%;
                "
              >
                Masuk & Mulai Memilih
              </button>

            </form>

          </section>
        `,
      ),
    );
  },
);


// ============================================================
// LOGIN
// ============================================================

publicRoutes.post(
  '/login',
  async (c) => {

    const data = await body(c);

    const username =
      String(
        data.username || '',
      )
        .trim()
        .toLowerCase();


    const password =
      String(
        data.password || '',
      );


    const fail = (message: string) =>
      c.redirect(
        '/?error=' +
        encodeURIComponent(message),
      );


    if (!username || !password) {
      return fail(
        'Username dan password wajib diisi.',
      );
    }


    const key =
      await sha256(
        `${ip(c)}:${username}`,
      );


    const attempt =
      await c.env.DB
        .prepare(`
          SELECT
            attempts,
            window_started_at
          FROM login_attempts
          WHERE
            key_hash = ?
            AND window_started_at >
              datetime('now', '-15 minutes')
        `)
        .bind(key)
        .first<{
          attempts: number;
        }>();


    if (
      (attempt?.attempts ?? 0) >= 5
    ) {

      return c.html(
        layout(
          'Terlalu Banyak Percobaan',

          `
            <div class="card">

              <h1>
                Coba lagi nanti.
              </h1>

              <p>
                Terlalu banyak percobaan login.
              </p>

            </div>
          `,
        ),
        429,
      );
    }


    const student =
      await c.env.DB
        .prepare(`
          SELECT
            id,
            password_hash,
            has_voted
          FROM students
          WHERE username = ?
        `)
        .bind(username)
        .first<{
          id: number;
          password_hash: string | null;
          has_voted: number;
        }>();


    const validPassword =
      Boolean(
        student?.password_hash,
      ) &&
      await verifyPassword(
        password,
        student!.password_hash!,
      );


    if (!validPassword) {

      await c.env.DB
        .prepare(`
          INSERT INTO login_attempts(
            key_hash,
            attempts,
            window_started_at
          )
          VALUES (
            ?,
            1,
            CURRENT_TIMESTAMP
          )

          ON CONFLICT(key_hash)
          DO UPDATE SET

            attempts =
              CASE

                WHEN window_started_at <=
                  datetime(
                    'now',
                    '-15 minutes'
                  )

                THEN 1

                ELSE attempts + 1

              END,

            window_started_at =
              CASE

                WHEN window_started_at <=
                  datetime(
                    'now',
                    '-15 minutes'
                  )

                THEN CURRENT_TIMESTAMP

                ELSE window_started_at

              END
        `)
        .bind(key)
        .run();


      return fail(
        'Username atau password salah.',
      );
    }


    await c.env.DB
      .prepare(`
        DELETE FROM login_attempts
        WHERE key_hash = ?
      `)
      .bind(key)
      .run();


    if (student!.has_voted) {

      return fail(
        'Akun ini sudah digunakan untuk memilih.',
      );
    }


    const state =
      await electionState(c.env);


    if (state?.status !== 'OPEN') {

      return fail(
        'Pemilihan belum dibuka. ' +
        'Status saat ini: ' +
        (state?.status || '-'),
      );
    }


    const token =
      randomToken(32);


    const result =
      await c.env.DB
        .prepare(`
          UPDATE students
          SET qr_token_hash = ?
          WHERE
            id = ?
            AND has_voted = 0
        `)
        .bind(
          await sha256(token),
          student!.id,
        )
        .run();


    if (!result.meta.changes) {

      return fail(
        'Gagal memproses login. Coba lagi.',
      );
    }


    return c.redirect(
      `/vote?t=${encodeURIComponent(token)}`,
    );
  },
);
