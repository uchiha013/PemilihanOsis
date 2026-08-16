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
// ROUTER
// ============================================================

export const publicRoutes = new Hono<AppEnv>();


// ============================================================
// MIDDLEWARE
// ============================================================

publicRoutes.use('/quick-count');
publicRoutes.use('/api/public/quick-count');

publicRoutes.use('/status', requireAdmin);
publicRoutes.use('/status/*', requireAdmin);
publicRoutes.use('/api/status/*', requireAdmin);


// ============================================================
// CONFIG
// ============================================================

const BILIK_COUNT = 8;


// Sesuaikan format nama kelas jika diperlukan.
// Contoh:
// Bilik 1 -> X1, XI1, XII1
// Bilik 2 -> X2, XI2, XII2
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

publicRoutes.get('/status', (c) => {
    const links = Array.from(
        { length: BILIK_COUNT },
        (_, index) => index + 1,
    )
        .map(
            (n) => `
                <a class="btn" href="/status/${n}">
                    Bilik ${n}
                </a>
            `,
        )
        .join('');

    const html = `
        <div class="eyebrow">
            MONITOR ANTI-GOLPUT
        </div>

        <h1>Pilih Bilik</h1>

        <p>
            Bilik N memantau kelas XN, XIN, XIIN.
            Contoh: Bilik 1 memantau X1, XI1, XII1.
            Bilik Guru memantau data dengan kelas GURU.
        </p>

        <div
            class="actions"
            style="flex-wrap: wrap"
        >
            ${links}
            <a class="btn secondary" href="/status/guru">Bilik Guru</a>
        </div>
    `;

    return c.html(
        layout(
            'Status Bilik',
            html,
            {
                admin: true,
                bilik: true,
                csrfToken: c.get('csrfToken'),
            },
        ),
    );
});


publicRoutes.get('/status/guru', (c) => {
    const html = `
        <div class="eyebrow">MONITOR ANTI-GOLPUT · BILIK GURU</div>
        <h1>Status Pemilih — Guru</h1>
        <div class="grid" id="summary"></div>
        <div id="content" style="margin-top:18px"><div class="card">Memuat data...</div></div>
        <p id="updated" class="muted"></p>
        <script>
            const safe = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
            async function load() {
                try {
                    const response = await fetch('/api/status/guru');
                    if (!response.ok) throw new Error();
                    render(await response.json());
                    document.querySelector('#updated').textContent = 'Terakhir diperbarui: ' + new Date().toLocaleTimeString('id-ID');
                } catch {
                    document.querySelector('#updated').textContent = 'Koneksi terputus. Mencoba memperbarui kembali…';
                }
                setTimeout(load, 5000);
            }
            function render(rows) {
                const voted = rows.filter((teacher) => teacher.status === 'voted').length;
                const error = rows.filter((teacher) => teacher.status === 'error').length;
                document.querySelector('#summary').innerHTML = '<div class="card stat"><span>Total Guru</span><strong>' + rows.length + '</strong></div><div class="card stat"><span>Sudah Memilih</span><strong>' + voted + '</strong></div><div class="card stat"><span>Belum Memilih</span><strong>' + (rows.length - voted - error) + '</strong></div><div class="card stat"><span>Akun Belum Siap</span><strong>' + error + '</strong></div>';
                const labels = { voted: 'Sudah Memilih', error: 'Akun Belum Siap', not_voted: 'Belum Memilih' };
                const icons = { voted: '✅', error: '⚠️', not_voted: '❌' };
                const rowsHtml = rows.map((teacher) => '<tr><td style="font-size:22px">' + icons[teacher.status] + '</td><td>' + safe(teacher.name) + '</td><td>' + safe(teacher.className) + '</td><td>' + labels[teacher.status] + '</td></tr>').join('');
                document.querySelector('#content').innerHTML = rows.length ? '<div class="table-wrap"><table><thead><tr><th></th><th>Nama</th><th>Keterangan</th><th>Status</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' : '<div class="card">Belum ada data guru.</div>';
            }
            load();
        </script>
    `;
    return c.html(layout('Status Bilik Guru', html, { admin: true, bilik: true, wide: true, csrfToken: c.get('csrfToken') }));
});

