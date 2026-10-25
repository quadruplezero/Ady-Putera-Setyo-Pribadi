// MainBareng — SPA tanpa framework dengan hash routing.

const $app = document.getElementById('app');
const state = { me: null, meta: { sports: {}, levels: {} } };

// ---------- utilitas ----------

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Terjadi kesalahan');
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
function toast(message, type = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3000);
}

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const fee = (n) => (n > 0 ? rupiah.format(n) : 'Gratis');
const fmtDay = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
const fmtMonth = new Intl.DateTimeFormat('id-ID', { month: 'short' });

function timeRange(e) {
  const start = new Date(e.starts_at);
  const end = new Date(start.getTime() + e.duration_min * 60000);
  return `${fmtTime.format(start)}–${fmtTime.format(end)}`;
}

const sport = (key) => state.meta.sports[key] ?? { label: key, icon: '🏅' };
const level = (key) => state.meta.levels[key] ?? key;
const initials = (name) =>
  String(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
const avatar = (name, cls = '') => `<span class="avatar ${cls}" aria-hidden="true">${esc(initials(name))}</span>`;
const rating = (r) => (r == null ? '—' : Math.round(r));

function sportOptions(selected, { any = false } = {}) {
  const opts = Object.entries(state.meta.sports).map(
    ([k, s]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${s.icon} ${esc(s.label)}</option>`,
  );
  return (any ? ['<option value="">Semua olahraga</option>'] : []).concat(opts).join('');
}

function sportChips(active) {
  const chip = (key, label) =>
    `<button class="chip ${active === key ? 'active' : ''}" data-sport="${key}">${label}</button>`;
  return `<div class="chips" role="toolbar" aria-label="Filter olahraga">
    ${chip('', 'Semua')}
    ${Object.entries(state.meta.sports).map(([k, s]) => chip(k, `${s.icon} ${esc(s.label)}`)).join('')}
  </div>`;
}

function requireLogin() {
  if (state.me) return true;
  store.set('afterLogin', location.hash);
  location.hash = '#/login';
  return false;
}

function bindForm(form, handler) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await handler(Object.fromEntries(new FormData(form)));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

async function action(btn, fn) {
  btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    if (err.status === 401) return requireLogin();
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// Dialog konfirmasi di dalam halaman (window.confirm tidak tersedia di semua tampilan).
function askConfirm(message, okLabel = 'Ya, lanjutkan') {
  const dialog = document.getElementById('confirm');
  dialog.querySelector('p').textContent = message;
  dialog.querySelector('[value=ok]').textContent = okLabel;
  dialog.returnValue = '';
  dialog.querySelectorAll('button').forEach((b) => (b.onclick = () => dialog.close(b.value)));
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}

const store = {
  get(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
      /* penyimpanan diblokir: abaikan */
    }
  },
};

const empty = (msg, cta = '') => `<div class="empty"><p>${msg}</p>${cta}</div>`;
const loading = () => `<div class="list">${'<div class="skeleton"></div>'.repeat(3)}</div>`;

// ---------- komponen ----------

function statusBadge(e) {
  if (e.status === 'cancelled') return '<span class="badge danger">Dibatalkan</span>';
  if (e.my_status === 'going') return '<span class="badge ok">✓ Kamu ikut</span>';
  if (e.my_status === 'waitlist') return '<span class="badge warn">Daftar tunggu</span>';
  if (e.going_count >= e.capacity) return '<span class="badge warn">Penuh</span>';
  return '';
}

function eventCard(e) {
  const d = new Date(e.starts_at);
  const s = sport(e.sport);
  const pct = Math.min(100, Math.round((e.going_count / e.capacity) * 100));
  const left = e.capacity - e.going_count;
  return `<a class="card event-card" href="#/event/${e.id}">
    <div class="datebox"><span class="d">${d.getDate()}</span><span class="m">${esc(fmtMonth.format(d))}</span></div>
    <div>
      <div class="spread"><h3>${esc(e.title)}</h3>${statusBadge(e)}</div>
      <div class="meta">
        <span>${s.icon} ${esc(s.label)} · ${esc(level(e.level))}</span>
        <span>🕒 ${timeRange(e)}</span>
        <span>📍 ${esc(e.venue)}, ${esc(e.city)}</span>
        <span>💰 ${fee(e.fee)}</span>
      </div>
      <div class="slots">
        <div class="spread meta"><span>${e.going_count}/${e.capacity} pemain${e.waitlist_count ? ` · ${e.waitlist_count} antre` : ''}</span>
        <span>${left > 0 ? `${left} slot tersisa` : 'Slot penuh'}</span></div>
        <div class="bar ${left <= 0 ? 'full' : ''}"><i style="width:${pct}%"></i></div>
      </div>
    </div>
  </a>`;
}

function clubCard(c) {
  const s = sport(c.sport);
  return `<a class="card" href="#/club/${c.id}">
    <div class="spread"><h3>${esc(c.name)}</h3>${c.my_role ? '<span class="badge ok">Anggota</span>' : ''}</div>
    <div class="meta"><span>${s.icon} ${esc(s.label)}</span><span>📍 ${esc(c.city)}</span><span>👥 ${c.member_count} anggota</span></div>
    ${c.description ? `<p class="muted" style="margin-top:6px">${esc(c.description.slice(0, 140))}${c.description.length > 140 ? '…' : ''}</p>` : ''}
  </a>`;
}

function matchRow(m, { showEvent = false } = {}) {
  const aWin = m.score_a > m.score_b;
  const names = (team) => team.map((p) => `<a href="#/user/${p.id}">${esc(p.name)}</a>`).join(' & ');
  const delta = (d) => `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d.toFixed(1)}</span>`;
  return `<div class="card">
    ${showEvent ? `<div class="meta" style="margin-bottom:6px"><a href="#/event/${m.event_id}">${esc(m.event_title)}</a></div>` : ''}
    <div class="match">
      <div class="team ${aWin ? 'win' : ''}">${names(m.team_a)}<br>${delta(m.delta_a)}</div>
      <div class="score">${m.score_a} – ${m.score_b}</div>
      <div class="team ${aWin ? '' : 'win'}">${names(m.team_b)}<br>${delta(m.delta_b)}</div>
    </div>
  </div>`;
}

function personRow(p, extra = '') {
  return `<a class="person" href="#/user/${p.id}">
    ${avatar(p.name)}
    <div class="grow"><b>${esc(p.name)}</b>${extra}</div>
  </a>`;
}

// ---------- halaman ----------

const discoverFilters = { sport: '', city: '', q: '' };

async function viewDiscover() {
  $app.innerHTML = `
    <h1>Main bareng, yuk! 👋</h1>
    <p class="muted">Temukan sesi olahraga di sekitarmu dan langsung gabung.</p>
    ${sportChips(discoverFilters.sport)}
    <div class="filters">
      <input id="f-city" placeholder="Kota (mis. Jakarta)" value="${esc(discoverFilters.city)}" aria-label="Filter kota" />
      <input id="f-q" placeholder="Cari judul / lokasi" value="${esc(discoverFilters.q)}" aria-label="Cari" />
    </div>
    <div id="results">${loading()}</div>
    <a class="btn fab" href="#/event/new">＋ Buat Sesi</a>`;

  const load = async () => {
    const qs = new URLSearchParams(Object.entries(discoverFilters).filter(([, v]) => v));
    const { events } = await api(`/events?${qs}`);
    document.getElementById('results').innerHTML = events.length
      ? `<div class="list">${events.map(eventCard).join('')}</div>`
      : empty('Belum ada sesi yang cocok.', '<a class="btn" href="#/event/new">Buat sesi pertama</a>');
  };

  $app.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      discoverFilters.sport = chip.dataset.sport;
      $app.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
      load();
    }),
  );
  let debounce;
  for (const [id, key] of [['f-city', 'city'], ['f-q', 'q']]) {
    document.getElementById(id).addEventListener('input', (ev) => {
      discoverFilters[key] = ev.target.value.trim();
      clearTimeout(debounce);
      debounce = setTimeout(load, 250);
    });
  }
  await load();
}

async function viewEvent({ id }) {
  $app.innerHTML = loading();
  const e = await api(`/events/${id}`);
  const s = sport(e.sport);
  const me = state.me;
  const isHost = me && me.id === e.host_id;
  const isGoing = e.my_status === 'going';
  const past = new Date(e.starts_at) < new Date();
  const full = e.participants.length >= e.capacity;

  let cta = '';
  if (e.status === 'cancelled') {
    cta = '<button class="btn block secondary" disabled>Sesi ini dibatalkan</button>';
  } else if (past) {
    cta = '<button class="btn block secondary" disabled>Sesi sudah dimulai / selesai</button>';
  } else if (e.my_status) {
    cta = `<button class="btn block danger" id="leave">${isGoing ? 'Batal ikut' : 'Keluar dari daftar tunggu'}</button>`;
  } else {
    cta = `<button class="btn block" id="join">${full ? 'Masuk daftar tunggu' : `Ikut main · ${fee(e.fee)}`}</button>`;
  }

  const canRecord = me && e.status === 'open' && (isHost || isGoing) && e.participants.length >= 2;
  const playerOpts = (optional) =>
    (optional ? '<option value="">— (tunggal)</option>' : '<option value="" disabled selected>Pilih pemain</option>') +
    e.participants.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

  $app.innerHTML = `
    <div class="hero">
      <div class="sport">${s.icon} ${esc(s.label)} · ${esc(level(e.level))} ${statusBadge(e)}</div>
      <h1>${esc(e.title)}</h1>
      <div class="meta">Host: <a href="#/user/${e.host_id}">${esc(e.host_name)}</a>
        ${e.club_id ? ` · Klub: <a href="#/club/${e.club_id}">${esc(e.club_name)}</a>` : ''}</div>
    </div>
    <div class="card info">
      <div><span>📅</span><span>${esc(fmtDay.format(new Date(e.starts_at)))}</span></div>
      <div><span>🕒</span><span>${timeRange(e)} (${e.duration_min} menit)</span></div>
      <div><span>📍</span><span>${esc(e.venue)}, ${esc(e.city)}</span></div>
      <div><span>💰</span><span>${fee(e.fee)} per orang</span></div>
      <div><span>👥</span><span>${e.participants.length}/${e.capacity} pemain${e.waitlist.length ? ` · ${e.waitlist.length} di daftar tunggu` : ''}</span></div>
    </div>
    ${e.description ? `<p>${esc(e.description).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="row">
      <button class="btn secondary small" id="share">🔗 Bagikan</button>
      ${isHost && e.status === 'open' && !past ? '<button class="btn danger small" id="cancel">Batalkan sesi</button>' : ''}
    </div>

    <h2>Pemain (${e.participants.length}/${e.capacity})</h2>
    <div class="card people">
      ${e.participants.length
        ? e.participants
            .map((p) => personRow(p, `<div class="meta">Rating ${s.label}: ${rating(p.games ? p.rating : null)}${p.id === e.host_id ? ' · Host' : ''}</div>`))
            .join('')
        : '<p class="muted">Belum ada pemain. Jadi yang pertama!</p>'}
    </div>

    ${e.waitlist.length
      ? `<h2>Daftar tunggu (${e.waitlist.length})</h2>
         <div class="card people">${e.waitlist.map((p, i) => personRow(p, `<div class="meta">Antrean #${i + 1}</div>`)).join('')}</div>`
      : ''}

    <h2>Hasil pertandingan</h2>
    ${canRecord
      ? `<details class="card" ${e.matches.length ? '' : 'open'}>
          <summary><b>＋ Catat skor</b></summary>
          <form id="match-form" class="form" style="margin-top:12px">
            <div class="grid-2">
              <div><label>Tim A — pemain 1</label><select name="a1" required>${playerOpts(false)}</select></div>
              <div><label>Tim B — pemain 1</label><select name="b1" required>${playerOpts(false)}</select></div>
              <div><label>Tim A — pemain 2</label><select name="a2">${playerOpts(true)}</select></div>
              <div><label>Tim B — pemain 2</label><select name="b2">${playerOpts(true)}</select></div>
              <div><label>Skor Tim A</label><input name="score_a" type="number" min="0" max="99" required /></div>
              <div><label>Skor Tim B</label><input name="score_b" type="number" min="0" max="99" required /></div>
            </div>
            <button class="btn" type="submit">Simpan skor</button>
            <p class="meta">Rating dihitung otomatis dengan sistem Elo.</p>
          </form>
        </details>`
      : ''}
    <div class="list" style="margin-top:10px">
      ${e.matches.length ? e.matches.map((m) => matchRow(m)).join('') : '<p class="muted">Belum ada skor yang dicatat.</p>'}
    </div>

    <div class="sticky-cta">${cta}</div>`;

  const reload = () => viewEvent({ id });
  document.getElementById('join')?.addEventListener('click', (ev) =>
    action(ev.currentTarget, async () => {
      if (!requireLogin()) return;
      const { status } = await api(`/events/${id}/join`, { method: 'POST' });
      toast(status === 'going' ? 'Kamu sudah terdaftar. Sampai ketemu di lapangan! 🎉' : 'Sesi penuh — kamu masuk daftar tunggu.');
      reload();
    }),
  );
  document.getElementById('leave')?.addEventListener('click', (ev) =>
    action(ev.currentTarget, async () => {
      if (!(await askConfirm('Yakin batal ikut sesi ini? Slotmu akan diberikan ke pemain di daftar tunggu.', 'Batal ikut'))) return;
      await api(`/events/${id}/leave`, { method: 'POST' });
      toast('Kamu sudah keluar dari sesi.');
      reload();
    }),
  );
  document.getElementById('cancel')?.addEventListener('click', (ev) =>
    action(ev.currentTarget, async () => {
      if (!(await askConfirm('Batalkan sesi ini untuk semua pemain?', 'Batalkan sesi'))) return;
      await api(`/events/${id}/cancel`, { method: 'POST' });
      toast('Sesi dibatalkan.');
      reload();
    }),
  );
  document.getElementById('share').addEventListener('click', async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast('Tautan disalin!');
    } catch {
      toast(url);
    }
  });
  const form = document.getElementById('match-form');
  if (form) {
    bindForm(form, async (f) => {
      await api(`/events/${id}/matches`, {
        method: 'POST',
        body: {
          team_a: [f.a1, f.a2].filter(Boolean).map(Number),
          team_b: [f.b1, f.b2].filter(Boolean).map(Number),
          score_a: Number(f.score_a),
          score_b: Number(f.score_b),
        },
      });
      toast('Skor tersimpan, rating diperbarui! 📈');
      reload();
    });
  }
}

async function viewNewEvent() {
  if (!requireLogin()) return;
  const { clubs } = await api('/clubs');
  const myClubs = clubs.filter((c) => c.my_role);
  const preset = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const presetClub = myClubs.find((c) => String(c.id) === preset.get('club'));
  const tomorrow = new Date(Date.now() + 864e5);
  tomorrow.setHours(19, 0, 0, 0);
  const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  $app.innerHTML = `
    <h1>Buat sesi main bareng</h1>
    <form class="form card" id="form">
      <div><label for="title">Judul</label><input id="title" name="title" required maxlength="100" placeholder="mis. Mabar Badminton Kamis Malam" /></div>
      <div class="grid-2">
        <div><label for="sport">Olahraga</label><select id="sport" name="sport">${sportOptions(presetClub?.sport ?? 'badminton')}</select></div>
        <div><label for="level">Level</label><select id="level" name="level">
          ${Object.entries(state.meta.levels).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      </div>
      <div><label for="venue">Lokasi / lapangan</label><input id="venue" name="venue" required maxlength="120" placeholder="mis. GOR Bulungan, Lapangan 3" /></div>
      <div><label for="city">Kota</label><input id="city" name="city" required maxlength="60" value="${esc(presetClub?.city ?? state.me.city)}" /></div>
      <div class="grid-2">
        <div><label for="starts_at">Mulai</label><input id="starts_at" name="starts_at" type="datetime-local" required value="${local}" /></div>
        <div><label for="duration_min">Durasi (menit)</label><input id="duration_min" name="duration_min" type="number" min="15" max="720" step="15" value="120" required /></div>
        <div><label for="capacity">Jumlah pemain</label><input id="capacity" name="capacity" type="number" min="2" max="200" value="8" required /></div>
        <div><label for="fee">Biaya per orang (Rp)</label><input id="fee" name="fee" type="number" min="0" step="1000" value="0" /></div>
      </div>
      ${myClubs.length
        ? `<div><label for="club_id">Atas nama klub (opsional)</label><select id="club_id" name="club_id">
            <option value="">— Tanpa klub —</option>
            ${myClubs.map((c) => `<option value="${c.id}" ${c.id === presetClub?.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>`
        : ''}
      <div><label for="description">Deskripsi</label><textarea id="description" name="description" maxlength="2000" placeholder="Aturan main, perlengkapan, cara bayar, dll."></textarea></div>
      <label class="check"><input type="checkbox" name="host_plays" checked /> Saya juga ikut bermain</label>
      <button class="btn" type="submit">Terbitkan sesi</button>
    </form>`;

  bindForm(document.getElementById('form'), async (f) => {
    const { id } = await api('/events', {
      method: 'POST',
      body: {
        ...f,
        starts_at: new Date(f.starts_at).toISOString(),
        duration_min: Number(f.duration_min),
        capacity: Number(f.capacity),
        fee: Number(f.fee || 0),
        club_id: f.club_id ? Number(f.club_id) : null,
        host_plays: f.host_plays === 'on',
      },
    });
    toast('Sesi berhasil dibuat! Bagikan ke teman-temanmu.');
    location.hash = `#/event/${id}`;
  });
}

