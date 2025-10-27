import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// src/components/SumeLunare.tsx
/**
 * Modul Sume Lunare - Port complet din sume_lunare.py (2750 linii)
 *
 * FUNCȚIONALITĂȚI:
 * - Search autocomplete pentru membri (nume + nr fișă)
 * - Afișare istoric financiar complet (toate lunile)
 * - 8 coloane cu scroll sincronizat (desktop)
 * - Dialog modificare tranzacție cu calcul rata/luni
 * - Aplicare dobândă la achitare anticipată împrumut
 * - Recalculare automată lunilor ulterioare după modificări
 * - Salvare modificări în DEPCRED.db cu validări complete
 * - Actualizare cotizație standard în MEMBRII.db
 *
 * LAYOUT:
 * - Desktop (≥1024px): 3 secțiuni (Împrumuturi | Dată | Depuneri) cu 8 coloane
 * - Mobile (<1024px): Carduri per lună + search autocomplete
 *
 * LOGICA BUSINESS (100% din Python):
 * - Validări sold împrumut (nu permite plată > sold)
 * - Validări fond disponibil (nu permite retragere > fond)
 * - Calcul dobândă = SUM(impr_sold) × rata_dobanda
 * - Recalculare solduri: sold_nou = sold_vechi + debit - credit
 * - Ajustare sold < 0.005 → 0.00
 */
import { useState, useEffect, useMemo, useRef } from "react";
import Decimal from "decimal.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/buttons";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Loader2, Search, X, Edit, Calculator, RotateCcw, Info, AlertCircle } from "lucide-react";
// Configurare Decimal.js
Decimal.set({
    precision: 20,
    rounding: Decimal.ROUND_HALF_UP
});
// ==========================================
// CONSTANTE ȘI INTERFEȚE
// ==========================================
const MONTHS = [
    "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
    "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
];
const PRAG_ZEROIZARE = new Decimal("0.005"); // Sold < 0.005 → 0.00
const RATA_DOBANDA_DEFAULT = new Decimal("0.004"); // 4‰ (4 la mie)
// ==========================================
// HELPER FUNCTIONS - DATABASE
// ==========================================
/**
 * Citește lista completă de membri pentru autocomplete
 */
function citesteMembri(dbMembrii, dbLichidati) {
    try {
        // Set membri lichidați
        const lichidati = new Set();
        try {
            const resLich = dbLichidati.exec("SELECT nr_fisa FROM lichidati");
            if (resLich.length > 0) {
                resLich[0].values.forEach(row => lichidati.add(row[0]));
            }
        }
        catch {
            // LICHIDATI.db opțional
        }
        // Citire membri activi
        const result = dbMembrii.exec(`
      SELECT NR_FISA, NUM_PREN
      FROM membrii
      ORDER BY NUM_PREN
    `);
        if (result.length === 0)
            return [];
        const membri = [];
        result[0].values.forEach(row => {
            const nr_fisa = row[0];
            const nume = (row[1] || "").trim();
            // Excludem lichidați
            if (lichidati.has(nr_fisa))
                return;
            membri.push({
                nr_fisa,
                nume,
                display: `${nume} (Fișa: ${nr_fisa})`
            });
        });
        return membri;
    }
    catch (error) {
        console.error("Eroare citire membri:", error);
        return [];
    }
}
/**
 * Citește informații detaliate despre un membru
 */
function citesteMembruInfo(dbMembrii, nr_fisa) {
    try {
        const result = dbMembrii.exec(`
      SELECT NR_FISA, NUM_PREN, DOMICILIUL, DATA_INSCR, CALITATEA, COTIZATIE_STANDARD
      FROM membrii
      WHERE NR_FISA = ?
    `, [nr_fisa]);
        if (result.length === 0 || result[0].values.length === 0) {
            return null;
        }
        const row = result[0].values[0];
        return {
            nr_fisa: row[0],
            nume: (row[1] || "").trim(),
            adresa: (row[2] || "").trim(),
            data_inscriere: (row[3] || "").trim(),
            calitate: (row[4] || "").trim(),
            cotizatie_standard: new Decimal(String(row[5] || "0"))
        };
    }
    catch (error) {
        console.error(`Eroare citire membru ${nr_fisa}:`, error);
        return null;
    }
}
/**
 * Citește istoricul financiar complet pentru un membru
 */
function citesteIstoricMembru(dbDepcred, nr_fisa) {
    try {
        const result = dbDepcred.exec(`
      SELECT luna, anul, dobanda, impr_deb, impr_cred, impr_sold,
             dep_deb, dep_cred, dep_sold
      FROM depcred
      WHERE nr_fisa = ?
      ORDER BY anul DESC, luna DESC
    `, [nr_fisa]);
        if (result.length === 0)
            return [];
        return result[0].values.map(row => ({
            luna: row[0],
            anul: row[1],
            dobanda: new Decimal(String(row[2] || "0")),
            impr_deb: new Decimal(String(row[3] || "0")),
            impr_cred: new Decimal(String(row[4] || "0")),
            impr_sold: new Decimal(String(row[5] || "0")),
            dep_deb: new Decimal(String(row[6] || "0")),
            dep_cred: new Decimal(String(row[7] || "0")),
            dep_sold: new Decimal(String(row[8] || "0"))
        }));
    }
    catch (error) {
        console.error(`Eroare citire istoric ${nr_fisa}:`, error);
        return [];
    }
}
/**
 * Verifică dacă un membru este lichidat
 */
