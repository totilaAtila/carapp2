import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { ArrowLeft, Calculator, Upload, FileDown, Trash2, AlertCircle } from 'lucide-react';
import Decimal from 'decimal.js';
import { getActiveDB, assertCanWrite } from '../services/databaseManager';
// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });
export default function Dividende({ databases, onBack }) {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [profitInput, setProfitInput] = useState('');
    const [memberBenefits, setMemberBenefits] = useState([]);
    const [availableYears, setAvailableYears] = useState([]);
    const [calculating, setCalculating] = useState(false);
    const [transferring, setTransferring] = useState(false);
    const [exporting, setExporting] = useState(false);
    // Obține currency-ul activ din databases
    const currency = databases.activeCurrency || 'RON';
    // Scroll la top când se montează componenta (pentru mobile)
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);
    // Load available years from DEPCRED
    useEffect(() => {
        try {
            const depcredDB = getActiveDB(databases, 'depcred');
            const query = "SELECT DISTINCT ANUL FROM DEPCRED ORDER BY ANUL DESC";
            const result = depcredDB.exec(query);
            if (result.length > 0) {
                const years = result[0].values.map(row => row[0]);
                // Add current year and nearby years if not present
                const currentYear = new Date().getFullYear();
                const allYears = new Set(years);
                for (let y = currentYear - 2; y <= currentYear + 2; y++) {
                    allYears.add(y);
                }
                const sortedYears = Array.from(allYears).sort((a, b) => b - a);
                setAvailableYears(sortedYears);
            }
        }
        catch (error) {
            console.error('Error loading years:', error);
        }
    }, [databases]);
    // Clear data when year changes
    useEffect(() => {
        setMemberBenefits([]);
        setProfitInput('');
    }, [selectedYear]);
    const clearActiviData = () => {
        try {
            // Check write permissions
            assertCanWrite(databases, 'Ștergere date ACTIVI');
            const confirmed = window.confirm('Ștergi datele calculate anterior din baza de date "Activi"?');
            if (confirmed) {
                const activiDB = getActiveDB(databases, 'activi');
                activiDB.run("DELETE FROM ACTIVI");
                setMemberBenefits([]);
                alert('Datele anterioare au fost șterse cu succes.');
            }
        }
        catch (error) {
            console.error('Error clearing ACTIVI:', error);
            alert('Eroare la ștergerea datelor: ' + error.message);
        }
    };
    const calculateBenefits = () => {
        // Parse profit
        const profitStr = profitInput.replace(',', '.');
        let profitP;
        try {
            profitP = profitStr ? new Decimal(profitStr) : new Decimal(0);
        }
        catch (error) {
            alert('Valoare profit invalidă.');
            return;
        }
        setCalculating(true);
        try {
            // Check write permissions
            assertCanWrite(databases, 'Calcul beneficii');
            // Get active databases
            const depcredDB = getActiveDB(databases, 'depcred');
            const membriiDB = getActiveDB(databases, 'membrii');
            const activiDB = getActiveDB(databases, 'activi');
            // Build a lookup map for member names from MEMBRII.db
            const memberNameMap = new Map();
            const membriiResult = membriiDB.exec("SELECT NR_FISA, NUM_PREN FROM MEMBRII");
            if (membriiResult.length > 0) {
                for (const [nrFisa, numPren] of membriiResult[0].values) {
                    if (typeof nrFisa === 'number' && typeof numPren === 'string') {
                        memberNameMap.set(nrFisa, numPren);
                    }
                }
            }
            if (memberNameMap.size === 0) {
                throw new Error('Nu există înregistrări în tabela MEMBRII din MEMBRII.db.');
            }
            // Verify complete data for year (Jan-Dec)
            const monthsQuery = `SELECT DISTINCT LUNA FROM DEPCRED WHERE ANUL = ${selectedYear}`;
            const monthsResult = depcredDB.exec(monthsQuery);
            if (monthsResult.length === 0 || monthsResult[0].values.length < 12) {
                alert(`Lipsesc date pentru unele luni din ${selectedYear}.`);
                setCalculating(false);
                return;
            }
            // Check if January next year exists
            const nextYear = selectedYear + 1;
            const janNextYearQuery = `SELECT COUNT(*) FROM DEPCRED WHERE ANUL = ${nextYear} AND LUNA = 1`;
            const janResult = depcredDB.exec(janNextYearQuery);
            if (janResult.length === 0 || janResult[0].values[0][0] === 0) {
                alert(`Ianuarie ${nextYear} nu există!`);
            }
            // Calculate member balances
            // IMPORTANT: Doar membrii cu sold pozitiv în DECEMBRIE sunt eligibili
            // Acest lucru include și membrii înscriși în decembrie (caz special)
            const membersQuery = `
        SELECT
          NR_FISA,
          SUM(DEP_SOLD) as SUMA_SOLDURI_LUNARE,
          MAX(CASE WHEN LUNA = 12 THEN DEP_SOLD ELSE 0 END) as SOLD_DECEMBRIE
        FROM DEPCRED
        WHERE ANUL = ${selectedYear} AND DEP_SOLD > 0
        GROUP BY NR_FISA
        HAVING SUM(DEP_SOLD) > 0 AND MAX(CASE WHEN LUNA = 12 THEN DEP_SOLD ELSE 0 END) > 0
      `;
            const membersResult = depcredDB.exec(membersQuery);
            if (membersResult.length === 0 || membersResult[0].values.length === 0) {
                alert(`Nu s-au găsit membri cu solduri pozitive în ${selectedYear}.`);
                setCalculating(false);
                return;
            }
            // Calculate S_total
            let S_total = new Decimal(0);
            const membersData = [];
            const missingNames = [];
            for (const row of membersResult[0].values) {
                const nrFisa = row[0];
                const sumaSolduri = new Decimal(String(row[1]));
                const soldDecembrie = new Decimal(String(row[2]));
                const storedName = memberNameMap.get(nrFisa);
                if (!storedName) {
                    missingNames.push(nrFisa);
                }
                const numPren = storedName ?? `Fișa ${nrFisa}`;
                S_total = S_total.plus(sumaSolduri);
                membersData.push({
                    nrFisa,
                    numPren,
                    depSoldDec: soldDecembrie,
                    sumaSolduriLunare: sumaSolduri,
                    beneficiu: new Decimal(0)
                });
            }
            if (S_total.lte(0)) {
                alert('Suma totală a soldurilor este zero sau negativă.');
                setCalculating(false);
                return;
            }
            // Clear and populate ACTIVI
            activiDB.run("DELETE FROM ACTIVI");
            // Calculate benefits: B = (P / S_total) × S_member
            const calculatedMembers = [];
            for (const member of membersData) {
                const beneficiu = profitP
                    .div(S_total)
                    .mul(member.sumaSolduriLunare)
                    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
                member.beneficiu = beneficiu;
                calculatedMembers.push(member);
                // Insert into ACTIVI
                activiDB.run(`INSERT INTO ACTIVI (NR_FISA, NUM_PREN, DEP_SOLD, DIVIDEND) VALUES (?, ?, ?, ?)`, [member.nrFisa, member.numPren, member.depSoldDec.toNumber(), beneficiu.toNumber()]);
            }
            setMemberBenefits(calculatedMembers);
            alert(`S-au identificat ${calculatedMembers.length} membri.\n` +
                `Suma totală a soldurilor: ${S_total.toFixed(2)} ${currency}.`);
            if (missingNames.length > 0) {
                alert('Atenție: nu s-au găsit numele pentru fișele: ' +
                    missingNames.join(', ') +
                    '. Verifică baza MEMBRII.db.');
            }
        }
        catch (error) {
            console.error('Error calculating benefits:', error);
            alert('Eroare la calculul beneficiilor: ' + error.message);
        }
        finally {
            setCalculating(false);
        }
    };
    const transferBenefits = () => {
        if (memberBenefits.length === 0) {
            alert('Nu există beneficii calculate pentru transfer.');
            return;
        }
        const confirmed = window.confirm(`Transferi beneficiul pentru ${selectedYear} la ianuarie ${selectedYear + 1}?`);
        if (!confirmed)
            return;
        setTransferring(true);
        try {
            // Check write permissions
            assertCanWrite(databases, 'Transfer beneficii');
            const depcredDB = getActiveDB(databases, 'depcred');
            const nextYear = selectedYear + 1;
            let countUpdated = 0;
            const errors = [];
            for (const member of memberBenefits) {
                try {
                    // Get current January record
                    const query = `
            SELECT DEP_SOLD, DEP_DEB FROM DEPCRED
            WHERE NR_FISA = ${member.nrFisa} AND ANUL = ${nextYear} AND LUNA = 1
          `;
                    const result = depcredDB.exec(query);
                    if (result.length > 0 && result[0].values.length > 0) {
                        const row = result[0].values[0];
                        const soldExistent = new Decimal(String(row[0]));
                        const depDebExistent = new Decimal(String(row[1] || 0));
                        const nouDepDeb = depDebExistent.plus(member.beneficiu);
                        const nouDepSold = soldExistent.plus(member.beneficiu);
                        // Update record
                        depcredDB.run(`UPDATE DEPCRED SET DEP_DEB = ?, DEP_SOLD = ? WHERE NR_FISA = ? AND ANUL = ? AND LUNA = 1`, [nouDepDeb.toNumber(), nouDepSold.toNumber(), member.nrFisa, nextYear]);
                        countUpdated++;
                    }
                    else {
                        errors.push(`Fișa ${member.nrFisa} - lipsește înregistrare ianuarie ${nextYear}`);
                    }
                }
                catch (error) {
                    errors.push(`Fișa ${member.nrFisa} - eroare BD (${error.message})`);
                }
            }
            if (errors.length === 0) {
                alert(`Actualizate ${countUpdated} înregistrări în DEPCRED.db pentru ianuarie ${nextYear}.`);
                setMemberBenefits([]);
            }
            else {
                alert('Membri neactualizați:\n' + errors.join('\n'));
            }
        }
        catch (error) {
            console.error('Error transferring benefits:', error);
            alert('Eroare critică la transfer: ' + error.message);
        }
        finally {
            setTransferring(false);
        }
    };
    const exportToExcel = async () => {
        if (memberBenefits.length === 0) {
            alert('Nu există date pentru export.');
            return;
        }
        setExporting(true);
        try {
            // Create CSV content
            const headers = [
                'Nr. fișă',
                'Nume și prenume',
                'Sold dec. an calcul',
                'Suma solduri lunare (S membru)',
                'Beneficiu calculat (B)'
            ];
            let csvContent = headers.join(',') + '\n';
            let totalSoldDec = new Decimal(0);
            let totalSumaSolduri = new Decimal(0);
            let totalBeneficiu = new Decimal(0);
            for (const member of memberBenefits) {
                const row = [
                    member.nrFisa,
                    `"${member.numPren}"`,
                    member.depSoldDec.toFixed(2),
                    member.sumaSolduriLunare.toFixed(2),
                    member.beneficiu.toFixed(2)
                ];
                csvContent += row.join(',') + '\n';
                totalSoldDec = totalSoldDec.plus(member.depSoldDec);
                totalSumaSolduri = totalSumaSolduri.plus(member.sumaSolduriLunare);
                totalBeneficiu = totalBeneficiu.plus(member.beneficiu);
            }
            // Add totals row
            csvContent += `"TOTAL:","",${totalSoldDec.toFixed(2)},${totalSumaSolduri.toFixed(2)},${totalBeneficiu.toFixed(2)}\n`;
            // Create download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Beneficiu_Anual_${selectedYear}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            alert(`Date exportate în: Beneficiu_Anual_${selectedYear}.csv`);
        }
        catch (error) {
            console.error('Error exporting:', error);
            alert('Eroare la export: ' + error.message);
        }
        finally {
            setExporting(false);
        }
    };
    const hasJanuaryNextYear = () => {
        try {
            const depcredDB = getActiveDB(databases, 'depcred');
            const nextYear = selectedYear + 1;
            const query = `SELECT COUNT(*) FROM DEPCRED WHERE ANUL = ${nextYear} AND LUNA = 1`;
            const result = depcredDB.exec(query);
            return result.length > 0 && result[0].values[0][0] > 0;
        }
        catch {
            return false;
        }
    };
    const canTransfer = memberBenefits.length > 0 && hasJanuaryNextYear();
    return (_jsxs("div", { className: "min-h-screen bg-slate-100 p-6", children: [_jsxs("div", { className: "bg-white rounded-xl shadow-lg p-6 mb-6", children: [_jsx("div", { className: "flex items-center justify-between mb-4", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("button", { onClick: onBack, className: "flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors", children: [_jsx(ArrowLeft, { size: 20 }), "\u00CEnapoi"] }), _jsx("h1", { className: "text-3xl font-bold text-slate-800", children: "\uD83D\uDCB0 Dividende (Beneficii Anuale)" })] }) }), _jsxs("p", { className: "text-slate-600", children: ["Calcul \u0219i distribuire beneficii anuale conform formulei: ", _jsx("strong", { children: "B = (P / S_total) \u00D7 S_membru" })] })] }), _jsxs("div", { className: "bg-white rounded-xl shadow-lg p-6 mb-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 mb-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-semibold text-slate-700 mb-2", children: "Selecteaz\u0103 anul pentru calculul beneficiului:" }), _jsx("select", { value: selectedYear, onChange: (e) => setSelectedYear(Number(e.target.value)), className: "w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500", children: availableYears.map(year => (_jsx("option", { value: year, children: year }, year))) })] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-semibold text-slate-700 mb-2", children: ["Profit total (P) pentru anul selectat (", currency, "):"] }), _jsx("input", { type: "text", value: profitInput, onChange: (e) => setProfitInput(e.target.value), placeholder: "0.00", className: "w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" })] })] }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsxs("button", { onClick: clearActiviData, className: "flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors", children: [_jsx(Trash2, { size: 18 }), "\u0218terge date calculate anterior"] }), _jsxs("button", { onClick: calculateBenefits, disabled: calculating || !profitInput, className: "flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors", children: [_jsx(Calculator, { size: 18 }), calculating ? 'Se calculează...' : 'Calculează beneficiu'] }), _jsxs("button", { onClick: transferBenefits, disabled: !canTransfer || transferring, className: "flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors", children: [_jsx(Upload, { size: 18 }), transferring ? 'Se transferă...' : 'Transferă beneficiu la sold'] }), _jsxs("button", { onClick: exportToExcel, disabled: memberBenefits.length === 0 || exporting, className: "flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors", children: [_jsx(FileDown, { size: 18 }), exporting ? 'Se exportă...' : 'Export calcul în Excel (CSV)'] })] }), memberBenefits.length > 0 && !hasJanuaryNextYear() && (_jsxs("div", { className: "mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2", children: [_jsx(AlertCircle, { size: 20, className: "text-amber-600 flex-shrink-0 mt-0.5" }), _jsxs("p", { className: "text-sm text-amber-800", children: [_jsx("strong", { children: "Aten\u021Bie:" }), " Ianuarie ", selectedYear + 1, " nu exist\u0103 \u00EEn baza de date. Butonul de transfer este dezactivat."] })] }))] }), memberBenefits.length > 0 && (_jsxs("div", { className: "bg-white rounded-xl shadow-lg p-6", children: [_jsxs("h2", { className: "text-xl font-bold text-slate-800 mb-4", children: ["\uD83D\uDCCA Rezultate calcul (", memberBenefits.length, " membri)"] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-blue-100", children: [_jsx("th", { className: "border border-slate-300 px-4 py-2 text-center", children: "Nr. fi\u0219\u0103" }), _jsx("th", { className: "border border-slate-300 px-4 py-2 text-left", children: "Nume \u0219i prenume" }), _jsx("th", { className: "border border-slate-300 px-4 py-2 text-right", children: "Sold dec. an calcul" }), _jsx("th", { className: "border border-slate-300 px-4 py-2 text-right", children: "Suma solduri lunare (S membru)" }), _jsx("th", { className: "border border-slate-300 px-4 py-2 text-right", children: "Beneficiu calculat (B)" })] }) }), _jsxs("tbody", { children: [memberBenefits.map((member, idx) => (_jsxs("tr", { className: idx % 2 === 0 ? 'bg-blue-50' : 'bg-orange-50', children: [_jsx("td", { className: "border border-slate-300 px-4 py-2 text-center", children: member.nrFisa }), _jsx("td", { className: "border border-slate-300 px-4 py-2", children: member.numPren }), _jsx("td", { className: "border border-slate-300 px-4 py-2 text-right", children: member.depSoldDec.toFixed(2) }), _jsx("td", { className: "border border-slate-300 px-4 py-2 text-right", children: member.sumaSolduriLunare.toFixed(2) }), _jsx("td", { className: "border border-slate-300 px-4 py-2 text-right font-semibold", children: member.beneficiu.toFixed(2) })] }, member.nrFisa))), _jsxs("tr", { className: "bg-slate-200 font-bold", children: [_jsx("td", { colSpan: 2, className: "border border-slate-300 px-4 py-2 text-right", children: "TOTAL:" }), _jsx("td", { className: "border border-slate-300 px-4 py-2 text-right", children: memberBenefits.reduce((sum, m) => sum.plus(m.depSoldDec), new Decimal(0)).toFixed(2) }), _jsx("td", { className: "border border-slate-300 px-4 py-2 text-right", children: memberBenefits.reduce((sum, m) => sum.plus(m.sumaSolduriLunare), new Decimal(0)).toFixed(2) }), _jsx("td", { className: "border border-slate-300 px-4 py-2 text-right", children: memberBenefits.reduce((sum, m) => sum.plus(m.beneficiu), new Decimal(0)).toFixed(2) })] })] })] }) })] })), _jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-xl p-6 mt-6", children: [_jsx("h3", { className: "text-lg font-bold text-blue-900 mb-3", children: "\uD83D\uDCD0 Formula de calcul" }), _jsxs("div", { className: "space-y-2 text-sm text-blue-800", children: [_jsx("p", { children: _jsx("strong", { children: "B = (P / S_total) \u00D7 S_membru" }) }), _jsxs("ul", { className: "list-disc list-inside space-y-1 ml-4", children: [_jsxs("li", { children: [_jsx("strong", { children: "P" }), " = Profit total anual (introdus de utilizator)"] }), _jsxs("li", { children: [_jsx("strong", { children: "S_total" }), " = Suma tuturor soldurilor lunare ale membrilor eligibili"] }), _jsxs("li", { children: [_jsx("strong", { children: "S_membru" }), " = Suma soldurilor lunare ale unui membru individual"] }), _jsxs("li", { children: [_jsx("strong", { children: "B" }), " = Beneficiu alocat membrului"] })] }), _jsx("p", { className: "mt-3 text-xs text-blue-700", children: "* Doar membrii cu sold pozitiv \u00EEn DECEMBRIE sunt eligibili pentru beneficii (indiferent de soldurile din restul anului)." })] })] })] }));
}
