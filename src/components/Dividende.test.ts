// src/components/Dividende.test.ts
/**
 * Teste pentru modulul Dividende.tsx
 * Testează calculul și distribuirea dividendelor anuale către membri activi
 */

import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import Decimal from 'decimal.js';
import { calculateBenefits } from '../logic/calculateBenefits';

// Configurare Decimal.js identică cu componenta
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const PRAG_ZEROIZARE = new Decimal("0.005");

// Helper: Inițializare sql.js
let SQL: any;
beforeEach(async () => {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `node_modules/sql.js/dist/${file}`
    });
  }
});

// Helper: Creare database MEMBRII
function createMembriiDb(membri: Array<{ nr_fisa: number; nume: string }>): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE membrii (
      NR_FISA INTEGER PRIMARY KEY,
      NUM_PREN TEXT
    )
  `);

  for (const m of membri) {
    db.run(`INSERT INTO membrii (NR_FISA, NUM_PREN) VALUES (?, ?)`, [m.nr_fisa, m.nume]);
  }

  return db;
}

// Helper: Creare database DEPCRED
function createDepcredDb(transactions: Array<{
  nr_fisa: number;
  luna: number;
  anul: number;
  dep_sold: number;
}>): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE depcred (
      NR_FISA INTEGER,
      LUNA INTEGER,
      ANUL INTEGER,
      DEP_DEB REAL DEFAULT 0,
      DEP_CRED REAL DEFAULT 0,
      DEP_SOLD REAL DEFAULT 0
    )
  `);

  for (const t of transactions) {
    db.run(
      `INSERT INTO depcred (NR_FISA, LUNA, ANUL, DEP_SOLD) VALUES (?, ?, ?, ?)`,
      [t.nr_fisa, t.luna, t.anul, t.dep_sold]
    );
  }

  return db;
}

// Helper: Creare database ACTIVI
function createActiviDb(): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE activi (
      NR_FISA INTEGER PRIMARY KEY,
      NUM_PREN TEXT,
      DEP_SOLD REAL DEFAULT 0,
      DIVIDEND REAL DEFAULT 0
    )
  `);

  return db;
}

// Helper: Creare database LICHIDATI
function createLichidatiDb(nrFise: number[]): Database {
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE lichidati (
      NR_FISA INTEGER PRIMARY KEY,
      NUM_PREN TEXT
    )
  `);

  for (const nr of nrFise) {
    db.run(`INSERT INTO lichidati (NR_FISA) VALUES (?)`, [nr]);
  }

  return db;
}

