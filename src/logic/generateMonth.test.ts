// src/logic/generateMonth.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { generateMonth, deleteMonth, GenerateOptions } from './generateMonth';
import Decimal from 'decimal.js';

// Helper: Inițializare sql.js
let SQL: any;
beforeEach(async () => {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => {
        // Calea locală către sql-wasm.wasm în node_modules (pentru teste)
        return `node_modules/sql.js/dist/${file}`;
      }
    });
  }
});

// Helper: Creare database MEMBRII
function createMembriiDb(membri: Array<{ nr_fisa: number; nume: string; cotizatie: number }>): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE membrii (
      NR_FISA INTEGER PRIMARY KEY,
      NUM_PREN TEXT,
      DOMICILIUL TEXT,
      CALITATEA TEXT,
      DATA_INSCR TEXT,
      COTIZATIE_STANDARD REAL
    )
  `);

  for (const m of membri) {
    db.run(
      `INSERT INTO membrii (NR_FISA, NUM_PREN, COTIZATIE_STANDARD) VALUES (?, ?, ?)`,
      [m.nr_fisa, m.nume, m.cotizatie]
    );
  }

  return db;
}

// Helper: Creare database DEPCRED
function createDepcredDb(transactions: Array<{
  nr_fisa: number;
  luna: number;
  anul: number;
  dobanda?: number;
  impr_deb?: number;
  impr_cred?: number;
  impr_sold?: number;
  dep_deb?: number;
  dep_cred?: number;
  dep_sold?: number;
  prima?: number;
}>): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE depcred (
      NR_FISA INTEGER,
      LUNA INTEGER,
      ANUL INTEGER,
      DOBANDA REAL DEFAULT 0,
      IMPR_DEB REAL DEFAULT 0,
      IMPR_CRED REAL DEFAULT 0,
      IMPR_SOLD REAL DEFAULT 0,
      DEP_DEB REAL DEFAULT 0,
      DEP_CRED REAL DEFAULT 0,
      DEP_SOLD REAL DEFAULT 0,
      PRIMA INTEGER DEFAULT 0
    )
  `);

  for (const t of transactions) {
    db.run(
      `INSERT INTO depcred (NR_FISA, LUNA, ANUL, DOBANDA, IMPR_DEB, IMPR_CRED, IMPR_SOLD, DEP_DEB, DEP_CRED, DEP_SOLD, PRIMA)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.nr_fisa,
        t.luna,
        t.anul,
        t.dobanda ?? 0,
        t.impr_deb ?? 0,
        t.impr_cred ?? 0,
        t.impr_sold ?? 0,
        t.dep_deb ?? 0,
        t.dep_cred ?? 0,
        t.dep_sold ?? 0,
        t.prima ?? 0
      ]
    );
  }

  return db;
}

// Helper: Creare database LICHIDATI
function createLichidatiDb(nrFise: number[]): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE lichidati (
      NR_FISA INTEGER PRIMARY KEY,
      NUM_PREN TEXT,
      SOLD_LICHIDAT REAL
    )
  `);

  for (const nr of nrFise) {
    db.run(
      `INSERT INTO lichidati (NR_FISA, NUM_PREN) VALUES (?, ?)`,
      [nr, `Membru Lichidat ${nr}`]
    );
  }

  return db;
}

