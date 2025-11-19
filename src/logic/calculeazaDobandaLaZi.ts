// src/logic/calculeazaDobandaLaZi.ts
/**
 * Logică de business pentru calculul dobânzii la zi
 *
 * FUNCȚIONALITĂȚI:
 * - Determină perioada de calcul (de la ultimul împrumut sau sold zero)
 * - Sumează soldurile pozitive din perioadă
 * - Aplică rata dobânzii cu ROUND_HALF_UP
 *
 * REGULĂ:
 * - Perioada START = max(ultima_lună_cu_împrumut, ultima_lună_cu_sold_zero)
 * - Logică specială: dacă în luna cu ultimul împrumut există dobândă și împrumut concomitent,
 *   START = luna_cu_împrumut; altfel, START = ultima_lună_cu_sold_zero înainte
 */

import Decimal from "decimal.js";
import type { DBSet } from "../services/databaseManager";
import { getActiveDB } from "../services/databaseManager";

// Configurare Decimal.js
Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export interface CalcDobandaResult {
  dobanda: Decimal;
  start_period: number;
  suma_solduri: Decimal;
}

/**
 * Calculează dobânda la zi pentru un membru și perioadă
 *
 * @param databases - Set de baze de date
 * @param nr_fisa - Numărul de fișă al membrului
 * @param end_luna - Luna finală (1-12)
 * @param end_anul - Anul final
 * @param rata_dobanda - Rata dobânzii (ex: 0.004 pentru 0.4%)
 * @returns Obiect cu dobânda calculată, perioada start și suma soldurilor
 */
export function calculeazaDobandaLaZi(
  databases: DBSet,
  nr_fisa: number,
  end_luna: number,
  end_anul: number,
  rata_dobanda: Decimal
): CalcDobandaResult {
  try {
    const dbDepcred = getActiveDB(databases, 'depcred');
    const end_period_val = end_anul * 100 + end_luna;

    // ========================================
    // PASUL 1: Determină perioada START
    // ========================================

    // 1.1: Găsește ultima lună cu împrumut acordat (impr_deb > 0)
    const resultLastLoan = dbDepcred.exec(`
      SELECT MAX(anul * 100 + luna) as max_period
      FROM depcred
      WHERE nr_fisa = ? AND impr_deb > 0 AND (anul * 100 + luna) <= ?
    `, [nr_fisa, end_period_val]);

    if (resultLastLoan.length === 0 || !resultLastLoan[0].values[0][0]) {
      // Nu există împrumuturi acordate
      return {
        dobanda: new Decimal("0"),
        start_period: 0,
        suma_solduri: new Decimal("0")
      };
    }

    const last_loan_period = resultLastLoan[0].values[0][0] as number;

    // 1.2: Verifică dacă în luna cu ultimul împrumut există dobândă și împrumut nou concomitent
    const resultConcomitent = dbDepcred.exec(`
      SELECT dobanda, impr_deb
      FROM depcred
      WHERE nr_fisa = ? AND (anul * 100 + luna) = ?
    `, [nr_fisa, last_loan_period]);

    let start_period_val = last_loan_period;

    if (resultConcomitent.length > 0 && resultConcomitent[0].values.length > 0) {
      const row = resultConcomitent[0].values[0];
      const dobanda = new Decimal(String(row[0] || "0"));
      const impr_deb = new Decimal(String(row[1] || "0"));

      // Dacă NU există dobândă și împrumut nou concomitent
      if (!(dobanda.greaterThan(0) && impr_deb.greaterThan(0))) {
        // Caută ultima lună cu sold zero (≤ 0.005) ÎNAINTE de ultimul împrumut
        const resultLastZero = dbDepcred.exec(`
          SELECT MAX(anul * 100 + luna) as max_zero_period
          FROM depcred
          WHERE nr_fisa = ?
            AND impr_sold <= 0.005
            AND (anul * 100 + luna) < ?
        `, [nr_fisa, last_loan_period]);

        if (resultLastZero.length > 0 && resultLastZero[0].values[0][0]) {
          start_period_val = resultLastZero[0].values[0][0] as number;
        }
      }
    }

    // ========================================
    // PASUL 2: Sumează TOATE soldurile pozitive din perioada
    // ========================================

    const resultSum = dbDepcred.exec(`
      SELECT SUM(impr_sold) as total_balances
      FROM depcred
      WHERE nr_fisa = ?
        AND (anul * 100 + luna) BETWEEN ? AND ?
        AND impr_sold > 0
    `, [nr_fisa, start_period_val, end_period_val]);

    if (resultSum.length === 0 || !resultSum[0].values[0][0]) {
      return {
        dobanda: new Decimal("0"),
        start_period: start_period_val,
        suma_solduri: new Decimal("0")
      };
    }

    const sum_of_balances = new Decimal(String(resultSum[0].values[0][0]));

    // ========================================
    // PASUL 3: Aplică rata dobânzii
    // ========================================

    const dobanda_calculata = sum_of_balances
      .times(rata_dobanda)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      dobanda: dobanda_calculata,
      start_period: start_period_val,
      suma_solduri: sum_of_balances
    };

  } catch (error) {
    console.error(`Eroare calcul dobândă pentru ${nr_fisa}:`, error);
    throw error;
  }
}

/**
 * Helper pentru formatare lună-an din period value
 * @param period - Valoare perioadă (ex: 202501 = Ianuarie 2025)
 * @returns String formatat (ex: "Ian 2025")
 */
export function formatPeriod(period: number): string {
  const anul = Math.floor(period / 100);
  const luna = period % 100;
  const luniRomana = [
    "Ian", "Feb", "Mar", "Apr", "Mai", "Iun",
    "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  return `${luniRomana[luna - 1]} ${anul}`;
}

/**
 * Calculează numărul de luni între două perioade
 * @param start_period - Perioada start (ex: 202501)
 * @param end_period - Perioada end (ex: 202506)
 * @returns Număr de luni (inclusiv ambele capete)
 */
export function calculeazaNrLuni(start_period: number, end_period: number): number {
  const start_anul = Math.floor(start_period / 100);
  const start_luna = start_period % 100;
  const end_anul = Math.floor(end_period / 100);
  const end_luna = end_period % 100;

  return (end_anul - start_anul) * 12 + (end_luna - start_luna) + 1;
}