const clubFilters = { sport: '', city: '' };

async function viewClubs() {
  $app.innerHTML = `
    <div class="spread"><h1>Klub & komunitas</h1><a class="btn small" href="#/club/new">＋ Buat klub</a></div>
    ${sportChips(clubFilters.sport)}
    <input id="c-city" placeholder="Kota" value="${esc(clubFilters.city)}" aria-label="Filter kota" style="margin-bottom:10px" />
    <div id="results">${loading()}</div>`;

  const load = async () => {
    const qs = new URLSearchParams(Object.entries(clubFilters).filter(([, v]) => v));
    const { clubs } = await api(`/clubs?${qs}`);
    document.getElementById('results').innerHTML = clubs.length
      ? `<div class="list">${clubs.map(clubCard).join('')}</div>`
      : empty('Belum ada klub di sini.', '<a class="btn" href="#/club/new">Buat klub pertama</a>');
  };
  $app.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      clubFilters.sport = chip.dataset.sport;
      $app.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
      load();
    }),
  );
  let debounce;
  document.getElementById('c-city').addEventListener('input', (ev) => {
    clubFilters.city = ev.target.value.trim();
    clearTimeout(debounce);
    debounce = setTimeout(load, 250);
  });
  await load();
}

async function viewClub({ id }) {
  $app.innerHTML = loading();
  const c = await api(`/clubs/${id}`);
  const s = sport(c.sport);
  $app.innerHTML = `
    <div class="hero">
      <div class="sport">${s.icon} ${esc(s.label)} · 📍 ${esc(c.city)}</div>
      <h1>${esc(c.name)}</h1>
      <div class="meta">Dikelola oleh <a href="#/user/${c.owner_id}">${esc(c.owner_name)}</a> · ${c.members.length} anggota</div>
    </div>
    ${c.description ? `<p style="margin-top:10px">${esc(c.description).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="row" style="margin-top:10px">
      ${c.my_role
        ? `<a class="btn" href="#/event/new?club=${c.id}">＋ Buat sesi klub</a>
           ${c.my_role !== 'owner' ? '<button class="btn secondary" id="leave">Keluar klub</button>' : '<span class="badge ok">Kamu pemilik klub</span>'}`
        : '<button class="btn" id="join">Gabung klub</button>'}
    </div>

    <h2>Sesi mendatang</h2>
    ${c.events.length ? `<div class="list">${c.events.map(eventCard).join('')}</div>` : '<p class="muted">Belum ada sesi terjadwal.</p>'}

    <h2>Anggota</h2>
    <div class="card people">
      ${c.members
        .map((m) => personRow(m, `<div class="meta">${m.role === 'owner' ? 'Pemilik · ' : ''}Rating ${esc(s.label)}: ${rating(m.rating)}</div>`))
        .join('')}
    </div>`;

  document.getElementById('join')?.addEventListener('click', (ev) =>
    action(ev.currentTarget, async () => {
      if (!requireLogin()) return;
      await api(`/clubs/${id}/join`, { method: 'POST' });
      toast(`Selamat datang di ${c.name}! 🙌`);
      viewClub({ id });
    }),
  );
  document.getElementById('leave')?.addEventListener('click', (ev) =>
    action(ev.currentTarget, async () => {
      if (!(await askConfirm('Keluar dari klub ini?', 'Keluar klub'))) return;
      await api(`/clubs/${id}/leave`, { method: 'POST' });
      toast('Kamu sudah keluar dari klub.');
      viewClub({ id });
    }),
  );
}

async function viewNewClub() {
  if (!requireLogin()) return;
  $app.innerHTML = `
    <h1>Buat klub baru</h1>
    <form class="form card" id="form">
      <div><label for="name">Nama klub</label><input id="name" name="name" required minlength="3" maxlength="80" /></div>
      <div class="grid-2">
        <div><label for="sport">Olahraga</label><select id="sport" name="sport">${sportOptions('badminton')}</select></div>
        <div><label for="city">Kota</label><input id="city" name="city" required maxlength="60" value="${esc(state.me.city)}" /></div>
      </div>
      <div><label for="description">Tentang klub</label><textarea id="description" name="description" maxlength="1000" placeholder="Jadwal rutin, lokasi, siapa yang cocok bergabung…"></textarea></div>
      <button class="btn" type="submit">Buat klub</button>
    </form>`;
  bindForm(document.getElementById('form'), async (f) => {
    const { id } = await api('/clubs', { method: 'POST', body: f });
    toast('Klub berhasil dibuat!');
    location.hash = `#/club/${id}`;
  });
}

