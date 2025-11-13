import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveDB } from "@/services/databaseManager";
import { formatNumberRO as formatNumberROUtil } from "@/lib/utils";
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
export default function Statistici({ databases, onBack }) {
    const depcredDb = useMemo(() => resolveDb(databases, "depcred"), [databases]);
    const membriiDb = useMemo(() => resolveDb(databases, "membrii"), [databases]);
    const chitanteDb = useMemo(() => resolveDb(databases, "chitante"), [databases]);
    const [now, setNow] = useState(() => new Date());
    const [refMY, setRefMY] = useState(null);
    const [cardValues, setCardValues] = useState(() => buildInitialCardState());
    const clockRef = useRef(null);
    const refreshRef = useRef(null);
    const isMobile = useIsMobile();
    // Scroll la top când se montează componenta (pentru mobile)
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);
    useEffect(() => {
        clockRef.current = window.setInterval(() => setNow(new Date()), 1000);
        return () => {
            if (clockRef.current)
                window.clearInterval(clockRef.current);
        };
    }, []);
    useEffect(() => {
        const load = () => {
            console.log('🔄 Loading statistics with DBs:', {
                depcredDb: !!depcredDb,
                membriiDb: !!membriiDb,
                chitanteDb: !!chitanteDb
            });
            try {
                const computation = computeStatistics(depcredDb, membriiDb, chitanteDb);
                console.log('✅ Statistics computed successfully:', computation.ref);
                setRefMY(computation.ref);
                setCardValues(computation.cards);
            }
            catch (err) {
                console.error("[Statistici] Eșec calcul statistici", err);
                setCardValues(buildErrorCardState());
            }
        };
        load();
        refreshRef.current = window.setInterval(load, 30000);
        return () => {
            if (refreshRef.current)
                window.clearInterval(refreshRef.current);
        };
    }, [depcredDb, membriiDb, chitanteDb]);
    return (_jsxs("div", { className: "w-full h-full select-none", children: [_jsx(HeaderBar, { now: now, refPeriod: refMY, isMobile: isMobile }), _jsx("div", { className: "grid gap-2 p-3 " +
                    (isMobile ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"), children: CARD_SPECS.map((card) => (_jsx(StatCard, { spec: card, isMobile: isMobile, children: cardValues[card.key] }, card.key))) }), _jsx("div", { className: "px-3 pb-3", children: onBack && (_jsx("button", { onClick: onBack, className: "px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white transition", children: "\u2190 \u00CEnapoi" })) })] }));
}
function computeStatistics(depcredDb, membriiDb, chitanteDb) {
    console.log('📊 Starting statistics computation...');
    if (!depcredDb) {
        console.error('❌ DEPCRED database not available');
        throw new Error("DEPCRED indisponibil");
    }
    const { ref, source } = detectReferencePeriods(depcredDb);
    console.log('📅 Reference month detected:', ref);
    const condRef = `LUNA=${ref.luna} AND ANUL=${ref.anul}`;
    console.log('🔍 Using condition:', condRef);
    const sourcePeriod = source ? { luna_sursa: source.luna, anul_sursa: source.anul } : null;
    const fallbackSource = calendarPreviousMonth(ref.luna, ref.anul);
    const { luna_sursa, anul_sursa } = sourcePeriod ?? fallbackSource;
    console.log('📅 Source month for comparisons:', { luna_sursa, anul_sursa, provenienta: source ? 'db' : 'calendar' });
    try {
        const testCount = execSqlNumber(depcredDb, `SELECT COUNT(*) FROM DEPCRED WHERE ${condRef}`);
        console.log(`✅ Test query successful. Records in current month: ${testCount}`);
    }
    catch (error) {
        console.error('❌ Test query failed:', error);
    }
    const total_membri = membriiDb ? execSqlNumber(membriiDb, "SELECT COUNT(*) FROM MEMBRII") : 0;
    console.log('👥 Total members:', total_membri);
    const membri_activi = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT NR_FISA)
       FROM DEPCRED
       WHERE ${condRef}
         AND (DEP_SOLD>0 OR IMPR_SOLD>0 OR DEP_DEB>0 OR DEP_CRED>0 OR IMPR_DEB>0 OR IMPR_CRED>0)`);
    console.log('✅ Active members:', membri_activi);
    let membri_inactivi = Math.max(0, total_membri - membri_activi);
    if (membriiDb) {
        const allMembers = execSqlColumn(membriiDb, "SELECT NR_FISA FROM MEMBRII");
        if (allMembers) {
            const activeMembers = execSqlColumn(depcredDb, `SELECT DISTINCT NR_FISA FROM DEPCRED
          WHERE ${condRef}
            AND (DEP_SOLD>0 OR IMPR_SOLD>0 OR DEP_DEB>0 OR DEP_CRED>0 OR IMPR_DEB>0 OR IMPR_CRED>0)`);
            if (activeMembers) {
                const activeSet = new Set(activeMembers
                    .map(normalizeFisaId)
                    .filter((id) => typeof id === "string" && id.length > 0));
                membri_inactivi = allMembers.reduce((count, raw) => {
                    const id = normalizeFisaId(raw);
                    return id && !activeSet.has(id) ? count + 1 : count;
                }, 0);
            }
            else {
                membri_inactivi = allMembers.length;
            }
        }
    }
    console.log('📉 Inactive members:', membri_inactivi);
    const membri_cu_imprumuturi = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT NR_FISA)
       FROM DEPCRED
       WHERE ${condRef} AND IMPR_SOLD>0`);
    console.log('🏦 Members with loans:', membri_cu_imprumuturi);
    const sold_total_depuneri = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(DEP_SOLD),0) FROM DEPCRED WHERE ${condRef}`);
    const total_depuneri_cotizatii = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(DEP_DEB),0) FROM DEPCRED WHERE ${condRef}`);
    const total_retrageri_fs = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(DEP_CRED),0) FROM DEPCRED WHERE ${condRef}`);
    const total_dobanda = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(DOBANDA),0) FROM DEPCRED WHERE ${condRef}`);
    const sold_total_imprumuturi = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(IMPR_SOLD),0) FROM DEPCRED WHERE ${condRef}`);
    const total_rate_achitate = execSqlNumber(depcredDb, `SELECT COALESCE(SUM(IMPR_CRED),0) FROM DEPCRED WHERE ${condRef}`);
    const total_general_platit = total_dobanda + total_rate_achitate + total_depuneri_cotizatii;
    const imprumuturi_noi = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT NR_FISA)
       FROM DEPCRED
       WHERE ${condRef} AND IMPR_DEB>0`);
    const prima_rata_stabilit = source
        ? execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT tinta.NR_FISA)
           FROM DEPCRED AS tinta
           INNER JOIN DEPCRED AS sursa
             ON tinta.NR_FISA = sursa.NR_FISA
            AND sursa.LUNA = ${luna_sursa} AND sursa.ANUL = ${anul_sursa}
           WHERE tinta.LUNA = ${ref.luna} AND tinta.ANUL = ${ref.anul}
             AND sursa.IMPR_DEB > 0
             AND tinta.IMPR_SOLD > 0.005
             AND (tinta.IMPR_CRED = 0 OR tinta.IMPR_CRED IS NULL)
             AND (tinta.IMPR_DEB = 0 OR tinta.IMPR_DEB IS NULL)`)
        : 0;
    const rest_cot = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT NR_FISA)
       FROM DEPCRED
       WHERE ${condRef} AND DEP_DEB <= 0`);
    const rest_imp = execSqlNumber(depcredDb, `SELECT COUNT(DISTINCT NR_FISA)
       FROM DEPCRED
       WHERE ${condRef} AND IMPR_CRED <= 0 AND IMPR_SOLD > 0`);
    const chitante = buildChitanteCard(chitanteDb);
    console.log('📈 Final calculations:', {
        sold_total_depuneri,
        total_depuneri_cotizatii,
        total_retrageri_fs,
        total_dobanda,
        sold_total_imprumuturi,
        total_rate_achitate,
        total_general_platit,
        imprumuturi_noi,
        prima_rata_stabilit,
        rest_cot,
        rest_imp
    });
    return {
        ref,
        cards: {
            total: _jsx(CenteredCount, { color: "#2980b9", value: total_membri }),
            activi: _jsx(CenteredCount, { color: "#3498db", value: membri_activi }),
            inactivi: _jsx(CenteredCount, { color: "#85c1e9", value: membri_inactivi }),
            cu_imprumuturi: _jsx(CenteredCount, { color: "#1f618d", value: membri_cu_imprumuturi }),
            sold_total_depuneri: _jsx(ValuePill, { color: "#27ae60", value: sold_total_depuneri, decimals: 2 }),
            total_depuneri_cotizatii: _jsx(ValuePill, { color: "#2ecc71", value: total_depuneri_cotizatii, decimals: 2 }),
            total_retrageri_fs: _jsx(ValuePill, { color: "#58d68d", value: total_retrageri_fs, decimals: 2 }),
            total_dobanda: _jsx(ValuePill, { color: "#186a3b", value: total_dobanda, decimals: 2 }),
            sold_total_imprumuturi: _jsx(ValuePill, { color: "#e74c3c", value: sold_total_imprumuturi, decimals: 2 }),
            total_rate_achitate: _jsx(ValuePill, { color: "#d35400", value: total_rate_achitate, decimals: 2 }),
            total_general_platit: _jsx(ValuePill, { color: "#8e44ad", value: total_general_platit, decimals: 2 }),
            imprumuturi_noi: _jsx(StackedBadge, { color: "#c0392b", value: imprumuturi_noi, label: "membri" }),
            rest_cot: _jsx(StackedBadge, { color: "#f39c12", value: rest_cot, label: "membri" }),
            rest_imp: _jsx(StackedBadge, { color: "#8e44ad", value: rest_imp, label: "neachitate" }),
            chitante,
            prima_rata_stabilit: (_jsx(StackedBadge, { color: prima_rata_stabilit > 0 ? "#16a085" : "#95a5a6", value: prima_rata_stabilit, label: "membri" })),
        },
    };
}
function buildChitanteCard(chitanteDb) {
    if (!chitanteDb) {
        return _jsx(MiniMessage, { message: "\uD83D\uDEAB Nu exist\u0103 date", tone: "muted" });
    }
    const row = execSqlRow(chitanteDb, "SELECT STARTCH_PR, STARTCH_AC FROM CHITANTE ORDER BY ROWID DESC LIMIT 1");
    if (!row || row.length < 2) {
        return _jsx(MiniMessage, { message: "\uD83D\uDEAB Nu exist\u0103 date", tone: "muted" });
    }
    const precedent = Number(row[0] ?? 0);
    const curent = Number(row[1] ?? 0);
    const tiparite = curent >= precedent ? curent - precedent : 0;
    return (_jsxs("div", { className: "flex flex-col items-center text-[11px] leading-tight text-slate-800", children: [_jsx("span", { className: "font-semibold text-blue-600", children: "Precedent:" }), _jsx("span", { className: "mb-1", children: formatNumberRO(precedent, 0) }), _jsx("span", { className: "font-semibold text-blue-600", children: "Curent:" }), _jsx("span", { className: "mb-1", children: formatNumberRO(curent, 0) }), _jsxs("span", { className: "font-semibold text-green-600 text-[12px]", children: ["Tip\u0103rite: ", formatNumberRO(tiparite, 0)] })] }));
}
function detectReferencePeriods(depcredDb) {
    const ultimaBruta = execSqlSingle(depcredDb, "SELECT MAX(ANUL * 100 + LUNA) FROM DEPCRED");
    const ultima = normalizePeriodValue(ultimaBruta);
    console.log('📅 Ultima perioadă găsită:', ultima);
    if (!ultima) {
        throw new Error('Nu există date disponibile în DEPCRED pentru statistici');
    }
    const ref = decodePeriodValue(ultima);
    const sursaBruta = execSqlSingle(depcredDb, `SELECT MAX(ANUL * 100 + LUNA) FROM DEPCRED WHERE (ANUL * 100 + LUNA) < ${ultima}`);
    const sursa = normalizePeriodValue(sursaBruta);
    return { ref, source: sursa ? decodePeriodValue(sursa) : null };
}
function calendarPreviousMonth(luna, anul) {
    if (luna === 1)
        return { luna_sursa: 12, anul_sursa: anul - 1 };
    return { luna_sursa: luna - 1, anul_sursa: anul };
}
function normalizePeriodValue(value) {
    if (value == null)
        return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
    }
    if (typeof value === 'bigint') {
        return value > 0n ? Number(value) : null;
    }
    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
    }
    if (Array.isArray(value)) {
        return value.length > 0 ? normalizePeriodValue(value[0]) : null;
    }
    if (typeof value === 'object') {
        const maybeNumber = Number(value);
        if (Number.isFinite(maybeNumber) && maybeNumber > 0) {
            return Math.trunc(maybeNumber);
        }
        const firstKey = Object.keys(value)[0];
        if (firstKey) {
            const nested = value[firstKey];
            return normalizePeriodValue(nested);
        }
    }
    return null;
}
function decodePeriodValue(period) {
    const anul = Math.floor(period / 100);
    const luna = period % 100;
    return { luna, anul };
}
function HeaderBar({ now, refPeriod, isMobile }) {
    const monthName = (m) => [
        "",
        "Ianuarie",
        "Februarie",
        "Martie",
        "Aprilie",
        "Mai",
        "Iunie",
        "Iulie",
        "August",
        "Septembrie",
        "Octombrie",
        "Noiembrie",
        "Decembrie",
    ][m ?? 0] ?? "Necunoscut";
    return (_jsxs("div", { className: "mx-2 mt-2 mb-1 rounded-xl px-4 flex items-center gap-3 text-white" +
            (isMobile ? " py-3 flex-col items-start" : " h-12 py-0"), style: {
            background: "linear-gradient(90deg, rgba(60,125,200,0.9), rgba(80,150,220,0.92), rgba(60,125,200,0.9))",
            boxShadow: "0 4px 18px rgba(0,0,0,0.18)",
        }, children: [_jsx("div", { className: "font-bold text-[17px]", children: "\uD83D\uDCCA Statistici C.A.R. Petro\u0219ani" }), _jsx("div", { className: "flex-1" }), _jsx("div", { className: "text-[11px] font-semibold", children: refPeriod
                    ? `📅 Referință: ${monthName(refPeriod.luna)} ${refPeriod.anul}`
                    : "📅 Referință: detectare..." }), _jsxs("div", { className: "text-[11px] font-semibold", children: ["\uD83D\uDDD3\uFE0F ", now.toLocaleDateString(), " \u23F0 ", now.toLocaleTimeString()] })] }));
}
function StatCard({ spec, children, isMobile }) {
    return (_jsxs("div", { className: "rounded-xl border border-white/60 backdrop-blur-sm", style: {
            background: "linear-gradient(180deg, rgba(255,255,255,0.6), rgba(230,235,245,0.7))",
            minHeight: isMobile ? 120 : 110,
            boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
        }, children: [_jsxs("div", { className: "flex items-center gap-2 px-3 pt-2", children: [_jsx("div", { className: "w-6 h-6 flex items-center justify-center text-[16px]", "aria-hidden": true, children: _jsx("span", { children: pickEmoji(spec.title) }) }), _jsx("div", { className: "text-[11px] font-bold", style: { color: spec.color }, children: spec.title }), _jsx("div", { className: "flex-1" })] }), _jsx("div", { className: "px-2 pb-3", children: _jsx("div", { className: "mt-1 mx-1 flex items-center justify-center rounded-md", style: {
                        background: "rgba(255,255,255,0.35)",
                        minHeight: spec.multiline ? 70 : 48,
                        padding: spec.multiline ? "6px" : "4px",
                    }, children: children ?? _jsx(MiniMessage, { message: "N/A", tone: "muted" }) }) })] }));
}
function CenteredCount({ color, value }) {
    return (_jsx("div", { className: "flex flex-col items-center", children: _jsx("span", { className: "text-[20px] font-bold", style: { color }, children: formatNumberRO(value, 0) }) }));
}
function ValuePill({ color, value, decimals }) {
    return (_jsx("div", { className: "w-full text-center font-bold rounded-md text-[16px]", style: { color, padding: "4px 6px" }, children: formatNumberRO(value, decimals) }));
}
function StackedBadge({ color, value, label }) {
    return (_jsxs("div", { className: "flex flex-col items-center", children: [_jsx("span", { className: "text-[18px] font-bold", style: { color }, children: formatNumberRO(value, 0) }), _jsx("span", { className: "text-[10px] text-slate-700 uppercase tracking-wide", children: label })] }));
}
function MiniMessage({ message, tone }) {
    const color = tone === "error" ? "#d32f2f" : "#5c6c80";
    return (_jsx("span", { className: "text-[11px] font-semibold text-center", style: { color }, children: message }));
}
function buildInitialCardState() {
    const blank = _jsx(MiniMessage, { message: "Se \u00EEncarc\u0103...", tone: "muted" });
    return CARD_SPECS.reduce((acc, spec) => {
        acc[spec.key] = blank;
        return acc;
    }, {});
}
function buildErrorCardState() {
    const errorNode = _jsx(MiniMessage, { message: "Eroare", tone: "error" });
    return CARD_SPECS.reduce((acc, spec) => {
        acc[spec.key] = errorNode;
        return acc;
    }, {});
}
function useIsMobile(maxWidth = 768) {
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === "undefined")
            return false;
        return window.innerWidth <= maxWidth;
    });
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
        const update = () => setIsMobile(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, [maxWidth]);
    return isMobile;
}
// Funcția formatNumberRO este importată din lib/utils.ts
const formatNumberRO = formatNumberROUtil;
function detectCurrency(dbs) {
    const c = (dbs?.activeCurrency || "").toString().toUpperCase();
    if (c === "EUR" || dbs?.depcredeur || dbs?.membriieur)
        return "EUR";
    return "RON";
}
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
function resolveDb(dbs, role) {
    try {
        const activeDb = getActiveDB(dbs, role === "chitante" ? "chitante" : role);
        const picked = pickDbInstance(activeDb);
        if (picked) {
            console.log(`✅ Active DB resolved for '${role}' via getActiveDB`);
            return picked;
        }
    }
    catch (error) {
        console.warn(`⚠️ getActiveDB failed for '${role}':`, error);
    }
    console.log(`🔄 Falling back to legacy resolution for role: ${role}`);
    const anyDb = dbs;
    if (anyDb[role])
        return pickDbInstance(anyDb[role]);
    const keyCandidates = [role, role.toUpperCase(), role.toLowerCase(), `${role}.db`, `${role.toUpperCase()}.db`];
    for (const key of keyCandidates) {
        if (anyDb[key])
            return pickDbInstance(anyDb[key]);
    }
    const maps = [anyDb.dbMap, anyDb.byName, anyDb.files, anyDb.databases];
    for (const map of maps) {
        if (!map || typeof map.get !== "function")
            continue;
        for (const key of keyCandidates) {
            const candidate = map.get(key) || map.get(key.toLowerCase()) || map.get(key.toUpperCase());
            if (candidate)
                return pickDbInstance(candidate);
        }
    }
    console.warn(`❌ DB not resolved for '${role}'`);
    return null;
}
function pickFirstColumn(row) {
    if (row == null)
        return null;
    if (Array.isArray(row)) {
        return row.length > 0 ? row[0] : null;
    }
    if (typeof row === 'object') {
        const keys = Object.keys(row);
        if (keys.length === 0)
            return null;
        return row[keys[0]];
    }
    return row;
}
function rowToArray(row) {
    if (row == null)
        return null;
    if (Array.isArray(row))
        return row;
    if (typeof row === 'object')
        return Object.values(row);
    return [row];
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
        try {
            if (typeof stmt.step === "function") {
                const hasRow = stmt.step();
                if (!hasRow)
                    return null;
                const row = typeof stmt.get === "function" ? stmt.get() : stmt.getAsObject?.();
                return pickFirstColumn(row);
            }
            if (typeof stmt.get === "function") {
                const row = stmt.get();
                return pickFirstColumn(row);
            }
        }
        finally {
            stmt.free?.();
        }
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
        try {
            if (typeof stmt.step === "function") {
                const hasRow = stmt.step();
                if (!hasRow)
                    return null;
                const row = typeof stmt.get === "function" ? stmt.get() : stmt.getAsObject?.();
                return rowToArray(row);
            }
            if (typeof stmt.all === "function") {
                const rows = stmt.all();
                if (!rows?.length)
                    return null;
                return rowToArray(rows[0]);
            }
            if (typeof stmt.get === "function") {
                const row = stmt.get();
                return rowToArray(row);
            }
        }
        finally {
            stmt.free?.();
        }
    }
    return null;
}
function execSqlNumber(db, sql) {
    const v = execSqlSingle(db, sql);
    return typeof v === "number" ? v : v ? Number(v) : 0;
}
function execSqlColumn(db, sql) {
    if (!db)
        return null;
    if (typeof db.exec === "function") {
        const out = db.exec(sql);
        if (out?.length && out[0]?.values) {
            return out[0].values.map((row) => (Array.isArray(row) ? row[0] : row));
        }
        return [];
    }
    if (typeof db.prepare === "function") {
        const stmt = db.prepare(sql);
        try {
            if (typeof stmt.all === "function") {
                const rows = stmt.all();
                if (!rows?.length)
                    return [];
                return rows.map((row) => pickFirstColumn(row));
            }
            if (typeof stmt.step === "function") {
                const values = [];
                const getRow = typeof stmt.get === "function"
                    ? () => stmt.get()
                    : typeof stmt.getAsObject === "function"
                        ? () => stmt.getAsObject()
                        : null;
                if (getRow) {
                    while (stmt.step()) {
                        values.push(pickFirstColumn(getRow()));
                    }
                    return values;
                }
            }
            if (typeof stmt.get === "function") {
                const row = stmt.get();
                return row == null ? [] : [pickFirstColumn(row)];
            }
        }
        finally {
            stmt.free?.();
        }
    }
    return null;
}
function normalizeFisaId(value) {
    if (value == null)
        return null;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            return null;
        return String(Math.trunc(value));
    }
    if (typeof value === "bigint") {
        return value >= 0n ? value.toString() : value.toString();
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (Array.isArray(value)) {
        return value.length > 0 ? normalizeFisaId(value[0]) : null;
    }
    if (typeof value === "object") {
        const keys = Object.keys(value);
        if (!keys.length)
            return null;
        return normalizeFisaId(value[keys[0]]);
    }
    return null;
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
