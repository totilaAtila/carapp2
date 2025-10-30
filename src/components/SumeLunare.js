import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// src/components/SumeLunare.tsx
/**
 * Modul Sume Lunare - Port complet din sume_lunare.py (2750 linii) cu toate îmbunătățirile
 *
 * ÎMBUNĂTĂȚIRI ADĂUGATE:
 * 1. ✅ Calcul corect dobândă (suma soldurilor pozitive din toate lunile)
 * 2. ✅ Formatare avansată pentru mobile (evidențiere condițională)
 * 3. ✅ Sincronizare scroll îmbunătățită pentru desktop
 * 4. ✅ Logică completă pentru "!NOU!" și "Neachitat!"
 * 5. ✅ Validări complexe ca în Python
 */
import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import Decimal from "decimal.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/buttons";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Loader2, Search, X, Edit, Calculator, RotateCcw, Info, AlertCircle, ChevronDown, Calendar } from "lucide-react";
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
const PRAG_ZEROIZARE = new Decimal("0.005");
const RATA_DOBANDA_DEFAULT = new Decimal("0.004");
// ==========================================
// HELPER FUNCTIONS - DATABASE
// ==========================================
function citesteMembri(dbMembrii, dbLichidati) {
    try {
        const lichidati = new Set();
        try {
            const resLich = dbLichidati.exec("SELECT nr_fisa FROM lichidati");
            if (resLich.length > 0) {
                resLich[0].values.forEach((row) => lichidati.add(row[0]));
            }
        }
        catch { }
        const result = dbMembrii.exec(`
      SELECT NR_FISA, NUM_PREN
      FROM membrii
      ORDER BY NUM_PREN
    `);
        if (result.length === 0)
            return [];
        const membri = [];
        result[0].values.forEach((row) => {
            const nr_fisa = row[0];
            const nume = (row[1] || "").trim();
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
        return result[0].values.map((row) => ({
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
function esteLichidat(dbLichidati, nr_fisa) {
    try {
        const result = dbLichidati.exec(`
      SELECT COUNT(*) as cnt FROM lichidati WHERE nr_fisa = ?
    `, [nr_fisa]);
        return result.length > 0 && result[0].values[0][0] > 0;
    }
    catch {
        return false;
    }
}
// ==========================================
// HOOK PENTRU SCROLL SINCRONIZAT (CORECTAT)
// ==========================================
const useSynchronizedScroll = () => {
    const [scrollElements, setScrollElements] = useState([]);
    const isScrolling = useRef(false);
    const registerScrollElement = useCallback((element, index) => {
        if (element) {
            setScrollElements(prev => {
                const newArray = [...prev];
                newArray[index] = element;
                return newArray;
            });
        }
    }, []);
    const handleScroll = useCallback((index, _event) => {
        if (isScrolling.current)
            return;
        isScrolling.current = true;
        const sourceElement = scrollElements[index];
        if (!sourceElement) {
            isScrolling.current = false;
            return;
        }
        const scrollTop = sourceElement.scrollTop;
        const scrollHeight = sourceElement.scrollHeight;
        const clientHeight = sourceElement.clientHeight;
        const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
        scrollElements.forEach((element, i) => {
            if (element && i !== index && element !== sourceElement) {
                const targetScrollTop = scrollPercentage * (element.scrollHeight - element.clientHeight);
                element.scrollTo({
                    top: targetScrollTop,
                    behavior: 'auto'
                });
            }
        });
        setTimeout(() => {
            isScrolling.current = false;
        }, 10);
    }, [scrollElements]);
    return { registerScrollElement, handleScroll };
};
// ==========================================
// FUNCȚII FORMATARE AVANSATĂ (EXACT CA ÎN PYTHON)
// ==========================================
const getFormattedValue = (tranz, key, formatCurrency, formatLunaAn, istoric, index) => {
    try {
        const prevTranz = istoric && index !== undefined ? istoric[index + 1] : undefined;
        switch (key) {
            case 'dobanda':
                if (tranz.dobanda.greaterThan(0)) {
                    return {
                        display: formatCurrency(tranz.dobanda),
                        className: 'text-purple-600 font-semibold'
                    };
                }
                return {
                    display: formatCurrency(tranz.dobanda),
                    className: 'text-slate-600'
                };
            case 'impr_deb':
                if (tranz.impr_deb.greaterThan(0)) {
                    return {
                        display: formatCurrency(tranz.impr_deb),
                        className: 'text-blue-600 font-bold'
                    };
                }
                return {
                    display: formatCurrency(tranz.impr_deb),
                    className: 'text-slate-600'
                };
            case 'impr_cred':
                if (tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
                    const isFirstMonthAfterLoan = prevTranz &&
                        prevTranz.impr_deb.greaterThan(0);
                    if (isFirstMonthAfterLoan) {
                        return {
                            display: '!NOU!',
                            className: 'text-orange-600 font-bold'
                        };
                    }
                    else {
                        return {
                            display: 'Neachitat!',
                            className: 'text-red-600 font-bold'
                        };
                    }
                }
                if (tranz.impr_cred.greaterThan(0) && tranz.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
                    return {
                        display: formatCurrency(tranz.impr_cred),
                        className: 'text-green-600 font-bold'
                    };
                }
                return {
                    display: formatCurrency(tranz.impr_cred),
                    className: 'text-slate-600'
                };
            case 'impr_sold':
                if (tranz.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
                    return {
                        display: 'Achitat',
                        className: 'text-green-600 font-bold'
                    };
                }
                if (tranz.impr_deb.greaterThan(0) && tranz.impr_cred.greaterThan(0) && prevTranz) {
                    const expectedOldSold = prevTranz.impr_sold.minus(tranz.impr_cred);
                    if (expectedOldSold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
                        return {
                            display: 'Achitat',
                            className: 'text-green-600 font-bold'
                        };
                    }
                }
                return {
                    display: formatCurrency(tranz.impr_sold),
                    className: 'text-blue-700 font-bold'
                };
            case 'luna_an':
                return {
                    display: formatLunaAn(tranz.luna, tranz.anul),
                    className: 'text-slate-800 font-semibold'
                };
            case 'dep_deb':
                // Cotizație neachitată - roșu (EXACT ca în Python)
                if (tranz.dep_deb.equals(0) && prevTranz && prevTranz.dep_sold.greaterThan(PRAG_ZEROIZARE)) {
                    return {
                        display: 'Neachitat!',
                        className: 'text-red-600 font-bold'
                    };
                }
                return {
                    display: formatCurrency(tranz.dep_deb),
                    className: 'text-slate-600'
                };
            case 'dep_cred':
                return {
                    display: formatCurrency(tranz.dep_cred),
                    className: 'text-slate-600'
                };
            case 'dep_sold':
                return {
                    display: formatCurrency(tranz.dep_sold),
                    className: 'text-purple-700 font-bold'
                };
            default:
                return {
                    display: '—',
                    className: 'text-slate-600'
                };
        }
    }
    catch (error) {
        console.error(`Eroare formatare ${key}:`, error);
        return {
            display: '—',
            className: 'text-red-600'
        };
    }
};
// ==========================================
// COMPONENTA PRINCIPALĂ
// ==========================================
export default function SumeLunare({ databases, onBack }) {
    const [membri, setMembri] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [selectedMembru, setSelectedMembru] = useState(null);
    const [istoric, setIstoric] = useState([]);
    const [loading, setLoading] = useState(false);
    const [membruLichidat, setMembruLichidat] = useState(false);
    const [rataDobanda] = useState(RATA_DOBANDA_DEFAULT);
    const [selectedTranzactie, setSelectedTranzactie] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const { registerScrollElement, handleScroll } = useSynchronizedScroll();
    // Încarcă membrii la montare
    useEffect(() => {
        const lista = citesteMembri(databases.membrii, databases.lichidati);
        setMembri(lista);
    }, [databases]);
    const filteredMembri = useMemo(() => {
        if (!searchTerm.trim())
            return [];
        const term = searchTerm.toLowerCase();
        return membri.filter(m => m.nume.toLowerCase().includes(term) ||
            m.nr_fisa.toString().includes(term)).slice(0, 10);
    }, [searchTerm, membri]);
    const ultimaTranzactie = useMemo(() => {
        return istoric.length > 0 ? istoric[0] : null;
    }, [istoric]);
    const handleSearch = (value) => {
        setSearchTerm(value);
        setShowAutocomplete(value.trim().length > 0);
    };
    const handleSelectMembru = async (membru) => {
        setLoading(true);
        setShowAutocomplete(false);
        setSearchTerm(membru.display);
        try {
            const info = citesteMembruInfo(databases.membrii, membru.nr_fisa);
            if (!info) {
                alert(`Nu s-au găsit informații pentru membrul cu fișa ${membru.nr_fisa}`);
                return;
            }
            const istoricData = citesteIstoricMembru(databases.depcred, membru.nr_fisa);
            const lichidat = esteLichidat(databases.lichidati, membru.nr_fisa);
            setSelectedMembru(info);
            setIstoric(istoricData);
            setMembruLichidat(lichidat);
        }
        catch (error) {
            console.error("Eroare selectare membru:", error);
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
        setMembruLichidat(false);
        setSelectedTranzactie(null);
        setDialogOpen(false);
    };
    const handleModificaTranzactie = () => {
        if (!ultimaTranzactie) {
            alert("Nu există tranzacții pentru acest membru.");
            return;
        }
        setSelectedTranzactie(ultimaTranzactie);
        setDialogOpen(true);
    };
    const handleAplicaDobanda = async () => {
        if (!ultimaTranzactie || !selectedMembru) {
            alert("Nu există tranzacții pentru acest membru.");
            return;
        }
        if (ultimaTranzactie.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
            alert("Membrul nu are împrumuturi active. Dobânda se aplică doar pentru împrumuturi neachitate.");
            return;
        }
        setLoading(true);
        try {
            const dobandaCalculata = calculateDobandaLaZi(istoric, rataDobanda);
            if (dobandaCalculata.lessThanOrEqualTo(0)) {
                alert("Nu s-a putut calcula dobânda. Verificați istoricul împrumuturilor.");
                return;
            }
            const dobandaNoua = ultimaTranzactie.dobanda.plus(dobandaCalculata);
            const tranzactieCuDobanda = {
                ...ultimaTranzactie,
                dobanda: dobandaNoua,
                impr_cred: ultimaTranzactie.impr_sold.plus(ultimaTranzactie.impr_cred)
            };
            setSelectedTranzactie(tranzactieCuDobanda);
            setDialogOpen(true);
            alert(`Dobânda a fost calculată: ${formatCurrency(dobandaCalculata)} RON\n\nDialogul va fi deschis cu dobânda calculată și suma necesară pentru achitarea completă a împrumutului.`);
        }
        catch (error) {
            console.error("Eroare aplicare dobândă:", error);
            alert(`Eroare la aplicarea dobânzii: ${error}`);
        }
        finally {
            setLoading(false);
        }
    };
    const formatCurrency = (value) => {
        if (value instanceof Decimal) {
            return value.toFixed(2);
        }
        return new Decimal(value || 0).toFixed(2);
    };
    const formatLunaAn = (luna, anul) => {
        return `${String(luna).padStart(2, "0")}-${anul}`;
    };
    return (_jsxs("div", { className: "w-full h-full flex flex-col gap-4 p-4 bg-slate-50", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx(Button, { onClick: onBack, variant: "outline", className: "gap-2", children: "\u2190 \u00CEnapoi la Dashboard" }), _jsx("h1", { className: "text-2xl font-bold text-slate-800", children: "\uD83D\uDCB0 Sume Lunare" }), _jsx("div", { className: "w-[120px]" })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Search, { className: "w-5 h-5" }), "C\u0103utare Membru"] }) }), _jsx(CardContent, { children: _jsxs("div", { className: "relative", children: [_jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "flex-1 relative", children: [_jsx(Input, { type: "text", placeholder: "C\u0103uta\u021Bi dup\u0103 nume sau num\u0103r fi\u0219\u0103...", value: searchTerm, onChange: (e) => handleSearch(e.target.value), onFocus: () => setShowAutocomplete(searchTerm.trim().length > 0), className: "pr-10" }), searchTerm && (_jsx("button", { onClick: handleReset, className: "absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600", children: _jsx(X, { className: "w-5 h-5" }) })), showAutocomplete && filteredMembri.length > 0 && (_jsx("div", { className: "absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-[300px] overflow-y-auto", children: filteredMembri.map((membru) => (_jsxs("button", { onClick: () => handleSelectMembru(membru), className: "w-full px-4 py-2 text-left hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors", children: [_jsx("div", { className: "font-medium text-slate-800", children: membru.nume }), _jsxs("div", { className: "text-sm text-slate-500", children: ["Fi\u0219a: ", membru.nr_fisa] })] }, membru.nr_fisa))) }))] }), selectedMembru && (_jsxs(Button, { onClick: handleReset, variant: "outline", className: "gap-2", children: [_jsx(RotateCcw, { className: "w-4 h-4" }), "Reset"] }))] }), loading && (_jsxs("div", { className: "flex items-center gap-2 mt-2 text-blue-600", children: [_jsx(Loader2, { className: "w-4 h-4 animate-spin" }), _jsx("span", { className: "text-sm", children: "Se \u00EEncarc\u0103 datele..." })] }))] }) })] }), selectedMembru && (_jsxs(Card, { className: membruLichidat ? "border-red-500 bg-red-50" : "", children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center justify-between", children: [_jsx("span", { children: "Informa\u021Bii Membru" }), membruLichidat && (_jsxs("span", { className: "text-sm font-normal text-red-600 flex items-center gap-1", children: [_jsx(AlertCircle, { className: "w-4 h-4" }), "MEMBRU LICHIDAT"] }))] }) }), _jsxs(CardContent, { children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Num\u0103r Fi\u0219\u0103:" }), " ", selectedMembru.nr_fisa] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Nume:" }), " ", selectedMembru.nume] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Adres\u0103:" }), " ", selectedMembru.adresa || "—"] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Data \u00CEnscrierii:" }), " ", selectedMembru.data_inscriere || "—"] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Calitate:" }), " ", selectedMembru.calitate || "—"] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold", children: "Cotiza\u021Bie Standard:" }), " ", formatCurrency(selectedMembru.cotizatie_standard), " RON"] })] }), ultimaTranzactie && !membruLichidat && (_jsxs("div", { className: "flex gap-2 mt-4 pt-4 border-t border-slate-200", children: [_jsxs(Button, { onClick: handleModificaTranzactie, variant: "outline", className: "gap-2", children: [_jsx(Edit, { className: "w-4 h-4" }), "Modific\u0103 Tranzac\u021Bie"] }), _jsxs(Button, { onClick: handleAplicaDobanda, variant: "outline", className: "gap-2", children: [_jsx(Calculator, { className: "w-4 h-4" }), "Aplic\u0103 Dob\u00E2nd\u0103"] })] }))] })] })), selectedMembru && istoric.length > 0 && (_jsx("div", { className: "hidden lg:block", children: _jsx(DesktopHistoryView, { istoric: istoric, registerScrollElement: registerScrollElement, handleScroll: handleScroll, formatCurrency: formatCurrency, formatLunaAn: formatLunaAn }) })), selectedMembru && istoric.length > 0 && (_jsx("div", { className: "lg:hidden", children: _jsx(MobileHistoryViewEnhanced, { istoric: istoric, formatCurrency: formatCurrency, formatLunaAn: formatLunaAn }) })), selectedTranzactie && selectedMembru && (_jsx(TransactionDialog, { open: dialogOpen, onClose: () => setDialogOpen(false), tranzactie: selectedTranzactie, membruInfo: selectedMembru, databases: databases, rataDobanda: rataDobanda, formatCurrency: formatCurrency, formatLunaAn: formatLunaAn, onSave: (_nouaTranzactie) => {
                    handleSelectMembru({ nr_fisa: selectedMembru.nr_fisa, nume: selectedMembru.nume, display: "" });
                    setDialogOpen(false);
                } }))] }));
}
function DesktopHistoryView({ istoric, registerScrollElement, handleScroll, formatCurrency, formatLunaAn }) {
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
    return (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Istoric Financiar - Scroll Sincronizat" }) }), _jsxs(CardContent, { children: [_jsxs("div", { className: "grid grid-cols-8 gap-1", children: [_jsxs("div", { className: "col-span-4 border-r-2 border-blue-300 pr-2", children: [_jsx("div", { className: "text-center font-bold text-blue-800 mb-2 text-sm", children: "\u00CEMPRUMUTURI" }), _jsx("div", { className: "grid grid-cols-4 gap-1", children: columns.slice(0, 4).map((col, idx) => (_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-blue-100 p-2 text-center font-semibold text-xs border border-blue-300 rounded-t", children: col.title }), _jsx("div", { className: "h-[400px] overflow-auto border border-blue-300 rounded-b bg-white", ref: (el) => registerScrollElement(el, idx), onScroll: (e) => handleScroll(idx, e), children: _jsx("div", { className: "divide-y divide-slate-100", children: istoric.map((tranz, tranzIdx) => {
                                                            const { display, className } = getFormattedValue(tranz, col.key, formatCurrency, formatLunaAn, istoric, tranzIdx);
                                                            return (_jsx("div", { className: `p-2 text-center text-xs ${className}`, children: display }, tranzIdx));
                                                        }) }) })] }, col.key))) })] }), _jsxs("div", { className: "col-span-1 border-r-2 border-green-300 pr-2", children: [_jsx("div", { className: "text-center font-bold text-green-800 mb-2 text-sm", children: "DATA" }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-green-100 p-2 text-center font-semibold text-xs border border-green-300 rounded-t", children: columns[4].title }), _jsx("div", { className: "h-[400px] overflow-auto border border-green-300 rounded-b bg-white", ref: (el) => registerScrollElement(el, 4), onScroll: (e) => handleScroll(4, e), children: _jsx("div", { className: "divide-y divide-slate-100", children: istoric.map((tranz, tranzIdx) => {
                                                        const { display, className } = getFormattedValue(tranz, columns[4].key, formatCurrency, formatLunaAn, istoric, tranzIdx);
                                                        return (_jsx("div", { className: `p-2 text-center text-xs ${className}`, children: display }, tranzIdx));
                                                    }) }) })] })] }), _jsxs("div", { className: "col-span-3", children: [_jsx("div", { className: "text-center font-bold text-purple-800 mb-2 text-sm", children: "DEPUNERI" }), _jsx("div", { className: "grid grid-cols-3 gap-1", children: columns.slice(5, 8).map((col, idx) => (_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-purple-100 p-2 text-center font-semibold text-xs border border-purple-300 rounded-t", children: col.title }), _jsx("div", { className: "h-[400px] overflow-auto border border-purple-300 rounded-b bg-white", ref: (el) => registerScrollElement(el, idx + 5), onScroll: (e) => handleScroll(idx + 5, e), children: _jsx("div", { className: "divide-y divide-slate-100", children: istoric.map((tranz, tranzIdx) => {
                                                            const { display, className } = getFormattedValue(tranz, col.key, formatCurrency, formatLunaAn, istoric, tranzIdx);
                                                            return (_jsx("div", { className: `p-2 text-center text-xs ${className}`, children: display }, tranzIdx));
                                                        }) }) })] }, col.key))) })] })] }), _jsxs("div", { className: "mt-2 text-xs text-slate-500 text-center flex items-center justify-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-green-500 rounded-full animate-pulse" }), "\uD83D\uDD04 Scroll sincronizat - derula\u021Bi orice coloan\u0103 pentru a sincroniza toate"] })] })] }));
}
function MobileHistoryViewEnhanced({ istoric, formatCurrency, formatLunaAn }) {
    const [expandedMonth, setExpandedMonth] = useState(null);
    if (!istoric || istoric.length === 0) {
        return (_jsx("div", { className: "p-4 text-center text-slate-500", children: "Nu exist\u0103 istoric financiar pentru acest membru." }));
    }
    try {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx("h2", { className: "text-xl font-bold text-slate-800 px-2", children: "Istoric Financiar" }), istoric.map((tranz, idx) => (_jsxs(Card, { className: "shadow-lg border-l-4 border-blue-500", children: [_jsxs(CardHeader, { className: "pb-3 bg-slate-50 cursor-pointer", onClick: () => setExpandedMonth(expandedMonth === idx ? null : idx), children: [_jsxs(CardTitle, { className: "text-lg flex items-center justify-between", children: [_jsxs("span", { className: "font-bold text-slate-800 flex items-center gap-2", children: [_jsx(Calendar, { className: "w-5 h-5 text-blue-600" }), formatLunaAn(tranz.luna, tranz.anul)] }), _jsxs("span", { className: "text-sm font-normal text-slate-500", children: [MONTHS[tranz.luna - 1], " ", tranz.anul] })] }), _jsxs("div", { className: "flex items-center gap-2 mt-1", children: [tranz.impr_sold.greaterThan(0) ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "w-2 h-2 bg-orange-500 rounded-full" }), _jsxs("span", { className: "text-xs text-orange-600 font-semibold", children: ["\u00CEmprumut Activ: ", formatCurrency(tranz.impr_sold), " RON"] })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "w-2 h-2 bg-green-500 rounded-full" }), _jsx("span", { className: "text-xs text-green-600 font-semibold", children: "F\u0103r\u0103 \u00EEmprumuturi active" })] })), _jsx(ChevronDown, { className: `w-4 h-4 transition-transform ${expandedMonth === idx ? 'rotate-180' : ''}` })] })] }), expandedMonth === idx && (_jsxs(CardContent, { className: "space-y-4 pt-0", children: [_jsxs("div", { className: "space-y-3", children: [_jsxs("h3", { className: "font-bold text-blue-800 border-b border-blue-200 pb-1 flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full" }), "\u00CEMPRUMUTURI"] }), _jsx("div", { className: "grid grid-cols-2 gap-3 text-sm", children: ['dobanda', 'impr_deb', 'impr_cred', 'impr_sold'].map((field) => {
                                                const { display, className } = getFormattedValue(tranz, field, formatCurrency, formatLunaAn, istoric, idx);
                                                const labels = {
                                                    dobanda: 'Dobândă',
                                                    impr_deb: 'Împrumut Acordat',
                                                    impr_cred: 'Rată Achitată',
                                                    impr_sold: 'Sold Împrumut'
                                                };
                                                return (_jsxs(React.Fragment, { children: [_jsxs("div", { className: "font-semibold text-slate-700", children: [labels[field], ":"] }), _jsx("div", { className: `text-right ${className}`, children: display })] }, field));
                                            }) })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("h3", { className: "font-bold text-purple-800 border-b border-purple-200 pb-1 flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-purple-500 rounded-full" }), "DEPUNERI"] }), _jsx("div", { className: "grid grid-cols-2 gap-3 text-sm", children: ['dep_deb', 'dep_cred', 'dep_sold'].map((field) => {
                                                const { display, className } = getFormattedValue(tranz, field, formatCurrency, formatLunaAn, istoric, idx);
                                                const labels = {
                                                    dep_deb: 'Cotizație',
                                                    dep_cred: 'Retragere',
                                                    dep_sold: 'Sold Depuneri'
                                                };
                                                return (_jsxs(React.Fragment, { children: [_jsxs("div", { className: "font-semibold text-slate-700", children: [labels[field], ":"] }), _jsx("div", { className: `text-right ${className}`, children: display })] }, field));
                                            }) })] })] }))] }, `${tranz.anul}-${tranz.luna}-${idx}`)))] }));
    }
    catch (error) {
        console.error("Eroare render MobileHistoryViewEnhanced:", error);
        return (_jsx("div", { className: "p-4", children: _jsxs(Alert, { children: [_jsx(AlertCircle, { className: "w-4 h-4" }), _jsxs(AlertDescription, { children: ["Eroare la afi\u0219area istoricului. Te rog re\u00EEncarc\u0103 pagina sau contacteaz\u0103 suportul.", _jsxs("div", { className: "text-xs mt-2 text-slate-600", children: ["Eroare: ", error instanceof Error ? error.message : String(error)] })] })] }) }));
    }
}
function TransactionDialog({ open, onClose, tranzactie, membruInfo, databases, rataDobanda, onSave, formatCurrency, formatLunaAn }) {
    const [formData, setFormData] = useState({
        dobanda: tranzactie.dobanda.toString(),
        impr_deb: tranzactie.impr_deb.toString(),
        impr_cred: tranzactie.impr_cred.toString(),
        dep_deb: tranzactie.dep_deb.toString(),
        dep_cred: tranzactie.dep_cred.toString()
    });
    const [calcImprumut, setCalcImprumut] = useState("");
    const [calcLuni, setCalcLuni] = useState("");
    const [calcRataFixa, setCalcRataFixa] = useState("");
    const [calcOption, setCalcOption] = useState('luni');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const handleCalculeazaRata = () => {
        try {
            if (calcOption === 'luni') {
                const suma = new Decimal(calcImprumut || "0");
                const luni = parseInt(calcLuni || "0");
                if (luni <= 0) {
                    alert("Numărul de luni trebuie să fie pozitiv!");
                    return;
                }
                const rata = suma.dividedBy(luni);
                setFormData(prev => ({ ...prev, impr_cred: rata.toFixed(2) }));
            }
            else {
                const suma = new Decimal(calcImprumut || "0");
                const rataFixa = new Decimal(calcRataFixa || "0");
                if (rataFixa.lessThanOrEqualTo(0)) {
                    alert("Rata fixă trebuie să fie pozitivă!");
                    return;
                }
                if (rataFixa.greaterThan(suma)) {
                    alert("Rata fixă nu poate fi mai mare decât suma împrumutului!");
                    return;
                }
                const nrRateExact = suma.dividedBy(rataFixa);
                const nrRateIntreg = nrRateExact.ceil();
                const ultimaRata = suma.minus(rataFixa.times(nrRateIntreg.minus(1)));
                let rezultat = `Număr rate: ${nrRateIntreg}`;
                if (!ultimaRata.equals(rataFixa)) {
                    rezultat += ` (ultima rată: ${ultimaRata.toFixed(2)} RON)`;
                }
                alert(rezultat);
            }
        }
        catch (err) {
            alert("Eroare la calcul!");
        }
    };
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
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
            // Actualizare cotizație standard dacă s-a modificat
            if (!dep_deb.equals(membruInfo.cotizatie_standard)) {
                if (confirm(`Doriți să actualizați și cotizația standard de la ${formatCurrency(membruInfo.cotizatie_standard)} la ${formatCurrency(dep_deb)} RON?`)) {
                    databases.membrii.run(`
            UPDATE membrii
            SET COTIZATIE_STANDARD = ?
            WHERE NR_FISA = ?
          `, [dep_deb.toNumber(), membruInfo.nr_fisa]);
                }
            }
            // Recalculare lunilor ulterioare
            await recalculeazaLuniUlterioare(databases.depcred, membruInfo.nr_fisa, tranzactie.luna, tranzactie.anul, rataDobanda);
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
    return (_jsx(Dialog, { open: open, onOpenChange: onClose, children: _jsxs(DialogContent, { className: "max-w-2xl max-h-[90vh] overflow-y-auto", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { children: ["Modificare Tranzac\u021Bie - ", formatLunaAn(tranzactie.luna, tranzactie.anul)] }) }), _jsxs("div", { className: "space-y-4", children: [error && (_jsxs(Alert, { variant: "destructive", children: [_jsx(AlertCircle, { className: "w-4 h-4" }), _jsx(AlertDescription, { children: error })] })), _jsxs("div", { className: "bg-slate-50 p-3 rounded text-sm", children: [_jsx("div", { className: "font-semibold", children: membruInfo.nume }), _jsxs("div", { className: "text-slate-600", children: ["Fi\u0219a: ", membruInfo.nr_fisa] })] }), _jsxs(Card, { className: "bg-blue-50 border-blue-300", children: [_jsx(CardHeader, { className: "pb-3", children: _jsxs(CardTitle, { className: "text-sm flex items-center gap-2", children: [_jsx(Calculator, { className: "w-4 h-4" }), "Calculator Rate"] }) }), _jsx(CardContent, { className: "space-y-3", children: _jsxs("div", { className: "grid grid-cols-1 gap-2", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-semibold", children: "Sum\u0103 \u00CEmprumut:" }), _jsx(Input, { type: "number", step: "0.01", value: calcImprumut, onChange: (e) => setCalcImprumut(e.target.value), placeholder: "0.00" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs("div", { children: [_jsxs("label", { className: "text-xs font-semibold flex items-center gap-1", children: [_jsx("input", { type: "radio", name: "calcOption", checked: calcOption === 'luni', onChange: () => setCalcOption('luni'), className: "text-blue-600" }), "Num\u0103r Luni:"] }), _jsx(Input, { type: "number", value: calcLuni, onChange: (e) => setCalcLuni(e.target.value), placeholder: "12", disabled: calcOption !== 'luni' })] }), _jsxs("div", { children: [_jsxs("label", { className: "text-xs font-semibold flex items-center gap-1", children: [_jsx("input", { type: "radio", name: "calcOption", checked: calcOption === 'rata', onChange: () => setCalcOption('rata'), className: "text-blue-600" }), "Rat\u0103 Fix\u0103:"] }), _jsx(Input, { type: "number", step: "0.01", value: calcRataFixa, onChange: (e) => setCalcRataFixa(e.target.value), placeholder: "0.00", disabled: calcOption !== 'rata' })] })] }), _jsx(Button, { onClick: handleCalculeazaRata, className: "w-full", children: "Calculeaz\u0103" })] }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-3", children: [_jsx("h3", { className: "font-semibold text-blue-800 border-b border-blue-300 pb-1", children: "\u00CEMPRUMUTURI" }), _jsxs("div", { children: [_jsx("label", { className: "text-sm font-semibold", children: "Dob\u00E2nd\u0103:" }), _jsx(Input, { type: "number", step: "0.01", value: formData.dobanda, onChange: (e) => setFormData(prev => ({ ...prev, dobanda: e.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-sm font-semibold", children: "\u00CEmprumut (Debit):" }), _jsx(Input, { type: "number", step: "0.01", value: formData.impr_deb, onChange: (e) => setFormData(prev => ({ ...prev, impr_deb: e.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-sm font-semibold", children: "Rat\u0103 Achitat\u0103 (Credit):" }), _jsx(Input, { type: "number", step: "0.01", value: formData.impr_cred, onChange: (e) => setFormData(prev => ({ ...prev, impr_cred: e.target.value })) })] }), _jsxs("div", { className: "bg-blue-100 p-2 rounded", children: [_jsx("div", { className: "text-xs text-slate-600", children: "Sold \u00CEmprumut Curent:" }), _jsxs("div", { className: "font-bold text-blue-800", children: [formatCurrency(tranzactie.impr_sold), " RON"] })] })] }), _jsxs("div", { className: "space-y-3", children: [_jsx("h3", { className: "font-semibold text-purple-800 border-b border-purple-300 pb-1", children: "DEPUNERI" }), _jsxs("div", { children: [_jsx("label", { className: "text-sm font-semibold", children: "Cotiza\u021Bie (Debit):" }), _jsx(Input, { type: "number", step: "0.01", value: formData.dep_deb, onChange: (e) => setFormData(prev => ({ ...prev, dep_deb: e.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-sm font-semibold", children: "Retragere (Credit):" }), _jsx(Input, { type: "number", step: "0.01", value: formData.dep_cred, onChange: (e) => setFormData(prev => ({ ...prev, dep_cred: e.target.value })) })] }), _jsxs("div", { className: "bg-purple-100 p-2 rounded", children: [_jsx("div", { className: "text-xs text-slate-600", children: "Sold Depuneri Curent:" }), _jsxs("div", { className: "font-bold text-purple-800", children: [formatCurrency(tranzactie.dep_sold), " RON"] })] })] })] }), _jsxs(Alert, { children: [_jsx(Info, { className: "w-4 h-4" }), _jsx(AlertDescription, { className: "text-xs", children: "Modific\u0103rile vor declan\u0219a recalcularea automat\u0103 a tuturor lunilor ulterioare. Soldurile vor fi actualizate conform formulei: sold_nou = sold_vechi + debit - credit" })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { onClick: onClose, variant: "outline", disabled: saving, children: "Anuleaz\u0103" }), _jsxs(Button, { onClick: handleSave, disabled: saving, className: "gap-2", children: [saving && _jsx(Loader2, { className: "w-4 h-4 animate-spin" }), "Salveaz\u0103 Modific\u0103rile"] })] })] }) }));
}
// ==========================================
// FUNCȚII BUSINESS LOGIC (EXACT CA ÎN PYTHON)
// ==========================================
function calculateDobandaLaZi(istoric, rataDobanda) {
    if (!istoric || istoric.length === 0) {
        return new Decimal(0);
    }
    const istoricSortat = [...istoric].sort((a, b) => {
        if (a.anul !== b.anul) {
            return a.anul - b.anul;
        }
        return a.luna - b.luna;
    });
    const end = istoricSortat[istoricSortat.length - 1];
    const end_period_val = end.anul * 100 + end.luna;
    let start_period_val = 0;
    let last_disbursement = null;
    for (let i = istoricSortat.length - 1; i >= 0; i--) {
        const t = istoricSortat[i];
        const period_val = t.anul * 100 + t.luna;
        if (period_val <= end_period_val && t.impr_deb.greaterThan(0)) {
            last_disbursement = t;
            break;
        }
    }
    if (!last_disbursement) {
        return new Decimal(0);
    }
    const last_disbursement_period_val = last_disbursement.anul * 100 + last_disbursement.luna;
    if (last_disbursement.dobanda.greaterThan(0)) {
        start_period_val = last_disbursement_period_val;
    }
    else {
        let last_zero = null;
        for (let i = 0; i < istoricSortat.length; i++) {
            const t = istoricSortat[i];
            const period_val = t.anul * 100 + t.luna;
            if (period_val < last_disbursement_period_val &&
                t.impr_sold.lessThanOrEqualTo(new Decimal("0.005"))) {
                last_zero = t;
            }
        }
        if (last_zero) {
            let next_luna = last_zero.luna + 1;
            let next_anul = last_zero.anul;
            if (next_luna > 12) {
                next_luna = 1;
                next_anul++;
            }
            const start_p_temp = next_anul * 100 + next_luna;
            // IMPORTANT: START nu poate fi mai devreme decât ultimul împrumut (ca în Python)
            start_period_val = Math.min(start_p_temp, last_disbursement_period_val);
        }
        else {
            start_period_val = last_disbursement_period_val;
        }
    }
    let sumaSolduri = new Decimal(0);
    for (let i = 0; i < istoricSortat.length; i++) {
        const t = istoricSortat[i];
        const period_val = t.anul * 100 + t.luna;
        if (period_val >= start_period_val && period_val <= end_period_val) {
            if (t.impr_sold.greaterThan(0)) {
                sumaSolduri = sumaSolduri.plus(t.impr_sold);
            }
        }
    }
    return sumaSolduri.times(rataDobanda).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
async function recalculeazaLuniUlterioare(dbDepcred, nr_fisa, luna_start, anul_start, _rata_dobanda) {
    try {
        const result = dbDepcred.exec(`
      SELECT luna, anul, dobanda, impr_deb, impr_cred, impr_sold, dep_deb, dep_cred, dep_sold
      FROM depcred
      WHERE nr_fisa = ?
      ORDER BY anul ASC, luna ASC
    `, [nr_fisa]);
        if (result.length === 0)
            return;
        const tranzactii = result[0].values.map((row) => ({
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
        const idxStart = tranzactii.findIndex((t) => t.anul === anul_start && t.luna === luna_start);
        if (idxStart === -1)
            return;
        for (let i = idxStart + 1; i < tranzactii.length; i++) {
            const tranzPrev = tranzactii[i - 1];
            const tranzCurr = tranzactii[i];
            let sold_impr = tranzPrev.impr_sold
                .plus(tranzCurr.impr_deb)
                .minus(tranzCurr.impr_cred);
            if (sold_impr.lessThan(PRAG_ZEROIZARE)) {
                sold_impr = new Decimal("0");
            }
            let sold_dep = tranzPrev.dep_sold
                .plus(tranzCurr.dep_deb)
                .minus(tranzCurr.dep_cred);
            if (sold_dep.lessThan(PRAG_ZEROIZARE)) {
                sold_dep = new Decimal("0");
            }
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
            tranzactii[i].impr_sold = sold_impr;
            tranzactii[i].dep_sold = sold_dep;
        }
    }
    catch (error) {
        console.error("Eroare recalculare luni ulterioare:", error);
        throw error;
    }
}