let boardSport = 'badminton';

async function viewLeaderboard() {
  $app.innerHTML = `
    <h1>Papan peringkat 🏆</h1>
    <p class="muted">Rating Elo dari skor yang dicatat di setiap sesi.</p>
    <div class="filters">
      <select id="l-sport" aria-label="Olahraga">${sportOptions(boardSport)}</select>
      <input id="l-city" placeholder="Kota (opsional)" aria-label="Filter kota" />
    </div>
    <div id="results">${loading()}</div>`;
  const load = async () => {
    const qs = new URLSearchParams({ sport: boardSport });
    const city = document.getElementById('l-city').value.trim();
    if (city) qs.set('city', city);
    const { players } = await api(`/leaderboard?${qs}`);
    document.getElementById('results').innerHTML = players.length
      ? `<div class="card people">${players
          .map(
            (p, i) => `<a class="person" href="#/user/${p.id}">
              <span class="rank">${['🥇', '🥈', '🥉'][i] ?? i + 1}</span>${avatar(p.name)}
              <div class="grow"><b>${esc(p.name)}</b><div class="meta">${esc(p.city || '—')} · ${p.wins}M/${p.games - p.wins}K</div></div>
              <span class="rating">${rating(p.rating)}</span></a>`,
          )
          .join('')}</div>`
      : empty('Belum ada pertandingan tercatat untuk olahraga ini.');
  };
  document.getElementById('l-sport').addEventListener('change', (ev) => {
    boardSport = ev.target.value;
    load();
  });
  let debounce;
  document.getElementById('l-city').addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 250);
  });
  await load();
}

