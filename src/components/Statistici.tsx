import { useEffect, useMemo, useRef, useState } from "react";
import type { DBSet } from "@/services/databaseManager";

/**
 * Statistici.tsx
 * Replica logicii și layout-ului din statistici.py pentru desktop.
 * Mobile: layout responsive pe 1–2 coloane, aceeași logică.
 *
 * Dependențe: sql.js (prin DBSet existent în proiect).
 * Tabele: depcred, membrii, chitante.
 */

type Props = {
  databases: DBSet;
  onBack?: () => void;
};

type MonthYear = { luna: number; anul: number };

type CardSpec = {
  key: string;
  title: string;
  color: string;
  multiline?: boolean;
  tooltip?: string;
};

const CARD_SPECS: CardSpec[] = [
  // GRUP 1: MEMBRI
  { key: "total", title: "Total membri", color: "#2980b9" },
  { key: "activi", title: "Membri activi", color: "#3498db" },
  { key: "inactivi", title: "Membri inactivi", color: "#85c1e9" },
  { key: "cu_imprumuturi", title: "Membri cu împrumuturi active", color: "#1f618d" },
  // GRUP 2: DEPUNERI & COTIZAȚII
  { key: "sold_total_depuneri", title: "Sold total depuneri", color: "#27ae60", multiline: true },
  { key: "total_depuneri_cotizatii", title: "Total depuneri (cotizații)", color: "#2ecc71", multiline: true },
  { key: "total_retrageri_fs", title: "Total retrageri Fond Social", color: "#58d68d", multiline: true },
  { key: "total_dobanda", title: "Total dobândă", color: "#186a3b", multiline: true },
  // GRUP 3: ÎMPRUMUTURI & RATE
  { key: "sold_total_imprumuturi", title: "Sold total împrumut", color: "#e74c3c", multiline: true },
  { key: "total_rate_achitate", title: "Total rate achitate", color: "#d35400", multiline: true },
  { key: "total_general_platit", title: "Total general plătit", color: "#8e44ad", multiline: true },
  { key: "imprumuturi_noi", title: "Membri cu împrumuturi noi", color: "#c0392b", multiline: true },
  // GRUP 4: RESTANȚE & ADMIN
  { key: "rest_cot", title: "Cotizații neachitate", color: "#f39c12", multiline: true },
  { key: "rest_imp", title: "Rambursări neachitate", color: "#8e44ad", multiline: true },
  { key: "chitante", title: "Chitanțe", color: "#5dade2", multiline: true },
  { key: "prima_rata_stabilit", title: "De stabilit prima rată", color: "#16a085", multiline: true },
];

