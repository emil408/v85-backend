# V85-tips Backend

Hämtar verklig startlista från ATG varje lördag och serverar den till frontend utan CORS-problem.

---

## Filer

```
v85-backend/
├── server.js          ← Express-backend, hämtar ATG-data
├── package.json
├── vercel.json        ← Konfiguration för Vercel (gratis)
└── public/
    └── index.html     ← Frontend-sajten
```

---

## Deploy på Vercel (gratis, 5 minuter)

### 1. Installera Vercel CLI
```bash
npm install -g vercel
```

### 2. Logga in
```bash
vercel login
```

### 3. Deploy från projektmappen
```bash
cd v85-backend
npm install
vercel --prod
```

Vercel ger dig en URL som ser ut som `https://v85-backend-xxx.vercel.app`

### 4. Uppdatera frontend
Öppna `public/index.html` och byt ut:
```js
'https://DIN-APP.vercel.app/api/v85'
```
till din Vercel-URL, t.ex.:
```js
'https://v85-backend-abc123.vercel.app/api/v85'
```

### 5. Deploy igen
```bash
vercel --prod
```

---

## Deploy på Railway (alternativ, också gratis)

1. Skapa konto på railway.app
2. "New Project" → "Deploy from GitHub"
3. Pusha koden till GitHub, koppla repot
4. Railway sätter PORT automatiskt — klart!

---

## API-endpoints

| Endpoint         | Metod | Beskrivning                          |
|------------------|-------|--------------------------------------|
| `/api/v85`       | GET   | Hämtar V85-startlista (cachad)       |
| `/api/refresh`   | POST  | Rensar cache (anropa manuellt vid behov) |
| `/api/health`    | GET   | Hälsokoll + cache-status             |

### Exempelsvar `/api/v85`
```json
{
  "source": "live",
  "date": "2026-05-17",
  "track": "Solvalla",
  "startTime": "16:10",
  "updatedAt": "2026-05-14T10:22:00Z",
  "races": [
    {
      "number": 1,
      "name": "V85-1",
      "distance": 2140,
      "starters": [
        {
          "number": 1,
          "horse": "Zola Kronos",
          "driver": "Örjan Kihlström",
          "trainer": "Daniel Redén",
          "percent": 42.5,
          "odds": 2.1,
          "scratched": false
        }
      ]
    }
  ]
}
```

---

## Caching

Datan cachas i minnet per lördag-datum. Om du startar om servern hämtas ny data automatiskt.
För att tvinga en ny hämtning:
```bash
curl -X POST https://din-app.vercel.app/api/refresh
```

---

## ATG och upphovsrätt

Startlistdata tillhör ATG. Sajter som Gratistravtips.se och SvenskaTrav
visar samma data via samarbetsavtal. Om du skallar upp sajten — kontakta ATG
för ett officiellt avtal på atg.se/partner.

---

## Lokal utveckling

```bash
npm install
npm run dev
# → http://localhost:3000
```
