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
import { Loader2, Edit, Calculator, RotateCcw, Info, AlertCircle, Calendar, ChevronDown } from "lucide-react";
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
// FORMATARE VIZUALĂ CONDIȚIONATĂ (EXACT CA ÎN PYTHON)
// ==========================================
const getFormattedValue = (tranz, key, formatCurrency, formatLunaAn, istoric, index) => {
    try {
        const prevTranz = istoric && index !== undefined ? istoric[index + 1] : undefined;
        switch (key) {
            case 'dobanda':
                // Dobândă - mereu negru normal (EXACT ca în Python)
                return {
                    display: formatCurrency(tranz.dobanda),
                    className: 'text-slate-800'
                };
            case 'impr_deb':
                // Împrumut Nou - blue bold când > 0
                if (tranz.impr_deb.greaterThan(0)) {
                    return {
                        display: formatCurrency(tranz.impr_deb),
                        className: 'text-blue-600 font-bold'
                    };
                }
                return {
                    display: formatCurrency(tranz.impr_deb),
                    className: 'text-slate-800'
                };
            case 'impr_cred':
                // Rată Achitată - logica EXACTĂ din Python
                if (tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
                    // Dacă în luna CURENTĂ s-a acordat împrumut nou -> afișare normală 0.00
                    if (tranz.impr_deb.greaterThan(0)) {
                        return {
                            display: formatCurrency(tranz.impr_cred),
                            className: 'text-slate-800'
                        };
                    }
                    // Verificare lună ANTERIOARĂ
                    const prevHadNewLoan = prevTranz && prevTranz.impr_deb.greaterThan(0);
                    if (prevHadNewLoan) {
                        // Luna anterioară a avut împrumut nou -> !NOU! portocaliu bold
                        return {
                            display: '!NOU!',
                            className: 'text-orange-600 font-bold'
                        };
                    }
                    else {
                        // Luna anterioară NU a avut împrumut nou -> Neachitat! roșu bold
                        return {
                            display: 'Neachitat!',
                            className: 'text-red-600 font-bold'
                        };
                    }
                }
                // Afișare normală cu 2 zecimale
                return {
                    display: formatCurrency(tranz.impr_cred),
                    className: 'text-slate-800'
                };
            case 'impr_sold':
                // Sold Împrumut - logica EXACTĂ din Python
                // 1. Dacă dobândă > 0 -> Achitat verde bold
                if (tranz.dobanda.greaterThan(0)) {
                    return {
                        display: 'Achitat',
                        className: 'text-green-600 font-bold'
                    };
                }
                // 2. Dacă sold ≤ 0.005
                if (tranz.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
                    // Cazul special: împrumut nou + rată achitată în aceeași lună
                    if (tranz.impr_deb.greaterThan(0) && tranz.impr_cred.greaterThan(0) && prevTranz) {
                        const soldVechiCalculat = prevTranz.impr_sold.minus(tranz.impr_cred);
                        if (soldVechiCalculat.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
                            return {
                                display: 'Achitat',
                                className: 'text-green-600 font-bold'
                            };
                        }
                    }
                    // Caz normal: există rată achitată și sold_precedent > 0.005
                    if (tranz.impr_cred.greaterThan(0) && prevTranz && prevTranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
                        return {
                            display: 'Achitat',
                            className: 'text-green-600 font-bold'
                        };
                    }
                    // Altfel: 0.00
                    return {
                        display: formatCurrency(tranz.impr_sold),
                        className: 'text-slate-800'
                    };
                }
                // 3. Afișare normală cu 2 zecimale (NU bold, NU blue!)
                return {
                    display: formatCurrency(tranz.impr_sold),
                    className: 'text-slate-800'
                };
            case 'luna_an':
                return {
                    display: formatLunaAn(tranz.luna, tranz.anul),
                    className: 'text-slate-800 font-semibold'
                };
            case 'dep_deb':
                // Cotizație neachitată - roșu bold (EXACT ca în Python)
                if (tranz.dep_deb.equals(0) && prevTranz && prevTranz.dep_sold.greaterThan(PRAG_ZEROIZARE)) {
                    return {
                        display: 'Neachitat!',
                        className: 'text-red-600 font-bold'
                    };
                }
                return {
                    display: formatCurrency(tranz.dep_deb),
                    className: 'text-slate-800'
                };
            case 'dep_cred':
                // Retragere - mereu normal
                return {
                    display: formatCurrency(tranz.dep_cred),
                    className: 'text-slate-800'
                };
            case 'dep_sold':
                // Sold Depuneri - mereu negru normal (NU purple!)
                return {
                    display: formatCurrency(tranz.dep_sold),
                    className: 'text-slate-800'
                };
            default:
                return {
                    display: '—',
                    className: 'text-slate-800'
                };
        }
    }
    catch (error) {
        console.error(`Eroare formatare ${key}:`, error);
        return {
            display: 'ERR',
            className: 'text-red-600'
        };
    }
};
const getMonthStatus = (tranz, prevTranz, formatCurrency) => {
    // 1. Împrumut NOU + Achitare vechi (cazul special)
    if (tranz.impr_deb.greaterThan(0) &&
        tranz.impr_cred.greaterThan(0) &&
        prevTranz &&
        prevTranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
        const soldVechiCalculat = prevTranz.impr_sold.minus(tranz.impr_cred);
        if (soldVechiCalculat.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
            return {
                title: '🔄 Împrumut nou + Achitare vechi',
                subtitle: `Nou: ${formatCurrency(tranz.impr_deb)} RON | Achitat: ${formatCurrency(tranz.impr_cred)} RON`,
                colorClass: 'text-blue-600',
                iconColor: 'bg-blue-500'
            };
        }
    }
    // 2. Împrumut NOU acordat
    if (tranz.impr_deb.greaterThan(0)) {
        return {
            title: `💰 Împrumut nou: ${formatCurrency(tranz.impr_deb)} RON`,
            subtitle: 'Acord împrumut',
            colorClass: 'text-blue-600',
            iconColor: 'bg-blue-500'
        };
    }
    // 3. Împrumut ACHITAT complet
    if (tranz.impr_cred.greaterThan(0) && tranz.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
        return {
            title: '✅ Împrumut achitat complet',
            subtitle: `Achitat: ${formatCurrency(tranz.impr_cred)} RON`,
            colorClass: 'text-green-600',
            iconColor: 'bg-green-500'
        };
    }
    // 4. Stabilește rată (prima lună după contract)
    if (tranz.impr_cred.equals(0) &&
        tranz.impr_sold.greaterThan(PRAG_ZEROIZARE) &&
        prevTranz &&
        prevTranz.impr_deb.greaterThan(0)) {
        return {
            title: '🆕 Stabilește rată',
            subtitle: `Sold: ${formatCurrency(tranz.impr_sold)} RON`,
            colorClass: 'text-orange-600',
            iconColor: 'bg-orange-500'
        };
    }
    // 5. Rată NEACHITATĂ
    if (tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
        return {
            title: '⚠️ Rată neachitată',
            subtitle: `Sold: ${formatCurrency(tranz.impr_sold)} RON`,
            colorClass: 'text-red-600',
            iconColor: 'bg-red-500'
        };
    }
    // 6. Rată ACHITATĂ parțial
    if (tranz.impr_cred.greaterThan(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
        return {
            title: '💵 Rată achitată',
            subtitle: `Plată: ${formatCurrency(tranz.impr_cred)} RON | Sold rămas: ${formatCurrency(tranz.impr_sold)} RON`,
            colorClass: 'text-green-500',
            iconColor: 'bg-green-400'
        };
    }
    // 7. Împrumut ACTIV (default pentru sold > 0)
    if (tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
        return {
            title: '📊 Împrumut activ',
            subtitle: `Sold: ${formatCurrency(tranz.impr_sold)} RON`,
            colorClass: 'text-purple-600',
            iconColor: 'bg-purple-500'
        };
    }
    // 8. Fără împrumut
    return {
        title: MONTHS[tranz.luna - 1] + ' ' + tranz.anul,
        subtitle: 'Fără împrumuturi active',
        colorClass: 'text-slate-700',
        iconColor: 'bg-green-400'
    };
};
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
    // Filtrare autocomplete - PREFIX only (nu substring)
    const filteredMembri = useMemo(() => {
        if (!searchTerm.trim())
            return [];
        const term = searchTerm.toLowerCase();
        return membri
            .filter(m => m.nume.toLowerCase().startsWith(term) ||
            m.nr_fisa.toString().startsWith(term))
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
        const confirmMsg = `Se va calcula dobânda pentru achitare anticipată:\n\n` +
            `Sold Împrumut Curent: ${formatCurrency(ultimaTranzactie.impr_sold)} RON\n` +
            `Rată Dobândă: ${rataDobanda.times(1000).toFixed(1)}‰ (${rataDobanda.times(100).toFixed(1)}%)\n` +
            `Dobândă Calculată: ${formatCurrency(ultimaTranzactie.impr_sold.times(rataDobanda))} RON\n\n` +
            `Dobânda se calculează și se afișează, dar nu se adaugă automat la sold.\n\n` +
            `Continuați?`;
        if (!confirm(confirmMsg))
            return;
        try {
            setLoading(true);
            // Calcul dobândă = sold_împrumut × rata_dobândă
            const dobandaCalculata = ultimaTranzactie.impr_sold.times(rataDobanda);
            // Update tranzacție curentă: adaugă dobânda calculată la câmpul dobândă
            const dobandaNoua = ultimaTranzactie.dobanda.plus(dobandaCalculata);
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
            // Recalculare lunilor ulterioare (pentru a propaga modificarea)
            await recalculeazaLuniUlterioare(databases.depcred, selectedMembru.nr_fisa, ultimaTranzactie.luna, ultimaTranzactie.anul, rataDobanda);
            // Refresh date
            const istoricData = citesteIstoricMembru(databases.depcred, selectedMembru.nr_fisa);
            setIstoric(istoricData);
            alert(`Dobanda a fost aplicata cu succes!`);
        }
        catch (error) {
            console.error("Eroare aplicare dobândă:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            alert(`Dobanda nu a putut fi procesata pentru ca: ${errorMessage}`);
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
    return (_jsxs("div", { className: "w-full h-full flex flex-col gap-4 p-4 bg-slate-50", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx(Button, { onClick: onBack, variant: "outline", className: "gap-2", children: "\u2190 \u00CEnapoi la Dashboard" }), _jsx("h1", { className: "text-2xl font-bold text-slate-800", children: "\uD83D\uDCB0 Sume Lunare" }), _jsx("div", { className: "w-[120px]" }), " "] }), _jsxs("div", { className: `rounded-xl p-4 bg-gradient-to-b ${selectedMembru && membruLichidat ? 'from-red-100 to-red-200 border-[2px] border-red-500' : 'from-blue-50 to-blue-100 border-[2px] border-blue-500'}`, children: [selectedMembru && membruLichidat && (_jsxs("div", { className: "mb-3 text-center text-red-600 font-bold flex items-center justify-center gap-2", children: [_jsx(AlertCircle, { className: "w-5 h-5" }), "MEMBRU LICHIDAT"] })), _jsxs("div", { className: "grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 gap-y-2 items-center", children: [_jsx("label", { className: "font-semibold text-slate-700 text-sm", children: "Nume:" }), _jsxs("div", { className: "relative col-span-1", children: [_jsx(Input, { type: "text", placeholder: "\u00CEncepe\u021Bi s\u0103 tasta\u021Bi numele...", value: searchTerm, onChange: (e) => handleSearch(e.target.value), onFocus: () => setShowAutocomplete(searchTerm.trim().length > 0), className: "bg-white border-[2px] border-blue-300 text-slate-700" }), showAutocomplete && filteredMembri.length > 0 && (_jsx("div", { className: "absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-[300px] overflow-y-auto", children: filteredMembri.map((membru) => (_jsxs("button", { onClick: () => handleSelectMembru(membru), className: "w-full px-4 py-2 text-left hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors", children: [_jsx("div", { className: "font-medium text-slate-800", children: membru.nume }), _jsxs("div", { className: "text-sm text-slate-500", children: ["Fi\u0219a: ", membru.nr_fisa] })] }, membru.nr_fisa))) }))] }), _jsx("label", { className: "font-semibold text-slate-700 text-sm", children: "Nr. Fi\u0219\u0103:" }), _jsx(Input, { value: selectedMembru?.nr_fisa || "", readOnly: true, className: "w-24 bg-white border-[2px] border-blue-300 text-slate-700" }), _jsxs(Button, { onClick: handleReset, className: "min-w-[120px] min-h-[35px] bg-gradient-to-b from-red-400 to-red-600 hover:from-red-500 hover:to-red-700 text-white font-semibold border-2 border-red-700 shadow-md", children: [_jsx(RotateCcw, { className: "w-4 h-4 mr-2" }), "Reset"] }), _jsx("label", { className: "font-semibold text-slate-700 text-sm", children: "Adres\u0103:" }), _jsx(Input, { value: selectedMembru?.adresa || "—", readOnly: true, className: "col-span-1 bg-white border-[2px] border-blue-300 text-slate-700" }), _jsx("label", { className: "font-semibold text-slate-700 text-sm", children: "Data \u00CEnsc.:" }), _jsx(Input, { value: selectedMembru?.data_inscriere || "—", readOnly: true, className: "w-28 bg-white border-[2px] border-blue-300 text-slate-700" }), _jsxs(Button, { onClick: handleAplicaDobanda, disabled: !ultimaTranzactie || membruLichidat, className: "min-w-[140px] min-h-[35px] bg-gradient-to-b from-cyan-500 to-cyan-700 hover:from-cyan-600 hover:to-cyan-800 text-white font-semibold border-2 border-cyan-800 shadow-md disabled:from-gray-400 disabled:to-gray-500 disabled:border-gray-600", children: [_jsx(Calculator, { className: "w-4 h-4 mr-2" }), "Aplic\u0103 Dob\u00E2nd\u0103"] }), _jsx("label", { className: "font-semibold text-slate-700 text-sm", children: "Calitate:" }), _jsx(Input, { value: selectedMembru?.calitate || "—", readOnly: true, className: "col-span-1 bg-white border-[2px] border-blue-300 text-slate-700" }), _jsx("div", { className: "col-span-2" }), " ", _jsxs(Button, { onClick: handleModificaTranzactie, disabled: !ultimaTranzactie || membruLichidat, className: "min-w-[140px] min-h-[35px] bg-gradient-to-b from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-slate-900 font-semibold border-2 border-yellow-700 shadow-md disabled:from-gray-400 disabled:to-gray-500 disabled:border-gray-600 disabled:text-gray-200", children: [_jsx(Edit, { className: "w-4 h-4 mr-2" }), "Modific\u0103 Tranzac\u021Bie"] })] })] }), selectedMembru && istoric.length > 0 && (_jsx("div", { className: "hidden lg:block", children: _jsx(DesktopHistoryView, { istoric: istoric, scrollRefs: scrollRefs, formatCurrency: formatCurrency, formatLunaAn: formatLunaAn }) })), selectedMembru && istoric.length > 0 && (_jsx("div", { className: "lg:hidden", children: _jsx(MobileHistoryView, { istoric: istoric, formatCurrency: formatCurrency, formatLunaAn: formatLunaAn }) })), selectedTranzactie && (_jsx(TransactionDialog, { open: dialogOpen, onClose: () => setDialogOpen(false), tranzactie: selectedTranzactie, membruInfo: selectedMembru, databases: databases, rataDobanda: rataDobanda, formatCurrency: formatCurrency, formatLunaAn: formatLunaAn, onSave: (noualeTranzactie) => {
                    // Trigger recalculation și refresh
                    handleSelectMembru({ nr_fisa: selectedMembru.nr_fisa, nume: selectedMembru.nume, display: "" });
                    setDialogOpen(false);
                } }))] }));
}
function DesktopHistoryView({ istoric, scrollRefs, formatCurrency, formatLunaAn }) {
    const isScrollingRef = useRef(false);
    const handleScroll = (sourceIndex, event) => {
        if (isScrollingRef.current)
            return;
        isScrollingRef.current = true;
        const sourceElement = event.currentTarget;
        const scrollTop = sourceElement.scrollTop;
        // Sincronizează cu toate celelalte coloane folosind requestAnimationFrame pentru fluiditate
        requestAnimationFrame(() => {
            scrollRefs.current.forEach((ref, index) => {
                if (ref && index !== sourceIndex) {
                    ref.scrollTop = scrollTop;
                }
            });
            // Reset flag după un scurt delay (10ms pentru responsivitate maximă)
            setTimeout(() => {
                isScrollingRef.current = false;
            }, 10);
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
    return (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Istoric Financiar" }) }), _jsxs(CardContent, { children: [_jsxs("div", { className: "grid grid-cols-[4fr_1fr_3fr] gap-2", children: [_jsxs("div", { className: "border-[3px] border-red-500 rounded-lg overflow-hidden bg-gradient-to-b from-red-50 to-red-100", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-red-200 to-red-300 border-b-2 border-red-400", children: "Situa\u021Bie \u00CEmprumuturi" }), _jsx("div", { className: "grid grid-cols-4 gap-px bg-gray-300", children: columns.slice(0, 4).map((col, idx) => (_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: col.title }), _jsx("div", { ref: (el) => { scrollRefs.current[idx] = el; }, onScroll: (e) => handleScroll(idx, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, tranzIdx) => {
                                                            const { display, className } = getFormattedValue(tranz, col.key, formatCurrency, formatLunaAn, istoric, tranzIdx);
                                                            return (_jsx("div", { className: `p-2 text-center text-sm hover:bg-blue-50 ${className}`, children: display }, `${tranz.anul}-${tranz.luna}-${tranzIdx}`));
                                                        }) }) })] }, col.key))) })] }), _jsxs("div", { className: "border-[3px] border-slate-500 rounded-lg overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-slate-300 to-slate-400 border-b-2 border-slate-500", children: "Dat\u0103" }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: columns[4].title }), _jsx("div", { ref: (el) => { scrollRefs.current[4] = el; }, onScroll: (e) => handleScroll(4, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, tranzIdx) => {
                                                        const { display, className } = getFormattedValue(tranz, columns[4].key, formatCurrency, formatLunaAn, istoric, tranzIdx);
                                                        return (_jsx("div", { className: `p-2 text-center text-sm font-semibold hover:bg-green-50 ${className}`, children: display }, `${tranz.anul}-${tranz.luna}-${tranzIdx}`));
                                                    }) }) })] })] }), _jsxs("div", { className: "border-[3px] border-green-600 rounded-lg overflow-hidden bg-gradient-to-b from-green-50 to-green-100", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-500", children: "Situa\u021Bie Depuneri" }), _jsx("div", { className: "grid grid-cols-3 gap-px bg-gray-300", children: columns.slice(5, 8).map((col, idx) => (_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: col.title }), _jsx("div", { ref: (el) => { scrollRefs.current[idx + 5] = el; }, onScroll: (e) => handleScroll(idx + 5, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, tranzIdx) => {
                                                            const { display, className } = getFormattedValue(tranz, col.key, formatCurrency, formatLunaAn, istoric, tranzIdx);
                                                            return (_jsx("div", { className: `p-2 text-center text-sm hover:bg-purple-50 ${className}`, children: display }, `${tranz.anul}-${tranz.luna}-${tranzIdx}`));
                                                        }) }) })] }, col.key))) })] })] }), _jsxs("div", { className: "mt-2 text-xs text-slate-500 text-center flex items-center justify-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-green-500 rounded-full animate-pulse" }), "\uD83D\uDD04 Scroll sincronizat - derula\u021Bi orice coloan\u0103 pentru a sincroniza toate"] })] })] }));
}
function MobileHistoryView({ istoric, formatCurrency, formatLunaAn }) {
    const [expandedMonth, setExpandedMonth] = useState(null);
    return (_jsxs("div", { className: "space-y-4", children: [_jsx("h2", { className: "text-xl font-bold text-slate-800 px-2", children: "Istoric Financiar" }), istoric.map((tranz, idx) => {
                const isExpanded = expandedMonth === idx;
                const prevTranz = idx < istoric.length - 1 ? istoric[idx + 1] : undefined;
                const monthStatus = getMonthStatus(tranz, prevTranz, formatCurrency);
                return (_jsxs(Card, { className: "shadow-lg border-l-4 border-blue-500", children: [_jsxs(CardHeader, { className: "pb-3 bg-slate-50 cursor-pointer", onClick: () => setExpandedMonth(isExpanded ? null : idx), children: [_jsxs(CardTitle, { className: "text-base flex items-center justify-between mb-2", children: [_jsxs("span", { className: "text-xs font-normal text-slate-500 flex items-center gap-1", children: [_jsx(Calendar, { className: "w-4 h-4" }), formatLunaAn(tranz.luna, tranz.anul), " \u00B7 ", MONTHS[tranz.luna - 1]] }), _jsx(ChevronDown, { className: `w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}` })] }), _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("div", { className: `w-2 h-2 ${monthStatus.iconColor} rounded-full mt-1.5 flex-shrink-0` }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: `font-bold text-base ${monthStatus.colorClass} leading-snug`, children: monthStatus.title }), _jsx("div", { className: "text-xs text-slate-600 mt-0.5", children: monthStatus.subtitle })] })] })] }), isExpanded && (_jsxs(CardContent, { className: "space-y-4 pt-4", children: [_jsxs("div", { className: "space-y-3", children: [_jsxs("h3", { className: "font-bold text-blue-800 border-b border-blue-200 pb-1 flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full" }), "\u00CEMPRUMUTURI"] }), _jsxs("div", { className: "space-y-2 text-sm", children: [(() => {
                                                    const { display, className } = getFormattedValue(tranz, 'dobanda', formatCurrency, formatLunaAn, istoric, idx);
                                                    return (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "font-semibold text-slate-700", children: "Dob\u00E2nd\u0103:" }), _jsxs("span", { className: className, children: [display, " RON"] })] }));
                                                })(), (() => {
                                                    const { display, className } = getFormattedValue(tranz, 'impr_deb', formatCurrency, formatLunaAn, istoric, idx);
                                                    return (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "font-semibold text-slate-700", children: "\u00CEmprumut Acordat:" }), _jsxs("span", { className: className, children: [display, " RON"] })] }));
                                                })(), (() => {
                                                    const { display, className } = getFormattedValue(tranz, 'impr_cred', formatCurrency, formatLunaAn, istoric, idx);
                                                    return (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "font-semibold text-slate-700", children: "Rat\u0103 Achitat\u0103:" }), _jsx("span", { className: className, children: display })] }));
                                                })(), (() => {
                                                    const { display, className } = getFormattedValue(tranz, 'impr_sold', formatCurrency, formatLunaAn, istoric, idx);
                                                    return (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "font-semibold text-slate-700", children: "Sold \u00CEmprumut:" }), _jsx("span", { className: className, children: display })] }));
                                                })()] })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("h3", { className: "font-bold text-purple-800 border-b border-purple-200 pb-1 flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-purple-500 rounded-full" }), "DEPUNERI"] }), _jsxs("div", { className: "space-y-2 text-sm", children: [(() => {
                                                    const { display, className } = getFormattedValue(tranz, 'dep_deb', formatCurrency, formatLunaAn, istoric, idx);
                                                    return (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "font-semibold text-slate-700", children: "Cotiza\u021Bie:" }), _jsx("span", { className: className, children: display })] }));
                                                })(), (() => {
                                                    const { display, className } = getFormattedValue(tranz, 'dep_cred', formatCurrency, formatLunaAn, istoric, idx);
                                                    return (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "font-semibold text-slate-700", children: "Retragere:" }), _jsxs("span", { className: className, children: [display, " RON"] })] }));
                                                })(), (() => {
                                                    const { display, className } = getFormattedValue(tranz, 'dep_sold', formatCurrency, formatLunaAn, istoric, idx);
                                                    return (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "font-semibold text-slate-700", children: "Sold Depuneri:" }), _jsxs("span", { className: className, children: [display, " RON"] })] }));
                                                })()] })] })] }))] }, `${tranz.anul}-${tranz.luna}-${idx}`));
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
