/* eslint-disable @typescript-eslint/no-explicit-any */

import { Hono } from 'hono';
import type { Context } from 'hono';

import type { AppEnv } from '../types';

import { layout } from '../ui/layout';

import {
  body,
  esc,
  ip,
  jsonError,
} from '../utils/http';

import {
  createSession,
  destroySession,
  requireAdmin,
  requireCsrf,
} from '../auth/session';

import {
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from '../utils/crypto';

import { quickCount } from '../services/quick-count';

export const adminRoutes = new Hono<AppEnv>();


// ============================================================
// Helpers
// ============================================================

async function audit(
  c: Context<AppEnv>,
  action: string,
  target: string,
  metadata: Record<string, unknown> = {},
) {
  await c.env.DB
    .prepare(
      `
        INSERT INTO audit_logs (
          admin_id,
          action,
          target,
          metadata,
          ip_address
        )
        VALUES (?, ?, ?, ?, ?)
      `,
    )
    .bind(
      c.get('adminId') || null,
      action,
      target,
      JSON.stringify(metadata),
      ip(c),
    )
    .run();
}

const csrf = (c: Context<AppEnv>) => `
  <script>
    window.CSRF = ${JSON.stringify(c.get('csrfToken'))};

    document.addEventListener('submit', (event) => {
      const form = event.target;

      if (
        form.method?.toLowerCase() === 'post' &&
        !form.querySelector('[name="csrf"]')
      ) {
        const input = document.createElement('input');

        input.type = 'hidden';
        input.name = 'csrf';
        input.value = window.CSRF;

        form.append(input);
      }
    });
  </script>
`;

const validCsrf = async (c: Context<AppEnv>) => {
  const b = await body(c);

  const token =
    String(
      b.csrf ||
      c.req.header('X-CSRF-Token') ||
      '',
    );

  return {
    b,
    ok: token === c.get('csrfToken'),
  };
};


// ============================================================
// Authentication
// ============================================================

adminRoutes.get('/login', (c) =>
  c.html(
    layout(
      'Login Admin',
      `
        <form class="card" method="post">
          <div class="eyebrow">
            AREA PANITIA
          </div>

          <h1>Login Admin</h1>

          ${
            c.req.query('expired')
              ? `
                <div class="alert">
                  Sesi berakhir. Silakan login kembali.
                </div>
              `
              : ''
          }

          <label>Email</label>
          <input
            type="email"
            name="email"
            autocomplete="email"
            placeholder="admin@sekolah.sch.id"
            required
          />

          <label>Password</label>
          <input
            type="password"
            name="password"
            autocomplete="current-password"
            required
          />

          <button
            style="margin-top: 18px; width: 100%"
          >
            Masuk
          </button>
        </form>
      `,
    ),
  ),
);


adminRoutes.post('/login', async (c) => {
  const b = await body(c);

  const email = String(b.email || '')
    .trim()
    .toLowerCase();

  const password = String(b.password || '');

  const key = await sha256(
    `${ip(c)}:${email}`,
  );

  // ...
});


adminRoutes.post('/logout', async (c) => {
  const { ok } = await validCsrf(c);

  if (!ok) {
    return c.text('CSRF invalid', 403);
  }

  await audit(
    c,
    'LOGOUT',
    'admin',
  );

  await destroySession(c);

  return c.redirect('/admin/login');
});


// ============================================================
// Middleware
// ============================================================

adminRoutes.use('/*', requireAdmin);

adminRoutes.use('/*', async (c, next) => {
  const adminId = c.get('adminId');

  const admin = await c.env.DB
    .prepare(
      'SELECT role FROM admins WHERE id = ?',
    )
    .bind(adminId)
    .first<{ role: string }>();

  if (admin?.role === 'bilik') {
    return c.html(
      layout(
        'Akses Ditolak',
        `
          <div class="card">
            <h1>
              Akun ini tidak punya akses
              ke panel admin.
            </h1>

            <p>
              Silakan buka
              <a href="/status">/status</a>.
            </p>
          </div>
        `,
      ),
      403,
    );
  }

  await next();
});


// ============================================================
// Dashboard
// ============================================================

adminRoutes.get('/', async (c) => {
  const d = await quickCount(c.env);

  return c.html(
    layout(
      'Dashboard Admin',
      `
        <div class="eyebrow">
          DASHBOARD PANITIA
        </div>

        <h1>
          ${esc(d.electionName)}
        </h1>

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

        <div
          class="card"
          style="margin-top: 18px"
        >
          <h2>Status Sistem</h2>

          <p>
            Election:
            <span class="badge">
              ${esc(d.status)}
            </span>

            ·

            Quick Count:
            <span class="badge">
              ${d.enabled ? 'AKTIF' : 'NONAKTIF'}
            </span>
          </p>

          <div class="progress">
            <i
              style="width: ${d.turnoutPercentage}%"
            ></i>
          </div>

          <p>
            Integritas:

            <strong
              class="${d.integrity.valid ? 'ok' : 'bad'}"
            >
              ${
                d.integrity.valid
                  ? 'VALID'
                  : 'PERLU DIPERIKSA'
              }
            </strong>

            (${d.integrity.votedStudents}
            siswa memilih /
            ${d.integrity.totalVotes}
            suara)
          </p>
        </div>

        ${csrf(c)}
      `,
      {
        admin: true,
      },
    ),
  );
});
