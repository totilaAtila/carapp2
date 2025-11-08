# CARapp Petroșani v2 — carapp2 🏦

<div align="center">

**Aplicație web progresivă pentru Casa de Ajutor Reciproc Petroșani**

[![Status](https://img.shields.io/badge/status-production-green)](https://github.com/totilaAtila/carapp2)
[![Module](https://img.shields.io/badge/module%20func%C8%9Bionale-11%2F11-brightgreen)](https://github.com/totilaAtila/carapp2)
[![React](https://img.shields.io/badge/react-19-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-proprietary-lightgrey)](https://github.com/totilaAtila/carapp2)

</div>

---

## 📋 Cuprins

- [Despre Proiect](#-despre-proiect)
- [Module Implementate](#-module-implementate)
- [Tehnologii](#-tehnologii)
- [Instalare și Rulare](#-instalare-și-rulare)
- [Baze de Date](#-baze-de-date)
- [Compatibilitate](#-compatibilitate)
- [Structura Proiectului](#-structura-proiectului)
- [Roadmap](#-roadmap)
- [Licență](#-licență)

---

## 🎯 Despre Proiect

CARapp Petroșani v2 este o aplicație web progresivă (PWA) dezvoltată pentru gestionarea operațiunilor financiare ale Casei de Ajutor Reciproc Petroșani. Aplicația permite procesarea bazelor de date SQLite direct în browser, fără necesitatea unui server backend.

### Caracteristici Principale

- **🔒 Confidențialitate Totală** — Datele NU părăsesc niciodată dispozitivul utilizatorului
- **💾 Persistență Locală** — Lucru direct pe fișiere prin File System Access API
- **📱 PWA Compliant** — Instalabilă pe desktop și mobile
- **🌐 Cross-Platform** — Funcționează pe Windows, macOS, Linux, iOS, Android
- **⚡ Zero Latență** — Procesare în browser fără dependență de conexiune internet
- **🔢 Precizie Financiară** — Calcule cu Decimal.js conform Regulament CE 1103/97

### Status Actual

**Versiune:** 1.0.0
**Data:** Noiembrie 2025
**Module Funcționale:** 11 din 11 (100%)

---

## ✅ Module Implementate (11/11)

### 1. Generare Lună Nouă

Generarea automată a unei noi luni în baza de date DEPCRED.

**Funcționalități:**
- Detectare automată ultima lună existentă
- Validare continuitate temporală (fără sărituri de luni)
- Aplicare cotizații standard din MEMBRII.db
- Moștenire rate împrumut din luna anterioară
- Calcul dobândă stingere anticipată (4‰)
- Aplicare dividende în ianuarie pentru membri activi
- Excludere automată membri lichidați
- Actualizare solduri împrumuturi și depuneri
- Log detaliat operațiuni
- Funcție ștergere lună cu confirmare

**Tehnologii:** Decimal.js (ROUND_HALF_UP), validări stricte

---

### 2. Vizualizare Lunară

Afișarea tranzacțiilor unui membru pentru o lună specifică.

**Funcționalități:**
- Autocomplete pentru căutare membri (nume + nr. fișă)
- Selectare lună/an cu validare
- Afișare detaliată:
  - **Împrumuturi:** Dobândă, Împrumut acordat, Rată achitată, Sold
  - **Depuneri:** Cotizație, Retragere, Sold
- Layout responsive (desktop: carduri, mobile: liste)
- Export PDF cu DejaVu Sans (suport diacritice)
- Export Excel (XLSX) cu formatare
- Detectare membri lichidați (alert vizual)

**Tehnologii:** jsPDF, jspdf-autotable, xlsx (SheetJS), DejaVu Sans fonts embedded

---

### 3. Vizualizare Anuală

Rapoarte anuale complete pentru membri.

**Funcționalități:**
- Selectare an și membru
- Afișare sinteză anuală (12 luni)
- Totaluri anuale (împrumuturi, depuneri, dobânzi)
- Export PDF și Excel
- Comparații an-față-de-an
- Grafice evoluție anuală

---

### 4. Vizualizare Trimestrială

Rapoarte trimestriale pentru analiză periodică.

**Funcționalități:**
- Selectare trimestru și an
- Sinteză trimestrială (3 luni)
- Totaluri pe trimestru
- Export rapoarte PDF/Excel
- Comparații inter-trimestriale

---

### 5. Sume Lunare

Afișarea istoricului complet financiar al unui membru.

**Funcționalități Desktop (≥1024px):**
- Tabel 8 coloane sincronizate:
  - **Împrumuturi:** Dobândă | Împrumut | Rată | Sold
  - **Dată:** Lună-An
  - **Depuneri:** Cotizație | Retragere | Sold
- Scroll sincronizat vertical între toate coloanele
- Culori distinctive per secțiune

**Funcționalități Mobile (<1024px):**
- Carduri per lună cu design compact
- Tabs pentru separare Împrumuturi/Depuneri
- Vizibilitate completă fără scroll orizontal

**Operațiuni Financiare:**
- Modificare tranzacție cu dialog validat
- Calculator rată lunară (sumă ÷ luni)
- Aplicare dobândă la achitare anticipată (4‰)
- Recalculare automată lunilor ulterioare
- Salvare modificări în DEPCRED.db și MEMBRII.db

**Port complet din Python:** 2750 linii logică business replicată fidel

---

### 6. Adăugare Membru

Gestionarea adăugării și editării datelor membrilor.

**Funcționalități:**
- Formular validat pentru membri noi
- Editare date membri existenți
- Câmpuri complete (nr. fișă, nume, domiciliu, calitate, cotizație)
- Validări stricte (unicitate, format)
- Salvare în MEMBRII.db

**Tehnologii:** react-hook-form, zod validation

---

### 7. Ștergere Membru

Gestionarea ștergerii și lichidării membrilor.

**Funcționalități:**
- Căutare membru (autocomplete)
- Confirmare multiplă (acțiune ireversibilă)
- Opțiuni: ștergere completă sau marcare în LICHIDATI.db
- Log operațiuni cu timestamp

---

### 8. Listări

Listări și rapoarte complexe cu filtre multiple.

**Funcționalități:**
- Filtrare multi-criteriu (perioadă, tip tranzacție, membru)
- Calcul sume totale (sold + dobândă)
- Export rapoarte PDF/Excel cu formatare
- Sortare și grupare date
- Validări și log operațiuni
- Rapoarte personalizabile

---

### 9. Dividende

Calculul și distribuirea dividendelor anuale.

**Funcționalități:**
- Calcul automat dividende conform regulament
- Validare membri eligibili (din ACTIVI.db)
- Aplicare dividende în DEPCRED pentru luna ianuarie
- Preview calcul înainte de aplicare
- Log operațiuni dividende
- Export raport distribuire

---

### 10. Statistici

Dashboard cu analize și grafice interactive.

**Funcționalități:**
- Total membri (activi/inactivi/lichidați)
- Distribuție solduri (grafice bar și pie)
- Evoluție lunară (grafice line)
- Metrici cheie (total împrumuturi, depuneri, dobânzi)
- Comparații perioade
- Export rapoarte statistice

**Tehnologii:** Recharts pentru vizualizări

---

### 11. Conversie RON→EUR

Conversie baze de date conform Regulament CE 1103/97.

**Funcționalități:**
- Configurare curs de conversie
- Validare și aplicare conform Regulament CE
- Generare baze EUR (MEMBRIIEUR.db, DEPCREDEUR.db, etc.)
- Precizie Decimal.js (ROUND_HALF_UP)
- Toggle între RON și EUR
- Protecție baze RON după conversie (read-only)
- Log complet operațiuni conversie

---

## ✨ Tehnologii

### Framework și Limbaje

| Tehnologie | Versiune | Scop |
|------------|----------|------|
| **React** | 19.x | Framework UI |
| **TypeScript** | 5.x | Type safety |
| **Vite** | 7.x | Build tool |
| **TailwindCSS** | 3.x | Stilizare |

### Biblioteci Principale

| Bibliotecă | Scop |
|------------|------|
| **sql.js** | SQLite în browser (WebAssembly) |
| **Decimal.js** | Calcule financiare precise |
| **jsPDF + jspdf-autotable** | Export PDF |
| **xlsx (SheetJS)** | Export Excel |
| **framer-motion** | Animații UI |
| **shadcn/ui** | Componente UI (Radix UI) |
| **Lucide React** | Iconițe |
| **react-hook-form + zod** | Validare formulare |
| **Recharts** | Grafice (pentru modul Statistici) |

### Features Speciale

- **DejaVu Sans Fonts** — Embedded base64 (~1.9MB) pentru PDF cu diacritice românești
- **File System Access API** — Lucru direct pe fișiere (Chrome/Edge desktop)
- **Service Worker** — PWA cu update prompt doar la pornire
- **IndexedDB** — Cache temporar pentru sesiuni

---

## 🚀 Instalare și Rulare

### Cerințe Sistem

- **Node.js** 18+ (recomandat 22.x)
- **pnpm** (recomandat) sau npm
- **Browser:** Chrome 86+, Edge 86+, Safari 14+, Firefox 90+

### Instalare

```bash
# Clonare repository
git clone https://github.com/totilaAtila/carapp2.git
cd carapp2

# Instalare dependențe
pnpm install

# Rulare server dezvoltare
pnpm run dev
# Aplicația va fi disponibilă la http://localhost:5173

# Build pentru producție
pnpm run build
# Output în dist/

# Preview build
pnpm run preview
```

### Deploy pe Netlify

Configurația din `netlify.toml` automatizează deploy-ul:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "18.20.4"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Deploy previews se generează automat la fiecare PR.

---

## 🗄️ Baze de Date

### Metode de Încărcare

#### 1. 🗂️ Selectare Dosar (Desktop - Recomandat)

**Disponibil pe:** Chrome 86+, Edge 86+, Opera 72+ (doar desktop)

**Avantaje:**
- ⚡ Zero upload/download
- 🔄 Sincronizare automată
- 💾 Persistență între sesiuni
- 🚀 Performanță maximă

**Pași:**
1. Click "Selectează dosar cu baze de date"
2. Alege folderul cu fișiere `.db`
3. Acordă permisiune read/write (o singură dată)
4. Modificările se salvează automat la click "Salvează"

#### 2. 📤 Încărcare Fișiere (Universal)

**Disponibil pe:** Toate browserele (iOS, Android, Safari, Firefox)

**Pași:**
1. Click "Încarcă fișiere baze de date"
2. Selectează toate fișierele `.db` (multi-select)
3. Modificările rămân în memorie
4. Click "Salvează" → fișierele se descarcă local
5. Suprascrie manual fișierele vechi

---

### Structura Bazelor de Date

#### Baze RON (6 obligatorii)

⚠️ **IMPORTANT:** Respectați exact numele fișierelor (case-sensitive)!

| Fișier | Tabel Intern | Descriere |
|--------|--------------|-----------|
| **MEMBRII.db** | MEMBRII | Date personale și cotizații membri |
| **DEPCRED.db** | DEPCRED | Istoric lunar tranzacții |
| **activi.db** | ACTIVI | Membri eligibili pentru dividende |
| **INACTIVI.db** | INACTIVI | Membri inactivi temporar |
| **LICHIDATI.db** | LICHIDATI | Membri cu lichidare definitivă |
| **CHITANTE.db** | CHITANTE | Numerotare chitanțe (comun RON+EUR) |

#### Baze EUR (5 opționale)

| Fișier | Descriere |
|--------|-----------|
| **MEMBRIIEUR.db** | Date membri EUR |
| **DEPCREDEUR.db** | Istoric tranzacții EUR |
| **activiEUR.db** | Membri activi EUR |
| **INACTIVIEUR.db** | Membri inactivi EUR |
| **LICHIDATIEUR.db** | Membri lichidați EUR |

**Notă:** CHITANTE.db este comună pentru RON și EUR.

---

### Schema SQL

#### Tabelul MEMBRII

```sql
CREATE TABLE IF NOT EXISTS MEMBRII (
  NR_FISA          INTEGER PRIMARY KEY,
  NUM_PREN         TEXT UNIQUE NOT NULL,
  DOMICILIUL       TEXT,
  CALITATEA        TEXT,
  DATA_INSCR       TEXT,
  COTIZATIE_STANDARD REAL DEFAULT 0.00
);
```

#### Tabelul DEPCRED

```sql
CREATE TABLE IF NOT EXISTS DEPCRED (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nr_fisa    INTEGER NOT NULL,
  luna       INTEGER NOT NULL,
  anul       INTEGER NOT NULL,
  dobanda    REAL DEFAULT 0.00,
  impr_deb   REAL DEFAULT 0.00,
  impr_cred  REAL DEFAULT 0.00,
  impr_sold  REAL DEFAULT 0.00,
  dep_deb    REAL DEFAULT 0.00,
  dep_cred   REAL DEFAULT 0.00,
  dep_sold   REAL DEFAULT 0.00,
  prima      INTEGER DEFAULT 0,
  UNIQUE(nr_fisa, anul, luna)
);
```

#### Tabelul LICHIDATI

```sql
CREATE TABLE IF NOT EXISTS LICHIDATI (
  nr_fisa         INTEGER PRIMARY KEY,
  data_lichidare  TEXT NOT NULL
);
```

#### Tabelul ACTIVI

```sql
CREATE TABLE IF NOT EXISTS ACTIVI (
  NR_FISA   INTEGER PRIMARY KEY,
  DIVIDEND  REAL DEFAULT 0.00
);
```

#### Tabelul INACTIVI

```sql
CREATE TABLE IF NOT EXISTS INACTIVI (
  nr_fisa        INTEGER PRIMARY KEY,
  data_inactiv   TEXT
);
```

#### Tabelul CHITANTE

```sql
CREATE TABLE IF NOT EXISTS CHITANTE (
  nr_chitanta  INTEGER PRIMARY KEY AUTOINCREMENT,
  data_emitere TEXT NOT NULL,
  nr_fisa      INTEGER NOT NULL,
  suma         REAL NOT NULL,
  tip          TEXT
);
```

---

## 📱 Compatibilitate

### Desktop

| Browser | File System API | Upload/Download | PWA Install |
|---------|-----------------|-----------------|-------------|
| **Chrome 86+** | ✅ | ✅ | ✅ |
| **Edge 86+** | ✅ | ✅ | ✅ |
| **Safari 14+** | ❌ | ✅ | ✅ |
| **Firefox 90+** | ❌ | ✅ | ✅ |

### Mobile

| Platformă | Upload | Download | PWA Install |
|-----------|--------|----------|-------------|
| **iOS Safari** | ✅ | ✅ | ✅ |
| **Android Chrome** | ✅ | ✅ | ✅ |
| **iPadOS** | ✅ | ✅ | ✅ |

**iOS/Safari Optimizări:**
- MIME types: `application/x-sqlite3, application/vnd.sqlite3, application/octet-stream`
- Download stabilizat (DOM append + delay cleanup)
- Detectare precisă iOS/iPadOS (`maxTouchPoints > 1`)

---

## 📂 Structura Proiectului

```
carapp2/
├── public/
│   ├── fonts/
│   │   ├── DejaVuSans.ttf
│   │   └── DejaVuSans-Bold.ttf
│   ├── service-worker.js
│   ├── manifest.json
│   └── sume_lunare.py          # Referință Python (2750 linii)
│
├── src/
│   ├── components/
│   │   ├── AdaugaMembru.tsx    # Modul adăugare/editare membri
│   │   ├── StergeMembru.tsx    # Modul ștergere membri
│   │   ├── GenerareLuna.tsx    # Modul generare lună nouă
│   │   ├── VizualizareLunara.tsx # Modul vizualizare lunară
│   │   ├── SumeLunare.tsx      # Modul sume lunare (1187 linii)
│   │   ├── Dashboard.tsx       # Dashboard principal
│   │   ├── LandingPage.tsx     # Selecție sursă date
│   │   ├── Sidebar.tsx         # Meniu lateral animat
│   │   ├── Taskbar.tsx         # Bară fixă jos
│   │   ├── CurrencyToggle.tsx  # Toggle RON/EUR
│   │   ├── UpdatePrompt.tsx    # PWA update prompt
│   │   └── ui/                 # shadcn/ui components
│   │
│   ├── services/
│   │   ├── databaseManager.ts  # Dual method (filesystem + upload)
│   │   ├── databasePersistence.ts # IndexedDB cache
│   │   └── platformDetector.ts # Detectare iOS/Safari
│   │
│   ├── logic/
│   │   ├── generateMonth.ts    # Logică generare lună
│   │   ├── finance.ts          # Calcule Decimal.js
│   │   └── dbLoader.ts         # Încărcare baze
│   │
│   ├── utils/
│   │   └── dejavu-fonts.ts     # DejaVu Sans base64 (~1.9MB)
│   │
│   ├── types/
│   │   └── sqljs.d.ts          # Type definitions sql.js
│   │
│   ├── lib/
│   │   └── utils.ts            # Utilități TailwindCSS
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## 🛣️ Roadmap

### ✅ Completat (Octombrie-Noiembrie 2025)

- [x] Setup Vite + React 19 + TypeScript
- [x] Integrare sql.js + Decimal.js
- [x] File System Access API + fallback upload
- [x] Platform detection (iOS/Safari)
- [x] **Modul 1:** Generare Lună (port Python)
- [x] **Modul 2:** Vizualizare Lunară (export PDF/Excel)
- [x] **Modul 3:** Vizualizare Anuală
- [x] **Modul 4:** Vizualizare Trimestrială
- [x] **Modul 5:** Sume Lunare (2750 linii port Python)
- [x] **Modul 6:** Adăugare Membru (CRUD)
- [x] **Modul 7:** Ștergere Membru
- [x] **Modul 8:** Listări (rapoarte complexe)
- [x] **Modul 9:** Dividende (calcul și distribuire)
- [x] **Modul 10:** Statistici (Recharts, dashboard)
- [x] **Modul 11:** Conversie RON→EUR (dual currency)
- [x] Compatibilitate iOS/MacOS 100%
- [x] PWA update prompt (best practice)
- [x] UI/UX polish (Landing Page, Dashboard)

### 🟢 Viitor

- [ ] Testare automată (Vitest + RTL, >80% coverage)
- [ ] Performance optimizations
- [ ] Offline-first enhancements
- [ ] Backup și restore automat

---

## ⚠️ Limitări Cunoscute

### 1. File System Access API

❌ **NU funcționează pe:**
- Safari (macOS/iOS)
- Firefox
- Browsere mobile

✅ **Funcționează pe:**
- Chrome 86+ (desktop)
- Edge 86+ (desktop)

➡️ **Soluție:** Aplicația detectează automat și oferă fallback upload universal.

### 2. Conversie Valutară

✅ **Conversie RON→EUR implementată** conform Regulament CE 1103/97

**Caracteristici:**
- Configurare curs de conversie
- Precizie Decimal.js (ROUND_HALF_UP)
- Generare baze EUR complete
- Toggle între monede
- Protecție date RON după conversie

---

## 📊 Metrici Proiect

| Metric | Valoare |
|--------|---------|
| **Versiune** | 1.0.0 |
| **Module** | 11/11 (100%) |
| **Linii cod** | ~15,000 TypeScript |
| **Componente** | 18 principale + 8 UI |
| **Test coverage** | 0% (planificat 80%) |
| **Compatibilitate** | 100% (cu fallback) |
| **Ultima actualizare** | 8 noiembrie 2025 |

---

## 📝 Changelog

### [8 Noiembrie 2025] — Versiune 1.0.0 - Release Production

**🎉 Toate cele 11 module implementate:**

**Module Core:**
- ✅ Generare Lună Nouă
- ✅ Vizualizare Lunară
- ✅ Vizualizare Anuală
- ✅ Vizualizare Trimestrială
- ✅ Sume Lunare

**Module Gestiune:**
- ✅ Adăugare Membru
- ✅ Ștergere Membru

**Module Avansate:**
- ✅ Listări (rapoarte complexe)
- ✅ Dividende (calcul și distribuire)
- ✅ Statistici (dashboard cu Recharts)
- ✅ Conversie RON→EUR (Regulament CE 1103/97)

**Progres:** 71% → 100% (toate modulele finalizate)

### [2 Noiembrie 2025] — UX/UI Polish

- PWA update check doar la pornire
- Landing Page simplificat
- Dashboard card unic pe 2 coloane
- Schema SQL completă documentată

### [29 Octombrie 2025] — Module CRUD

- Adăugare Membru (formular validat)
- Ștergere Membru (confirmare dublă)

### [27 Octombrie 2025] — Module Vizualizare

- Vizualizare Lunară (export PDF/Excel)
- Sume Lunare (2750 linii port Python)

### [24 Octombrie 2025] — Setup Inițial

- Setup Vite + React 19 + TypeScript
- File System Access API + fallback
- Modul Generare Lună
- PWA support

---

## 🤝 Contribuții

Proiectul acceptă contribuții. Pentru modificări majore, deschideți mai întâi un issue pentru discuții.

### Priorități

🔥 **Urgent:**
- Modul Listări

🟡 **Important:**
- Modul Statistici
- Testare automată

### Cod Style

- TypeScript obligatoriu
- ESLint + Prettier configured
- Comentarii în română pentru logică business
- Decimal.js pentru calcule financiare
- shadcn/ui pentru componente noi

---

## 📄 Licență

Copyright © 2025 CAR Petroșani. Toate drepturile rezervate.

**Proprietate privată** — Redistribuirea sau utilizarea comercială necesită acordul scris al autorilor.

---

## 📞 Contact

- 🐛 [GitHub Issues](https://github.com/totilaAtila/carapp2/issues)
- 💬 [GitHub Discussions](https://github.com/totilaAtila/carapp2/discussions)

---

<div align="center">

**Versiune:** 1.0.0
**Status:** ✅ Production Ready
**Completare:** 100%

[⬆ Înapoi sus](#carapp-petroșani-v2--carapp2-)

</div>
