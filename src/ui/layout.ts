import { esc } from '../utils/http';

export function layout(
  title: string,
  content: string,
  opts: { admin?: boolean; wide?: boolean; csrfToken?: string } = {},
) {
  return `
    <!doctype html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>${esc(title)}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>${css}</style>
      </head>

      <body class="${opts.admin ? 'admin-theme' : ''}">
        <!-- Background Glowing Particles (Pure CSS) -->
        <div class="bg-glow"></div>

        <header>
          <a href="/" class="brand">
            THE NEXT <span>AUDEAMUS</span>
          </a>

          ${
            opts.admin
              ? `
                <nav>
                  <a href="/admin">Dashboard</a>
                  <a href="/admin/students">Siswa</a>
                  <a href="/admin/students/manage">CRUD Siswa</a>
                  <a href="/admin/candidates">Kandidat</a>
                  <a href="/admin/results">Hasil</a>
                  <a href="/quick-count">Quick Count</a>
                  <a href="/status">Status Bilik</a>
                  <a href="/admin/settings">Pengaturan</a>
                  <a href="/admin/audit">Audit</a>
                  <form method="post" action="/admin/logout" style="display:inline;margin:0">
                    <input type="hidden" name="csrf" value="${esc(opts.csrfToken || '')}">
                    <button class="secondary" style="padding:8px 14px;font-size:14px">Logout</button>
                  </form>
                </nav>
              `
              : ''
          }
        </header>

        <main class="${opts.wide ? 'wide' : ''} ${opts.admin ? 'admin-page' : ''}">
          ${content}
        </main>

        <script>
          if (location.pathname === '/admin/students/import') {
            const importButton = document.getElementById('send');
            importButton.addEventListener('click', async (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
              importButton.disabled = true;
              const size = 2;
              try {
                for (let i = 0; i < rows.length; i += size) {
                  importButton.textContent = 'Mengimpor ' + Math.min(i + size, rows.length) + '/' + rows.length + '…';
                  const response = await fetch('/admin/api/students/import', {
                    method: 'POST', headers: {'content-type': 'application/json', 'X-CSRF-Token': CSRF}, body: JSON.stringify({rows: rows.slice(i, i + size)})
                  });
                  const text = await response.text();
                  let data = {};
                  try { data = JSON.parse(text); } catch {}
                  if (!response.ok) throw Error(data.error || 'Server gagal memproses batch ini (HTTP ' + response.status + ').');
                }
                location = '/admin/students';
              } catch (error) {
                statusBox.textContent = error.message || 'Import gagal.';
                importButton.disabled = false;
                importButton.textContent = 'Upload & Import Siswa';
              }
            });
          }
        </script>

        <footer>
          <p>Dibuat oleh <strong>Manuel Kristo Jaftoran</strong> &bull; <strong>Xavier Cedric XI-3</strong> &bull; <strong>Evan Wangsaputra XI-2</strong></p>
        </footer>
      </body>
    </html>
  `;
}

