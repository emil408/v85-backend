// Högkvarteret-backend
// Hämtar V85-startlista + andelar från ATG Högkvarteret
// Deploy gratis på Vercel, Railway eller Render

const express = require('express');
const cors    = require('cors');
const fetch   = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

const app  = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.static('public'));

// -----------------------------------------------------------------------
// Riktiga spelläggare på ATG Högkvarteret (källa: travnet.se / ATG)
// Uppdatera listan om ATG lägger till/tar bort spelläggare
// -----------------------------------------------------------------------
const SPELLAGGARE = [
  { id: 'emil-berglund',     namn: 'Emil Berglund',      roll: 'Spelchef · Travnet'           },
  { id: 'charles-berglund',  namn: 'Charles Berglund',   roll: 'Styrelsemedlem · Travnet'     },
  { id: 'oliver-bergman',    namn: 'Oliver Bergman',      roll: 'Programledare · Travmagasinet'},
  { id: 'tobias-liljendahl', namn: 'Tobias Liljendahl',  roll: 'Spelexpert · Travnet'         },
  { id: 'niklas-robertsson', namn: 'Niklas Robertsson',  roll: 'Spelexpert · Travmagasinet'   },
  { id: 'anton-gehlin',      namn: 'Anton Gehlin',       roll: 'Travtipsare · Travnet'        },
];

// --- Cache ---
let cacheV85 = { date: null, data: null };
let cacheHQ  = { date: null, data: null };

const pad = n => String(n).padStart(2, '0');

function nextLordag() {
  const now  = new Date();
  const diff = now.getDay() === 6 ? 0 : (6 - now.getDay() + 7) % 7;
  const d    = new Date(now);
  d.setDate(now.getDate() + diff);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function atgGet(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HQtips/1.0)', Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`ATG ${res.status} — ${url}`);
  return res.json();
}

// -----------------------------------------------------------------------
// V85 startlista
// -----------------------------------------------------------------------
function extractV85event(cal) {
  for (const ev of (cal.events || [])) {
    const v85 = ev.games?.V85 || ev.games?.v85;
    if (v85) {
      const arr = Array.isArray(v85) ? v85 : [v85];
      return { track: ev.track?.name || ev.name || 'ATG', startTime: ev.startTime || '16:10', races: arr.flatMap(x => x.races || []), gameId: arr[0]?.id };
    }
  }
  for (const ev of (cal.events || [])) {
    const v85r = (ev.races || []).filter(r => (r.name || '').includes('V85'));
    if (v85r.length >= 4) return { track: ev.track?.name || 'ATG', startTime: '16:10', races: v85r, gameId: null };
  }
  return null;
}

function normalizeRace(race, i) {
  return {
    number: race.number || i + 1,
    name:   race.name   || `Avd ${i + 1}`,
    distance: race.distance || null,
    starters: (race.starts || race.starters || []).map(s => ({
      number:    s.number || 0,
      horse:     s.horse?.name || '—',
      driver:    s.driver  ? `${s.driver.firstName || ''} ${s.driver.lastName || ''}`.trim() : '',
      trainer:   s.trainer ? `${s.trainer.firstName || ''} ${s.trainer.lastName || ''}`.trim() : '',
      odds:      s.odds || null,
      percent:   s.pools?.vinnare?.betDistribution || null,
      scratched: s.scratched || false,
    })),
  };
}

async function getV85(date) {
  if (cacheV85.date === date && cacheV85.data) return { source: 'cache', ...cacheV85.data };
  const cal = await atgGet(`https://www.atg.se/services/racinginfo/v1/api/calendar/day/${date}`);
  const ev  = extractV85event(cal);
  if (!ev) throw new Error('Ingen V85 hittad för ' + date);
  let races = ev.races;
  if (ev.gameId) {
    try { const d = await atgGet(`https://www.atg.se/services/racinginfo/v1/api/games/${ev.gameId}`); if (d?.races) races = d.races; } catch (_) {}
  }
  const payload = { date, track: ev.track, startTime: ev.startTime, races: races.map(normalizeRace), updatedAt: new Date().toISOString() };
  cacheV85 = { date, data: payload };
  return { source: 'live', ...payload };
}

