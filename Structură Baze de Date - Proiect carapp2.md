# Documentație Structură Baze de Date - Proiect carapp2

## Introducere

Acest document detaliază structura externă și internă a bazelor de date SQLite utilizate în proiectul **carapp2**, așa cum a fost extrasă și dedusă din analiza fișierelor sursă TypeScript/React (`.tsx`). Documentația acoperă schemele tabelelor, relațiile dintre ele și operațiile (CRUD) efectuate de aplicație.

## Prezentare Generală a Schemelor

Au fost identificate șase baze de date principale, fiecare conținând una sau mai multe tabele. Relația centrală este între `MEMBRII.db` și `DEPCRED.db`, legată prin coloana `NR_FISA`.

### Baze de Date Identificate

1.  **MEMBRII.db**: Stochează datele de identificare ale membrilor.
2.  **DEPCRED.db**: Stochează istoricul tranzacțiilor financiareLUNAre pentru fiecare membru.
3.  **LICHIDATI.db**: Stochează MEMBRII care au fost lichidați.
4.  **activi.db**: Stochează MEMBRII activi și dividendele calculate.
5.  **INACTIVI.db**: Stochează MEMBRII inactivi.
6.  **CHITANTE.db**: Stochează informații despre chitanțe.

### Diagrama Relațiilor

```mermaid
erDiagram
    MEMBRII {
        INTEGERNR_FISA PK
        TEXT NUM_PREN
        TEXT DOMICILIUL
        TEXT CALITATEA
        TEXT DATA_INSCR
        REAL COTIZATIE_STANDARD
    }
    DEPCRED {
        INTEGERNR_FISA FK
        INTEGERLUNA
        INTEGERANUL
        REALDOBANDA
        REAL IMPR_DEB
        REAL IMPR_CRED
        REAL IMPR_SOLD
        REAL DEP_DEB
        REAL DEP_CRED
        REAL DEP_SOLD
        INTEGER PRIMA
    }
    LICHIDATI {
        INTEGER NR_FISA FK
    }
    ACTIVI {
        INTEGER NR_FISA FK
        TEXT NUM_PREN
        REAL DEP_SOLD
        REAL DIVIDEND
    }
    INACTIVI {
        INTEGER NR_FISA FK
    }
    CHITANTE {
        TEXT STARTCH_PR
        TEXT STARTCH_AC
    }

    MEMBRII ||--o{ DEPCRED : "are istoric"
    MEMBRII ||--o{ LICHIDATI : "poate fi"
    MEMBRII ||--o{ ACTIVI : "poate fi"
    MEMBRII ||--o{ INACTIVI : "poate fi"
```

## Structura Tabelelor

### 1. Tabelul `MEMBRII` (din MEMBRII.db)

Stochează informațiile de bază despre fiecare membru al Casei de Ajutor Reciproc.

| Nume Coloană | Tip Dedus | Descriere |
| :--- | :--- | :--- |
| `NR_FISA` | `INTEGER` | **Cheie PRIMAră.** Numărul unic de fișă al membrului. |
| `NUM_PREN` | `TEXT` | Numele și prenumele membrului. |
| `DOMICILIUL` | `TEXT` | Adresa de domiciliu a membrului. |
| `CALITATEA` | `TEXT` | Calitatea membrului (ex: "Pensionar"). |
| `DATA_INSCR` | `TEXT` | Data înscrierii membrului (format: DD-MM-YYYY). |
| `COTIZATIE_STANDARD` | `REAL` | Valoarea cotizației standardLUNAre. |

### 2. Tabelul `DEPCRED` (din DEPCRED.db)

Reprezintă istoricul financiar detaliat pentru fiecare membru, cu o înregistrare pentru fiecare lună.