publicRoutes.get('/status/:bilik', (c) => {
    const bilik = Number(c.req.param('bilik'));

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

    const html = `
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
                    (character) => ({
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;',
                        "'": '&#39;',
                    }[character])
                );

            async function load() {
                try {
                    const response = await fetch(
                        '/api/status/' + bilik
                    );

                    if (!response.ok) {
                        throw new Error();
                    }

                    const rows = await response.json();

                    render(rows);

                    document.querySelector('#updated')
                        .textContent =
                        'Terakhir diperbarui: ' +
                        new Date().toLocaleTimeString('id-ID');

                } catch (error) {
                    document.querySelector('#updated')
                        .textContent =
                        'Koneksi terputus. ' +
                        'Mencoba memperbarui kembali…';
                }

                setTimeout(load, 5000);
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

                const voted = rows.filter(
                    (student) => student.status === 'voted'
                ).length;

                const error = rows.filter(
                    (student) => student.status === 'error'
                ).length;

                document.querySelector('#summary')
                    .innerHTML = \`
                        <div class="card stat">
                            <span>Total Siswa</span>
                            <strong>\${rows.length}</strong>
                        </div>

                        <div class="card stat">
                            <span>Sudah Memilih</span>
                            <strong>\${voted}</strong>
                        </div>

                        <div class="card stat">
                            <span>Belum Memilih</span>
                            <strong>
                                \${rows.length - voted - error}
                            </strong>
                        </div>

                        <div class="card stat">
                            <span>Akun Belum Siap</span>
                            <strong>\${error}</strong>
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

                document.querySelector('#content')
                    .innerHTML = rows.length
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
    `;

    return c.html(
        layout(
            `Status Bilik ${bilik}`,
            html,
            {
                admin: true,
                bilik: true,
                wide: true,
                csrfToken: c.get('csrfToken'),
            },
        ),
    );
});


// ============================================================
// API — STATUS BILIK
// ============================================================

publicRoutes.get('/api/status/guru', async (c) => {
    const rows = await c.env.DB.prepare(`
        SELECT name, class_name, attendance_number, has_voted, username, password_hash
        FROM students
        WHERE UPPER(class_name) = 'GURU'
        ORDER BY attendance_number
    `).all<{
        name: string;
        attendance_number: number;
        has_voted: number;
        username: string | null;
        password_hash: string | null;
    }>();
    return c.json(rows.results.map((teacher) => ({
        name: teacher.name,
        className: `Guru · No. ${teacher.attendance_number}`,
        status: teacher.has_voted ? 'voted' : (!teacher.username || !teacher.password_hash) ? 'error' : 'not_voted',
    })));
});

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

        const classes = bilikClasses(bilik);

        const rows = await c.env.DB
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

        const data = rows.results.map(
            (student) => ({
                name: student.name,

                className:
                    `${student.class_name} · ` +
                    `Absen ${student.attendance_number}`,

                status:
                    student.has_voted
                        ? 'voted'
                        : !student.username ||
                          !student.password_hash
                            ? 'error'
                            : 'not_voted',
            }),
        );

        return c.json(data);
    },
);


// ============================================================
// LOGIN PAGE
// ============================================================

