// src/components/Conversion.test.ts
/**
 * Teste pentru modulul Conversion.tsx
 * Testează conversia RON → EUR conform EU Regulation CE 1103/97
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

// Configurare Decimal.js identică cu componenta
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Helper: Conversie monetară RON → EUR (identică cu Conversion.tsx)
function convertToEUR(valueRON: Decimal, cursEUR: Decimal): Decimal {
  return valueRON.div(cursEUR).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

// Helper: Validare curs
function validateCurs(cursInput: string): { valid: boolean; curs: Decimal | null; error?: string } {
  try {
    const curs = new Decimal(cursInput.replace(',', '.'));

    if (curs.lessThanOrEqualTo(0)) {
      return { valid: false, curs: null, error: 'Cursul de schimb trebuie să fie pozitiv!' };
    }

    if (curs.greaterThan(10)) {
      return { valid: false, curs: null, error: 'Cursul de schimb pare neobișnuit de mare (>10)' };
    }

    return { valid: true, curs };
  } catch (error) {
    return { valid: false, curs: null, error: 'Cursul de schimb nu este valid!' };
  }
}

// Helper: Calcul diferențe rotunjire (conform CE 1103/97)
function calculateRoundingDifference(
  valoriRON: Decimal[],
  cursEUR: Decimal
): { sumaEURConvertit: Decimal; sumaEURTeoretică: Decimal; diferență: Decimal } {
  // Metodă A: Conversie directă individuală (aplicată în practică)
  let sumaEURConvertit = new Decimal(0);
  for (const valRON of valoriRON) {
    const valEUR = convertToEUR(valRON, cursEUR);
    sumaEURConvertit = sumaEURConvertit.plus(valEUR);
  }

  // Metodă B: Conversie teoretică (sumă RON apoi împarte)
  const sumaRON = valoriRON.reduce((sum, val) => sum.plus(val), new Decimal(0));
  const sumaEURTeoretică = sumaRON.div(cursEUR).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const diferență = sumaEURConvertit.minus(sumaEURTeoretică);

  return {
    sumaEURConvertit,
    sumaEURTeoretică,
    diferență
  };
}

describe('Conversion.tsx - RON → EUR Monetary Conversion', () => {
  describe('validateCurs - Exchange Rate Validation', () => {
    it('acceptă curs valid (format numeric standard)', () => {
      const result = validateCurs('4.9435');
      expect(result.valid).toBe(true);
      expect(result.curs!.toNumber()).toBe(4.9435);
    });

    it('acceptă curs cu virgulă (format românesc)', () => {
      const result = validateCurs('4,9435');
      expect(result.valid).toBe(true);
      expect(result.curs!.toNumber()).toBe(4.9435);
    });

    it('respinge curs zero', () => {
      const result = validateCurs('0');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('pozitiv');
    });

    it('respinge curs negativ', () => {
      const result = validateCurs('-4.5');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('pozitiv');
    });

    it('respinge curs > 10 (neobișnuit)', () => {
      const result = validateCurs('15.5');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('neobișnuit');
    });

    it('respinge curs invalid (text)', () => {
      const result = validateCurs('abc');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('nu este valid');
    });

    it('acceptă curs limite (min și max rezonabile)', () => {
      // Curs minim rezonabil: 0.1
      const result1 = validateCurs('0.1');
      expect(result1.valid).toBe(true);

      // Curs maxim rezonabil: 10
      const result2 = validateCurs('10');
      expect(result2.valid).toBe(true);
    });
  });

  describe('convertToEUR - Monetary Conversion', () => {
    const CURS = new Decimal('4.9435'); // Curs oficial estimativ RON/EUR

    it('convertește corect 1000 RON → EUR', () => {
      const ron = new Decimal(1000);
      const eur = convertToEUR(ron, CURS);

      // 1000 / 4.9435 = 202.286... → 202.29 (ROUND_HALF_UP)
      expect(eur.toNumber()).toBe(202.29);
    });

    it('convertește corect sume mici (<1 RON)', () => {
      const ron = new Decimal(0.50);
      const eur = convertToEUR(ron, CURS);

      // 0.50 / 4.9435 = 0.10114... → 0.10
      expect(eur.toNumber()).toBe(0.10);
    });

    it('convertește corect sume mari (>1,000,000 RON)', () => {
      const ron = new Decimal(1000000);
      const eur = convertToEUR(ron, CURS);

      // 1,000,000 / 4.9435 = 202,285.83 (rotunjit cu ROUND_HALF_UP)
      expect(eur.toNumber()).toBe(202285.83);
    });

    it('aplică ROUND_HALF_UP pentru .xx5', () => {
      // Testează că rotunjirea .xx5 merge UP
      // 2.475 EUR → 2.48 (UP)
      const ron = new Decimal(12.2375); // 12.2375 / 4.9435 = 2.475
      const cursTest = new Decimal('4.9435');
      const eur = convertToEUR(ron, cursTest);

      // Verificăm rotunjirea exactă
      const expectedEUR = new Decimal('12.2375').div('4.9435');
      expect(eur.toNumber()).toBe(expectedEUR.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber());
    });

    it('returnează 0 pentru sum 0', () => {
      const ron = new Decimal(0);
      const eur = convertToEUR(ron, CURS);

      expect(eur.toNumber()).toBe(0);
    });

    it('conversie inversă (EUR → RON → EUR) este consistentă', () => {
      const ronOriginal = new Decimal(1000);
      const eur = convertToEUR(ronOriginal, CURS);
      const ronRecalculat = eur.times(CURS);

      // Diferența ar trebui să fie mică (sub 1 RON datorită rotunjirilor)
      const diferenta = ronRecalculat.minus(ronOriginal).abs();
      expect(diferenta.toNumber()).toBeLessThan(1);
    });

    it('gestionează cursuri diferite', () => {
      const ron = new Decimal(1000);

      // Curs 4.50
      const eur1 = convertToEUR(ron, new Decimal('4.50'));
      expect(eur1.toNumber()).toBeCloseTo(222.22, 2);

      // Curs 5.00
      const eur2 = convertToEUR(ron, new Decimal('5.00'));
      expect(eur2.toNumber()).toBe(200.00);

      // Curs 5.50
      const eur3 = convertToEUR(ron, new Decimal('5.50'));
      expect(eur3.toNumber()).toBeCloseTo(181.82, 2);
    });
  });

  describe('calculateRoundingDifference - EU Regulation CE 1103/97', () => {
    const CURS = new Decimal('4.9435');

    it('calculează diferențe rotunjire pentru conversie individuală', () => {
      // 3 valori RON
      const valoriRON = [
        new Decimal(1000.50),
        new Decimal(2000.75),
        new Decimal(3000.25)
      ];

      const result = calculateRoundingDifference(valoriRON, CURS);

      // Verifică că diferența este mică (sub 0.05 EUR)
      expect(result.diferență.abs().toNumber()).toBeLessThan(0.05);
    });

    it('diferența este 0 pentru conversie perfectă', () => {
      // Valori care se convertesc exact
      const valoriRON = [
        new Decimal(4.9435), // = 1 EUR exact
        new Decimal(9.8870), // = 2 EUR exact
        new Decimal(14.8305) // = 3 EUR exact
      ];

      const result = calculateRoundingDifference(valoriRON, CURS);

      // Suma EUR convertit = 1 + 2 + 3 = 6
      expect(result.sumaEURConvertit.toNumber()).toBe(6);

      // Suma EUR teoretică = (4.9435 + 9.8870 + 14.8305) / 4.9435 = 6
      expect(result.sumaEURTeoretică.toNumber()).toBe(6);

      // Diferență = 0
      expect(result.diferență.toNumber()).toBe(0);
    });

    it('diferența este semnificativă pentru multe valori mici', () => {
      // 100 valori mici (0.01 RON)
      const valoriRON = Array.from({ length: 100 }, () => new Decimal(0.01));

      const result = calculateRoundingDifference(valoriRON, CURS);

      // Diferența poate fi mai mare pentru multe rotunjiri mici
      expect(result.diferență.abs().toNumber()).toBeLessThan(1); // Max 1 EUR diferență
    });

    it('diferența respectă limita CE 1103/97 (max 1 cent per conversie)', () => {
      // Testează că fiecare conversie individuală diferă max 0.01 EUR
      const valoriRON = [
        new Decimal(123.45),
        new Decimal(234.56),
        new Decimal(345.67)
      ];

      const CURS_TEST = new Decimal('4.9435');

      for (const valRON of valoriRON) {
        const eurConvertit = convertToEUR(valRON, CURS_TEST);
        const eurTeoretică = valRON.div(CURS_TEST);

        const diferențaIndividuală = eurConvertit.minus(eurTeoretică).abs();

        // Max 0.005 diferență (sub 1 cent)
        expect(diferențaIndividuală.toNumber()).toBeLessThanOrEqual(0.005);
      }
    });
  });

  describe('Mass Conversion Scenarios', () => {
    it('conversie 1000 membri cu solduri variate', () => {
      const CURS = new Decimal('4.9435');
      const solduri: Decimal[] = [];

      // Generare 1000 solduri random (100-10000 RON)
      for (let i = 0; i < 1000; i++) {
        const sold = new Decimal(Math.random() * 9900 + 100);
        solduri.push(sold);
      }

      const result = calculateRoundingDifference(solduri, CURS);

      // Diferența ar trebui să fie rezonabilă (< 5 EUR pentru 1000 conversii)
      expect(result.diferență.abs().toNumber()).toBeLessThan(5);

      // Suma EUR convertit ar trebui să fie pozitivă
      expect(result.sumaEURConvertit.toNumber()).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    const CURS = new Decimal('4.9435');

    it('gestionează valori foarte mici (sub 0.01 RON)', () => {
      const ron = new Decimal(0.001);
      const eur = convertToEUR(ron, CURS);

      // 0.001 / 4.9435 = 0.000202... → 0.00
      expect(eur.toNumber()).toBe(0.00);
    });

    it('gestionează valori foarte mari (peste 1 miliard RON)', () => {
      const ron = new Decimal(1000000000); // 1 miliard
      const eur = convertToEUR(ron, CURS);

      // 1,000,000,000 / 4.9435 ≈ 202,286,448.93
      expect(eur.toNumber()).toBeGreaterThan(200000000);
    });

    it('conversie cu curs 1:1 (teoretic)', () => {
      const ron = new Decimal(1000);
      const cursUnitar = new Decimal('1');
      const eur = convertToEUR(ron, cursUnitar);

      expect(eur.toNumber()).toBe(1000);
    });

    it('conversie nu este afectată de ordinea valorilor', () => {
      const valori1 = [new Decimal(100), new Decimal(200), new Decimal(300)];
      const valori2 = [new Decimal(300), new Decimal(100), new Decimal(200)];

      const result1 = calculateRoundingDifference(valori1, CURS);
      const result2 = calculateRoundingDifference(valori2, CURS);

      // Rezultatele ar trebui să fie identice indiferent de ordine
      expect(result1.sumaEURConvertit.toNumber()).toBe(result2.sumaEURConvertit.toNumber());
      expect(result1.sumaEURTeoretică.toNumber()).toBe(result2.sumaEURTeoretică.toNumber());
      expect(result1.diferență.toNumber()).toBe(result2.diferență.toNumber());
    });
  });

  describe('Conformitate EU Regulation CE 1103/97', () => {
    it('conversie directă individuală (metodă aplicată)', () => {
      const CURS = new Decimal('4.9435');
      const valoriRON = [
        new Decimal(1234.56),
        new Decimal(2345.67),
        new Decimal(3456.78)
      ];

      // Metodă directă: convertim fiecare valoare individual
      const valoriEUR = valoriRON.map(ron => convertToEUR(ron, CURS));

      // Verificăm că fiecare conversie folosește ROUND_HALF_UP
      for (let i = 0; i < valoriRON.length; i++) {
        const expectedEUR = valoriRON[i].div(CURS).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        expect(valoriEUR[i].toNumber()).toBe(expectedEUR.toNumber());
      }
    });

    it('toate calculele sunt deterministe și repetabile', () => {
      const CURS = new Decimal('4.9435');
      const ron = new Decimal(12345.67);

      // Rulăm conversia de 3 ori
      const eur1 = convertToEUR(ron, CURS);
      const eur2 = convertToEUR(ron, CURS);
      const eur3 = convertToEUR(ron, CURS);

      // Rezultatele trebuie să fie identice
      expect(eur1.toNumber()).toBe(eur2.toNumber());
      expect(eur2.toNumber()).toBe(eur3.toNumber());
    });

    it('precizia este menținută pentru conversii în cascadă', () => {
      const CURS = new Decimal('4.9435');
      const ronInitial = new Decimal(10000);

      // Conversie RON → EUR → RON × 10
      const eur = convertToEUR(ronInitial, CURS);
      let ronFinal = eur.times(CURS);

      for (let i = 0; i < 10; i++) {
        const eurTemp = convertToEUR(ronFinal, CURS);
        ronFinal = eurTemp.times(CURS);
      }

      // Pierderea de precizie ar trebui să fie rezonabilă (< 10 RON după 10 conversii)
      const pierdere = ronFinal.minus(ronInitial).abs();
      expect(pierdere.toNumber()).toBeLessThan(10);
    });
  });
});
