import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// src/components/CalculeazaDobanda.tsx
/**
 * Modul Calculează Dobânda - Doar citire din MEMBRII și DEPCRED
 *
 * FUNCȚIONALITĂȚI:
 * - Calcul read-only al dobânzii pentru un membru și perioadă selectată
 * - Afișare detalii calcul: perioadă utilizată, suma soldurilor, dobândă rezultată
 * - NU scrie în baza de date - doar calculează și afișează
 *
 * LOGICA:
 * - Identifică perioada START (ultima lună cu împrumut sau sold zero)
 * - Sumează toate soldurile pozitive din perioada START-END
 * - Aplică rata dobânzii: dobândă = SUM(solduri) × rata
 */
import { useState, useEffect, useMemo } from "react";
import Decimal from "decimal.js";
import { getActiveDB } from "../services/databaseManager";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";
import { Calculator, Info, X } from "lucide-react";
// Configurare Decimal.js
Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });
/**
 * Citește lista completă de membri pentru autocomplete
 */
function citesteMembri(databases) {
    try {
        // Set membri lichidați
        const lichidati = new Set();
        try {
            const resLich = getActiveDB(databases, 'lichidati').exec("SELECT nr_fisa FROM lichidati");
            if (resLich.length > 0) {
                resLich[0].values.forEach(row => lichidati.add(row[0]));
            }
        }
        catch {
            // LICHIDATI.db opțional
        }
        // Citire membri activi
        const result = getActiveDB(databases, 'membrii').exec(`
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
 * Funcție utilitar pentru calculul dobânzii (read-only)
 * Extrasă din SumeLunare.tsx - NU modifică baza de date
 */
function calculeazaDobandaLaZi(databases, nr_fisa, end_luna, end_anul, rata_dobanda) {
    try {
        const dbDepcred = getActiveDB(databases, 'depcred');
        const end_period_val = end_anul * 100 + end_luna;
        // ========================================
        // PASUL 1: Determină perioada START
        // ========================================
        // 1.1: Găsește ultima lună cu împrumut acordat (impr_deb > 0)
        const resultLastLoan = dbDepcred.exec(`
      SELECT MAX(anul * 100 + luna) as max_period
      FROM depcred
      WHERE nr_fisa = ? AND impr_deb > 0 AND (anul * 100 + luna) <= ?
    `, [nr_fisa, end_period_val]);
        if (resultLastLoan.length === 0 || !resultLastLoan[0].values[0][0]) {
            // Nu există împrumuturi acordate
            return {
                dobanda: new Decimal("0"),
                start_period: 0,
                suma_solduri: new Decimal("0")
            };
        }
        const last_loan_period = resultLastLoan[0].values[0][0];
        // 1.2: Verifică dacă în luna cu ultimul împrumut există dobândă și împrumut nou concomitent
        const resultConcomitent = dbDepcred.exec(`
      SELECT dobanda, impr_deb
      FROM depcred
      WHERE nr_fisa = ? AND (anul * 100 + luna) = ?
    `, [nr_fisa, last_loan_period]);
        let start_period_val = last_loan_period;
        if (resultConcomitent.length > 0 && resultConcomitent[0].values.length > 0) {
            const row = resultConcomitent[0].values[0];
            const dobanda = new Decimal(String(row[0] || "0"));
            const impr_deb = new Decimal(String(row[1] || "0"));
            // Dacă NU există dobândă și împrumut nou concomitent
            if (!(dobanda.greaterThan(0) && impr_deb.greaterThan(0))) {
                // Caută ultima lună cu sold zero (≤ 0.005) ÎNAINTE de ultimul împrumut
                const resultLastZero = dbDepcred.exec(`
          SELECT MAX(anul * 100 + luna) as max_zero_period
          FROM depcred
          WHERE nr_fisa = ?
            AND impr_sold <= 0.005
            AND (anul * 100 + luna) < ?
        `, [nr_fisa, last_loan_period]);
                if (resultLastZero.length > 0 && resultLastZero[0].values[0][0]) {
                    start_period_val = resultLastZero[0].values[0][0];
                }
            }
        }
        // ========================================
        // PASUL 2: Sumează TOATE soldurile pozitive din perioada
        // ========================================
        const resultSum = dbDepcred.exec(`
      SELECT SUM(impr_sold) as total_balances
      FROM depcred
      WHERE nr_fisa = ?
        AND (anul * 100 + luna) BETWEEN ? AND ?
        AND impr_sold > 0
    `, [nr_fisa, start_period_val, end_period_val]);
        if (resultSum.length === 0 || !resultSum[0].values[0][0]) {
            return {
                dobanda: new Decimal("0"),
                start_period: start_period_val,
                suma_solduri: new Decimal("0")
            };
        }
        const sum_of_balances = new Decimal(String(resultSum[0].values[0][0]));
        // ========================================
        // PASUL 3: Aplică rata dobânzii
        // ========================================
        const dobanda_calculata = sum_of_balances
            .times(rata_dobanda)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        return {
            dobanda: dobanda_calculata,
            start_period: start_period_val,
            suma_solduri: sum_of_balances
        };
    }
    catch (error) {
        console.error(`Eroare calcul dobândă pentru ${nr_fisa}:`, error);
        throw error;
    }
}
/**
 * Helper pentru formatare lună-an din period value
 */
function formatPeriod(period) {
    const anul = Math.floor(period / 100);
    const luna = period % 100;
    const luniRomana = [
        "Ian", "Feb", "Mar", "Apr", "Mai", "Iun",
        "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    return `${luniRomana[luna - 1]} ${anul}`;
}
/**
 * Calculează numărul de luni între două perioade
 */
function calculeazaNrLuni(start_period, end_period) {
    const start_anul = Math.floor(start_period / 100);
    const start_luna = start_period % 100;
    const end_anul = Math.floor(end_period / 100);
    const end_luna = end_period % 100;
    return (end_anul - start_anul) * 12 + (end_luna - start_luna) + 1;
}
export default function CalculeazaDobanda({ databases, onBack }) {
    const [membri, setMembri] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedMembru, setSelectedMembru] = useState(null);
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [rataDobanda, setRataDobanda] = useState("0.004");
    const [selectedLuna, setSelectedLuna] = useState(new Date().getMonth() + 1);
    const [selectedAn, setSelectedAn] = useState(new Date().getFullYear());
    const [calculResult, setCalculResult] = useState(null);
    const [error, setError] = useState("");
    // Încarcă lista membri la mount
    useEffect(() => {
        const lista = citesteMembri(databases);
        setMembri(lista);
    }, [databases]);
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
    // Handler pentru search
    const handleSearch = (value) => {
        setSearchTerm(value);
        setShowAutocomplete(value.trim().length > 0);
    };
    // Handler pentru selectare membru din autocomplete
    const handleSelectMembru = (option) => {
        setSelectedMembru(option);
        setSearchTerm(option.display);
        setShowAutocomplete(false);
        setCalculResult(null);
        setError("");
    };
    // Handler pentru reset
    const handleReset = () => {
        setSearchTerm("");
        setSelectedMembru(null);
        setShowAutocomplete(false);
        setCalculResult(null);
        setError("");
    };
    // Calculează dobânda
    const handleCalculeaza = () => {
        if (!selectedMembru) {
            setError("Selectați un membru mai întâi");
            return;
        }
        try {
            const rata = new Decimal(rataDobanda);
            if (rata.lessThanOrEqualTo(0)) {
                setError("Rata dobânzii trebuie să fie pozitivă");
                return;
            }
            const result = calculeazaDobandaLaZi(databases, selectedMembru.nr_fisa, selectedLuna, selectedAn, rata);
            const end_period = selectedAn * 100 + selectedLuna;
            const nr_luni = calculeazaNrLuni(result.start_period, end_period);
            setCalculResult({
                start_period: result.start_period > 0 ? formatPeriod(result.start_period) : "N/A",
                end_period: formatPeriod(end_period),
                suma_solduri: result.suma_solduri.toFixed(2),
                dobanda: result.dobanda.toFixed(2),
                rata_utilizata: rata.times(100).toFixed(2) + "%",
                nr_luni: nr_luni
            });
            setError("");
        }
        catch (err) {
            console.error("Eroare calcul dobândă:", err);
            setError("Eroare la calculul dobânzii. Verificați datele introduse.");
            setCalculResult(null);
        }
    };
    return (_jsx("div", { className: "min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6", children: _jsx("div", { className: "max-w-4xl mx-auto mb-6", children: _jsxs(Card, { children: [_jsx(CardHeader, { className: "bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Calculator, { className: "w-8 h-8" }), _jsx(CardTitle, { className: "text-2xl", children: "Calculeaz\u0103 Dob\u00E2nda" })] }) }), _jsxs(CardContent, { className: "p-6", children: [_jsxs(Alert, { className: "mb-4", children: [_jsx(Info, { className: "w-4 h-4" }), _jsxs(AlertDescription, { children: ["Acest instrument calculeaz\u0103 dob\u00E2nda pentru un membru \u0219i perioad\u0103 selectat\u0103.", _jsx("strong", { className: "block mt-1", children: "NU modific\u0103 baza de date - doar cite\u0219te \u0219i afi\u0219eaz\u0103 rezultatul." })] })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-slate-700 mb-2", children: "Caut\u0103 Membru (Nume sau Nr. Fi\u0219\u0103)" }), _jsxs("div", { className: "relative", children: [_jsx(Input, { type: "text", placeholder: "C\u0103uta\u021Bi dup\u0103 nume sau num\u0103r fi\u0219\u0103...", value: searchTerm, onChange: (e) => handleSearch(e.target.value), onFocus: () => setShowAutocomplete(searchTerm.trim().length > 0), className: "pr-10" }), searchTerm && (_jsx("button", { onClick: handleReset, className: "absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600", children: _jsx(X, { className: "w-5 h-5" }) })), showAutocomplete && filteredMembri.length > 0 && (_jsx("div", { className: "absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-[300px] overflow-y-auto", children: filteredMembri.map((membru) => (_jsxs("button", { onClick: () => handleSelectMembru(membru), className: "w-full px-4 py-2 text-left hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors", children: [_jsx("div", { className: "font-medium text-slate-800", children: membru.nume }), _jsxs("div", { className: "text-sm text-slate-500", children: ["Fi\u0219a: ", membru.nr_fisa] })] }, membru.nr_fisa))) }))] })] }), selectedMembru && (_jsxs("div", { className: "p-4 bg-blue-50 border border-blue-200 rounded-lg", children: [_jsx("div", { className: "text-sm font-semibold text-blue-900", children: "Membru selectat:" }), _jsx("div", { className: "text-lg font-bold text-blue-700", children: selectedMembru.nume }), _jsxs("div", { className: "text-sm text-blue-600", children: ["Nr. Fi\u0219\u0103: ", selectedMembru.nr_fisa] })] })), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-slate-700 mb-2", children: "Luna (sf\u00E2r\u0219it)" }), _jsx("select", { value: selectedLuna, onChange: (e) => setSelectedLuna(Number(e.target.value)), className: "w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500", children: [
                                                            "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
                                                            "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
                                                        ].map((luna, idx) => (_jsx("option", { value: idx + 1, children: luna }, idx))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-slate-700 mb-2", children: "Anul" }), _jsx(Input, { type: "number", value: selectedAn, onChange: (e) => setSelectedAn(Number(e.target.value)), min: 2000, max: 2100, className: "w-full" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-slate-700 mb-2", children: "Rata Dob\u00E2nzii (decimal, ex: 0.004 = 0.4%)" }), _jsx(Input, { type: "number", value: rataDobanda, onChange: (e) => setRataDobanda(e.target.value), step: "0.001", min: "0", className: "w-full" })] }), _jsxs("button", { onClick: handleCalculeaza, className: "w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2", disabled: !selectedMembru, children: [_jsx(Calculator, { className: "w-5 h-5" }), "Calculeaz\u0103 Dob\u00E2nda"] }), error && (_jsx(Alert, { variant: "destructive", children: _jsx(AlertDescription, { children: error }) })), calculResult && (_jsxs("div", { className: "mt-6 p-6 bg-green-50 border-2 border-green-200 rounded-xl", children: [_jsx("h3", { className: "text-xl font-bold text-green-900 mb-4", children: "Rezultat Calcul" }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex justify-between py-2 border-b border-green-200", children: [_jsx("span", { className: "font-medium text-slate-700", children: "Perioad\u0103 utilizat\u0103:" }), _jsxs("span", { className: "font-bold text-slate-900", children: [calculResult.start_period, " \u2192 ", calculResult.end_period, " (", calculResult.nr_luni, " luni)"] })] }), _jsxs("div", { className: "flex justify-between py-2 border-b border-green-200", children: [_jsx("span", { className: "font-medium text-slate-700", children: "Suma soldurilor:" }), _jsxs("span", { className: "font-bold text-slate-900", children: [calculResult.suma_solduri, " ", databases.activeCurrency || 'RON'] })] }), _jsxs("div", { className: "flex justify-between py-2 border-b border-green-200", children: [_jsx("span", { className: "font-medium text-slate-700", children: "Rat\u0103 utilizat\u0103:" }), _jsx("span", { className: "font-bold text-slate-900", children: calculResult.rata_utilizata })] }), _jsxs("div", { className: "flex justify-between py-3 bg-green-100 -mx-2 px-2 rounded-lg mt-2", children: [_jsx("span", { className: "font-bold text-green-900 text-lg", children: "Dob\u00E2nd\u0103 calculat\u0103:" }), _jsxs("span", { className: "font-bold text-green-700 text-xl", children: [calculResult.dobanda, " ", databases.activeCurrency || 'RON'] })] })] }), _jsxs("div", { className: "mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg", children: [_jsxs("p", { className: "text-sm text-blue-800", children: [_jsx("strong", { children: "Formula:" }), " Dob\u00E2nd\u0103 = Suma soldurilor \u00D7 Rata dob\u00E2nzii"] }), _jsxs("p", { className: "text-sm text-blue-700 mt-1", children: [calculResult.suma_solduri, " \u00D7 ", calculResult.rata_utilizata, " = ", calculResult.dobanda, " ", databases.activeCurrency || 'RON'] })] })] }))] })] })] }) }) }));
}
