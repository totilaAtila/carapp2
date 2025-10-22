import { useState, useEffect } from "react";
import type { Database } from "sql.js";
import { generateMonth, deleteMonth } from "../logic/generateMonth";
import type { DBSet } from '../services/databaseManager';

const MONTHS = [
  "Ianuarie","Februarie","Martie","Aprilie","Mai","Iunie",
  "Iulie","August","Septembrie","Octombrie","Noiembrie","Decembrie"
];

interface Props {
  databases: DBSet;
  onBack: () => void;
}

export default function GenerareLuna({ databases, onBack }: Props) {
  const [currentPeriod, setCurrentPeriod] = useState<string | null>(null);
  const [nextPeriod, setNextPeriod] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<number>(0);
  const [currentYear, setCurrentYear] = useState<number>(0);
  const [rate] = useState(0.4);
  const [log, setLog] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(0);
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [running, setRunning] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [savedBlobUrl, setSavedBlobUrl] = useState<string | null>(null);
  const [depcredDbForSave, setDepcredDbForSave] = useState<Database | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const pushLog = (msg: string) => setLog(prev => [...prev, msg]);

  // Actualizare display următoare lună când se schimbă selecția
  useEffect(() => {
    if (currentMonth === 0 || currentYear === 0) return;

    // Calculăm următoarea lună logică (pentru display)
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

    setNextPeriod(`${String(nextMonth).padStart(2, "0")}-${nextYear}`);
  }, [currentMonth, currentYear]);

  function checkMonthExists(db: Database, month: number, year: number): boolean {
    try {
      const res = db.exec("SELECT 1 FROM depcred WHERE luna=? AND anul=? LIMIT 1", [month, year]);
      return res.length > 0 && res[0].values.length > 0;
    } catch {
      return false;
    }
  }

  async function handleGenerate() {
    if (running) return;

    // Validare 1: Verificăm dacă avem date despre perioada curentă
    if (currentMonth === 0 || currentYear === 0) {
      pushLog("❌ Perioada curentă (ultima lună procesată) nu este clară. Verificați baza de date DEPCRED.");
      return;
    }

    // Validare 2: Calculăm următoarea lună logică
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

    // Validare 3: Verificăm dacă luna selectată este următoarea lună logică
    if (selectedMonth !== nextMonth || selectedYear !== nextYear) {
      pushLog(`❌ EROARE: Puteți genera doar luna imediat următoare ultimei luni procesate (${String(currentMonth).padStart(2, "0")}-${currentYear}).`);
      pushLog(`   Următoarea lună logică este ${String(nextMonth).padStart(2, "0")}-${nextYear}.`);
      pushLog(`   Ați selectat: ${String(selectedMonth).padStart(2, "0")}-${selectedYear}`);
      return;
    }

    setRunning(true);
    setCanSave(false);
    setSavedBlobUrl(null);
    setDepcredDbForSave(null);
    setLog([]);

    pushLog("=== Inițiere generare lună ===");

    try {
      // Folosim bazele primite ca props
      pushLog(`✅ Folosesc bazele deja încărcate`);

      // Validare 4: Verificăm dacă luna țintă există deja
      const monthAlreadyExists = checkMonthExists(databases.depcred, selectedMonth, selectedYear);
      if (monthAlreadyExists) {
        const confirmMsg = `Datele pentru luna ${String(selectedMonth).padStart(2, "0")}-${selectedYear} există deja în DEPCRED.db.\n\nDoriți să le ștergeți și să le regenerați?`;

        if (!window.confirm(confirmMsg)) {
          pushLog("ℹ️ Generare anulată de utilizator.");
          setRunning(false);
          return;
        }

        pushLog(`⏳ Se șterg datele existente pentru ${String(selectedMonth).padStart(2, "0")}-${selectedYear}...`);
        try {
          deleteMonth(databases.depcred, selectedMonth, selectedYear);
          pushLog("✅ Date existente șterse.");
        } catch (deleteErr) {
          pushLog(`❌ Ștergerea datelor existente a eșuat: ${deleteErr}`);
          setRunning(false);
          return;
        }
      }

      pushLog(`--- Generare ${String(selectedMonth).padStart(2, "0")}-${selectedYear} ---`);
      const summary = generateMonth({
        depcredDb: databases.depcred,
        membriiDb: databases.membrii,
        lichidatiDb: databases.lichidati,
        activiDb: databases.activi,
        targetMonth: selectedMonth,
        targetYear: selectedYear,
        onProgress: (m) => pushLog(m),
      });

      pushLog("--- Final generare ---");
      pushLog(JSON.stringify(summary, null, 2));

      setDepcredDbForSave(databases.depcred);
      setCanSave(true);
      pushLog("📝 Generare finalizată. Apasă 'Salvează DEPCRED actualizat' pentru a salva manual.");

      // Actualizăm perioada curentă după generare cu succes
      setCurrentMonth(selectedMonth);
      setCurrentYear(selectedYear);
      setCurrentPeriod(`${String(selectedMonth).padStart(2, "0")}-${selectedYear}`);

    } catch (e: any) {
      pushLog("❌ Eroare: " + (e?.message ?? String(e)));
    } finally {
      setRunning(false);
    }
  }

  async function handleDelete() {
    if (running) {
      alert("Un proces este deja în curs. Așteptați finalizarea.");
      return;
    }

    if (currentMonth === 0 || currentYear === 0) {
      alert("Nu este încărcată nicio lună procesată pentru a putea șterge.");
      return;
    }

    const confirmMsg = `Sunteți ABSOLUT sigur că doriți să ștergeți TOATE înregistrările pentru ultima lună generată (${String(currentMonth).padStart(2, "0")}-${currentYear}) din DEPCRED.db?\n\n!!! ACEASTĂ ACȚIUNE ESTE IREVERSIBILĂ !!!`;

    if (!window.confirm(confirmMsg)) {
      pushLog(`ℹ️ Ștergerea lunii ${String(currentMonth).padStart(2, "0")}-${currentYear} a fost anulată.`);
      return;
    }

    setRunning(true);
    pushLog(`⏳ Se șterg datele pentru luna ${String(currentMonth).padStart(2, "0")}-${currentYear}...`);

    try {
      deleteMonth(databases.depcred, currentMonth, currentYear);
      pushLog(`✅ Datele lunii ${String(currentMonth).padStart(2, "0")}-${currentYear} șterse.`);

      // Actualizăm perioada curentă (revenind la luna anterioară)
      const newMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const newYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      setCurrentMonth(newMonth);
      setCurrentYear(newYear);
      setCurrentPeriod(`${String(newMonth).padStart(2, "0")}-${newYear}`);

      pushLog("ℹ️ Perioada curentă actualizată.");
    } catch (err) {
      pushLog(`❌ Ștergerea a eșuat: ${err}`);
    } finally {
      setRunning(false);
    }
  }

  function handleSave() {
  if (!depcredDbForSave) return;
  const data = depcredDbForSave.export();
  const blob = new Blob([new Uint8Array(data)], { type: "application/x-sqlite3" });
  if (savedBlobUrl) URL.revokeObjectURL(savedBlobUrl);
  const url = URL.createObjectURL(blob);
  setSavedBlobUrl(url);
  const a = document.createElement("a");
  a.href = url;
  a.download = `DEPCRED_${selectedYear}_${String(selectedMonth).padStart(2, "0")}.db`;
  a.click();
  pushLog(`💾 Fișier pregătit pentru salvare: ${a.download}`);
}

  // Încărcare inițială pentru a detecta perioada curentă
  useEffect(() => {
    // Prevenim double-loading în React StrictMode (development)
    if (isInitialized) return;
    setIsInitialized(true);

    async function loadInitialPeriod() {
      setLog(["🔄 Detectare ultima lună din baza de date..."]);

      try {
        // Query EXACT din Python: ORDER BY anul DESC, luna DESC LIMIT 1
        const res = databases.depcred.exec("SELECT anul, luna FROM depcred ORDER BY anul DESC, luna DESC LIMIT 1");
        if (res.length && res[0].values.length > 0) {
          const an = Number(res[0].values[0][0]);
          const luna = Number(res[0].values[0][1]);
          setCurrentMonth(luna);
          setCurrentYear(an);
          setCurrentPeriod(`${String(luna).padStart(2, "0")}-${an}`);

          const nextLuna = luna === 12 ? 1 : luna + 1;
          const nextAn = luna === 12 ? an + 1 : an;
          setSelectedMonth(nextLuna);
          setSelectedYear(nextAn);
          setNextPeriod(`${String(nextLuna).padStart(2, "0")}-${nextAn}`);

          pushLog(`📅 Ultima lună din DEPCRED: ${String(luna).padStart(2, "0")}-${an}`);
          pushLog(`➡️ Următoarea lună de generat: ${String(nextLuna).padStart(2, "0")}-${nextAn}`);
          pushLog("✅ Sistem gata pentru generare!");
        } else {
          pushLog("⚠️ DEPCRED este gol - nu există date despre luni anterioare.");
          pushLog("   Aceasta poate fi prima rulare sau baza de date este goală.");
        }
      } catch (err) {
        pushLog("❌ Eroare la încărcare inițială: " + (err as Error).message);
      }
    }

    loadInitialPeriod();
  }, [isInitialized, databases]);

  return (
    <div className="p-4 bg-slate-100 min-h-screen font-sans text-sm flex flex-col gap-4">
      {/* Header cu buton înapoi */}
      <div className="bg-white border rounded p-3 shadow-sm">
        <button
          onClick={onBack}
          className="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1 rounded mb-2"
        >
          ← Înapoi la Dashboard
        </button>
      </div>

      {/* Info perioadă */}
      <div className="flex flex-wrap justify-between items-center bg-white border rounded p-3 shadow-sm">
        <div>Ultima lună: <b>{currentPeriod ?? "—"}</b></div>
        <div>Următoarea lună: <b>{nextPeriod ?? "—"}</b></div>
        <div>Rată dobândă lichidare: <b>{rate.toFixed(1)}‰</b></div>
      </div>

      {/* Acțiuni */}
      <div className="flex flex-wrap gap-2 bg-white border rounded p-3 shadow-sm items-center">
        <label className="mr-2">Selectați luna:</label>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          disabled={running || currentMonth === 0}
          className="border rounded px-2 py-1 disabled:opacity-50"
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
          disabled={running || currentMonth === 0}
          className="border rounded px-2 py-1 disabled:opacity-50"
        >
          {currentYear > 0 ? (
            Array.from({ length: 3 }).map((_, idx) => {
              const y = currentYear - 1 + idx; // An anterior, curent, următor
              return <option key={y} value={y}>{y}</option>;
            })
          ) : (
            Array.from({ length: 5 }).map((_, idx) => {
              const y = 2023 + idx;
              return <option key={y} value={y}>{y}</option>;
            })
          )}
        </select>

        <button
          onClick={handleGenerate}
          disabled={running || currentMonth === 0}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1 rounded disabled:opacity-40"
        >
          {running ? "Se rulează..." : "Generează Lună Selectată"}
        </button>

        <button
          onClick={handleDelete}
          disabled={running || currentMonth === 0}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded disabled:opacity-40"
        >
          Șterge Lună Selectată
        </button>

        <button
          disabled={running}
          className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-3 py-1 rounded disabled:opacity-40"
        >
          Modifică Rata Dobândă
        </button>
      </div>

      {/* Butoane secundare */}
      <div className="flex flex-wrap gap-2 bg-white border rounded p-3 shadow-sm">
        <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded disabled:opacity-40" disabled={running}>
          Numere de fișă nealocate
        </button>
        <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded disabled:opacity-40" disabled={running}>
          Afișează membri lichidați
        </button>
        <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded disabled:opacity-40" disabled={running}>
          Afișează membri activi
        </button>
        <div className="ml-auto flex gap-2">
          <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded disabled:opacity-40" disabled={running}>
            Exportă rezumat
          </button>
          <button onClick={() => setLog([])} className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded">
            Șterge log
          </button>
        </div>
      </div>

      {/* Zona log */}
      <div className="flex-1 bg-white border rounded p-3 shadow-sm overflow-auto min-h-[300px]">
        <pre className="text-xs whitespace-pre-wrap font-mono">{log.join("\n")}</pre>
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
        {canSave && <span className="self-center text-sm text-slate-600">Fișier pregătit pentru salvare.</span>}
      </div>
    </div>
  );
}