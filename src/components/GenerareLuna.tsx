import { useState } from "react";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { generateMonth } from "../logic/generateMonth";

const MONTHS = [
  "Ianuarie","Februarie","Martie","Aprilie","Mai","Iunie",
  "Iulie","August","Septembrie","Octombrie","Noiembrie","Decembrie"
];

type DBSet = {
  membrii: Database;
  depcred: Database;
  lichidati?: Database;
  activi?: Database;
  usedSuffix?: string | null;
};

export default function GenerareLuna() {
  const [currentPeriod, setCurrentPeriod] = useState<string | null>(null);
const [nextPeriod, setNextPeriod] = useState<string | null>(null);
  const [rate] = useState(0.4);
  const [log, setLog] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(10);
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [running, setRunning] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [savedBlobUrl, setSavedBlobUrl] = useState<string | null>(null);
  const [depcredDbForSave, setDepcredDbForSave] = useState<Database | null>(null);

  const pushLog = (msg: string) => setLog(prev => [...prev, msg]);

  async function fetchTextIfExists(path: string) {
    try {
      const r = await fetch(path, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.text();
    } catch {
      return null;
    }
  }

  async function headExists(path: string) {
    try {
      const r = await fetch(path, { method: "HEAD", cache: "no-store" });
      return r.ok;
    } catch {
      return false;
    }
  }

  // Detect dual currency state (robust, tolerant)
  async function detectDualCurrency(): Promise<{ active: boolean; suffix: string | null }> {
    const txt = await fetchTextIfExists("/dual_currency.json");
    if (txt) {
      try {
        const j = JSON.parse(txt);
        const truthy =
          j?.converted || j?.active || j?.enabled || j?.use_eur || j?.eur || j?.mode === "EUR" || j?.currency === "EUR";
        if (truthy) {
          const suffix = j?.suffix || "EUR";
          pushLog(`🔁 dual_currency.json: conversie detectată, folosim sufix ${suffix}`);
          return { active: true, suffix };
        }
      } catch {
        // ignore parse errors
      }
    }

    // fallback: detectăm existența fișierelor *_EUR.db în public
    const candidates = ["MEMBRII_EUR.db", "DEPCRED_EUR.db"];
    for (const c of candidates) {
      if (await headExists(`/${c}`)) {
        pushLog(`🔁 Fișier ${c} găsit în public → presupun conversie activă.`);
        return { active: true, suffix: "_EUR" };
      }
    }

    pushLog("➡️ Dual currency not active (no dual_currency.json or _EUR DBs).");
    return { active: false, suffix: null };
  }

  async function loadDb(sql: any, name: string, suffixHint: string | null): Promise<Database> {
    // name ex: "MEMBRII.db"
    const base = name.replace(/\.db$/i, "");
    const tryNames: string[] = [];
    if (suffixHint) {
      // suffixHint may be "EUR" or "_EUR"
      const s = suffixHint.startsWith("_") ? suffixHint : `_${suffixHint}`;
      tryNames.push(`${base}${s}.db`);
    }
    tryNames.push(`${base}.db`);
    // also try plain fallback
    for (const n of tryNames) {
      try {
        const resp = await fetch(`/${n}`);
        if (!resp.ok) continue;
        const buf = await resp.arrayBuffer();
        const u8 = new Uint8Array(buf);
        pushLog(`📥 Încarc ${n}`);
        return new sql.Database(u8);
      } catch (e) {
        // continue
      }
    }
    throw new Error(`Fișier DB inaccesibil: ${name} (încercate: ${tryNames.join(", ")})`);
  }

  async function loadAllDbs(sql: any, suffixHint: string | null): Promise<DBSet> {
    const membrii = await loadDb(sql, "MEMBRII.db", suffixHint);
    const depcred = await loadDb(sql, "DEPCRED.db", suffixHint);
    let lichidati: Database | undefined;
    let activi: Database | undefined;
    try { lichidati = await loadDb(sql, "LICHIDATI.db", suffixHint); } catch {}
    try { activi = await loadDb(sql, "ACTIVI.db", suffixHint); } catch {}
    return { membrii, depcred, lichidati, activi, usedSuffix: suffixHint };
  }

  async function handleGenerate() {
    if (running) return;
    setRunning(true);
    setCanSave(false);
    setSavedBlobUrl(null);
    setDepcredDbForSave(null);
    setLog([]);

    pushLog("=== Inițiere generare lună ===");

    try {
      const SQL = await initSqlJs({
        locateFile: (f: string) => `https://sql.js.org/dist/${f}`,
      });

      // 1. detect dual-currency
      const dual = await detectDualCurrency();
      const suffix = dual.active ? (dual.suffix === "_EUR" ? "_EUR" : dual.suffix?.replace(/^_/, "") ?? "EUR") : null;

      // 2. încarcă DB-urile (încerc sufix prima dată dacă există)
      const dbs = await loadAllDbs(SQL, suffix ? (suffix === "_EUR" ? "_EUR" : suffix) : null);
      // 2.5 auto-detectare ultima luna din DEPCRED
try {
  const res = dbs.depcred.exec("SELECT MAX(anul) as an, MAX(luna) as luna FROM depcred;");
  if (res.length && res[0].values[0][0] && res[0].values[0][1]) {
    const an = Number(res[0].values[0][0]);
    const luna = Number(res[0].values[0][1]);
    const nextLuna = luna === 12 ? 1 : luna + 1;
    const nextAn = luna === 12 ? an + 1 : an;
    setCurrentPeriod(`${String(luna).padStart(2, "0")}-${an}`);
    setNextPeriod(`${String(nextLuna).padStart(2, "0")}-${nextAn}`);
    pushLog(`📅 Ultima luna detectată: ${String(luna).padStart(2, "0")}-${an}`);
  } else {
    pushLog("⚠️ Nu s-a putut detecta ultima lună din DEPCRED.");
  }
} catch (err) {
  pushLog("⚠️ Eroare la detectarea ultimei luni: " + (err as Error).message);
}


      pushLog(`✅ Baze încărcate. Folosit sufix: ${dbs.usedSuffix ?? "none"}`);

      // 3. apelează generateMonth
      pushLog(`--- Generare ${String(selectedMonth).padStart(2, "0")}-${selectedYear} ---`);
      const summary = generateMonth({
        depcredDb: dbs.depcred,
        membriiDb: dbs.membrii,
        lichidatiDb: dbs.lichidati,
        activiDb: dbs.activi,
        targetMonth: selectedMonth,
        targetYear: selectedYear,
        onProgress: (m) => pushLog(m),
      });

      pushLog("--- Final generare ---");
      pushLog(JSON.stringify(summary, null, 2));

      // 4. pregătim butonul de save manual - nu declanșăm auto-download
      setDepcredDbForSave(dbs.depcred);
      setCanSave(true);
      pushLog("🔔 Generare finalizată. Apasă 'Salvează DEPCRED actualizat' pentru a salva manual.");

    } catch (e: any) {
      pushLog("Eroare: " + (e?.message ?? String(e)));
    } finally {
      setRunning(false);
    }
  }

  function handleSave() {
    if (!depcredDbForSave) return;
    const data = depcredDbForSave.export();
    const blob = new Blob([Buffer.from(data)], { type: "application/x-sqlite3" });
    if (savedBlobUrl) URL.revokeObjectURL(savedBlobUrl);
    const url = URL.createObjectURL(blob);
    setSavedBlobUrl(url);
    // descarcă prin click pentru a deschide dialogul Save As
    const a = document.createElement("a");
    a.href = url;
    a.download = `DEPCRED_${selectedYear}_${String(selectedMonth).padStart(2, "0")}.db`;
    a.click();
    pushLog(`💾 Fișier pregătit pentru salvare: ${a.download}`);
    // user va alege locul de salvare
  }

  return (
    <div className="p-4 bg-slate-100 min-h-screen font-sans text-sm flex flex-col gap-4">
      {/* Info perioadă */}
      <div className="flex flex-wrap justify-between items-center bg-white border rounded p-3 shadow-sm">
        <div>Ultima lună: <b>{currentPeriod}</b></div>
        <div>Următoarea lună: <b>{nextPeriod}</b></div>
        <div>Rată dobândă lichidare: <b>{rate.toFixed(1)}‰</b></div>
      </div>

      {/* Acțiuni */}
      <div className="flex flex-wrap gap-2 bg-white border rounded p-3 shadow-sm items-center">
        <label className="mr-2">Selectați luna:</label>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="border rounded px-2 py-1"
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>
              {String(i + 1).padStart(2, "0")} - {m}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="border rounded px-2 py-1"
        >
          {/* simple range: current year +/- 2 */}
          {Array.from({ length: 5 }).map((_, idx) => {
            const y = 2023 + idx; // adjust base if vrei alt interval
            return <option key={y} value={y}>{y}</option>;
          })}
        </select>

        <button
          onClick={handleGenerate}
          disabled={running}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1 rounded disabled:opacity-40"
        >
          {running ? "Se rulează..." : "Generează Lună Selectată"}
        </button>

        <button
          disabled={running}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded"
        >
          Șterge Lună Selectată
        </button>

        <button
          disabled={running}
          className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-3 py-1 rounded"
        >
          Modifică Rata Dobândă
        </button>
      </div>

      {/* Butoane secundare */}
      <div className="flex flex-wrap gap-2 bg-white border rounded p-3 shadow-sm">
        <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded">
          Numere de fișă nealocate
        </button>
        <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded">
          Afișează membri lichidați
        </button>
        <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded">
          Afișează membri activi
        </button>
        <div className="ml-auto flex gap-2">
          <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded">
            Exportă rezumat
          </button>
          <button onClick={() => setLog([])} className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded">
            Șterge log
          </button>
        </div>
      </div>

      {/* Zona log */}
      <div className="flex-1 bg-white border rounded p-3 shadow-sm overflow-auto">
        <pre className="text-xs whitespace-pre-wrap">{log.join("\n")}</pre>
      </div>

      {/* Save button */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded disabled:opacity-40"
        >
          💾 Salvează DEPCRED actualizat
        </button>
        {canSave && <span className="self-center text-sm text-slate-600">Fișier pregătit pentru salvare.</span>}
      </div>
    </div>
  );
}
