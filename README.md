# CARapp Petroșani v2 — carapp2 🏦

<div align="center">

**Aplicație web experimentală pentru Casa de Ajutor Reciproc Petroșani**  
*Explorare File System Access API pentru lucru direct pe fișiere locale*

[![Status](https://img.shields.io/badge/status-alpha-orange)](https://github.com/totilaAtila/carapp2)
[![Module](https://img.shields.io/badge/module%20funcționale-1%2F7-red)](https://github.com/totilaAtila/carapp2)
[![React](https://img.shields.io/badge/react-19-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-proprietary-lightgrey)](https://github.com/totilaAtila/carapp2)

[🌐 CARapp_web (Production)](https://github.com/totilaAtila/CARapp_web) • [🖥️ Desktop (Python)](https://github.com/totilaAtila/CARpetrosani) • [📖 Documentație](#-documentație-completă)

</div>

---

## ⚠️ Status Actual (24 octombrie 2025)

> **Versiune experimentală** — doar 1 din 7 module este funcțional.  
> Pentru utilizare în **producție**, folosiți [CARapp_web](https://github.com/totilaAtila/CARapp_web) care are toate modulele implementate.

| Aspect | carapp2 | CARapp_web |
|--------|---------|------------|
| **Stadiu** | 🟡 Alpha (experimental) | ✅ Production-ready |
| **Module funcționale** | 1 / 7 (Generare Lună) | 7 / 7 (toate) |
| **Conversie RON→EUR** | ❌ Nu există | ✅ Implementată complet |
| **Metoda primară** | File System Access API | Upload fișiere |
| **Compatibilitate** | Desktop (Chrome/Edge) | Universală (toate browserele) |
| **Mobile/iOS** | ⚠️ Limitat (fallback) | ✅ Suport complet |

---

## 🎯 Concept și Diferențiere

### De ce există carapp2?

**carapp2** explorează o abordare **hibridă modernă** pentru lucrul cu baze de date SQLite în browser:

🔑 **Caracteristica unică:** [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- Selectare dosar întreg din sistemul de fișiere
- Lucru **direct pe fișiere** (zero copii în memorie)
- Sincronizare **automată** la salvare
- Experiență **zero-friction** (fără upload/download)

⚠️ **Limitare majoră:** Funcționează DOAR pe Chrome/Edge desktop (nu iOS, nu Safari, nu Firefox)

### Când să folosești carapp2?

✅ **DA** — pentru:
- Experimentare cu File System Access API
- Development/testing pe desktop (Chrome/Edge)
- Prototipare rapidă features noi
- Învățare tehnologii moderne web

❌ **NU** — pentru:
- **Producție** (folosește CARapp_web)
- Utilizare pe mobil/iOS
- Când ai nevoie de **conversie RON→EUR**
- Când ai nevoie de **toate modulele** (statistici, rapoarte, membri)

---

## 🆚 Comparație Completă

<details>
<summary><b>📊 Click pentru tabel comparativ detaliat</b></summary>

| Aspect | carapp2 (acest repo) | CARapp_web |
|--------|---------------------|------------|
| **Concept** | Explorare File System API | Compatibilitate universală |
| **Metoda de lucru** | 1. Dosar local (prioritar)<br>2. Upload (fallback) | Upload fișiere (exclusiv) |
| **Sincronizare** | Automată (Chrome/Edge) | Manuală (download) |
| **Module complete** | 1 / 7 | 7 / 7 |
| **Conversie EUR** | ❌ Nu | ✅ Da (Regulament CE 1103/97) |
| **Dual currency** | ❌ Nu | ✅ Da (toggle RON/EUR) |
| **Statistici** | ❌ Placeholder | ✅ Complete (grafice, distribuții) |
| **Rapoarte PDF** | ❌ Nu | 🟡 În dezvoltare |
| **Gestiune membri** | ❌ Nu | ✅ Da (CRUD complet) |
| **Sume lunare** | ❌ Nu | ✅ Da (introducere plăți) |
| **Vizualizare lunară** | ❌ Nu | ✅ Da (tabel detaliat) |
| **Listări** | ❌ Nu | ✅ Da (export, filtre) |
| **Chrome/Edge desktop** | ✅ Suport complet | ✅ Suport complet |
| **Firefox** | ⚠️ Fallback upload | ✅ Suport complet |
| **Safari** | ⚠️ Fallback upload | ✅ Suport complet |
| **iOS/iPadOS** | ⚠️ Fallback upload | ✅ Suport complet |
| **Android** | ⚠️ Fallback upload | ✅ Suport complet |
| **PWA Support** | ✅ Da | ✅ Da |
| **Deploy** | Development only | Netlify/Vercel (live) |
| **Animații UI** | ✅ framer-motion | ⚠️ Minimal |
| **Platform detection** | ✅ Sofisticat | 🟡 Basic |
| **Maturitate cod** | 🟡 Experimental | ✅ Stabil |
| **Documentare** | ✅ Completă | ✅ Completă |
| **Efort până la paritate** | ~10-16 săptămâni | - |

</details>

---

## ✨ Tehnologii

| Categorie | Tehnologie | Versiune |
|-----------|------------|----------|
| **Framework** | React | 19.x |
| **Limbaj** | TypeScript | 5.x |
| **Build Tool** | Vite | 6.x |
| **Stilizare** | TailwindCSS | 3.x |
| **Componente UI** | shadcn/ui | Latest |
| **Animații** | framer-motion | 11.x |
| **Baze de date** | sql.js (SQLite WASM) | 1.11.x |
| **Calcule financiare** | Decimal.js | 10.4.x |
| **Iconițe** | Lucide React | Latest |
| **PWA** | Service Worker + Manifest | - |

### De ce aceste tehnologii?

- **React 19** — Latest features, Server Components ready
- **TypeScript** — Type safety pentru calcule financiare critice
- **Vite 6** — Build ultrarapid, HMR instant
- **Decimal.js** — Precizie maximă, conform Regulament CE (ROUND_HALF_UP)
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

### Cum verifici rapid că deploy-ul funcționează

1. Rulează local `npm run build` (sau `pnpm run build` dacă folosești pnpm) – este exact aceeași comandă din Netlify.
2. Dacă build-ul reușește și în Netlify apare totuși un eșec, verifică tab-ul “Deploy log” pentru detalii despre versiunea de Node sau despre lipsa redirect-urilor.
3. Poți rula `npm install netlify-cli -g` și `netlify deploy --build` pentru a reproduce un deploy preview de pe propriul PC atunci când vrei să investighezi probleme mai complexe.

## 🔄 Sincronizare repo local ↔️ remote

Folosește pașii de mai jos înainte să lucrezi la un feature nou, mai ales după ce a fost fuzionat un PR care schimbă configurări de deploy.

1. **Actualizează informațiile din remote:** `git fetch origin`.
2. **Vezi starea curentă:** `git status` îți spune dacă ești în spatele remote-ului (mesajul “Your branch is behind…”).
3. **Adu ultimele modificări:** `git pull origin <nume-branch>` (de exemplu `main` sau `work`). Dacă ai fișiere locale necomise, fă un commit, rulează `git stash`, sau mută-le temporar în alt director înainte de pull.
4. **Verifică fișierele neversionate:** liniile din `git status` sub “Untracked files” (ex. `public/Sume lunare.jpg`) nu blochează `git pull`, dar vor fi incluse în următorul commit doar dacă rulezi `git add` pe ele. Dacă sunt fișiere personale, adaugă-le în `.gitignore` sau păstrează-le în afara repo-ului.

După acești pași, repository-ul local va fi în aceeași stare cu cel din Netlify/GitHub, ceea ce previne conflicte atunci când rulezi build-ul sau când deschizi PR-uri noi.

---

## 📁 Lucrul cu Bazele de Date

### Metoda 1: 🗂️ Selectare Dosar (Recomandată)

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
```
📁 Folderul tău
  ├── MEMBRII.db      ← Citit și scris automat
  ├── DEPCRED.db      ← Citit și scris automat
  ├── LICHIDATI.db    ← Optional
  └── ACTIVI.db       ← Optional
```

### Metoda 2: 📤 Încărcare Fișiere (Fallback Universal)

**✅ Disponibilă pe:** Toate browserele și platformele

#### Limitări
- 📥 **Upload manual** — selectare fișiere individuale
- 💾 **Download manual** — salvare după modificări
- 🔄 **Fără sincronizare** — datele în memorie până la download
- ⚠️ **Risc pierdere** — refresh înseamnă reload complet

#### Cum funcționează

1. **La pornire:** Click "📤 Încarcă fișiere baze de date"
2. **Selectare:** Alege `MEMBRII.db`, `DEPCRED.db`, etc. (multi-select)
3. **Lucru:** Modificările sunt doar în memorie
4. **Salvare:** Click "💾 Salvează" → download fișiere
5. **Persistență:** Suprascrie manual fișierele vechi cu cele descărcate

### Fișiere Necesare

| Fișier | Status | Descriere | Structură |
|--------|--------|-----------|-----------|
| **MEMBRII.db** | ✅ Obligatoriu | Date membri | `nr_fisa`, `NUM_PREN`, `COTIZATIE_STANDARD`, etc. |
| **DEPCRED.db** | ✅ Obligatoriu | Istoric lunar | `nr_fisa`, `luna`, `anul`, `impr_sold`, `dep_sold`, etc. |
| **LICHIDATI.db** | ℹ️ Opțional | Membri lichidați | `nr_fisa`, `data_lichidare` |
| **ACTIVI.db** | ℹ️ Opțional | Membri activi | `nr_fisa`, `DIVIDEND` |

**Validare automată:**
- ✅ Header SQLite (`SQLite format 3`)
- ✅ Structură tabele (MEMBRII, DEPCRED)
- ❌ Fișiere corupte sau invalide sunt respinse

---

## 🧩 Module — Status Detaliat

### ✅ Modul 1: Generare Lună (FUNCȚIONAL)

**Status:** 🟢 Complet implementat și testat

Port exact din aplicația Python desktop (`generare_luna.py`) cu îmbunătățiri.

#### Funcționalități

- [x] **Detectare automată** ultima lună din DEPCRED (`ORDER BY anul DESC, luna DESC`)
- [x] **Calculare automată** lună următoare (nu permite sărituri)
- [x] **Validare strictă** — doar luna imediat următoare
- [x] **Verificare membri lichidați** — excludere automată din LICHIDATI.db
- [x] **Aplicare cotizații** — din coloana `COTIZATIE_STANDARD` (MEMBRII)
- [x] **Moștenire rate împrumut** — din `impr_cred` luna anterioară
- [x] **Calcul dobândă stingere** — 4‰ pe suma pozitivelor (la plată integrală)
- [x] **Dividende în ianuarie** — pentru membri din ACTIVI.db (⚠️ **la DEBIT**, nu CREDIT!)
- [x] **Actualizare solduri** — împrumuturi + depuneri
- [x] **Precizie Decimal.js** — `ROUND_HALF_UP` conform Regulament CE
- [x] **Log live** — toate operațiunile în timp real în UI
- [x] **Export DEPCRED** — fișier `.db` actualizat
- [x] **Funcție ștergere** — elimină ultima lună (cu confirmare dublă)
- [x] **Flag prima** — `prima=1` pentru luna nouă, `prima=0` pentru restul

#### Calcule Financiare
```typescript
// Toate calculele cu Decimal.js
import Decimal from "decimal.js";
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

// Sold nou = Sold vechi + Debit - Credit
const soldNou = new Decimal(soldVechi)
  .add(debit)
  .sub(credit)
  .toDecimalPlaces(2);

// Zero-izare praguri mici (< 0.005)
if (soldNou.abs().lte(new Decimal("0.005"))) {
  soldNou = new Decimal(0);
}

// Dobândă stingere: 4‰ pe suma pozitivelor din perioada împrumutului
const dobanda = sumaPozitive.mul("0.004").toDecimalPlaces(2);
```

#### Validări

| Validare | Comportament |
|----------|--------------|
| Luna țintă există deja | Confirmare utilizator pentru suprascriere |
| Luna țintă nu e consecutivă | Eroare: "Puteți genera doar luna imediat următoare" |
| Membru lichidat | Skip automat (nu se generează rând) |
| Lipsă rând sursă | Warning în log + skip membru |
| DEPCRED gol | Eroare: "Nu există date în DEPCRED" |

#### Acțiuni Disponibile

- 🟢 **Generează Lună Selectată** — creează înregistrări pentru luna următoare
- 🔴 **Șterge Lună Selectată** — elimină ultima lună generată (⚠️ IREVERSIBIL!)
- 🟡 **Modifică Rata Dobândă** — schimbă rata (placeholder, nu e implementat)
- 📊 **Afișare membri** — lichidați, activi, fișe nealocate (placeholders)
- 💾 **Salvează DEPCRED** — export fișier actualizat
- 🗑️ **Șterge log** — curăță consola

#### Algoritmul (Pseudocod)
```
1. Detectează ultima_lună din DEPCRED (anul, luna)
2. Calculează lună_țintă = ultima_lună + 1 (cu rollover la ianuarie)
3. Validează că luna_selectată == lună_țintă (nu permite sărituri)
4. Verifică dacă luna_țintă există → confirmă suprascriere
5. Reset prima=0 pentru TOATE lunile
6. Pentru fiecare membru din MEMBRII:
   a. Verifică dacă e lichidat → skip
   b. Preia solduri din lună_sursă (ultima_lună)
   c. Inițializează: dep_deb = cotizație_standard, dep_cred = 0
   d. Moștenește impr_cred din lună_sursă (dacă impr_deb sursă == 0)
   e. Dacă luna_țintă == ianuarie → adaugă dividend la dep_deb
   f. Calculează solduri_noi = solduri_vechi + deb - cred
   g. Zero-izează dacă |sold| < 0.005
   h. Dacă impr_sold_vechi > 0 și impr_sold_nou == 0 → dobândă stingere
   i. INSERT cu prima=1
7. Raportează: membri procesați, totaluri (dep_sold, impr_sold, dobândă)
```

### 🔒 Module 2-7: În Dezvoltare (PLACEHOLDER)

| Modul | Status | Complexitate | Estimare | Prioritate |
|-------|--------|--------------|----------|------------|
| **Sume Lunare** | ❌ UI placeholder | Medie | 1-2 săpt | 🔥 Urgent |
| **Membri (CRUD)** | ❌ UI placeholder | Mare | 2-3 săpt | 🔥 Urgent |
| **Statistici** | ❌ UI placeholder | Medie | 1-2 săpt | 🟡 Important |
| **Vizualizare Lunară** | ❌ UI placeholder | Mică | 1 săpt | 🟡 Important |
| **Rapoarte PDF** | ❌ UI placeholder | Mare | 2-3 săpt | 🟢 Nice-to-have |
| **Împrumuturi** | ❌ UI placeholder | Mare | 2-3 săpt | 🟢 Nice-to-have |

**Efort total estimat:** 10-16 săptămâni (2.5-4 luni) pentru paritate cu CARapp_web

---

## 🎨 Interfață Utilizator

### 1. LandingPage — Selecție Sursă Date

**Aspect:** Modern, gradient backgrounds, 2 carduri mari

<details>
<summary><b>Screenshot & Detalii</b></summary>
```
┌─────────────────────────────────────────┐
│           🏦                            │
│    CARapp Petroșani                     │
│  Casa de Ajutor Reciproc                │
├─────────────────────────────────────────┤
│  👋 Bine ați venit!                     │
│  Pentru a începe, încărcați bazele...  │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐ │
│  │ 🗂️ Selectează dosar cu baze de   │ │
│  │    date                           │ │
│  │ ✨ Recomandat: sincronizare auto  │ │
│  │ 📱 Chrome/Edge desktop            │ │
│  └───────────────────────────────────┘ │
│  ┌───────────────────────────────────┐ │
│  │ 📤 Încarcă fișiere baze de date  │ │
│  │ Compatibil: toate browserele      │ │
│  │ 📱 Disponibil peste tot           │ │
│  └───────────────────────────────────┘ │
├─────────────────────────────────────────┤
│  📋 Fișiere necesare:                   │
│  ✅ MEMBRII.db - Obligatoriu            │
│  ✅ DEPCRED.db - Obligatoriu            │
│  ℹ️ LICHIDATI.db - Opțional             │
│  ℹ️ ACTIVI.db - Opțional                │
├─────────────────────────────────────────┤
│  ℹ️ Browser: Chrome | Platform: Windows│
│  ✅ PWA: Nu | 🌐 Online: Da             │
└─────────────────────────────────────────┘
```

**Features:**
- Detectare automată capabilities (File System API support)
- Ascundere opțiune "Selectează dosar" pe iOS/Safari
- Validare fișiere la încărcare (SQLite header + structură tabele)
- Loading states elegante
- Error handling cu mesaje clare

</details>

### 2. Dashboard — Pagină Principală

**Aspect:** Grid modern cu status baze + carduri module

<details>
<summary><b>Layout & Componente</b></summary>
```
┌─────────────────────────────────────────────────────────────┐
│  CARapp Petroșani               [🔄 Schimbă sursa datelor] │
│  Casa de Ajutor Reciproc                                    │
├─────────────────────────────────────────────────────────────┤
│  📊 Status Baze de Date                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ MEMBRII  │ │ DEPCRED  │ │LICHIDATI │ │ ACTIVI   │      │
│  │    ✓     │ │    ✓     │ │    ℹ     │ │    ℹ     │      │
│  │ Încărcat │ │ Încărcat │ │ Opțional │ │ Opțional │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                              │
│  📁 Sursa datelor: 🗂️ Dosar local (sincronizare automată)  │
├─────────────────────────────────────────────────────────────┤
│  🧩 Module Disponibile                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ 📅 Generare │ │ 📊 Rapoarte │ │ 💰 Împrum.  │          │
│  │    Lună     │ │  🔒 Curând  │ │  🔒 Curând  │          │
│  │ ✅ ACTIV    │ │             │ │             │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ 👥 Membri   │ │ 📈 Statist. │ │ ⚙️ Setări   │          │
│  │  🔒 Curând  │ │  🔒 Curând  │ │  🔒 Curând  │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Status vizual baze (verde = încărcat, albastru = opțional)
- Carduri module cu hover effects
- 1 modul activ (verde) + 5 disabled (gri cu "🔒 În curând...")
- Indicator sursă date (dosar local vs upload)

</details>

### 3. Sidebar — Meniu Lateral Glisant

**Animație:** framer-motion (slide in/out)

<details>
<summary><b>Detalii Implementare</b></summary>
```typescript
// Sidebar cu animație framer-motion
<motion.div
  animate={{ width: isOpen ? 220 : 72 }}
  className="fixed left-0 top-0 bottom-0 bg-slate-900/90 backdrop-blur-md"
>
  <div className="flex flex-col mt-4">
    {items.map(({ id, icon: Icon, label }) => (
      <button onClick={() => onSelect(id)}>
        <Icon className="w-5 h-5" />
        {isOpen && <span>{label}</span>}
      </button>
    ))}
  </div>
  
  <button onClick={onToggle}>
    {isOpen ? "⏪" : "⏩"}
  </button>
</motion.div>
```

**Items:**
- 💰 Sume lunare
- 🧮 Generare lună
- 📅 Vizualizare lunară
- 📆 Vizualizare anuală
- ➕ Adăugare membru
- 🗑️ Ștergere membru
- 🏦 Dividende

**Status:** Layout complet, funcționalitate placeholder (doar "Generare lună" rutează)

</details>

### 4. Taskbar — Bară Fixă Jos

**Poziție:** `fixed bottom-0`, backdrop blur
```
┌─────────────────────────────────────────────────────┐
│  [☰ Meniu]              [📤 Reîncarcă] [💾 Salvează]│
└─────────────────────────────────────────────────────┘
```

**Funcții:**
- **☰ Meniu** — toggle sidebar (open/close)
- **📤 Reîncarcă bazele** — resetează + reîncarcă (prompt upload sau refresh folder handle)
- **💾 Salvează** — persistă modificările (filesystem write sau download)

### 5. Modul Generare Lună — UI Detailat

<details>
<summary><b>Layout Complet</b></summary>
```
┌─────────────────────────────────────────────────────────┐
│  [← Înapoi la Dashboard]                                │
├─────────────────────────────────────────────────────────┤
│  Ultima lună: 09-2024 | Următoarea lună: 10-2024       │
│  Rată dobândă lichidare: 0.4‰                           │
├─────────────────────────────────────────────────────────┤
│  Selectați luna: [10 - Octombrie ▼] [2024 ▼]           │
│  [🟢 Generează Lună Selectată]                          │
│  [🔴 Șterge Lună Selectată]                             │
│  [🟡 Modifică Rata Dobândă]                             │
├─────────────────────────────────────────────────────────┤
│  [Numere fișă nealocate] [Membri lichidați] [Activi]   │
│  [Exportă rezumat] [Șterge log]                         │
├─────────────────────────────────────────────────────────┤
│  ┌─── Log Live ─────────────────────────────────────┐  │
│  │ 📅 Generare 10-2024 (Sursă: 09-2024)            │  │
│  │ ✅ Membri activi: 245 | Lichidați excluși: 12   │  │
│  │ ➕ Procesate 50 fișe...                          │  │
│  │ 🎁 Dividend 100.00 pentru fișa 123              │  │
│  │ 💸 Dobândă stingere 4.50 pentru fișa 456        │  │
│  │ ➕ Procesate 100 fișe...                         │  │
│  │ ...                                              │  │
│  │ ✅ Generare 10-2024 finalizată.                  │  │
│  │ Σ dep_sold_nou=1234567.89 | Σ impr_sold_nou=... │  │
│  └──────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  [💾 Salvează DEPCRED actualizat]                       │
│  Fișier pregătit pentru salvare.                        │
└─────────────────────────────────────────────────────────┘
```

</details>

---

## 📂 Structura Proiectului
```
carapp2/
├── public/                     # Fișiere statice
│   ├── sw.js                  # Service Worker (PWA)
│   └── manifest.json          # PWA manifest
│
├── src/
│   ├── components/            # Componente React
│   │   ├── LandingPage.tsx    # Selecție sursă date
│   │   ├── Dashboard.tsx      # Dashboard principal
│   │   ├── GenerareLuna.tsx   # ⭐ MODUL FUNCȚIONAL
│   │   ├── Sidebar.tsx        # Meniu lateral animat
│   │   ├── Taskbar.tsx        # Bară fixă jos
│   │   └── ui/                # shadcn/ui components
│   │       ├── buttons.tsx
│   │       ├── dialog.tsx
│   │       └── card.tsx
│   │
│   ├── services/              # Business logic
│   │   ├── databaseManager.ts # ⭐ Dual method (filesystem + upload)
│   │   └── platformDetector.ts# Detectare capabilities
│   │
│   ├── logic/                 # Core algorithms
│   │   ├── generateMonth.ts   # ⭐ Port Python (generare_luna.py)
│   │   ├── finance.ts         # Calcule Decimal.js
│   │   └── dbLoader.ts        # Legacy (probabil nefolosit)
│   │
│   ├── lib/                   # Utilități
│   │   └── utils.ts           # Helpers (formatDate, cn, etc.)
│   │
│   ├── types/                 # TypeScript
│   │   └── sqljs.d.ts         # Type definitions sql.js
│   │
│   ├── App.tsx                # Root component
│   ├── main.tsx               # Entry point
│   └── index.css              # Tailwind globals
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

### 🔴 Decizie Strategică Necesară

**Întrebare:** Continuăm carapp2 sau migrăm la CARapp_web?

<details>
<summary><b>📊 Analiza Opțiuni</b></summary>

#### Opțiunea A: Continuare carapp2

**PRO:**
- 🔬 Explorare File System Access API (tehnologie viitoare)
- 🚀 Experiență zero-friction pentru desktop users
- 📚 Învățare și experimentare
- 🎨 UI/UX modern cu animații

**CONTRA:**
- 🔄 Duplicare efort (CARapp_web există)
- ⏱️ 10-16 săptămâni până la paritate
- 📱 Compatibilitate limitată (nu iOS, Safari, Firefox)
- 💶 Conversie EUR necesită port separat
- 🐛 Bug fixes în 2 codebases

#### Opțiunea B: Migrare la CARapp_web

**PRO:**
- ✅ Toate modulele implementate
- 💶 Conversie EUR funcțională
- 🌐 Compatibilitate universală
- 🚀 Production-ready
- ☁️ Deploy Netlify/Vercel

**CONTRA:**
- ❌ Renunțare File System API
- 📤 Upload/download manual
- 🎨 UI mai puțin polished

#### Opțiunea C: Hibrid

**Concept:** Port File System API în CARapp_web ca feature optional

**PRO:**
- ✅ Best of both worlds
- 🎯 Un singur codebase
- 🔄 Feature toggle (desktop: filesystem, altele: upload)

**CONTRA:**
- 🏗️ Refactoring semnificativ
- 🧪 Testare complexitate crescută

</details>

### 📅 Roadmap — Dacă se continuă carapp2

#### Fază 1: Module Core (4-6 săptămâni)

**Săptămâna 1-2: Sume Lunare**
- [ ] UI introducere plăți pentru membru selectat
- [ ] Calculator dobândă live (Decimal.js)
- [ ] Validare input (suma > 0, membru valid)
- [ ] Update DEPCRED (impr_deb, impr_cred, dep_deb, dep_cred)
- [ ] Log operațiuni + confirmare salvare

**Săptămâna 3-5: Gestiune Membri**
- [ ] Lista membri (tabel cu sort/filter)
- [ ] Căutare după nume/număr fișă
- [ ] Detalii membru (modal sau pagină separată)
- [ ] Adăugare membru nou (formular validat)
- [ ] Editare date membru
- [ ] Lichidare membru (flag în LICHIDATI.db)
- [ ] Status vizual (activ/lichidat)

**Săptămâna 6: Îmbunătățiri UX**
- [ ] Replace `alert()` cu toast notifications (shadcn/ui)
- [ ] Loading spinners uniformizați
- [ ] Error boundaries React
- [ ] Confirmări cu Dialog (shadcn/ui)

#### Fază 2: Raportare & Analiză (3-4 săptămâni)

**Săptămâna 7-8: Statistici**
- [ ] Integrare Recharts
- [ ] Total membri (activi/lichidați/total)
- [ ] Distribuție solduri (grafic bar)
- [ ] Evoluție lunară (grafic line)
- [ ] Top 10 împrumuturi
- [ ] Top 10 depuneri

**Săptămâna 9-10: Vizualizare Lunară**
- [ ] Selectare lună/an (dropdown)
- [ ] Tabel tranzacții (toate fișele)
- [ ] Filtrare după membru
- [ ] Sort după coloană
- [ ] Export CSV

#### Fază 3: Features Avansate (4-6 săptămâni)

**Săptămâna 11-13: Rapoarte PDF**
- [ ] Integrare pdf-lib
- [ ] Template raport lunar
- [ ] Template raport anual
- [ ] Preview PDF în browser
- [ ] Download PDF

**Săptămâna 14-16: Împrumuturi**
- [ ] Înregistrare împrumut nou
- [ ] Gestiune rate (planificare)
- [ ] Alertă scadențe (badge notificare)
- [ ] Calcul dobândă automată
- [ ] Istoric împrumuturi per membru

#### Fază 4: Long-term (3+ luni)

**Conversie RON→EUR** (port din CARapp_web)
- [ ] Port logică conversie (conversionUtils.js)
- [ ] UI configurare curs
- [ ] Validare baze RON
- [ ] Generare baze EUR (_EUR.db suffix)
- [ ] Toggle dual currency în UI
- [ ] Jurnal conversie
- [ ] Statistici conversie

**Testare & Optimizare**
- [ ] Vitest pentru `logic/` (>80% coverage)
- [ ] React Testing Library pentru `components/`
- [ ] Playwright E2E (opțional)
- [ ] Performance profiling
- [ ] Virtual scrolling (tabele >1000 rows)
- [ ] Code splitting (lazy load module)

**TOTAL ESTIMAT:** 14-20 săptămâni (3.5-5 luni)

---

## ⚠️ Limitări Cunoscute

### 1. 🌐 File System Access API — Compatibilitate

❌ **NU funcționează pe:**
- Safari (macOS și iOS) — Apple nu a implementat API-ul
- Firefox — În dezvoltare, nu e disponibil încă
- Browsere mobile (Android Chrome, Samsung Internet)
- Browsere vechi (<2021)

✅ **Funcționează pe:**
- Chrome 86+ (desktop: Windows, macOS, Linux, ChromeOS)
- Edge 86+ (desktop: Windows, macOS)
- Opera 72+ (desktop)

📊 **Statistici compatibilitate (Can I Use):**
- Desktop: ~65% (Chrome + Edge)
- Mobile: ~0% (niciun browser mobil)
- Total global: ~40%

➡️ **Soluție:** Aplicația detectează automat și oferă fallback upload universal.

### 2. 🧩 Module Incomplete

**Status curent:** 1 / 7 module (14% completare)

| Modul | % Completare | Blocant producție? |
|-------|--------------|-------------------|
| Generare Lună | 100% | ❌ Nu |
| Sume Lunare | 0% | ✅ DA |
| Membri (CRUD) | 0% | ✅ DA |
| Statistici | 0% | ⚠️ Parțial |
| Vizualizare Lunară | 0% | ⚠️ Parțial |
| Rapoarte PDF | 0% | ⚠️ Parțial |
| Împrumuturi | 0% | ⚠️ Parțial |

**Efort până la 100%:** 10-16 săptămâni (2.5-4 luni full-time)

### 3. 💶 Conversie RON→EUR — ABSENT

❌ **Această versiune NU are conversie valutară.**

Pentru conversie conform **Regulamentului CE 1103/97**, folosiți [CARapp_web](https://github.com/totilaAtila/CARapp_web):

✅ **Features CARapp_web:**
- Configurare curs schimb (default: 4.9755 RON/EUR)
- Validare integritate baze RON
- Conversie individuală per înregistrare (Decimal.js ROUND_HALF_UP)
- Generare baze EUR complete (MEMBRIIEUR, DEPCREDEUR, etc.)
- Toggle dual currency în UI (🇷🇴 RON / 🇪🇺 EUR)
- Jurnal conversie detaliat (progres, erori, warnings)
- Statistici conversie (totaluri, diferențe rotunjire)
- Descărcare baze EUR

**Efort port în carapp2:** 2-3 săptămâni (după module de bază)

### 4. 📱 Experiență Mobilă Suboptimală

⚠️ **Limitări pe mobil/tablete:**

| Aspect | Desktop | Mobile |
|--------|---------|--------|
| File System API | ✅ Da (Chrome/Edge) | ❌ Nu |
| Upload fallback | ✅ Rapid | ⚠️ Funcțional |
| UI responsive | ✅ Perfect | ⚠️ OK |
| Touch optimization | N/A | ❌ Nu |
| Tabele mari | ✅ Scroll ușor | ⚠️ Dificil |
| Sidebar animat | ✅ Smooth | ⚠️ Poate lag |

➡️ **Pentru utilizare mobilă intensivă**, preferați [CARapp_web](https://github.com/totilaAtila/CARapp_web).

### 5. 💾 Persistență Date — Subtilități

#### În modul File System API:
✅ **Persistență automată** între sesiuni
✅ **Sincronizare** la fiecare salvare
⚠️ **Permisiune** browser (solicitare la prima utilizare)
⚠️ **Refresh page** → pierdere referință folder handle (re-select necesar)

#### În modul Upload:
❌ **Zero persistență** — datele în memorie până la download
⚠️ **Refresh page** → pierdere completă (reload obligatoriu)
⚠️ **Close tab** → pierdere modificări nesalvate
✅ **Control total** — fișierele rămân pe disc

### 6. 🔒 Securitate și Permisiuni

⚠️ **File System Access API** necesită:
- Permisiune explicită utilizator (prompt browser)
- Origine HTTPS (sau localhost pentru dev)
- User gesture (click buton, nu automat la page load)

⚠️ **Riscuri:**
- Aplicația poate citi/scrie ORICE fișier din folderul selectat
- Utilizatorul trebuie să fie conștient de această permisiune
- Browser-ul solicită re-confirmare periodic (security measure)

✅ **Best practices implementate:**
- Validare strictă fișiere (SQLite header, structură tabele)
- Nicio scriere fără confirmare utilizator
- Log toate operațiunile de scriere
- Backup recomandat înainte de modificări

---

## 🧪 Testare

### ✅ Testare Manuală (curent)

**Checklist:**

1. **Încărcare baze**
   - [ ] Metoda filesystem (Chrome/Edge desktop)
   - [ ] Metoda upload (orice browser)
   - [ ] Validare erori (fișier invalid, lipsă tabele)

2. **Dashboard**
   - [ ] Status baze vizibil corect
   - [ ] Carduri module (1 activ, 5 disabled)
   - [ ] Buton "Schimbă sursa datelor" resetează

3. **Generare Lună**
   - [ ] Detectare automată ultima lună
   - [ ] Selectare lună (doar următoarea permite generare)
   - [ ] Generare cu succes (verifică log)
   - [ ] Salvare DEPCRED
   - [ ] Reîncărcare → verifică persistență
   - [ ] Ștergere lună (cu confirmare)
   - [ ] Verificare divizibile ianuarie (ACTIVI.db)
   - [ ] Verificare excludere lichidați (LICHIDATI.db)
   - [ ] Verificare dobândă stingere (împrumut stins complet)

4. **Sidebar + Taskbar**
   - [ ] Toggle sidebar (animație smooth)
   - [ ] Butoane placeholder (nu erori console)
   - [ ] Buton "Reîncarcă" funcționează
   - [ ] Buton "Salvează" funcționează

5. **PWA**
   - [ ] Service Worker înregistrat
   - [ ] Funcționează offline (după prima încărcare)

### ❌ Testare Automată (planificată)
```bash
# Unit tests (logic/)
pnpm test:unit

# Component tests (components/)
pnpm test:components

# E2E tests (opțional)
pnpm test:e2e

# Coverage
pnpm test:coverage
```

**Target coverage:** >80% pentru `logic/`, >60% pentru `components/`

---

## 🤝 Contribuții

Proiectul este **open for contributions**, dar în stadiu experimental.

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
- Modul Sume Lunare (UI + logică)
- Modul Membri - Vizualizare (listă + detalii)

🟡 **Important:**
- Modul Statistici (integrare Recharts)
- Modul Vizualizare Lunară (tabel + filtre)

🟢 **Nice-to-have:**
- Testare automată (Vitest + RTL)
- Rapoarte PDF (pdf-lib)
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
- 🌐 [CARapp_web](https://github.com/totilaAtila/CARapp_web) — Versiunea web production-ready

---

## 🔗 Resurse Utile

### Documentație Tehnologii

- 📚 [sql.js Documentation](https://sql.js.org/)
- 📐 [Decimal.js Documentation](https://mikemcl.github.io/decimal.js/)
- 🎨 [Tailwind CSS Docs](https://tailwindcss.com/docs)
- 🧩 [shadcn/ui Components](https://ui.shadcn.com/)
- 🎬 [Framer Motion Docs](https://www.framer.com/motion/)

### Web APIs

- 🗂️ [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (MDN)
- 🗂️ [File System Access API](https://web.dev/file-system-access/) (web.dev)
- 💾 [Can I Use: File System Access](https://caniuse.com/native-filesystem-api)

### Regulamente CAR

- 💶 [Regulamentul CE 1103/97](https://eur-lex.europa.eu/legal-content/RO/TXT/?uri=CELEX:31997R1103) — Conversia la euro
- 🏦 [Legea CAR-urilor](https://legislatie.just.ro/) — Legislație română

---

## 📊 Status Proiect

| Metric | Valoare | Target |
|--------|---------|--------|
| **Versiune** | Alpha v0.1.0 | Beta v0.5.0 |
| **Module complete** | 1 / 7 (14%) | 7 / 7 (100%) |
| **Test coverage** | 0% | 80% |
| **Compatibilitate** | ~40% users | 100% users |
| **Efort rămas** | 10-16 săptămâni | - |
| **Ultima actualizare** | 24 oct 2025 | - |

---

## 📝 Changelog

### [24 octombrie 2025] — Documentare completă
- ✅ Unificare README + PROJECT_CONTEXT
- ✅ Comparație detaliată cu CARapp_web
- ✅ Clarificare stadiu actual (1/7 module)
- ✅ Roadmap realist (10-16 săptămâni)
- ✅ Decizie strategică (A vs B vs C)
- ✅ Documentare completă limitări

### [19 octombrie 2025] — Setup inițial
- ✅ Setup Vite + React 19 + TypeScript
- ✅ Integrare sql.js + Decimal.js
- ✅ File System Access API + fallback upload
- ✅ Platform detection sofisticat
- ✅ Port complet modul Generare Lună
- ✅ UI basic (Tailwind + shadcn/ui)
- ✅ Sidebar animat (framer-motion)
- ✅ Taskbar persistent
- ✅ PWA support (Service Worker)

---

<div align="center">

**🎯 Întrebare pentru dezvoltarea viitoare:**

> Continuăm **carapp2** (10-16 săpt până la paritate)  
> sau migrăm la **CARapp_web** (deja complet)?

**Factori de decizie:**
- ⏱️ Timp disponibil | 🎯 Prioritate (learning vs shipping)
- 🔄 Conversie EUR (când?) | 📱 Platforme (desktop vs universal)
- 👥 Utilizatori (tehnici vs diversi)

---

**Ultima actualizare:** 24 octombrie 2025  
**Versiune:** Alpha v0.1.0  
**Status:** 🚧 În dezvoltare activă (experimental)

[⬆ Back to top](#carapp-petroșani-v2--carapp2-)

</div>
