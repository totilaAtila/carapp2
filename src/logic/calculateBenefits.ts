// src/logic/calculateBenefits.ts
/**
 * Logică de business pentru calculul beneficiilor (dividendelor) anuale
 *
 * FUNCȚIONALITĂȚI:
 * - Calculează distribuția profitului anual către membri eligibili
 * - Formula: B = (P / S_total) × S_member (unde P = profit, S = suma soldurilor)
 * - Exclude membri lichidați
 * - Validare sold decembrie > 0 pentru eligibilitate
 * - Scrie rezultate în baza ACTIVI
 *
 * REGULĂ:
 * Doar membrii cu sold pozitiv în DECEMBRIE sunt eligibili pentru beneficii
 */

import Decimal from "decimal.js";
import type { Database } from "sql.js";

// Configurare Decimal.js
Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export interface MemberBenefit {
  nrFisa: number;
  numPren: string;
  depSoldDec: Decimal;
  sumaSolduriLunare: Decimal;
  beneficiu: Decimal;
}

export interface CalculateBenefitsResult {
  members: MemberBenefit[];
  S_total: Decimal;
  missingNames: number[];
}

/**
 * Calculează beneficiile (dividendele) pentru membrii eligibili
 *
 * @param membriiDb - Baza de date MEMBRII (pentru nume)
 * @param depcredDb - Baza de date DEPCRED (pentru solduri)
 * @param activiDb - Baza de date ACTIVI (pentru scriere rezultate)
 * @param selectedYear - Anul pentru care se calculează beneficiile
 * @param profit - Profitul total de distribuit
 * @param lichidatiDb - Baza de date LICHIDATI (optional, pentru excludere)
 * @returns Obiect cu membri, S_total și liste de avertizări
 */
export function calculateBenefits(
  membriiDb: Database,
  depcredDb: Database,
  activiDb: Database,
  selectedYear: number,
  profit: Decimal,
  lichidatiDb?: Database
): CalculateBenefitsResult {
  // Build member name map from MEMBRII
  const memberNameMap = new Map<number, string>();
  try {
    const membriiResult = membriiDb.exec("SELECT NR_FISA, NUM_PREN FROM MEMBRII");
    if (membriiResult.length > 0) {
      for (const row of membriiResult[0].values) {
        memberNameMap.set(row[0] as number, (row[1] as string || "").trim());
      }
    }
  } catch (err) {
    console.warn("Could not load member names from MEMBRII:", err);
  }

  // Build liquidated members set
  const liquidatedMembers = new Set<number>();
  if (lichidatiDb) {
    try {
      const lichidatiResult = lichidatiDb.exec("SELECT NR_FISA FROM LICHIDATI");
      if (lichidatiResult.length > 0) {
        for (const row of lichidatiResult[0].values) {
          liquidatedMembers.add(row[0] as number);
        }
      }
    } catch (err) {
      // LICHIDATI database optional
    }
  }

  // Calculate member balances
  // IMPORTANT: Only members with positive balance in DECEMBER are eligible
  const membersQuery = `
    SELECT
      NR_FISA,
      SUM(DEP_SOLD) as SUMA_SOLDURI_LUNARE,
      MAX(CASE WHEN LUNA = 12 THEN DEP_SOLD ELSE 0 END) as SOLD_DECEMBRIE
    FROM DEPCRED
    WHERE ANUL = ${selectedYear} AND DEP_SOLD > 0
    GROUP BY NR_FISA
    HAVING SUM(DEP_SOLD) > 0 AND MAX(CASE WHEN LUNA = 12 THEN DEP_SOLD ELSE 0 END) > 0
  `;

  const membersResult = depcredDb.exec(membersQuery);

  if (membersResult.length === 0 || membersResult[0].values.length === 0) {
    throw new Error(`Nu s-au găsit membri cu solduri pozitive în ${selectedYear}.`);
  }

  // Calculate S_total
  let S_total = new Decimal(0);
  const membersData: MemberBenefit[] = [];
  const missingNames: number[] = [];

  for (const row of membersResult[0].values) {
    const nrFisa = row[0] as number;

    // Skip liquidated members
    if (liquidatedMembers.has(nrFisa)) {
      continue;
    }

    const sumaSolduri = new Decimal(String(row[1]));
    const soldDecembrie = new Decimal(String(row[2]));
    const storedName = memberNameMap.get(nrFisa);

    if (!storedName) {
      missingNames.push(nrFisa);
    }

    const numPren = storedName ?? `Fișa ${nrFisa}`;

    S_total = S_total.plus(sumaSolduri);

    membersData.push({
      nrFisa,
      numPren,
      depSoldDec: soldDecembrie,
      sumaSolduriLunare: sumaSolduri,
      beneficiu: new Decimal(0)
    });
  }

  if (S_total.lte(0)) {
    throw new Error('Suma totală a soldurilor este zero sau negativă.');
  }

  // Clear and populate ACTIVI
  activiDb.run("DELETE FROM ACTIVI");

  // Calculate benefits: B = (P / S_total) × S_member
  const calculatedMembers: MemberBenefit[] = [];

  for (const member of membersData) {
    const beneficiu = profit
      .div(S_total)
      .mul(member.sumaSolduriLunare)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    member.beneficiu = beneficiu;
    calculatedMembers.push(member);

    // Insert into ACTIVI
    activiDb.run(
      `INSERT INTO ACTIVI (NR_FISA, NUM_PREN, DEP_SOLD, DIVIDEND) VALUES (?, ?, ?, ?)`,
      [member.nrFisa, member.numPren, member.depSoldDec.toNumber(), beneficiu.toNumber()]
    );
  }

  return {
    members: calculatedMembers,
    S_total,
    missingNames
  };
}