publicRoutes.get('/', (c) => {
    const error = c.req.query('error');

    const html = `
        <section class="hero login-hero">

            <img
                class="login-banner"
                src="/images/homepage.jpeg"
                alt="Poster Pemilihan Ketua dan Wakil Ketua OSIS 2026/2027"
            >

            <div class="eyebrow">
                PEMILU OSIS PERIODE 2026/2027
            </div>

            <h1>
                Suara Anda menentukan<br>
                masa depan AUDEAMUS.
            </h1>

            <p>
                Pemilihan Ketua & Wakil Ketua OSIS Periode 2026/2027 
                dengan sistem daring dengan jaminan keamanan dan kerahasiaan suara.
            </p>

            <form
                class="card"
                method="post"
                action="/login"
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
                    id="public-inputtext"
                    name="username"
                    autocomplete="username"
                    placeholder="Masukkan username Anda"
                    required
                    autofocus
                >

                <label>
                    Password
                </label>

                <input
                    id="public-inputtext"
                    type="password"
                    name="password"
                    autocomplete="current-password"
                    placeholder="Masukkan password Anda"
                    required
                >

                <button
                    style="margin-top: 25px; width: 60%"
                >
                    Masuk & Mulai Memilih
                </button>

            </form>

        </section>
    `;

    return c.html(
        layout(
            'Pemilihan OSIS',
            html,
            { login: true },
        ),
    );
});


// ============================================================
// LOGIN PROCESS
// ============================================================

