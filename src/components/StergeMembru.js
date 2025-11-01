import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { Button } from './ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { UserMinus, RotateCcw, Trash2, AlertTriangle, Search } from 'lucide-react';
import { getActiveDB, assertCanWrite } from '../services/databaseManager';
export default function StergeMembru({ databases }) {
    // State pentru căutare
    const [searchTerm, setSearchTerm] = useState('');
    // State pentru datele membrului
    const [membruData, setMembruData] = useState(null);
    const [istoric, setIstoric] = useState([]);
    // State pentru UI
    const [loading, setLoading] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [logs, setLogs] = useState([]);
    // Refs pentru scroll sincronizat
    const scrollRefs = useRef([]);
    const pushLog = (msg) => {
        setLogs(prev => [...prev, msg]);
    };
    // Funcție pentru sincronizare scroll între toate coloanele
    const handleScroll = (sourceIdx, e) => {
        const scrollTop = e.currentTarget.scrollTop;
        scrollRefs.current.forEach((ref, idx) => {
            if (ref && idx !== sourceIdx) {
                ref.scrollTop = scrollTop;
            }
        });
    };
    // Căutare membru (după nr_fisa sau nume)
    const handleCautaMembru = async () => {
        if (!searchTerm.trim()) {
            alert('⚠️ Introduceți numărul fișei sau numele membrului!');
            return;
        }
        setLoading(true);
        setLogs([]);
        pushLog('🔍 CĂUTARE MEMBRU...');
        pushLog(`Termen căutare: ${searchTerm}`);
        try {
            // Verifică dacă este număr (căutare după nr_fisa) sau text (căutare după nume)
            const isNumeric = /^\d+$/.test(searchTerm.trim());
            let query = '';
            let params = [];
            if (isNumeric) {
                query = `
          SELECT NR_FISA, NUM_PREN, DOMICILIUL, CALITATEA, DATA_INSCR
          FROM membrii
          WHERE NR_FISA = ?
        `;
                params = [searchTerm.trim()];
            }
            else {
                query = `
          SELECT NR_FISA, NUM_PREN, DOMICILIUL, CALITATEA, DATA_INSCR
          FROM membrii
          WHERE NUM_PREN LIKE ?
        `;
                params = [`%${searchTerm.trim()}%`];
            }
            const result = getActiveDB(databases, 'membrii').exec(query, params);
            if (result.length > 0 && result[0].values.length > 0) {
                if (result[0].values.length > 1) {
                    alert('⚠️ Căutarea a returnat mai mulți membri. Vă rugăm să fiți mai specific sau să utilizați numărul fișei.');
                    pushLog(`⚠️ Găsiți ${result[0].values.length} membri`);
                    setLoading(false);
                    return;
                }
                const row = result[0].values[0];
                const membru = {
                    nr_fisa: String(row[0]),
                    nume: String(row[1] || ''),
                    adresa: String(row[2] || ''),
                    calitate: String(row[3] || ''),
                    data_inscr: String(row[4] || ''),
                };
                setMembruData(membru);
                pushLog('✅ MEMBRU GĂSIT');
                pushLog(`Nr. Fișă: ${membru.nr_fisa}`);
                pushLog(`Nume: ${membru.nume}`);
                pushLog(`Adresă: ${membru.adresa}`);
                pushLog('');
                pushLog('📋 Încărcare istoric financiar...');
                // Încarcă istoricul din DEPCRED
                await incarcaIstoric(membru.nr_fisa);
            }
            else {
                alert('❌ Membrul nu a fost găsit în baza de date!');
                pushLog('❌ MEMBRU NEGĂSIT');
                setMembruData(null);
                setIstoric([]);
            }
        }
        catch (error) {
            pushLog(`❌ Eroare căutare: ${error}`);
            alert(`❌ Eroare la căutare: ${error}`);
        }
        finally {
            setLoading(false);
        }
    };
    // Încărcare istoric financiar
    const incarcaIstoric = async (nr_fisa) => {
        try {
            const result = getActiveDB(databases, 'depcred').exec(`
        SELECT luna, anul, dobanda, impr_deb, impr_cred, impr_sold,
               dep_deb, dep_cred, dep_sold
        FROM depcred
        WHERE nr_fisa = ?
        ORDER BY anul ASC, luna ASC
      `, [nr_fisa]);
            if (result.length > 0 && result[0].values.length > 0) {
                const istoricData = result[0].values.map(row => ({
                    luna: Number(row[0]),
                    anul: Number(row[1]),
                    dobanda: String(row[2] || '0'),
                    impr_deb: String(row[3] || '0'),
                    impr_cred: String(row[4] || '0'),
                    impr_sold: String(row[5] || '0'),
                    dep_deb: String(row[6] || '0'),
                    dep_cred: String(row[7] || '0'),
                    dep_sold: String(row[8] || '0'),
                }));
                setIstoric(istoricData);
                pushLog(`✅ Istoric încărcat: ${istoricData.length} înregistrări`);
            }
            else {
                pushLog('⚠️ Nu există istoric în DEPCRED');
                setIstoric([]);
            }
        }
        catch (error) {
            pushLog(`❌ Eroare încărcare istoric: ${error}`);
        }
    };
    // Golește formular
    const handleGoleste = () => {
        setSearchTerm('');
        setMembruData(null);
        setIstoric([]);
        setLogs([]);
        setShowConfirmDialog(false);
    };
    // Deschide dialog confirmare
    const handleInitiereStergere = () => {
        if (!membruData) {
            alert('⚠️ Nu există membru selectat!');
            return;
        }
        setShowConfirmDialog(true);
    };
    // Șterge membru definitiv
    const handleStergeDefinitiv = async () => {
        if (!membruData)
            return;
        setLoading(true);
        setShowConfirmDialog(false);
        pushLog('');
        pushLog('🗑️ ȘTERGERE MEMBRU ÎN CURS...');
        pushLog(`Nr. Fișă: ${membruData.nr_fisa}`);
        pushLog(`Nume: ${membruData.nume}`);
        try {
            // VERIFICARE PERMISIUNI DE SCRIERE
            assertCanWrite(databases, 'Ștergere membru');
            const nrFisa = membruData.nr_fisa;
            // DELETE din 5 tabele - folosim getActiveDB pentru a lucra cu baza corectă (RON sau EUR)
            // 1. DELETE din MEMBRII
            pushLog('Ștergere din MEMBRII...');
            getActiveDB(databases, 'membrii').run(`DELETE FROM membrii WHERE NR_FISA = ?`, [nrFisa]);
            pushLog('✅ Șters din MEMBRII');
            // 2. DELETE din DEPCRED
            pushLog('Ștergere din DEPCRED...');
            getActiveDB(databases, 'depcred').run(`DELETE FROM depcred WHERE nr_fisa = ?`, [nrFisa]);
            pushLog('✅ Șters din DEPCRED');
            // 3. DELETE din ACTIVI
            pushLog('Ștergere din ACTIVI...');
            try {
                getActiveDB(databases, 'activi').run(`DELETE FROM ACTIVI WHERE NR_FISA = ?`, [nrFisa]);
                pushLog('✅ Șters din ACTIVI');
            }
            catch (e) {
                pushLog(`⚠️ Tabelul ACTIVI nu există sau nu are date: ${e}`);
            }
            // 4. DELETE din INACTIVI
            pushLog('Ștergere din INACTIVI...');
            try {
                getActiveDB(databases, 'inactivi').run(`DELETE FROM inactivi WHERE NR_FISA = ?`, [nrFisa]);
                pushLog('✅ Șters din INACTIVI');
            }
            catch (e) {
                pushLog(`⚠️ Tabelul INACTIVI nu există sau nu are date: ${e}`);
            }
            // 5. DELETE din LICHIDATI
            pushLog('Ștergere din LICHIDATI...');
            try {
                getActiveDB(databases, 'lichidati').run(`DELETE FROM lichidati WHERE NR_FISA = ?`, [nrFisa]);
                pushLog('✅ Șters din LICHIDATI');
            }
            catch (e) {
                pushLog(`⚠️ Tabelul LICHIDATI nu există sau nu are date: ${e}`);
            }
            pushLog('');
            pushLog('✅ MEMBRU ȘTERS CU SUCCES!');
            pushLog(`Membru ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost eliminat din toate tabelele.`);
            alert(`✅ Membrul ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost șters definitiv!`);
            // Golește formularul după ștergere
            handleGoleste();
        }
        catch (error) {
            pushLog('');
            pushLog(`❌ EROARE LA ȘTERGERE: ${error}`);
            alert(`❌ Eroare la ștergere: ${error}`);
        }
        finally {
            setLoading(false);
        }
    };
    // Format pentru display valori financiare
    const formatCurrency = (value) => {
        const num = parseFloat(value);
        if (isNaN(num))
            return '0.00';
        return num.toFixed(2);
    };
    // Format pentru display luna-an
    const formatLunaAn = (luna, anul) => {
        return `${String(luna).padStart(2, '0')}-${anul}`;
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { className: "border-2 border-red-600", children: [_jsx(CardHeader, { className: "bg-gradient-to-b from-red-100 to-red-200", children: _jsxs(CardTitle, { className: "flex items-center gap-2 text-red-800", children: [_jsx(UserMinus, { className: "h-6 w-6" }), "\u0218tergere Membru"] }) }), _jsx(CardContent, { className: "p-4", children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "flex-1", children: [_jsx("label", { className: "block text-sm font-semibold text-slate-700 mb-1", children: "C\u0103utare dup\u0103 Nr. Fi\u0219\u0103 sau Nume" }), _jsx("input", { type: "text", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), onKeyPress: (e) => e.key === 'Enter' && handleCautaMembru(), className: "w-full px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none", placeholder: "Ex: 123 sau Popescu Ion", disabled: loading })] }), _jsx("div", { className: "flex items-end", children: _jsxs(Button, { onClick: handleCautaMembru, disabled: loading, className: "bg-blue-600 hover:bg-blue-700 text-white px-6", children: [_jsx(Search, { className: "h-4 w-4 mr-2" }), "Caut\u0103"] }) })] }), membruData && (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg border-2 border-slate-300", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Nr. Fi\u0219\u0103" }), _jsx("div", { className: "px-3 py-2 bg-white border-2 border-slate-300 rounded-md text-slate-800 font-semibold", children: membruData.nr_fisa })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Nume \u0219i Prenume" }), _jsx("div", { className: "px-3 py-2 bg-white border-2 border-slate-300 rounded-md text-slate-800", children: membruData.nume })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Adres\u0103" }), _jsx("div", { className: "px-3 py-2 bg-white border-2 border-slate-300 rounded-md text-slate-800", children: membruData.adresa })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Calitate" }), _jsx("div", { className: "px-3 py-2 bg-white border-2 border-slate-300 rounded-md text-slate-800", children: membruData.calitate })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-600 mb-1", children: "Data \u00CEnscriere" }), _jsx("div", { className: "px-3 py-2 bg-white border-2 border-slate-300 rounded-md text-slate-800", children: membruData.data_inscr })] })] }))] }) })] }), membruData && istoric.length > 0 && (_jsxs(_Fragment, { children: [_jsxs(Card, { className: "hidden lg:block", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Istoric Financiar" }) }), _jsxs(CardContent, { className: "p-4", children: [_jsxs("div", { className: "grid grid-cols-[4fr_1fr_3fr] gap-2", children: [_jsxs("div", { className: "border-[3px] border-[#e74c3c] rounded-lg overflow-hidden bg-gradient-to-b from-red-50 to-red-100", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-red-200 to-red-300 border-b-2 border-red-400", children: "Situa\u021Bie \u00CEmprumuturi" }), _jsxs("div", { className: "grid grid-cols-4 gap-px bg-gray-300", children: [_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Dob\u00E2nd\u0103" }), _jsx("div", { ref: (el) => { scrollRefs.current[0] = el; }, onScroll: (e) => handleScroll(0, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-blue-50", children: formatCurrency(tranz.dobanda) }, `dobanda-${idx}`))) }) })] }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Debit" }), _jsx("div", { ref: (el) => { scrollRefs.current[1] = el; }, onScroll: (e) => handleScroll(1, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-blue-50", children: formatCurrency(tranz.impr_deb) }, `impr-deb-${idx}`))) }) })] }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Credit" }), _jsx("div", { ref: (el) => { scrollRefs.current[2] = el; }, onScroll: (e) => handleScroll(2, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-blue-50", children: formatCurrency(tranz.impr_cred) }, `impr-cred-${idx}`))) }) })] }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Sold" }), _jsx("div", { ref: (el) => { scrollRefs.current[3] = el; }, onScroll: (e) => handleScroll(3, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-blue-50", children: formatCurrency(tranz.impr_sold) }, `impr-sold-${idx}`))) }) })] })] })] }), _jsxs("div", { className: "border-[3px] border-[#6c757d] rounded-lg overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-slate-300 to-slate-400 border-b-2 border-slate-500", children: "Dat\u0103" }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Luna-An" }), _jsx("div", { ref: (el) => { scrollRefs.current[4] = el; }, onScroll: (e) => handleScroll(4, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm font-semibold hover:bg-green-50", children: formatLunaAn(tranz.luna, tranz.anul) }, `luna-an-${idx}`))) }) })] })] }), _jsxs("div", { className: "border-[3px] border-[#28a745] rounded-lg overflow-hidden bg-gradient-to-b from-green-50 to-green-100", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-500", children: "Situa\u021Bie Depuneri" }), _jsxs("div", { className: "grid grid-cols-3 gap-px bg-gray-300", children: [_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Debit" }), _jsx("div", { ref: (el) => { scrollRefs.current[5] = el; }, onScroll: (e) => handleScroll(5, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-purple-50", children: formatCurrency(tranz.dep_deb) }, `dep-deb-${idx}`))) }) })] }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Credit" }), _jsx("div", { ref: (el) => { scrollRefs.current[6] = el; }, onScroll: (e) => handleScroll(6, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-purple-50", children: formatCurrency(tranz.dep_cred) }, `dep-cred-${idx}`))) }) })] }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Sold" }), _jsx("div", { ref: (el) => { scrollRefs.current[7] = el; }, onScroll: (e) => handleScroll(7, e), className: "h-[400px] overflow-y-auto bg-white", style: { scrollbarWidth: 'thin' }, children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-purple-50", children: formatCurrency(tranz.dep_sold) }, `dep-sold-${idx}`))) }) })] })] })] })] }), _jsx("div", { className: "mt-2 text-center text-xs text-slate-500", children: "\u2195\uFE0F Scroll-ul este sincronizat \u00EEntre toate coloanele" })] })] }), _jsx("div", { className: "lg:hidden space-y-4", children: _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Istoric Financiar" }) }), _jsx(CardContent, { className: "p-4", children: _jsx("div", { className: "space-y-3", children: istoric.map((tranz, idx) => (_jsxs("div", { className: "border-2 border-slate-300 rounded-lg p-3 bg-slate-50", children: [_jsx("div", { className: "text-center font-bold text-lg text-slate-800 mb-2 pb-2 border-b-2 border-slate-300", children: formatLunaAn(tranz.luna, tranz.anul) }), _jsxs("div", { className: "mb-3 p-2 bg-red-50 rounded border border-red-300", children: [_jsx("div", { className: "font-bold text-xs text-red-800 mb-2", children: "\u00CEMPRUMUTURI" }), _jsxs("div", { className: "grid grid-cols-2 gap-2 text-xs", children: [_jsxs("div", { children: [_jsx("span", { className: "text-slate-600", children: "Dob\u00E2nd\u0103:" }), _jsx("span", { className: "ml-1 font-semibold", children: formatCurrency(tranz.dobanda) })] }), _jsxs("div", { children: [_jsx("span", { className: "text-slate-600", children: "Debit:" }), _jsx("span", { className: "ml-1 font-semibold", children: formatCurrency(tranz.impr_deb) })] }), _jsxs("div", { children: [_jsx("span", { className: "text-slate-600", children: "Credit:" }), _jsx("span", { className: "ml-1 font-semibold", children: formatCurrency(tranz.impr_cred) })] }), _jsxs("div", { children: [_jsx("span", { className: "text-slate-600", children: "Sold:" }), _jsx("span", { className: "ml-1 font-semibold", children: formatCurrency(tranz.impr_sold) })] })] })] }), _jsxs("div", { className: "p-2 bg-green-50 rounded border border-green-300", children: [_jsx("div", { className: "font-bold text-xs text-green-800 mb-2", children: "DEPUNERI" }), _jsxs("div", { className: "grid grid-cols-2 gap-2 text-xs", children: [_jsxs("div", { children: [_jsx("span", { className: "text-slate-600", children: "Debit:" }), _jsx("span", { className: "ml-1 font-semibold", children: formatCurrency(tranz.dep_deb) })] }), _jsxs("div", { children: [_jsx("span", { className: "text-slate-600", children: "Credit:" }), _jsx("span", { className: "ml-1 font-semibold", children: formatCurrency(tranz.dep_cred) })] }), _jsxs("div", { className: "col-span-2", children: [_jsx("span", { className: "text-slate-600", children: "Sold:" }), _jsx("span", { className: "ml-1 font-semibold", children: formatCurrency(tranz.dep_sold) })] })] })] })] }, `mobile-${idx}`))) }) })] }) })] })), _jsx(Card, { children: _jsx(CardContent, { className: "p-4", children: _jsxs("div", { className: "flex flex-col sm:flex-row gap-3 justify-center", children: [_jsxs(Button, { onClick: handleGoleste, className: "bg-slate-600 hover:bg-slate-700 text-white px-8", children: [_jsx(RotateCcw, { className: "h-4 w-4 mr-2" }), "Gole\u0219te formular"] }), _jsxs(Button, { onClick: handleInitiereStergere, disabled: !membruData || loading, className: "bg-red-600 hover:bg-red-700 text-white px-8 disabled:opacity-50 disabled:cursor-not-allowed", children: [_jsx(Trash2, { className: "h-4 w-4 mr-2" }), "\u26A0\uFE0F \u0218terge Definitiv"] })] }) }) }), showConfirmDialog && membruData && (_jsx("div", { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4", children: _jsxs(Card, { className: "max-w-md w-full border-4 border-red-600", children: [_jsx(CardHeader, { className: "bg-gradient-to-b from-red-100 to-red-200", children: _jsxs(CardTitle, { className: "flex items-center gap-2 text-red-800", children: [_jsx(AlertTriangle, { className: "h-6 w-6" }), "\u26A0\uFE0F ATEN\u021AIE MAXIM\u0102"] }) }), _jsxs(CardContent, { className: "p-6 space-y-4", children: [_jsx(Alert, { className: "border-2 border-red-500 bg-red-50", children: _jsx(AlertDescription, { className: "text-red-900 font-bold", children: "AC\u021AIUNE IREVERSIBIL\u0102!" }) }), _jsxs("div", { className: "space-y-2 text-sm", children: [_jsx("p", { className: "font-semibold text-slate-800", children: "Sunte\u021Bi sigur c\u0103 dori\u021Bi s\u0103 \u0219terge\u021Bi membrul:" }), _jsxs("div", { className: "p-3 bg-slate-100 rounded border-2 border-slate-300", children: [_jsxs("div", { children: [_jsx("strong", { children: "Nr. Fi\u0219\u0103:" }), " ", membruData.nr_fisa] }), _jsxs("div", { children: [_jsx("strong", { children: "Nume:" }), " ", membruData.nume] }), _jsxs("div", { children: [_jsx("strong", { children: "Adres\u0103:" }), " ", membruData.adresa] })] }), _jsx("p", { className: "text-red-700 font-semibold", children: "Toate datele acestui membru vor fi eliminate DEFINITIV din toate tabelele bazei de date!" })] }), _jsxs("div", { className: "flex gap-3 pt-4", children: [_jsx(Button, { onClick: () => setShowConfirmDialog(false), className: "flex-1 bg-slate-600 hover:bg-slate-700 text-white", children: "Anuleaz\u0103" }), _jsxs(Button, { onClick: handleStergeDefinitiv, className: "flex-1 bg-red-600 hover:bg-red-700 text-white", children: [_jsx(Trash2, { className: "h-4 w-4 mr-2" }), "DA, \u0218terge Definitiv!"] })] })] })] }) })), logs.length > 0 && (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-sm", children: "Log Opera\u021Bii" }) }), _jsx(CardContent, { children: _jsx("div", { className: "bg-slate-900 text-green-400 p-3 rounded font-mono text-xs max-h-48 overflow-y-auto", children: logs.map((log, idx) => (_jsx("div", { children: log }, idx))) }) })] }))] }));
}
