// src/components/CalculeazaDobanda.test.ts
/**
 * Teste pentru funcția calculeazaDobandaLaZi
 * Această funcție calculează dobânda pentru un membru bazată pe soldurile pozitive
 * din perioada START (ultima lună cu sold zero sau ultimul împrumut) până la luna END.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import Decimal from 'decimal.js';
import type { DBSet } from '../services/databaseManager';
import { calculeazaDobandaLaZi } from '../logic/calculeazaDobandaLaZi';

// Configurare Decimal.js identică cu componenta
Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

// Helper: Inițializare sql.js
let SQL: any;
beforeEach(async () => {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `node_modules/sql.js/dist/${file}`
    });
  }
});

// Helper: Creare DBSet cu database DEPCRED
function createDBSet(transactions: Array<{
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
}>): DBSet {
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
      DEP_SOLD REAL DEFAULT 0
    )
  `);

  for (const t of transactions) {
    db.run(
      `INSERT INTO depcred (NR_FISA, LUNA, ANUL, DOBANDA, IMPR_DEB, IMPR_CRED, IMPR_SOLD, DEP_DEB, DEP_CRED, DEP_SOLD)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        t.dep_sold ?? 0
      ]
    );
  }

  // Returnează DBSet cu baza de date DEPCRED
  return {
    depcred: db,
    chitante: new SQL.Database(), // Dummy database
    source: 'upload',
    availableCurrencies: ['RON'],
    activeCurrency: 'RON',
    hasEuroData: false,
    loadedAt: new Date()
  } as DBSet;
}

describe('CalculeazaDobanda.tsx - calculeazaDobandaLaZi Function', () => {
  describe('Basic Scenarios', () => {
    it('calculează corect dobânda pentru un împrumut simplu (3 luni)', () => {
      // Scenariu: Împrumut 10000 acordat în ianuarie, plătit în aprilie
      // Solduri: Ian (10000), Feb (10000), Mar (10000), Apr (0)
      const databases = createDBSet([
        { nr_fisa: 1, luna: 12, anul: 2023, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 },
        { nr_fisa: 1, luna: 1, anul: 2024, dobanda: 0, impr_deb: 10000, impr_cred: 0, impr_sold: 10000, dep_sold: 500 },
        { nr_fisa: 1, luna: 2, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 10000, dep_sold: 500 },
        { nr_fisa: 1, luna: 3, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 10000, dep_sold: 500 },
        { nr_fisa: 1, luna: 4, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 10000, impr_sold: 0, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1, // nr_fisa
        4, // end_luna
        2024, // end_anul
        new Decimal("0.004") // rata 0.4%
      );

      // Start period ar trebui să fie decembrie 2023 (ultima lună cu sold zero)
      expect(result.start_period).toBe(202312); // Dec 2023

      // Suma soldurilor: Ian (10000) + Feb (10000) + Mar (10000) + Apr (0) = 30000
      expect(result.suma_solduri.toNumber()).toBe(30000);

      // Dobândă: 30000 × 0.004 = 120
      expect(result.dobanda.toNumber()).toBeCloseTo(120, 2);
    });

    it('returnează 0 dacă membrul nu are istoric de împrumuturi', () => {
      const databases = createDBSet([
        { nr_fisa: 1, luna: 1, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 },
        { nr_fisa: 1, luna: 2, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        2,
        2024,
        new Decimal("0.004")
      );

      expect(result.start_period).toBe(0);
      expect(result.suma_solduri.toNumber()).toBe(0);
      expect(result.dobanda.toNumber()).toBe(0);
    });

    it('include solduri foarte mici (> 0 dar < 0.005) în calcul', () => {
      const databases = createDBSet([
        { nr_fisa: 1, luna: 12, anul: 2023, dobanda: 0, impr_deb: 10000, impr_cred: 0, impr_sold: 0.003, dep_sold: 500 },
        { nr_fisa: 1, luna: 1, anul: 2024, dobanda: 0, impr_deb: 5000, impr_cred: 0, impr_sold: 5000, dep_sold: 500 },
        { nr_fisa: 1, luna: 2, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 5000, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        2,
        2024,
        new Decimal("0.004")
      );

      // Funcția NU zero-izează soldurile în SQL query
      // Query: WHERE impr_sold > 0 → 0.003 este inclus!
      // Suma: Dec (0.003) + Ian (5000) + Feb (5000) = 10000.003
      expect(result.suma_solduri.toNumber()).toBeCloseTo(10000.003, 3);
      expect(result.dobanda.toNumber()).toBeCloseTo(40, 2); // 10000.003 × 0.004 ≈ 40.00
    });
  });

  describe('Concomitent Case (Dobândă + Împrumut Nou)', () => {
    it('detectează corect cazul concomitent (dobândă + împrumut nou în aceeași lună)', () => {
      // Scenariu: Membru stinge împrumut vechi și ia împrumut nou în aceeași lună
      const databases = createDBSet([
        { nr_fisa: 1, luna: 10, anul: 2024, dobanda: 0, impr_deb: 8000, impr_cred: 0, impr_sold: 8000, dep_sold: 500 },
        { nr_fisa: 1, luna: 11, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 8000, dep_sold: 500 },
        // Luna decembrie: dobândă stingere (32) + împrumut nou (10000)
        { nr_fisa: 1, luna: 12, anul: 2024, dobanda: 32, impr_deb: 10000, impr_cred: 8000, impr_sold: 10000, dep_sold: 500 },
        { nr_fisa: 1, luna: 1, anul: 2025, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 10000, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        1, // ianuarie 2025
        2025,
        new Decimal("0.004")
      );

      // În cazul concomitent, START = luna cu dobândă + împrumut (decembrie 2024)
      expect(result.start_period).toBe(202412); // Dec 2024

      // Suma: Dec (10000) + Ian (10000) = 20000
      expect(result.suma_solduri.toNumber()).toBe(20000);

      // Dobândă: 20000 × 0.004 = 80
      expect(result.dobanda.toNumber()).toBeCloseTo(80, 2);
    });

    it('folosește ultima lună cu sold zero dacă NU există concomitent', () => {
      const databases = createDBSet([
        { nr_fisa: 1, luna: 9, anul: 2024, dobanda: 0, impr_deb: 5000, impr_cred: 0, impr_sold: 5000, dep_sold: 500 },
        { nr_fisa: 1, luna: 10, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 5000, impr_sold: 0, dep_sold: 500 }, // Stins
        { nr_fisa: 1, luna: 11, anul: 2024, dobanda: 0, impr_deb: 8000, impr_cred: 0, impr_sold: 8000, dep_sold: 500 }, // Împrumut nou
        { nr_fisa: 1, luna: 12, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 8000, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        12,
        2024,
        new Decimal("0.004")
      );

      // START = octombrie (ultima lună cu sold zero ÎNAINTE de ultimul împrumut noiembrie)
      expect(result.start_period).toBe(202410); // Oct 2024

      // Suma: Nov (8000) + Dec (8000) = 16000
      expect(result.suma_solduri.toNumber()).toBe(16000);

      // Dobândă: 16000 × 0.004 = 64
      expect(result.dobanda.toNumber()).toBeCloseTo(64, 2);
    });
  });

  describe('Multiple Loans Scenarios', () => {
    it('calculează corect pentru mai multe împrumuturi consecutive', () => {
      const databases = createDBSet([
        // Împrumut 1: Ian - Mar (stins)
        { nr_fisa: 1, luna: 12, anul: 2023, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 },
        { nr_fisa: 1, luna: 1, anul: 2024, dobanda: 0, impr_deb: 5000, impr_cred: 0, impr_sold: 5000, dep_sold: 500 },
        { nr_fisa: 1, luna: 2, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 5000, dep_sold: 500 },
        { nr_fisa: 1, luna: 3, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 5000, impr_sold: 0, dep_sold: 500 },
        // Împrumut 2: Mai - Iun
        { nr_fisa: 1, luna: 4, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 },
        { nr_fisa: 1, luna: 5, anul: 2024, dobanda: 0, impr_deb: 10000, impr_cred: 0, impr_sold: 10000, dep_sold: 500 },
        { nr_fisa: 1, luna: 6, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 10000, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        6, // iunie
        2024,
        new Decimal("0.004")
      );

      // Ultimul împrumut: Mai 2024
      // Ultima lună cu sold zero ÎNAINTE de mai: aprilie 2024
      expect(result.start_period).toBe(202404); // Apr 2024

      // Suma: Mai (10000) + Iun (10000) = 20000
      expect(result.suma_solduri.toNumber()).toBe(20000);

      // Dobândă: 20000 × 0.004 = 80
      expect(result.dobanda.toNumber()).toBeCloseTo(80, 2);
    });

    it('calculează corect când primul împrumut nu are sold zero anterior', () => {
      // Membru nou, primul împrumut fără istoric anterior
      const databases = createDBSet([
        { nr_fisa: 1, luna: 1, anul: 2024, dobanda: 0, impr_deb: 10000, impr_cred: 0, impr_sold: 10000, dep_sold: 500 },
        { nr_fisa: 1, luna: 2, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 10000, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        2,
        2024,
        new Decimal("0.004")
      );

      // START = ian 2024 (nu există sold zero anterior)
      expect(result.start_period).toBe(202401); // Jan 2024

      // Suma: Ian (10000) + Feb (10000) = 20000
      expect(result.suma_solduri.toNumber()).toBe(20000);

      // Dobândă: 20000 × 0.004 = 80
      expect(result.dobanda.toNumber()).toBeCloseTo(80, 2);
    });
  });

  describe('Partial Payments', () => {
    it('calculează corect cu plăți parțiale (sold descrescător)', () => {
      const databases = createDBSet([
        { nr_fisa: 1, luna: 11, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 },
        { nr_fisa: 1, luna: 12, anul: 2024, dobanda: 0, impr_deb: 12000, impr_cred: 0, impr_sold: 12000, dep_sold: 500 },
        { nr_fisa: 1, luna: 1, anul: 2025, dobanda: 0, impr_deb: 0, impr_cred: 4000, impr_sold: 8000, dep_sold: 500 },
        { nr_fisa: 1, luna: 2, anul: 2025, dobanda: 0, impr_deb: 0, impr_cred: 4000, impr_sold: 4000, dep_sold: 500 },
        { nr_fisa: 1, luna: 3, anul: 2025, dobanda: 0, impr_deb: 0, impr_cred: 4000, impr_sold: 0, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        3, // martie 2025
        2025,
        new Decimal("0.004")
      );

      // START = noiembrie 2024
      expect(result.start_period).toBe(202411);

      // Suma: Dec (12000) + Ian (8000) + Feb (4000) + Mar (0) = 24000
      expect(result.suma_solduri.toNumber()).toBe(24000);

      // Dobândă: 24000 × 0.004 = 96
      expect(result.dobanda.toNumber()).toBeCloseTo(96, 2);
    });
  });

  describe('ROUND_HALF_UP Precision', () => {
    it('aplică ROUND_HALF_UP corect pentru dobândă', () => {
      const databases = createDBSet([
        { nr_fisa: 1, luna: 11, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 },
        { nr_fisa: 1, luna: 12, anul: 2024, dobanda: 0, impr_deb: 12345.67, impr_cred: 0, impr_sold: 12345.67, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        12,
        2024,
        new Decimal("0.004")
      );

      // Suma soldurilor: 12345.67
      expect(result.suma_solduri.toNumber()).toBeCloseTo(12345.67, 2);

      // Dobândă: 12345.67 × 0.004 = 49.38268 → 49.38 (ROUND_HALF_UP)
      expect(result.dobanda.toNumber()).toBe(49.38);
    });

    it('rotunjește corect pentru cazuri .xx5', () => {
      const databases = createDBSet([
        { nr_fisa: 1, luna: 11, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 },
        // Sold care produce dobândă cu .xx5
        { nr_fisa: 1, luna: 12, anul: 2024, dobanda: 0, impr_deb: 2512.50, impr_cred: 0, impr_sold: 2512.50, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        12,
        2024,
        new Decimal("0.004")
      );

      // Dobândă: 2512.50 × 0.004 = 10.05 exact
      expect(result.dobanda.toNumber()).toBe(10.05);
    });
  });

  describe('Edge Cases', () => {
    it('gestionează corect database gol', () => {
      const databases = createDBSet([]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        12,
        2024,
        new Decimal("0.004")
      );

      expect(result.start_period).toBe(0);
      expect(result.suma_solduri.toNumber()).toBe(0);
      expect(result.dobanda.toNumber()).toBe(0);
    });

    it('gestionează corect membru inexistent', () => {
      const databases = createDBSet([
        { nr_fisa: 1, luna: 12, anul: 2024, dobanda: 0, impr_deb: 10000, impr_cred: 0, impr_sold: 10000, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        999, // Membru inexistent
        12,
        2024,
        new Decimal("0.004")
      );

      expect(result.start_period).toBe(0);
      expect(result.suma_solduri.toNumber()).toBe(0);
      expect(result.dobanda.toNumber()).toBe(0);
    });

    it('gestionează corect rate variabile', () => {
      const databases = createDBSet([
        { nr_fisa: 1, luna: 11, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 },
        { nr_fisa: 1, luna: 12, anul: 2024, dobanda: 0, impr_deb: 10000, impr_cred: 0, impr_sold: 10000, dep_sold: 500 }
      ]);

      // Rată 0.2% (2‰)
      const result1 = calculeazaDobandaLaZi(databases, 1, 12, 2024, new Decimal("0.002"));
      expect(result1.dobanda.toNumber()).toBe(20); // 10000 × 0.002

      // Rată 0.5% (5‰)
      const result2 = calculeazaDobandaLaZi(databases, 1, 12, 2024, new Decimal("0.005"));
      expect(result2.dobanda.toNumber()).toBe(50); // 10000 × 0.005

      // Rată 1% (10‰)
      const result3 = calculeazaDobandaLaZi(databases, 1, 12, 2024, new Decimal("0.01"));
      expect(result3.dobanda.toNumber()).toBe(100); // 10000 × 0.01
    });

    it('gestionează corect solduri foarte mari', () => {
      const databases = createDBSet([
        { nr_fisa: 1, luna: 11, anul: 2024, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 },
        { nr_fisa: 1, luna: 12, anul: 2024, dobanda: 0, impr_deb: 1000000, impr_cred: 0, impr_sold: 1000000, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        12,
        2024,
        new Decimal("0.004")
      );

      // Dobândă: 1,000,000 × 0.004 = 4,000
      expect(result.dobanda.toNumber()).toBe(4000);
    });
  });

  describe('Real-World Test Case (From User)', () => {
    it('calculează corect pentru cazul de test al utilizatorului (05-2025 → 06-2025)', () => {
      // Recreare scenariu de test din conversație:
      // Perioadă corectă: 05-2025 → 06-2025
      // Suma soldurilor: 59010.00 RON

      const databases = createDBSet([
        // Aprilie 2025: sold zero (ultima lună cu sold zero)
        { nr_fisa: 1, luna: 4, anul: 2025, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 0, dep_sold: 500 },
        // Mai 2025: primul sold pozitiv
        { nr_fisa: 1, luna: 5, anul: 2025, dobanda: 0, impr_deb: 29505, impr_cred: 0, impr_sold: 29505, dep_sold: 500 },
        // Iunie 2025: sold pozitiv
        { nr_fisa: 1, luna: 6, anul: 2025, dobanda: 0, impr_deb: 0, impr_cred: 0, impr_sold: 29505, dep_sold: 500 }
      ]);

      const result = calculeazaDobandaLaZi(
        databases,
        1,
        6, // iunie 2025
        2025,
        new Decimal("0.004")
      );

      // START = aprilie 2025 (ultima lună cu sold zero)
      expect(result.start_period).toBe(202504);

      // Suma soldurilor: Mai (29505) + Iun (29505) = 59010
      expect(result.suma_solduri.toNumber()).toBe(59010);

      // Dobândă: 59010 × 0.004 = 236.04
      expect(result.dobanda.toNumber()).toBeCloseTo(236.04, 2);
    });
  });
});