function esteLichidat(dbLichidati, nr_fisa) {
    try {
        const result = dbLichidati.exec(`
      SELECT COUNT(*) as cnt FROM lichidati WHERE nr_fisa = ?
    `, [nr_fisa]);
        return result.length > 0 && result[0].values[0][0] > 0;
    }
    catch {
        return false; // LICHIDATI.db opțional
    }
}
// ==========================================
// COMPONENTA PRINCIPALĂ
// ==========================================
export default function SumeLunare({ databases, onBack }) {
    // State principal
    const [membri, setMembri] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedMembru, setSelectedMembru] = useState(null);
    const [istoric, setIstoric] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [rataDobanda] = useState(RATA_DOBANDA_DEFAULT);
    // State pentru dialog modificare
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedTranzactie, setSelectedTranzactie] = useState(null);
    // Refs pentru scroll sincronizat (desktop)
    const scrollRefs = useRef([]);
    // ========================================
    // EFFECTS
    // ========================================
    // Încărcare listă membri la mount
    useEffect(() => {
        const lista = citesteMembri(databases.membrii, databases.lichidati);
        setMembri(lista);
    }, [databases]);
    // ========================================
    // COMPUTED VALUES
    // ========================================
    // Filtrare autocomplete
    const filteredMembri = useMemo(() => {
        if (!searchTerm.trim())
            return [];
        const term = searchTerm.toLowerCase();
        return membri
            .filter(m => m.nume.toLowerCase().includes(term) ||
            m.nr_fisa.toString().includes(term))
            .slice(0, 10); // Max 10 rezultate
    }, [membri, searchTerm]);
    // Ultima tranzacție (cea mai recentă)
    const ultimaTranzactie = istoric.length > 0 ? istoric[0] : null;
    // Verificare membru lichidat
    const membruLichidat = useMemo(() => {
        return selectedMembru ? esteLichidat(databases.lichidati, selectedMembru.nr_fisa) : false;
    }, [selectedMembru, databases.lichidati]);
    // ========================================
    // HANDLERS
    // ========================================
    const handleSearch = (value) => {
        setSearchTerm(value);
        setShowAutocomplete(value.trim().length > 0);
    };
    const handleSelectMembru = async (option) => {
        setLoading(true);
        setSearchTerm(option.display);
        setShowAutocomplete(false);
        try {
            // Citește informații membre
            const info = citesteMembruInfo(databases.membrii, option.nr_fisa);
            if (!info) {
                alert(`Nu s-au găsit detalii pentru fișa ${option.nr_fisa}`);
                return;
            }
            setSelectedMembru(info);
            // Citește istoric financiar
            const istoricData = citesteIstoricMembru(databases.depcred, option.nr_fisa);
            setIstoric(istoricData);
            if (istoricData.length === 0) {
                alert(`Membrul ${info.nume} nu are istoric financiar înregistrat.`);
            }
        }
        catch (error) {
            console.error("Eroare încărcare membru:", error);
            alert(`Eroare la încărcarea datelor: ${error}`);
        }
        finally {
            setLoading(false);
        }
    };
    const handleReset = () => {
        setSearchTerm("");
        setSelectedMembru(null);
        setIstoric([]);
        setShowAutocomplete(false);
    };
    const handleModificaTranzactie = () => {
        if (!ultimaTranzactie) {
            alert("Nu există tranzacții de modificat.");
            return;
        }
        setSelectedTranzactie(ultimaTranzactie);
        setDialogOpen(true);
    };
    const handleAplicaDobanda = async () => {
        if (!ultimaTranzactie || !selectedMembru) {
            alert("Nu există tranzacții pentru aplicarea dobânzii.");
            return;
        }
        // Verificare sold împrumut > 0
        if (ultimaTranzactie.impr_sold.lessThanOrEqualTo(0)) {
            alert("Membrul nu are împrumuturi active. Soldul împrumutului este 0.");
            return;
        }
        const dobandaCalculata = ultimaTranzactie.impr_sold.times(rataDobanda);
        const dobandaNoua = ultimaTranzactie.dobanda.plus(dobandaCalculata);
        const confirmMsg = `Se va calcula și înregistra dobânda pentru achitare anticipată:\n\n` +
            `Sold Împrumut Curent: ${formatCurrency(ultimaTranzactie.impr_sold)} RON\n` +
            `Rată Dobândă: ${rataDobanda.times(1000).toFixed(1)}‰ (${rataDobanda.times(100).toFixed(1)}%)\n` +
            `Dobândă Calculată: ${formatCurrency(dobandaCalculata)} RON\n` +
            `Dobândă Totală (după aplicare): ${formatCurrency(dobandaNoua)} RON\n\n` +
            `NOTĂ: Dobânda va fi înregistrată în câmpul "Dobândă" și va fi folosită\n` +
            `în modulul Listări pentru calcularea sumei totale de plată.\n` +
            `Soldul împrumutului NU se modifică acum.\n\n` +
            `Continuați?`;
        if (!confirm(confirmMsg))
            return;
        try {
            setLoading(true);
            // Update DOAR câmpul dobândă - FĂRĂ modificare sold
            databases.depcred.run(`
        UPDATE depcred
        SET dobanda = ?
        WHERE nr_fisa = ? AND luna = ? AND anul = ?
      `, [
                dobandaNoua.toNumber(),
                selectedMembru.nr_fisa,
                ultimaTranzactie.luna,
                ultimaTranzactie.anul
            ]);
            // Refresh istoric pentru a afișa noua dobândă
            const istoricData = citesteIstoricMembru(databases.depcred, selectedMembru.nr_fisa);
            setIstoric(istoricData);
            alert(`✅ Dobândă aplicată cu succes!\n\n` +
                `Dobândă calculată: ${formatCurrency(dobandaCalculata)} RON\n` +
                `Dobândă totală înregistrată: ${formatCurrency(dobandaNoua)} RON\n\n` +
                `Această dobândă va fi inclusă în suma totală de plată\n` +
                `în rapoartele din modulul Listări.`);
        }
        catch (error) {
            console.error("Eroare aplicare dobândă:", error);
            alert(`Eroare la aplicarea dobânzii: ${error}`);
        }
        finally {
            setLoading(false);
        }
    };
    // ========================================
    // RENDER HELPERS
    // ========================================
    const formatCurrency = (value) => {
        return value.toFixed(2);
    };
    const formatLunaAn = (luna, anul) => {
        return `${String(luna).padStart(2, "0")}-${anul}`;
    };
    // ========================================
    // RENDER
    // ========================================
    return (_jsxs("div", { className: "w-full h-full flex flex-col gap-4 p-4 bg-slate-50", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx(Button, { onClick: onBack, variant: "outline", className: "gap-2", children: "\u2190 \u00CEnapoi la Dashboard" }), _jsx("h1", { className: "text-2xl font-bold text-slate-800", children: "\uD83D\uDCB0 Sume Lunare" }), _jsx("div", { className: "w-[120px]" }), " "] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Search, { className: "w-5 h-5" }), "C\u0103utare Membru"] }) }), _jsx(CardContent, { children: _jsxs("div", { className: "relative", children: [_jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "flex-1 relative", children: [_jsx(Input, { type: "text", placeholder: "C\u0103uta\u021Bi dup\u0103 nume sau num\u0103r fi\u0219\u0103...", value: searchTerm, onChange: (e) => handleSearch(e.target.value), onFocus: () => setShowAutocomplete(searchTerm.trim().length > 0), className: "pr-10" }), searchTerm && (_jsx("button", { onClick: handleReset, className: "absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600", children: _jsx(X, { className: "w-5 h-5" }) })), showAutocomplete && filteredMembri.length > 0 && (_jsx("div", { className: "absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-[300px] overflow-y-auto", children: filteredMembri.map((membru) => (_jsxs("button", { onClick: () => handleSelectMembru(membru), className: "w-full px-4 py-2 text-left hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors", children: [_jsx("div", { className: "font-medium text-slate-800", children: membru.nume }), _jsxs("div", { className: "text-sm text-slate-500", children: ["Fi\u0219a: ", membru.nr_fisa] })] }, membru.nr_fisa))) }))] }), selectedMembru && (_jsxs(Button, { onClick: handleReset, variant: "outline", className: "gap-2", children: [_jsx(RotateCcw, { className: "w-4 h-4" }), "Reset"] }))] }), loading && (_jsxs("div", { className: "flex items-center gap-2 mt-2 text-blue-600", children: [_jsx(Loader2, { className: "w-4 h-4 animate-spin" }), _jsx("span", { className: "text-sm", children: "Se \u00EEncarc\u0103 datele..." })] }))] }) })] }), selectedMembru && (_jsxs(Card, { className: membruLichidat ? "border-red-500 bg-red-50" : "", children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center justify-between", children: [_jsx("span", { children: "Informa\u021Bii Membru" }), membruLichidat && (_jsxs("span", { className: "text-sm font-normal text-red-600 flex items-center gap-1", children: [_jsx(AlertCircle, { className: "w-4 h-4" }), "MEMBRU LICHIDAT"] }))] }) }), _jsxs(CardContent, { children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Num\u0103r Fi\u0219\u0103:" }), " ", selectedMembru.nr_fisa] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Nume:" }), " ", selectedMembru.nume] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Adres\u0103:" }), " ", selectedMembru.adresa || "—"] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Data \u00CEnscrierii:" }), " ", selectedMembru.data_inscriere || "—"] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Calitate:" }), " ", selectedMembru.calitate || "—"] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Cotiza\u021Bie Standard:" }), " ", formatCurrency(selectedMembru.cotizatie_standard), " RON"] })] }), ultimaTranzactie && !membruLichidat && (_jsxs("div", { className: "flex flex-col sm:flex-row gap-2 mt-4 pt-4 border-t border-slate-200", children: [_jsxs(Button, { onClick: handleModificaTranzactie, variant: "outline", className: "gap-2 w-full sm:w-auto", children: [_jsx(Edit, { className: "w-4 h-4" }), "Modific\u0103 Tranzac\u021Bie"] }), _jsxs(Button, { onClick: handleAplicaDobanda, variant: "outline", className: "gap-2 w-full sm:w-auto", children: [_jsx(Calculator, { className: "w-4 h-4" }), "Aplic\u0103 Dob\u00E2nd\u0103"] })] }))] })] })), selectedMembru && istoric.length > 0 && (_jsx("div", { className: "hidden lg:block", children: _jsx(DesktopHistoryView, { istoric: istoric, scrollRefs: scrollRefs, formatCurrency: formatCurrency, formatLunaAn: formatLunaAn }) })), selectedMembru && istoric.length > 0 && (_jsx("div", { className: "lg:hidden", children: _jsx(MobileHistoryView, { istoric: istoric, formatCurrency: formatCurrency, formatLunaAn: formatLunaAn }) })), selectedTranzactie && (_jsx(TransactionDialog, { open: dialogOpen, onClose: () => setDialogOpen(false), tranzactie: selectedTranzactie, membruInfo: selectedMembru, databases: databases, rataDobanda: rataDobanda, formatCurrency: formatCurrency, formatLunaAn: formatLunaAn, onSave: (noualeTranzactie) => {
                    // Trigger recalculation și refresh
                    handleSelectMembru({ nr_fisa: selectedMembru.nr_fisa, nume: selectedMembru.nume, display: "" });
                    setDialogOpen(false);
                } }))] }));
}
function DesktopHistoryView({ istoric, scrollRefs, formatCurrency, formatLunaAn }) {
    const handleScroll = (index) => {
        const sourceScroll = scrollRefs.current[index];
        if (!sourceScroll)
            return;
        scrollRefs.current.forEach((ref, i) => {
            if (ref && i !== index) {
                ref.scrollTop = sourceScroll.scrollTop;
            }
        });
    };
    const columns = [
        { title: "Dobândă", key: "dobanda", section: "imprumuturi" },
        { title: "Împrumut", key: "impr_deb", section: "imprumuturi" },
        { title: "Rată Achitată", key: "impr_cred", section: "imprumuturi" },
        { title: "Sold Împrumut", key: "impr_sold", section: "imprumuturi" },
        { title: "Lună-An", key: "luna_an", section: "data" },
        { title: "Cotizație", key: "dep_deb", section: "depuneri" },
        { title: "Retragere", key: "dep_cred", section: "depuneri" },
        { title: "Sold Depuneri", key: "dep_sold", section: "depuneri" }
    ];
    const getValue = (tranz, key, index) => {
        const prev = index > 0 ? istoric[index - 1] : null;
        switch (key) {
            case "dobanda":
                return _jsx("span", { children: formatCurrency(tranz.dobanda) });
            case "impr_deb":
                // ALBASTRU BOLD când > 0 (împrumut nou acordat)
                if (tranz.impr_deb.greaterThan(0)) {
                    return _jsx("span", { className: "text-blue-600 font-bold", children: formatCurrency(tranz.impr_deb) });
                }
                return _jsx("span", { children: formatCurrency(tranz.impr_deb) });
            case "impr_cred":
                // Rată neachitată când impr_cred = 0 și sold > 0.005
                if (tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(new Decimal("0.005"))) {
                    // Verifică dacă e lună cu împrumut nou (nu se așteaptă plata ratei)
                    if (tranz.impr_deb.greaterThan(0)) {
                        return _jsx("span", { children: formatCurrency(tranz.impr_cred) });
                    }
                    // Verifică dacă luna precedentă a avut împrumut nou (!NOU! vs Neachitat!)
                    if (prev && prev.impr_deb.greaterThan(0)) {
                        return _jsx("span", { className: "text-orange-500 font-bold", children: "!NOU!" });
                    }
                    return _jsx("span", { className: "text-red-600 font-bold", children: "Neachitat!" });
                }
                return _jsx("span", { children: formatCurrency(tranz.impr_cred) });
            case "impr_sold":
                // VERDE BOLD "Achitat" când dobândă > 0 SAU sold ≤ 0.005 după plată
                if (tranz.dobanda.greaterThan(0)) {
                    return _jsx("span", { className: "text-green-600 font-bold", children: "Achitat" });
                }
                if (tranz.impr_sold.lessThanOrEqualTo(new Decimal("0.005"))) {
                    // Verifică dacă s-a plătit o rată (achitare)
                    if (tranz.impr_cred.greaterThan(0) && prev && prev.impr_sold.greaterThan(new Decimal("0.005"))) {
                        return _jsx("span", { className: "text-green-600 font-bold", children: "Achitat" });
                    }
                    return _jsx("span", { children: "0.00" });
                }
                return _jsx("span", { children: formatCurrency(tranz.impr_sold) });
            case "luna_an":
                return _jsx("span", { className: "font-semibold", children: formatLunaAn(tranz.luna, tranz.anul) });
            case "dep_deb":
                // ROȘU BOLD "Neachitat!" când dep_deb = 0 și sold anterior > 0.005
                if (tranz.dep_deb.equals(0) && prev && prev.dep_sold.greaterThan(new Decimal("0.005"))) {
                    return _jsx("span", { className: "text-red-600 font-bold", children: "Neachitat!" });
                }
                return _jsx("span", { children: formatCurrency(tranz.dep_deb) });
            case "dep_cred":
                return _jsx("span", { children: formatCurrency(tranz.dep_cred) });
            case "dep_sold":
                return _jsx("span", { children: formatCurrency(tranz.dep_sold) });
            default:
                return _jsx("span", { children: "\u2014" });
        }
    };
    return (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Istoric Financiar (Desktop View)" }) }), _jsx(CardContent, { children: _jsxs("div", { className: "grid grid-cols-8 gap-2", children: [_jsxs("div", { className: "col-span-4 border-r-2 border-blue-300 pr-2", children: [_jsx("div", { className: "text-center font-bold text-blue-800 mb-2 text-sm", children: "\u00CEMPRUMUTURI" }), _jsx("div", { className: "grid grid-cols-4 gap-1", children: columns.slice(0, 4).map((col, idx) => (_jsxs("div", { children: [_jsx("div", { className: "bg-blue-100 p-2 text-center font-semibold text-xs border border-blue-300 rounded-t", children: col.title }), _jsx("div", { className: "relative h-[400px] border border-blue-300 rounded-b overflow-hidden", children: _jsx("div", { className: "absolute inset-0 overflow-y-auto scrollbar-thin scrollbar-thumb-blue-400 scrollbar-track-blue-100", ref: (el) => { if (el)
                                                        scrollRefs.current[idx] = el; }, onScroll: () => handleScroll(idx), children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, i) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-blue-50", children: getValue(tranz, col.key, i) }, `${tranz.anul}-${tranz.luna}-${i}`))) }) }) })] }, col.key))) })] }), _jsxs("div", { className: "col-span-1 border-r-2 border-green-300 pr-2", children: [_jsx("div", { className: "text-center font-bold text-green-800 mb-2 text-sm", children: "DAT\u0102" }), _jsxs("div", { children: [_jsx("div", { className: "bg-green-100 p-2 text-center font-semibold text-xs border border-green-300 rounded-t", children: columns[4].title }), _jsx("div", { className: "relative h-[400px] border border-green-300 rounded-b overflow-hidden", children: _jsx("div", { className: "absolute inset-0 overflow-y-auto scrollbar-thin scrollbar-thumb-green-400 scrollbar-track-green-100", ref: (el) => { if (el)
                                                    scrollRefs.current[4] = el; }, onScroll: () => handleScroll(4), children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, i) => (_jsx("div", { className: "p-2 text-center text-sm font-semibold hover:bg-green-50", children: getValue(tranz, columns[4].key, i) }, `${tranz.anul}-${tranz.luna}-${i}`))) }) }) })] })] }), _jsxs("div", { className: "col-span-3", children: [_jsx("div", { className: "text-center font-bold text-purple-800 mb-2 text-sm", children: "DEPUNERI" }), _jsx("div", { className: "grid grid-cols-3 gap-1", children: columns.slice(5, 8).map((col, idx) => (_jsxs("div", { children: [_jsx("div", { className: "bg-purple-100 p-2 text-center font-semibold text-xs border border-purple-300 rounded-t", children: col.title }), _jsx("div", { className: "relative h-[400px] border border-purple-300 rounded-b overflow-hidden", children: _jsx("div", { className: "absolute inset-0 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-400 scrollbar-track-purple-100", ref: (el) => { if (el)
                                                        scrollRefs.current[idx + 5] = el; }, onScroll: () => handleScroll(idx + 5), children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, i) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-purple-50", children: getValue(tranz, col.key, i) }, `${tranz.anul}-${tranz.luna}-${i}`))) }) }) })] }, col.key))) })] })] }) })] }));
}
function MobileHistoryView({ istoric, formatCurrency, formatLunaAn }) {
    // Helper pentru formatare cu culori mobile
    const getValueMobile = (tranz, key, index) => {
        const prev = index > 0 ? istoric[index - 1] : null;
        switch (key) {
            case "dobanda":
                return _jsx("span", { children: formatCurrency(tranz.dobanda) });
            case "impr_deb":
                if (tranz.impr_deb.greaterThan(0)) {
                    return _jsx("span", { className: "text-blue-600 font-bold", children: formatCurrency(tranz.impr_deb) });
                }
                return _jsx("span", { children: formatCurrency(tranz.impr_deb) });
            case "impr_cred":
                if (tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(new Decimal("0.005"))) {
                    if (tranz.impr_deb.greaterThan(0)) {
                        return _jsx("span", { children: formatCurrency(tranz.impr_cred) });
                    }
                    if (prev && prev.impr_deb.greaterThan(0)) {
                        return _jsx("span", { className: "text-orange-500 font-bold", children: "!NOU!" });
                    }
                    return _jsx("span", { className: "text-red-600 font-bold", children: "Neachitat!" });
                }
                return _jsx("span", { children: formatCurrency(tranz.impr_cred) });
            case "impr_sold":
                if (tranz.dobanda.greaterThan(0)) {
                    return _jsx("span", { className: "text-green-600 font-bold", children: "Achitat" });
                }
                if (tranz.impr_sold.lessThanOrEqualTo(new Decimal("0.005"))) {
                    if (tranz.impr_cred.greaterThan(0) && prev && prev.impr_sold.greaterThan(new Decimal("0.005"))) {
                        return _jsx("span", { className: "text-green-600 font-bold", children: "Achitat" });
                    }
                    return _jsx("span", { children: "0.00" });
                }
                return _jsx("span", { children: formatCurrency(tranz.impr_sold) });
            case "dep_deb":
                if (tranz.dep_deb.equals(0) && prev && prev.dep_sold.greaterThan(new Decimal("0.005"))) {
                    return _jsx("span", { className: "text-red-600 font-bold", children: "Neachitat!" });
                }
                return _jsx("span", { children: formatCurrency(tranz.dep_deb) });
            case "dep_cred":
                return _jsx("span", { children: formatCurrency(tranz.dep_cred) });
            case "dep_sold":
                return _jsx("span", { children: formatCurrency(tranz.dep_sold) });
            default:
                return _jsx("span", { children: "\u2014" });
        }
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("h2", { className: "text-xl font-bold text-slate-800", children: "Istoric Financiar" }), istoric.map((tranz, idx) => {
                const prev = idx > 0 ? istoric[idx - 1] : null;
                return (_jsxs(Card, { className: "shadow-md", children: [_jsx(CardHeader, { className: "pb-3", children: _jsxs(CardTitle, { className: "text-lg flex items-center justify-between", children: [_jsx("span", { children: formatLunaAn(tranz.luna, tranz.anul) }), _jsxs("span", { className: "text-sm font-normal text-slate-500", children: [MONTHS[tranz.luna - 1], " ", tranz.anul] })] }) }), _jsx(CardContent, { children: _jsxs(Tabs, { defaultValue: "imprumuturi", className: "w-full", children: [_jsxs(TabsList, { className: "grid w-full grid-cols-2", children: [_jsx(TabsTrigger, { value: "imprumuturi", children: "\u00CEmprumuturi" }), _jsx(TabsTrigger, { value: "depuneri", children: "Depuneri" })] }), _jsx(TabsContent, { value: "imprumuturi", className: "space-y-2 mt-4", children: _jsxs("div", { className: "grid grid-cols-2 gap-2 text-sm", children: [_jsx("div", { className: "font-semibold", children: "Dob\u00E2nd\u0103:" }), _jsxs("div", { className: "text-right", children: [getValueMobile(tranz, "dobanda", idx), " RON"] }), _jsx("div", { className: "font-semibold", children: "\u00CEmprumut:" }), _jsxs("div", { className: "text-right", children: [getValueMobile(tranz, "impr_deb", idx), " ", tranz.impr_deb.greaterThan(0) ? "" : "RON"] }), _jsx("div", { className: "font-semibold", children: "Rat\u0103 Achitat\u0103:" }), _jsxs("div", { className: "text-right", children: [getValueMobile(tranz, "impr_cred", idx), " ", tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(new Decimal("0.005")) && (tranz.impr_deb.equals(0)) ? "" : "RON"] }), _jsx("div", { className: "font-semibold text-blue-700", children: "Sold \u00CEmprumut:" }), _jsxs("div", { className: "text-right font-bold text-blue-700", children: [getValueMobile(tranz, "impr_sold", idx), " ", tranz.dobanda.greaterThan(0) || (tranz.impr_sold.lessThanOrEqualTo(new Decimal("0.005")) && tranz.impr_cred.greaterThan(0) && prev && prev.impr_sold.greaterThan(new Decimal("0.005"))) ? "" : "RON"] })] }) }), _jsx(TabsContent, { value: "depuneri", className: "space-y-2 mt-4", children: _jsxs("div", { className: "grid grid-cols-2 gap-2 text-sm", children: [_jsx("div", { className: "font-semibold", children: "Cotiza\u021Bie:" }), _jsxs("div", { className: "text-right", children: [getValueMobile(tranz, "dep_deb", idx), " ", tranz.dep_deb.equals(0) && prev && prev.dep_sold.greaterThan(new Decimal("0.005")) ? "" : "RON"] }), _jsx("div", { className: "font-semibold", children: "Retragere:" }), _jsxs("div", { className: "text-right", children: [getValueMobile(tranz, "dep_cred", idx), " RON"] }), _jsx("div", { className: "font-semibold text-purple-700", children: "Sold Depuneri:" }), _jsxs("div", { className: "text-right font-bold text-purple-700", children: [getValueMobile(tranz, "dep_sold", idx), " RON"] })] }) })] }) })] }, `${tranz.anul}-${tranz.luna}-${idx}`));
            })] }));
}
function TransactionDialog({ open, onClose, tranzactie, membruInfo, databases, rataDobanda, onSave, formatCurrency, formatLunaAn }) {
    // State pentru formular
    const [formData, setFormData] = useState({
        dobanda: tranzactie.dobanda.toString(),
        impr_deb: tranzactie.impr_deb.toString(),
        impr_cred: tranzactie.impr_cred.toString(),
        dep_deb: tranzactie.dep_deb.toString(),
        dep_cred: tranzactie.dep_cred.toString()
    });
    const [calcImprumut, setCalcImprumut] = useState("");
    const [calcLuni, setCalcLuni] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    // Calculare rată lunară din împrumut și număr luni
    const handleCalculeazaRata = () => {
        try {
            const suma = new Decimal(calcImprumut || "0");
            const luni = parseInt(calcLuni || "0");
            if (luni <= 0) {
                alert("Numărul de luni trebuie să fie pozitiv!");
                return;
            }
            const rata = suma.dividedBy(luni);
            setFormData(prev => ({ ...prev, impr_cred: rata.toFixed(2) }));
        }
        catch (err) {
            alert("Eroare la calcularea ratei!");
        }
    };
    // Validări și salvare
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            // Convertire la Decimal
            const dobanda = new Decimal(formData.dobanda || "0");
            const impr_deb = new Decimal(formData.impr_deb || "0");
            const impr_cred = new Decimal(formData.impr_cred || "0");
            const dep_deb = new Decimal(formData.dep_deb || "0");
            const dep_cred = new Decimal(formData.dep_cred || "0");
            // Validare: rata achitată nu poate fi > sold împrumut
            if (impr_cred.greaterThan(tranzactie.impr_sold)) {
                setError(`Rata achitată (${impr_cred.toFixed(2)}) nu poate fi mai mare decât soldul împrumutului (${tranzactie.impr_sold.toFixed(2)})!`);
                setSaving(false);
                return;
            }
            // Validare: retragere nu poate fi > sold depuneri
            const soldDepuneriCurent = tranzactie.dep_sold;
            if (dep_cred.greaterThan(soldDepuneriCurent)) {
                setError(`Retragerea (${dep_cred.toFixed(2)}) nu poate fi mai mare decât soldul depunerilor (${soldDepuneriCurent.toFixed(2)})!`);
                setSaving(false);
                return;
            }
            // Salvare în baza de date
            databases.depcred.run(`
        UPDATE depcred
        SET dobanda = ?,
            impr_deb = ?,
            impr_cred = ?,
            dep_deb = ?,
            dep_cred = ?
        WHERE nr_fisa = ? AND luna = ? AND anul = ?
      `, [
                dobanda.toNumber(),
                impr_deb.toNumber(),
                impr_cred.toNumber(),
                dep_deb.toNumber(),
                dep_cred.toNumber(),
                membruInfo.nr_fisa,
                tranzactie.luna,
                tranzactie.anul
            ]);
            // Actualizare cotizație standard în MEMBRII.db dacă s-a modificat
            if (!dep_deb.equals(membruInfo.cotizatie_standard)) {
                databases.membrii.run(`
          UPDATE membrii
          SET COTIZATIE_STANDARD = ?
          WHERE NR_FISA = ?
        `, [dep_deb.toNumber(), membruInfo.nr_fisa]);
            }
            // Recalculare lunilor ulterioare
            await recalculeazaLuniUlterioare(databases.depcred, membruInfo.nr_fisa, tranzactie.luna, tranzactie.anul, rataDobanda);
            // Success
            onSave({
                ...tranzactie,
                dobanda,
                impr_deb,
                impr_cred,
                dep_deb,
                dep_cred
            });
        }
        catch (err) {
            console.error("Eroare salvare tranzacție:", err);
            setError(`Eroare la salvare: ${err}`);
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsx(Dialog, { open: open, onOpenChange: onClose, children: _jsxs(DialogContent, { className: "max-w-2xl max-h-[90vh] overflow-y-auto", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { children: ["Modificare Tranzac\u021Bie - ", formatLunaAn(tranzactie.luna, tranzactie.anul)] }) }), _jsxs("div", { className: "space-y-4", children: [error && (_jsxs(Alert, { variant: "destructive", children: [_jsx(AlertCircle, { className: "w-4 h-4" }), _jsx(AlertDescription, { children: error })] })), _jsxs("div", { className: "bg-slate-50 p-3 rounded text-sm", children: [_jsx("div", { className: "font-semibold", children: membruInfo.nume }), _jsxs("div", { className: "text-slate-600", children: ["Fi\u0219a: ", membruInfo.nr_fisa] })] }), _jsxs(Card, { className: "bg-blue-50 border-blue-300", children: [_jsx(CardHeader, { className: "pb-3", children: _jsxs(CardTitle, { className: "text-sm flex items-center gap-2", children: [_jsx(Calculator, { className: "w-4 h-4" }), "Calculator Rat\u0103 Lunar\u0103"] }) }), _jsx(CardContent, { children: _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold", children: "Sum\u0103 \u00CEmprumut:" }), _jsx(Input, { type: "number", step: "0.01", value: calcImprumut, onChange: (e) => setCalcImprumut(e.target.value), placeholder: "0.00" })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold", children: "Nr. Luni:" }), _jsx(Input, { type: "number", value: calcLuni, onChange: (e) => setCalcLuni(e.target.value), placeholder: "12" })] }), _jsx("div", { className: "flex items-end", children: _jsx(Button, { onClick: handleCalculeazaRata, className: "w-full", size: "sm", children: "Calculeaz\u0103" }) })] }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-3", children: [_jsx("h3", { className: "font-semibold text-blue-800 border-b border-blue-300 pb-1", children: "\u00CEMPRUMUTURI" }), _jsxs("div", { children: [_jsx("label", { className: "text-sm font-semibold", children: "Dob\u00E2nd\u0103:" }), _jsx(Input, { type: "number", step: "0.01", value: formData.dobanda, onChange: (e) => setFormData(prev => ({ ...prev, dobanda: e.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-sm font-semibold", children: "\u00CEmprumut (Debit):" }), _jsx(Input, { type: "number", step: "0.01", value: formData.impr_deb, onChange: (e) => setFormData(prev => ({ ...prev, impr_deb: e.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-sm font-semibold", children: "Rat\u0103 Achitat\u0103 (Credit):" }), _jsx(Input, { type: "number", step: "0.01", value: formData.impr_cred, onChange: (e) => setFormData(prev => ({ ...prev, impr_cred: e.target.value })) })] }), _jsxs("div", { className: "bg-blue-100 p-2 rounded", children: [_jsx("div", { className: "text-xs text-slate-600", children: "Sold \u00CEmprumut Curent:" }), _jsxs("div", { className: "font-bold text-blue-800", children: [formatCurrency(tranzactie.impr_sold), " RON"] })] })] }), _jsxs("div", { className: "space-y-3", children: [_jsx("h3", { className: "font-semibold text-purple-800 border-b border-purple-300 pb-1", children: "DEPUNERI" }), _jsxs("div", { children: [_jsx("label", { className: "text-sm font-semibold", children: "Cotiza\u021Bie (Debit):" }), _jsx(Input, { type: "number", step: "0.01", value: formData.dep_deb, onChange: (e) => setFormData(prev => ({ ...prev, dep_deb: e.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-sm font-semibold", children: "Retragere (Credit):" }), _jsx(Input, { type: "number", step: "0.01", value: formData.dep_cred, onChange: (e) => setFormData(prev => ({ ...prev, dep_cred: e.target.value })) })] }), _jsxs("div", { className: "bg-purple-100 p-2 rounded", children: [_jsx("div", { className: "text-xs text-slate-600", children: "Sold Depuneri Curent:" }), _jsxs("div", { className: "font-bold text-purple-800", children: [formatCurrency(tranzactie.dep_sold), " RON"] })] })] })] }), _jsxs(Alert, { children: [_jsx(Info, { className: "w-4 h-4" }), _jsx(AlertDescription, { className: "text-xs", children: "Modific\u0103rile vor declan\u0219a recalcularea automat\u0103 a tuturor lunilor ulterioare. Soldurile vor fi actualizate conform formulei: sold_nou = sold_vechi + debit - credit" })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { onClick: onClose, variant: "outline", disabled: saving, children: "Anuleaz\u0103" }), _jsxs(Button, { onClick: handleSave, disabled: saving, className: "gap-2", children: [saving && _jsx(Loader2, { className: "w-4 h-4 animate-spin" }), "Salveaz\u0103 Modific\u0103rile"] })] })] }) }));
}
// ==========================================
// FUNCȚII BUSINESS LOGIC
// ==========================================
/**
 * Recalculează soldurile pentru toate lunile ulterioare unei modificări
 */
