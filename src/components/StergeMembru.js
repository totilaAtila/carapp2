import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { UserMinus, RotateCcw, Trash2, AlertTriangle, X } from 'lucide-react';
import { getActiveDB, assertCanWrite } from '../services/databaseManager';
export default function StergeMembru({ databases }) {
    // State pentru căutare și auto-completare
    const [numeSearch, setNumeSearch] = useState('');
    const [nrFisaSearch, setNrFisaSearch] = useState('');
    const [autoComplete, setAutoComplete] = useState({
        suggestions: [],
        isVisible: false,
        selectedIndex: -1,
        prefix: ''
    });
    // State pentru datele membrului
    const [membruData, setMembruData] = useState(null);
    const [istoric, setIstoric] = useState([]);
    // State pentru UI
    const [loading, setLoading] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [logs, setLogs] = useState([]);
    // Refs pentru scroll sincronizat și input
    const scrollRefs = useRef([]);
    const numeInputRef = useRef(null);
    const autoCompleteRef = useRef(null);
    // Scroll la top când se montează componenta (pentru mobile)
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);
    // Efect pentru inchidere auto-completare la click in afara
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (autoCompleteRef.current && !autoCompleteRef.current.contains(event.target)) {
                setAutoComplete(prev => ({ ...prev, isVisible: false }));
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const pushLog = (msg) => {
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
    };
    // Funcție pentru sincronizare scroll între toate coloanele
    const handleScroll = useCallback((sourceIdx, e) => {
        const scrollTop = e.currentTarget.scrollTop;
        scrollRefs.current.forEach((ref, idx) => {
            if (ref && idx !== sourceIdx) {
                ref.scrollTop = scrollTop;
            }
        });
    }, []);
    // Auto-completare cu prefix pentru nume
    const handleAutoComplete = useCallback(async (prefix) => {
        if (prefix.length < 2) {
            setAutoComplete({ suggestions: [], isVisible: false, selectedIndex: -1, prefix });
            return;
        }
        try {
            const result = getActiveDB(databases, 'membrii').exec(`
        SELECT NUM_PREN FROM membrii 
        WHERE NUM_PREN LIKE ? COLLATE NOCASE 
        ORDER BY NUM_PREN LIMIT 50
      `, [`${prefix}%`]);
            const suggestions = result.length > 0 ? result[0].values.map(row => String(row[0])) : [];
            setAutoComplete({
                suggestions,
                isVisible: suggestions.length > 0,
                selectedIndex: -1,
                prefix
            });
        }
        catch (error) {
            console.error('Eroare auto-completare:', error);
            setAutoComplete({ suggestions: [], isVisible: false, selectedIndex: -1, prefix });
        }
    }, [databases]);
    // Gestionare input căutare nume
    const handleNumeSearchChange = (value) => {
        setNumeSearch(value);
        handleAutoComplete(value);
    };
    // Selectare sugestie auto-completare
    const handleSelectSuggestion = (suggestion) => {
        const normalizedSuggestion = suggestion.trim();
        setNumeSearch(normalizedSuggestion);
        setAutoComplete({
            suggestions: [],
            isVisible: false,
            selectedIndex: -1,
            prefix: normalizedSuggestion,
        });
        // După selectare, căutăm automat membrul
        handleCautaMembru('nume', normalizedSuggestion);
    };
    // Navigare prin sugestii cu taste
    const handleKeyDown = (e) => {
        if (!autoComplete.isVisible)
            return;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setAutoComplete(prev => ({
                    ...prev,
                    selectedIndex: Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1)
                }));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setAutoComplete(prev => ({
                    ...prev,
                    selectedIndex: Math.max(prev.selectedIndex - 1, -1)
                }));
                break;
            case 'Enter':
                e.preventDefault();
                if (autoComplete.selectedIndex >= 0) {
                    handleSelectSuggestion(autoComplete.suggestions[autoComplete.selectedIndex]);
                }
                else if (numeSearch) {
                    handleCautaMembru('nume', numeSearch);
                }
                break;
            case 'Escape':
                setAutoComplete(prev => ({ ...prev, isVisible: false }));
                break;
        }
    };
    // Căutare membru (după nume sau nr_fisa)
    const handleCautaMembru = async (type, specificTerm) => {
        const term = specificTerm || (type === 'nume' ? numeSearch.trim() : nrFisaSearch.trim());
        if (!term) {
            alert('⚠️ Introduceți numele sau numărul fișei membrului!');
            return;
        }
        if (type === 'fisa' && !/^\d+$/.test(term)) {
            alert('⚠️ Numărul fișei trebuie să conțină doar cifre!');
            setNrFisaSearch('');
            return;
        }
        setLoading(true);
        setLogs([]);
        pushLog('🔍 CĂUTARE MEMBRU...');
        pushLog(`Termen căutare: ${term}`);
        try {
            let query = '';
            let params = [];
            if (type === 'fisa') {
                // Căutare după număr fișă
                query = `
          SELECT NR_FISA, NUM_PREN, DOMICILIUL, CALITATEA, DATA_INSCR
          FROM membrii
          WHERE NR_FISA = ?
        `;
                params = [term];
            }
            else {
                // Căutare după nume
                query = `
          SELECT NR_FISA, NUM_PREN, DOMICILIUL, CALITATEA, DATA_INSCR
          FROM membrii
          WHERE TRIM(NUM_PREN) = TRIM(?) COLLATE NOCASE
        `;
                params = [term];
            }
            const result = getActiveDB(databases, 'membrii').exec(query, params);
            if (result.length > 0 && result[0].values.length > 0) {
                const row = result[0].values[0];
                const membru = {
                    nr_fisa: String(row[0]),
                    nume: String(row[1] || ''),
                    adresa: String(row[2] || ''),
                    calitate: String(row[3] || ''),
                    data_inscr: String(row[4] || ''),
                };
                setMembruData(membru);
                // Sincronizăm câmpurile de căutare
                setNumeSearch(membru.nume);
                setNrFisaSearch(membru.nr_fisa);
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
            setAutoComplete(prev => ({ ...prev, isVisible: false }));
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
        ORDER BY anul DESC, luna DESC
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
        setNumeSearch('');
        setNrFisaSearch('');
        setMembruData(null);
        setIstoric([]);
        setLogs([]);
        setShowConfirmDialog(false);
        setAutoComplete({ suggestions: [], isVisible: false, selectedIndex: -1, prefix: '' });
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
            const errors = [];
            const successes = [];
            // Structura exactă a bazelor de date conform documentației
            const databasesToProcess = [
                { db: 'membrii', table: 'MEMBRII', key: 'NR_FISA' },
                { db: 'depcred', table: 'DEPCRED', key: 'NR_FISA' },
                { db: 'activi', table: 'ACTIVI', key: 'NR_FISA' },
                { db: 'inactivi', table: 'inactivi', key: 'nr_fisa' },
                { db: 'lichidati', table: 'lichidati', key: 'nr_fisa' }
            ];
            for (const { db, table, key } of databasesToProcess) {
                try {
                    pushLog(`Ștergere din ${table}...`);
                    getActiveDB(databases, db).run(`DELETE FROM ${table} WHERE ${key} = ?`, [nrFisa]);
                    successes.push(`✅ Șters din ${table}`);
                    pushLog(`✅ Șters din ${table}`);
                }
                catch (e) {
                    const errorMsg = `⚠️ Eroare la ștergere din ${table}: ${e}`;
                    errors.push(errorMsg);
                    pushLog(errorMsg);
                }
            }
            pushLog('');
            if (errors.length > 0) {
                pushLog('❌ ȘTERGERE CU Erori!');
                errors.forEach(error => pushLog(error));
                alert(`❌ Ștergerea a avut erori. Verificați log-urile.`);
            }
            else {
                pushLog('✅ MEMBRU ȘTERS CU SUCCES!');
                pushLog(`Membru ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost eliminat din toate tabelele.`);
                alert(`✅ Membrul ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost șters definitiv!`);
                handleGoleste();
            }
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
    return (_jsxs("div", { className: "min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4", children: [_jsx(Card, { className: "border-2 border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 shadow-xl mb-6", children: _jsxs(CardContent, { className: "p-4 md:p-6", children: [_jsxs("div", { className: "block md:hidden space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { className: "text-sm font-bold text-slate-700", children: "Nume Prenume:" }), _jsxs("div", { className: "relative", ref: autoCompleteRef, children: [_jsx(Input, { ref: numeInputRef, type: "text", value: numeSearch, onChange: (e) => handleNumeSearchChange(e.target.value), onKeyDown: handleKeyDown, className: "w-full border-2 border-blue-300 rounded-lg", placeholder: "C\u0103utare dup\u0103 nume...", disabled: loading }), numeSearch && (_jsx("button", { onClick: () => setNumeSearch(''), className: "absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors", children: _jsx(X, { className: "h-4 w-4" }) })), autoComplete.isVisible && autoComplete.suggestions.length > 0 && (_jsx("div", { className: "absolute z-50 w-full mt-1 bg-white border-2 border-blue-300 rounded-lg shadow-xl max-h-60 overflow-y-auto", children: autoComplete.suggestions.map((suggestion, index) => (_jsx("div", { className: `px-3 py-2 cursor-pointer transition-colors ${index === autoComplete.selectedIndex
                                                            ? 'bg-blue-100 border-l-4 border-blue-500 text-blue-800'
                                                            : 'hover:bg-blue-50 text-slate-800'} ${index > 0 ? 'border-t border-slate-100' : ''}`, onMouseDown: (event) => {
                                                            event.preventDefault();
                                                            handleSelectSuggestion(suggestion);
                                                        }, onClick: () => handleSelectSuggestion(suggestion), onMouseEnter: () => setAutoComplete(prev => ({ ...prev, selectedIndex: index })), children: _jsx("div", { className: "font-medium", children: suggestion }) }, suggestion))) }))] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { className: "text-sm font-bold text-slate-700", children: "Num\u0103r Fi\u0219\u0103:" }), _jsx(Input, { type: "text", value: nrFisaSearch, onChange: (e) => setNrFisaSearch(e.target.value), onKeyPress: (e) => e.key === 'Enter' && handleCautaMembru('fisa'), className: "w-full border-2 border-blue-300 rounded-lg", placeholder: "C\u0103utare dup\u0103 fi\u0219\u0103...", disabled: loading })] }), membruData && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { className: "text-sm font-bold text-slate-700", children: "Adresa:" }), _jsx(Input, { value: membruData.adresa, readOnly: true, className: "w-full bg-slate-50 border-2 border-slate-300 rounded-lg" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { className: "text-sm font-bold text-slate-700", children: "Calitatea:" }), _jsx(Input, { value: membruData.calitate, readOnly: true, className: "w-full bg-slate-50 border-2 border-slate-300 rounded-lg" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { className: "text-sm font-bold text-slate-700", children: "Data \u00EEnscrierii:" }), _jsx(Input, { value: membruData.data_inscr, readOnly: true, className: "w-full bg-slate-50 border-2 border-slate-300 rounded-lg" })] })] })), _jsxs("div", { className: "grid grid-cols-2 gap-3 pt-2", children: [_jsxs(Button, { onClick: handleGoleste, className: "bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg", children: [_jsx(RotateCcw, { className: "h-4 w-4 mr-1" }), "Gole\u0219te"] }), _jsxs(Button, { onClick: handleInitiereStergere, disabled: !membruData || loading, className: "bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg disabled:opacity-50 min-h-[44px]", children: [_jsx(Trash2, { className: "h-4 w-4 mr-1" }), "\u0218terge"] })] })] }), _jsxs("div", { className: "hidden md:grid md:grid-cols-4 gap-4 items-start", children: [_jsxs("div", { className: "space-y-6", children: [_jsx(Label, { className: "text-sm font-bold text-slate-700 block pt-2", children: "Nume Prenume:" }), _jsx(Label, { className: "text-sm font-bold text-slate-700 block pt-2", children: "Adresa:" }), _jsx(Label, { className: "text-sm font-bold text-slate-700 block pt-2", children: "Data \u00EEnscrierii:" })] }), _jsxs("div", { className: "space-y-4", children: ["// \u00CEn interiorul componentei StergeMembru, \u00EEnlocuie\u0219te sec\u021Biunea cu auto-completare cu aceast\u0103 versiune corectat\u0103:", _jsxs("div", { className: "relative", ref: autoCompleteRef, children: [_jsx(Input, { id: "nume-search", ref: numeInputRef, type: "text", value: numeSearch, onChange: (e) => handleNumeSearchChange(e.target.value), onKeyDown: handleKeyDown, className: "w-full border-3 border-blue-400 rounded-xl focus:border-blue-600 focus:ring-3 focus:ring-blue-300 transition-all duration-300 shadow-md", placeholder: "C\u0103utare dup\u0103 nume...", disabled: loading, onFocus: (e) => e.target.select() }), numeSearch && (_jsx("button", { onClick: () => setNumeSearch(''), className: "absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors duration-200 z-10", children: _jsx(X, { className: "h-5 w-5 hover:scale-125 transition-transform duration-200" }) })), autoComplete.isVisible && autoComplete.suggestions.length > 0 && (_jsx("div", { className: "absolute z-50 w-full mt-2 bg-white border-3 border-blue-400 rounded-xl shadow-2xl max-h-72 overflow-y-auto", style: {
                                                        background: 'linear-gradient(to bottom, #f0f9ff, #dbeafe)',
                                                        backdropFilter: 'blur(10px)'
                                                    }, children: autoComplete.suggestions.map((suggestion, index) => (_jsx("div", { className: `px-4 py-3 cursor-pointer transition-all duration-200 ${index === autoComplete.selectedIndex
                                                            ? 'bg-blue-200 border-l-4 border-blue-700 text-blue-900 shadow-md'
                                                            : 'hover:bg-blue-100 text-slate-800'} ${index > 0 ? 'border-t-2 border-slate-200' : ''} hover:translate-x-1`, onClick: () => {
                                                            handleSelectSuggestion(suggestion);
                                                        }, onMouseDown: (e) => {
                                                            // Previne pierderea focusului de pe input care ar putea închide dropdown-ul
                                                            e.preventDefault();
                                                        }, onTouchStart: (e) => {
                                                            // Pentru dispozitive touch
                                                            e.preventDefault();
                                                            handleSelectSuggestion(suggestion);
                                                        }, onMouseEnter: () => setAutoComplete(prev => ({ ...prev, selectedIndex: index })), children: _jsxs("div", { className: "font-semibold text-lg flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full" }), suggestion] }) }, `suggestion-${suggestion}-${index}`))) }))] }), _jsx(Input, { value: membruData?.adresa || '', readOnly: true, className: "w-full bg-slate-50 border-2 border-slate-300 rounded-lg text-slate-700 focus:border-slate-400 transition-all duration-200" }), _jsx(Input, { value: membruData?.data_inscr || '', readOnly: true, className: "w-full bg-slate-50 border-2 border-slate-300 rounded-lg text-slate-700 focus:border-slate-400 transition-all duration-200" })] }), _jsxs("div", { className: "space-y-6", children: [_jsx(Label, { htmlFor: "fisa-search", className: "text-sm font-bold text-slate-700 block pt-2", children: "Num\u0103r Fi\u0219\u0103:" }), _jsx(Label, { className: "text-sm font-bold text-slate-700 block pt-2", children: "Calitatea:" }), _jsx("div", { className: "pt-2", children: _jsxs(Button, { onClick: handleGoleste, className: "w-full bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-2.5 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl border-2 border-orange-600", children: [_jsx(RotateCcw, { className: "h-4 w-4 mr-2" }), "Gole\u0219te formular"] }) })] }), _jsxs("div", { className: "space-y-4", children: [_jsx(Input, { id: "fisa-search", type: "text", value: nrFisaSearch, onChange: (e) => setNrFisaSearch(e.target.value), onKeyPress: (e) => e.key === 'Enter' && handleCautaMembru('fisa'), className: "w-full border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200", placeholder: "C\u0103utare dup\u0103 fi\u0219\u0103...", disabled: loading }), _jsx(Input, { value: membruData?.calitate || '', readOnly: true, className: "w-full bg-slate-50 border-2 border-slate-300 rounded-lg text-slate-700 focus:border-slate-400 transition-all duration-200" }), _jsxs(Button, { onClick: handleInitiereStergere, disabled: !membruData || loading, className: "w-full bg-gradient-to-b from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white py-2.5 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed border-2 border-red-700", children: [_jsx(Trash2, { className: "h-4 w-4 mr-2" }), "\u26A0\uFE0F \u0218terge Definitiv"] })] })] })] }) }), membruData && istoric.length > 0 && (_jsxs(_Fragment, { children: [_jsxs(Card, { className: "hidden lg:block border-0 shadow-2xl mb-6", children: [_jsx(CardHeader, { className: "pb-4 border-b border-slate-200", children: _jsxs(CardTitle, { className: "text-xl font-bold text-slate-800 flex items-center gap-3", children: [_jsx("div", { className: "w-3 h-3 bg-blue-500 rounded-full" }), "Istoric Financiar - ", membruData.nume, " (Fi\u0219a: ", membruData.nr_fisa, ")"] }) }), _jsxs(CardContent, { className: "p-0", children: [_jsxs("div", { className: "grid grid-cols-[4fr_1fr_3fr] gap-4 p-6", children: [_jsxs("div", { className: "border-[3px] border-[#e74c3c] rounded-xl overflow-hidden bg-gradient-to-b from-red-50 to-red-100 shadow-lg", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-3 bg-gradient-to-b from-red-200 to-red-300 border-b-2 border-red-400 text-sm", children: "Situa\u021Bie \u00CEmprumuturi" }), _jsx("div", { className: "grid grid-cols-4 gap-0 bg-red-200", children: ['Dobândă', 'Împrumut', 'Rată Achitată', 'Sold Împrumut'].map((title, colIndex) => (_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: title }), _jsx("div", { ref: (el) => { scrollRefs.current[colIndex] = el; }, onScroll: (e) => handleScroll(colIndex, e), className: "h-[400px] overflow-y-auto bg-white [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]", children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-blue-50 font-mono transition-colors duration-150", children: formatCurrency(colIndex === 0 ? tranz.dobanda :
                                                                                colIndex === 1 ? tranz.impr_deb :
                                                                                    colIndex === 2 ? tranz.impr_cred : tranz.impr_sold) }, `impr-${colIndex}-${idx}`))) }) })] }, title))) })] }), _jsxs("div", { className: "border-[3px] border-[#6c757d] rounded-xl overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 shadow-lg", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-3 bg-gradient-to-b from-slate-300 to-slate-400 border-b-2 border-slate-500 text-sm", children: "Dat\u0103" }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Luna-An" }), _jsx("div", { ref: (el) => { scrollRefs.current[4] = el; }, onScroll: (e) => handleScroll(4, e), className: "h-[400px] overflow-y-auto bg-white [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]", children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm font-semibold hover:bg-green-50 transition-colors duration-150", children: formatLunaAn(tranz.luna, tranz.anul) }, `luna-an-${idx}`))) }) })] })] }), _jsxs("div", { className: "border-[3px] border-[#28a745] rounded-xl overflow-hidden bg-gradient-to-b from-green-50 to-green-100 shadow-lg", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-3 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-500 text-sm", children: "Situa\u021Bie Depuneri" }), _jsx("div", { className: "grid grid-cols-3 gap-0 bg-green-200", children: ['Cotizație', 'Retragere Fond', 'Sold Depunere'].map((title, colIndex) => (_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: title }), _jsx("div", { ref: (el) => { scrollRefs.current[5 + colIndex] = el; }, onScroll: (e) => handleScroll(5 + colIndex, e), className: "h-[400px] overflow-y-auto bg-white [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]", children: _jsx("div", { className: "divide-y divide-slate-200", children: istoric.map((tranz, idx) => (_jsx("div", { className: "p-2 text-center text-sm hover:bg-purple-50 font-mono transition-colors duration-150", children: formatCurrency(colIndex === 0 ? tranz.dep_deb :
                                                                                colIndex === 1 ? tranz.dep_cred : tranz.dep_sold) }, `dep-${colIndex}-${idx}`))) }) })] }, title))) })] })] }), _jsxs("div", { className: "mt-4 text-center text-xs text-slate-500 pb-4 flex items-center justify-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full animate-pulse" }), "\u2195\uFE0F Scroll-ul este sincronizat \u00EEntre toate coloanele", _jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full animate-pulse" })] })] })] }), _jsx("div", { className: "lg:hidden space-y-4 mb-6", children: _jsxs(Card, { className: "shadow-xl", children: [_jsx(CardHeader, { className: "bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-200", children: _jsxs(CardTitle, { className: "text-lg font-bold text-slate-800 flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full" }), "Istoric Financiar - ", membruData.nume] }) }), _jsx(CardContent, { className: "p-4", children: _jsx("div", { className: "space-y-4", children: istoric.map((tranz, idx) => (_jsxs("div", { className: "border-2 border-slate-300 rounded-xl p-4 bg-white shadow-sm", children: [_jsx("div", { className: "text-center font-bold text-lg text-slate-800 mb-3 pb-2 border-b-2 border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-lg -mx-4 -mt-4 p-3", children: formatLunaAn(tranz.luna, tranz.anul) }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { className: "p-3 bg-red-50 rounded-lg border-2 border-red-200", children: [_jsxs("div", { className: "font-bold text-sm text-red-800 mb-3 flex items-center gap-2", children: [_jsx("div", { className: "w-3 h-3 bg-red-500 rounded-full" }), "\u00CEMPRUMUTURI"] }), _jsxs("div", { className: "grid grid-cols-2 gap-3 text-sm", children: [_jsxs("div", { className: "flex justify-between items-center p-2 bg-white rounded border", children: [_jsx("span", { className: "text-slate-600", children: "Dob\u00E2nd\u0103:" }), _jsx("span", { className: "font-semibold font-mono", children: formatCurrency(tranz.dobanda) })] }), _jsxs("div", { className: "flex justify-between items-center p-2 bg-white rounded border", children: [_jsx("span", { className: "text-slate-600", children: "\u00CEmprumut:" }), _jsx("span", { className: "font-semibold font-mono", children: formatCurrency(tranz.impr_deb) })] }), _jsxs("div", { className: "flex justify-between items-center p-2 bg-white rounded border", children: [_jsx("span", { className: "text-slate-600", children: "Rat\u0103 Achitat\u0103:" }), _jsx("span", { className: "font-semibold font-mono", children: formatCurrency(tranz.impr_cred) })] }), _jsxs("div", { className: "flex justify-between items-center p-2 bg-white rounded border", children: [_jsx("span", { className: "text-slate-600", children: "Sold:" }), _jsx("span", { className: "font-semibold font-mono text-red-700", children: formatCurrency(tranz.impr_sold) })] })] })] }), _jsxs("div", { className: "p-3 bg-green-50 rounded-lg border-2 border-green-200", children: [_jsxs("div", { className: "font-bold text-sm text-green-800 mb-3 flex items-center gap-2", children: [_jsx("div", { className: "w-3 h-3 bg-green-500 rounded-full" }), "DEPUNERI"] }), _jsxs("div", { className: "grid grid-cols-1 gap-3 text-sm", children: [_jsxs("div", { className: "flex justify-between items-center p-2 bg-white rounded border", children: [_jsx("span", { className: "text-slate-600", children: "Cotiza\u021Bie:" }), _jsx("span", { className: "font-semibold font-mono", children: formatCurrency(tranz.dep_deb) })] }), _jsxs("div", { className: "flex justify-between items-center p-2 bg-white rounded border", children: [_jsx("span", { className: "text-slate-600", children: "Retragere Fond:" }), _jsx("span", { className: "font-semibold font-mono", children: formatCurrency(tranz.dep_cred) })] }), _jsxs("div", { className: "flex justify-between items-center p-2 bg-white rounded border", children: [_jsx("span", { className: "text-slate-600", children: "Sold Depunere:" }), _jsx("span", { className: "font-semibold font-mono text-green-700", children: formatCurrency(tranz.dep_sold) })] })] })] })] })] }, `mobile-${idx}`))) }) })] }) })] })), logs.length > 0 && (_jsxs(Card, { className: "shadow-xl mb-6", children: [_jsx(CardHeader, { className: "bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200", children: _jsxs(CardTitle, { className: "text-sm font-bold flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-green-500 rounded-full animate-pulse" }), "Log Opera\u021Bii", _jsx("div", { className: "w-2 h-2 bg-green-500 rounded-full animate-pulse" })] }) }), _jsx(CardContent, { className: "p-0", children: _jsx("div", { className: "bg-slate-900 text-green-400 p-4 rounded-b-lg font-mono text-xs max-h-64 overflow-y-auto [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]", children: logs.map((log, idx) => (_jsx("div", { className: "border-b border-slate-700 py-1 last:border-b-0 hover:bg-slate-800 transition-colors", children: log }, idx))) }) })] })), showConfirmDialog && membruData && (_jsx("div", { className: "fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200", children: _jsxs("div", { className: "bg-white rounded-xl shadow-2xl max-w-sm w-full mx-auto border-2 border-red-500 animate-in zoom-in-95 duration-300", children: [_jsx("div", { className: "bg-gradient-to-r from-red-500 to-red-600 p-4 rounded-t-xl", children: _jsxs("div", { className: "flex items-center gap-2 text-white", children: [_jsx(AlertTriangle, { className: "h-6 w-6 flex-shrink-0" }), _jsxs("div", { children: [_jsx("h3", { className: "text-lg font-bold", children: "Confirmare \u0218tergere" }), _jsx("p", { className: "text-red-100 text-xs", children: "Ac\u021Biune ireversibil\u0103" })] })] }) }), _jsxs("div", { className: "p-4 space-y-3", children: [_jsx("div", { className: "text-center", children: _jsx("p", { className: "text-slate-700 font-semibold text-sm", children: "Sigur dori\u021Bi s\u0103 \u0219terge\u021Bi definitiv membrul?" }) }), _jsxs("div", { className: "bg-slate-50 rounded-lg p-3 space-y-2 border border-slate-200 text-xs", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "font-semibold text-slate-600", children: "Nr. Fi\u0219\u0103:" }), _jsx("span", { className: "font-mono font-bold text-slate-800", children: membruData.nr_fisa })] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "font-semibold text-slate-600", children: "Nume:" }), _jsx("span", { className: "font-bold text-slate-800 text-right", children: membruData.nume })] }), _jsxs("div", { children: [_jsx("span", { className: "font-semibold text-slate-600", children: "Adres\u0103:" }), _jsx("div", { className: "mt-1 text-slate-700 bg-white p-1 rounded border text-xs", children: membruData.adresa })] })] }), _jsx("div", { className: "bg-red-50 border border-red-200 rounded-lg p-3", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx(AlertTriangle, { className: "h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("p", { className: "text-red-800 font-bold text-xs", children: "\u26A0\uFE0F ATEN\u021AIE!" }), _jsx("p", { className: "text-red-700 text-xs mt-1", children: "Toate datele vor fi \u0219terse definitiv. Nu poate fi anulat!" })] })] }) }), _jsxs("div", { className: "flex flex-col gap-2 pt-1", children: [_jsxs(Button, { onClick: handleStergeDefinitiv, className: "bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-bold border border-red-700 transition-all duration-200 text-sm min-h-[44px]", children: [_jsx(Trash2, { className: "h-4 w-4 mr-2" }), "DA, \u0218terge!"] }), _jsx(Button, { onClick: () => setShowConfirmDialog(false), className: "bg-slate-600 hover:bg-slate-700 text-white py-2 rounded-lg font-semibold transition-all duration-200 text-sm", children: "Anuleaz\u0103" })] })] })] }) })), loading && (_jsx("div", { className: "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 [--webkit-backdrop-filter:blur(8px)] [backdrop-filter:blur(8px)]", children: _jsx(Card, { className: "bg-white shadow-2xl border-2 border-blue-500 animate-pulse", children: _jsxs(CardContent, { className: "p-8", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" }), _jsx("div", { className: "text-lg font-semibold text-slate-700", children: "Se proceseaz\u0103..." })] }), _jsx("div", { className: "mt-4 text-center text-sm text-slate-500", children: "Acest proces poate dura c\u00E2teva momente" })] }) }) })), !membruData && (_jsx(Card, { className: "bg-gradient-to-br from-blue-50 to-indigo-100 border-2 border-blue-300 shadow-lg", children: _jsxs(CardContent, { className: "p-6 text-center", children: [_jsxs("div", { className: "flex items-center justify-center gap-3 mb-2", children: [_jsx(UserMinus, { className: "h-6 w-6 text-blue-600" }), _jsx("h3", { className: "text-lg font-bold text-slate-800", children: "\u0218tergere Membru CAR" })] }), _jsx("p", { className: "text-slate-600 text-sm", children: "Introduce\u021Bi numele sau num\u0103rul fi\u0219ei membrului pentru a \u00EEncepe procesul de \u0219tergere" })] }) }))] }));
}
