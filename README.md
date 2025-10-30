# CARapp Petroșani v2 — carapp2 🏦

<div align="center">

**Aplicație web experimentală pentru Casa de Ajutor Reciproc Petroșani**
*Explorare File System Access API pentru lucru direct pe fișiere locale*

[![Status](https://img.shields.io/badge/status-beta-green)](https://github.com/totilaAtila/carapp2)
[![Module](https://img.shields.io/badge/module%20funcționale-3%2F7-yellow)](https://github.com/totilaAtila/carapp2)
[![React](https://img.shields.io/badge/react-19-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-proprietary-lightgrey)](https://github.com/totilaAtila/carapp2)

[🌐 CARapp_web (beta-test)](https://github.com/totilaAtila/CARapp_web) • [🖥️ Desktop (Python-PRODUCTION)](https://github.com/totilaAtila/CARpetrosani) • [📖 Documentație](#-documentație-completă)

</div>

---

## ⚡ Status Actual (27 octombrie 2025)

> **Versiune beta** — 3 din 7 module majore sunt funcționale.
> Pentru utilizare în **producție**, folosiți [CARpetrosani](https://github.com/totilaAtila/CARpetrosani) care are toate modulele implementate + conversie EUR.

| Aspect | carapp2 | CARapp_web |
|--------|---------|------------|
| **Stadiu** | 🟡 Beta (funcțional parțial) | ✅ Beta-test |
| **Module funcționale** | 3 / 7 (Generare, Vizualizare, Sume Lunare) | 7 / 21(parțial) |
| **Conversie RON→EUR** | ❌ Nu există | ✅ Implementată complet |
| **Metoda primară** | File System Access API | Upload fișiere |
| **Compatibilitate** | Desktop (Chrome/Edge) + iOS/Safari fallback | Universală (toate browserele) |
| **Mobile/iOS** | ✅ Suport complet (upload) | ✅ Suport complet |

---

## 🎯 Concept și Diferențiere

### De ce există carapp2?

**carapp2** explorează o abordare **hibridă modernă** pentru lucrul cu baze de date SQLite în browser:

🔑 **Caracteristica unică:** [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- Selectare dosar întreg din sistemul de fișiere
- Lucru **direct pe fișiere** (zero copii în memorie)
- Sincronizare **automată** la salvare
- Experiență **zero-friction** (fără upload/download)

⚠️ **Limitare:** Funcționează DOAR pe Chrome/Edge desktop, dar fallback upload universal (iOS/Safari/Firefox).

### Când să folosești carapp2?

✅ **DA** — pentru:
- Experimentare cu File System Access API
- Development/testing pe desktop (Chrome/Edge)
- Utilizare pe mobil/iOS (cu upload method)
- Prototipare rapidă features noi
- Învățare tehnologii moderne web

❌ **NU** — pentru:
- **Producție cu toate modulele** (folosește CARapp_web)
- Când ai nevoie de **conversie RON→EUR**
- Când ai nevoie de **modulul Listări** (nu implementat încă)

---

## ✅ Module Funcționale (3 / 7)

### 🟢 Modul 1: Generare Lună

**Status:** ✅ Complet funcțional și testat

Port exact din aplicația Python desktop (`generare_luna.py`) cu îmbunătățiri.

**Funcționalități:**
- Detectare automată ultima lună din DEPCRED
- Calculare automată lună următoare (nu permite sărituri)
- Validare strictă — doar luna imediat următoare
- Verificare membri lichidați — excludere automată din LICHIDATI.db
- Aplicare cotizații — din coloana `COTIZATIE_STANDARD` (MEMBRII)
- Moștenire rate împrumut — din `impr_cred` luna anterioară
- Calcul dobândă stingere — 4‰ pe suma pozitivelor
- Dividende în ianuarie — pentru membri din ACTIVI.db
- Actualizare solduri — împrumuturi + depuneri
- Precizie Decimal.js — `ROUND_HALF_UP` conform Regulament CE
- Log live + Export DEPCRED + Funcție ștergere lună

### 🟢 Modul 2: Vizualizare Lunară

**Status:** ✅ Complet funcțional și testat

Port complet din aplicația Python (`vizualizare_lunara.py`).

**Funcționalități:**
- Search autocomplete pentru membri (nume + nr fișă)
- Selectare lună/an cu validare
- Afișare tranzacții lunare cu toate detaliile:
  - Împrumuturi: Dobândă, Împrumut, Rată Achitată, Sold
  - Depuneri: Cotizație, Retragere, Sold
- Layout responsive desktop/mobile cu carduri
- Export PDF cu DejaVu Sans (suport diacritice românești)
- Export Excel (XLSX) cu formatare
- Detectare membri lichidați (alert vizual)
- Validare date lunare complete

**Tehnologii speciale:**
- DejaVu Sans fonts embedded (base64) pentru PDF corect
- jsPDF + jspdf-autotable pentru generare PDF
- xlsx library pentru export Excel
- Decimal.js pentru calcule financiare precise

### 🟢 Modul 3: Sume Lunare

**Status:** ✅ Complet funcțional și testat (2750 linii port Python)

Port complet din aplicația Python (`sume_lunare.py`) - unul dintre cele mai complexe module.

**Funcționalități desktop (≥1024px):**
- Search autocomplete pentru membri (nume + nr fișă)
- Afișare istoric financiar complet în 8 coloane sincronizate:
  - **Secțiunea ÎMPRUMUTURI** (4 coloane): Dobândă, Împrumut, Rată Achitată, Sold Împrumut
  - **Secțiunea DATĂ** (1 coloană centrală): Lună-An
  - **Secțiunea DEPUNERI** (3 coloane): Cotizație, Retragere, Sold Depuneri
- Scroll sincronizat între toate cele 8 coloane
- Culori distinctive per secțiune (albastru/verde/mov)

**Funcționalități mobile (<1024px):**
- Carduri per lună cu design consistent
- Tabs pentru separare Împrumuturi/Depuneri
- Toate informațiile vizibile fără scroll orizontal

**Operațiuni financiare:**
- Dialog modificare tranzacție cu:
  - Calculator rată lunară: sumă împrumut ÷ nr luni → rată
  - Validări stricte (rata ≤ sold, retragere ≤ fond disponibil)
  - Actualizare cotizație standard în MEMBRII.db
- Aplicare dobândă la achitare anticipată:
  - Calcul: sold_împrumut × 0.004 (4‰)
  - Salvare în câmpul "dobanda" (NU la sold - va fi folosit în Listări)
  - Confirmare cu preview calcul
- Recalculare automată lunilor ulterioare după modificări
- Salvare modificări în DEPCRED.db și MEMBRII.db cu validări complete
- Detectare membri lichidați cu blocare operațiuni

**Logica business (100% din Python):**
- Precizie financiară cu Decimal.js (20 cifre, ROUND_HALF_UP)
- Rata dobândă 0.4% (4‰) - `RATA_DOBANDA_DEFAULT = 0.004`
- Prag zeroizare 0.005 RON - `PRAG_ZEROIZARE = 0.005`
- Formula solduri: `sold_nou = sold_vechi + debit - credit`
- Toate validările din Python (sold, fond disponibil)

**Fișier:** `src/components/SumeLunare.tsx` (1187 linii)

---

## 🔒 Module 4-7: În Dezvoltare

| Modul | Status | Complexitate | Estimare | Prioritate |
|-------|--------|--------------|----------|------------|
| **Membri (CRUD)** | ❌ UI placeholder | Mare | 2-3 săpt | 🔥 Urgent |
| **Statistici** | ❌ UI placeholder | Medie | 1-2 săpt | 🟡 Important |
| **Rapoarte PDF** | ❌ UI placeholder | Mare | 2-3 săpt | 🟢 Nice-to-have |
| **Listări** | ❌ UI placeholder | Mare | 2-3 săpt | 🔥 Urgent |

**Efort total estimat:** 8-12 săptămâni (2-3 luni) pentru paritate completă cu CARapp_web

---

## 📱 Compatibilitate iOS/MacOS

### ✅ Suport Complet iPhone, iPad, MacOS Safari

**Status:** 🟢 100% funcțional pe toate platformele Apple

| Platformă | Upload | Download | Status |
|-----------|--------|----------|--------|
| **iPhone** (Safari/Chrome) | ✅ Funcțional | ✅ Funcțional | **COMPATIBIL** |
| **iPad** (Safari/Chrome) | ✅ Funcțional | ✅ Funcțional | **COMPATIBIL** |
| **MacOS Safari** | ✅ Funcțional | ✅ Funcțional | **COMPATIBIL** |

**Îmbunătățiri iOS-specific:**
- Accept attribute cu MIME types pentru iOS Safari: `application/x-sqlite3, application/vnd.sqlite3, application/octet-stream`
- Download stabilizat: element `<a>` adăugat în DOM cu delay 100ms pentru cleanup
- Instrucțiuni interactive pentru utilizatori iOS (ghid pas-cu-pas)
- Detectare precisă iOS: `/iPad|iPhone|iPod/` + iPadOS 13+ (`maxTouchPoints > 1`)

**Instrucțiuni iOS/Safari (afișate automat):**
1. Salvați fișierele .db în app Files (Fișiere)
2. Selectați din iCloud Drive / Pe iPhone-ul meu
3. Selecție multiplă (țineți apăsat)
4. Fișierele .db se descarcă în Downloads

**Testare:** Upload/Download testat pe iOS Safari, MacOS Safari, iPadOS

---

## ✨ Tehnologii

| Categorie | Tehnologie | Versiune |
|-----------|------------|----------|
| **Framework** | React | 19.x |
| **Limbaj** | TypeScript | 5.x |
| **Build Tool** | Vite | 7.x |
| **Stilizare** | TailwindCSS | 3.x |
| **Componente UI** | shadcn/ui | Latest |
| **Animații** | framer-motion | 11.x |
| **Baze de date** | sql.js (SQLite WASM) | 1.11.x |
| **Calcule financiare** | Decimal.js | 10.4.x |
| **PDF Export** | jsPDF + jspdf-autotable | Latest |
| **Excel Export** | xlsx (SheetJS) | Latest |
| **Iconițe** | Lucide React | Latest |
| **PWA** | Service Worker + Manifest | - |

### 🎨 Features speciale

- **DejaVu Sans Fonts** — Embedded ca base64 (~1.9MB) pentru suport diacritice românești în PDF
- **Decimal.js** — Precizie maximă, conform Regulament CE (ROUND_HALF_UP, 20 cifre)
- **sql.js** — SQLite nativ în browser (fără backend)
- **framer-motion** — Animații fluide pentru sidebar

---

## 🚀 Instalare și Rulare

### Cerințe Sistem

- Node.js 18+ (testat cu 22.13.0)
- pnpm (recomandat) sau npm
- Browser: Chrome/Edge 86+ (pentru File System API) sau orice browser modern (fallback)

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

## 🌐 Deploy pe Netlify

- Configurația din [`netlify.toml`](./netlify.toml) rulează automat `npm run build`, publică directorul `dist/` și fixează versiunea de Node la 18.20.4 (aceeași cu mediul local recomandat).
- Pentru deploy previews nu mai e nevoie de pași manuali: imediat ce deschizi sau actualizezi un PR, Netlify va folosi setările din repo și va aplica regulile SPA (redirect către `index.html`).
- Singura grijă este ca repository-ul GitHub să fie conectat în Netlify; în rest, nu trebuie să configurezi tu nimic suplimentar pentru fiecare build.

---

## 📁 Lucrul cu Bazele de Date

### Metoda 1: 🗂️ Selectare Dosar (Recomandată pentru Desktop)

**✅ Disponibilă pe:** Chrome 86+, Edge 86+, Opera 72+ (doar desktop)
**❌ NU funcționează pe:** Safari, Firefox, iOS, Android

#### Avantaje
- ⚡ **Zero upload/download** — lucru direct pe fișiere
- 🔄 **Sincronizare automată** — modificările se scriu instant
- 💾 **Persistență** — datele rămân între sesiuni
- 🚀 **Performanță** — fără copii în memorie

#### Cum funcționează

1. **La pornire:** Click "🗂️ Selectează dosar cu baze de date"
2. **Selectare:** Alege folderul care conține `.db` files
3. **Permisiune:** Browserul cere acces read/write (o singură dată)
4. **Lucru:** Modificările sunt în memorie + pe disc
5. **Salvare:** Click "💾 Salvează" → scriere automată în fișiere

### Metoda 2: 📤 Încărcare Fișiere (Universal - iOS/Safari/Firefox)

**✅ Disponibilă pe:** Toate browserele și platformele (iOS, Android, Safari, Firefox)

#### Cum funcționează

1. **La pornire:** Click "📤 Încarcă fișiere baze de date"
2. **Selectare:** Alege `MEMBRII.db`, `DEPCRED.db`, etc. (multi-select)
3. **Lucru:** Modificările sunt în memorie
4. **Salvare:** Click "💾 Salvează" → download fișiere
5. **Persistență:** Suprascrie manual fișierele vechi

### Fișiere Necesare

| Fișier | Status | Descriere |
|--------|--------|-----------|
| **MEMBRII.db** | ✅ Obligatoriu | Date membri (nr_fisa, NUM_PREN, COTIZATIE_STANDARD) |
| **DEPCRED.db** | ✅ Obligatoriu | Istoric lunar (nr_fisa, luna, anul, solduri) |
| **LICHIDATI.db** | ℹ️ Opțional | Membri lichidați (nr_fisa, data_lichidare) |
| **ACTIVI.db** | ℹ️ Opțional | Membri activi (nr_fisa, DIVIDEND) |

**Validare automată:**
- ✅ Header SQLite (`SQLite format 3`)
- ✅ Structură tabele (MEMBRII, DEPCRED)
- ❌ Fișiere corupte sau invalide sunt respinse

---

## 📂 Structura Proiectului
```
carapp2/
├── public/                     # Fișiere statice
│   ├── fonts/                 # DejaVu Sans TTF (pentru conversie)
│   │   ├── DejaVuSans.ttf
│   │   └── DejaVuSans-Bold.ttf
│   ├── sume_lunare.py         # Referință Python (2750 linii)
│   ├── sw.js                  # Service Worker (PWA)
│   └── manifest.json          # PWA manifest
│
├── src/
│   ├── components/            # Componente React
│   │   ├── LandingPage.tsx    # Selecție sursă date
│   │   ├── Dashboard.tsx      # Dashboard principal
│   │   ├── GenerareLuna.tsx   # ⭐ MODUL FUNCȚIONAL
│   │   ├── VizualizareLunara.tsx # ⭐ MODUL FUNCȚIONAL
│   │   ├── SumeLunare.tsx     # ⭐ MODUL FUNCȚIONAL (1187 linii)
│   │   ├── Sidebar.tsx        # Meniu lateral animat
│   │   ├── Taskbar.tsx        # Bară fixă jos
│   │   └── ui/                # shadcn/ui components
│   │
│   ├── services/              # Business logic
│   │   ├── databaseManager.ts # ⭐ Dual method + iOS compatibility
│   │   ├── platformDetector.ts# Detectare iOS/Safari
│   │   └── databasePersistence.ts
│   │
│   ├── logic/                 # Core algorithms
│   │   ├── generateMonth.ts   # ⭐ Port Python (generare_luna.py)
│   │   └── finance.ts         # Calcule Decimal.js
│   │
│   ├── utils/                 # Utilități
│   │   └── dejavu-fonts.ts    # ⭐ DejaVu Sans base64 (~1.9MB)
│   │
│   ├── types/                 # TypeScript
│   │   └── sqljs.d.ts         # Type definitions sql.js
│   │
│   ├── App.tsx                # Root component
│   ├── main.tsx               # Entry point
│   └── index.css              # Tailwind globals
│
├── scripts/
│   └── convert-fonts.cjs      # Script conversie TTF → base64
│
├── README.md                  # (acest fișier)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

---

## 🛣️ Roadmap

### ✅ Realizat (Ultimele 3 zile)

- [x] **Modul Vizualizare Lunară** — complet funcțional
  - Search autocomplete, export PDF/Excel
  - DejaVu Sans fonts pentru diacritice
  - Layout responsive desktop/mobile
- [x] **Modul Sume Lunare** — complet funcțional (2750 linii port Python)
  - 8 coloane sincronizate (desktop)
  - Carduri responsive (mobile)
  - Modificare tranzacții cu validări complete
  - Aplicare dobândă + recalculare automată
  - Salvare în DEPCRED.db și MEMBRII.db
- [x] **Compatibilitate iOS/MacOS** — 100% funcțional
  - MIME types pentru iOS Safari
  - Download stabilizat cu DOM append
  - Instrucțiuni interactive pentru utilizatori

### 🔴 Prioritate Urgentă (4-6 săptămâni)

**Săptămâna 1-3: Gestiune Membri (CRUD)**
- [ ] Lista membri (tabel cu sort/filter)
- [ ] Căutare după nume/număr fișă
- [ ] Detalii membru (modal sau pagină separată)
- [ ] Adăugare membru nou (formular validat)
- [ ] Editare date membru
- [ ] Lichidare membru (flag în LICHIDATI.db)
- [ ] Status vizual (activ/lichidat)

**Săptămâna 4-6: Modul Listări**
- [ ] Port din Python (listari.py)
- [ ] Afișare tranzacții cu filtre
- [ ] Calcul sume totale (sold + dobândă)
- [ ] Export rapoarte
- [ ] Validări și log operațiuni

### 🟡 Prioritate Medie (2-4 săptămâni)

**Statistici**
- [ ] Integrare Recharts
- [ ] Total membri (activi/lichidați/total)
- [ ] Distribuție solduri (grafic bar)
- [ ] Evoluție lunară (grafic line)

### 🟢 Long-term (3+ luni)

**Conversie RON→EUR** (port din CARapp_web)
- [ ] Port logică conversie (conversionUtils.js)
- [ ] UI configurare curs
- [ ] Generare baze EUR (_EUR.db suffix)
- [ ] Toggle dual currency

**Testare & Optimizare**
- [ ] Vitest pentru `logic/` (>80% coverage)
- [ ] React Testing Library pentru `components/`
- [ ] Performance profiling

---

## ⚠️ Limitări Cunoscute

### 1. 🌐 File System Access API — Compatibilitate

❌ **NU funcționează pe:**
- Safari (macOS și iOS) — Folosește fallback upload ✅
- Firefox — Folosește fallback upload ✅
- Browsere mobile — Folosește fallback upload ✅

✅ **Funcționează pe:**
- Chrome 86+ (desktop)
- Edge 86+ (desktop)
- Opera 72+ (desktop)

➡️ **Soluție:** Aplicația detectează automat și oferă fallback upload universal (iOS/Safari/Firefox compatibil 100%).

### 2. 🧩 Module Incomplete

**Status curent:** 3 / 7 module (43% completare)

| Modul | % Completare | Blocant producție? |
|-------|--------------|-------------------|
| Generare Lună | 100% | ❌ Nu |
| Vizualizare Lunară | 100% | ❌ Nu |
| Sume Lunare | 100% | ❌ Nu |
| Membri (CRUD) | 0% | ✅ DA |
| Statistici | 0% | ⚠️ Parțial |
| Listări | 0% | ✅ DA |
| Rapoarte PDF | 0% | ⚠️ Parțial |

**Efort până la 100%:** 6-10 săptămâni (1.5-2.5 luni)

### 3. 💶 Conversie RON→EUR — ABSENT

❌ **Această versiune NU are conversie valutară.**

Pentru conversie conform **Regulamentului CE 1103/97**, folosiți [CARapp_web](https://github.com/totilaAtila/CARapp_web).

**Efort port în carapp2:** 2-3 săptămâni (după module de bază)

---

## 🤝 Contribuții

Proiectul este **open for contributions**.

### Cum să contribui

1. **Fork** repository-ul
2. **Clone** local: `git clone https://github.com/YOUR_USERNAME/carapp2.git`
3. **Branch** nou: `git checkout -b feature/NumeFeature`
4. **Cod** + **teste** (dacă e cazul)
5. **Commit**: `git commit -m "feat: Adaugă NumeFeature"`
6. **Push**: `git push origin feature/NumeFeature`
7. **Pull Request** cu descriere detaliată

### Priorități contribuții

🔥 **Urgent:**
- Modul Membri (CRUD complet)
- Modul Listări (port din Python)

🟡 **Important:**
- Modul Statistici (integrare Recharts)
- Testare automată (Vitest + RTL)

🟢 **Nice-to-have:**
- Rapoarte PDF avansate
- Conversie RON→EUR (port din CARapp_web)

### Cod Style

- **TypeScript** obligatoriu (no `.js` files noi)
- **ESLint** + **Prettier** configured
- **Comentarii** în română pentru logică business
- **Decimal.js** pentru orice calcul financiar
- **shadcn/ui** pentru componente noi (nu CSS custom)

---

## 📄 Licență

Copyright © 2025 CAR Petroșani. Toate drepturile rezervate.

**Proprietate privată** — Nu se permite redistribuire sau utilizare comercială fără acordul scris al autorilor.

---

## 📞 Contact & Suport

### Issues & Bugs
- 🐛 [GitHub Issues](https://github.com/totilaAtila/carapp2/issues)

### Discuții & Întrebări
- 💬 [GitHub Discussions](https://github.com/totilaAtila/carapp2/discussions)

### Repository-uri Conexe
- 🖥️ [CARpetrosani](https://github.com/totilaAtila/CARpetrosani) — Aplicația Python desktop originală (PyQt5)
- 🌐 [CARapp_web](https://github.com/totilaAtila/CARapp_web) — Versiunea web production-ready (toate modulele)

---

## 📊 Status Proiect

| Metric | Valoare | Target |
|--------|---------|--------|
| **Versiune** | Beta v0.3.0 | v1.0.0 |
| **Module complete** | 3 / 7 (43%) | 7 / 7 (100%) |
| **Test coverage** | 0% | 80% |
| **Compatibilitate** | 100% (fallback) | 100% |
| **Efort rămas** | 6-10 săptămâni | - |
| **Ultima actualizare** | 27 oct 2025 | - |

---

## 📝 Changelog

### [27 octombrie 2025] — Implementare Masivă (3 zile)

**🎉 Module noi complet funcționale:**

✅ **Modul Vizualizare Lunară** — Port complet Python
- Search autocomplete (nume + nr fișă)
- Afișare tranzacții lunare cu toate detaliile
- Export PDF cu DejaVu Sans (suport diacritice românești)
- Export Excel (XLSX) cu formatare
- Layout responsive desktop/mobile
- Detectare membri lichidați

✅ **Modul Sume Lunare** — Port complet Python (2750 linii)
- 8 coloane sincronizate în 3 secțiuni (desktop)
- Carduri responsive per lună (mobile)
- Dialog modificare tranzacție:
  - Calculator rată lunară (sumă ÷ nr luni)
  - Validări stricte (rata ≤ sold, retragere ≤ fond)
  - Actualizare cotizație standard în MEMBRII.db
- Aplicare dobândă la achitare anticipată (4‰)
- Recalculare automată lunilor ulterioare
- Salvare modificări în DEPCRED.db și MEMBRII.db
- Logica business 100% din Python replicată

✅ **Compatibilitate iOS/MacOS** — 100% funcțional
- MIME types pentru iOS Safari upload
- Download stabilizat (DOM append + delay 100ms)
- Instrucțiuni interactive pentru utilizatori iOS/Safari
- Detectare precisă iOS/iPadOS 13+
- Testat pe iPhone, iPad, MacOS Safari

**🎨 Îmbunătățiri UI/UX:**
- DejaVu Sans fonts embedded (base64, ~1.9MB) pentru PDF cu diacritice
- Scroll sincronizat între 8 coloane (Sume Lunare desktop)
- Tabs Împrumuturi/Depuneri (Sume Lunare mobile)
- Layout consistent între module

**📁 Fișiere majore:**
- `src/components/SumeLunare.tsx` (1187 linii)
- `src/components/VizualizareLunara.tsx` (complet)
- `src/utils/dejavu-fonts.ts` (fonts base64)
- `public/sume_lunare.py` (referință Python, 2750 linii)
- `scripts/convert-fonts.cjs` (conversie TTF → base64)

**🔧 Tehnologii noi:**
- jsPDF + jspdf-autotable (PDF export)
- xlsx (SheetJS) pentru Excel export
- DejaVu Sans fonts pentru diacritice românești
- Decimal.js ROUND_HALF_UP conform Regulament CE

**📊 Progres:** 14% → 43% completare (3 din 7 module)

### [24 octombrie 2025] — Documentare completă
- ✅ Unificare README + PROJECT_CONTEXT
- ✅ Comparație detaliată cu CARapp_web
- ✅ Clarificare stadiu actual
- ✅ Roadmap realist
- ✅ Documentare limitări

### [19 octombrie 2025] — Setup inițial
- ✅ Setup Vite + React 19 + TypeScript
- ✅ Integrare sql.js + Decimal.js
- ✅ File System Access API + fallback upload
- ✅ Platform detection sofisticat
- ✅ Port complet modul Generare Lună
- ✅ UI basic (Tailwind + shadcn/ui)
- ✅ Sidebar animat (framer-motion)
- ✅ PWA support

---

<div align="center">

**🎯 Progres Excelent:**

> De la **1/7 module** (24 oct) la **3/7 module** (27 oct)
> **+2 module majore** în **3 zile** (Vizualizare Lunară + Sume Lunare)
> **Compatibilitate iOS/MacOS 100%**

**Factori de succes:**
- ⏱️ Port fidel din Python (logic 100% replicată)
- 🎯 Focus pe funcționalitate (nu perfectionism UI)
- 🔄 Reutilizare componente (shadcn/ui)
- 📱 Responsive design din start

**Următorii pași:**
- 🔥 Modul Membri (CRUD) — 2-3 săptămâni
- 🔥 Modul Listări — 2-3 săptămâni
- 🟡 Statistici — 1-2 săptămâni

---

**Ultima actualizare:** 27 octombrie 2025
**Versiune:** Beta v0.3.0
**Status:** 🚀 În dezvoltare activă (funcțional 43%)

[⬆ Back to top](#carapp-petroșani-v2--carapp2-)

</div>
