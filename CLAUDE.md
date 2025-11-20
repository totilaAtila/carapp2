# CLAUDE.md - AI Assistant Guide for CARapp Petroșani v2

**Last Updated:** 2025-11-18
**Version:** 1.0.1
**Project Type:** Progressive Web Application (PWA) - Financial Management System

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Codebase Architecture](#codebase-architecture)
3. [Technology Stack](#technology-stack)
4. [Directory Structure](#directory-structure)
5. [Key Concepts & Patterns](#key-concepts--patterns)
6. [Database Management](#database-management)
7. [Development Workflow](#development-workflow)
8. [Module Structure](#module-structure)
9. [Code Conventions](#code-conventions)
10. [Common Tasks](#common-tasks)
11. [Deployment](#deployment)
12. [Important Files Reference](#important-files-reference)
13. [Testing Strategy](#testing-strategy)
14. [AI Assistant Guidelines](#ai-assistant-guidelines)

---

## Project Overview

### What is CARapp Petroșani?

CARapp Petroșani v2 is a **browser-based financial management system** for "Casa de Ajutor Reciproc Petroșani" (Mutual Aid Society). The application processes SQLite databases **entirely in the browser** using WebAssembly (sql.js), with **zero server dependency** for data processing.

### Core Features

- **Privacy-First:** All data processing happens client-side; data never leaves the user's device
- **Dual Database Access Methods:**
  - **File System Access API** (Chrome/Edge desktop) - Direct file manipulation
  - **Upload/Download Fallback** (Safari, Firefox, mobile) - Universal compatibility
- **PWA:** Installable on desktop and mobile platforms
- **Cross-Platform:** Works on Windows, macOS, Linux, iOS, Android
- **Dual Currency:** Supports both RON (Romanian Lei) and EUR with conversion capabilities
- **Financial Precision:** Uses Decimal.js for calculations compliant with EU Regulation CE 1103/97

### Key Metrics

- **12 Functional Modules** (100% complete)
- **~18,000 lines** of TypeScript code
- **19 main components** + 18 UI components
- **0 critical vulnerabilities**
- **100% cross-browser compatibility** (with fallbacks)

---

## Codebase Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                        │
│              (React 19 + TypeScript + Tailwind)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                   Component Layer                            │
│  • 12 Feature Modules (GenerareLuna, VizualizareLunara, etc)│
│  • Shared UI Components (shadcn/ui based on Radix UI)       │
│  • Layout Components (Dashboard, Sidebar, Taskbar)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                   Services Layer                             │
│  • databaseManager.ts - Database orchestration              │
│  • databasePersistence.ts - IndexedDB caching               │
│  • platformDetector.ts - Capability detection               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                    Logic Layer                               │
│  • generateMonth.ts - Month generation business logic       │
│  • finance.ts - Financial calculations (Decimal.js)         │
│  • dbLoader.ts - Database loading utilities                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                  Data Storage Layer                          │
│  • sql.js (SQLite via WebAssembly)                          │
│  • IndexedDB (Temporary cache)                              │
│  • File System Access API / File API                        │
└─────────────────────────────────────────────────────────────┘
```

### State Management

- **No Redux/Zustand:** State is managed via React's built-in hooks (useState, useEffect, useCallback)
- **Database Context:** The `databases` object (type: `DBSet`) is passed through props from `App.tsx` to feature components
- **Currency State:** Managed globally in `App.tsx` with `CurrencyToggle` component

### Routing

- **No React Router:** Simple component switching based on state in `App.tsx`
- Navigation via Sidebar component with string-based view selection

---

## Technology Stack

### Core Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.1.1 | UI framework |
| **TypeScript** | 5.9.3 | Type safety and developer experience |
| **Vite** | 7.1.7 | Build tool and dev server |
| **TailwindCSS** | 3.4.13 | Utility-first styling |

### Key Libraries

#### Data Processing
- **sql.js** `1.13.0` - SQLite compiled to WebAssembly for in-browser database operations
- **Decimal.js** `10.6.0` - Arbitrary-precision decimal arithmetic for financial calculations

#### UI Components
- **shadcn/ui** - Component library built on Radix UI primitives
- **Radix UI** - Headless UI components (accordion, dialog, select, etc.)
- **Lucide React** `0.546.0` - Icon library
- **Framer Motion** `12.23.24` - Animation library

#### Forms & Validation
- **react-hook-form** `7.56.3` - Form state management
- **zod** `3.24.4` - Schema validation

#### File Operations
- **file-saver** `2.0.5` - File download helper
- **jsPDF** `3.0.3` - PDF generation
- **jspdf-autotable** `5.0.2` - PDF table generation
- **ExcelJS** `4.4.0` - Excel file generation (export only, write-only usage)
- **pdf-lib** `1.17.1` - PDF manipulation

#### Charts & Visualization
- **Recharts** `3.3.0` - Chart library

#### Date & Time
- **date-fns** `3.6.0` - Date manipulation utilities

### Development Tools

| Tool | Purpose |
|------|---------|
| **ESLint** | Code linting (TypeScript rules) |
| **PostCSS** | CSS processing |
| **Autoprefixer** | CSS vendor prefixing |
| **vite-plugin-pwa** | PWA generation |

### Special Features

- **DejaVu Sans Fonts** - Embedded as base64 (~1.9MB) for Romanian diacritics support in PDFs
- **File System Access API** - Modern file handling for Chrome/Edge
- **IndexedDB** - Client-side caching layer
- **Service Worker** - PWA with update prompts

---

## Directory Structure

```
carapp2/
├── public/                          # Static assets
│   ├── fonts/                       # DejaVu Sans TTF files
│   │   ├── DejaVuSans.ttf
│   │   └── DejaVuSans-Bold.ttf
│   ├── service-worker.js            # PWA service worker
│   ├── manifest.json                # PWA manifest
│   ├── 192.png                      # PWA icon (192x192)
│   ├── 512.png                      # PWA icon (512x512)
│   └── favicon.ico
│
├── src/
│   ├── components/                  # React components
│   │   ├── ui/                      # shadcn/ui components
│   │   │   ├── alert.tsx
│   │   │   ├── buttons.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── select.tsx
│   │   │   └── tabs.tsx
│   │   │
│   │   ├── GenerareLuna.tsx         # Module 1: Generate new month
│   │   ├── VizualizareLunara.tsx    # Module 2: Monthly view
│   │   ├── SumeLunare.tsx           # Module 3: Member history with editing
│   │   ├── VizualizareAnuala.tsx    # Module 4: Annual reports
│   │   ├── VizualizareTrimestriala.tsx # Module 5: Quarterly reports
│   │   ├── AdaugaMembru.tsx         # Module 6: Add/edit member
│   │   ├── StergeMembru.tsx         # Module 7: Delete member
│   │   ├── Lichidati.tsx            # Module 8: Member liquidation
│   │   ├── Dividende.tsx            # Module 9: Dividend distribution
│   │   ├── Statistici.tsx           # Module 10: Statistics dashboard
│   │   ├── Listari.tsx              # Module 11: Receipt generation
│   │   ├── Conversion.tsx           # Module 12: RON→EUR conversion
│   │   ├── CalculeazaDobanda.tsx    # Interest calculation utility
│   │   ├── Dashboard.tsx            # Main dashboard
│   │   ├── LandingPage.tsx          # Initial database loading screen
│   │   ├── Sidebar.tsx              # Navigation sidebar
│   │   ├── Taskbar.tsx              # Top taskbar with actions
│   │   ├── CurrencyToggle.tsx       # RON/EUR switcher
│   │   ├── FloatingBackButton.tsx   # Mobile back button
│   │   └── UpdatePrompt.tsx         # PWA update notification
│   │
│   ├── services/                    # Core services
│   │   ├── databaseManager.ts       # Database orchestration (dual method)
│   │   ├── databasePersistence.ts   # IndexedDB caching
│   │   └── platformDetector.ts      # Browser capability detection
│   │
│   ├── logic/                       # Business logic
│   │   ├── generateMonth.ts         # Month generation logic
│   │   ├── finance.ts               # Financial calculations
│   │   └── dbLoader.ts              # Database loading utilities
│   │
│   ├── utils/                       # Utilities
│   │   └── dejavu-fonts.ts          # Base64-encoded fonts (~1.9MB)
│   │
│   ├── types/                       # TypeScript types
│   │   └── sqljs.d.ts               # sql.js type definitions
│   │
│   ├── lib/                         # Library utilities
│   │   └── utils.ts                 # TailwindCSS utility (cn function)
│   │
│   ├── App.tsx                      # Root component
│   ├── main.tsx                     # Application entry point
│   └── index.css                    # Global styles
│
├── scripts/
│   └── convert-fonts.cjs            # TTF → base64 conversion script
│
├── package.json                     # Dependencies and scripts
├── package-lock.json
├── tsconfig.json                    # TypeScript configuration
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts                   # Vite configuration
├── tailwind.config.js               # Tailwind CSS configuration
├── postcss.config.js                # PostCSS configuration
├── eslint.config.js                 # ESLint configuration
├── netlify.toml                     # Netlify deployment config
├── .gitignore
├── README.md                        # User documentation
├── LICENSE
├── CLAUDE.md                        # This file
├── database_flow.md                 # Database architecture docs
├── Structură Baze de Date - Proiect carapp2.md  # DB schema docs
└── PYTHON_FIX_PROMPT.md            # Python porting reference

```

---

## Key Concepts & Patterns

### 1. Dual Database Access Pattern

The application supports two methods for database access:

#### Method A: File System Access API (Preferred)
- **Available on:** Chrome 86+, Edge 86+, Opera 72+ (desktop only)
- **How it works:**
  1. User selects a folder containing `.db` files
  2. App receives persistent file handles
  3. Direct read/write to files without upload/download
  4. Changes persist immediately to disk

#### Method B: Upload/Download Fallback (Universal)
- **Available on:** All browsers (Safari, Firefox, mobile)
- **How it works:**
  1. User uploads `.db` files via file input
  2. Files loaded into memory as ArrayBuffers
  3. User clicks "Save" to download modified files
  4. Manual file replacement required

**Code Reference:** `src/services/databaseManager.ts`

### 2. Database Structure

The application manages **up to 11 SQLite databases**:

#### RON Databases (6 required for RON mode)
- **MEMBRII.db** - Member personal data and standard contributions
- **DEPCRED.db** - Monthly transaction history
- **activi.db** - Active members eligible for dividends
- **INACTIVI.db** - Temporarily inactive members
- **LICHIDATI.db** - Liquidated members
- **CHITANTE.db** - Receipt numbering (shared with EUR)

#### EUR Databases (5 optional for dual currency)
- **MEMBRIIEUR.db** - Member data in EUR
- **DEPCREDEUR.db** - Transaction history in EUR
- **activiEUR.db** - Active members EUR
- **INACTIVIEUR.db** - Inactive members EUR
- **LICHIDATIEUR.db** - Liquidated members EUR

**Note:** CHITANTE.db is **shared** between RON and EUR.

**Schema Reference:** See `Structură Baze de Date - Proiect carapp2.md`

### 3. Financial Precision with Decimal.js

**CRITICAL:** All financial calculations **must** use Decimal.js with `ROUND_HALF_UP` mode to comply with EU Regulation CE 1103/97.

```typescript
import Decimal from "decimal.js";

// ✅ CORRECT
const dobanda = new Decimal(principal).times(rate);
const result = dobanda.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

// ❌ WRONG - JavaScript floating point arithmetic
const dobanda = principal * rate; // NEVER DO THIS
```

**Code Reference:** `src/logic/finance.ts`

### 4. Type-Safe Database Access

```typescript
// DBSet interface from databaseManager.ts
export interface DBSet {
  // RON databases (optional - must be complete set)
  membrii?: Database;
  depcred?: Database;
  activi?: Database;
  inactivi?: Database;
  lichidati?: Database;

  // EUR databases (optional - must be complete set)
  membriieur?: Database;
  depcredeur?: Database;
  activieur?: Database;
  inactivieur?: Database;
  lichidatieur?: Database;

  // Common database (required)
  chitante: Database;

  // Configuration
  source: "filesystem" | "upload";
  folderHandle?: any;
  availableCurrencies: ("RON" | "EUR")[];
  activeCurrency: "RON" | "EUR";
  hasEuroData: boolean;
  loadedAt: Date;
  lastSaved?: Date;
}
```

### 5. Responsive Design Pattern

Components implement **dual layouts**:
- **Desktop (≥1024px):** Tables, multi-column layouts
- **Mobile (<1024px):** Cards, single-column, tabs for sections

```typescript
const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

useEffect(() => {
  const handleResize = () => setIsMobile(window.innerWidth < 1024);
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

### 6. PDF Generation with Romanian Diacritics

Uses embedded DejaVu Sans fonts for correct diacritics rendering:

```typescript
import { dejavuSansBase64, dejavuSansBoldBase64 } from '@/utils/dejavu-fonts';

const doc = new jsPDF();
doc.addFileToVFS("DejaVuSans.ttf", dejavuSansBase64);
doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
doc.setFont("DejaVuSans");
```

### 7. IndexedDB Caching Pattern

**Important:** Cache is **cleared completely** on every new database load to prevent version conflicts.

```typescript
// Before loading new databases
await clearAllPersistedDatabases();

// After loading
await persistDatabase(database, "MEMBRII");
```

**Code Reference:** `src/services/databasePersistence.ts`

---

## Database Management

### Database Loading Flow

```mermaid
graph TD
    A[User Opens App] --> B{First Visit?}
    B -->|Yes| C[LandingPage Shown]
    B -->|No| D{Cache Valid?}
    D -->|Yes| E[Load from IndexedDB]
    D -->|No| C
    C --> F{Browser Supports<br/>File System API?}
    F -->|Yes| G[Show "Select Folder" Button]
    F -->|No| H[Show "Upload Files" Button]
    G --> I[User Selects Folder]
    H --> J[User Selects Files]
    I --> K[Clear IndexedDB Cache]
    J --> K
    K --> L[Validate SQLite Headers]
    L --> M[Load into sql.js]
    M --> N[Validate Database Structure]
    N --> O{All Required DBs<br/>Present?}
    O -->|Yes| P[Cache in IndexedDB]
    O -->|No| Q[Show Error]
    P --> R[Navigate to Dashboard]
```

### Database Validation

Each loaded database is validated for:
1. **SQLite Header:** Must start with `SQLite format 3`
2. **Required Tables:**
   - MEMBRII.db must have `MEMBRII` table
   - DEPCRED.db must have `DEPCRED` table
3. **Case Sensitivity:** File names are case-sensitive (e.g., `MEMBRII.db` not `membrii.db`)

### Database Schema: MEMBRII Table

| Column | Type | Description |
|--------|------|-------------|
| `NR_FISA` | INTEGER | **Primary Key.** Unique member ID |
| `NUM_PREN` | TEXT | Full name (last name, first name) |
| `DOMICILIUL` | TEXT | Address |
| `CALITATEA` | TEXT | Member status (e.g., "Pensionar") |
| `DATA_INSCR` | TEXT | Registration date (DD-MM-YYYY) |
| `COTIZATIE_STANDARD` | REAL | Standard monthly contribution |

### Database Schema: DEPCRED Table

| Column | Type | Description |
|--------|------|-------------|
| `NR_FISA` | INTEGER | **Foreign Key** → MEMBRII.NR_FISA |
| `LUNA` | INTEGER | Month (1-12) |
| `ANUL` | INTEGER | Year |
| `DOBANDA` | REAL | Interest calculated for the month |
| `IMPR_DEB` | REAL | Loan granted (debit) |
| `IMPR_CRED` | REAL | Loan payment (credit) |
| `IMPR_SOLD` | REAL | Loan balance |
| `DEP_DEB` | REAL | Deposit made (debit/contribution) |
| `DEP_CRED` | REAL | Withdrawal (credit) |
| `DEP_SOLD` | REAL | Deposit balance |
| `PRIMA` | INTEGER | Boolean flag (0/1) for first month |

**Full Schema:** See `Structură Baze de Date - Proiect carapp2.md`

---

## Development Workflow

### Initial Setup

```bash
# Clone repository
git clone https://github.com/totilaAtila/carapp2.git
cd carapp2

# Install dependencies (use pnpm preferably, or npm)
npm install

# Start development server
npm run dev
# Opens at http://localhost:5173
```

### Development Scripts

```bash
# Development server with hot reload
npm run dev

# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

### Git Workflow

**Branch Naming Convention:**
- Feature branches: `claude/description-sessionId`
- Example: `claude/claude-md-mi584at2wwc4els9-011DQASmGNRyeHCKXeUtszSq`

**Commit Message Pattern:**
```
type(scope): Description

Examples:
feat(CalculeazaDobanda): Implementare layout dual desktop/mobile
fix(CalculeazaDobanda): Guard împotriva membrilor fără împrumuturi
```

**Commit Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring
- `docs:` - Documentation changes
- `style:` - Formatting changes
- `test:` - Adding tests
- `chore:` - Build process or tooling changes

### Pull Request Process

1. Create feature branch from main
2. Make changes with clear, atomic commits
3. Push to origin
4. Create PR with descriptive title and body
5. Wait for review and merge

**Note:** Deploy previews are generated automatically on Netlify for each PR.

---

## Module Structure

The application consists of **12 functional modules** (all 100% complete):

### Module 1: Generare Lună (GenerareLuna.tsx)
**Purpose:** Generate a new month in DEPCRED database

**Key Features:**
- Auto-detect last existing month
- Apply standard contributions from MEMBRII.db
- Inherit loan payments from previous month
- Calculate early repayment interest (4‰)
- Auto-exclude liquidated members
- Update balances (loans and deposits)
- Detailed operation log
- Month deletion with confirmation

**Business Logic:** `src/logic/generateMonth.ts`

### Module 2: Vizualizare Lunară (VizualizareLunara.tsx)
**Purpose:** Display a member's transactions for a specific month

**Key Features:**
- Autocomplete member search (name + member ID)
- Month/year selection with validation
- Detailed loan display (interest, loan, payment, balance)
- Detailed deposit display (contribution, withdrawal, balance)
- Responsive layout (desktop: cards, mobile: lists)
- PDF export with DejaVu Sans (diacritics support)
- Excel export (XLSX) with formatting
- Liquidated member detection (visual alert)

### Module 3: Sume Lunare (SumeLunare.tsx)
**Purpose:** Complete financial history of a member with editing operations

**Key Features:**
- **Desktop (≥1024px):** 8-column synchronized table
  - Sections: Loans (interest, loan, payment, balance) | Date | Deposits (contribution, withdrawal, balance)
  - Synchronized scrolling between columns
- **Mobile (<1024px):** Cards per month with tabs for Loans/Deposits
- **Financial Operations:**
  - Transaction modification with validated dialog
  - Monthly payment calculator (amount ÷ months)
  - Apply interest on early repayment (4‰)
  - Automatic recalculation of subsequent months
  - Save to both DEPCRED.db and MEMBRII.db

**Note:** Complete port of 2750 lines of business logic from Python

### Module 4: Vizualizare Anuală (VizualizareAnuala.tsx)
**Purpose:** Annual reports for member analysis

**Key Features:**
- Year and member selection
- Annual summary (12 months)
- Annual totals (loans, deposits, interest)
- PDF and Excel export
- Year-over-year comparisons
- Annual evolution charts

### Module 5: Vizualizare Trimestrială (VizualizareTrimestriala.tsx)
**Purpose:** Quarterly reports for periodic analysis

**Key Features:**
- Quarter selection (Q1-Q4) and year
- Quarterly summary (3 months)
- Quarter totals
- PDF/Excel report export
- Inter-quarterly comparisons
- Responsive desktop/mobile layout

### Module 6: Adăugare Membru (AdaugaMembru.tsx)
**Purpose:** Add and edit member data

**Key Features:**
- Validated form for new members
- Edit existing member data
- Fields: member ID (unique), name (unique), address, status, registration date, standard contribution
- Strict validations (uniqueness, format)
- Save to MEMBRII.db

**Technologies:** react-hook-form, zod validation

### Module 7: Ștergere Membru (StergeMembru.tsx)
**Purpose:** Manual deletion of individual member

**Key Features:**
- Member search (autocomplete)
- Display details before deletion
- Multiple confirmation (irreversible action)
- Options: complete deletion or mark in LICHIDATI.db
- Operation log with timestamp

### Module 8: Lichidare Membri (Lichidati.tsx)
**Purpose:** Automatic detection and bulk liquidation of problematic members

**Key Features:**
- **Automatic Detection:** inactive members (no transactions X months), zero balances, DEPCRED↔MEMBRII discrepancies
- **3 Tabs:** Inactive, Zero Balances, Discrepancies
- **Bulk Selection:** checkboxes for mass actions
- **Liquidation:** mark in LICHIDATI.db + optional balance reset (0.00)
- **Permanent Deletion:** complete removal from all databases (IRREVERSIBLE)
- **Auto-Protection:** exclude from GenerareLuna and Dividende
- **Responsive UI:** table desktop, cards mobile
- **Journal:** real-time operation log

### Module 9: Dividende (Dividende.tsx)
**Purpose:** Calculate and distribute annual dividends

**Key Features:**
- Automatic calculation per regulation
- Validate eligible members (from ACTIVI.db)
- Apply dividends in DEPCRED for January
- Preview calculation before applying
- Dividend operation log
- Distribution report export

### Module 10: Statistici (Statistici.tsx)
**Purpose:** Dashboard with interactive analyses and charts

**Key Features:**
- Total members (active/inactive/liquidated)
- Balance distribution (bar and pie charts)
- Monthly evolution (line charts)
- Key metrics (total loans, deposits, interest)
- Period comparisons
- Statistical report export

**Technologies:** Recharts

### Module 11: Listări (Listari.tsx)
**Purpose:** Generate PDF receipts for members

**Key Features:**
- Receipt generation for selected month
- Year/month selection from dropdown
- Preview receipts before export
- Automatic totalization (interest, loans, deposits, withdrawals)
- Romanian diacritics support (DejaVu Sans fonts)
- Individual or bulk PDF export

### Module 12: Conversie RON→EUR (Conversion.tsx)
**Purpose:** Database conversion per EU Regulation CE 1103/97 for EURO transition

**Key Features:**
- ONE-TIME operation for monetary transition
- User-configurable EUR exchange rate
- Conversion compliant with EU Regulation CE 1103/97 (direct individual)
- Automatic cloning: DEPCRED→DEPCREDEUR, MEMBRII→MEMBRIIEUR, etc.
- Convert all monetary fields (interest, loans, deposits, contributions, dividends)
- Member integrity validation (cross-check DEPCRED vs MEMBRII)
- Preview with estimates and warnings
- Real-time progress tracking + detailed logs
- Rounding difference calculation (per EU legislation)
- Complete conversion report export
- Download 5 EUR databases
- Dual panel layout (desktop), single column (mobile)
- Re-conversion protection (detect existing EUR databases)

**Note:** CHITANTE.db is not cloned (no monetary data). After conversion, dual-currency system automatically activated (RON/EUR toggle).

---

## Code Conventions

### TypeScript

- **Strict mode enabled:** `"strict": true`
- **No implicit any:** Disable when necessary (`"noImplicitAny": false`) but prefer explicit types
- **Path aliases:** Use `@/*` for `src/*` imports

```typescript
// ✅ GOOD
import { DBSet } from '@/services/databaseManager';

// ❌ AVOID
import { DBSet } from '../../../services/databaseManager';
```

### React Components

- **Functional components only** (no class components)
- **Hooks:** useState, useEffect, useCallback, useMemo
- **Props:** Explicitly type all props

```typescript
interface GenerareLunaProps {
  databases: DBSet;
  onDatabaseChange: () => void;
}

export default function GenerareLuna({ databases, onDatabaseChange }: GenerareLunaProps) {
  // ...
}
```

### Naming Conventions

- **Components:** PascalCase (e.g., `GenerareLuna.tsx`)
- **Files:** camelCase for utilities, PascalCase for components
- **Functions:** camelCase (e.g., `loadDatabases`, `calcDobanda`)
- **Constants:** UPPER_SNAKE_CASE for true constants
- **Database names:** Exact case as specified (e.g., `MEMBRII.db`, not `membrii.db`)

### Comments

- **Business logic:** Comment in **Romanian** to maintain domain language consistency
- **Technical details:** English acceptable
- **Complex calculations:** Always document the formula and regulation reference

```typescript
/**
 * Calculează dobânda lunară simplă conform Regulament CE 1103/97.
 * Formula: dobanda = principal × rata_lunara
 *
 * @param principal Suma de bază (ex: 1000)
 * @param rate Rata lunară (ex: 0.004 pentru 0.4%)
 * @returns Dobânda rotunjită la 2 zecimale cu ROUND_HALF_UP
 */
export function calcDobanda(principal: number, rate: number): number {
  const dobanda = new Decimal(principal).times(rate);
  return dobanda.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
```

### SQL Queries

- **Always use parameterized queries** (sql.js doesn't support prepared statements, but use best practices)
- **Table names:** Use exact case (e.g., `MEMBRII`, not `membrii`)
- **Error handling:** Always wrap database operations in try-catch

```typescript
try {
  const stmt = db.prepare("SELECT * FROM MEMBRII WHERE NR_FISA = ?");
  stmt.bind([nrFisa]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    // ...
  }
  stmt.free();
} catch (err) {
  console.error("Database error:", err);
  // Handle error appropriately
}
```

### Styling

- **TailwindCSS utility classes** preferred
- **Responsive design:** Use Tailwind breakpoints (`sm:`, `md:`, `lg:`)
- **shadcn/ui components:** Use existing UI components before creating custom ones
- **Dark mode:** Not currently implemented

```tsx
<div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
  <Card className="w-full lg:w-1/2">
    {/* Content */}
  </Card>
</div>
```

---

## Common Tasks

### Adding a New Module

1. **Create component file:** `src/components/NewModule.tsx`
2. **Add to App.tsx:**
   ```typescript
   case 'new-module':
     return <NewModule databases={databases} onDatabaseChange={handleDatabaseChange} />;
   ```
3. **Add to Sidebar.tsx:**
   ```typescript
   {
     icon: IconName,
     label: "Nume Modul",
     onClick: () => onNavigate('new-module')
   }
   ```
4. **Update README.md:** Document the new module

### Querying a Database

```typescript
function getMemberByFisa(db: Database, nrFisa: number) {
  try {
    const result = db.exec(
      `SELECT * FROM MEMBRII WHERE NR_FISA = ${nrFisa}`
    );

    if (result.length === 0) return null;

    const columns = result[0].columns;
    const values = result[0].values[0];

    return {
      NR_FISA: values[columns.indexOf('NR_FISA')],
      NUM_PREN: values[columns.indexOf('NUM_PREN')],
      // ... map other columns
    };
  } catch (err) {
    console.error("Query error:", err);
    return null;
  }
}
```

### Performing Financial Calculations

```typescript
import Decimal from 'decimal.js';

// Calculate interest
const principal = new Decimal(1000);
const rate = new Decimal(0.004); // 0.4%
const interest = principal.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

// Calculate new balance
const newBalance = principal.plus(interest).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

// ALWAYS convert back to number for database storage
const interestNumber = interest.toNumber();
```

### Generating PDF with Diacritics

```typescript
import jsPDF from 'jspdf';
import { dejavuSansBase64, dejavuSansBoldBase64 } from '@/utils/dejavu-fonts';

const doc = new jsPDF();

// Add fonts
doc.addFileToVFS("DejaVuSans.ttf", dejavuSansBase64);
doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
doc.addFileToVFS("DejaVuSans-Bold.ttf", dejavuSansBoldBase64);
doc.addFont("DejaVuSans-Bold.ttf", "DejaVuSans", "bold");

// Set font
doc.setFont("DejaVuSans");

// Add text (diacritics will render correctly)
doc.text("Văzut și înregistrat la Întreprindere", 10, 10);

// Save
doc.save("document.pdf");
```

### Exporting to Excel

```typescript
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// Create workbook and worksheet
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Sheet1');

// Define columns with headers and widths
worksheet.columns = [
  { header: 'Nume', key: 'nume', width: 20 },
  { header: 'Cotizație', key: 'cotizatie', width: 12 },
  { header: 'Sold', key: 'sold', width: 12 }
];

// Add data rows
worksheet.addRow({ nume: 'Popescu Ion', cotizatie: 50.00, sold: 1234.56 });
worksheet.addRow({ nume: 'Ionescu Maria', cotizatie: 75.00, sold: 2345.67 });

// Format numeric columns
worksheet.eachRow((row, rowNumber) => {
  if (rowNumber > 1) { // Skip header
    row.getCell(2).numFmt = '#,##0.00'; // Cotizație
    row.getCell(3).numFmt = '#,##0.00'; // Sold
  }
});

// Style header
const headerRow = worksheet.getRow(1);
headerRow.font = { bold: true };

// Export as buffer and download
const buffer = await workbook.xlsx.writeBuffer();
const blob = new Blob([buffer], {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
saveAs(blob, 'raport.xlsx');
```

### Saving Databases

```typescript
import { persistDatabases } from '@/services/databaseManager';

// After modifying databases
await persistDatabases(databases);

// This will:
// - If filesystem mode: overwrite files directly
// - If upload mode: trigger downloads for all modified files
```

### Handling Responsive Design

```typescript
const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

useEffect(() => {
  const handleResize = () => {
    setIsMobile(window.innerWidth < 1024);
  };

  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);

return (
  <div>
    {isMobile ? (
      <MobileLayout />
    ) : (
      <DesktopLayout />
    )}
  </div>
);
```

---

## Deployment

### Netlify Configuration

**File:** `netlify.toml`

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

### Deployment Process

1. **Push to GitHub:** Changes pushed to `main` branch
2. **Netlify Auto-Build:** Netlify detects push and runs `npm run build`
3. **Deploy:** Built files from `dist/` deployed to production
4. **Preview Deploys:** Pull requests get preview URLs automatically

### Build Output

```bash
npm run build

# Output:
# - dist/index.html
# - dist/assets/index-[hash].js
# - dist/assets/index-[hash].css
# - dist/assets/sql-wasm-[hash].wasm (from sql.js CDN, cached)
# - dist/192.png, dist/512.png, dist/favicon.ico
# - dist/manifest.json
# - dist/service-worker.js
```

### Environment Requirements

- **Node.js:** 18.20.4 (as specified in netlify.toml)
- **Build Time:** ~2-3 minutes
- **Deploy Time:** ~30 seconds

### PWA Updates

- Service worker uses `registerType: 'prompt'`
- Users see update notification on app load if new version available
- `UpdatePrompt.tsx` component handles update UI

---

## Important Files Reference

### Configuration Files

| File | Purpose | Modify Frequency |
|------|---------|------------------|
| `package.json` | Dependencies and scripts | Medium |
| `vite.config.ts` | Vite build configuration | Low |
| `tsconfig.json` | TypeScript compiler options | Low |
| `tailwind.config.js` | Tailwind CSS configuration | Low |
| `eslint.config.js` | ESLint rules | Low |
| `netlify.toml` | Netlify deployment settings | Rare |

### Core Application Files

| File | Purpose | Lines | Modify Frequency |
|------|---------|-------|------------------|
| `src/App.tsx` | Root component, routing | ~300 | Medium |
| `src/main.tsx` | Entry point | ~50 | Rare |
| `src/services/databaseManager.ts` | Database orchestration | ~800 | Low |
| `src/services/databasePersistence.ts` | IndexedDB caching | ~200 | Rare |
| `src/logic/generateMonth.ts` | Month generation logic | ~500 | Low |
| `src/logic/finance.ts` | Financial calculations | ~100 | Rare |
| `src/utils/dejavu-fonts.ts` | Embedded fonts | ~60,000 | Never |

### Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | User-facing documentation |
| `CLAUDE.md` | AI assistant guide (this file) |
| `database_flow.md` | Database architecture documentation |
| `Structură Baze de Date - Proiect carapp2.md` | Database schema documentation |
| `PYTHON_FIX_PROMPT.md` | Python porting reference |

---

## Testing Strategy

### Current State

- **Test Coverage:** 81.92% branch coverage ✅ (exceeds 80% target!)
- **Test Framework:** Vitest + React Testing Library (configured and operational)
- **Total Tests:** 112 tests across 5 test files (all passing)
- **Coverage Metrics:**
  - Statements: 91.17%
  - Branches: 81.92%
  - Functions: 95.23%
  - Lines: 90.83%

### Implemented Tests

#### Unit Tests (Implemented ✅)
- **Financial calculations** (`src/logic/finance.test.ts`) - 28 tests
  - ✅ Decimal.js precision validation
  - ✅ ROUND_HALF_UP behavior verification
  - ✅ Edge cases (zero, negative, very large numbers)
  - ✅ Interest calculations (simple and compound)
  - ✅ Payment calculations with precision

#### Integration Tests (Implemented ✅)
- **Month generation** (`src/logic/generateMonth.test.ts`) - 32 tests
  - ✅ Complete month generation flow
  - ✅ Member exclusion logic (liquidated members)
  - ✅ Balance calculations and carryover
  - ✅ Standard contributions application
  - ✅ Early repayment interest (4‰)
  - ✅ Edge cases and error handling

- **Interest calculation utility** (`src/components/CalculeazaDobanda.test.ts`) - 15 tests
  - ✅ Simple interest calculations
  - ✅ Monthly interest application
  - ✅ Balance tracking across periods
  - ✅ Edge cases (zero balances, negative amounts)

- **Dividend distribution** (`src/components/Dividende.test.ts`) - 11 tests
  - ✅ Benefit calculations (single and multiple members)
  - ✅ Profit conservation validation (Σ dividends = profit)
  - ✅ Liquidated member exclusion
  - ✅ Eligibility rules (December balance > 0.005)
  - ✅ ROUND_HALF_UP precision
  - ✅ Edge cases (zero profit, empty MEMBRII, ACTIVI cleanup)

- **Currency conversion** (`src/components/Conversion.test.ts`) - 26 tests
  - ✅ RON→EUR conversion accuracy
  - ✅ EU Regulation CE 1103/97 compliance
  - ✅ Exchange rate validation (positive, limits, formats)
  - ✅ Rounding difference calculations
  - ✅ Mass conversion scenarios (1000 members)
  - ✅ Edge cases (extreme values, 1:1 rate)

### Test Files Structure

```
src/
├── logic/
│   ├── finance.test.ts              # 28 tests - Financial calculations
│   └── generateMonth.test.ts        # 32 tests - Month generation logic
└── components/
    ├── CalculeazaDobanda.test.ts    # 15 tests - Interest calculation
    ├── Dividende.test.ts            # 11 tests - Dividend distribution
    └── Conversion.test.ts           # 26 tests - RON→EUR conversion
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- finance.test

# Run tests in CI mode (no watch)
npm test -- --run
```

### Future Testing Opportunities

#### E2E Tests (Not Yet Implemented)
- **Critical user flows:**
  - Database loading (both filesystem and upload methods)
  - Member addition and editing
  - Transaction modifications in SumeLunare
  - Report generation (PDF/Excel exports)

### Manual Testing Checklist

When making changes, manually verify:

- [ ] Desktop layout (≥1024px) renders correctly
- [ ] Mobile layout (<1024px) renders correctly
- [ ] Database saving works (both filesystem and upload modes)
- [ ] PDF exports contain correct diacritics
- [ ] Financial calculations are precise (check with Decimal.js)
- [ ] No console errors or warnings
- [ ] TypeScript compilation passes (`npx tsc --noEmit`)
- [ ] ESLint passes (`npm run lint`)

---

## AI Assistant Guidelines

### General Principles

1. **Preserve Financial Precision:** Always use Decimal.js for calculations, never JavaScript floating-point arithmetic
2. **Maintain Database Integrity:** Validate all database operations
3. **Respect Existing Patterns:** Follow established code conventions
4. **Document Business Logic:** Use Romanian comments for domain-specific logic
5. **Test Responsiveness:** Consider both desktop and mobile layouts

### When Adding Features

- [ ] Check if feature affects financial calculations → use Decimal.js
- [ ] Check if feature requires database access → handle both RON and EUR
- [ ] Check if feature has UI → implement responsive design
- [ ] Check if feature exports data → support PDF (with diacritics) and Excel
- [ ] Update README.md with new feature documentation
- [ ] Update this CLAUDE.md if architectural changes

### When Fixing Bugs

- [ ] Identify root cause (database, calculation, UI, or integration)
- [ ] Check if bug affects financial accuracy → critical priority
- [ ] Verify fix doesn't break existing modules
- [ ] Test in both desktop and mobile views
- [ ] Test with both RON and EUR databases if applicable

### When Refactoring

- [ ] Ensure financial calculations still use Decimal.js
- [ ] Verify database operations still handle errors gracefully
- [ ] Check TypeScript compilation still passes
- [ ] Verify responsive layouts still work
- [ ] Update comments if logic changes

### Code Quality Checklist

Before submitting code:

- [ ] TypeScript types are explicit (no `any` unless necessary)
- [ ] Financial calculations use Decimal.js with ROUND_HALF_UP
- [ ] Database queries handle errors (try-catch)
- [ ] Responsive design implemented (desktop + mobile)
- [ ] Romanian diacritics handled in PDFs (DejaVu Sans)
- [ ] Comments explain complex business logic
- [ ] ESLint passes without errors
- [ ] No console.log left in production code (use console.error for errors)

### Common Pitfalls to Avoid

❌ **DON'T:**
- Use JavaScript floating-point arithmetic for money
- Forget to handle both RON and EUR databases
- Hardcode database names with wrong case
- Create PDFs without DejaVu Sans fonts
- Forget mobile responsive design
- Skip database validation
- Use `any` type excessively

✅ **DO:**
- Use Decimal.js for all financial calculations
- Check `databases.activeCurrency` before operations
- Use exact database names (`MEMBRII.db`, not `membrii.db`)
- Embed DejaVu Sans for Romanian diacritics
- Test in both desktop and mobile viewports
- Validate database structure on load
- Type everything explicitly

### Understanding the Codebase

**Start here:**
1. Read `README.md` for user perspective
2. Read `database_flow.md` for database architecture
3. Read `Structură Baze de Date - Proiect carapp2.md` for schema
4. Examine `src/services/databaseManager.ts` for data flow
5. Look at `src/components/GenerareLuna.tsx` as a reference module
6. Study `src/logic/finance.ts` for calculation patterns

**Key architectural decisions:**
- **No backend:** Everything runs in browser
- **No routing library:** Simple state-based navigation
- **No Redux:** React hooks for state management
- **Dual access methods:** Filesystem API + upload fallback
- **Dual currency:** RON and EUR with conversion capability
- **Financial precision:** Decimal.js is mandatory for calculations

### Working with Financial Data

**Critical Rules:**
1. Import Decimal.js: `import Decimal from 'decimal.js';`
2. Wrap all numbers: `new Decimal(value)`
3. Use ROUND_HALF_UP: `.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)`
4. Convert back to number: `.toNumber()` only when storing

**Example: Calculating monthly payment**
```typescript
import Decimal from 'decimal.js';

function calculateMonthlyPayment(totalAmount: number, months: number): number {
  const amount = new Decimal(totalAmount);
  const monthCount = new Decimal(months);
  const payment = amount.div(monthCount);
  return payment.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
```

### Working with Databases

**Reading data:**
```typescript
const result = databases.membrii!.exec(
  `SELECT * FROM MEMBRII WHERE NR_FISA = ${nrFisa}`
);
if (result.length === 0) {
  // Handle no results
  return null;
}
const columns = result[0].columns;
const values = result[0].values[0];
// Map columns to values...
```

**Writing data:**
```typescript
try {
  databases.depcred!.run(`
    UPDATE DEPCRED
    SET IMPR_SOLD = ${newBalance}
    WHERE NR_FISA = ${nrFisa} AND LUNA = ${luna} AND ANUL = ${anul}
  `);

  // Always persist changes
  await persistDatabases(databases);
} catch (err) {
  console.error("Database update failed:", err);
  // Handle error appropriately
}
```

### Currency Handling

**Check active currency:**
```typescript
const isRon = databases.activeCurrency === "RON";
const db = isRon ? databases.membrii : databases.membriieur;
```

**Access control:**
```typescript
import { getAccessMode } from '@/services/databaseManager';

const access = getAccessMode(databases);
if (!access.canWriteRon && databases.activeCurrency === "RON") {
  // Show read-only warning
  return;
}
```

### PDF Generation Pattern

**Always use this pattern for PDFs:**
```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dejavuSansBase64, dejavuSansBoldBase64 } from '@/utils/dejavu-fonts';

export function generatePDF() {
  const doc = new jsPDF();

  // CRITICAL: Add fonts for diacritics
  doc.addFileToVFS("DejaVuSans.ttf", dejavuSansBase64);
  doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", dejavuSansBoldBase64);
  doc.addFont("DejaVuSans-Bold.ttf", "DejaVuSans", "bold");

  doc.setFont("DejaVuSans");

  // Your PDF content here
  doc.text("Văzut și înregistrat", 10, 10);

  // For tables
  autoTable(doc, {
    head: [['Nume', 'Suma']],
    body: [['Popescu Ion', '1,234.56']],
    styles: { font: 'DejaVuSans' }
  });

  doc.save("document.pdf");
}
```

### Security Considerations

- **No SQL injection:** sql.js is client-side, but still validate inputs
- **No XSS:** React escapes by default, but be careful with dangerouslySetInnerHTML
- **Database files:** Never commit `.db` files to git (in .gitignore)
- **Secrets:** No API keys or secrets needed (no backend)
- **Privacy:** All data stays in browser, never transmitted

### Performance Optimization

- **Lazy load large components** if needed (currently not implemented)
- **Memoize expensive calculations:** Use `useMemo` and `useCallback`
- **IndexedDB caching:** Already implemented, don't bypass it
- **Virtual scrolling:** Consider for very long lists (not currently implemented)

### Accessibility (Future Improvement)

Currently minimal accessibility features. Future improvements:
- Add ARIA labels to interactive elements
- Keyboard navigation support
- Screen reader announcements for status updates
- Focus management for modals

---

## Changelog

### Version 1.0.1 (Current - November 2025)

**Status:** Production Ready (100% complete)

**Recent Changes:**
- **Comprehensive Test Coverage Implemented:**
  - 112 tests across 5 test files (all passing)
  - 81.92% branch coverage (exceeds 80% target)
  - Vitest + React Testing Library configured
  - Tests for finance, generateMonth, CalculeazaDobanda, Dividende, Conversion
- Added CalculeazaDobanda component for interest calculation
- Fixed member history display in CalculeazaDobanda
- Improved autocomplete member selection
- Enhanced mobile responsiveness across all modules
- Fixed database reading from correct tables (DEPCRED vs ACTIVI)

### Version 1.0.0 (November 2025)

**Major Release:**
- All 12 modules completed and tested
- 100% cross-platform compatibility
- Dual currency support (RON + EUR)
- Zero critical vulnerabilities
- Complete documentation

**Modules Delivered:**
1. Generare Lună ✅
2. Vizualizare Lunară ✅
3. Sume Lunare ✅
4. Vizualizare Anuală ✅
5. Vizualizare Trimestrială ✅
6. Adăugare Membru ✅
7. Ștergere Membru ✅
8. Lichidare Membri ✅
9. Dividende ✅
10. Statistici ✅
11. Listări (Chitanțe) ✅
12. Conversie RON→EUR ✅

---

## Additional Resources

### External Documentation

- [React 19 Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vite.dev/guide/)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)
- [sql.js Documentation](https://sql.js.org/documentation/)
- [Decimal.js Documentation](https://mikemcl.github.io/decimal.js/)
- [shadcn/ui Components](https://ui.shadcn.com/)

### Internal Documentation

- `README.md` - User manual and feature overview
- `database_flow.md` - Database loading and persistence architecture
- `Structură Baze de Date - Proiect carapp2.md` - Complete database schema
- `PYTHON_FIX_PROMPT.md` - Python to TypeScript porting reference

### Support

- **GitHub Issues:** https://github.com/totilaAtila/carapp2/issues
- **GitHub Discussions:** https://github.com/totilaAtila/carapp2/discussions

---

## Quick Reference

### Path Aliases
- `@/*` → `src/*`

### Database File Names (Case-Sensitive!)
- MEMBRII.db, DEPCRED.db, activi.db, INACTIVI.db, LICHIDATI.db, CHITANTE.db
- MEMBRIIEUR.db, DEPCREDEUR.db, activiEUR.db, INACTIVIEUR.db, LICHIDATIEUR.db

### Key Functions
- `loadDatabasesFromFilesystem()` - Load with File System API
- `loadDatabasesFromUpload()` - Load with file upload
- `persistDatabases(databases)` - Save databases
- `calcDobanda(principal, rate)` - Calculate interest
- `getAccessMode(databases)` - Check read/write permissions

### Key Components
- `LandingPage` - Database loading screen
- `Dashboard` - Main dashboard after loading
- `Sidebar` - Navigation menu
- `CurrencyToggle` - RON/EUR switcher

### Development Commands
```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run lint     # Run linter
npx tsc --noEmit # Type check
```

---

**End of CLAUDE.md**

This document should be updated whenever significant architectural changes are made to the codebase.