// -----------------------------------------------------------------------
// Högkvarteret-andelar
// Försöker hämta från ATGs syndicate-endpoint, annars fallback med
// kända spelläggare (tomma system publiceras torsdag–fredag av ATG)
// -----------------------------------------------------------------------
function matchSpellaggare(rawName) {
  if (!rawName) return null;
  const low = rawName.toLowerCase();
  return SPELLAGGARE.find(s =>
    low.includes(s.id.replace('-', ' ')) ||
    low.includes(s.namn.split(' ')[0].toLowerCase())
  ) || null;
}

async function getHQAndelar(date) {
  if (cacheHQ.date === date && cacheHQ.data) return { source: 'cache', andelar: cacheHQ.data };

  let raw = [];

  // Primärt: ATGs syndicate-suggestions för V85
  const endpoints = [
    `https://www.atg.se/services/racinginfo/v1/api/syndicate/suggestions?gameType=V85&date=${date}`,
    `https://www.atg.se/services/racinginfo/v1/api/syndicate?gameType=V85&date=${date}`,
    `https://www.atg.se/services/racinginfo/v1/api/products/V85`,
  ];

  for (const url of endpoints) {
    try {
      const data = await atgGet(url);
      raw = data.syndicates || data.items || (Array.isArray(data) ? data : []);
      if (raw.length > 0) break;
    } catch (_) {}
  }

  if (raw.length > 0) {
    const andelar = raw.map(a => {
      const handlerName = a.handler || a.owner || a.creator || a.syndicateOwner || '';
      const sl = matchSpellaggare(handlerName);
      return {
        id:          a.id || a.syndicateId || null,
        spellaggare: sl?.namn  || handlerName || 'Okänd',
        roll:        sl?.roll  || 'Spelläggare · Högkvarteret',
        system:      a.name    || a.systemName || a.description || 'System',
        rader:       a.rows    || a.numberOfRows || null,
        pris:        a.price   || a.sharePrice   || null,
        andelarTotalt: a.shares     || a.totalShares     || null,
        andelarKvar:   a.sharesLeft || a.availableShares || null,
        atgUrl: `https://www.atg.se/hogkvarteret/${a.id || ''}`,
      };
    });
    cacheHQ = { date, data: andelar };
    return { source: 'live', andelar };
  }

  // Fallback — visa kända spelläggare utan systemdetaljer
  const fallback = SPELLAGGARE.map(s => ({
    id:            null,
    spellaggare:   s.namn,
    roll:          s.roll,
    system:        'System publiceras torsdag–fredag',
    rader:         null,
    pris:          null,
    andelarTotalt: null,
    andelarKvar:   null,
    atgUrl:        'https://www.atg.se/hogkvarteret',
  }));
  cacheHQ = { date, data: fallback };
  return { source: 'fallback', andelar: fallback };
}

// -----------------------------------------------------------------------
// Endpoints
// -----------------------------------------------------------------------

app.get('/api/v85', async (req, res) => {
  try { res.json(await getV85(req.query.date || nextLordag())); }
  catch (err) { res.status(502).json({ error: err.message }); }
});

app.get('/api/hogkvarteret', async (req, res) => {
  try { res.json(await getHQAndelar(req.query.date || nextLordag())); }
  catch (err) { res.status(502).json({ error: err.message }); }
});

// Startlista + andelar i ett anrop
app.get('/api/allt', async (req, res) => {
  const date = req.query.date || nextLordag();
  const [v85, hq] = await Promise.allSettled([getV85(date), getHQAndelar(date)]);
  res.json({
    date,
    v85:          v85.status === 'fulfilled' ? v85.value  : { error: v85.reason?.message },
    hogkvarteret: hq.status  === 'fulfilled' ? hq.value   : { error: hq.reason?.message },
  });
});

app.get('/api/spellaggare', (_req, res) => res.json({ spellaggare: SPELLAGGARE }));

app.post('/api/refresh', (_req, res) => {
  cacheV85 = { date: null, data: null };
  cacheHQ  = { date: null, data: null };
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  v85CachedDate: cacheV85.date,
  hqCachedDate:  cacheHQ.date,
  uptime: Math.round(process.uptime()),
}));

app.listen(PORT, () => console.log(`Högkvarteret-backend på port ${PORT}`));
