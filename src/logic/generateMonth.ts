// src/logic/generateMonth.ts
import Decimal from "decimal.js";
import type { Database, QueryExecResult } from "sql.js";

export type ProgressFn = (msg: string) => void;

export interface GenerateParams {
  depcredDb: Database;   // DEPCRED.db   (read-write, deja încărcat în sql.js)
  membriiDb: Database;   // MEMBRII.db   (read-only)
  lichidatiDb?: Database; // LICHIDATI.db (opțional)
  activiDb?: Database;    // ACTIVI.db    (pt dividende, opțional)
  targetMonth: number;   // 1..12
  targetYear: number;    // ex: 2025
  loanInterestOnExtinctionPermille?: number; // default 4‰ => 0.004
  onProgress?: ProgressFn;
}

export interface GenerateSummary {
  targetMonth: number;
  targetYear: number;
  activeMembers: number;
  generatedRows: number;
  skippedMissingSource: number;
  skippedErrors: number;
  totalLoanInterestCount: number;
  totalLoanInterestSum: number;
  totalLoanBalanceNew: number;
  totalDepositBalanceNew: number;
}

const D = (v: any) => new Decimal(String(v ?? "0"));

function q1(db: Database, sql: string, params: any[] = []): any[] {
  const res: QueryExecResult[] = db.exec(sql, params);
  return res.length ? res[0].values : [];
}

function qval(db: Database, sql: string, params: any[] = []): any {
  const rows = q1(db, sql, params);
  return rows.length ? rows[0][0] : null;
}

function monthExists(depcredDb: Database, m: number, y: number): boolean {
  const v = qval(depcredDb,
    "SELECT 1 FROM depcred WHERE luna=? AND anul=? LIMIT 1",
    [m, y]
  );
  return v !== null;
}

export function deleteMonth(depcredDb: Database, m: number, y: number) {
  depcredDb.run("DELETE FROM depcred WHERE luna=? AND anul=?", [m, y]);
}

function getDividendForMember(activiDb: Database | undefined, nr_fisa: number): Decimal {
  if (!activiDb) return D(0);
  const v = qval(activiDb, "SELECT DIVIDEND FROM activi WHERE NR_FISA = ?", [nr_fisa]);
  try { return D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP); } catch { return D(0); }
}

function getInheritedLoanRate(depcredDb: Database, nr_fisa: number, sourcePeriodVal: number, log?: ProgressFn): Decimal {
  const sourceYear = Math.floor(sourcePeriodVal / 100);
  const sourceMonth = sourcePeriodVal % 100;
  const row = q1(
    depcredDb,
    "SELECT impr_deb, impr_cred FROM depcred WHERE nr_fisa=? AND anul=? AND luna=?",
    [nr_fisa, sourceYear, sourceMonth]
  );
  if (!row.length) {
    log?.(`⚠️ Lipsă date M-1 pt fișa ${nr_fisa}`);
    return D(0);
  }
  const impr_deb = D(row[0][0]);
  if (impr_deb.gt(0)) return D(0); // împrumut nou în M-1 → nu moștenim rată
  try {
    return D(row[0][1]).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } catch {
    return D(0);
  }
}

function resetPrimaForSource(depcredDb: Database, sourceMonth: number, sourceYear: number) {
  depcredDb.run("UPDATE depcred SET prima=0 WHERE luna=? AND anul=?", [sourceMonth, sourceYear]);
}

function readLichidatiSet(lichidatiDb?: Database): Set<number> {
  if (!lichidatiDb) return new Set();
  const tExists = qval(
    lichidatiDb,
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='lichidati'"
  );
  if (tExists === null) return new Set();
  const rows = q1(lichidatiDb, "SELECT nr_fisa FROM lichidati");
  return new Set(rows.map(r => Number(r[0])));
}

function readActiveMembersWithCotizatie(membriiDb: Database, lichidati: Set<number>, log?: ProgressFn) {
  // verifică existența COTIZATIE_STANDARD
  const cols = q1(membriiDb, "PRAGMA table_info(membrii)").map(r => String(r[1]).toLowerCase());
  if (!cols.includes("cotizatie_standard")) {
    throw new Error("Coloana 'COTIZATIE_STANDARD' lipsește din 'membrii'.");
  }
  const rows = q1(
    membriiDb,
    "SELECT nr_fisa, NUM_PREN, COTIZATIE_STANDARD FROM membrii WHERE nr_fisa IS NOT NULL"
  );
  const out: Array<{ nr_fisa: number; nume: string; cot: Decimal }> = [];
  for (const r of rows) {
    const nr = Number(r[0]);
    if (lichidati.has(nr)) continue;
    const nume = String(r[1] ?? "N/A").trim();
    let cot = D(r[2]);
    try { cot = cot.toDecimalPlaces(2, Decimal.ROUND_HALF_UP); } catch { cot = D(0); }
    out.push({ nr_fisa: nr, nume, cot });
  }
  log?.(`✅ Identificat ${out.length} membri activi.`);
  return out;
}

