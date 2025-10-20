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

  // 📅 Detectează ultima lună și următoarea
  async function detectLastPeriod(depcred: Database) {
    try {
      const res = depcred.exec("SELECT anul, luna FROM depcred ORDER BY anul DESC, luna DESC LIMIT 1;");
      if (res.length && res[0].values.length) {
        const an = Number(res[0].values[0][0]);
        const luna = Number(res[0].values[0][1]);
        const nextLuna = luna === 12 ? 1 : luna + 1;
        const nextAn = luna === 12 ? an + 1 : an;
        setCurrentPeriod(`${String(luna).padStart(2, "0")}-${an}`);
        setNextPeriod(`${String(nextLuna).padStart(2, "0")}-${nextAn}`);
        setCurrentMonth(luna);
        setCurrentYear(an);
        setNextMonth(nextLuna);
        setNextYear(nextAn);
        pushLog(`📅 Ultima lună detectată: ${String(luna).padStart(2, "0")}-${an}`);
      } else {
        pushLog("⚠️ Nu s-a putut detecta ultima lună din DEPCRED.");
      }
    } catch (err) {
      pushLog("⚠️ Eroare la detectarea ultimei luni: " + (err as Error).message);
    }
  }

  // 🧩 Generare lună nouă
  async function handleGenerate() {
    if (running) return;
    setRunning(true);
    setCanSave(false);
    setDepcredDbForSave(null);
    setLog([]);

    try {
      const SQL = await initSqlJs({ locateFile: (f) => `https://sql.js.org/dist/${f}` });

      pushLog("=== Inițiere proces generare lună ===");
      const dbs = await getActiveDatabases(SQL, pushLog);

      const depcred = dbs.depcred;
      const membrii = dbs.membrii;
      const lichidati = dbs.lichidati;
      const activi = dbs.activi;

      await detectLastPeriod(depcred);

      if (!nextMonth || !nextYear)
        throw new Error("Nu s-a putut determina luna următoare.");

      pushLog(`=== Generare ${String(nextMonth).padStart(2, "0")}-${nextYear} (sursa: ${String(currentMonth).padStart(2, "0")}-${currentYear}) ===`);

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
      pushLog(`💾 Apasă „Salvează DEPCRED actualizat” pentru a descărca rezultatul.`);
    } catch (e: any) {
      pushLog("Eroare: " + e.message);
    } finally {
      setRunning(false);
    }
  }

  // 🗑️ Ștergere lună (doar ultima detectată)
  async function handleDelete() {
    if (running) return;
    if (!currentMonth || !currentYear) {
      pushLog("⚠️ Nu există informații despre ultima lună detectată.");
      return;
    }

    const confirmMsg =
      `⚠️ Ștergerea lunii ${String(currentMonth).padStart(2, "0")}-${currentYear} este ireversibilă.\n` +
      "Această acțiune este permisă doar pentru ultima lună (descrescător).\n\n" +
      "Confirmi că vrei să continui?";

    if (!window.confirm(confirmMsg)) {
      pushLog("ℹ️ Ștergere anulată de utilizator.");
      return;
    }

    try {
      const SQL = await initSqlJs({ locateFile: (f) => `https://sql.js.org/dist/${f}` });
      const dbs = await getActiveDatabases(SQL, pushLog);
      const depcred = dbs.depcred;

      const newer = depcred.exec(
        "SELECT 1 FROM depcred WHERE (anul > ? OR (anul = ? AND luna > ?)) LIMIT 1;",
        [currentYear, currentYear, currentMonth]
      );
      if (newer.length && newer[0].values.length) {
        pushLog("❌ Nu poți șterge o lună care nu este ultima. Operația anulată.");
        alert("Nu poți șterge o lună care nu este ultima. Verifică ordinea descrescătoare a lunilor.");
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

  // 💾 Salvare fișier generat
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
      {/* Info perioadă */}
      <div className="flex flex-wrap justify-between items-center bg-white border rounded p-3 shadow-sm">
        <div>Ultima lună: <b>{currentPeriod ?? "—"}</b></div>
        <div>Următoarea lună: <b>{nextPeriod ?? "—"}</b></div>
        <div>Rată dobândă lichidare: <b>{rate.toFixed(1)}‰</b></div>
      </div>

      {/* Acțiuni */}
      <div className="flex flex-wrap gap-2 bg-white border rounded p-3 shadow-sm items-center">
        <label>Luna curentă detectată:</label>
        <select value={currentMonth ?? ""} disabled className="border rounded px-2 py-1 bg-gray-100">
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>
              {String(i + 1).padStart(2, "0")} - {m}
            </option>
          ))}
        </select>

        <select value={currentYear ?? ""} disabled className="border rounded px-2 py-1 bg-gray-100">
          {Array.from({ length: 5 }).map((_, idx) => {
            const y = 2023 + idx;
            return (
              <option key={y} value={y}>
                {y}
              </option>
            );
          })}
        </select>

        <button
          onClick={handleGenerate}
          disabled={running}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1 rounded disabled:opacity-40"
        >
          {running ? "Se rulează..." : "Generează Luna Următoare"}
        </button>

        <button
          onClick={handleDelete}
          disabled={running}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded"
        >
          Șterge Ultima Lună
        </button>
      </div>

      {/* Log */}
      <div className="flex-1 bg-white border rounded p-3 shadow-sm overflow-auto">
        <pre className="text-xs whitespace-pre-wrap">{log.join("\n")}</pre>
      </div>

      {/* Save */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded disabled:opacity-40"
        >
          💾 Salvează DEPCRED actualizat
        </button>
        {canSave && (
          <span className="self-center text-sm text-slate-600">
            Fișier pregătit pentru salvare.
          </span>
        )}
      </div>
    </div>
  );
}