| Nume Coloană | Tip Dedus | Descriere |
| :--- | :--- | :--- |
| `NR_FISA` | `INTEGER` | **Cheie Externă.** Referință către `MEMBRII.NR_FISA`. |
| `LUNA` | `INTEGER` |LUNA calendaristică a înregistrării (1-12). |
| `ANUL` | `INTEGER` |ANUL calendaristic al înregistrării. |
| `DOBANDA` | `REAL` | Dobânda calculată pentruLUNA respectivă. |
| `IMPR_DEB` | `REAL` | Suma împrumutată înLUNA respectivă (debit). |
| `IMPR_CRED` | `REAL` | Suma achitată din împrumut înLUNA respectivă (credit). |
| `IMPR_SOLD` | `REAL` | Soldul rămas al împrumutului la sfârșitul lunii. |
| `DEP_DEB` | `REAL` | Suma depusă (cotizație) înLUNA respectivă (debit). |
| `DEP_CRED` | `REAL` | Suma retrasă din fondul social înLUNA respectivă (credit). |
| `DEP_SOLD` | `REAL` | Soldul fondului social la sfârșitul lunii. |
| `PRIMA` | `INTEGER` | Flag boolean (0 sau 1) care indică PRIMA lună de activitate. |

### 3. Tabele Auxiliare

Aceste tabele stochează liste de membri cu un anumit status.

| Nume Tabel | Coloană Principală | Descriere |
| :--- | :--- | :--- |
| `lichidati` | `NR_FISA` (INTEGER) | Stochează `NR_FISA` membrilor lichidați. |
| `ACTIVI` | `NR_FISA` (INTEGER) | Stochează `NR_FISA` membrilor activi, împreună cu dividendele. |
| `inactivi` | `NR_FISA` (INTEGER) | Stochează `NR_FISA` membrilor inactivi. |
| `CHITANTE` | `STARTCH_PR`, `STARTCH_AC` (TEXT) | Stochează informații despre chitanțe. |

## Operații pe Baze de Date (CRUD)

Analiza codului a relevat următoarele operații efectuate de aplicație asupra bazelor de date:

### Tabelul `MEMBRII`

-   **CREATE**: `INSERT INTO MEMBRII` - Adaugă un membru nou (`AdaugaMembru.tsx`).
-   **READ**: `SELECTNR_FISA, NUM_PREN FROM MEMBRII` - Preluare listă membri pentru autocomplete și vizualizări (`VizualizareLunara.tsx`, `VizualizareAnuala.tsx`).
-   **UPDATE**: `UPDATE MEMBRII` - Modifică datele unui membru (`SumeLunare.tsx`).
-   **DELETE**: `DELETE FROM MEMBRII` - Șterge un membru (`StergeMembru.tsx`).

### Tabelul `DEPCRED`

-   **CREATE**: `INSERT INTO DEPCRED` - Adaugă o nouă înregistrareLUNAră la generarea lunii sau adăugarea unui membru nou (`GenerareLuna.tsx`, `AdaugaMembru.tsx`).
-   **READ**: `SELECT * FROM DEPCRED` - Preluare istoric financiar pentru vizualizări și calcule statistice (`SumeLunare.tsx`, `VizualizareAnuala.tsx`, `Statistici.tsx`).
-   **UPDATE**: `UPDATE DEPCRED` - Modifică o tranzacție existentă (`SumeLunare.tsx`).
-   **DELETE**: `DELETE FROM DEPCRED` - Șterge istoricul unui membru sau o lună generată greșit (`StergeMembru.tsx`, `GenerareLuna.tsx`).

### Tabelele `lichidati`, `ACTIVI`, `inactivi`

-   **CREATE**: `INSERT INTO ...` - Adaugă membri în aceste liste.
-   **READ**: `SELECT NR_FISA FROM ...` - Verifică statusul unui membru.
-   **DELETE**: `DELETE FROM ...` - Elimină membri din aceste liste.

## Concluzie

Structura bazelor de date este una relațională simplă, centrată pe `NR_FISA` ca identificator unic. Logica aplicației este strâns legată de această structură, cu operații CRUD bine definite în cadrul componentelor React. Documentația de față oferă o imagine clară și concisă a modului în care datele sunt organizate și manipulate în cadrul proiectului `carapp2`.