function sumImprSoldBetween(depcredDb: Database, nr_fisa: number, startYYMM: number, endYYMM: number): Decimal {
  const v = qval(
    depcredDb,
    "SELECT SUM(impr_sold) FROM depcred WHERE nr_fisa=? AND (anul*100+luna BETWEEN ? AND ?) AND impr_sold>0",
    [nr_fisa, startYYMM, endYYMM]
  );
  return D(v);
}

function lastStartPeriodWithLoan(depcredDb: Database, nr_fisa: number, maxYYMM: number): number | null {
  const v = qval(
    depcredDb,
    "SELECT MAX(anul*100+luna) FROM depcred WHERE nr_fisa=? AND impr_deb>0 AND (anul*100+luna <= ?)",
    [nr_fisa, maxYYMM]
  );
  return v === null ? null : Number(v);
}

export function generateMonth(params: GenerateParams): GenerateSummary {
  const {
    depcredDb, membriiDb, lichidatiDb, activiDb,
    targetMonth, targetYear,
    loanInterestOnExtinctionPermille = 4, // 4‰
    onProgress
  } = params;

  const log = onProgress ?? (() => {});
  const rateExt = new Decimal(loanInterestOnExtinctionPermille).div(1000); // ex: 4‰ => 0.004

  // calc sursă (M-1)
  const sourceMonth = targetMonth > 1 ? targetMonth - 1 : 12;
  const sourceYear = targetMonth > 1 ? targetYear : targetYear - 1;
  const sourceYYMM = sourceYear * 100 + sourceMonth;
  if (sourceYear <= 0) throw new Error(`An sursă invalid pentru ${targetMonth}-${targetYear}`);

  log(`--- Generare ${String(targetMonth).padStart(2, "0")}-${targetYear} (Sursa: ${String(sourceMonth).padStart(2, "0")}-${sourceYear}) ---`);

  // precondiții
  // 1) lichidați
  const lichidatiSet = readLichidatiSet(lichidatiDb);
  // 2) membri activi
  const membri = readActiveMembersWithCotizatie(membriiDb, lichidatiSet, log);
  if (!membri.length) {
    log("⚠️ Nu există membri activi.");
    return {
      targetMonth, targetYear,
      activeMembers: 0, generatedRows: 0,
      skippedMissingSource: 0, skippedErrors: 0,
      totalLoanInterestCount: 0, totalLoanInterestSum: 0,
      totalLoanBalanceNew: 0, totalDepositBalanceNew: 0
    };
  }

  // reset prima=0 în M-1
  resetPrimaForSource(depcredDb, sourceMonth, sourceYear);

  // dacă luna țintă există deja, NU suprascriem aici; lăsăm UI să decidă (deleteMonth() înainte)
  if (monthExists(depcredDb, targetMonth, targetYear)) {
    throw new Error(`Luna ${targetMonth}-${targetYear} există deja în DEPCRED.`);
  }

  let generated = 0;
  let skippedMissing = 0;
  let skippedErr = 0;
  let totalDobCount = 0;
  let totalDobSum = D(0);
  let totalImprSoldNew = D(0);
  let totalDepSoldNew = D(0);

  log(`📊 Procesare ${membri.length} membri...`);

  // pregătim INSERT statement via exec (sql.js nu are prepare performant nativ, e ok așa pentru început)
  for (let i = 0; i < membri.length; i++) {
    const { nr_fisa, nume, cot } = membri[i];
    if ((i + 1) % 25 === 0) log(`... ${i + 1}/${membri.length}`);

    try {
      // 1) citim M-1 pentru solduri
      const src = q1(
        depcredDb,
        "SELECT impr_sold, dep_sold FROM depcred WHERE nr_fisa=? AND luna=? AND anul=?",
        [nr_fisa, sourceMonth, sourceYear]
      );
      if (!src.length) {
        skippedMissing++;
        continue;
      }
      const impr_sold_src = D(src[0][0]);
      const dep_sold_src = D(src[0][1]);

      // 2) inițializări
      let impr_deb_nou = D(0);     // se va completa din "sume lunare" în alte module; aici 0
      let dep_cred_nou = D(0);     // idem

      // rate moștenită + cotizație
      let impr_cred_nou = getInheritedLoanRate(depcredDb, nr_fisa, sourceYYMM, log);
      let dep_deb_nou = cot;

      // dividend ianuarie
      if (targetMonth === 1) {
        const div = getDividendForMember(activiDb, nr_fisa);
        if (div.gt(0)) {
          log(`💰 Fișa ${nr_fisa} (${nume}): Cotizație=${cot.toFixed(2)}, Dividend=${div.toFixed(2)}, Total=${cot.plus(div).toFixed(2)}`);
          dep_deb_nou = dep_deb_nou.plus(div);
        }
      }

      // nu plătim mai mult decât soldul
      if (impr_sold_src.lte(0.005)) {
        impr_cred_nou = D(0);
      } else {
        impr_cred_nou = Decimal.min(impr_sold_src, impr_cred_nou);
      }

      // 3) calcul solduri noi
      const impr_sold_new_calc = impr_sold_src.plus(impr_deb_nou).minus(impr_cred_nou);
      const impr_sold_new = impr_sold_new_calc.lte(0.005) ? D(0) : impr_sold_new_calc;
      const dep_sold_new = dep_sold_src.plus(dep_deb_nou).minus(dep_cred_nou);

      // 4) dobândă la stingere dacă sold >0 → 0
      let dobanda_noua = D(0);
      if (impr_sold_src.gt(0.005) && impr_sold_new.eq(0)) {
        const startYYMM = lastStartPeriodWithLoan(depcredDb, nr_fisa, sourceYYMM);
        if (startYYMM) {
          const sumBalances = sumImprSoldBetween(depcredDb, nr_fisa, startYYMM, sourceYYMM);
          if (sumBalances.gt(0)) {
            dobanda_noua = sumBalances.times(rateExt).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
            totalDobSum = totalDobSum.plus(dobanda_noua);
            totalDobCount++;
            const sm = String(startYYMM % 100).padStart(2, "0");
            const sy = Math.floor(startYYMM / 100);
            log(`💸 Fișa ${nr_fisa} (${nume}): Dobândă=${dobanda_noua.toFixed(2)} (sumă sold ${sumBalances.toFixed(2)}, ${sm}-${sy} → ${String(sourceMonth).padStart(2, "0")}-${sourceYear})`);
          }
        }
      }

      // 5) INSERT în luna țintă
      depcredDb.run(
        "INSERT INTO depcred (nr_fisa, luna, anul, dobanda, impr_deb, impr_cred, impr_sold, dep_deb, dep_cred, dep_sold, prima) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        [
          nr_fisa,
          targetMonth, targetYear,
          Number(dobanda_noua),
          0, Number(impr_cred_nou),
          Number(impr_sold_new),
          Number(dep_deb_nou), 0,
          Number(dep_sold_new)
        ]
      );

      generated++;
      totalImprSoldNew = totalImprSoldNew.plus(impr_sold_new);
      totalDepSoldNew = totalDepSoldNew.plus(dep_sold_new);

      // log de progres la câțiva membri
      if (targetMonth !== 1 && !(impr_sold_src.gt(0.005) && impr_sold_new.eq(0))) {
        if (i < 10 || i % 50 === 0) {
          log(`👤 Fișa ${nr_fisa} (${nume}): Cotizație=${dep_deb_nou.toFixed(2)}, Împr.Sold=${impr_sold_new.toFixed(2)}, Dep.Sold=${dep_sold_new.toFixed(2)}`);
        }
      }
    } catch (e) {
      skippedErr++;
      // continuăm cu următorul membru
    }
  }

  log("✅ Date generate. Rezumat încheiere.");

  return {
    targetMonth,
    targetYear,
    activeMembers: membri.length,
    generatedRows: generated,
    skippedMissingSource: skippedMissing,
    skippedErrors: skippedErr,
    totalLoanInterestCount: totalDobCount,
    totalLoanInterestSum: Number(totalDobSum.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)),
    totalLoanBalanceNew: Number(totalImprSoldNew.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)),
    totalDepositBalanceNew: Number(totalDepSoldNew.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)),
  };
}