const css = `
  :root {
    --primary: #a31616;
    --primary-hover: #801515;
    --primary-light: #dcfce7;
    --button: #b21717;
    --navy: #ffffff;
    --slate-800: #1e293b;
    --slate-600: #475569;
    --slate-400: #94a3b8;
    --slate-100: #f1f5f9;
    --sky: #38bdf8;
    --red: #ef4444;
    --red-light: #fef2f2;
    --amber: #f59e0b;
    
    --radius-sm: 8px;
    --radius-md: 14px;
    --radius-lg: 20px;
    --radius-full: 9999px;
    
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08);
    --shadow-glow: 0 0 20px rgba(255, 148, 148, 0.35);
  }

  * {
    box-sizing: border-box;
    transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
  }

  body {
    margin: 0;
    padding: 0;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    color: var(--navy);
    min-height: 100vh;
    background: #06150b;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    position: relative;
  }

  /* Halaman admin: background terang, bukan hijau gelap + partikel.
     Halaman publik (beranda, quick count proyektor) tetap seperti semula. */
  body.admin-theme {
    background: #f5f8fb;
  }
  body.admin-theme .bg-glow {
    display: none;
  }

  /* =========================
     PURE CSS BACKGROUND ANIMATION
     ========================= */

  .bg-glow {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background: 
      radial-gradient(circle at 20% 20%, rgba(197, 34, 34, 0.7) 0%, transparent 40%),
      radial-gradient(circle at 80% 80%, rgba(248, 56, 56, 0.65) 0%, transparent 40%),
      radial-gradient(circle at 50% 50%, rgba(128, 21, 21, 0.55) 0%, transparent 60%);
    background-size: 200% 200%;
    animation: gradient-move 12s ease infinite alternate;
  }

  /* Dot Partikel Murni CSS menggunakan radial-gradient */
  .bg-glow::before,
  .bg-glow::after {
    content: "";
    position: absolute;
    inset: 0;
    background-image: 
      radial-gradient(3px 3px at 20px 30px, rgba(74, 222, 128, 0.8), transparent),
      radial-gradient(4px 4px at 40px 70px, rgba(56, 189, 248, 0.6), transparent),
      radial-gradient(2px 2px at 90px 40px, rgba(255, 255, 255, 0.9), transparent),
      radial-gradient(3px 3px at 160px 120px, rgba(74, 222, 128, 0.7), transparent),
      radial-gradient(4px 4px at 230px 190px, rgba(56, 189, 248, 0.8), transparent),
      radial-gradient(3px 3px at 310px 80px, rgba(74, 222, 128, 0.6), transparent);
    background-repeat: repeat;
    background-size: 350px 350px;
  }

  .bg-glow::before {
    animation: float-up-pure 8s linear infinite;
  }

  .bg-glow::after {
    background-position: 100px 150px;
    animation: float-up-pure 14s linear infinite reverse;
    opacity: 0.6;
  }

  @keyframes float-up-pure {
    0% {
      transform: translateY(0) scale(0.9);
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
    100% {
      transform: translateY(-150px) scale(1.1);
      opacity: 0.2;
    }
  }

  @keyframes gradient-move {
    0% { background-position: 0% 50%; }
    100% { background-position: 100% 50%; }
  }

  @keyframes flow-up {
    0% {
      transform: translateY(40px);
      opacity: 0;
    }
    100% {
      transform: translateY(0);
      opacity: 1;
    }
  }

  /* =========================
     HEADER & NAVIGATION
     ========================= */

  header {
    height: 72px;
    background: rgba(21, 6, 6, 0.75);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(197, 34, 34, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 max(4vw, 24px);
    position: sticky;
    top: 0;
    z-index: 50;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
  }

  .brand {
    font-size: 20px;
    font-weight: 800;
    color: #ffffff;
    text-decoration: none;
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    gap: 6px;
    text-shadow: 0 0 12px rgba(255, 255, 255, 0.1);
  }

  .brand span {
    background: linear-gradient(-135deg, #d00000 0%, #32f339 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 2px 8px rgba(255, 255, 255, 0.3));
  }

  .brand-logo {
    height: 32px; 
    width: auto;
    object-fit: contain;
    filter: drop-shadow(0 0 6px rgba(34, 197, 94, 0.4)); /* Efek glow tipis biar makin keren */
}

  nav {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding: 4px;
    scrollbar-width: thin;
    scrollbar-color: rgba(34, 197, 94, 0.3) transparent;
  }

  nav a {
    color: var(--slate-400);
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    border: 1px solid transparent;
  }

  nav a:hover {
    color: #ffffff;
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.3);
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.2);
  }

  /* =========================
     MAIN CONTENT
     ========================= */

  main {
    max-width: 1100px;
    width: 100%;
    margin: 36px auto;
    padding: 0 24px;
    flex: 1;
    position: relative;
    z-index: 1;
  }

  main.wide {
    max-width: 1400px;
  }

  footer {
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
    padding: 16px 12px;
    font-size: 14px;
    position: relative;
    z-index: 1;
  }

  footer strong {
    color: #fff;
    font-weight: 600;
  }

  /* Footer di halaman admin ada di atas background terang, bukan gelap
     — jadi ikut digelapkan supaya tetap terbaca. */
  body.admin-theme footer {
    color: var(--slate-600);
  }
  body.admin-theme footer strong {
    color: var(--navy);
  }

  /* =========================
     TYPOGRAPHY & HERO
     ========================= */

  h1 {
    font-size: clamp(32px, 5vw, 54px);
    font-weight: 800;
    line-height: 1.1;
    color: #ffffff;
    letter-spacing: -0.03em;
    margin: 0.3em 0;
    text-shadow: 0 2px 10px rgba(0,0,0,0.2);
  }

  /* h1 admin ada langsung di atas background (bukan di dalam kartu),
     jadi ikut digelapkan supaya tidak hilang di background terang. */
  .admin-page h1 {
    color: var(--navy);
    text-shadow: none;
  }

  h2 {
    color: var(--navy);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-top: 0;
  }

  .eyebrow {
    background: linear-gradient(135deg, #4ade80 0%, #38bdf8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 2px 8px rgba(34, 197, 94, 0.3));
    font-weight: 800;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    display: inline-block;
  }

  #live {
    background: linear-gradient(135deg, #ef4444 0%, #f97316 100%) !important;
    -webkit-background-clip: text !important;
    -webkit-text-fill-color: transparent !important;
    filter: drop-shadow(0 2px 8px rgba(34, 197, 94, 0.3)) !important;
    font-weight: 800 !important;
    font-size: 13px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.15em !important;
    display: inline-block !important;
  }

  .hero {
    text-align: center;
    padding: 2vh 2vw;
    max-width: 800px;
    margin: 0 auto;
    animation: flow-up 1.2s ease-out forwards;
  }

  .hero p {
    font-size: 18px;
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.6;
    margin-bottom: 40px;
  }

  /* =========================
     BUTTONS & ACTIONS
     ========================= */

  .actions {
    display: flex;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 32px;
  }

  .btn,
  button {
    appearance: none;
    border: 2px solid transparent;
    outline: none;
    border-radius: var(--radius-md);
    padding: 12px 24px;
    font-weight: 700;
    font-size: 14px;
    font-family: inherit;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--primary);
    color: white;
    box-shadow: var(--shadow-md), 0 2px 4px rgba(22, 163, 74, 0.2);
    transition: 0.3s ease;
  }

  .btn:hover,
  button:hover {
    background: transparent;
    box-shadow: var(--shadow-lg), var(--shadow-glow);
    border: 2px solid var(--button);
    box-sizing: border-box;
    color: var(--button);
  }

  .btn:active,
  button:active {
    transform: translateY(0);
  }

  .btn.secondary,
  button.secondary {
    background: rgba(255, 255, 255, 0.9);
    color: var(--navy);
    box-shadow: var(--shadow-sm);
    border: 1px solid rgba(0, 0, 0, 0.05);
  }

  .btn.secondary:hover,
  button.secondary:hover {
    background: #ffffff;
    color: var(--primary-hover);
    box-shadow: var(--shadow-md);
  }

  .btn.danger,
  button.danger {
    background: var(--red);
    box-shadow: var(--shadow-md), 0 2px 4px rgba(239, 68, 68, 0.2);
  }

  .btn.danger:hover,
  button.danger:hover {
    background: #dc2626;
  }

  /* =========================
     GRID & CARD
     ========================= */

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
  }

  .card {
    background: rgba(48, 0, 0, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(254, 255, 254, 1);
    border-radius: var(--radius-lg);
    padding: 28px;
    margin-top: 20px;
    padding-top: 8px;
    box-shadow: var(--shadow-lg);
  }

  /* Halaman admin pakai kartu terang — teks di dalamnya (h2, angka .stat,
     label polos, dsb) didesain untuk background terang, jadi kartu gelap
     bikin teks nyaris tak kelihatan. Halaman publik (beranda, quick count
     proyektor) tetap pakai kartu gelap sesuai desain aslinya. */
  .admin-page .card {
    background: #ffffff;
    border: 1px solid var(--slate-100);
  }

  .stat strong {
    font-size: 42px;
    font-weight: 800;
    color: #ffffff;
    display: block;
    line-height: 1.1;
    letter-spacing: -0.03em;
  }

  /* =========================
     STATUS & BADGES
     ========================= */

  .muted { color: var(--slate-400); }
  .ok { color: var(--primary); font-weight: 600; }
  .bad { color: var(--red); font-weight: 600; }

  .alert {
    padding: 16px 20px;
    border-radius: var(--radius-md);
    background: #fffbeb;
    border: 1px solid #fef3c7;
    color: #92400e;
    font-weight: 500;
    margin: 20px 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: var(--radius-full);
    background: var(--slate-100);
    color: var(--slate-600);
    font-weight: 700;
    font-size: 12px;
  }

  .badge.green {
    background: var(--primary-light);
    color: #15803d;
  }

  .badge.red {
    background: var(--red-light);
    color: #b91c1c;
  }

  /* =========================
     PROGRESS BAR
     ========================= */

  .progress {
    height: 10px;
    background: var(--slate-100);
    border-radius: var(--radius-full);
    overflow: hidden;
    padding: 2px;
  }

  .progress i {
    display: block;
    height: 100%;
    border-radius: var(--radius-full);
    background: linear-gradient(90deg, var(--primary), #38bdf8);
  }

  /* =========================
     FORM ELEMENTS
     ========================= */

  label {
    font-weight: 700;
    font-size: 14px;
    color: #ffffffcc;
    display: block;
    margin: 16px 0 6px;
  }

  /* Label form di halaman admin ada di atas kartu putih, bukan kartu
     hijau gelap — jadi ikut digelapkan supaya tidak hilang seperti h1. */
  .admin-page label {
    color: var(--navy);
  }

  input,
  select,
  textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1.5px solid #e2e8f0;
    border-radius: var(--radius-md);
    background: #ffffff;
    font-family: 'Courier New', 'Courier', monospace;
    font-size: 14px;
    color: var(--navy);
    transition: .25s;
  }

  #public-inputtext {
    width: 95%;
  }

  #public-inputtext:focus {
    width: 100%;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 4px rgba(197, 34, 34, 0.15);
  }

  textarea {
    min-height: 120px;
    resize: vertical;
  }

  form.card {
    max-width: 440px;
    margin: 0 auto;
  }

  /* =========================
     TABLES
     ========================= */

  .table-wrap {
    overflow: hidden;
    border-radius: var(--radius-lg);
    border: 1px solid rgba(255, 255, 255, 0.4);
    box-shadow: var(--shadow-lg);
    background: white;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: white;
  }

  th,
  td {
    text-align: left;
    padding: 16px 20px;
    border-bottom: 1px solid var(--slate-100);
    font-size: 14px;
  }

  th {
    background: #f8fafc;
    color: var(--slate-600);
    font-weight: 700;
    text-transform: uppercase;
    font-size: 12px;
    letter-spacing: 0.05em;
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover td {
    background: #f8fafc;
  }

  /* =========================
     CANDIDATE CARD
     ========================= */

  .candidate {
    text-align: center;
    position: relative;
    overflow: hidden;
  }

  .candidate::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 6px;
    background: linear-gradient(90deg, var(--primary), var(--sky));
  }

  .candidate img {
    width: 130px;
    height: 130px;
    object-fit: cover;
    border-radius: 50%;
    background: var(--slate-100);
    border: 4px solid #ffffff;
    box-shadow: var(--shadow-md);
    margin-bottom: 12px;
  }

  .num {
    font-size: 36px;
    font-weight: 800;
    color: var(--primary);
    line-height: 1;
    margin-bottom: 8px;
  }

  /* =========================
     DIALOG & MODALS
     ========================= */

  dialog {
    border: none;
    border-radius: var(--radius-lg);
    padding: 32px;
    max-width: 480px;
    width: 90%;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    background: white;
  }

  dialog::backdrop {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(4px);
  }

  /* =========================
     SCREEN & RESPONSIVE
     ========================= */

  .screen h1 {
    font-size: clamp(36px, 6vw, 72px);
  }

  .screen .stat strong {
    font-size: clamp(36px, 6vw, 72px);
  }

  @media (max-width: 768px) {
    header {
      height: auto;
      align-items: stretch;
      gap: 12px;
      padding: 16px;
      flex-direction: column;
    }

    nav {
      width: 100%;
      padding-bottom: 4px;
    }

    main {
      margin-top: 16px;
      padding: 0 16px;
    }

    th,
    td {
      padding: 12px 14px;
    }

    .hide-mobile {
      display: none;
    }
  }
`;