function profileBody(u) {
  const totalGames = u.ratings.reduce((a, r) => a + r.games, 0);
  const totalWins = u.ratings.reduce((a, r) => a + r.wins, 0);
  return `
    <div class="stats">
      <div class="stat"><b>${totalGames}</b><small>Pertandingan</small></div>
      <div class="stat"><b>${totalGames ? Math.round((totalWins / totalGames) * 100) : 0}%</b><small>Menang</small></div>
      <div class="stat"><b>${u.clubs.length}</b><small>Klub</small></div>
    </div>
    <h2>Rating</h2>
    ${u.ratings.length
      ? `<div class="card people">${u.ratings
          .map((r) => {
            const s = sport(r.sport);
            return `<div class="spread"><span>${s.icon} ${esc(s.label)} <span class="meta">${r.wins}M/${r.games - r.wins}K</span></span><span class="rating">${rating(r.rating)}</span></div>`;
          })
          .join('')}</div>`
      : '<p class="muted">Belum ada pertandingan tercatat.</p>'}
    <h2>Klub</h2>
    ${u.clubs.length
      ? `<div class="card people">${u.clubs
          .map((c) => `<a class="spread" href="#/club/${c.id}"><span>${sport(c.sport).icon} ${esc(c.name)}</span><span class="meta">${c.role === 'owner' ? 'Pemilik' : 'Anggota'}</span></a>`)
          .join('')}</div>`
      : '<p class="muted">Belum bergabung dengan klub.</p>'}
    <h2>Pertandingan terakhir</h2>
    ${u.matches.length ? `<div class="list">${u.matches.map((m) => matchRow(m, { showEvent: true })).join('')}</div>` : '<p class="muted">Belum ada.</p>'}`;
}

