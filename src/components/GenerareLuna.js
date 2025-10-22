import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import initSqlJs from "sql.js";
import { generateMonth, deleteMonth } from "../logic/generateMonth";
const MONTHS = [
    "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
    "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
];
export default function GenerareLuna() {
    const [currentPeriod, setCurrentPeriod] = useState(null);
    const [nextPeriod, setNextPeriod] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(0);
    const [currentYear, setCurrentYear] = useState(0);
    const [rate] = useState(0.4);
    const [log, setLog] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(0);
    const [selectedYear, setSelectedYear] = useState(0);
    const [running, setRunning] = useState(false);
    const [canSave, setCanSave] = useState(false);
    const [savedBlobUrl, setSavedBlobUrl] = useState(null);
    const [depcredDbForSave, setDepcredDbForSave] = useState(null);
    const [loadedDbs, setLoadedDbs] = useState(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const pushLog = (msg) => setLog(prev => [...prev, msg]);
    // Actualizare display următoare lună când se schimbă selecția
    useEffect(() => {
        if (currentMonth === 0 || currentYear === 0)
            return;
        // Calculăm următoarea lună logică (pentru display)
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
        const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
        setNextPeriod(`${String(nextMonth).padStart(2, "0")}-${nextYear}`);
    }, [currentMonth, currentYear]);
    async function fetchTextIfExists(path) {
        try {
            const r = await fetch(path, { cache: "no-store" });
            if (!r.ok)
                return null;
            return await r.text();
        }
        catch {
            return null;
        }
    }
    async function headExists(path) {
        try {
            const r = await fetch(path, { method: "HEAD", cache: "no-store" });
            return r.ok;
        }
        catch {
            return false;
        }
    }
    async function detectDualCurrency() {
        const txt = await fetchTextIfExists("/dual_currency.json");
        if (txt) {
            try {
                const j = JSON.parse(txt);
                const truthy = j?.converted || j?.active || j?.enabled || j?.use_eur || j?.eur || j?.mode === "EUR" || j?.currency === "EUR";
                if (truthy) {
                    const suffix = j?.suffix || "EUR";
                    pushLog(`🔍 dual_currency.json: conversie detectată, folosim sufix ${suffix}`);
                    return { active: true, suffix };
                }
            }
            catch {
                // ignore parse errors
            }
        }
        const candidates = ["MEMBRII_EUR.db", "DEPCRED_EUR.db"];
        for (const c of candidates) {
            const exists = await headExists(`/${c}`);
            if (exists) {
                const resp = await fetch(`/${c}`, { cache: "no-store" });
                const buf = await resp.arrayBuffer();
                const u8 = new Uint8Array(buf);
                const header = new TextDecoder().decode(u8.slice(0, 15));
                if (header.startsWith("SQLite format")) {
                    pushLog(`🔍 Fișier ${c} valid → presupun conversie activă.`);
                    return { active: true, suffix: "_EUR" };
                }
                else {
                    pushLog(`⚠️ Fișier ${c} găsit dar invalid → ignor conversia.`);
                }
            }
        }
        pushLog("➡️ Nu există baze de date EUR valide. Se vor folosi fișierele RON.");
        return { active: false, suffix: null };
    }
    async function loadDb(sql, name, suffixHint) {
        const base = name.replace(/\.db$/i, "");
        const tryNames = [];
        if (suffixHint) {
            const s = suffixHint.startsWith("_") ? suffixHint : `_${suffixHint}`;
            tryNames.push(`${base}${s}.db`);
        }
        tryNames.push(`${base}.db`);
        for (const n of tryNames) {
            try {
                const resp = await fetch(`/${n}`, { cache: "no-store" });
                if (!resp.ok)
                    continue;
                const buf = await resp.arrayBuffer();
                const u8 = new Uint8Array(buf);
                const header = new TextDecoder().decode(u8.slice(0, 15));
                if (!header.startsWith("SQLite format")) {
                    pushLog(`⚠️ Fișier ${n} nu este o bază SQLite validă, îl ignor.`);
                    continue;
                }
                pushLog(`📥 Încarc ${n}`);
                return new sql.Database(u8);
            }
            catch (e) {
                continue;
            }
        }
        throw new Error(`❌ Niciuna dintre variante (${tryNames.join(", ")}) nu este o bază de date validă.`);
    }
    async function loadAllDbs(sql, suffixHint) {
        const membrii = await loadDb(sql, "MEMBRII.db", suffixHint);
        const depcred = await loadDb(sql, "DEPCRED.db", suffixHint);
        let lichidati;
        let activi;
        try {
            lichidati = await loadDb(sql, "LICHIDATI.db", suffixHint);
        }
        catch { }
        try {
            activi = await loadDb(sql, "ACTIVI.db", suffixHint);
        }
        catch { }
        return { membrii, depcred, lichidati, activi, usedSuffix: suffixHint };
    }
    function checkMonthExists(db, month, year) {
        try {
            const res = db.exec("SELECT 1 FROM depcred WHERE luna=? AND anul=? LIMIT 1", [month, year]);
            return res.length > 0 && res[0].values.length > 0;
        }
        catch {
            return false;
        }
    }
    async function handleGenerate() {
        if (running)
            return;
        // Validare 0: Verificăm dacă bazele sunt încărcate
        if (!loadedDbs) {
            pushLog("❌ Bazele de date nu sunt încărcate. Reîncărcați pagina.");
            return;
        }
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
            // Folosim bazele deja încărcate în loc să le reîncărcăm
            pushLog(`✅ Folosesc bazele deja încărcate (sufix: ${loadedDbs.usedSuffix ?? "none"})`);
            // Validare 4: Verificăm dacă luna țintă există deja
            const monthAlreadyExists = checkMonthExists(loadedDbs.depcred, selectedMonth, selectedYear);
            if (monthAlreadyExists) {
                const confirmMsg = `Datele pentru luna ${String(selectedMonth).padStart(2, "0")}-${selectedYear} există deja în DEPCRED.db.\n\nDoriți să le ștergeți și să le regenerați?`;
                if (!window.confirm(confirmMsg)) {
                    pushLog("ℹ️ Generare anulată de utilizator.");
                    setRunning(false);
                    return;
                }
                pushLog(`⏳ Se șterg datele existente pentru ${String(selectedMonth).padStart(2, "0")}-${selectedYear}...`);
                try {
                    deleteMonth(loadedDbs.depcred, selectedMonth, selectedYear);
                    pushLog("✅ Date existente șterse.");
                }
                catch (deleteErr) {
                    pushLog(`❌ Ștergerea datelor existente a eșuat: ${deleteErr}`);
                    setRunning(false);
                    return;
                }
            }
            pushLog(`--- Generare ${String(selectedMonth).padStart(2, "0")}-${selectedYear} ---`);
            const summary = generateMonth({
                depcredDb: loadedDbs.depcred,
                membriiDb: loadedDbs.membrii,
                lichidatiDb: loadedDbs.lichidati,
                activiDb: loadedDbs.activi,
                targetMonth: selectedMonth,
                targetYear: selectedYear,
                onProgress: (m) => pushLog(m),
            });
            pushLog("--- Final generare ---");
            pushLog(JSON.stringify(summary, null, 2));
            setDepcredDbForSave(loadedDbs.depcred);
            setCanSave(true);
            pushLog("📝 Generare finalizată. Apasă 'Salvează DEPCRED actualizat' pentru a salva manual.");
            // Actualizăm perioada curentă după generare cu succes
            setCurrentMonth(selectedMonth);
            setCurrentYear(selectedYear);
            setCurrentPeriod(`${String(selectedMonth).padStart(2, "0")}-${selectedYear}`);
        }
        catch (e) {
            pushLog("❌ Eroare: " + (e?.message ?? String(e)));
        }
        finally {
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
        if (!loadedDbs || !loadedDbs.depcred) {
            alert("Bazele de date nu sunt încărcate. Rulați mai întâi o generare.");
            return;
        }
        setRunning(true);
        pushLog(`⏳ Se șterg datele pentru luna ${String(currentMonth).padStart(2, "0")}-${currentYear}...`);
        try {
            deleteMonth(loadedDbs.depcred, currentMonth, currentYear);
            pushLog(`✅ Datele lunii ${String(currentMonth).padStart(2, "0")}-${currentYear} șterse.`);
            // Actualizăm perioada curentă (revenind la luna anterioară)
            const newMonth = currentMonth === 1 ? 12 : currentMonth - 1;
            const newYear = currentMonth === 1 ? currentYear - 1 : currentYear;
            setCurrentMonth(newMonth);
            setCurrentYear(newYear);
            setCurrentPeriod(`${String(newMonth).padStart(2, "0")}-${newYear}`);
            pushLog("ℹ️ Perioada curentă actualizată.");
        }
        catch (err) {
            pushLog(`❌ Ștergerea a eșuat: ${err}`);
        }
        finally {
            setRunning(false);
        }
    }
    function handleSave() {
        if (!depcredDbForSave)
            return;
        const data = depcredDbForSave.export();
        const blob = new Blob([new Uint8Array(data)], { type: "application/x-sqlite3" });
        if (savedBlobUrl)
            URL.revokeObjectURL(savedBlobUrl);
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
        if (isInitialized)
            return;
        setIsInitialized(true);
        async function loadInitialPeriod() {
            setLog(["🔄 Încărcare inițială - detectare ultima lună din baza de date..."]);
            try {
                const SQL = await initSqlJs({
                    locateFile: (f) => `https://sql.js.org/dist/${f}`,
                });
                pushLog("✅ SQL.js încărcat cu succes");
                const dual = await detectDualCurrency();
                const suffix = dual.active ? (dual.suffix === "_EUR" ? "_EUR" : `_${dual.suffix}`) : null;
                const dbs = await loadAllDbs(SQL, suffix);
                setLoadedDbs(dbs);
                pushLog("✅ Baze de date încărcate cu succes");
                // Query EXACT din Python: ORDER BY anul DESC, luna DESC LIMIT 1
                const res = dbs.depcred.exec("SELECT anul, luna FROM depcred ORDER BY anul DESC, luna DESC LIMIT 1");
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
                }
                else {
                    pushLog("⚠️ DEPCRED este gol - nu există date despre luni anterioare.");
                    pushLog("   Aceasta poate fi prima rulare sau baza de date este goală.");
                }
            }
            catch (err) {
                pushLog("❌ Eroare la încărcare inițială: " + err.message);
            }
        }
        loadInitialPeriod();
    }, [isInitialized]);
    return (_jsxs("div", { className: "p-4 bg-slate-100 min-h-screen font-sans text-sm flex flex-col gap-4", children: [_jsxs("div", { className: "flex flex-wrap justify-between items-center bg-white border rounded p-3 shadow-sm", children: [_jsxs("div", { children: ["Ultima lun\u0103: ", _jsx("b", { children: currentPeriod ?? "—" })] }), _jsxs("div", { children: ["Urm\u0103toarea lun\u0103: ", _jsx("b", { children: nextPeriod ?? "—" })] }), _jsxs("div", { children: ["Rat\u0103 dob\u00E2nd\u0103 lichidare: ", _jsxs("b", { children: [rate.toFixed(1), "\u2030"] })] })] }), _jsxs("div", { className: "flex flex-wrap gap-2 bg-white border rounded p-3 shadow-sm items-center", children: [_jsx("label", { className: "mr-2", children: "Selecta\u021Bi luna:" }), _jsx("select", { value: selectedMonth, onChange: (e) => setSelectedMonth(Number(e.target.value)), disabled: running || currentMonth === 0, className: "border rounded px-2 py-1 disabled:opacity-50", children: MONTHS.map((m, i) => (_jsxs("option", { value: i + 1, children: [String(i + 1).padStart(2, "0"), " - ", m] }, i))) }), _jsx("select", { value: selectedYear, onChange: (e) => setSelectedYear(Number(e.target.value)), disabled: running || currentMonth === 0, className: "border rounded px-2 py-1 disabled:opacity-50", children: currentYear > 0 ? (Array.from({ length: 3 }).map((_, idx) => {
                            const y = currentYear - 1 + idx; // An anterior, curent, următor
                            return _jsx("option", { value: y, children: y }, y);
                        })) : (Array.from({ length: 5 }).map((_, idx) => {
                            const y = 2023 + idx;
                            return _jsx("option", { value: y, children: y }, y);
                        })) }), _jsx("button", { onClick: handleGenerate, disabled: running || currentMonth === 0, className: "bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1 rounded disabled:opacity-40", children: running ? "Se rulează..." : "Generează Lună Selectată" }), _jsx("button", { onClick: handleDelete, disabled: running || currentMonth === 0, className: "bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded disabled:opacity-40", children: "\u0218terge Lun\u0103 Selectat\u0103" }), _jsx("button", { disabled: running, className: "bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-3 py-1 rounded disabled:opacity-40", children: "Modific\u0103 Rata Dob\u00E2nd\u0103" })] }), _jsxs("div", { className: "flex flex-wrap gap-2 bg-white border rounded p-3 shadow-sm", children: [_jsx("button", { className: "bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded disabled:opacity-40", disabled: running, children: "Numere de fi\u0219\u0103 nealocate" }), _jsx("button", { className: "bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded disabled:opacity-40", disabled: running, children: "Afi\u0219eaz\u0103 membri lichida\u021Bi" }), _jsx("button", { className: "bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded disabled:opacity-40", disabled: running, children: "Afi\u0219eaz\u0103 membri activi" }), _jsxs("div", { className: "ml-auto flex gap-2", children: [_jsx("button", { className: "bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded disabled:opacity-40", disabled: running, children: "Export\u0103 rezumat" }), _jsx("button", { onClick: () => setLog([]), className: "bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded", children: "\u0218terge log" })] })] }), _jsx("div", { className: "flex-1 bg-white border rounded p-3 shadow-sm overflow-auto min-h-[300px]", children: _jsx("pre", { className: "text-xs whitespace-pre-wrap font-mono", children: log.join("\n") }) }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: handleSave, disabled: !canSave, className: "bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded disabled:opacity-40", children: "\uD83D\uDCBE Salveaz\u0103 DEPCRED actualizat" }), canSave && _jsx("span", { className: "self-center text-sm text-slate-600", children: "Fi\u0219ier preg\u0103tit pentru salvare." })] })] }));
}
