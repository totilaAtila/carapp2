import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
const CARD_SPECS = [
    { key: "total", title: "Total membri", color: "#2980b9" },
    { key: "activi", title: "Membri activi", color: "#3498db" },
    { key: "inactivi", title: "Membri inactivi", color: "#85c1e9" },
    { key: "cu_imprumuturi", title: "Membri cu împrumuturi active", color: "#1f618d" },
    { key: "sold_total_depuneri", title: "Sold total depuneri", color: "#27ae60", multiline: true },
    { key: "total_depuneri_cotizatii", title: "Total depuneri (cotizații)", color: "#2ecc71", multiline: true },
    { key: "total_retrageri_fs", title: "Total retrageri Fond Social", color: "#58d68d", multiline: true },
    { key: "total_dobanda", title: "Total dobândă", color: "#186a3b", multiline: true },
    { key: "sold_total_imprumuturi", title: "Sold total împrumut", color: "#e74c3c", multiline: true },
    { key: "total_rate_achitate", title: "Total rate achitate", color: "#d35400", multiline: true },
    { key: "total_general_platit", title: "Total general plătit", color: "#8e44ad", multiline: true },
    { key: "imprumuturi_noi", title: "Membri cu împrumuturi noi", color: "#c0392b", multiline: true },
    { key: "rest_cot", title: "Cotizații neachitate", color: "#f39c12", multiline: true },
    { key: "rest_imp", title: "Rambursări neachitate", color: "#8e44ad", multiline: true },
    { key: "chitante", title: "Chitanțe", color: "#5dade2", multiline: true },
    { key: "prima_rata_stabilit", title: "De stabilit prima rată", color: "#16a085", multiline: true },
];
function formatNumberRO(value, decimals = 0) {
    if (!isFinite(value))
        return "0";
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    const intPart = Math.trunc(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    if (decimals <= 0)
        return sign + intPart;
    const frac = (abs - Math.trunc(abs)).toFixed(decimals).slice(2);
    return `${sign}${intPart},${frac}`;
}
/** Returnează 'RON' sau 'EUR', pe baza câmpului activ sau a cheilor încărcate. */
function detectCurrency(dbs) {
    const c = (dbs?.activeCurrency || "").toString().toUpperCase();
    if (c === "EUR" || dbs?.depcredeur || dbs?.membriieur)
        return "EUR";
    return "RON";
}
/** Scoate instanța sql.js Database din diverse forme de wrapper. */
function pickDbInstance(x) {
    if (!x)
        return null;
    if (typeof x.exec === "function" || typeof x.prepare === "function")
        return x;
    if (x.db && (typeof x.db.exec === "function" || typeof x.db.prepare === "function"))
        return x.db;
    if (x.database && (typeof x.database.exec === "function" || typeof x.database.prepare === "function"))
        return x.database;
    return null;
}
/** Caută DB după chei cunoscute și fallback pe scanare generică. */
function resolveDb(dbs, role) {
    const anyDb = dbs;
    const currency = detectCurrency(anyDb);
    const keyCandidates = [];
    if (role === "depcred") {
        keyCandidates.push("depcred", "DEPCRED", "depcred.db");
        if (currency === "EUR")
            keyCandidates.push("depcredeur", "DEPCREDEUR", "depcredeur.db");
    }
    else if (role === "membrii") {
        keyCandidates.push("membrii", "MEMBRII", "membrii.db");
        if (currency === "EUR")
            keyCandidates.push("membriieur", "MEMBRIIEUR", "membriieur.db");
    }
    else {
        keyCandidates.push("chitante", "CHITANTE", "chitante.db");
    }
    // 1) acces direct
    for (const k of keyCandidates) {
        const cand = anyDb[k];
        const dbi = pickDbInstance(cand);
        if (dbi)
            return dbi;
    }
    // 2) hărți interne: dbMap/byName/files/databases
    const maps = [anyDb.dbMap, anyDb.byName, anyDb.files, anyDb.databases];
    for (const m of maps) {
        if (!m)
            continue;
        if (typeof m.get === "function") {
            for (const k of keyCandidates) {
                const cand = m.get(k) ?? m.get(k.toUpperCase()) ?? m.get(k.toLowerCase());
                const dbi = pickDbInstance(cand);
                if (dbi)
                    return dbi;
            }
        }
        else if (Array.isArray(m)) {
            for (const entry of m) {
                const name = (entry?.name ?? entry?.filename ?? entry?.key ?? "").toString();
                if (!name)
                    continue;
                if (keyCandidates.some((k) => name.toLowerCase().includes(k.toLowerCase().replace(".db", "")))) {
                    const dbi = pickDbInstance(entry?.db ?? entry);
                    if (dbi)
                        return dbi;
                }
            }
        }
    }
    // 3) fallback generic: scanează toate cheile
    for (const k of Object.keys(anyDb)) {
        const want = role === "depcred" ? /depcred/i : role === "membrii" ? /membrii/i : /chitante/i;
        if (want.test(k)) {
            const dbi = pickDbInstance(anyDb[k]);
            if (dbi)
                return dbi;
        }
    }
    console.warn(`[Statistici] DB nerezolvat pentru '${role}' (currency=${currency}).`);
    return null;
}
function execSqlSingle(db, sql) {
    if (typeof db?.exec === "function") {
        const out = db.exec(sql);
        if (out?.length && out[0]?.values?.length)
            return out[0].values[0][0];
        return null;
    }
    if (typeof db?.prepare === "function") {
        const stmt = db.prepare(sql);
        const ok = stmt.step?.();
        const row = ok && stmt.get ? stmt.get() : null;
        stmt.free?.();
        return row ? row[0] : null;
    }
    return null;
}
function execSqlRow(db, sql) {
    if (typeof db?.exec === "function") {
        const out = db.exec(sql);
        if (out?.length && out[0]?.values?.length)
            return out[0].values[0];
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
function execSqlNumber(db, sql) {
    const v = execSqlSingle(db, sql);
    return typeof v === "number" ? v : v ? Number(v) : 0;
}
export default function Statistici({ databases, onBack }) {
    const depcredDb = useMemo(() => resolveDb(databases, "depcred"), [databases]);
    const membriiDb = useMemo(() => resolveDb(databases, "membrii"), [databases]);
    const chitanteDb = useMemo(() => resolveDb(databases, "chitante"), [databases]);
    const [now, setNow] = useState(new Date());
    const [refMY, setRefMY] = useState(null);
    const [values, setValues] = useState({});
    const timerRef = useRef(null);
    const refreshRef = useRef(null);
    // Ceas
    useEffect(() => {
        timerRef.current = window.setInterval(() => setNow(new Date()), 1000);
        return () => { if (timerRef.current)
            window.clearInterval(timerRef.current); };
    }, []);
    // Încărcare și refresh
    useEffect(() => {
        const load = () => {
            try {
                if (!depcredDb)
                    throw new Error("DEPCRED indisponibil");
                // ultima lună/an
                const ultima = execSqlNumber(depcredDb, "SELECT MAX(anul*12 + luna) FROM depcred");
                let luna = new Date().getMonth() + 1;
                let anul = new Date().getFullYear();
                if (ultima) {
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
                const condRef = `anul=${anul} AND luna=${luna}`;
                // --- MEMBRI ---
                const total_membri = membriiDb ? execSqlNumber(membriiDb, "SELECT COUNT(*) FROM membrii") : 0;
                const membri_activi = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT nr_fisa)
           FROM depcred
           WHERE ${condRef}
             AND (dep_sold>0 OR impr_sold>0 OR dep_deb>0 OR dep_cred>0 OR impr_deb>0 OR impr_cred>0)`);
                const membri_inactivi = membriiDb
                    ? execSqlNumber(membriiDb, `SELECT COUNT(*) FROM membrii
               WHERE NR_FISA NOT IN (
                 SELECT DISTINCT nr_fisa FROM depcred
                 WHERE ${condRef}
                   AND (dep_sold>0 OR impr_sold>0 OR dep_deb>0 OR dep_cred>0 OR impr_deb>0 OR impr_cred>0)
               )`)
                    : Math.max(0, total_membri - membri_activi);
                const membri_cu_imprumuturi = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT nr_fisa)
           FROM depcred WHERE ${condRef} AND impr_sold>0`);
                // --- SUME ---
                const sold_total_depuneri = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(dep_sold),0)   FROM depcred WHERE ${condRef}`);
                const total_depuneri_cotizatii = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(dep_deb),0)    FROM depcred WHERE ${condRef}`);
                const total_retrageri_fs = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(dep_cred),0)   FROM depcred WHERE ${condRef}`);
                const total_dobanda = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(dobanda),0)    FROM depcred WHERE ${condRef}`);
                const sold_total_imprumuturi = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(impr_sold),0)  FROM depcred WHERE ${condRef}`);
                const total_rate_achitate = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(impr_cred),0)  FROM depcred WHERE ${condRef}`);
                const total_general_platit = total_dobanda + total_rate_achitate + total_depuneri_cotizatii;
                // --- Împrumuturi noi ---
                const imprumuturi_noi = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT nr_fisa) FROM depcred
           WHERE ${condRef} AND impr_deb>0`);
                // --- Prima rată de stabilit ---
                let luna_sursa = luna === 1 ? 12 : luna - 1;
                let anul_sursa = luna === 1 ? anul - 1 : anul;
                const prima_rata_stabilit = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT tinta.nr_fisa)
           FROM depcred AS tinta
           INNER JOIN depcred AS sursa
             ON tinta.nr_fisa = sursa.nr_fisa
            AND sursa.luna = ${luna_sursa} AND sursa.anul = ${anul_sursa}
           WHERE tinta.luna = ${luna} AND tinta.anul = ${anul}
             AND sursa.impr_deb > 0
             AND tinta.impr_sold > 0.005
             AND (tinta.impr_cred = 0 OR tinta.impr_cred IS NULL)
             AND (tinta.impr_deb = 0 OR tinta.impr_deb IS NULL)`);
                // --- Restanțe ---
                const rest_cot = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT nr_fisa) FROM depcred
           WHERE ${condRef} AND dep_deb <= 0`);
                const rest_imp = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT nr_fisa) FROM depcred
           WHERE ${condRef} AND impr_cred <= 0 AND impr_sold > 0`);
                // --- Chitanțe ---
                let chitanteHtml = "🚫 Nu există date";
                if (chitanteDb) {
                    const row = execSqlRow(chitanteDb, "SELECT STARTCH_PR, STARTCH_AC FROM chitante ORDER BY ROWID DESC LIMIT 1");
                    if (row && row.length >= 2) {
                        const pr = Number(row[0] ?? 0);
                        const ac = Number(row[1] ?? 0);
                        const tiparite = ac >= pr ? ac - pr : 0;
                        chitanteHtml =
                            `<div class='text-center leading-tight'>
                 <span class='text-[10px] font-bold text-blue-600'>Precedent:</span> <span class='text-[10px] text-slate-800'>${pr}</span><br/>
                 <span class='text-[10px] font-bold text-blue-600'>Curent:</span> <span class='text-[10px] text-slate-800'>${ac}</span><br/>
                 <b class='text-[11px] text-green-600'>Tipărite: ${tiparite}</b>
               </div>`;
                    }
                }
                setValues({
                    total: total_membri,
                    activi: membri_activi,
                    inactivi: membri_inactivi,
                    cu_imprumuturi: membri_cu_imprumuturi,
                    sold_total_depuneri: htmlVal(sold_total_depuneri, "#27ae60", 0),
                    total_depuneri_cotizatii: htmlVal(total_depuneri_cotizatii, "#2ecc71", 0),
                    total_retrageri_fs: htmlVal(total_retrageri_fs, "#58d68d", 0),
                    total_dobanda: htmlVal(total_dobanda, "#186a3b", 2),
                    sold_total_imprumuturi: htmlVal(sold_total_imprumuturi, "#e74c3c", 0),
                    total_rate_achitate: htmlVal(total_rate_achitate, "#d35400", 2),
                    total_general_platit: htmlVal(total_general_platit, "#8e44ad", 2),
                    imprumuturi_noi: `<div class='text-center'><b class='text-[15px]' style='color:#c0392b'>${imprumuturi_noi}</b><br/><span class='text-[9px] text-slate-500'>membri</span></div>`,
                    rest_cot: `<div class='text-center'><b class='text-[15px]' style='color:#f39c12'>${rest_cot}</b><br/><span class='text-[9px] text-slate-500'>membri</span></div>`,
                    rest_imp: `<div class='text-center'><b class='text-[15px]' style='color:#8e44ad'>${rest_imp}</b><br/><span class='text-[9px] text-slate-500'>neachitate</span></div>`,
                    chitante: chitanteHtml,
                    prima_rata_stabilit: `<div class='text-center'><b class='text-[15px]' style='color:${(prima_rata_stabilit ?? 0) > 0 ? "#16a085" : "#95a5a6"}'>${prima_rata_stabilit}</b><br/><span class='text-[9px] text-slate-500'>membri</span></div>`,
                });
            }
            catch {
                const errVal = "<div class='text-center text-[10px] text-red-600'>Eroare</div>";
                const out = {};
                for (const c of CARD_SPECS)
                    out[c.key] = c.multiline ? errVal : "N/A";
                setValues(out);
            }
        };
        load();
        refreshRef.current = window.setInterval(load, 30000);
        return () => { if (refreshRef.current)
            window.clearInterval(refreshRef.current); };
    }, [depcredDb, membriiDb, chitanteDb]);
    const monthName = (m) => ["", "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"][m ?? 0] ?? "Necunoscut";
    return (_jsxs("div", { className: "w-full h-full", children: [_jsxs("div", { className: "mx-2 my-1 rounded-xl px-4 h-12 flex items-center", style: { background: "linear-gradient(90deg, rgba(60,125,200,0.9), rgba(80,150,220,0.92), rgba(60,125,200,0.9))" }, children: [_jsx("div", { className: "text-white font-bold text-[17px] select-none", children: "\uD83D\uDCCA Statistici C.A.R. Petro\u0219ani" }), _jsx("div", { className: "flex-1" }), _jsx("div", { className: "text-white text-[10px] font-bold mx-3 select-none", children: refMY ? `📅 Referință: ${monthName(refMY.luna)} ${refMY.anul}` : "📅 Referință: detectare..." }), _jsxs("div", { className: "text-white text-[11px] font-bold select-none", children: ["\uD83D\uDDD3\uFE0F ", now.toLocaleDateString(), " \u23F0 ", now.toLocaleTimeString()] })] }), _jsx("div", { className: "grid gap-2 p-3 md:grid-cols-4 sm:grid-cols-2 grid-cols-1", children: CARD_SPECS.map((card) => (_jsx(Card, { title: card.title, color: card.color, multiline: card.multiline, value: values[card.key] }, card.key))) }), _jsx("div", { className: "px-3 pb-3", children: onBack && (_jsx("button", { onClick: onBack, className: "px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white", children: "\u2190 \u00CEnapoi" })) })] }));
}
function htmlVal(x, color, dec) {
    return `<div class='text-center'><b class='text-[15px]' style='color:${color}'>${formatNumberRO(x, dec)}</b></div>`;
}
function Card({ title, color, multiline, value, }) {
    return (_jsxs("div", { className: "rounded-xl border border-white/70", style: { background: "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(230,235,245,0.6))", minHeight: 110, maxHeight: 110, boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }, children: [_jsxs("div", { className: "flex items-center gap-2 px-3 pt-2", children: [_jsx("div", { className: "w-6 h-6 flex items-center justify-center text-[16px]", "aria-hidden": true, children: _jsx("span", { children: pickEmoji(title) }) }), _jsx("div", { className: "text-[11px] font-bold", style: { color }, children: title }), _jsx("div", { className: "flex-1" })] }), _jsx("div", { className: "px-2", children: !multiline ? (_jsx("div", { className: "mt-1 mx-1 text-center font-bold rounded-md", style: { color, background: "rgba(255,255,255,0.3)", fontSize: 18, padding: "6px" }, children: typeof value === "number" ? value : value ?? "0" })) : (_jsx("div", { className: "mt-1 mx-1 text-center font-bold rounded-md", style: { background: "rgba(255,255,255,0.3)", padding: "4px" }, dangerouslySetInnerHTML: { __html: typeof value === "string" ? value : String(value ?? "0") } })) })] }));
}
function pickEmoji(title) {
    const map = {
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