async function viewUser({ id }) {
  $app.innerHTML = loading();
  const u = await api(`/users/${id}`);
  $app.innerHTML = `
    <div class="row" style="margin-bottom:12px">${avatar(u.name, 'lg')}
      <div><h1 style="margin:0">${esc(u.name)}</h1><div class="meta">📍 ${esc(u.city || '—')}</div></div>
    </div>
    ${u.bio ? `<p>${esc(u.bio)}</p>` : ''}
    ${profileBody(u)}`;
}

async function viewMe() {
  if (!requireLogin()) return;
  $app.innerHTML = loading();
  const [{ upcoming, past }, profile] = await Promise.all([api('/my/events'), api(`/users/${state.me.id}`)]);
  let tab = 'upcoming';
  const render = () => {
    const list = tab === 'upcoming' ? upcoming : past;
    $app.innerHTML = `
      <div class="spread" style="margin-bottom:12px">
        <div class="row">${avatar(state.me.name, 'lg')}
          <div><h1 style="margin:0">${esc(state.me.name)}</h1><div class="meta">📍 ${esc(state.me.city || '—')}</div></div>
        </div>
        <a class="btn secondary small" href="#/settings">Ubah profil</a>
      </div>
      <h2>Jadwalku</h2>
      <div class="tabs">
        <button class="chip ${tab === 'upcoming' ? 'active' : ''}" data-tab="upcoming">Mendatang (${upcoming.length})</button>
        <button class="chip ${tab === 'past' ? 'active' : ''}" data-tab="past">Riwayat (${past.length})</button>
      </div>
      ${list.length
        ? `<div class="list">${list.map(eventCard).join('')}</div>`
        : empty(tab === 'upcoming' ? 'Belum ada jadwal main.' : 'Belum ada riwayat.', tab === 'upcoming' ? '<a class="btn" href="#/">Cari sesi</a>' : '')}
      ${profileBody(profile)}
      <button class="btn secondary block" id="logout" style="margin-top:24px">Keluar</button>`;
    $app.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        tab = b.dataset.tab;
        render();
      }),
    );
    document.getElementById('logout').addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' });
      state.me = null;
      renderAccount();
      location.hash = '#/';
    });
  };
  render();
}

