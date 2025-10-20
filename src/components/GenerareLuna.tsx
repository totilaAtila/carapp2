import { useState } from "react";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { generateMonth, deleteMonth } from "../logic/generateMonth";
import { getActiveDatabases } from "../logic/dbLoader";

const MONTHS = [
  "Ianuarie","Februarie","Martie","Aprilie","Mai","Iunie",
  "Iulie","August","Septembrie","Octombrie","Noiembrie","Decembrie"
];

export default function GenerareLuna() {
  const [currentPeriod, setCurrentPeriod] = useState<string | null>(null);
  const [nextPeriod, setNextPeriod] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<number | null>(null);
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [nextMonth, setNextMonth] = useState<number | null>(null);
  const [nextYear, setNextYear] = useState<number | null>(null);
  const [rate] = useState(0.4);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [depcredDbForSave, setDepcredDbForSave] = useState<Database | null>(null);

  const pushLog = (msg: string) => setLog((prev) => [...prev, msg]);

  // === Detectează luna activă (prima=1) și calculează următoarea ===
  async function detectLastPeriod(depcred: Database) {
    try {
      const res = depcred.exec("SELECT MAX(anul*100 + luna) AS yyyymm FROM depcred WHERE prima=1;");
      if (!res.length || !res[0].values.length || res[0].values[0][0] == null) {
        throw new Error("Nu există lună activă (prima=1) în DEPCRED.");
      }
      const yyyymm = Number(res[0].values[0][0]);
      const an = Math.floor(yyyymm / 100);
      const luna = yyyymm % 100;
      const nextLuna = luna === 12 ? 1 : luna + 1;
      const nextAn = luna === 12 ? an + 1 : an;

      setCurrentPeriod(`${String(luna).padStart(2, "0")}-${an}`);
      setNextPeriod(`${String(nextLuna).padStart(2, "0")}-${nextAn}`);
      setCurrentMonth(luna);
      setCurrentYear(an);
      setNextMonth(nextLuna);
      setNextYear(nextAn);

      pushLog(`📅 Lună activă (prima=1): ${String(luna).padStart(2, "0")}-${an}`);
      pushLog(`📆 Următoarea lună țintă: ${String(nextLuna).padStart(2, "0")}-${nextAn}`);
    } catch (err) {
      pushLog("⚠️ Eroare la detectarea lunii active: " + (err as Error).message);
      throw err;
    }
  }

  // === Generează luna următoare ===
  async function handleGenerate() {
    if (running) return;
    setRunning(true);
    setCanSave(false);
    setDepcredDbForSave(null);
    setLog([]);

    try {
      const SQL = await initSqlJs({ locateFile: (f) => `https://sql.js.org/dist/${f}` });
      pushLog("=== Inițiere generare lună ===");

      const dbs = await getActiveDatabases(SQL, pushLog);
      const depcred = dbs.depcred;
      const membrii = dbs.membrii;
      const lichidati = dbs.lichidati;
      const activi = dbs.activi;

      // detectăm luna activă
      await detectLastPeriod(depcred);
      if (!nextMonth || !nextYear) throw new Error("Luna următoare nu a putut fi determinată.");

      // dacă luna următoare există deja -> oprim
      const exist = depcred.exec(
        "SELECT 1 FROM depcred WHERE anul=? AND luna=? LIMIT 1;",
        [nextYear, nextMonth]
      );
      if (exist.length && exist[0].values.length) {
        alert(`Luna ${String(nextMonth).padStart(2, "0")}-${nextYear} există deja în DEPCRED.`);
        pushLog(`❌ Luna ${String(nextMonth).padStart(2, "0")}-${nextYear} există deja.`);
        return;
      }

      // închidem luna activă (prima=1 → 0)
      depcred.run("UPDATE depcred SET prima=0 WHERE prima=1;");
      pushLog("🔒 Luna anterioară a fost închisă (prima=0).");

      // generăm luna nouă (care va avea prima=1 în generateMonth)
      pushLog(`--- Generare ${String(nextMonth).padStart(2, "0")}-${nextYear} ---`);
      const summary = generateMonth({
        depcredDb: depcred,
        membriiDb: membrii,
        lichidatiDb: lichidati,
        activiDb: activi,
        targetMonth: nextMonth,
        targetYear: nextYear,
        onProgress: (m) => pushLog(m),
      });

      pushLog("✅ Generare completă.");
      pushLog(JSON.stringify(summary, null, 2));
      setDepcredDbForSave(depcred);
      setCanSave(true);
      pushLog("💾 Poți salva fișierul actualizat.");
    } catch (e: any) {
      pushLog("Eroare: " + e.message);
    } finally {
      setRunning(false);
    }
  }

  // === Șterge doar ultima lună activă ===
  async function handleDelete() {
    if (running) return;
    if (!currentMonth || !currentYear) {
      pushLog("⚠️ Nu există informații despre luna activă.");
      return;
    }

    const confirmMsg =
      `⚠️ Ștergerea lunii ${String(currentMonth).padStart(2, "0")}-${currentYear} este ireversibilă.\n` +
      "Această acțiune este permisă doar pentru luna activă (prima=1).\n\n" +
      "Confirmi că vrei să continui?";
    if (!window.confirm(confirmMsg)) {
      pushLog("ℹ️ Ștergere anulată de utilizator.");
      return;
    }

    try {
      const SQL = await initSqlJs({ locateFile: (f) => `https://sql.js.org/dist/${f}` });
      const dbs = await getActiveDatabases(SQL, pushLog);
      const depcred = dbs.depcred;

      // verificăm dacă e într-adevăr ultima (prima=1)
      const check = depcred.exec(
        "SELECT COUNT(*) FROM depcred WHERE prima=1 AND anul=? AND luna=?;",
        [currentYear, currentMonth]
      );
      if (!check.length || !check[0].values[0][0]) {
        alert("❌ Poți șterge doar luna activă (prima=1).");
        pushLog("❌ Încercare de ștergere nepermisă. Operația anulată.");
        return;
      }

      deleteMonth(depcred, currentMonth, currentYear);
      pushLog(`🗑️ Luna ${String(currentMonth).padStart(2, "0")}-${currentYear} a fost ștearsă din DEPCRED.`);

      const data = depcred.export();
      const blob = new Blob([Buffer.from(data)], { type: "application/x-sqlite3" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `DEPCRED_deleted_${currentYear}_${String(currentMonth).padStart(2, "0")}.db`;
      a.click();
      pushLog("💾 Fișierul actualizat a fost salvat cu modificările aplicate.");
    } catch (e: any) {
      pushLog("Eroare la ștergere: " + e.message);
    }
  }

  function handleSave() {
    if (!depcredDbForSave) return;
    const data = depcredDbForSave.export();
    const blob = new Blob([Buffer.from(data)], { type: "application/x-sqlite3" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `DEPCRED_${nextYear}_${String(nextMonth).padStart(2, "0")}.db`;
    a.click();
    pushLog(`💾 Fișier DEPCRED_${nextYear}_${String(nextMonth).padStart(2, "0")}.db pregătit pentru descărcare.`);
  }

  return (
    <div className="p-4 bg-slate-100 min-h-screen font-sans text-sm flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center bg-white border rounded p-3 shadow-sm">
        <div>Luna activă: <b>{currentPeriod ?? "—"}</b></div>
        <div>Următoarea lună: <b>{nextPeriod ?? "—"}</b></div>
        <div>Rată dobândă lichidare: <b>{rate.toFixed(1)}‰</b></div>
      </div>

      <div className="flex flex-wrap gap-2 bg-white border rounded p-3 shadow-sm items-center">
        <label>Luna activă detectată:</label>
        <select value={currentMonth ?? ""} disabled className="border rounded px-2 py-1 bg-gray-100">
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{String(i + 1).padStart(2, "0")} - {m}</option>
          ))}
        </select>

        <select value={currentYear ?? ""} disabled className="border rounded px-2 py-1 bg-gray-100">
          {Array.from({ length: 5 }).map((_, idx) => {
            const y = 2023 + idx;
            return <option key={y} value={y}>{y}</option>;
          })}
        </select>

        <button onClick={handleGenerate} disabled={running} className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1 rounded disabled:opacity-40">
          {running ? "Se rulează..." : "Generează Luna Următoare"}
        </button>

        <button onClick={handleDelete} disabled={running} className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded">
          Șterge Luna Activă
        </button>
      </div>

      <div className="flex-1 bg-white border rounded p-3 shadow-sm overflow-auto">
        <pre className="text-xs whitespace-pre-wrap">{log.join("\n")}</pre>
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={!canSave} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded disabled:opacity-40">
          💾 Salvează DEPCRED actualizat
        </button>
        {canSave && <span className="self-center text-sm text-slate-600">Fișier pregătit pentru salvare.</span>}
      </div>
    </div>
  );
}
