import { createClub, createEvent, joinClub, joinEvent, recordMatch, register } from './services.js';

export const DEMO_PASSWORD = 'demo1234';

const PLAYERS = [
  ['Ady Putera', 'ady@demo.id', 'Jakarta'],
  ['Budi Santoso', 'budi@demo.id', 'Jakarta'],
  ['Citra Lestari', 'citra@demo.id', 'Jakarta'],
  ['Dewi Anggraini', 'dewi@demo.id', 'Jakarta'],
  ['Eko Prasetyo', 'eko@demo.id', 'Bandung'],
  ['Fajar Nugroho', 'fajar@demo.id', 'Bandung'],
  ['Gita Maharani', 'gita@demo.id', 'Surabaya'],
  ['Hana Wijaya', 'hana@demo.id', 'Jakarta'],
];

// Jam contoh dalam WIB (UTC+7), apa pun zona waktu server.
const WIB_OFFSET_HOURS = 7;

function at(daysFromNow, hour, minute = 0) {
  const d = new Date(Date.now() + WIB_OFFSET_HOURS * 36e5);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour - WIB_OFFSET_HOURS, minute, 0, 0);
  return d.toISOString();
}

// Mengisi data contoh hanya jika database masih kosong.
export function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;

  const [ady, budi, citra, dewi, eko, fajar, gita, hana] = PLAYERS.map(([name, email, city]) =>
    register(db, { name, email, city, password: DEMO_PASSWORD }),
  );

  const smash = createClub(db, ady, {
    name: 'Smash Jakarta',
    sport: 'badminton',
    city: 'Jakarta',
    description: 'Komunitas badminton santai tiap Selasa & Kamis malam. Semua level welcome, yang penting sportif!',
  });
  const padel = createClub(db, citra, {
    name: 'Padel Senopati Crew',
    sport: 'padel',
    city: 'Jakarta',
    description: 'Main padel bareng di Jakarta Selatan. Ada sesi coaching untuk pemula tiap Sabtu pagi.',
  });
  const pickle = createClub(db, eko, {
    name: 'Pickleball Bandung',
    sport: 'pickleball',
    city: 'Bandung',
    description: 'Open play pickleball di Bandung. Raket bisa dipinjam di lokasi.',
  });
  createClub(db, gita, {
    name: 'Tenis Pagi Surabaya',
    sport: 'tenis',
    city: 'Surabaya',
    description: 'Rally pagi sebelum ngantor. Kumpul jam 06.00 di lapangan Kertajaya.',
  });
  [budi, dewi, hana].forEach((u) => joinClub(db, smash, u));
  [ady, dewi, hana].forEach((u) => joinClub(db, padel, u));
  [fajar].forEach((u) => joinClub(db, pickle, u));

  // Sesi besok (dipakai untuk riwayat skor contoh).
  const malamBadminton = createEvent(db, ady, {
    club_id: smash,
    title: 'Badminton Malam — Mabar Ganda',
    sport: 'badminton',
    venue: 'GOR Bulungan, Lapangan 3',
    city: 'Jakarta',
    starts_at: at(1, 19),
    duration_min: 120,
    capacity: 8,
    fee: 35000,
    level: 'menengah',
    description: 'Sistem rotasi ganda, shuttlecock disediakan. Bayar di tempat ya.',
  });
  [budi, citra, dewi, hana].forEach((u) => joinEvent(db, malamBadminton, u));
  const play = (a, b, sa, sb) => recordMatch(db, malamBadminton, ady, { team_a: a, team_b: b, score_a: sa, score_b: sb });
  play([ady, budi], [citra, dewi], 21, 17);
  play([ady, hana], [budi, citra], 19, 21);
  play([dewi, hana], [ady, citra], 21, 15);
  play([ady, dewi], [budi, hana], 21, 12);

  const padelPagi = createEvent(db, citra, {
    club_id: padel,
    title: 'Padel Pagi Sabtu + Coaching',
    sport: 'padel',
    venue: 'Padel Senopati Court A',
    city: 'Jakarta',
    starts_at: at(3, 7),
    duration_min: 90,
    capacity: 4,
    fee: 150000,
    level: 'pemula',
    description: 'Cocok untuk yang baru mulai main padel. Coach akan bantu teknik dasar.',
  });
  [ady, dewi, hana, budi].forEach((u) => joinEvent(db, padelPagi, u)); // Budi masuk daftar tunggu.

  createEvent(db, eko, {
    club_id: pickle,
    title: 'Open Play Pickleball Dago',
    sport: 'pickleball',
    venue: 'Lapangan Dago Pakar',
    city: 'Bandung',
    starts_at: at(2, 16),
    duration_min: 120,
    capacity: 12,
    fee: 50000,
    level: 'semua',
    description: 'Datang, antre paddle, main! Ada pinjaman paddle gratis.',
  });

  createEvent(db, budi, {
    title: 'Futsal Jumat Malam',
    sport: 'futsal',
    venue: 'Futsal Arena Kemang',
    city: 'Jakarta',
    starts_at: at(4, 20),
    duration_min: 90,
    capacity: 12,
    fee: 40000,
    level: 'semua',
    description: 'Butuh 2 tim, siapa cepat dia dapat. Bawa rompi warna gelap & terang.',
  });

  createEvent(db, gita, {
    title: 'Rally Tenis Pagi',
    sport: 'tenis',
    venue: 'Lapangan Tenis Kertajaya',
    city: 'Surabaya',
    starts_at: at(5, 6),
    duration_min: 90,
    capacity: 4,
    fee: 0,
    level: 'mahir',
    description: 'Rally & mini match. Bola baru disediakan.',
  });
}
