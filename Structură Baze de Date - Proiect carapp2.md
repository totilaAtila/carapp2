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
    lichidati {
        INTEGER nr_fisa PK
        TEXT data_lichidare
    }
    ACTIVI {
        INTEGER NR_FISA FK
        TEXT NUM_PREN
        REAL DEP_SOLD
        REAL DIVIDEND
    }
    inactivi {
        INTEGER nr_fisa PK
        TEXT num_pren
        INTEGER lipsa_luni
    }
    CHITANTE {
        NUMERIC STARTCH_PR
        NUMERIC STARTCH_AC
        NUMERIC LUNA
        NUMERIC ANUL
    }

    MEMBRII ||--o{ DEPCRED : "are istoric"
    MEMBRII ||--o| lichidati : "poate fi"
    MEMBRII ||--o{ ACTIVI : "poate fi"
    MEMBRII ||--o| inactivi : "poate fi"
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

### 3. Tabelul `lichidati` (din LICHIDATI.db)

Stochează membrii care au fost lichidați din organizație.

| Nume Coloană | Tip | Descriere |
| :--- | :--- | :--- |
| `nr_fisa` | `INTEGER` | **Cheie primară.** Numărul unic de fișă al membrului lichidat. |
| `data_lichidare` | `TEXT` | **NOT NULL.** Data când membrul a fost lichidat (format ISO: YYYY-MM-DD). |

### 4. Tabelul `ACTIVI` (din activi.db)

Stochează membrii activi și dividendele calculate.

| Nume Coloană | Tip | Descriere |
| :--- | :--- | :--- |
| `NR_FISA` | `INTEGER` | **Cheie externă.** Referință către `MEMBRII.NR_FISA`. |
| `NUM_PREN` | `TEXT` | Numele și prenumele membrului. |
| `DEP_SOLD` | `REAL` | Soldul depozitelor membrului. |
| `DIVIDEND` | `REAL` | Valoarea dividendului calculat (default: 0.0). |

### 5. Tabelul `inactivi` (din INACTIVI.db)

Stochează membrii temporar inactivi.

| Nume Coloană | Tip | Descriere |
| :--- | :--- | :--- |
| `nr_fisa` | `INTEGER` | **Cheie primară.** Numărul unic de fișă al membrului inactiv. |
| `num_pren` | `TEXT` | Numele și prenumele membrului. |
| `lipsa_luni` | `INTEGER` | Numărul de luni de inactivitate. |

### 6. Tabelul `CHITANTE` (din CHITANTE.db)

Gestionează numerotarea automată a chitanțelor.

| Nume Coloană | Tip | Descriere |
| :--- | :--- | :--- |
| `STARTCH_PR` | `NUMERIC` | Număr start chitanțe pentru împrumuturi (nullable). |
| `STARTCH_AC` | `NUMERIC` | Număr start chitanțe pentru achitări (nullable). |
| `LUNA` | `NUMERIC` | Luna pentru care s-au generat chitanțe (nullable). |
| `ANUL` | `NUMERIC` | Anul pentru care s-au generat chitanțe (nullable). |

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

### Tabelul `lichidati`

-   **CREATE**: `INSERT INTO lichidati (nr_fisa, data_lichidare)` - Marchează un membru ca lichidat (`Lichidati.tsx`).
-   **READ**: `SELECT nr_fisa FROM lichidati` - Verifică dacă un membru este lichidat (`GenerareLuna.tsx`, `Dividende.tsx`, `SumeLunare.tsx`, `Lichidati.tsx`).
-   **DELETE**: `DELETE FROM lichidati WHERE nr_fisa = ?` - Elimină un membru din lista lichidați (`StergeMembru.tsx`).

### Tabelul `ACTIVI`

-   **CREATE**: `INSERT INTO ACTIVI (NR_FISA, NUM_PREN, DEP_SOLD, DIVIDEND, BENEFICIU)` - Adaugă membri activi și calculează dividende (`Dividende.tsx`).
-   **READ**: `SELECT * FROM ACTIVI` - Preluare listă membri activi pentru vizualizări.
-   **DELETE**: `DELETE FROM ACTIVI WHERE NR_FISA = ?` - Elimină membri din lista activi (`StergeMembru.tsx`, `Lichidati.tsx`).

### Tabelul `inactivi`

-   **CREATE**: `INSERT INTO inactivi (nr_fisa, num_pren, lipsa_luni)` - Marchează membri inactivi.
-   **READ**: `SELECT nr_fisa FROM inactivi` - Verifică statusul de inactivitate.
-   **DELETE**: `DELETE FROM inactivi WHERE nr_fisa = ?` - Elimină din lista inactivi (`StergeMembru.tsx`, `Lichidati.tsx`).

### Tabelul `CHITANTE`

-   **CREATE**: `INSERT INTO CHITANTE` - Inițializează numerotarea chitanțelor pentru o lună (`Listari.tsx`).
-   **READ**: `SELECT * FROM CHITANTE` - Preia ultima numerotare pentru continuitate.
-   **UPDATE**: `UPDATE CHITANTE` - Actualizează contoare chitanțe după generare.

## Concluzie

Structura bazelor de date este una relațională simplă, centrată pe `NR_FISA` ca identificator unic. Logica aplicației este strâns legată de această structură, cu operații CRUD bine definite în cadrul componentelor React. Documentația de față oferă o imagine clară și concisă a modului în care datele sunt organizate și manipulate în cadrul proiectului `carapp2`.