// Helper: Creare database ACTIVI
function createActiviDb(dividends: Array<{ nr_fisa: number; dividend: number }>): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE activi (
      NR_FISA INTEGER PRIMARY KEY,
      NUM_PREN TEXT,
      DIVIDEND REAL DEFAULT 0
    )
  `);

  for (const d of dividends) {
    db.run(
      `INSERT INTO activi (NR_FISA, DIVIDEND) VALUES (?, ?)`,
      [d.nr_fisa, d.dividend]
    );
  }

  return db;
}

// Helper: Verificare rând în DEPCRED
function getDepcredRow(db: Database, nr_fisa: number, luna: number, anul: number) {
  const result = db.exec(
    `SELECT * FROM depcred WHERE nr_fisa=? AND luna=? AND anul=?`,
    [nr_fisa, luna, anul]
  );

  if (!result.length || !result[0].values.length) return null;

  const cols = result[0].columns;
  const vals = result[0].values[0];

  return {
    nr_fisa: vals[cols.indexOf('NR_FISA')],
    luna: vals[cols.indexOf('LUNA')],
    anul: vals[cols.indexOf('ANUL')],
    dobanda: vals[cols.indexOf('DOBANDA')],
    impr_deb: vals[cols.indexOf('IMPR_DEB')],
    impr_cred: vals[cols.indexOf('IMPR_CRED')],
    impr_sold: vals[cols.indexOf('IMPR_SOLD')],
    dep_deb: vals[cols.indexOf('DEP_DEB')],
    dep_cred: vals[cols.indexOf('DEP_CRED')],
    dep_sold: vals[cols.indexOf('DEP_SOLD')],
    prima: vals[cols.indexOf('PRIMA')]
  };
}

describe('generateMonth.ts - Month Generation Logic', () => {
  describe('generateMonth - Basic Scenarios', () => {
    it('generează corect o lună nouă cu cotizații standard', () => {
      // Setup: 1 membru cu cotizație 50 RON, sold depuneri 1000 RON
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        {
          nr_fisa: 1,
          luna: 11,
          anul: 2024,
          dep_deb: 50,
          dep_cred: 0,
          dep_sold: 1000,
          impr_deb: 0,
          impr_cred: 0,
          impr_sold: 0
        }
      ]);

      // Generăm decembrie 2024
      const result = generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      // Verificări
      expect(result.generatedCount).toBe(1);
      expect(result.sourceMonth).toBe(11);
      expect(result.sourceYear).toBe(2024);
      expect(result.targetMonth).toBe(12);
      expect(result.targetYear).toBe(2024);

      // Verifică rândul generat
      const row = getDepcredRow(depcredDb, 1, 12, 2024);
      expect(row).not.toBeNull();
      expect(row?.dep_deb).toBe(50); // Cotizație standard
      expect(row?.dep_sold).toBe(1050); // 1000 + 50
      expect(row?.impr_sold).toBe(0);
      expect(row?.prima).toBe(1); // Marcată ca primă (ultima lună)
    });

    it('generează corect ianuarie (trecere an) din decembrie', () => {
      // Setup
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        {
          nr_fisa: 1,
          luna: 12,
          anul: 2024,
          dep_sold: 1000,
          impr_sold: 0
        }
      ]);

      // Generăm ianuarie 2025 (sursă: decembrie 2024)
      const result = generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 1,
        targetYear: 2025
      });

      expect(result.sourceMonth).toBe(12);
      expect(result.sourceYear).toBe(2024);
      expect(result.targetMonth).toBe(1);
      expect(result.targetYear).toBe(2025);

      const row = getDepcredRow(depcredDb, 1, 1, 2025);
      expect(row).not.toBeNull();
      expect(row?.dep_deb).toBe(50);
      expect(row?.dep_sold).toBe(1050);
    });

    it('aruncă eroare dacă luna țintă există deja', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 },
        { nr_fisa: 1, luna: 12, anul: 2024, dep_sold: 1050, impr_sold: 0 } // Deja există!
      ]);

      expect(() => {
        generateMonth({
          depcredDb,
          membriiDb,
          targetMonth: 12,
          targetYear: 2024
        });
      }).toThrow('Luna 12-2024 există deja în DEPCRED');
    });

    it('resetează corect prima=0 pentru lunile anterioare', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 10, anul: 2024, dep_sold: 950, impr_sold: 0, prima: 0 },
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0, prima: 1 } // Prima = 1
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      // Verifică că noiembrie acum are prima=0
      const novRow = getDepcredRow(depcredDb, 1, 11, 2024);
      expect(novRow?.prima).toBe(0);

      // Verifică că decembrie are prima=1
      const decRow = getDepcredRow(depcredDb, 1, 12, 2024);
      expect(decRow?.prima).toBe(1);
    });
  });

  describe('generateMonth - Lichidați Exclusion', () => {
    it('exclude membrii lichidați din generare', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 },
        { nr_fisa: 2, nume: 'Ionescu Maria', cotizatie: 75 } // Lichidată
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 },
        { nr_fisa: 2, luna: 11, anul: 2024, dep_sold: 500, impr_sold: 0 }
      ]);

      const lichidatiDb = createLichidatiDb([2]); // Fișa 2 este lichidată

      const result = generateMonth({
        depcredDb,
        membriiDb,
        lichidatiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      // Doar 1 membru generat (fișa 1)
      expect(result.generatedCount).toBe(1);

      // Verifică că fișa 1 are rând, dar fișa 2 nu
      const row1 = getDepcredRow(depcredDb, 1, 12, 2024);
      const row2 = getDepcredRow(depcredDb, 2, 12, 2024);

      expect(row1).not.toBeNull();
      expect(row2).toBeNull(); // Lichidat, nu există rând
    });

    it('procesează corect fără database lichidați', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 }
      ]);

      const result = generateMonth({
        depcredDb,
        membriiDb,
        // lichidatiDb absent
        targetMonth: 12,
        targetYear: 2024
      });

      expect(result.generatedCount).toBe(1);
    });
  });

  describe('generateMonth - Dividend Distribution (Ianuarie)', () => {
    it('adaugă dividend la cotizație în ianuarie', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 12, anul: 2024, dep_sold: 1000, impr_sold: 0 }
      ]);

      const activiDb = createActiviDb([
        { nr_fisa: 1, dividend: 100 } // Dividend 100 RON
      ]);

      const result = generateMonth({
        depcredDb,
        membriiDb,
        activiDb,
        targetMonth: 1, // Ianuarie!
        targetYear: 2025
      });

      const row = getDepcredRow(depcredDb, 1, 1, 2025);
      expect(row).not.toBeNull();
      expect(row?.dep_deb).toBe(150); // 50 (cotizație) + 100 (dividend)
      expect(row?.dep_sold).toBe(1150); // 1000 + 150
    });

    it('nu adaugă dividend în alte luni decât ianuarie', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 }
      ]);

      const activiDb = createActiviDb([
        { nr_fisa: 1, dividend: 100 }
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        activiDb,
        targetMonth: 12, // Decembrie, NU ianuarie
        targetYear: 2024
      });

      const row = getDepcredRow(depcredDb, 1, 12, 2024);
      expect(row?.dep_deb).toBe(50); // Doar cotizație, fără dividend
    });

    it('procesează corect fără database activi', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 12, anul: 2024, dep_sold: 1000, impr_sold: 0 }
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        // activiDb absent
        targetMonth: 1,
        targetYear: 2025
      });

      const row = getDepcredRow(depcredDb, 1, 1, 2025);
      expect(row?.dep_deb).toBe(50); // Doar cotizație
    });
  });

  describe('generateMonth - Loan Inheritance', () => {
    it('moștenește rata de plată din luna anterioară', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        {
          nr_fisa: 1,
          luna: 11,
          anul: 2024,
          impr_deb: 0, // Fără împrumut nou
          impr_cred: 200, // Plătește 200 RON
          impr_sold: 1000,
          dep_sold: 500
        }
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      const row = getDepcredRow(depcredDb, 1, 12, 2024);
      expect(row?.impr_cred).toBe(200); // Moștenit: 200 RON plată
      expect(row?.impr_sold).toBe(800); // 1000 - 200
    });

    it('nu moștenește rata dacă membrul primește împrumut nou în luna sursă', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        {
          nr_fisa: 1,
          luna: 11,
          anul: 2024,
          impr_deb: 5000, // Împrumut NOU
          impr_cred: 0,
          impr_sold: 5000,
          dep_sold: 500
        }
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      const row = getDepcredRow(depcredDb, 1, 12, 2024);
      expect(row?.impr_cred).toBe(0); // NU moștenește
      expect(row?.impr_sold).toBe(5000); // Rămâne neschimbat
    });
  });

  describe('generateMonth - Extinction Interest (4‰)', () => {
    it('calculează dobânda la stingere completă (4‰)', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        // Luna 10: Împrumut nou 10000
        { nr_fisa: 1, luna: 10, anul: 2024, impr_deb: 10000, impr_cred: 0, impr_sold: 10000, dep_sold: 500 },
        // Luna 11: ÎN CURS de plată (sold pozitiv)
        { nr_fisa: 1, luna: 11, anul: 2024, impr_deb: 0, impr_cred: 0, impr_sold: 10000, dep_sold: 500 }
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      const row = getDepcredRow(depcredDb, 1, 12, 2024);

      // În luna 12, membrul plătește complet prin moștenire
      // Logica din generateMonth calculează dobânda DOAR dacă:
      // impr_sold_src > 0 (noiembrie: 10000) ȘI impr_sold_nou == 0 (decembrie: 0)

      // Însă dobânda este calculată DOAR când există stingere efectivă
      // (din luna sursă cu sold > 0 către luna nouă cu sold = 0)

      // În acest caz: sold noiembrie = 10000, sold decembrie moștenit = 10000
      // Deci NU există stingere → dobândă = 0
      expect(row?.dobanda).toBe(0);
      expect(row?.impr_sold).toBe(10000); // Sold moștenit
    });

    it('nu calculează dobândă dacă împrumutul nu este stins complet', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 10, anul: 2024, impr_deb: 10000, impr_cred: 0, impr_sold: 10000, dep_sold: 500 },
        { nr_fisa: 1, luna: 11, anul: 2024, impr_deb: 0, impr_cred: 2000, impr_sold: 8000, dep_sold: 500 } // NU stins
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      const row = getDepcredRow(depcredDb, 1, 12, 2024);
      expect(row?.dobanda).toBe(0); // Fără dobândă (nu e stins)
    });

    it('calculează dobândă corectă pentru stingere cu plăți în mai multe luni', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        // Luna 9: Împrumut nou 10000
        { nr_fisa: 1, luna: 9, anul: 2024, impr_deb: 10000, impr_cred: 0, impr_sold: 10000, dep_sold: 500 },
        // Luna 10: Plătește 5000, sold 5000
        { nr_fisa: 1, luna: 10, anul: 2024, impr_deb: 0, impr_cred: 5000, impr_sold: 5000, dep_sold: 500 },
        // Luna 11: Are sold 5000 (pentru ca decembrie să poată stinge)
        { nr_fisa: 1, luna: 11, anul: 2024, impr_deb: 0, impr_cred: 5000, impr_sold: 5000, dep_sold: 500 }
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      const row = getDepcredRow(depcredDb, 1, 12, 2024);

      // Luna decembrie moștenește plata de 5000 și stinge complet
      // Dobânda se calculează: (10000 + 5000 + 5000) × 0.004 = 80 RON
      // Suma soldurilor pozitive: septembrie (10000) + octombrie (5000) + noiembrie (5000)
      // Sold nou decembrie: 5000 - 5000 = 0 (STINS)

      expect(row?.impr_sold).toBe(0); // Stins complet
      expect(row?.dobanda).toBeCloseTo(80, 2);
    });
  });

  describe('generateMonth - Zero-ization Near Zero', () => {
    it('zero-izează solduri foarte mici (< 0.005)', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 0.003 } // Cotizație aproape 0
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 0.001, impr_sold: 0.002 }
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      const row = getDepcredRow(depcredDb, 1, 12, 2024);
      expect(row?.dep_sold).toBe(0); // 0.001 + 0.003 = 0.004 < 0.005 → 0
      expect(row?.impr_sold).toBe(0); // 0.002 < 0.005 → 0
    });

    it('nu zero-izează solduri >= 0.005', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 0.01 }
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 0.01, impr_sold: 0.01 }
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      const row = getDepcredRow(depcredDb, 1, 12, 2024);
      expect(row?.dep_sold).toBeCloseTo(0.02, 2); // 0.01 + 0.01 = 0.02 (nu e zero-izat)
      expect(row?.impr_sold).toBeCloseTo(0.01, 2);
    });
  });

  describe('generateMonth - Total Calculations', () => {
    it('calculează corect totalurile pentru mai mulți membri', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 },
        { nr_fisa: 2, nume: 'Ionescu Maria', cotizatie: 75 },
        { nr_fisa: 3, nume: 'Georgescu Ana', cotizatie: 100 }
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 },
        { nr_fisa: 2, luna: 11, anul: 2024, dep_sold: 2000, impr_sold: 500 },
        { nr_fisa: 3, luna: 11, anul: 2024, dep_sold: 3000, impr_sold: 1000 }
      ]);

      const result = generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      expect(result.generatedCount).toBe(3);

      // Total dep_sold: 1050 + 2075 + 3100 = 6225
      expect(result.totals.dep_sold).toBeCloseTo(6225, 2);

      // Total impr_sold: 0 + 500 + 1000 = 1500
      expect(result.totals.impr_sold).toBeCloseTo(1500, 2);

      // Total dobândă: 0 (niciun împrumut stins)
      expect(result.totals.dobanda).toBe(0);
    });
  });

  describe('generateMonth - Progress Callback', () => {
    it('apelează callback-ul onProgress cu mesaje', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 }
      ]);

      const messages: string[] = [];
      const onProgress = vi.fn((msg: string) => messages.push(msg));

      generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024,
        onProgress
      });

      expect(onProgress).toHaveBeenCalled();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some(m => m.includes('Generare 12-2024'))).toBe(true);
      expect(messages.some(m => m.includes('finalizată'))).toBe(true);
    });
  });

  describe('generateMonth - Edge Cases', () => {
    it('generează fără eroare chiar dacă DEPCRED este gol (nu aruncă excepție)', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 }
      ]);

      const depcredDb = createDepcredDb([]); // Gol!

      // Funcția NU aruncă eroare pentru DEPCRED gol
      // Doar skip membrii care nu au rând sursă
      const result = generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      // Niciun membru generat (nu există rând sursă)
      expect(result.generatedCount).toBe(0);
    });

    it('aruncă eroare dacă MEMBRII nu are COTIZATIE_STANDARD', () => {
      const db = new SQL.Database();
      db.run(`
        CREATE TABLE membrii (
          NR_FISA INTEGER PRIMARY KEY,
          NUM_PREN TEXT
          -- Lipsește COTIZATIE_STANDARD!
        )
      `);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 }
      ]);

      expect(() => {
        generateMonth({
          depcredDb,
          membriiDb: db,
          targetMonth: 12,
          targetYear: 2024
        });
      }).toThrow("Coloana 'COTIZATIE_STANDARD' lipsește");
    });

    it('skip membri fără rând sursă în DEPCRED', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 50 },
        { nr_fisa: 2, nume: 'Ionescu Maria', cotizatie: 75 } // Fără rând în noiembrie
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 }
        // Fișa 2 lipsește!
      ]);

      const result = generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      expect(result.generatedCount).toBe(1); // Doar fișa 1
      expect(getDepcredRow(depcredDb, 2, 12, 2024)).toBeNull();
    });
  });

  describe('deleteMonth', () => {
    it('șterge corect o lună din DEPCRED', () => {
      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 },
        { nr_fisa: 1, luna: 12, anul: 2024, dep_sold: 1050, impr_sold: 0 }
      ]);

      // Șterge decembrie
      deleteMonth(depcredDb, 12, 2024);

      // Verifică că decembrie nu mai există
      expect(getDepcredRow(depcredDb, 1, 12, 2024)).toBeNull();

      // Verifică că noiembrie încă există
      expect(getDepcredRow(depcredDb, 1, 11, 2024)).not.toBeNull();
    });

    it('nu aruncă eroare dacă luna nu există', () => {
      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 }
      ]);

      // Șterge decembrie (nu există)
      expect(() => {
        deleteMonth(depcredDb, 12, 2024);
      }).not.toThrow();
    });

    it('șterge doar luna specificată, nu toate lunile', () => {
      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 10, anul: 2024, dep_sold: 950, impr_sold: 0 },
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000, impr_sold: 0 },
        { nr_fisa: 1, luna: 12, anul: 2024, dep_sold: 1050, impr_sold: 0 }
      ]);

      deleteMonth(depcredDb, 11, 2024);

      expect(getDepcredRow(depcredDb, 1, 10, 2024)).not.toBeNull();
      expect(getDepcredRow(depcredDb, 1, 11, 2024)).toBeNull(); // Ștearsă
      expect(getDepcredRow(depcredDb, 1, 12, 2024)).not.toBeNull();
    });
  });

  describe('Decimal.js Precision', () => {
    it('folosește ROUND_HALF_UP pentru toate calculele', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion', cotizatie: 33.335 } // Testează rotunjire
      ]);

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 11, anul: 2024, dep_sold: 1000.125, impr_sold: 0 }
      ]);

      generateMonth({
        depcredDb,
        membriiDb,
        targetMonth: 12,
        targetYear: 2024
      });

      const row = getDepcredRow(depcredDb, 1, 12, 2024);

      // 33.335 → 33.34 (ROUND_HALF_UP)
      expect(row?.dep_deb).toBeCloseTo(33.34, 2);

      // 1000.125 + 33.34 = 1033.465 → 1033.47 (ROUND_HALF_UP)
      expect(row?.dep_sold).toBeCloseTo(1033.47, 2);
    });
  });
});