async function viewSettings() {
  if (!requireLogin()) return;
  const me = state.me;
  $app.innerHTML = `
    <h1>Ubah profil</h1>
    <form class="form card" id="form">
      <div><label for="name">Nama</label><input id="name" name="name" required maxlength="60" value="${esc(me.name)}" /></div>
      <div><label for="city">Kota</label><input id="city" name="city" maxlength="60" value="${esc(me.city)}" /></div>
      <div><label for="bio">Bio</label><textarea id="bio" name="bio" maxlength="300" placeholder="Olahraga favorit, jadwal kosong, dll.">${esc(me.bio)}</textarea></div>
      <button class="btn" type="submit">Simpan</button>
    </form>`;
  bindForm(document.getElementById('form'), async (f) => {
    await api('/me', { method: 'PATCH', body: f });
    await loadMe();
    toast('Profil tersimpan.');
    location.hash = '#/me';
  });
}

function afterAuth() {
  const next = store.get('afterLogin');
  store.set('afterLogin', null);
  location.hash = next && !/^#\/(login|register)/.test(next) ? next : '#/';
}

async function viewLogin() {
  $app.innerHTML = `
    <h1>Masuk</h1>
    <form class="form card" id="form">
      <div><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" /></div>
      <div><label for="password">Kata sandi</label><input id="password" name="password" type="password" required autocomplete="current-password" /></div>
      <button class="btn" type="submit">Masuk</button>
      <p class="meta">Belum punya akun? <a href="#/register">Daftar gratis</a></p>
      <p class="meta">Akun demo: <b>ady@demo.id</b> / <b>demo1234</b></p>
    </form>`;
  bindForm(document.getElementById('form'), async (f) => {
    await api('/auth/login', { method: 'POST', body: f });
    await loadMe();
    toast(`Halo, ${state.me.name}! 👋`);
    afterAuth();
  });
}

