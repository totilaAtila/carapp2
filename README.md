# CARapp Petroșani v2 — Varianta "Full Locală" 🏦

Aplicație web experimentală pentru gestionarea Casei de Ajutor Reciproc Petroșani, cu accent pe **lucru direct pe fișiere locale** prin File System Access API.

> ⚠️ **Status:** Versiune în dezvoltare activă — doar modulul "Generare Lună" este funcțional.  
> Pentru o versiune production-ready cu toate modulele, vezi [CARapp_web](https://github.com/totilaAtila/CARapp_web).

---

## 🎯 Concept și Diferențiere

Această variantă explorează o abordare **hibridă modernă** pentru lucrul cu baze de date locale:

### 🔑 Caracteristici distinctive față de CARapp_web:

| Caracteristică | carapp2 (acest repo) | CARapp_web |
|---------------|----------------------|------------|
| **Metoda prioritară** | File System Access API | Upload clasic |
| **Sincronizare** | Automată (dosar local) | Manuală (download) |
| **Compatibilitate** | Desktop (Chrome/Edge) | Universală (toate browserele) |
| **Module funcționale** | 1 (Generare Lună) | 7 (toate) |
| **Conversie RON→EUR** | ❌ Nu există | ✅ Implementată |
| **Platform detection** | Sofisticat | Minimal |
| **UI/UX** | Animații moderne | Funcțional business |
| **Stadiu** | Experimental | Production-ready |

---

## ✨ Tehnologii

| Categorie | Tehnologie |
|-----------|------------|
| **Framework** | React 19 + TypeScript + Vite 6 |
| **Stilizare** | TailwindCSS + shadcn/ui |
| **Animații** | framer-motion |
| **Baze de date** | sql.js (SQLite în WebAssembly) |
| **Calcule financiare** | Decimal.js (precizie maximă) |
| **Iconițe** | Lucide React |
| **PWA** | Service Worker + Manifest |

---

## 🚀 Instalare și Rulare

### Cerințe
- Node.js 18+ (testat cu 22.13.0)
- pnpm (recomandat) sau npm

### Pași
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
# Fișierele generate vor fi în dist/
```

---

## 📁 Lucrul cu Bazele de Date

### Metoda 1: Selectare Dosar (Recomandată pe Desktop)

**Disponibilă pe:** Chrome, Edge, Opera (desktop) — **NU pe Safari sau iOS**

✅ **Avantaje:**
- Lucru direct pe fișiere (zero copii în memorie)
- Sincronizare automată la salvare
- Fără upload/download manual
- Experiență fluidă

🔧 **Cum funcționează:**
1. La pornire, alegi "Selectează dosar cu baze de date"
2. Selectezi folderul care conține `MEMBRII.db`, `DEPCRED.db`, etc.
3. Browserul solicită permisiune read/write (acorzi o singură dată)
4. Lucrezi direct pe fișiere
5. La apăsarea butonului "💾 Salvează" din taskbar, modificările se scriu automat

### Metoda 2: Încărcare Fișiere (Fallback Universal)

**Disponibilă pe:** Toate browserele și platformele (inclusiv iOS, Safari)

⚠️ **Limitări:**
- Lucru în memorie (fără sincronizare automată)
- Salvare prin download manual
- Mai puțin fluid, dar funcțional

🔧 **Cum funcționează:**
1. La pornire, alegi "Încarcă fișiere baze de date"
2. Selectezi individual `MEMBRII.db`, `DEPCRED.db`, etc.
3. Lucrezi cu copii în memorie
4. La apăsarea "💾 Salvează", descarcă fișierele modificate
5. Suprascrii manual fișierele din folderul tău

### Fișiere Necesare

| Fișier | Status | Descriere |
|--------|--------|-----------|
| `MEMBRII.db` | ✅ Obligatoriu | Informații membri (nr_fișă, nume, cotizații) |
| `DEPCRED.db` | ✅ Obligatoriu | Depuneri și credite (istoric lunar) |
| `LICHIDATI.db` | ℹ️ Opțional | Membri lichidați (excludere automată) |
| `ACTIVI.db` | ℹ️ Opțional | Membri activi (pentru dividende) |

---

## 🧩 Module Disponibile

### ✅ Generare Lună (Funcțional)

**Modul complet implementat** — portare directă din aplicația Python desktop.

**Funcționalități:**
- Detectare automată ultima lună procesată
- Validare perioadă țintă (doar luna imediat următoare)
- Verificare membri lichidați (excludere automată)
- Aplicare cotizații standard din `MEMBRII.db`
- Moștenire rate împrumut din luna anterioară
- Calcul dobândă stingere (4‰) la plata integrală
- Dividende în ianuarie (pentru membri activi)
- Actualizare solduri (împrumuturi + depuneri)
- Raport detaliat în timp real
- Export `DEPCRED` actualizat

**Calcule financiare:**
- Precizie: `Decimal.js` cu metoda `ROUND_HALF_UP`
- Conformitate: Regulile contabile CAR
- Zero erori de rotunjire

**Validări:**
- Luna țintă trebuie să fie consecutivă (nu se pot genera "sărituri")
- Verificare existență date sursă pentru fiecare membru
- Protecție suprascriere (confirmare dacă luna există deja)

**Acțiuni disponibile:**
- 🟢 **Generează Lună Selectată** — creează înregistrări pentru luna următoare
- 🔴 **Șterge Lună Selectată** — elimină ultima lună generată (ireversibil!)
- 🟡 **Modifică Rata Dobândă** — schimbă rata dobânzii (placeholder)
- 📊 **Afișare membri** — lichidați, activi, fișe nealocate (placeholders)

### 🔒 Module în Curând

Următoarele module sunt planificate, dar **nu sunt încă implementate**:

- 📊 **Rapoarte** — generare rapoarte lunare și anuale
- 💰 **Împrumuturi** — gestiune împrumuturi și rate
- 👥 **Membri** — adăugare, editare, vizualizare membri
- 📈 **Statistici** — analize și grafice (solduri, distribuții)
- ⚙️ **Setări** — configurare aplicație

---

## 🎨 Interfață Utilizator

### Dashboard Principal

- **Header** — Titlu + buton "Schimbă sursa datelor"
- **Status baze** — Carduri cu indicatori vizuali (✅ încărcat / ℹ️ opțional)
- **Grid module** — 6 carduri (1 activ + 5 disabled cu "🔒 În curând...")

### Modul Generare Lună

- **Info perioadă** — Ultima lună / Următoarea lună / Rată dobândă
- **Selectare lună** — Dropdown lună + an
- **Butoane principale** — Generează / Șterge / Modifică rată
- **Butoane secundare** — Fișe nealocate / Membri lichidați/activi / Export / Șterge log
- **Log live** — Consolă text cu toate operațiunile în timp real
- **Salvare** — Buton "💾 Salvează DEPCRED actualizat"

### Taskbar (Bară fixă jos)

- **Stânga:** Buton "☰ Meniu" (deschide sidebar)
- **Dreapta:** 
  - 📤 **Reîncarcă bazele** — resetează și reîncarcă fișierele
  - 💾 **Salvează** — persistă modificările (filesystem sau download)

### Sidebar (Meniu lateral glisant)

**Animat cu framer-motion** — glisează de la stânga la click pe "☰ Meniu"

Module planificate (placeholder):
- 💰 Sume lunare
- 🧮 Generare lună
- 📅 Vizualizare lunară
- 📆 Vizualizare anuală
- ➕ Adăugare membru
- 🗑️ Ștergere membru
- 🏦 Dividende

---

## 🔍 Detectare Platformă

Aplicația detectează automat capabilitățile browserului și platformei:
```typescript
const capabilities = detectPlatformCapabilities();
// Returnează:
{
  browserName: "Chrome" | "Edge" | "Firefox" | "Safari" | ...,
  platform: "Windows" | "macOS" | "Linux" | "Android" | "iOS",
  supportsFileSystemAccess: boolean, // Chrome/Edge desktop
  isPWA: boolean,                    // Rulează ca PWA
  isOnline: boolean,                 // Conectivitate
  isIOS: boolean                     // iOS/iPadOS
}
```

**Logica de selecție:**
- Dacă `supportsFileSystemAccess` = true → afișează ambele opțiuni (dosar prioritar)
- Dacă false (ex: Safari, iOS) → afișează doar "Încarcă fișiere"

---

## 📂 Structura Proiectului
```
carapp2/
├── public/                  # Fișiere statice
│   ├── sw.js               # Service Worker pentru PWA
│   └── manifest.json       # Manifest PWA (dacă există)
├── src/
│   ├── components/         # Componente React
│   │   ├── LandingPage.tsx        # Ecran încărcare baze
│   │   ├── Dashboard.tsx          # Dashboard principal
│   │   ├── GenerareLuna.tsx       # Modul generare lună
│   │   ├── Sidebar.tsx            # Meniu lateral animat
│   │   ├── Taskbar.tsx            # Bară jos cu butoane
│   │   └── ui/                    # Componente shadcn/ui
│   │       ├── buttons.tsx
│   │       ├── dialog.tsx
│   │       └── card.tsx
│   ├── services/           # Servicii backend-like
│   │   ├── databaseManager.ts     # Gestionare baze (dual method)
│   │   └── platformDetector.ts    # Detectare capabilities
│   ├── logic/              # Logică business
│   │   ├── generateMonth.ts       # ⭐ Logica generare lună
│   │   ├── finance.ts             # Calcule Decimal.js
│   │   └── dbLoader.ts            # Loader baze (legacy?)
│   ├── lib/                # Utilități
│   │   └── utils.ts               # Helpers (formatDate, cn, etc.)
│   ├── types/              # TypeScript definitions
│   │   └── sqljs.d.ts             # Type definitions pentru sql.js
│   ├── App.tsx             # Componenta root
│   ├── main.tsx            # Entry point
│   └── index.css           # Stiluri globale (Tailwind)
├── PROJECT_CONTEXT.md      # Documentație tehnică detaliată
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## 🧪 Testare

### Testare Manuală (curent)

1. Încarcă baze de date (metoda filesystem sau upload)
2. Verifică status baze în dashboard
3. Intră în modulul "Generare Lună"
4. Verifică detectarea automată a ultimei luni
5. Generează luna următoare
6. Verifică log pentru confirmare
7. Salvează DEPCRED actualizat
8. Reîncarcă bazele și verifică persistența

### Testare Automată (planificată)

- **Vitest** pentru testare logică business
- **React Testing Library** pentru componente
- **Playwright** pentru teste E2E (opțional)

---

## ⚠️ Limitări Cunoscute

### 1. File System Access API

❌ **Nu funcționează pe:**
- Safari (macOS și iOS)
- Firefox (pentru moment)
- Orice browser mobil (Android inclus, deocamdată)

➡️ **Soluție:** Aplicația detectează automat și oferă metoda upload ca fallback.

### 2. Module Incomplete

Doar **Generare Lună** este funcțional. Restul modulelor sunt placeholder-e vizuale.

### 3. Lipsă Conversie RON→EUR

❌ **Această versiune NU suportă conversia la EUR.**

➡️ Dacă ai nevoie de conversie valutară conform Regulamentului CE 1103/97, folosește [CARapp_web](https://github.com/totilaAtila/CARapp_web) care are implementat complet modulul de conversie RON→EUR.

### 4. Compatibilitate Mobilă Limitată

Deși UI-ul este responsive, experiența pe mobil este suboptimă din cauza File System Access API. Pentru mobil, folosește metoda upload sau [CARapp_web](https://github.com/totilaAtila/CARapp_web).

---

## 🛣️ Roadmap

### 📅 Fază 1 (Curent)
- [x] Setup Vite + React + TypeScript
- [x] Integrare sql.js + Decimal.js
- [x] File System Access API + fallback upload
- [x] Platform detection sofisticat
- [x] Modul "Generare Lună" complet
- [x] UI modern cu Tailwind + shadcn/ui
- [x] Sidebar animat (framer-motion)
- [x] Taskbar persistent
- [x] PWA support (service worker)

### 📅 Fază 2 (Următoare)
- [ ] Modul **Sume Lunare** (introducere plăți, calculator dobândă)
- [ ] Modul **Membri** (CRUD complet)
- [ ] Modul **Statistici** (grafice Recharts)
- [ ] Validare structură baze la încărcare
- [ ] Error handling mai robust

### 📅 Fază 3 (Viitor)
- [ ] Modul **Rapoarte** (PDF cu pdf-lib)
- [ ] Modul **Împrumuturi** (gestiune rate)
- [ ] Modul **Vizualizare Lunară/Anuală**
- [ ] Export Excel (xlsx)
- [ ] Testare automată (Vitest)
- [ ] Optimizare performanță (virtual scrolling)

### 📅 Fază 4 (Long-term)
- [ ] **Conversie RON→EUR** (port din CARapp_web)
- [ ] Suport offline complet (cache strategii)
- [ ] Sincronizare cloud (opțional)
- [ ] Autentificare utilizatori (opțional)

---

## 🆚 Comparație cu CARapp_web

| Aspect | carapp2 (acest repo) | [CARapp_web](https://github.com/totilaAtila/CARapp_web) |
|--------|----------------------|----------------------------------------------------------|
| **Stadiu** | 🟡 Experimental | ✅ Production-ready |
| **Module complete** | 1 / 7 | 7 / 7 |
| **Conversie EUR** | ❌ | ✅ (Regulament CE 1103/97) |
| **File System API** | ✅ Prioritar | ❌ |
| **Compatibilitate** | Desktop (Chrome/Edge) | Universală (toate browserele) |
| **Mobile** | ⚠️ Limitat | ✅ Complet |
| **Statistici** | ❌ | ✅ |
| **Rapoarte** | ❌ | 🟡 În curs |
| **UI Animații** | ✅ framer-motion | ⚠️ Minim |
| **Deploy** | Static build | Netlify/Vercel |
| **Maturitate** | Alpha | Stable |

### 🎯 Când să folosești **carapp2**?

✅ Ești pe **desktop** (Windows/macOS) cu Chrome sau Edge  
✅ Vrei experiență **zero-friction** (fără upload/download)  
✅ Preferi **lucru direct pe fișiere** locale  
✅ **NU ai nevoie** de conversie EUR (deocamdată)  
✅ Ești Ok cu **un singur modul** funcțional (Generare Lună)  

### 🎯 Când să folosești [CARapp_web](https://github.com/totilaAtila/CARapp_web)?

✅ Ai nevoie de **toate modulele** (statistici, rapoarte, membri)  
✅ **OBLIGATORIU**: Conversie RON→EUR  
✅ Lucrezi pe **multiple dispozitive** (desktop + mobil)  
✅ Vrei **compatibilitate universală** (iOS, Safari, Firefox)  
✅ Preferi **stabilitate** față de features experimentale  
✅ Deploy **production** (Netlify/Vercel)  

---

## 🤝 Contribuții

Proiectul este în dezvoltare activă. Contribuțiile sunt binevenite!

### Cum să contribui:

1. Fork repository-ul
2. Creează branch pentru feature (`git checkout -b feature/NumeFeature`)
3. Commit modificări (`git commit -m 'Adaugă NumeFeature'`)
4. Push pe branch (`git push origin feature/NumeFeature`)
5. Deschide Pull Request

### Priorități contribuții:

- 🔥 **Urgent:** Module Sume Lunare, Membri, Statistici
- 🟡 **Important:** Rapoarte PDF, Export Excel
- 🟢 **Nice-to-have:** Conversie RON→EUR, Testare automată

---

## 📄 Licență

Copyright © 2025 CAR Petroșani. Toate drepturile rezervate.

---

## 📞 Contact & Suport

Pentru probleme tehnice sau sugestii:
- **Issues:** [GitHub Issues](https://github.com/totilaAtila/carapp2/issues)
- **Discuții:** [GitHub Discussions](https://github.com/totilaAtila/carapp2/discussions)

Pentru aplicația Python desktop originală: [CARpetrosani](https://github.com/totilaAtila/CARpetrosani)

---

## 🔗 Link-uri Utile

- 📚 [Documentație sql.js](https://sql.js.org/)
- 📐 [Documentație Decimal.js](https://mikemcl.github.io/decimal.js/)
- 🎨 [Documentație Tailwind CSS](https://tailwindcss.com/)
- 🧩 [Componente shadcn/ui](https://ui.shadcn.com/)
- 🌐 [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)

---

**Ultima actualizare:** 24 octombrie 2025  
**Versiune:** Alpha (v0.1.0-alpha)  
**Status:** 🚧 În dezvoltare activă