function formatNumberRO(value: number, decimals = 0): string {
  if (!isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const intPart = Math.trunc(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decimals <= 0) return sign + intPart;
  const frac = (abs - Math.trunc(abs)).toFixed(decimals).slice(2);
  return `${sign}${intPart},${frac}`;
}

/** Heuristică robustă pentru a găsi un DB sql.js după nume „logic”. */
function resolveDb(dbs: DBSet, names: string[]): any | null {
  const anyDb = dbs as unknown as any;

  // 1) map explicită
  for (const n of names) {
    if (anyDb[n]) {
      const cand = anyDb[n];
      if (cand?.exec || cand?.prepare || cand?.db?.exec) return cand.exec ? cand : cand.db ?? cand.database ?? cand;
    }
  }

  // 2) map generică byName / dbMap
  const maps = [anyDb.dbMap, anyDb.byName, anyDb.files, anyDb.databases];
  for (const m of maps) {
    if (!m) continue;
    // obiect Map
    if (typeof m.get === "function") {
      for (const key of names) {
        const cand = m.get(key) ?? m.get(key + ".db") ?? m.get(key.toUpperCase()) ?? m.get(key.toUpperCase() + ".db");
        if (cand?.exec || cand?.prepare || cand?.db?.exec) return cand.exec ? cand : cand.db ?? cand.database ?? cand;
      }
    }
    // array [{name, db}]
    if (Array.isArray(m)) {
      const cand = m.find((x: any) => {
        const nm = (x?.name ?? x?.filename ?? "").toString().toUpperCase();
        return names.some((q) => nm.includes(q.toUpperCase()));
      });
      if (cand?.db?.exec || cand?.exec || cand?.database?.exec) {
        return cand.db ?? cand.database ?? cand;
      }
    }
  }

  // 3) fallback: scanează câmpurile
  for (const k of Object.keys(anyDb)) {
    if (/\bDEPCRED\b/i.test(k) && names.some((q) => /DEPCRED/i.test(q))) {
      const cand = anyDb[k];
      if (cand?.exec || cand?.prepare || cand?.db?.exec) return cand.exec ? cand : cand.db ?? cand.database ?? cand;
    }
    if (/\bMEMBRII\b/i.test(k) && names.some((q) => /MEMBRII/i.test(q))) {
      const cand = anyDb[k];
      if (cand?.exec || cand?.prepare || cand?.db?.exec) return cand.exec ? cand : cand.db ?? cand.database ?? cand;
    }
    if (/\bCHITANTE?\b/i.test(k) && names.some((q) => /CHITANTE/i.test(q))) {
      const cand = anyDb[k];
      if (cand?.exec || cand?.prepare || cand?.db?.exec) return cand.exec ? cand : cand.db ?? cand.database ?? cand;
    }
  }

  return null;
}

function execSqlSingle(db: any, sql: string): any {
  // sql.js: db.exec(sql) => [{columns, values}]
  if (typeof db?.exec === "function") {
    const out = db.exec(sql);
    if (out?.length && out[0]?.values?.length) return out[0].values[0][0];
    return null;
  }
  // prepare/step/get API
  if (typeof db?.prepare === "function") {
    const stmt = db.prepare(sql);
    const ok = stmt.step?.();
    const row = ok && stmt.get ? stmt.get() : null;
    stmt.free?.();
    return row ? row[0] : null;
  }
  return null;
}

function execSqlRow(db: any, sql: string): any[] | null {
  if (typeof db?.exec === "function") {
    const out = db.exec(sql);
    if (out?.length && out[0]?.values?.length) return out[0].values[0];
    return null;
  }
  if (typeof db?.prepare === "function") {
    const stmt = db.prepare(sql);
    const ok = stmt.step?.();
    const row = ok && stmt.get ? stmt.get() : null;
    stmt.free?.();
    return row ?? null;
  }
  return null;
}

function execSqlScalarNumber(db: any, sql: string): number {
  const v = execSqlSingle(db, sql);
  return typeof v === "number" ? v : v ? Number(v) : 0;
}

export default function Statistici({ databases, onBack }: Props) {
  const depcredDb = useMemo(() => resolveDb(databases, ["DEPCRED", "depcred"]), [databases]);
  const membriiDb = useMemo(() => resolveDb(databases, ["MEMBRII", "membrii"]), [databases]);
  const chitanteDb = useMemo(() => resolveDb(databases, ["CHITANTE", "chitante"]), [databases]);

  const [now, setNow] = useState<Date>(new Date());
  const [refMY, setRefMY] = useState<MonthYear | null>(null);
  const [values, setValues] = useState<Record<string, string | number>>({});
  const timerRef = useRef<number | null>(null);
  const refreshRef = useRef<number | null>(null);

  // Datetime ticker
  useEffect(() => {
    timerRef.current = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  // Data refresh
  useEffect(() => {
    const load = () => {
      try {
        if (!depcredDb) throw new Error("DEPCRED absent");
        // 1) ultima lună/an (MAX(anul*12 + luna))
        const ultima = execSqlScalarNumber(
          depcredDb,
          "SELECT MAX(anul*12 + luna) FROM depcred"
        );
        let luna = new Date().getMonth() + 1;
        let anul = new Date().getFullYear();
        if (ultima && isFinite(ultima)) {
          // decode: anul = floor(max/12), luna = max % 12 (cu corecție)
          let a = Math.floor(ultima / 12);
          let l = ultima % 12;
          if (l === 0) {
            l = 12;
            a -= 1;
          }
          luna = l;
          anul = a;
        }
        setRefMY({ luna, anul });

        // Helpers pentru referințe
        const condRef = `anul=${anul} AND luna=${luna}`;

        // === MEMBRI ===
        const total_membri = membriiDb
          ? execSqlScalarNumber(membriiDb, "SELECT COUNT(*) FROM membrii")
          : 0;

        const membri_activi = execSqlScalarNumber(
          depcredDb,
          `SELECT COUNT(DISTINCT nr_fisa)
           FROM depcred
           WHERE ${condRef}
             AND (dep_sold>0 OR impr_sold>0 OR dep_deb>0 OR dep_cred>0 OR impr_deb>0 OR impr_cred>0)`
        );

        const membri_inactivi = membriiDb
          ? execSqlScalarNumber(
              membriiDb, // folosim NOT IN pe membrii
              `SELECT COUNT(*) FROM membrii
               WHERE NR_FISA NOT IN (
                 SELECT DISTINCT nr_fisa FROM depcred
                 WHERE ${condRef}
                   AND (dep_sold>0 OR impr_sold>0 OR dep_deb>0 OR dep_cred>0 OR impr_deb>0 OR impr_cred>0)
               )`
            )
          : Math.max(0, total_membri - membri_activi);

        const membri_cu_imprumuturi = execSqlScalarNumber(
          depcredDb,
          `SELECT COUNT(DISTINCT nr_fisa) FROM depcred
           WHERE ${condRef} AND impr_sold>0`
        );

        // === SUME FINANCIARE ===
        const sold_total_depuneri = execSqlScalarNumber(
          depcredDb,
          `SELECT COALESCE(SUM(dep_sold),0) FROM depcred WHERE ${condRef}`
        );
        const total_depuneri_cotizatii = execSqlScalarNumber(
          depcredDb,
          `SELECT COALESCE(SUM(dep_deb),0) FROM depcred WHERE ${condRef}`
        );
        const total_retrageri_fs = execSqlScalarNumber(
          depcredDb,
          `SELECT COALESCE(SUM(dep_cred),0) FROM depcred WHERE ${condRef}`
        );
        const total_dobanda = execSqlScalarNumber(
          depcredDb,
          `SELECT COALESCE(SUM(dobanda),0) FROM depcred WHERE ${condRef}`
        );
        const sold_total_imprumuturi = execSqlScalarNumber(
          depcredDb,
          `SELECT COALESCE(SUM(impr_sold),0) FROM depcred WHERE ${condRef}`
        );
        const total_rate_achitate = execSqlScalarNumber(
          depcredDb,
          `SELECT COALESCE(SUM(impr_cred),0) FROM depcred WHERE ${condRef}`
        );
        const total_general_platit =
          total_dobanda + total_rate_achitate + total_depuneri_cotizatii;

        // === Împrumuturi noi ===
        const imprumuturi_noi = execSqlScalarNumber(
          depcredDb,
          `SELECT COUNT(DISTINCT nr_fisa) FROM depcred
           WHERE ${condRef} AND impr_deb>0`
        );

        // === Prima rată de stabilit ===
        let luna_sursa = luna === 1 ? 12 : luna - 1;
        let anul_sursa = luna === 1 ? anul - 1 : anul;
        const prima_rata_stabilit = execSqlScalarNumber(
          depcredDb,
          `SELECT COUNT(DISTINCT tinta.nr_fisa)
           FROM depcred AS tinta
           INNER JOIN depcred AS sursa
             ON tinta.nr_fisa = sursa.nr_fisa
            AND sursa.luna = ${luna_sursa} AND sursa.anul = ${anul_sursa}
           WHERE tinta.luna = ${luna} AND tinta.anul = ${anul}
             AND sursa.impr_deb > 0
             AND tinta.impr_sold > 0.005
             AND (tinta.impr_cred = 0 OR tinta.impr_cred IS NULL)
             AND (tinta.impr_deb = 0 OR tinta.impr_deb IS NULL)`
        );

        // === Restanțe ===
        const rest_cot = execSqlScalarNumber(
          depcredDb,
          `SELECT COUNT(DISTINCT nr_fisa) FROM depcred
           WHERE ${condRef} AND dep_deb <= 0`
        );
        const rest_imp = execSqlScalarNumber(
          depcredDb,
          `SELECT COUNT(DISTINCT nr_fisa) FROM depcred
           WHERE ${condRef} AND impr_cred <= 0 AND impr_sold > 0`
        );

        // === Chitanțe ===
        let chitanteHtml = "🚫 Nu există date";
        if (chitanteDb) {
          const row = execSqlRow(
            chitanteDb,
            "SELECT STARTCH_PR, STARTCH_AC FROM chitante ORDER BY ROWID DESC LIMIT 1"
          );
          if (row && row.length >= 2) {
            const pr = Number(row[0] ?? 0);
            const ac = Number(row[1] ?? 0);
            const tiparite = ac >= pr ? ac - pr : 0;
            chitanteHtml = [
              `<div class='text-center leading-tight'>`,
              `<span class='text-[10px] font-bold text-blue-600'>Precedent:</span> <span class='text-[10px] text-slate-800'>${pr}</span><br/>`,
              `<span class='text-[10px] font-bold text-blue-600'>Curent:</span> <span class='text-[10px] text-slate-800'>${ac}</span><br/>`,
              `<b class='text-[11px] text-green-600'>Tipărite: ${tiparite}</b>`,
              `</div>`,
            ].join("");
          }
        }

        setValues({
          total: total_membri,
          activi: membri_activi,
          inactivi: membri_inactivi,
          cu_imprumuturi: membri_cu_imprumuturi,
          sold_total_depuneri: `<div class='text-center'><b class='text-[15px]' style='color:#27ae60'>${formatNumberRO(
            sold_total_depuneri,
            0
          )}</b></div>`,
          total_depuneri_cotizatii: `<div class='text-center'><b class='text-[15px]' style='color:#2ecc71'>${formatNumberRO(
            total_depuneri_cotizatii,
            0
          )}</b></div>`,
          total_retrageri_fs: `<div class='text-center'><b class='text-[15px]' style='color:#58d68d'>${formatNumberRO(
            total_retrageri_fs,
            0
          )}</b></div>`,
          total_dobanda: `<div class='text-center'><b class='text-[15px]' style='color:#186a3b'>${formatNumberRO(
            total_dobanda,
            2
          )}</b></div>`,
          sold_total_imprumuturi: `<div class='text-center'><b class='text-[15px]' style='color:#e74c3c'>${formatNumberRO(
            sold_total_imprumuturi,
            0
          )}</b></div>`,
          total_rate_achitate: `<div class='text-center'><b class='text-[15px]' style='color:#d35400'>${formatNumberRO(
            total_rate_achitate,
            2
          )}</b></div>`,
          total_general_platit: `<div class='text-center'><b class='text-[15px]' style='color:#8e44ad'>${formatNumberRO(
            total_general_platit,
            2
          )}</b></div>`,
          imprumuturi_noi: `<div class='text-center'><b class='text-[15px]' style='color:#c0392b'>${imprumuturi_noi}</b><br/><span class='text-[9px] text-slate-500'>membri</span></div>`,
          rest_cot: `<div class='text-center'><b class='text-[15px]' style='color:#f39c12'>${rest_cot}</b><br/><span class='text-[9px] text-slate-500'>membri</span></div>`,
          rest_imp: `<div class='text-center'><b class='text-[15px]' style='color:#8e44ad'>${rest_imp}</b><br/><span class='text-[9px] text-slate-500'>neachitate</span></div>`,
          chitante: chitanteHtml,
          prima_rata_stabilit: `<div class='text-center'><b class='text-[15px]' style='color:${
            (prima_rata_stabilit ?? 0) > 0 ? "#16a085" : "#95a5a6"
          }'>${prima_rata_stabilit}</b><br/><span class='text-[9px] text-slate-500'>membri</span></div>`,
        });
      } catch (e) {
        // Marchează erorile în carduri
        const errVal = "<div class='text-center text-[10px] text-red-600'>Eroare</div>";
        const out: Record<string, string> = {};
        for (const c of CARD_SPECS) out[c.key] = c.multiline ? errVal : "N/A";
        setValues(out);
      }
    };

    load();
    refreshRef.current = window.setInterval(load, 30000);
    return () => {
      if (refreshRef.current) window.clearInterval(refreshRef.current);
    };
  }, [depcredDb, membriiDb, chitanteDb]);

  const monthName = (m?: number) =>
    ["", "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"][m ?? 0] ?? "Necunoscut";

  return (
    <div className="w-full h-full">
      {/* HEADER */}
      <div className="mx-2 my-1 rounded-xl px-4 h-12 flex items-center"
           style={{ background: "linear-gradient(90deg, rgba(60,125,200,0.9), rgba(80,150,220,0.92), rgba(60,125,200,0.9))" }}>
        <div className="text-white font-bold text-[17px] select-none">📊 Statistici C.A.R. Petroșani</div>
        <div className="flex-1"></div>
        <div className="text-white text-[10px] font-bold mx-3 select-none">
          {refMY ? `📅 Referință: ${monthName(refMY.luna)} ${refMY.anul}` : "📅 Referință: detectare..."}
        </div>
        <div className="text-white text-[11px] font-bold select-none">🗓️ {now.toLocaleDateString()} ⏰ {now.toLocaleTimeString()}</div>
      </div>

      {/* GRID CARDS */}
      <div
        className="
          grid gap-2 p-3
          md:grid-cols-4 sm:grid-cols-2 grid-cols-1
        "
      >
        {CARD_SPECS.map((card) => (
          <Card
            key={card.key}
            title={card.title}
            color={card.color}
            multiline={card.multiline}
            value={values[card.key]}
          />
        ))}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="px-3 pb-3">
        {onBack && (
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white"
          >
            ← Înapoi
          </button>
        )}
      </div>
    </div>
  );
}

function Card({
  title,
  color,
  multiline,
  value,
}: {
  title: string;
  color: string;
  multiline?: boolean;
  value: string | number | undefined;
}) {
  return (
    <div
      className="rounded-xl border border-white/70"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(230,235,245,0.6))",
        minHeight: 110,
        maxHeight: 110,
        boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <div
          className="w-6 h-6 flex items-center justify-center text-[16px]"
          aria-hidden
        >
          {/* Emoji fallback în loc de icon din fișier */}
          <span>{pickEmoji(title)}</span>
        </div>
        <div className="text-[11px] font-bold" style={{ color }}>
          {title}
        </div>
        <div className="flex-1" />
      </div>

      {/* Value */}
      <div className="px-2">
        {!multiline ? (
          <div
            className="mt-1 mx-1 text-center font-bold rounded-md"
            style={{
              color,
              background: "rgba(255,255,255,0.3)",
              fontSize: 18,
              padding: "6px",
            }}
          >
            {typeof value === "number" ? value : value ?? "0"}
          </div>
        ) : (
          <div
            className="mt-1 mx-1 text-center font-bold rounded-md"
            style={{
              background: "rgba(255,255,255,0.3)",
              padding: "4px",
            }}
            dangerouslySetInnerHTML={{
              __html: typeof value === "string" ? value : String(value ?? "0"),
            }}
          />
        )}
      </div>
    </div>
  );
}

function pickEmoji(title: string): string {
  const map: Record<string, string> = {
    "Total membri": "👥",
    "Membri activi": "✅",
    "Membri inactivi": "❌",
    "Membri cu împrumuturi active": "🏦",
    "Sold total depuneri": "💰",
    "Total depuneri (cotizații)": "📥",
    "Total retrageri Fond Social": "📤",
    "Total dobândă": "🏦",
    "Sold total împrumut": "💳",
    "Total rate achitate": "🏦",
    "Total general plătit": "💵",
    "Membri cu împrumuturi noi": "🆕",
    "Cotizații neachitate": "⚠️",
    "Rambursări neachitate": "⏳",
    "Chitanțe": "🧾",
    "De stabilit prima rată": "🔔",
  };
  return map[title] ?? "📊";
}
