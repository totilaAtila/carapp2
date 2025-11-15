import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Label } from './ui/label';
import { UserX, AlertTriangle, Trash2, Archive, CheckSquare, Square, RefreshCw } from 'lucide-react';
import { getActiveDB, assertCanWrite } from '../services/databaseManager';
export default function Lichidati({ databases }) {
    const currency = databases.activeCurrency || 'RON';
    // State pentru tab-uri
    const [activeTab, setActiveTab] = useState('inactivi');
    // State pentru membri detectați
    const [membriInactivi, setMembriInactivi] = useState([]);
    const [membriSolduriZero, setMembriSolduriZero] = useState([]);
    const [membriNeconcordante, setMembriNeconcordante] = useState([]);
    // State pentru selecție
    const [selected, setSelected] = useState(new Set());
    // State UI
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState([]);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [actionType, setActionType] = useState('lichidare');
    // Parametri configurabili
    const [luniInactivitate, setLuniInactivitate] = useState(12); // luni fără tranzacții
    // Scroll la top când se montează componenta
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);
    const pushLog = (msg) => {
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
    };
    // Funcție pentru detectarea membrilor inactivi
    const detecteazaMembriInactivi = useCallback(() => {
        setLoading(true);
        pushLog("🔍 Începe detectarea membrilor inactivi...");
        try {
            const membriiDB = getActiveDB(databases, 'membrii');
            const depcredDB = getActiveDB(databases, 'depcred');
            const lichidatiDB = getActiveDB(databases, 'lichidati');
            // Obține data curentă
            const now = new Date();
            const anCurent = now.getFullYear();
            const lunaCurenta = now.getMonth() + 1; // 1-12
            // Calculează data limită (X luni în urmă)
            let anLimita = anCurent;
            let lunaLimita = lunaCurenta - luniInactivitate;
            while (lunaLimita <= 0) {
                lunaLimita += 12;
                anLimita -= 1;
            }
            pushLog(`📅 Căutare membri fără tranzacții din ${lunaLimita}/${anLimita}`);
            // Obține toți membrii din MEMBRII
            const membriiQuery = `SELECT NR_FISA, NUME_PREN, ADRESA FROM MEMBRII`;
            const membriiResult = membriiDB.exec(membriiQuery);
            if (membriiResult.length === 0) {
                pushLog("⚠️ Nu există membri în baza de date");
                setMembriInactivi([]);
                setLoading(false);
                return;
            }
            // Obține membri deja lichidați (pentru a-i exclude)
            const lichidatiQuery = `SELECT NR_FISA FROM LICHIDATI`;
            const lichidatiResult = lichidatiDB.exec(lichidatiQuery);
            const lichidatiSet = new Set();
            if (lichidatiResult.length > 0) {
                lichidatiResult[0].values.forEach(row => {
                    lichidatiSet.add(row[0]);
                });
            }
            const membriProblema = [];
            // Verifică fiecare membru
            for (const row of membriiResult[0].values) {
                const nrFisa = row[0];
                const numePren = row[1];
                const adresa = row[2];
                // Skip membri deja lichidați
                if (lichidatiSet.has(nrFisa))
                    continue;
                // Verifică ultima tranzacție în DEPCRED
                const ultimaTranzQuery = `
          SELECT LUNA, ANUL
          FROM DEPCRED
          WHERE NR_FISA = ${nrFisa}
          ORDER BY ANUL DESC, LUNA DESC
          LIMIT 1
        `;
                const ultimaTranzResult = depcredDB.exec(ultimaTranzQuery);
                if (ultimaTranzResult.length === 0) {
                    // Nu există nicio tranzacție - membru fără activitate
                    membriProblema.push({
                        nrFisa,
                        numePren,
                        adresa,
                        tipProblema: 'Fără tranzacții',
                        detalii: 'Nicio înregistrare în DEPCRED',
                        ultimaTranzactie: 'Niciodată'
                    });
                    continue;
                }
                const ultimaLuna = ultimaTranzResult[0].values[0][0];
                const ultimulAn = ultimaTranzResult[0].values[0][1];
                // Verifică dacă ultima tranzacție este mai veche decât limita
                const esteInactiv = ultimulAn < anLimita ||
                    (ultimulAn === anLimita && ultimaLuna < lunaLimita);
                if (esteInactiv) {
                    membriProblema.push({
                        nrFisa,
                        numePren,
                        adresa,
                        tipProblema: 'Inactiv',
                        detalii: `Fără activitate de ${luniInactivitate} luni`,
                        ultimaTranzactie: `${String(ultimaLuna).padStart(2, '0')}/${ultimulAn}`
                    });
                }
            }
            setMembriInactivi(membriProblema);
            pushLog(`✅ Detectați ${membriProblema.length} membri inactivi`);
        }
        catch (err) {
            pushLog(`❌ Eroare: ${err.message}`);
            console.error(err);
        }
        finally {
            setLoading(false);
        }
    }, [databases, luniInactivitate]);
    // Funcție pentru detectarea membrilor cu solduri zero
    const detecteazaMembriSolduriZero = useCallback(() => {
        setLoading(true);
        pushLog("🔍 Începe detectarea membrilor cu solduri zero...");
        try {
            const membriiDB = getActiveDB(databases, 'membrii');
            const depcredDB = getActiveDB(databases, 'depcred');
            const lichidatiDB = getActiveDB(databases, 'lichidati');
            // Obține membri deja lichidați
            const lichidatiQuery = `SELECT NR_FISA FROM LICHIDATI`;
            const lichidatiResult = lichidatiDB.exec(lichidatiQuery);
            const lichidatiSet = new Set();
            if (lichidatiResult.length > 0) {
                lichidatiResult[0].values.forEach(row => {
                    lichidatiSet.add(row[0]);
                });
            }
            // Obține toți membrii din MEMBRII
            const membriiQuery = `SELECT NR_FISA, NUME_PREN, ADRESA FROM MEMBRII`;
            const membriiResult = membriiDB.exec(membriiQuery);
            if (membriiResult.length === 0) {
                pushLog("⚠️ Nu există membri în baza de date");
                setMembriSolduriZero([]);
                setLoading(false);
                return;
            }
            const membriProblema = [];
            // Verifică fiecare membru
            for (const row of membriiResult[0].values) {
                const nrFisa = row[0];
                const numePren = row[1];
                const adresa = row[2];
                // Skip membri deja lichidați
                if (lichidatiSet.has(nrFisa))
                    continue;
                // Obține ultimele solduri
                const ultimulSoldQuery = `
          SELECT IMPR_SOLD, DEP_SOLD, LUNA, ANUL
          FROM DEPCRED
          WHERE NR_FISA = ${nrFisa}
          ORDER BY ANUL DESC, LUNA DESC
          LIMIT 1
        `;
                const ultimulSoldResult = depcredDB.exec(ultimulSoldQuery);
                if (ultimulSoldResult.length === 0)
                    continue;
                const imprSold = parseFloat(ultimulSoldResult[0].values[0][0]) || 0;
                const depSold = parseFloat(ultimulSoldResult[0].values[0][1]) || 0;
                const luna = ultimulSoldResult[0].values[0][2];
                const an = ultimulSoldResult[0].values[0][3];
                // Verifică dacă ambele solduri sunt zero (sau foarte apropiate de zero)
                if (Math.abs(imprSold) < 0.01 && Math.abs(depSold) < 0.01) {
                    membriProblema.push({
                        nrFisa,
                        numePren,
                        adresa,
                        tipProblema: 'Solduri zero',
                        detalii: 'Ambele solduri (împrumut și depuneri) sunt zero',
                        ultimaTranzactie: `${String(luna).padStart(2, '0')}/${an}`,
                        soldImprumut: imprSold.toFixed(2),
                        soldDepuneri: depSold.toFixed(2)
                    });
                }
            }
            setMembriSolduriZero(membriProblema);
            pushLog(`✅ Detectați ${membriProblema.length} membri cu solduri zero`);
        }
        catch (err) {
            pushLog(`❌ Eroare: ${err.message}`);
            console.error(err);
        }
        finally {
            setLoading(false);
        }
    }, [databases]);
    // Funcție pentru detectarea neconcordanțelor între baze
    const detecteazaNeconcordante = useCallback(() => {
        setLoading(true);
        pushLog("🔍 Începe detectarea neconcordanțelor între baze...");
        try {
            const membriiDB = getActiveDB(databases, 'membrii');
            const depcredDB = getActiveDB(databases, 'depcred');
            const membriProblema = [];
            // Cazul 1: Membri în DEPCRED dar nu în MEMBRII
            const nrFiseDepcredQuery = `SELECT DISTINCT NR_FISA FROM DEPCRED`;
            const nrFiseDepcredResult = depcredDB.exec(nrFiseDepcredQuery);
            if (nrFiseDepcredResult.length > 0) {
                for (const row of nrFiseDepcredResult[0].values) {
                    const nrFisa = row[0];
                    // Verifică dacă există în MEMBRII
                    const existaQuery = `SELECT COUNT(*) FROM MEMBRII WHERE NR_FISA = ${nrFisa}`;
                    const existaResult = membriiDB.exec(existaQuery);
                    const exista = existaResult[0].values[0][0];
                    if (exista === 0) {
                        // Obține detalii din DEPCRED
                        const detaliiQuery = `
              SELECT LUNA, ANUL, IMPR_SOLD, DEP_SOLD
              FROM DEPCRED
              WHERE NR_FISA = ${nrFisa}
              ORDER BY ANUL DESC, LUNA DESC
              LIMIT 1
            `;
                        const detaliiResult = depcredDB.exec(detaliiQuery);
                        if (detaliiResult.length > 0) {
                            const luna = detaliiResult[0].values[0][0];
                            const an = detaliiResult[0].values[0][1];
                            const imprSold = detaliiResult[0].values[0][2];
                            const depSold = detaliiResult[0].values[0][3];
                            membriProblema.push({
                                nrFisa,
                                numePren: `Fișa ${nrFisa}`,
                                adresa: 'N/A',
                                tipProblema: 'În DEPCRED, nu în MEMBRII',
                                detalii: 'Tranzacții existente dar fără date personale',
                                ultimaTranzactie: `${String(luna).padStart(2, '0')}/${an}`,
                                soldImprumut: imprSold,
                                soldDepuneri: depSold
                            });
                        }
                    }
                }
            }
            // Cazul 2: Membri în MEMBRII dar fără nicio înregistrare în DEPCRED
            const membriiQuery = `SELECT NR_FISA, NUME_PREN, ADRESA FROM MEMBRII`;
            const membriiResult = membriiDB.exec(membriiQuery);
            if (membriiResult.length > 0) {
                for (const row of membriiResult[0].values) {
                    const nrFisa = row[0];
                    const numePren = row[1];
                    const adresa = row[2];
                    // Verifică dacă există în DEPCRED
                    const existaQuery = `SELECT COUNT(*) FROM DEPCRED WHERE NR_FISA = ${nrFisa}`;
                    const existaResult = depcredDB.exec(existaQuery);
                    const exista = existaResult[0].values[0][0];
                    if (exista === 0) {
                        membriProblema.push({
                            nrFisa,
                            numePren,
                            adresa,
                            tipProblema: 'În MEMBRII, nu în DEPCRED',
                            detalii: 'Date personale fără istoric tranzacții',
                            ultimaTranzactie: 'Niciodată'
                        });
                    }
                }
            }
            setMembriNeconcordante(membriProblema);
            pushLog(`✅ Detectate ${membriProblema.length} neconcordanțe`);
        }
        catch (err) {
            pushLog(`❌ Eroare: ${err.message}`);
            console.error(err);
        }
        finally {
            setLoading(false);
        }
    }, [databases]);
    // Funcție pentru detectarea tuturor problemelor
    const detecteazaToateProbleme = useCallback(() => {
        detecteazaMembriInactivi();
        detecteazaMembriSolduriZero();
        detecteazaNeconcordante();
    }, [detecteazaMembriInactivi, detecteazaMembriSolduriZero, detecteazaNeconcordante]);
    // Efect pentru detectare automată la încărcare
    useEffect(() => {
        detecteazaToateProbleme();
    }, [detecteazaToateProbleme]);
    // Funcție pentru toggle selecție
    const toggleSelect = (nrFisa) => {
        setSelected(prev => {
            const newSet = new Set(prev);
            if (newSet.has(nrFisa)) {
                newSet.delete(nrFisa);
            }
            else {
                newSet.add(nrFisa);
            }
            return newSet;
        });
    };
    // Funcție pentru selectare toate
    const selectAll = () => {
        const membri = getCurrentTabMembers();
        setSelected(new Set(membri.map(m => m.nrFisa)));
    };
    // Funcție pentru deselectare toate
    const deselectAll = () => {
        setSelected(new Set());
    };
    // Obține membrii pentru tab-ul curent
    const getCurrentTabMembers = () => {
        switch (activeTab) {
            case 'inactivi':
                return membriInactivi;
            case 'solduri-zero':
                return membriSolduriZero;
            case 'neconcordante':
                return membriNeconcordante;
            default:
                return [];
        }
    };
    // Funcție pentru lichidare în masă
    const handleLichidareInMasa = async () => {
        if (selected.size === 0) {
            pushLog("⚠️ Nu ați selectat niciun membru");
            return;
        }
        setActionType('lichidare');
        setShowConfirmDialog(true);
    };
    // Funcție pentru ștergere în masă
    const handleStergereInMasa = async () => {
        if (selected.size === 0) {
            pushLog("⚠️ Nu ați selectat niciun membru");
            return;
        }
        setActionType('stergere');
        setShowConfirmDialog(true);
    };
    // Confirmă acțiunea
    const confirmaActiune = async () => {
        setShowConfirmDialog(false);
        setLoading(true);
        try {
            assertCanWrite(databases, actionType === 'lichidare' ? 'Lichidare în masă' : 'Ștergere permanentă');
            const membriiDB = getActiveDB(databases, 'membrii');
            const depcredDB = getActiveDB(databases, 'depcred');
            const lichidatiDB = getActiveDB(databases, 'lichidati');
            const activiDB = getActiveDB(databases, 'activi');
            const inactiviDB = getActiveDB(databases, 'inactivi');
            const membriCurenti = getCurrentTabMembers().filter(m => selected.has(m.nrFisa));
            if (actionType === 'lichidare') {
                pushLog(`📝 Marchează ${membriCurenti.length} membri ca lichidați...`);
                for (const membru of membriCurenti) {
                    // Adaugă în LICHIDATI
                    const insertQuery = `
            INSERT OR REPLACE INTO LICHIDATI (NR_FISA, NUME_PREN, ADRESA, DATA_LICHIDARE)
            VALUES (${membru.nrFisa}, '${membru.numePren.replace(/'/g, "''")}',
                    '${membru.adresa.replace(/'/g, "''")}', '${new Date().toISOString().split('T')[0]}')
          `;
                    lichidatiDB.run(insertQuery);
                    // Șterge din ACTIVI
                    activiDB.run(`DELETE FROM ACTIVI WHERE NR_FISA = ${membru.nrFisa}`);
                    // Șterge din INACTIVI
                    inactiviDB.run(`DELETE FROM INACTIVI WHERE NR_FISA = ${membru.nrFisa}`);
                    pushLog(`✅ Lichidat: ${membru.numePren} (${membru.nrFisa})`);
                }
                pushLog(`✅ Lichidare completă: ${membriCurenti.length} membri`);
            }
            else if (actionType === 'stergere') {
                pushLog(`🗑️ Ștergere permanentă ${membriCurenti.length} membri...`);
                for (const membru of membriCurenti) {
                    // Șterge din toate bazele
                    membriiDB.run(`DELETE FROM MEMBRII WHERE NR_FISA = ${membru.nrFisa}`);
                    depcredDB.run(`DELETE FROM DEPCRED WHERE NR_FISA = ${membru.nrFisa}`);
                    activiDB.run(`DELETE FROM ACTIVI WHERE NR_FISA = ${membru.nrFisa}`);
                    inactiviDB.run(`DELETE FROM INACTIVI WHERE NR_FISA = ${membru.nrFisa}`);
                    lichidatiDB.run(`DELETE FROM LICHIDATI WHERE NR_FISA = ${membru.nrFisa}`);
                    pushLog(`🗑️ Șters: ${membru.numePren} (${membru.nrFisa})`);
                }
                pushLog(`✅ Ștergere completă: ${membriCurenti.length} membri`);
            }
            // Resetează selecția
            setSelected(new Set());
            // Re-detectează probleme
            detecteazaToateProbleme();
        }
        catch (err) {
            pushLog(`❌ Eroare: ${err.message}`);
            console.error(err);
        }
        finally {
            setLoading(false);
        }
    };
    const membriCurenti = getCurrentTabMembers();
    const totalSelectat = selected.size;
    return (_jsxs("div", { className: "p-4 md:p-6 max-w-7xl mx-auto", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(UserX, { className: "h-6 w-6" }), "Lichidare Membri - Detec\u021Bie Automat\u0103", _jsxs("span", { className: "text-sm font-normal text-gray-500", children: ["(", currency, ")"] })] }) }), _jsxs(CardContent, { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col md:flex-row gap-4 items-end", children: [_jsxs("div", { className: "flex-1", children: [_jsx(Label, { htmlFor: "luniInactivitate", children: "Luni de inactivitate (limit\u0103)" }), _jsx("input", { id: "luniInactivitate", type: "number", min: "1", max: "60", value: luniInactivitate, onChange: (e) => setLuniInactivitate(parseInt(e.target.value) || 12), className: "mt-1 w-full px-3 py-2 border border-gray-300 rounded-md" })] }), _jsxs(Button, { onClick: detecteazaToateProbleme, disabled: loading, className: "flex items-center gap-2", children: [_jsx(RefreshCw, { className: `h-4 w-4 ${loading ? 'animate-spin' : ''}` }), "Re\u00EEmprosp\u0103teaz\u0103 Detec\u021Bia"] })] }), _jsxs("div", { className: "flex flex-wrap gap-2 border-b", children: [_jsxs("button", { onClick: () => setActiveTab('inactivi'), className: `px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === 'inactivi'
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'}`, children: ["Membri Inactivi (", membriInactivi.length, ")"] }), _jsxs("button", { onClick: () => setActiveTab('solduri-zero'), className: `px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === 'solduri-zero'
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'}`, children: ["Solduri Zero (", membriSolduriZero.length, ")"] }), _jsxs("button", { onClick: () => setActiveTab('neconcordante'), className: `px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === 'neconcordante'
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'}`, children: ["Neconcordan\u021Be (", membriNeconcordante.length, ")"] })] }), membriCurenti.length > 0 && (_jsxs("div", { className: "flex flex-wrap gap-2 items-center", children: [_jsxs(Button, { variant: "outline", size: "sm", onClick: selectAll, className: "flex items-center gap-1", children: [_jsx(CheckSquare, { className: "h-4 w-4" }), "Selecteaz\u0103 Tot"] }), _jsxs(Button, { variant: "outline", size: "sm", onClick: deselectAll, className: "flex items-center gap-1", children: [_jsx(Square, { className: "h-4 w-4" }), "Deselecteaz\u0103 Tot"] }), _jsx("div", { className: "flex-1 text-sm text-gray-600", children: totalSelectat > 0 && `${totalSelectat} selectați` }), totalSelectat > 0 && (_jsxs(_Fragment, { children: [_jsxs(Button, { onClick: handleLichidareInMasa, disabled: loading, className: "flex items-center gap-2 bg-orange-600 hover:bg-orange-700", children: [_jsx(Archive, { className: "h-4 w-4" }), "Marcheaz\u0103 ca Lichida\u021Bi (", totalSelectat, ")"] }), _jsxs(Button, { onClick: handleStergereInMasa, disabled: loading, variant: "destructive", className: "flex items-center gap-2", children: [_jsx(Trash2, { className: "h-4 w-4" }), "\u0218terge Permanent (", totalSelectat, ")"] })] }))] })), membriCurenti.length === 0 ? (_jsx(Alert, { children: _jsx(AlertDescription, { children: loading ? (_jsxs("span", { className: "flex items-center gap-2", children: [_jsx(RefreshCw, { className: "h-4 w-4 animate-spin" }), "Se detecteaz\u0103 probleme..."] })) : (`✅ Nu există membri cu probleme în categoria "${activeTab}"`) }) })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full border-collapse", children: [_jsx("thead", { className: "bg-gray-50", children: _jsxs("tr", { children: [_jsx("th", { className: "border p-2 w-12", children: _jsx("input", { type: "checkbox", checked: totalSelectat === membriCurenti.length, onChange: (e) => {
                                                                if (e.target.checked) {
                                                                    selectAll();
                                                                }
                                                                else {
                                                                    deselectAll();
                                                                }
                                                            }, className: "h-4 w-4" }) }), _jsx("th", { className: "border p-2 text-left", children: "Nr. Fi\u0219\u0103" }), _jsx("th", { className: "border p-2 text-left", children: "Nume \u0219i Prenume" }), _jsx("th", { className: "border p-2 text-left", children: "Adres\u0103" }), _jsx("th", { className: "border p-2 text-left", children: "Tip Problem\u0103" }), _jsx("th", { className: "border p-2 text-left", children: "Detalii" }), _jsx("th", { className: "border p-2 text-left", children: "Ultima Tranzac\u021Bie" }), activeTab === 'solduri-zero' && (_jsxs(_Fragment, { children: [_jsx("th", { className: "border p-2 text-right", children: "Sold \u00CEmprumut" }), _jsx("th", { className: "border p-2 text-right", children: "Sold Depuneri" })] }))] }) }), _jsx("tbody", { children: membriCurenti.map((membru) => (_jsxs("tr", { className: `hover:bg-gray-50 ${selected.has(membru.nrFisa) ? 'bg-blue-50' : ''}`, children: [_jsx("td", { className: "border p-2", children: _jsx("input", { type: "checkbox", checked: selected.has(membru.nrFisa), onChange: () => toggleSelect(membru.nrFisa), className: "h-4 w-4" }) }), _jsx("td", { className: "border p-2", children: membru.nrFisa }), _jsx("td", { className: "border p-2", children: membru.numePren }), _jsx("td", { className: "border p-2 text-sm", children: membru.adresa }), _jsx("td", { className: "border p-2", children: _jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800", children: [_jsx(AlertTriangle, { className: "h-3 w-3" }), membru.tipProblema] }) }), _jsx("td", { className: "border p-2 text-sm text-gray-600", children: membru.detalii }), _jsx("td", { className: "border p-2 text-center", children: membru.ultimaTranzactie || 'N/A' }), activeTab === 'solduri-zero' && (_jsxs(_Fragment, { children: [_jsx("td", { className: "border p-2 text-right font-mono", children: membru.soldImprumut || '0.00' }), _jsx("td", { className: "border p-2 text-right font-mono", children: membru.soldDepuneri || '0.00' })] }))] }, membru.nrFisa))) })] }) })), logs.length > 0 && (_jsxs("div", { className: "mt-6", children: [_jsx(Label, { className: "mb-2 block", children: "Jurnal Opera\u021Biuni:" }), _jsx("div", { className: "bg-gray-900 text-green-400 p-4 rounded font-mono text-sm max-h-64 overflow-y-auto", children: logs.map((log, i) => (_jsx("div", { children: log }, i))) })] }))] })] }), showConfirmDialog && (_jsx("div", { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50", children: _jsxs(Card, { className: "max-w-md w-full", children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2 text-red-600", children: [_jsx(AlertTriangle, { className: "h-6 w-6" }), "Confirmare ", actionType === 'lichidare' ? 'Lichidare' : 'Ștergere'] }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsx(Alert, { className: "bg-red-50 border-red-200", children: _jsx(AlertDescription, { children: actionType === 'lichidare' ? (_jsxs(_Fragment, { children: ["Sunte\u021Bi pe cale s\u0103 ", _jsxs("strong", { children: ["lichida\u021Bi ", selected.size, " membri"] }), ".", _jsx("br", {}), "Ace\u0219tia vor fi muta\u021Bi \u00EEn baza LICHIDATI \u0219i elimina\u021Bi din ACTIVI/INACTIVI."] })) : (_jsxs(_Fragment, { children: ["Sunte\u021Bi pe cale s\u0103 ", _jsxs("strong", { children: ["\u0219terge\u021Bi permanent ", selected.size, " membri"] }), ".", _jsx("br", {}), _jsx("span", { className: "text-red-600 font-bold", children: "Aceast\u0103 ac\u021Biune este IREVERSIBIL\u0102!" }), _jsx("br", {}), "Toate datele (MEMBRII, DEPCRED, etc.) vor fi eliminate definitiv."] })) }) }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { onClick: () => setShowConfirmDialog(false), variant: "outline", className: "flex-1", children: "Anuleaz\u0103" }), _jsx(Button, { onClick: confirmaActiune, variant: "destructive", className: "flex-1", children: actionType === 'lichidare' ? 'Confirmă Lichidarea' : 'Confirmă Ștergerea' })] })] })] }) }))] }));
}
