# Sistem Pemilihan Ketua & Wakil Ketua OSIS

Aplikasi Cloudflare Workers + D1 dengan QR siswa, surat suara anonim, anti-double-vote di database, dashboard panitia, dan Quick Count agregat. UI responsif untuk HP, laptop, TV, dan proyektor.

## Jaminan privasi dan integritas

- `students` menyimpan identitas, hash token QR, dan status partisipasi.
- `votes` hanya menyimpan kandidat dan waktu—tanpa `student_id`, token, kelas, absen, atau IP.
- Pengiriman suara memakai satu D1 batch atomik: insert anonim hanya untuk siswa eligible, lalu siswa ditandai hanya jika insert menghasilkan tepat satu baris.
- QR memakai 32 byte Web Crypto; hanya hash SHA-256 yang disimpan.
- Quick Count publik hanya agregat. `PARTICIPATION_ONLY` tidak mengirim kandidat; `PERCENTAGE_ONLY` tidak mengirim jumlah per kandidat.
- Password admin memakai PBKDF2-SHA256 (100.000 iterasi, batas maksimum Web Crypto Workers) dan salt unik.

## Instalasi lokal

Kebutuhan: Node.js 20+, npm, dan Wrangler 4.x (dev dependency).

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Isi `SESSION_SECRET` di `.dev.vars` dengan nilai acak minimal 32 karakter. File ini tidak boleh di-commit.

### Membuat admin pertama

Saat Worker lokal berjalan, panggil setup satu kali. Password minimal 12 karakter.

```powershell
$headers = @{ "X-Setup-Secret" = "1234567890qwertyuiopasdfghjklzxcvbnm" }
$body = @{ email = "admin@angela.sch.id"; password = "JalanMerdeka24" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:8787/admin/setup -Headers $headers -ContentType application/json -Body $body
```

Setelah admin tersedia, setup berikutnya otomatis ditolak. Login di `/admin/login`.

## Validasi proyek

```powershell
npm run typecheck
npm run lint
npm test
```

Tes memeriksa invariant token, password, schema anonim, status election, eligibility vote, batch atomik, Quick Count agregat, dan integrity check.

## D1 dan deployment produksi

```powershell
npx wrangler login
npx wrangler d1 create pemilihan-osis
```

Salin `database_id` hasil command ke `wrangler.jsonc`, menggantikan `local-development`. Kemudian:

```powershell
npx wrangler d1 migrations apply pemilihan-osis --remote
npx wrangler secret put SESSION_SECRET
npm run typecheck
npm test
npx wrangler deploy --dry-run
npm run deploy
```

`seed.sql` berisi 10 siswa dan dua paslon dummy. Untuk development:

```powershell
npx wrangler d1 execute pemilihan-osis --local --file=./seed.sql
```

Jangan seed siswa dummy ke produksi jika akan mengimpor data asli. Buat admin produksi melalui endpoint setup, lalu rotasi `SESSION_SECRET` secara interaktif.

## Turnstile

Login menggunakan email admin dan dibatasi lima kegagalan per kombinasi IP/email per 15 menit. Variabel Turnstile disediakan sebagai titik integrasi. Bila diperlukan, buat widget di Cloudflare, simpan dengan `npx wrangler secret put TURNSTILE_SECRET_KEY`, dan lakukan siteverify server-side sebelum autentikasi. Secret tidak boleh masuk frontend.

## Prosedur panitia

### Sebelum election

1. Login, lalu import CSV di `/admin/students/import` dengan header `nama,kelas,absen`.
2. Duplikasi kelas + absen akan ditolak oleh constraint D1.
3. Atur paslon di `/admin/candidates`.
4. Generate QR di `/admin/students`. Token hanya tampil sekali; langsung cetak/download.
5. Verifikasi total siswa, QR tersedia, kandidat, `jumlah vote = 0`, status `DRAFT`, dan integritas `VALID`.
6. Backup D1, atur waktu, lalu ubah status menjadi `OPEN` di `/admin/settings`.

### Alur TPS

1. Buka `/scan` di perangkat panitia. Jika browser tidak mendukung `BarcodeDetector`, gunakan kamera bawaan HP untuk membuka URL QR.
2. Cocokkan identitas singkat, lalu siswa memilih dan mengonfirmasi.
3. Halaman sukses tidak menampilkan pilihan. Tekan **Pilih Siswa Berikutnya** untuk menghapus konteks siswa dan kembali ke scanner.

### Penutupan

1. Ubah status ke `CLOSED`; backend langsung menolak vote baru.
2. Pastikan integrity check `VALID`.
3. Export partisipasi (tanpa pilihan siswa) dan hasil agregat.
4. Backup D1 setelah election.

## Quick Count

- `/quick-count` untuk publik; `/quick-count?display=screen` untuk proyektor.
- `/api/public/quick-count` hanya menyediakan agregat.
- Mode: `OFF`, `PARTICIPATION_ONLY`, `PERCENTAGE_ONLY`, dan `FULL`.
- Refresh dapat diubah 3–60 detik tanpa redeploy.
- Saat `OPEN`, UI selalu menyebut “Hasil Sementara”, bukan pemenang.
- Jika request gagal, data terakhir dipertahankan dan koneksi dicoba kembali.

## Backup dan restore

```powershell
npx wrangler d1 export pemilihan-osis --remote --output backup-sebelum-election.sql
npx wrangler d1 export pemilihan-osis --remote --output backup-setelah-election.sql
```

Simpan terenkripsi dan batasi akses. Untuk restore, uji ke D1 baru lebih dahulu:

```powershell
npx wrangler d1 create pemilihan-osis-restore
npx wrangler d1 execute pemilihan-osis-restore --remote --file=./backup-setelah-election.sql
```

Verifikasi jumlah siswa, vote, kandidat, status, dan integritas sebelum mengganti binding produksi.

## Custom domain

Di Dashboard Cloudflare buka **Workers & Pages → Worker → Settings → Domains & Routes → Add → Custom Domain**. HTTPS membuat cookie admin menggunakan flag `Secure`.

## Reset election

Di `/admin/settings`, admin wajib mengetik `RESET PEMILIHAN`. Proses mengubah status ke `DRAFT`, menghapus vote, mereset siswa, dan mencatat audit. Lakukan backup dahulu; data hanya dapat dipulihkan dari backup.

## Troubleshooting

- **DB undefined:** cocokkan binding `DB` dan `database_id` di `wrangler.jsonc`.
- **No such table:** jalankan migrasi pada environment yang benar.
- **QR tidak valid:** QR lama otomatis gugur setelah regenerate.
- **Kamera ditolak:** beri izin kamera dan gunakan HTTPS/localhost, atau kamera bawaan.
- **Vote ditolak:** cek status `OPEN`, rentang waktu, kandidat, QR, dan status siswa.
- **Integritas tidak valid:** tutup election, backup, jangan edit manual, lalu audit database.
- **Session expired:** login ulang; sesi berlaku delapan jam.

## Struktur

```text
src/
  auth/       session dan CSRF
  routes/     halaman/API publik dan admin
  services/   voting dan Quick Count
  ui/         layout responsif
  utils/      crypto dan HTTP
migrations/   schema D1
tests/        invariant keamanan
```

Untuk produksi, batasi akun Cloudflare, aktifkan MFA, gunakan secret acak, backup rutin, dan jangan pernah menambahkan relasi siswa/token/IP ke tabel `votes` atau audit kandidat.
