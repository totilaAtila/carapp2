// src/logic/finance.test.ts
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { calcDobanda, calcSoldNou, convertValuta } from './finance';

describe('finance.ts - Financial Calculations', () => {
  describe('calcDobanda', () => {
    it('calculează corect dobânda pentru rate standard', () => {
      // Test cu rată 0.4% (4‰)
      const dobanda = calcDobanda(1000, 0.004);
      expect(dobanda).toBe(4.00);
    });

    it('calculează corect pentru sume mari', () => {
      // Test cu sumă mare și rată mică
      const dobanda = calcDobanda(100000, 0.004);
      expect(dobanda).toBe(400.00);
    });

    it('returnează 0 pentru principal 0', () => {
      const dobanda = calcDobanda(0, 0.004);
      expect(dobanda).toBe(0);
    });

    it('returnează 0 pentru rată 0', () => {
      const dobanda = calcDobanda(1000, 0);
      expect(dobanda).toBe(0);
    });

    it('aplică ROUND_HALF_UP corect pentru .xx5', () => {
      // Testează rotunjirea conform EU Regulation CE 1103/97
      // Exemplu: 10.005 → 10.01 (ROUND_HALF_UP)

      // Principal = 2512.50, Rate = 0.004 → 10.05
      const dobanda1 = calcDobanda(2512.50, 0.004);
      expect(dobanda1).toBe(10.05);

      // Principal = 1.25, Rate = 0.004 → 0.005 → 0.01 (ROUND_HALF_UP)
      const dobanda2 = calcDobanda(1.25, 0.004);
      expect(dobanda2).toBe(0.01);

      // Principal = 1.24, Rate = 0.004 → 0.00496 → 0.00 (sub .005)
      const dobanda3 = calcDobanda(1.24, 0.004);
      expect(dobanda3).toBe(0.00);
    });

    it('nu folosește floating-point arithmetic', () => {
      // Test pentru a verifica că folosim Decimal.js
      // JavaScript floating-point: 0.1 + 0.2 !== 0.3
      // Decimal.js: 0.1 + 0.2 === 0.3

      const principal = 333.33;
      const rate = 0.003; // 0.3%
      const dobanda = calcDobanda(principal, rate);

      // Verificăm că rezultatul este exact și rotunjit corect
      const expectedDecimal = new Decimal(principal)
        .times(rate)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      expect(dobanda).toBe(expectedDecimal.toNumber());
      expect(dobanda).toBe(1.00); // 333.33 * 0.003 = 0.99999 → 1.00
    });

    it('gestionează corect sume foarte mici', () => {
      // Test pentru sume sub 1 leu
      const dobanda = calcDobanda(0.50, 0.004);
      expect(dobanda).toBe(0.00); // 0.002 → 0.00
    });

    it('gestionează corect sume foarte mari', () => {
      // Test pentru sume peste 1 milion
      const dobanda = calcDobanda(1_000_000, 0.004);
      expect(dobanda).toBe(4000.00);
    });

    it('calculează corect pentru rate variabile', () => {
      const principal = 5000;

      // Rată 0.2% (2‰)
      expect(calcDobanda(principal, 0.002)).toBe(10.00);

      // Rată 0.4% (4‰)
      expect(calcDobanda(principal, 0.004)).toBe(20.00);

      // Rată 0.5% (5‰)
      expect(calcDobanda(principal, 0.005)).toBe(25.00);

      // Rată 1% (10‰)
      expect(calcDobanda(principal, 0.01)).toBe(50.00);
    });
  });

  describe('calcSoldNou', () => {
    it('calculează corect soldul nou după adăugarea dobânzii', () => {
      const soldNou = calcSoldNou(1000, 0.004);
      expect(soldNou).toBe(1004.00);
    });

    it('returnează același principal pentru rată 0', () => {
      const soldNou = calcSoldNou(1000, 0);
      expect(soldNou).toBe(1000.00);
    });

    it('aplică ROUND_HALF_UP la rezultatul final', () => {
      // Principal = 1.25, Rate = 0.004
      // Dobândă = 0.005 → 0.01 (ROUND_HALF_UP)
      // Sold nou = 1.25 + 0.01 = 1.26
      const soldNou = calcSoldNou(1.25, 0.004);
      expect(soldNou).toBe(1.26);
    });

    it('gestionează corect sume mari', () => {
      const soldNou = calcSoldNou(100000, 0.004);
      expect(soldNou).toBe(100400.00);
    });

    it('nu folosește floating-point arithmetic', () => {
      // Test pentru a verifica precizia Decimal.js
      const soldNou = calcSoldNou(333.33, 0.003);

      const expectedDecimal = new Decimal(333.33)
        .plus(calcDobanda(333.33, 0.003))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      expect(soldNou).toBe(expectedDecimal.toNumber());
      expect(soldNou).toBe(334.33); // 333.33 + 1.00 = 334.33
    });
  });

  describe('convertValuta', () => {
    describe('RON → EUR', () => {
      it('convertește corect RON în EUR', () => {
        // Curs: 4.95 RON = 1 EUR
        const eurAmount = convertValuta(495, 4.95, 'RON_EUR');
        expect(eurAmount).toBe(100.00);
      });

      it('aplică ROUND_HALF_UP pentru conversie RON → EUR', () => {
        // 100 RON / 4.95 = 20.202020... → 20.20
        const eurAmount = convertValuta(100, 4.95, 'RON_EUR');
        expect(eurAmount).toBe(20.20);
      });

      it('gestionează sume mici în RON', () => {
        // 1 RON / 4.95 = 0.202020... → 0.20
        const eurAmount = convertValuta(1, 4.95, 'RON_EUR');
        expect(eurAmount).toBe(0.20);
      });

      it('gestionează sume mari în RON', () => {
        // 1,000,000 RON / 4.95 = 202,020.20
        const eurAmount = convertValuta(1_000_000, 4.95, 'RON_EUR');
        expect(eurAmount).toBe(202020.20);
      });
    });

    describe('EUR → RON', () => {
      it('convertește corect EUR în RON', () => {
        // Curs: 1 EUR = 4.95 RON
        const ronAmount = convertValuta(100, 4.95, 'EUR_RON');
        expect(ronAmount).toBe(495.00);
      });

      it('aplică ROUND_HALF_UP pentru conversie EUR → RON', () => {
        // 10.33 EUR * 4.95 = 51.1335 → 51.13
        const ronAmount = convertValuta(10.33, 4.95, 'EUR_RON');
        expect(ronAmount).toBe(51.13);
      });

      it('gestionează sume mici în EUR', () => {
        // 0.50 EUR * 4.95 = 2.475 → 2.48 (ROUND_HALF_UP)
        const ronAmount = convertValuta(0.50, 4.95, 'EUR_RON');
        expect(ronAmount).toBe(2.48);
      });

      it('gestionează sume mari în EUR', () => {
        // 100,000 EUR * 4.95 = 495,000.00
        const ronAmount = convertValuta(100_000, 4.95, 'EUR_RON');
        expect(ronAmount).toBe(495000.00);
      });
    });

    it('conversie bidirectională este consistentă', () => {
      // Test: RON → EUR → RON ar trebui să fie aproape identic
      const initialRon = 1000;
      const curs = 4.95;

      const eur = convertValuta(initialRon, curs, 'RON_EUR');
      const finalRon = convertValuta(eur, curs, 'EUR_RON');

      // Din cauza rotunjirilor, diferența ar trebui să fie max 0.01 RON
      expect(Math.abs(finalRon - initialRon)).toBeLessThanOrEqual(0.01);
    });

    it('nu folosește floating-point arithmetic', () => {
      // Test pentru precizie Decimal.js
      const eurAmount = convertValuta(100, 4.95, 'RON_EUR');

      const expectedDecimal = new Decimal(100)
        .div(4.95)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      expect(eurAmount).toBe(expectedDecimal.toNumber());
    });

    it('returnează 0 pentru sumă 0', () => {
      expect(convertValuta(0, 4.95, 'RON_EUR')).toBe(0);
      expect(convertValuta(0, 4.95, 'EUR_RON')).toBe(0);
    });
  });

  describe('Conformitate EU Regulation CE 1103/97', () => {
    it('toate calculele folosesc ROUND_HALF_UP', () => {
      // Testează că toate funcțiile aplică rotunjirea corectă

      // Test calcDobanda
      const dobanda = calcDobanda(2512.50, 0.004);
      expect(dobanda).toBe(10.05); // 10.05 exact, nu 10.04 sau 10.06

      // Test calcSoldNou
      const soldNou = calcSoldNou(2512.50, 0.004);
      expect(soldNou).toBe(2522.55); // 2512.50 + 10.05

      // Test convertValuta
      const eurAmount = convertValuta(495.005, 4.95, 'RON_EUR');
      expect(eurAmount).toBe(100.00); // 100.001 → 100.00 (sub .005)
    });

    it('calculele sunt deterministe și repetabile', () => {
      // Același input produce același output de fiecare dată
      const input = 12345.67;
      const rate = 0.004;

      const result1 = calcDobanda(input, rate);
      const result2 = calcDobanda(input, rate);
      const result3 = calcDobanda(input, rate);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe(49.38); // 12345.67 * 0.004 = 49.38268 → 49.38
    });

    it('precizia este menținută pentru calcule în cascadă', () => {
      // Test pentru mai multe calcule consecutive
      let principal = 1000;
      const rate = 0.004;

      // Simulare: 3 luni consecutive cu dobândă
      principal = calcSoldNou(principal, rate); // Luna 1: 1004.00
      expect(principal).toBe(1004.00);

      principal = calcSoldNou(principal, rate); // Luna 2: 1008.02
      expect(principal).toBe(1008.02);

      principal = calcSoldNou(principal, rate); // Luna 3: 1012.05
      expect(principal).toBe(1012.05);
    });
  });
});