describe('Dividende.tsx - Dividend Distribution', () => {
  describe('calculateBenefits - Basic Scenarios', () => {
    it('calculează corect dividende pentru 1 membru', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion' }
      ]);

      const depcredDb = createDepcredDb([
        // An 2024: 12 luni cu sold 1000
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 1,
          luna: i + 1,
          anul: 2024,
          dep_sold: 1000
        }))
      ]);

      const activiDb = createActiviDb();

      const result = calculateBenefits(
        membriiDb,
        depcredDb,
        activiDb,
        2024,
        new Decimal(1200) // Profit 1200
      );

      expect(result).not.toBeNull();
      expect(result!.members.length).toBe(1);

      // S_total = 12 × 1000 = 12000
      expect(result!.S_total.toNumber()).toBe(12000);

      // Beneficiu = (1200 / 12000) × 12000 = 1200 (tot profitul)
      expect(result!.members[0].beneficiu.toNumber()).toBe(1200);
    });

    it('distribuie corect profitul între mai mulți membri', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion' },
        { nr_fisa: 2, nume: 'Ionescu Maria' },
        { nr_fisa: 3, nume: 'Georgescu Ana' }
      ]);

      const depcredDb = createDepcredDb([
        // Membru 1: sold 1000/lună × 12 = 12000
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 1,
          luna: i + 1,
          anul: 2024,
          dep_sold: 1000
        })),
        // Membru 2: sold 2000/lună × 12 = 24000
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 2,
          luna: i + 1,
          anul: 2024,
          dep_sold: 2000
        })),
        // Membru 3: sold 3000/lună × 12 = 36000
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 3,
          luna: i + 1,
          anul: 2024,
          dep_sold: 3000
        }))
      ]);

      const activiDb = createActiviDb();

      const result = calculateBenefits(
        membriiDb,
        depcredDb,
        activiDb,
        2024,
        new Decimal(720) // Profit 720
      );

      expect(result).not.toBeNull();
      expect(result!.members.length).toBe(3);

      // S_total = 12000 + 24000 + 36000 = 72000
      expect(result!.S_total.toNumber()).toBe(72000);

      // Membru 1: (720 / 72000) × 12000 = 120
      const membru1 = result!.members.find(m => m.nrFisa === 1);
      expect(membru1!.beneficiu.toNumber()).toBe(120);

      // Membru 2: (720 / 72000) × 24000 = 240
      const membru2 = result!.members.find(m => m.nrFisa === 2);
      expect(membru2!.beneficiu.toNumber()).toBe(240);

      // Membru 3: (720 / 72000) × 36000 = 360
      const membru3 = result!.members.find(m => m.nrFisa === 3);
      expect(membru3!.beneficiu.toNumber()).toBe(360);

      // Sumă totală: 120 + 240 + 360 = 720 ✓
      const totalDistribuit = membru1!.beneficiu.plus(membru2!.beneficiu).plus(membru3!.beneficiu);
      expect(totalDistribuit.toNumber()).toBe(720);
    });

    it('exclude membri lichidați din calcul', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion' },
        { nr_fisa: 2, nume: 'Ionescu Maria' } // Lichidată
      ]);

      const depcredDb = createDepcredDb([
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 1,
          luna: i + 1,
          anul: 2024,
          dep_sold: 1000
        })),
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 2,
          luna: i + 1,
          anul: 2024,
          dep_sold: 2000
        }))
      ]);

      const activiDb = createActiviDb();
      const lichidatiDb = createLichidatiDb([2]); // Fișa 2 lichidată

      const result = calculateBenefits(
        membriiDb,
        depcredDb,
        activiDb,
        2024,
        new Decimal(1200),
        lichidatiDb
      );

      expect(result).not.toBeNull();
      expect(result!.members.length).toBe(1); // Doar membru 1

      // Tot profitul merge la membru 1
      expect(result!.members[0].nrFisa).toBe(1);
      expect(result!.members[0].beneficiu.toNumber()).toBe(1200);
    });
  });

  describe('calculateBenefits - Eligibility Rules', () => {
    it('exclude membri fără sold pozitiv în decembrie (sol < 0.005)', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion' }, // Are sold în decembrie
        { nr_fisa: 2, nume: 'Ionescu Maria' } // NU are sold în decembrie
      ]);

      const depcredDb = createDepcredDb([
        // Membru 1: sold pozitiv în toate lunile inclusiv decembrie
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 1,
          luna: i + 1,
          anul: 2024,
          dep_sold: 1000
        })),
        // Membru 2: sold pozitiv Jan-Nov, dar 0 în decembrie
        ...Array.from({ length: 11 }, (_, i) => ({
          nr_fisa: 2,
          luna: i + 1,
          anul: 2024,
          dep_sold: 2000
        })),
        { nr_fisa: 2, luna: 12, anul: 2024, dep_sold: 0 } // Decembrie: 0
      ]);

      const activiDb = createActiviDb();

      const result = calculateBenefits(
        membriiDb,
        depcredDb,
        activiDb,
        2024,
        new Decimal(1000)
      );

      expect(result).not.toBeNull();
      expect(result!.members.length).toBe(1); // Doar membru 1 eligibil

      // Tot profitul merge la membru 1
      expect(result!.members[0].nrFisa).toBe(1);
    });

    it('include membri cu sold foarte mic în decembrie (> 0.005)', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion' }
      ]);

      const depcredDb = createDepcredDb([
        ...Array.from({ length: 11 }, (_, i) => ({
          nr_fisa: 1,
          luna: i + 1,
          anul: 2024,
          dep_sold: 1000
        })),
        { nr_fisa: 1, luna: 12, anul: 2024, dep_sold: 0.01 } // Foarte mic dar > 0.005
      ]);

      const activiDb = createActiviDb();

      const result = calculateBenefits(
        membriiDb,
        depcredDb,
        activiDb,
        2024,
        new Decimal(1000)
      );

      expect(result).not.toBeNull();
      expect(result!.members.length).toBe(1); // Eligibil
    });
  });

  describe('calculateBenefits - ROUND_HALF_UP Precision', () => {
    it('aplică ROUND_HALF_UP pentru distribuire dividende', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion' },
        { nr_fisa: 2, nume: 'Ionescu Maria' },
        { nr_fisa: 3, nume: 'Georgescu Ana' }
      ]);

      const depcredDb = createDepcredDb([
        // Solduri care vor produce rotunjiri .xx5
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 1,
          luna: i + 1,
          anul: 2024,
          dep_sold: 1234.56
        })),
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 2,
          luna: i + 1,
          anul: 2024,
          dep_sold: 2345.67
        })),
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 3,
          luna: i + 1,
          anul: 2024,
          dep_sold: 3456.78
        }))
      ]);

      const activiDb = createActiviDb();

      const result = calculateBenefits(
        membriiDb,
        depcredDb,
        activiDb,
        2024,
        new Decimal(1000)
      );

      expect(result).not.toBeNull();

      // Verifică că suma dividendelor = profit (cu toleranță pentru rotunjiri)
      const totalDistribuit = result!.members.reduce(
        (sum, m) => sum.plus(m.beneficiu),
        new Decimal(0)
      );

      // Diferența ar trebui să fie max 0.03 (3 membri × 0.01 rotunjire max)
      const diferenta = totalDistribuit.minus(1000).abs();
      expect(diferenta.toNumber()).toBeLessThanOrEqual(0.03);

      // Fiecare beneficiu ar trebui să aibă max 2 zecimale
      for (const member of result!.members) {
        const zecimale = member.beneficiu.toFixed(2);
        expect(member.beneficiu.toNumber()).toBe(Number(zecimale));
      }
    });
  });

  describe('calculateBenefits - Edge Cases', () => {
    it('aruncă eroare dacă nu există membri eligibili', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion' }
      ]);

      // Toți membrii au sold 0 în decembrie
      const depcredDb = createDepcredDb([
        ...Array.from({ length: 11 }, (_, i) => ({
          nr_fisa: 1,
          luna: i + 1,
          anul: 2024,
          dep_sold: 1000
        })),
        { nr_fisa: 1, luna: 12, anul: 2024, dep_sold: 0 }
      ]);

      const activiDb = createActiviDb();

      expect(() => {
        calculateBenefits(
          membriiDb,
          depcredDb,
          activiDb,
          2024,
          new Decimal(1000)
        );
      }).toThrow('Nu s-au găsit membri cu solduri pozitive în 2024');
    });

    it('folosește nume default (Fișa X) dacă MEMBRII este gol', () => {
      const membriiDb = createMembriiDb([]); // Gol!

      const depcredDb = createDepcredDb([
        { nr_fisa: 1, luna: 12, anul: 2024, dep_sold: 1000 }
      ]);

      const activiDb = createActiviDb();

      // Funcția reală folosește nume default când nu găsește în MEMBRII
      const result = calculateBenefits(
        membriiDb,
        depcredDb,
        activiDb,
        2024,
        new Decimal(1000)
      );

      expect(result.members.length).toBe(1);
      expect(result.members[0].numPren).toBe('Fișa 1'); // Nume default
      expect(result.members[0].beneficiu.toNumber()).toBe(1000);
      expect(result.missingNames).toContain(1); // Nr fișă missing
    });

    it('gestionează profit 0', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion' }
      ]);

      const depcredDb = createDepcredDb([
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 1,
          luna: i + 1,
          anul: 2024,
          dep_sold: 1000
        }))
      ]);

      const activiDb = createActiviDb();

      const result = calculateBenefits(
        membriiDb,
        depcredDb,
        activiDb,
        2024,
        new Decimal(0) // Profit = 0
      );

      expect(result).not.toBeNull();
      expect(result!.members[0].beneficiu.toNumber()).toBe(0);
    });

    it('șterge datele anterioare din ACTIVI înainte de calcul', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Popescu Ion' }
      ]);

      const depcredDb = createDepcredDb([
        ...Array.from({ length: 12 }, (_, i) => ({
          nr_fisa: 1,
          luna: i + 1,
          anul: 2024,
          dep_sold: 1000
        }))
      ]);

      const activiDb = createActiviDb();

      // Inserăm date anterioare
      activiDb.run(
        `INSERT INTO ACTIVI (NR_FISA, NUM_PREN, DIVIDEND) VALUES (?, ?, ?)`,
        [999, 'Membru Vechi', 500]
      );

      // Verificăm că există
      let checkResult = activiDb.exec('SELECT COUNT(*) FROM ACTIVI');
      expect(checkResult[0].values[0][0]).toBe(1);

      // Rulăm calcul
      calculateBenefits(
        membriiDb,
        depcredDb,
        activiDb,
        2024,
        new Decimal(1000)
      );

      // Verificăm că datele vechi au fost șterse
      checkResult = activiDb.exec('SELECT COUNT(*) FROM ACTIVI');
      expect(checkResult[0].values[0][0]).toBe(1); // Doar noul membru

      const newData = activiDb.exec('SELECT NR_FISA FROM ACTIVI');
      expect(newData[0].values[0][0]).toBe(1); // Fișa 1, nu 999
    });
  });

  describe('Dividend Conservation', () => {
    it('suma dividendelor distribuite = profit total (verificare conservare)', () => {
      const membriiDb = createMembriiDb([
        { nr_fisa: 1, nume: 'Membru 1' },
        { nr_fisa: 2, nume: 'Membru 2' },
        { nr_fisa: 3, nume: 'Membru 3' },
        { nr_fisa: 4, nume: 'Membru 4' },
        { nr_fisa: 5, nume: 'Membru 5' }
      ]);

      // Solduri diferite pentru fiecare membru
      const depcredDb = createDepcredDb([
        ...Array.from({ length: 12 }, (_, i) => ({ nr_fisa: 1, luna: i + 1, anul: 2024, dep_sold: 1111.11 })),
        ...Array.from({ length: 12 }, (_, i) => ({ nr_fisa: 2, luna: i + 1, anul: 2024, dep_sold: 2222.22 })),
        ...Array.from({ length: 12 }, (_, i) => ({ nr_fisa: 3, luna: i + 1, anul: 2024, dep_sold: 3333.33 })),
        ...Array.from({ length: 12 }, (_, i) => ({ nr_fisa: 4, luna: i + 1, anul: 2024, dep_sold: 4444.44 })),
        ...Array.from({ length: 12 }, (_, i) => ({ nr_fisa: 5, luna: i + 1, anul: 2024, dep_sold: 5555.55 }))
      ]);

      const activiDb = createActiviDb();

      const profit = new Decimal(10000);

      const result = calculateBenefits(
        membriiDb,
        depcredDb,
        activiDb,
        2024,
        profit
      );

      expect(result).not.toBeNull();
      expect(result!.members.length).toBe(5);

      // Suma dividendelor ar trebui să fie profit (cu toleranță pentru rotunjiri)
      const totalDistribuit = result!.members.reduce(
        (sum, m) => sum.plus(m.beneficiu),
        new Decimal(0)
      );

      // Diferența max: 5 membri × 0.01 = 0.05
      const diferenta = totalDistribuit.minus(profit).abs();
      expect(diferenta.toNumber()).toBeLessThanOrEqual(0.05);
    });
  });
});
