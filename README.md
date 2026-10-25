# MainBareng

Aplikasi komunitas olahraga ala **Reclub**: cari sesi *main bareng* di sekitarmu, gabung klub, catat skor pertandingan, dan naik di papan peringkat.

## Fitur

- **Jelajah sesi** — filter berdasarkan olahraga, kota, atau kata kunci (badminton, padel, pickleball, tenis, futsal, dll.).
- **Ikut sesi dengan kuota** — kalau sesi penuh, pemain otomatis masuk **daftar tunggu** dan naik sendiri saat ada yang batal.
- **Buat sesi** — atur lokasi, waktu, durasi, kuota, biaya per orang (Rp), dan level pemain; bisa atas nama klub.
- **Klub & komunitas** — buat klub, gabung/keluar, lihat anggota dan jadwal sesi klub.
- **Catat skor** — tunggal maupun ganda; rating tiap pemain per olahraga dihitung otomatis dengan **sistem Elo**.
- **Papan peringkat** per olahraga dan kota, plus profil pemain (rating, rasio menang, riwayat pertandingan).
- **Jadwalku** — sesi mendatang & riwayat, ubah profil.
- Tampilan mobile-first, mode gelap otomatis, bisa di-*install* sebagai PWA sederhana.

## Menjalankan

Butuh **Node.js 22.13+** (memakai `node:sqlite` bawaan — server tidak butuh dependensi npm).

```bash
npm start          # http://localhost:3000
npm run dev        # mode watch
npm test           # menjalankan tes API & logika rating
```

Saat pertama dijalankan, database (`data/mainbareng.db`) diisi data contoh.
Masuk dengan akun demo **ady@demo.id / demo1234** (akun lain: budi@, citra@, dewi@, eko@, fajar@, gita@, hana@ — sandi sama).

| Variabel        | Default               | Keterangan                                   |
| --------------- | --------------------- | -------------------------------------------- |
| `PORT`          | `3000`                | Port HTTP                                    |
| `DB_PATH`       | `data/mainbareng.db`  | Lokasi file SQLite                           |
| `SEED`          | aktif                 | Set `0` untuk tidak mengisi data contoh      |
| `COOKIE_SECURE` | nonaktif              | Set `1` di produksi (HTTPS) agar cookie `Secure` |

## Demo tanpa server

`npm run build:demo` menghasilkan `dist/mainbareng-demo.html`: satu file mandiri berisi frontend, backend (rute API yang sama), dan SQLite versi WebAssembly (sql.js). Data disimpan di `localStorage` browser masing-masing pengunjung. Cocok untuk dibagikan atau dicoba tanpa memasang Node.js (butuh `npm install` sekali untuk build).

## Struktur

```
server.js          titik masuk
src/app.js         server HTTP & file statis
src/api.js         rute API (dipakai server dan demo browser)
src/services.js    logika bisnis (sesi, daftar tunggu, klub, skor, peringkat)
src/rating.js      perhitungan Elo
src/auth.js        sesi cookie
src/password.js    hash sandi (scrypt)
src/db.js          skema SQLite
src/seed.js        data contoh
public/            frontend SPA (HTML/CSS/JS tanpa framework)
test/              tes node:test
demo/              build demo satu file untuk browser
```

## API ringkas

| Metode | Endpoint                         | Keterangan                        |
| ------ | -------------------------------- | --------------------------------- |
| POST   | `/api/auth/register`, `/login`, `/logout` | Akun                     |
| GET    | `/api/me`, `/api/my/events`      | Profil & jadwal sendiri           |
| GET    | `/api/events?sport=&city=&q=`    | Daftar sesi mendatang             |
| POST   | `/api/events`                    | Buat sesi                         |
| GET    | `/api/events/:id`                | Detail + peserta, antrean, skor   |
| POST   | `/api/events/:id/join` · `/leave` · `/cancel` | Ikut / batal / batalkan (host) |
| POST   | `/api/events/:id/matches`        | Catat skor `{team_a, team_b, score_a, score_b}` |
| GET    | `/api/clubs`, `/api/clubs/:id`   | Klub                              |
| POST   | `/api/clubs`, `/api/clubs/:id/join` · `/leave` | Buat / gabung / keluar |
| GET    | `/api/leaderboard?sport=&city=`  | Papan peringkat                   |
| GET    | `/api/users/:id`                 | Profil pemain                     |

Semua request `POST/PATCH` wajib `Content-Type: application/json` (perlindungan CSRF dasar bersama cookie `SameSite=Lax`).

## Ide pengembangan berikutnya

- Pembayaran online (Midtrans/Xendit) untuk biaya sesi
- Notifikasi (WhatsApp/push) saat naik dari daftar tunggu atau sesi dibatalkan
- Chat grup per sesi/klub, klub privat dengan persetujuan admin
- Peta lokasi lapangan & pencarian berdasarkan jarak
- Aplikasi mobile (React Native/Flutter) memakai API yang sama