async function recalculeazaLuniUlterioare(dbDepcred, nr_fisa, luna_start, anul_start, rata_dobanda) {
    try {
        // Citește toate tranzacțiile pentru acest membru, ordonate cronologic
        const result = dbDepcred.exec(`
      SELECT luna, anul, dobanda, impr_deb, impr_cred, impr_sold, dep_deb, dep_cred, dep_sold
      FROM depcred
      WHERE nr_fisa = ?
      ORDER BY anul ASC, luna ASC
    `, [nr_fisa]);
        if (result.length === 0)
            return;
        const tranzactii = result[0].values.map(row => ({
            luna: row[0],
            anul: row[1],
            dobanda: new Decimal(String(row[2] || "0")),
            impr_deb: new Decimal(String(row[3] || "0")),
            impr_cred: new Decimal(String(row[4] || "0")),
            impr_sold: new Decimal(String(row[5] || "0")),
            dep_deb: new Decimal(String(row[6] || "0")),
            dep_cred: new Decimal(String(row[7] || "0")),
            dep_sold: new Decimal(String(row[8] || "0"))
        }));
        // Găsește indexul lunii modificate
        const idxStart = tranzactii.findIndex(t => t.anul === anul_start && t.luna === luna_start);
        if (idxStart === -1)
            return;
        // Recalculează fiecare lună ulterioară
        for (let i = idxStart + 1; i < tranzactii.length; i++) {
            const tranzPrev = tranzactii[i - 1];
            const tranzCurr = tranzactii[i];
            // Calcul sold împrumut: sold_vechi + împrumut_nou - rată_achitată
            let sold_impr = tranzPrev.impr_sold
                .plus(tranzCurr.impr_deb)
                .minus(tranzCurr.impr_cred);
            // Zeroizare solduri < 0.005
            if (sold_impr.lessThan(PRAG_ZEROIZARE)) {
                sold_impr = new Decimal("0");
            }
            // Calcul sold depuneri: sold_vechi + cotizație - retragere
            let sold_dep = tranzPrev.dep_sold
                .plus(tranzCurr.dep_deb)
                .minus(tranzCurr.dep_cred);
            if (sold_dep.lessThan(PRAG_ZEROIZARE)) {
                sold_dep = new Decimal("0");
            }
            // Update în baza de date
            dbDepcred.run(`
        UPDATE depcred
        SET impr_sold = ?, dep_sold = ?
        WHERE nr_fisa = ? AND luna = ? AND anul = ?
      `, [
                sold_impr.toNumber(),
                sold_dep.toNumber(),
                nr_fisa,
                tranzCurr.luna,
                tranzCurr.anul
            ]);
            // Update în array pentru următoarea iterație
            tranzactii[i].impr_sold = sold_impr;
            tranzactii[i].dep_sold = sold_dep;
        }
    }
    catch (error) {
        console.error("Eroare recalculare luni ulterioare:", error);
        throw error;
    }
}
/**
 * Helper pentru formatare lună-an
 */
function formatLunaAn(luna, anul) {
    return `${String(luna).padStart(2, "0")}-${anul}`;
}