async function viewRegister() {
  $app.innerHTML = `
    <h1>Daftar</h1>
    <form class="form card" id="form">
      <div><label for="name">Nama</label><input id="name" name="name" required maxlength="60" autocomplete="name" /></div>
      <div><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" /></div>
      <div><label for="password">Kata sandi (min. 8 karakter)</label><input id="password" name="password" type="password" minlength="8" required autocomplete="new-password" /></div>
      <div><label for="city">Kota</label><input id="city" name="city" maxlength="60" placeholder="mis. Jakarta" /></div>
      <button class="btn" type="submit">Buat akun</button>
      <p class="meta">Sudah punya akun? <a href="#/login">Masuk</a></p>
    </form>`;
  bindForm(document.getElementById('form'), async (f) => {
    await api('/auth/register', { method: 'POST', body: f });
    await loadMe();
    toast('Akun berhasil dibuat. Selamat bermain! 🎉');
    afterAuth();
  });
}

// ---------- router ----------

const ROUTES = [
  [/^\/$/, viewDiscover, 'discover'],
  [/^\/event\/new$/, viewNewEvent, 'discover'],
  [/^\/event\/(?<id>\d+)$/, viewEvent, 'discover'],
  [/^\/clubs$/, viewClubs, 'clubs'],
  [/^\/club\/new$/, viewNewClub, 'clubs'],
  [/^\/club\/(?<id>\d+)$/, viewClub, 'clubs'],
  [/^\/leaderboard$/, viewLeaderboard, 'leaderboard'],
  [/^\/user\/(?<id>\d+)$/, viewUser, 'leaderboard'],
  [/^\/me$/, viewMe, 'me'],
  [/^\/settings$/, viewSettings, 'me'],
  [/^\/login$/, viewLogin, 'me'],
  [/^\/register$/, viewRegister, 'me'],
];

async function route() {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const found = ROUTES.find(([re]) => re.test(path));
  if (!found) {
    location.hash = '#/';
    return;
  }
  const [re, view, tab] = found;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  try {
    await view(re.exec(path).groups ?? {});
  } catch (err) {
    $app.innerHTML = empty(esc(err.message), '<a class="btn" href="#/">Kembali ke beranda</a>');
  }
}

function renderAccount() {
  document.getElementById('account').innerHTML = state.me
    ? `<a href="#/me" class="row" aria-label="Profil saya">${avatar(state.me.name)}</a>`
    : '<a class="btn small" href="#/login">Masuk</a>';
}

async function loadMe() {
  state.me = (await api('/me')).user;
  renderAccount();
}

async function boot() {
  window.addEventListener('hashchange', route);
  const [meta] = await Promise.all([api('/meta'), loadMe()]);
  state.meta = meta;
  await route();
}

boot();
