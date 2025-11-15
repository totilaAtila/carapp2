# CARapp Petroșani v2 🏦

<div align="center">

**Aplicație web progresivă pentru Casa de Ajutor Reciproc Petroșani**

[![Status](https://img.shields.io/badge/status-production-brightgreen)](https://github.com/totilaAtila/carapp2)
[![Module](https://img.shields.io/badge/module%20func%C8%9Bionale-11%2F11-brightgreen)](https://github.com/totilaAtila/carapp2)
[![Security](https://img.shields.io/badge/vulnerabilit%C4%83%C8%9Bi%20critice-0-brightgreen)](https://github.com/totilaAtila/carapp2)
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
- [Securitate](#-securitate)
- [Structura Proiectului](#-structura-proiectului)
- [Changelog](#-changelog)
- [Licență](#-licență)

---

## 🎯 Despre Proiect

CARapp Petroșani v2 este o aplicație web progresivă (PWA) dezvoltată pentru gestionarea operațiunilor financiare ale Casei de Ajutor Reciproc Petroșani. Aplicația procesează baze de date SQLite direct în browser, fără necesitatea unui server backend.

### Caracteristici Principale

- **🔒 Confidențialitate Totală** — Datele nu părăsesc dispozitivul utilizatorului
- **💾 File System Access API** — Lucru direct pe fișiere locale (Chrome/Edge desktop)
- **📤 Fallback Universal** — Upload/download pentru toate browserele și platformele
- **📱 PWA Compliant** — Instalabilă pe desktop și mobile
- **🌐 Cross-Platform** — Windows, macOS, Linux, iOS, Android
- **⚡ Zero Latență** — Procesare în browser fără dependență de internet
- **🔢 Precizie Financiară** — Calcule Decimal.js conform Regulament CE 1103/97

### Status Actual

**Versiune:** 1.0.0 (Production)
**Data:** 8 Noiembrie 2025
**Module Funcționale:** 11 din 11 (100%)
**Vulnerabilități Critice:** 0

---

## ✅ Module Implementate (11/11)

### 1. Generare Lună Nouă

Generarea automată a unei noi luni în baza de date DEPCRED.

**Funcționalități:**
- Detectare automată ultima lună existentă
- Validare continuitate temporală
- Aplicare cotizații standard din MEMBRII.db
- Moștenire rate împrumut din luna anterioară
- Calcul dobândă stingere anticipată (4‰)
- Excludere automată membri lichidați
- Actualizare solduri (împrumuturi și depuneri)
- Log detaliat operațiuni
- Funcție ștergere lună cu confirmare

**Tehnologii:** Decimal.js (ROUND_HALF_UP), validări stricte

---

### 2. Vizualizare Lunară

Afișarea tranzacțiilor unui membru pentru o lună specifică.

**Funcționalități:**
- Autocomplete căutare membri (nume + nr. fișă)
- Selectare lună/an cu validare
- Afișare detaliată împrumuturi (dobândă, împrumut, rată, sold)
- Afișare detaliată depuneri (cotizație, retragere, sold)
- Layout responsive (desktop: carduri, mobile: liste)
- Export PDF cu DejaVu Sans (suport diacritice)
- Export Excel (XLSX) cu formatare
- Detectare membri lichidați (alert vizual)

**Tehnologii:** jsPDF, jspdf-autotable, xlsx (SheetJS), DejaVu Sans embedded

---

### 3. Sume Lunare

Istoricul complet financiar al unui membru cu operațiuni de editare.

**Funcționalități Desktop (≥1024px):**
- Tabel 8 coloane sincronizate verticale
- Secțiuni: Împrumuturi (dobândă, împrumut, rată, sold) | Dată | Depuneri (cotizație, retragere, sold)
- Scroll sincronizat între coloane
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
- Salvare în DEPCRED.db și MEMBRII.db

**Port complet:** 2750 linii logică business din Python

---

### 4. Vizualizare Anuală

Rapoarte anuale complete pentru analiza membrilor.

**Funcționalități:**
- Selectare an și membru
- Sinteză anuală (12 luni)
- Totaluri anuale (împrumuturi, depuneri, dobânzi)
- Export PDF și Excel
- Comparații an-cu-an
- Grafice evoluție anuală

**Status:** ✅ Complet funcțional și testat

Port complet din aplicația Python (`vizualizare_anuala.py`).

### 5. Vizualizare Trimestrială

Rapoarte trimestriale pentru analiză periodică.

**Funcționalități:**
- Selectare trimestru (T1-T4) și an
- Sinteză trimestrială (3 luni)
- Totaluri pe trimestru
- Export rapoarte PDF/Excel
- Comparații inter-trimestriale
- Layout responsive desktop/mobile

---

### 6. Adăugare Membru

Gestionarea adăugării și editării datelor membrilor.

**Funcționalități:**
- Formular validat pentru membri noi
- Editare date membri existenți
- Câmpuri: număr fișă (unic), nume și prenume (unic), domiciliu, calitate, data înscrierii, cotizație standard
- Validări stricte (unicitate, format)
- Salvare în MEMBRII.db

**Tehnologii:** react-hook-form, zod validation

---

### 7. Ștergere Membru

Gestionarea ștergerii și lichidării membrilor.

**Funcționalități:**
- Căutare membru (autocomplete)
- Afișare detalii înainte de ștergere
- Confirmare multiplă (acțiune ireversibilă)
- Opțiuni: ștergere completă sau marcare în LICHIDATI.db
- Log operațiuni cu timestamp

---

### 8. Dividende

Calculul și distribuirea dividendelor anuale.

**Funcționalități:**
- Calcul automat conform regulament
- Validare membri eligibili (din ACTIVI.db)
- Aplicare dividende în DEPCRED pentru luna ianuarie
- Preview calcul înainte de aplicare
- Log operațiuni dividende
- Export raport distribuire

---

### 9. Statistici

Dashboard cu analize și grafice interactive.

**Funcționalități:**
- Total membri (activi/inactivi/lichidați)
- Distribuție solduri (grafice bar și pie)
- Evoluție lunară (grafice line)
- Metrici cheie (total împrumuturi, depuneri, dobânzi)
- Comparații perioade
- Export rapoarte statistice

**Tehnologii:** Recharts

---

### 10. Listări (Generare Chitanțe)

Generare chitanțe PDF pentru membri.

**Funcționalități:**
- Generare chitanțe PDF pentru lună selectată
- Selecție an/lună din dropdown
- Preview chitanțe înainte de export
- Totalizare automată (dobândă, împrumuturi, depuneri, retrageri)
- Suport diacritice românești (DejaVu Sans fonts)
- Export PDF individual sau bulk

---

### 11. Conversie RON→EUR

Conversie baze de date conform Regulament CE 1103/97 pentru tranziția la EURO.

**Funcționalități:**
- Operațiune ONE-TIME pentru tranziție monetară
- Curs EUR configurabil de utilizator
- Conversie conformă Regulamentului CE 1103/97 (direct individual)
- Clonare automată: DEPCRED→DEPCREDEUR, MEMBRII→MEMBRIIEUR, etc.
- Conversie monetară toate câmpurile (dobândă, împrumuturi, depuneri, cotizații, dividende)
- Validare integritate membri (cross-check DEPCRED vs MEMBRII)
- Preview cu estimări și warnings
- Progress tracking real-time + logs detaliate
- Calcul diferențe rotunjire (conform legislație UE)
- Export raport conversie complet
- Download 5 baze EUR (DEPCREDEUR.db, MEMBRIIEUR.db, activiEUR.db, INACTIVIEUR.db, LICHIDATIEUR.db)
- Dual panel layout (desktop), single column (mobile)
- Protecție re-conversie (detectare baze EUR existente)

**Note:** CHITANTE.db nu se clonează (fără date monetare). După conversie, sistemul dual-currency activat automat (toggle RON/EUR).

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
| **Decimal.js** | Calcule financiare precise (CE 1103/97) |
| **jsPDF + jspdf-autotable** | Export PDF |
| **xlsx (SheetJS)** | Export Excel |
| **framer-motion** | Animații UI |
| **shadcn/ui** | Componente UI (Radix UI) |
| **Lucide React** | Iconițe |
| **react-hook-form + zod** | Validare formulare |
| **Recharts** | Grafice și vizualizări |

### Features Speciale

- **DejaVu Sans Fonts** — Embedded base64 (~1.9MB) pentru diacritice românești în PDF
- **File System Access API** — Lucru direct pe fișiere (Chrome/Edge desktop)
- **Service Worker** — PWA cu update prompt doar la pornire
- **Decimal.js** — Precizie 20 cifre, ROUND_HALF_UP conform Regulament CE

---

## 🚀 Instalare și Rulare

### Cerințe Sistem

- **Node.js** 18+ (testat cu 22.13.0)
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
- 🚀 Performanță maximă (lucru direct pe fișiere)

**Pași:**
1. Click "Selectează dosar cu baze de date"
2. Alege folderul cu fișiere `.db`
3. Acordă permisiune read/write (o singură dată)
4. Modificările se salvează automat la click "Salvează"

#### 2. 📤 Încărcare Fișiere (Universal)

**Disponibil pe:** Toate browserele și platformele (iOS, Android, Safari, Firefox)

**Pași:**
1. Click "Încarcă fișiere baze de date"
2. Selectează toate fișierele `.db` (multi-select)
3. Modificările rămân în memorie
4. Click "Salvează" → fișierele se descarcă local
5. Suprascrie manual fișierele vechi

---

### Fișiere Necesare

#### Baze RON (6 obligatorii)

⚠️ **IMPORTANT:** Respectați exact numele fișierelor (case-sensitive)!

| Fișier | Status | Descriere |
|--------|--------|-----------|
| **MEMBRII.db** | ✅ Obligatoriu | Date personale și cotizații membri |
| **DEPCRED.db** | ✅ Obligatoriu | Istoric lunar tranzacții |
| **activi.db** | ✅ Obligatoriu | Membri eligibili pentru dividende |
| **INACTIVI.db** | ✅ Obligatoriu | Membri inactivi temporar |
| **LICHIDATI.db** | ✅ Obligatoriu | Membri cu lichidare definitivă |
| **CHITANTE.db** | ✅ Obligatoriu | Numerotare chitanțe (comun RON+EUR) |

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

### Validare Automată

- ✅ Header SQLite (`SQLite format 3`)
- ✅ Structură tabele (MEMBRII, DEPCRED obligatorii)
- ✅ Case-sensitive validation pentru nume fișiere
- ❌ Fișiere corupte sau invalide sunt respinse

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

### Îmbunătățiri iOS/MacOS

**Status:** 100% funcțional pe toate platformele Apple

- Accept attribute cu MIME types pentru iOS Safari: `application/x-sqlite3, application/vnd.sqlite3, application/octet-stream`
- Download stabilizat (element `<a>` adăugat în DOM cu delay cleanup)
- Detectare precisă iOS/iPadOS (`/iPad|iPhone|iPod/` + `maxTouchPoints > 1`)
- Instrucțiuni interactive pentru utilizatori iOS

---

## 🔒 Securitate

### Status Vulnerabilități (8 Noiembrie 2025)

✅ **0 vulnerabilități critice**

| Dependință | Versiune | Vulnerabilitate | Status | Risc Efectiv |
|------------|----------|-----------------|--------|--------------|
| **tar** | 7.5.1+ | Race condition (moderate) | ✅ REZOLVAT | N/A |
| **xlsx** | 0.18.5 | Prototype Pollution + ReDoS (high) | ⚠️ ACCEPTAT | **ZERO** |

### Explicație xlsx

**De ce xlsx 0.18.5?**
- Versiunile cu fix-uri (0.19.3+, 0.20.2+) necesită licență comercială SheetJS
- 0.18.5 este ultima versiune gratuită pe npm public

**De ce risc ZERO?**

Aplicația folosește xlsx **exclusiv pentru EXPORT** (write-only):
- `XLSX.utils.book_new()` — creare workbook
- `XLSX.utils.aoa_to_sheet()` — conversie date → sheet
- `XLSX.writeFile()` — scriere fișier

**NU parsăm** fișiere xlsx → vulnerabilitățile NU se aplică:
- Prototype Pollution — necesită parsing de fișiere malițioase
- ReDoS — necesită procesare input malițios

---

## 📂 Structura Proiectului

```
carapp2/
├── public/
│   ├── fonts/
│   │   ├── DejaVuSans.ttf
│   │   └── DejaVuSans-Bold.ttf
│   ├── service-worker.js
│   └── manifest.json
│
├── src/
│   ├── components/
│   │   ├── GenerareLuna.tsx          # Modul 1
│   │   ├── VizualizareLunara.tsx     # Modul 2
│   │   ├── SumeLunare.tsx            # Modul 3
│   │   ├── VizualizareAnuala.tsx     # Modul 4
│   │   ├── VizualizareTrimestriala.tsx # Modul 5
│   │   ├── AdaugaMembru.tsx          # Modul 6
│   │   ├── StergeMembru.tsx          # Modul 7
│   │   ├── Dividende.tsx             # Modul 8
│   │   ├── Statistici.tsx            # Modul 9
│   │   ├── Listari.tsx               # Modul 10
│   │   ├── Conversion.tsx            # Modul 11
│   │   ├── Dashboard.tsx
│   │   ├── LandingPage.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Taskbar.tsx
│   │   ├── CurrencyToggle.tsx
│   │   ├── UpdatePrompt.tsx
│   │   └── ui/                       # shadcn/ui components
│   │
│   ├── services/
│   │   ├── databaseManager.ts        # Dual method (filesystem + upload)
│   │   ├── databasePersistence.ts    # IndexedDB cache
│   │   └── platformDetector.ts       # Detectare iOS/Safari
│   │
│   ├── logic/
│   │   ├── generateMonth.ts          # Logică generare lună
│   │   ├── finance.ts                # Calcule Decimal.js
│   │   └── dbLoader.ts               # Încărcare baze
│   │
│   ├── utils/
│   │   └── dejavu-fonts.ts           # DejaVu Sans base64 (~1.9MB)
│   │
│   ├── types/
│   │   └── sqljs.d.ts                # Type definitions
│   │
│   ├── lib/
│   │   └── utils.ts                  # Utilități TailwindCSS
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── scripts/
│   └── convert-fonts.cjs             # Conversie TTF → base64
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## 📊 Metrici Proiect

| Metric | Valoare |
|--------|---------|
| **Versiune** | 1.0.0 |
| **Module** | 11/11 (100%) |
| **Linii cod** | ~15,000 TypeScript |
| **Componente** | 18 principale + 8 UI |
| **Test coverage** | 0% (planificat 80%) |
| **Vulnerabilități critice** | 0 |
| **Compatibilitate** | 100% (cu fallback) |
| **Ultima actualizare** | 8 noiembrie 2025 |

---

## 📝 Changelog

### [8 Noiembrie 2025] — Modul Vizualizare Trimestrială

**Modul nou:**
- Vizualizare Trimestrială (selectare T1-T4, sinteză 3 luni, totaluri, export PDF/Excel, comparații)

**Progres:** 10/10 → 11/11 module

---

### [7 Noiembrie 2025] — Conversie RON→EUR și Îmbunătățiri

**Module noi:**
- Conversie RON→EUR (Regulament CE 1103/97)
- Listări (Generare Chitanțe PDF)

**Securitate:**
- tar vulnerability FIXED
- xlsx vulnerability documented (risc zero)
- 0 vulnerabilități critice

**Fix-uri:**
- Cache deletion bug fix
- P1 fixes VizualizareLunara
- Listari module polish

**UX:**
- Dynamic currency
- Member history sort
- Mobile scroll-to-top

---

### [3 Noiembrie 2025] — Finalizare Module Core

**Module noi:**
- Vizualizare Anuală
- Adăugare Membru
- Ștergere Membru
- Dividende
- Statistici

**Progres:** 43% → 100%

---

### [27 Octombrie 2025] — Module Vizualizare

**Module noi:**
- Vizualizare Lunară
- Sume Lunare (2750 linii port Python)
- Compatibilitate iOS/MacOS 100%

**Progres:** 14% → 43%

---

### [24 Octombrie 2025] — Documentare

- Unificare README + PROJECT_CONTEXT
- Clarificare stadiu și limitări
- Roadmap realist

---

### [19 Octombrie 2025] — Setup Inițial

- Setup Vite + React 19 + TypeScript
- Integrare sql.js + Decimal.js
- File System Access API + fallback upload
- Platform detection
- Modul Generare Lună
- UI (Tailwind + shadcn/ui)
- Sidebar animat (framer-motion)
- PWA support

---

## 🤝 Contribuții

Proiectul acceptă contribuții.

### Proces

1. Fork repository
2. Clone local: `git clone https://github.com/YOUR_USERNAME/carapp2.git`
3. Branch nou: `git checkout -b feature/NumeFeature`
4. Cod + teste
5. Commit: `git commit -m "feat: Adaugă NumeFeature"`
6. Push: `git push origin feature/NumeFeature`
7. Pull Request cu descriere detaliată

### Cod Style

- TypeScript obligatoriu
- ESLint + Prettier configured
- Comentarii în română pentru logică business
- Decimal.js pentru calcule financiare
- shadcn/ui pentru componente noi

---

## 📄 Licență

Copyright © 2025 Atila B.-A. Toate drepturile rezervate.

**Proprietate privată** — Redistribuirea sau utilizarea comercială necesită acordul scris al autorilor.

---

## 📞 Contact

- 🐛 [GitHub Issues](https://github.com/totilaAtila/carapp2/issues)
- 💬 [GitHub Discussions](https://github.com/totilaAtila/carapp2/discussions)

---

<div align="center">

**Versiune:** 1.0.0
**Status:** Production Ready
**Completare:** 100%

[⬆ Înapoi sus](#carapp-petroșani-v2-)

</div>