publicRoutes.post('/login', async (c) => {
    const data = await body(c);

    const username = String(
        data.username || '',
    )
        .trim()
        .toLowerCase();

    const password = String(
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

    const key = await sha256(
        `${ip(c)}:${username}`,
    );

    const attempt = await c.env.DB
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

    if ((attempt?.attempts ?? 0) >= 5) {
        return c.html(
            layout(
                'Terlalu Banyak Percobaan',
                `
                    <div class="card">
                        <h1>Coba lagi nanti.</h1>

                        <p>
                            Terlalu banyak percobaan login.
                        </p>
                    </div>
                `,
            ),
            429,
        );
    }

    const student = await c.env.DB
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

    const ok =
        Boolean(student?.password_hash) &&
        await verifyPassword(
            password,
            student!.password_hash!,
        );

    if (!ok) {
        await c.env.DB
            .prepare(`
                INSERT INTO login_attempts (
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

    const state = await electionState(
        c.env,
    );

    if (state?.status !== 'OPEN') {
        return fail(
            'Pemilihan belum dibuka. ' +
            'Status saat ini: ' +
            (state?.status || '-'),
        );
    }

    const token = randomToken(32);

    const result = await c.env.DB
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
});


// ============================================================
// VOTING PAGE
// ============================================================

publicRoutes.get('/vote', async (c) => {
    const token =
        c.req.query('t') || '';

    const voter = await findVoter(
        c.env,
        token,
    );

    const state = await electionState(
        c.env,
    );

    if (!voter) {
        return c.html(
            layout(
                'QR Tidak Valid',
                `
                    <div class="card">
                        <h1>
                            QR Code tidak valid.
                        </h1>

                        <p>
                            QR mungkin sudah diganti
                            atau tidak dikenali.
                        </p>
                    </div>
                `,
            ),
            404,
        );
    }

    if (voter.has_voted) {
        return c.html(
            layout(
                'Sudah Memilih',
                `
                    <div class="card">
                        <h1>
                            Anda sudah menggunakan
                            hak suara.
                        </h1>
                    </div>
                `,
            ),
            409,
        );
    }

    if (state?.status !== 'OPEN') {
        return c.html(
            layout(
                'Pemilihan Ditutup',
                `
                    <div class="card">
                        <h1>
                            Pemilihan belum tersedia.
                        </h1>

                        <p>
                            Status saat ini:
                            ${esc(state?.status)}
                        </p>
                    </div>
                `,
            ),
            403,
        );
    }

    const candidates = await c.env.DB
        .prepare(`
            SELECT *
            FROM candidates
            ORDER BY candidate_number
        `)
        .all<Record<string, unknown>>();

    const cards = candidates.results
        .map((candidate) => {
            const candidateNumber =
                String(
                    candidate.candidate_number,
                ).padStart(2, '0');

            const names =
                `${candidate.chairman_name} & ` +
                `${candidate.vice_chairman_name}`;

            return `
                <article class="card candidate">

                    <div class="num">
                        ${candidateNumber}
                    </div>

                    <img
                        src="${esc(
                            String(
                                candidate.photo_url ||
                                    `/images/paslon${candidateNumber}.jpeg`,
                            ),
                        )}"
                        alt="Foto paslon ${esc(
                            candidateNumber,
                        )}"
                    >

                    <h2>
                        ${esc(
                            String(
                                candidate.chairman_name,
                            ),
                        )}

                        <br>

                        &amp;

                        <br>

                        ${esc(
                            String(
                                candidate.vice_chairman_name,
                            ),
                        )}
                    </h2>

                    <details>
                        <summary>
                            Visi & Misi
                        </summary>

                        <p>
                            ${esc(
                                String(
                                    candidate.vision,
                                ),
                            )}
                        </p>

                        <p>
                            ${esc(
                                String(
                                    candidate.mission,
                                ),
                            )}
                        </p>
                    </details>

                    <button
                        onclick="pick(
                            ${Number(candidate.id)},
                            '${esc(candidateNumber)}',
                            '${esc(names)}'
                        )"
                    >
                        Pilih ${candidateNumber}
                    </button>

                </article>
            `;
        })
        .join('');

    const html = `
        <div class="eyebrow">
            PEMILIHAN KETUA & WAKIL KETUA OSIS
        </div>

        <h1>
            Gunakan hak suara Anda
        </h1>

        <div class="card voter-info">
            <strong>
                ${esc(voter.name)}
            </strong>

            · ${esc(voter.class_name)}

            · Absen ${voter.attendance_number}
        </div>

        <div
            class="grid"
            style="margin-top: 20px"
        >
            ${cards}
        </div>

        <dialog id="confirm">

            <h2>
                Konfirmasi pilihan
            </h2>

            <p>
                Anda memilih
                <strong id="choice"></strong>.
            </p>

            <p class="alert">
                Pilihan tidak dapat diubah
                setelah dikirim.
            </p>

            <div class="actions">

                <button
                    class="secondary"
                    onclick="confirm.close()"
                >
                    Kembali
                </button>

                <button id="send">
                    Kirim Suara
                </button>

            </div>

        </dialog>

        <script>
            let selected;

            const confirm =
                document.querySelector('#confirm');

            function pick(
                id,
                number,
                names
            ) {
                selected = id;

                document.querySelector(
                    '#choice'
                ).textContent =
                    'PASLON ' +
                    number +
                    ' — ' +
                    names;

                confirm.showModal();
            }

            document.querySelector(
                '#send'
            ).onclick = async () => {

                const button =
                    document.querySelector('#send');

                button.disabled = true;

                const response = await fetch(
                    '/api/vote',
                    {
                        method: 'POST',

                        headers: {
                            'content-type':
                                'application/json',
                        },

                        body: JSON.stringify({
                            token:
                                ${JSON.stringify(token)},

                            candidateId:
                                selected,
                        }),
                    },
                );

                if (response.ok) {
                    location.replace(
                        '/success'
                    );

                    return;
                }

                const json =
                    await response.json();

                alert(
                    json.error ||
                    'Suara gagal dikirim',
                );

                button.disabled = false;
            };
        </script>
    `;

    return c.html(
        layout(
            'Pilih Paslon',
            html,
        ),
    );
});


// ============================================================
// API — CAST VOTE
// ============================================================

publicRoutes.post(
    '/api/vote',
    async (c) => {
        const data = await body(c);

        const token =
            String(data.token || '');

        const candidateId =
            Number(data.candidateId);

        if (!Number.isInteger(candidateId)) {
            return jsonError(
                c,
                400,
                'Pilihan tidak valid.',
            );
        }

        const success =
            await castAnonymousVote(
                c.env,
                token,
                candidateId,
            );

        if (!success) {
            return jsonError(
                c,
                409,
                'Suara tidak dapat diproses. ' +
                'Token mungkin sudah digunakan ' +
                'atau pemilihan tidak dibuka.',
            );
        }

        return c.json({
            ok: true,
        });
    },
);


// ============================================================
// SUCCESS PAGE
// ============================================================

publicRoutes.get('/success', (c) => {
    const html = `
        <section class="hero">

            <div class="eyebrow ok">
                SUARA TEREKAM
            </div>

            <h1>
                Terima kasih.
            </h1>

            <p>
                Suara Anda telah berhasil direkam.
            </p>

            <p
                id="countdown"
                class="muted"
            >
                Kembali ke halaman utama dalam 5 detik.
            </p>

            <div class="actions">
                <a
                    class="btn"
                    href="/"
                >
                    Selesai
                </a>
            </div>

        </section>

        <script>
            history.replaceState(
                null,
                '',
                '/success'
            );

            let seconds = 5;
            const countdown = document.querySelector('#countdown');
            const timer = setInterval(() => {
                seconds -= 1;

                if (seconds <= 0) {
                    clearInterval(timer);
                    location.replace('/');
                    return;
                }

                countdown.textContent =
                    'Kembali ke halaman utama dalam ' +
                    seconds +
                    ' detik.';
            }, 1000);
        </script>
    `;

    return c.html(
        layout(
            'Terima Kasih',
            html,
        ),
    );
});


// ============================================================
// QUICK COUNT API
// ============================================================

publicRoutes.get(
    '/api/public/quick-count',
    async (c) => {
        const data =
            await quickCount(c.env);

        c.header(
            'Cache-Control',
            'public, max-age=3',
        );

        if (!data.enabled) {
            return c.json({
                enabled: false,
                status: data.status,
                electionName:
                    data.electionName,
                schoolName:
                    data.schoolName,
            });
        }

        if (
            data.mode ===
            'PARTICIPATION_ONLY'
        ) {
            return c.json({
                ...data,
                candidates: [],
            });
        }

        if (
            data.mode ===
            'PERCENTAGE_ONLY'
        ) {
            return c.json({
                ...data,

                candidates:
                    data.candidates.map(
                        ({
                            votes: _,
                            chairmanName: _chairmanName,
                            viceChairmanName: _viceChairmanName,
                            ...candidate
                        }) => candidate,
                    ),
            });
        }

        return c.json(data);
    },
);


// ============================================================
// QUICK COUNT PAGE
// ============================================================

publicRoutes.get(
    '/quick-count',
    (c) => {
        const screen =
            c.req.query('display') ===
            'screen';

        const html = `
            <style>
                #content .card { background: #fff; }
                #content .card h2, #content .card span, #content .card p, #content .card strong { color: var(--slate-600); }
                .race-bar { display:flex; height:56px; border-radius:12px; overflow:hidden; margin-top:14px; box-shadow:var(--shadow-sm); }
                .race-seg { display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:15px; min-width:2px; transition:width .6s ease; }
                .race-legend { display:flex; flex-wrap:wrap; gap:14px; margin-top:16px; justify-content:center; }
                .race-legend span { display:flex; align-items:center; gap:8px; font-weight:700; color:var(--navy); font-size:14px; }
                .race-legend i { width:14px; height:14px; border-radius:4px; display:inline-block; }
            </style>
            <section
                class="${screen ? 'screen' : ''}"
            >

                <div class="eyebrow" id="live">
                    ● LIVE
                </div>

                <h1 id="title">
                    QUICK COUNT
                </h1>

                <p
                    id="school"
                    class="muted"
                ></p>

                <div
                    id="content"
                    class="grid"
                >
                    <div class="card">
                        Memuat hasil...
                    </div>
                </div>

                <p
                    id="updated"
                    class="muted"
                ></p>

            </section>

            <script>
                let last;
                const RACE_COLORS = ['#16a34a', '#38bdf8', '#f59e0b', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171'];

                async function load() {
                    try {
                        const response =
                            await fetch(
                                '/api/public/quick-count'
                            );

                        if (!response.ok) {
                            throw new Error();
                        }

                        const data =
                            await response.json();

                        last = data;

                        render(data);

                    } catch (error) {
                        document.querySelector(
                            '#updated'
                        ).textContent =
                            'Koneksi terputus. ' +
                            'Mencoba memperbarui kembali…';
                    }

                    setTimeout(
                        load,
                        Math.max(
                            3000,
                            (last?.refreshInterval || 5) *
                                1000
                        )
                    );
                }

                function render(data) {
                    document.querySelector(
                        '#title'
                    ).textContent =
                        data.status === 'CLOSED'
                            ? 'HASIL AKHIR'
                            : 'QUICK COUNT — HASIL SEMENTARA';

                    document.querySelector(
                        '#school'
                    ).textContent =
                        data.schoolName || '';

                    const content =
                        document.querySelector(
                            '#content'
                        );

                    const updated =
                        document.querySelector(
                            '#updated'
                        );

                    if (!data.enabled) {
                        content.innerHTML = \`
                            <div class="card">
                                <h2>
                                    Quick Count
                                    belum tersedia
                                </h2>
                            </div>
                        \`;

                        return;
                    }

                    let html = \`
                        <div class="card stat">
                            <span>
                                Total Pemilih
                            </span>

                            <strong>
                                \${data.totalStudents}
                            </strong>
                        </div>

                        <div class="card stat">
                            <span>
                                Suara Masuk
                            </span>

                            <strong>
                                \${data.totalVotes}
                            </strong>
                        </div>

                        <div class="card stat">
                            <span>
                                Partisipasi
                            </span>

                            <strong>
                                \${data.turnoutPercentage}%
                            </strong>

                            <div class="progress">
                                <i
                                    style="
                                        width:
                                            \${data.turnoutPercentage}%
                                    "
                                ></i>
                            </div>
                        </div>
                    \`;

                    const percentOnly = data.candidates.length > 0 && data.candidates[0].chairmanName === undefined && data.candidates[0].percentage !== undefined;
                    if (percentOnly) {
                        html += '<div class="card" style="grid-column:1/-1"><h2 style="text-align:center">Perolehan Sementara</h2><div class="race-bar">' + data.candidates.map((candidate, index) => '<div class="race-seg" style="width:' + (candidate.percentage || 0) + '%;background:' + RACE_COLORS[index % RACE_COLORS.length] + '">' + ((candidate.percentage || 0) >= 8 ? candidate.percentage + '%' : '') + '</div>').join('') + '</div><div class="race-legend">' + data.candidates.map((candidate, index) => '<span><i style="background:' + RACE_COLORS[index % RACE_COLORS.length] + '"></i>' + (candidate.percentage || 0) + '%</span>').join('') + '</div></div>';
                    } else for (
                        const candidate
                        of data.candidates
                    ) {
                        html += \`
                            <div class="card candidate">
                                \${candidate.percentage !== undefined
                                    ? \`
                                        <strong
                                            style="
                                                font-size: 38px
                                            "
                                        >
                                            \${candidate.percentage}%
                                        </strong>
                                    \`
                                    : ''
                                }

                                \${candidate.votes !== undefined
                                    ? \`
                                        <p>
                                            \${candidate.votes}
                                            suara
                                        </p>
                                    \`
                                    : ''
                                }

                            </div>
                        \`;
                    }

                    content.innerHTML = html;

                    updated.textContent =
                        'Terakhir diperbarui: ' +
                        new Date()
                            .toLocaleTimeString(
                                'id-ID'
                            );
                }

                load();
            </script>
        `;

        return c.html(
            layout(
                'Quick Count',
                html,
                {
                    wide: screen,
                },
            ),
        );
    },
);
