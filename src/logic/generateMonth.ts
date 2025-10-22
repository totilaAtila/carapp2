// src/logic/generateMonth.ts
import type { Database } from "sql.js";
import Decimal from "decimal.js";

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export interface GenerateOptions {
  depcredDb: Database;
  membriiDb: Database;
  lichidatiDb?: Database;
  activiDb?: Database;
  targetMonth: number;
  targetYear: number;
  onProgress?: (msg: string) => void;
}

type P = (m: string) => void;
const log = (p?: P, m?: string) => { if (p && m) p(m); };

const D0 = (v: any) => new Decimal(v || 0);
const Q2 = (v: any) => new Decimal(v || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const NEAR_ZERO = new Decimal("0.005");

function getLastPeriod(depcred: Database) {
  // ✅ CORECT: Preia ultima lună din DB (ca în Python), NU prima=1
  const r = depcred.exec("SELECT anul, luna FROM depcred ORDER BY anul DESC, luna DESC LIMIT 1;");
  if (!r.length || !r[0].values.length || r[0].values[0][0] == null) {
    throw new Error("Nu există date în DEPCRED.");
  }
  return { year: Number(r[0].values[0][0]), month: Number(r[0].values[0][1]) };
}

function getLichidatiSet(lichidati?: Database): Set<number> {
  const s = new Set<number>();
  if (!lichidati) return s;
  const r = lichidati.exec("SELECT NR_FISA FROM lichidati WHERE NR_FISA IS NOT NULL;");
  if (!r.length) return s;
  for (const v of r[0].values) {
    const nr = Number(v[0]);
    if (!Number.isNaN(nr)) s.add(nr);
  }
  return s;
}

function getMembri(membrii: Database) {
  const info = membrii.exec("PRAGMA table_info(membrii);");
  if (!info.length) throw new Error("Tabelul 'membrii' lipsește.");
  const cols = info[0].values.map(v => String(v[1]).toLowerCase());
  if (!cols.includes("cotizatie_standard")) {
    throw new Error("Coloana 'COTIZATIE_STANDARD' lipsește din 'membrii'.");
  }
  const r = membrii.exec("SELECT nr_fisa, NUM_PREN, COTIZATIE_STANDARD FROM membrii WHERE nr_fisa IS NOT NULL;");
  if (!r.length) return [];
  return r[0].values.map(v => ({
    nr_fisa: Number(v[0]),
    nume: String(v[1] ?? ""),
    cot: Q2(v[2])
  }));
}

function getSourceBalances(depcred: Database, nr_fisa: number, year: number, month: number) {
  const r = depcred.exec(
    "SELECT impr_sold, dep_sold FROM depcred WHERE nr_fisa=? AND anul=? AND luna=? LIMIT 1;",
    [nr_fisa, year, month]
  );
  if (!r.length || !r[0].values.length) return null;
  return {
    impr_sold: Q2(r[0].values[0][0]),
    dep_sold : Q2(r[0].values[0][1])
  };
}

function getInheritedLoanRate(depcred: Database, nr_fisa: number, year: number, month: number) {
  const r = depcred.exec(
    "SELECT impr_deb, impr_cred FROM depcred WHERE nr_fisa=? AND anul=? AND luna=? LIMIT 1;",
    [nr_fisa, year, month]
  );
  if (!r.length || !r[0].values.length) return Q2(0);
  const impr_deb = D0(r[0].values[0][0]);
  if (impr_deb.gt(0)) return Q2(0);
  return Q2(r[0].values[0][1]);
}

function getDividend(activi: Database | undefined, nr_fisa: number) {
  if (!activi) return Q2(0);
  const r = activi.exec("SELECT DIVIDEND FROM activi WHERE NR_FISA=? LIMIT 1;", [nr_fisa]);
  if (!r.length || !r[0].values.length || r[0].values[0][0] == null) return Q2(0);
  return Q2(r[0].values[0][0]);
}

function getLoanStart(depcred: Database, nr_fisa: number, yM1: number) {
  const r = depcred.exec(
    "SELECT MAX(anul*100+luna) FROM depcred WHERE nr_fisa=? AND impr_deb>0 AND (anul*100+luna)<=?;",
    [nr_fisa, yM1]
  );
  if (!r.length || !r[0].values.length || r[0].values[0][0] == null) return null;
  return Number(r[0].values[0][0]);
}

function calcExtinctionInterest(depcred: Database, nr_fisa: number, sourceYear: number, sourceMonth: number) {
  const yM1 = sourceYear * 100 + sourceMonth;
  const start = getLoanStart(depcred, nr_fisa, yM1);
  if (start == null) return Q2(0);
  const r = depcred.exec(
    "SELECT SUM(impr_sold) FROM depcred WHERE nr_fisa=? AND (anul*100+luna BETWEEN ? AND ?) AND impr_sold>0;",
    [nr_fisa, start, yM1]
  );
  const sumPos = Q2(r[0].values[0][0]);
  if (sumPos.lte(0)) return Q2(0);
  return Q2(sumPos.mul("0.004"));
}

function insertDepcredRow(
  depcred: Database,
  nr_fisa: number,
  y: number,
  m: number,
  dep_deb: Decimal,
  dep_cred: Decimal,
  dep_sold: Decimal,
  impr_deb: Decimal,
  impr_cred: Decimal,
  impr_sold: Decimal,
  dobanda: Decimal
) {
  depcred.run(
    "INSERT INTO depcred (nr_fisa, luna, anul, dobanda, impr_deb, impr_cred, impr_sold, dep_deb, dep_cred, dep_sold, prima) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);",
    [
      nr_fisa, m, y,
      Number(dobanda), Number(impr_deb), Number(impr_cred), Number(impr_sold),
      Number(dep_deb), Number(dep_cred), Number(dep_sold)
    ]
  );
}

function ensureTargetNotExists(depcred: Database, y: number, m: number) {
  const r = depcred.exec("SELECT 1 FROM depcred WHERE anul=? AND luna=? LIMIT 1;", [y, m]);
  if (r.length && r[0].values.length) {
    throw new Error(`Luna ${String(m).padStart(2,"0")}-${y} există deja în DEPCRED.`);
  }
}

function zeroizeIfNearZero(v: Decimal) {
  return v.abs().lte(NEAR_ZERO) ? Q2(0) : v;
}

export function generateMonth(opts: GenerateOptions) {
  const { depcredDb, membriiDb, lichidatiDb, activiDb, targetMonth, targetYear, onProgress } = opts;
  
  // ✅ CORECT: Calculăm sursa matematic (ca în Python), nu căutăm prima=1
  const sourceMonth = targetMonth > 1 ? targetMonth - 1 : 12;
  const sourceYear = targetMonth > 1 ? targetYear : targetYear - 1;
  
  if (sourceYear <= 0) {
    throw new Error(`An sursă invalid pentru ${String(targetMonth).padStart(2, "0")}-${targetYear}.`);
  }
  
  log(onProgress, `📅 Generare ${String(targetMonth).padStart(2,"0")}-${targetYear} (Sursă: ${String(sourceMonth).padStart(2,"0")}-${sourceYear})`);

  ensureTargetNotExists(depcredDb, targetYear, targetMonth);
  
  // ✅ Resetăm prima=0 pentru TOATE lunile, apoi setăm prima=1 pentru noua lună în INSERT
  depcredDb.run("UPDATE depcred SET prima=0 WHERE prima=1;");
  log(onProgress, `🔒 Reset prima=0 pentru lunile anterioare.`);

  const membri = getMembri(membriiDb);
  const lich = getLichidatiSet(lichidatiDb);
  log(onProgress, `✅ Membri activi: ${membri.length} | Lichidați excluși: ${lich.size}`);

  let cnt = 0;
  let S_dep_sold_nou = D0(0);
  let S_impr_sold_nou = D0(0);
  let S_dobanda = D0(0);

  for (const m of membri) {
    const nr = m.nr_fisa;
    const nume = m.nume;
    const cot_std = Q2(m.cot);

    if (lich.has(nr)) { log(onProgress, `⭕ ${nr} (${nume}) este lichidat.`); continue; }

    const src = getSourceBalances(depcredDb, nr, sourceYear, sourceMonth);
    if (!src) { log(onProgress, `⚠️ Lipsă rând sursă pentru fișa ${nr} în ${String(sourceMonth).padStart(2,"0")}-${sourceYear}`); continue; }

    const impr_sold_src = Q2(src.impr_sold);
    const dep_sold_src  = Q2(src.dep_sold);

    let dep_deb_nou = Q2(cot_std);
    let dep_cred_nou  = Q2(0);
    const impr_deb_nou = Q2(0);
    const impr_cred_nou = Q2(getInheritedLoanRate(depcredDb, nr, sourceYear, sourceMonth));

    // ✅ FIX: Dividendul se adaugă la DEBIT (dep_deb_nou), nu la CREDIT!
    if (targetMonth === 1) {
      const div = getDividend(activiDb, nr);
      if (div.gt(0)) {
        dep_deb_nou = dep_deb_nou.add(div);  // ← CORECT: adăugăm la DEBIT
        log(onProgress, `🎁 Dividend ${div.toFixed(2)} pentru fișa ${nr}`);
      }
    }

    let impr_sold_nou = Q2(impr_sold_src.add(impr_deb_nou).sub(impr_cred_nou));
    let dep_sold_nou  = Q2(dep_sold_src.add(dep_deb_nou).sub(dep_cred_nou));

    impr_sold_nou = zeroizeIfNearZero(impr_sold_nou);
    dep_sold_nou  = zeroizeIfNearZero(dep_sold_nou);

    let dobanda = Q2(0);
    if (impr_sold_src.gt(0) && impr_sold_nou.eq(0)) {
      dobanda = Q2(calcExtinctionInterest(depcredDb, nr, sourceYear, sourceMonth));
      if (dobanda.gt(0)) {
        log(onProgress, `💸 Dobândă stingere ${dobanda.toFixed(2)} pentru fișa ${nr}`);
        S_dobanda = S_dobanda.add(dobanda);
      }
    }

    insertDepcredRow(
      depcredDb,
      nr,
      targetYear,
      targetMonth,
      dep_deb_nou,
      dep_cred_nou,
      dep_sold_nou,
      impr_deb_nou,
      impr_cred_nou,
      impr_sold_nou,
      dobanda
    );

    cnt++;
    S_dep_sold_nou = S_dep_sold_nou.add(dep_sold_nou);
    S_impr_sold_nou = S_impr_sold_nou.add(impr_sold_nou);

    if (cnt % 50 === 0) log(onProgress, `➕ Procesate ${cnt} fișe...`);
  }

  log(onProgress, `✅ Generare ${String(targetMonth).padStart(2,"0")}-${targetYear} finalizată.`);
  log(onProgress, `Σ dep_sold_nou=${Q2(S_dep_sold_nou).toFixed(2)} | Σ impr_sold_nou=${Q2(S_impr_sold_nou).toFixed(2)} | Σ dobândă=${Q2(S_dobanda).toFixed(2)}`);

  return {
    sourceMonth,
    sourceYear,
    targetMonth,
    targetYear,
    generatedCount: cnt,
    totals: {
      dep_sold: Number(Q2(S_dep_sold_nou)),
      impr_sold: Number(Q2(S_impr_sold_nou)),
      dobanda: Number(Q2(S_dobanda)),
    },
  };
}

export function deleteMonth(db: Database, month: number, year: number) {
  db.run("DELETE FROM depcred WHERE anul=? AND luna=?;", [year, month]);
}