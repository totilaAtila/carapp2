import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { Button } from './ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { UserPlus, RotateCcw, Check, AlertCircle } from 'lucide-react';
import Decimal from 'decimal.js';
export default function AdaugaMembru({ databases }) {
    // Funcție pentru formatare dată curentă (DD-MM-YYYY)
    const getDataCurenta = () => {
        const now = new Date();
        const zi = String(now.getDate()).padStart(2, '0');
        const luna = String(now.getMonth() + 1).padStart(2, '0');
        const an = now.getFullYear();
        return `${zi}-${luna}-${an}`;
    };
    // Funcție pentru formatare lună-an curent (LL-AAAA)
    const getLunaAnCurent = () => {
        const now = new Date();
        const luna = String(now.getMonth() + 1).padStart(2, '0');
        const an = now.getFullYear();
        return `${luna}-${an}`;
    };
    // State pentru datele membrului
    const [nrFisa, setNrFisa] = useState('');
    const [nume, setNume] = useState('');
    const [adresa, setAdresa] = useState('');
    const [calitate, setCalitate] = useState('');
    const [dataInscr, setDataInscr] = useState(getDataCurenta());
    // State pentru coloane financiare
    const [colDobanda, setColDobanda] = useState('');
    const [colImprDeb, setColImprDeb] = useState('');
    const [colImprCred, setColImprCred] = useState('');
    const [colImprSold, setColImprSold] = useState('');
    const [colLunaAn, setColLunaAn] = useState(getLunaAnCurent());
    const [colDepDeb, setColDepDeb] = useState('');
    const [colDepCred, setColDepCred] = useState('');
    const [colDepSold, setColDepSold] = useState('');
    // State pentru UI
    const [verificat, setVerificat] = useState(false);
    const [membruExistent, setMembruExistent] = useState(false);
    const [loadedNrFisa, setLoadedNrFisa] = useState(null);
    const [istoric, setIstoric] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    // Refs pentru scroll sincronizat
    const dobandaRef = useRef(null);
    const imprDebRef = useRef(null);
    const imprCredRef = useRef(null);
    const imprSoldRef = useRef(null);
    const lunaAnRef = useRef(null);
    const depDebRef = useRef(null);
    const depCredRef = useRef(null);
    const depSoldRef = useRef(null);
    const pushLog = (msg) => {
        setLogs(prev => [...prev, msg]);
    };
    // Funcție pentru sincronizare scroll
    const handleScroll = (e) => {
        const scrollTop = e.currentTarget.scrollTop;
        [dobandaRef, imprDebRef, imprCredRef, imprSoldRef, lunaAnRef, depDebRef, depCredRef, depSoldRef].forEach(ref => {
            if (ref.current && ref.current !== e.currentTarget) {
                ref.current.scrollTop = scrollTop;
            }
        });
    };
    // Verificare format dată (DD-MM-YYYY sau YYYY-MM-DD, ca Python)
    const verificaFormatData = (data) => {
        // Format 1: DD-MM-YYYY (format principal)
        const regexDDMMYYYY = /^\d{2}-\d{2}-\d{4}$/;
        if (regexDDMMYYYY.test(data)) {
            const [zi, luna, an] = data.split('-').map(Number);
            if (luna < 1 || luna > 12)
                return false;
            if (zi < 1 || zi > 31)
                return false;
            if (an < 1900 || an > 2100)
                return false;
            return true;
        }
        // Format 2: YYYY-MM-DD (format ISO, acceptat ca Python)
        const regexYYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;
        if (regexYYYYMMDD.test(data)) {
            const [an, luna, zi] = data.split('-').map(Number);
            if (luna < 1 || luna > 12)
                return false;
            if (zi < 1 || zi > 31)
                return false;
            if (an < 1900 || an > 2100)
                return false;
            return true;
        }
        return false;
    };
    // Verificare format lună-an (LL-AAAA)
    const verificaFormatLunaAn = (lunaAn) => {
        const regex = /^\d{2}-\d{4}$/;
        if (!regex.test(lunaAn))
            return false;
        const [luna, an] = lunaAn.split('-').map(Number);
        if (luna < 1 || luna > 12)
            return false;
        if (an < 1900 || an > 2100)
            return false;
        return true;
    };
    // Validare număr real
    const valideazaNumarReal = (valoare) => {
        if (valoare.trim() === '')
            return true; // Gol este valid
        try {
            const decimal = new Decimal(valoare);
            return decimal.greaterThanOrEqualTo(0);
        }
        catch {
            return false;
        }
    };
    // Verificare număr fișă
    const handleVerificaNrFisa = async () => {
        if (!nrFisa.trim()) {
            alert('⚠️ Introduceți numărul fișei!');
            return;
        }
        setLoading(true);
        setLogs([]);
        pushLog('🔍 VERIFICARE NUMĂR FIȘĂ...');
        pushLog(`Număr fișă: ${nrFisa}`);
        try {
            // Query MEMBRII.db
            const result = databases.membrii.exec(`
        SELECT NR_FISA, NUM_PREN, DOMICILIUL, CALITATEA, DATA_INSCR
        FROM membrii
        WHERE NR_FISA = ?
      `, [nrFisa]);
            if (result.length > 0 && result[0].values.length > 0) {
                // MEMBRU EXISTENT
                const row = result[0].values[0];
                setMembruExistent(true);
                setLoadedNrFisa(nrFisa);
                // Încarcă datele personale
                setNume(String(row[1] || ''));
                setAdresa(String(row[2] || ''));
                setCalitate(String(row[3] || ''));
                setDataInscr(String(row[4] || ''));
                pushLog('✅ MEMBRU EXISTENT');
                pushLog(`Nume: ${row[1]}`);
                pushLog(`Adresă: ${row[2]}`);
                pushLog('');
                pushLog('📋 Încărcare istoric...');
                // Încarcă istoricul din DEPCRED.db
                await incarcaIstoric(nrFisa);
            }
            else {
                // MEMBRU NOU
                setMembruExistent(false);
                setLoadedNrFisa(null);
                setIstoric([]);
                pushLog('➕ MEMBRU NOU');
                pushLog('Numărul de fișă nu există în baza de date.');
                pushLog('Completați toate câmpurile pentru a adăuga membrul nou.');
                // Setează câmpurile editabile pentru membru nou
                setNume('');
                setAdresa('');
                setCalitate('');
                setDataInscr('');
            }
            setVerificat(true);
        }
        catch (error) {
            pushLog(`❌ Eroare: ${error}`);
            alert(`Eroare la verificare: ${error}`);
        }
        finally {
            setLoading(false);
        }
    };
    // Încărcare istoric membru
    const incarcaIstoric = async (nr_fisa) => {
        try {
            const result = databases.depcred.exec(`
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
                // Populează coloanele cu istoric
                setColDobanda(istoricData.map(l => l.dobanda).join('\n'));
                setColImprDeb(istoricData.map(l => l.impr_deb).join('\n'));
                setColImprCred(istoricData.map(l => l.impr_cred).join('\n'));
                setColImprSold(istoricData.map(l => l.impr_sold).join('\n'));
                setColLunaAn(istoricData.map(l => `${String(l.luna).padStart(2, '0')}-${l.anul}`).join('\n'));
                setColDepDeb(istoricData.map(l => l.dep_deb).join('\n'));
                setColDepCred(istoricData.map(l => l.dep_cred).join('\n'));
                setColDepSold(istoricData.map(l => l.dep_sold).join('\n'));
                pushLog(`✅ Istoric încărcat: ${istoricData.length} înregistrări`);
            }
            else {
                pushLog('⚠️ Nu există istoric în DEPCRED.db');
                setIstoric([]);
            }
        }
        catch (error) {
            pushLog(`❌ Eroare încărcare istoric: ${error}`);
        }
    };
    // Validare câmpuri pentru membru nou
    const verificaCampuriCompletate = () => {
        if (!nume.trim()) {
            alert('❌ Câmpul "Nume și Prenume" este obligatoriu!');
            return false;
        }
        if (!adresa.trim()) {
            alert('❌ Câmpul "Adresă" este obligatoriu!');
            return false;
        }
        if (!calitate.trim()) {
            alert('❌ Câmpul "Calitate" este obligatoriu!');
            return false;
        }
        if (!dataInscr.trim()) {
            alert('❌ Câmpul "Data Înscriere" este obligatoriu!');
            return false;
        }
        if (!verificaFormatData(dataInscr)) {
            alert('❌ Formatul datei este incorect! Folosiți: DD-MM-YYYY sau YYYY-MM-DD');
            return false;
        }
        // Pentru membru nou, verificăm și câmpurile financiare
        if (!membruExistent) {
            if (!colLunaAn.trim()) {
                alert('❌ Câmpul "Lună-An" este obligatoriu pentru membru nou!');
                return false;
            }
            if (!verificaFormatLunaAn(colLunaAn.trim())) {
                alert('❌ Formatul Lună-An este incorect! Folosiți: LL-AAAA (ex: 01-2025)');
                return false;
            }
            // Validare valori numerice
            const valoriFinanciare = [
                { val: colDobanda, nume: 'Dobândă' },
                { val: colImprDeb, nume: 'Împrumut Debit' },
                { val: colImprCred, nume: 'Împrumut Credit' },
                { val: colImprSold, nume: 'Împrumut Sold' },
                { val: colDepDeb, nume: 'Depunere Debit' },
                { val: colDepCred, nume: 'Depunere Credit' },
                { val: colDepSold, nume: 'Depunere Sold' },
            ];
            for (const item of valoriFinanciare) {
                if (!valideazaNumarReal(item.val)) {
                    alert(`❌ Valoarea pentru "${item.nume}" nu este validă!`);
                    return false;
                }
            }
        }
        return true;
    };
    // Salvare date
    const handleSalveaza = async () => {
        if (!verificat) {
            alert('⚠️ Mai întâi verificați numărul fișei!');
            return;
        }
        if (!verificaCampuriCompletate()) {
            return;
        }
        setLoading(true);
        pushLog('');
        pushLog('💾 SALVARE DATE...');
        try {
            if (membruExistent) {
                // UPDATE membru existent - doar date personale
                databases.membrii.run(`
          UPDATE membrii
          SET NUM_PREN = ?,
              DOMICILIUL = ?,
              CALITATEA = ?,
              DATA_INSCR = ?
          WHERE NR_FISA = ?
        `, [nume, adresa, calitate, dataInscr, nrFisa]);
                pushLog('✅ Date membru actualizate cu succes!');
                pushLog('ℹ️ Datele financiare nu pot fi modificate din acest modul.');
                alert('✅ Modificările au fost salvate!\n\nℹ️ Nota: Istoricul financiar nu a fost modificat.');
            }
            else {
                // INSERT membru nou
                pushLog('➕ Creare membru nou...');
                // 1. INSERT în MEMBRII.db
                const cotizatieStandard = new Decimal('10'); // Valoare default
                databases.membrii.run(`
          INSERT INTO membrii (NR_FISA, NUM_PREN, DOMICILIUL, CALITATEA, DATA_INSCR, COTIZATIE_STANDARD)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [nrFisa, nume, adresa, calitate, dataInscr, cotizatieStandard.toString()]);
                pushLog('✅ Membru adăugat în MEMBRII.db');
                // 2. INSERT prima înregistrare în DEPCRED.db
                const [luna_str, anul_str] = colLunaAn.trim().split('-');
                const luna = parseInt(luna_str, 10);
                const anul = parseInt(anul_str, 10);
                const dobanda = colDobanda.trim() || '0';
                const impr_deb = colImprDeb.trim() || '0';
                const impr_cred = colImprCred.trim() || '0';
                const impr_sold = colImprSold.trim() || '0';
                const dep_deb = colDepDeb.trim() || '0';
                const dep_cred = colDepCred.trim() || '0';
                const dep_sold = colDepSold.trim() || '0';
                databases.depcred.run(`
          INSERT INTO depcred (
            nr_fisa, luna, anul, dobanda,
            impr_deb, impr_cred, impr_sold,
            dep_deb, dep_cred, dep_sold, prima
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [nrFisa, luna, anul, dobanda, impr_deb, impr_cred, impr_sold, dep_deb, dep_cred, dep_sold]);
                pushLog('✅ Înregistrare inițială adăugată în DEPCRED.db');
                pushLog('');
                pushLog('🎉 MEMBRU NOU CREAT CU SUCCES!');
                pushLog(`Număr fișă: ${nrFisa}`);
                pushLog(`Nume: ${nume}`);
                alert(`✅ Membru nou adăugat cu succes!\n\nNumăr fișă: ${nrFisa}\nNume: ${nume}`);
                // Reset formular după adăugare
                handleReset();
            }
        }
        catch (error) {
            pushLog(`❌ EROARE SALVARE: ${error}`);
            alert(`❌ Eroare la salvare:\n${error}`);
        }
        finally {
            setLoading(false);
        }
    };
    // Reset formular
    const handleReset = () => {
        setNrFisa('');
        setNume('');
        setAdresa('');
        setCalitate('');
        setDataInscr('');
        setColDobanda('');
        setColImprDeb('');
        setColImprCred('');
        setColImprSold('');
        setColLunaAn('');
        setColDepDeb('');
        setColDepCred('');
        setColDepSold('');
        setVerificat(false);
        setMembruExistent(false);
        setLoadedNrFisa(null);
        setIstoric([]);
        setLogs([]);
        pushLog('🔄 Formular resetat');
    };
    return (_jsx("div", { className: "min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4", children: _jsxs(Card, { className: "max-w-[1400px] mx-auto shadow-xl", children: [_jsx(CardHeader, { className: "bg-gradient-to-r from-blue-600 to-blue-700 text-white", children: _jsxs(CardTitle, { className: "flex items-center gap-3 text-2xl", children: [_jsx(UserPlus, { className: "w-8 h-8" }), "Ad\u0103ugare / Modificare Membru"] }) }), _jsxs(CardContent, { className: "p-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 p-4 bg-white rounded-lg border-2 border-blue-200", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-semibold text-slate-700 mb-1", children: "Num\u0103r Fi\u0219\u0103" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", value: nrFisa, onChange: (e) => setNrFisa(e.target.value), disabled: verificat, className: "flex-1 px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-slate-100", placeholder: "Ex: 123" }), _jsx(Button, { onClick: handleVerificaNrFisa, disabled: loading || verificat, className: "bg-blue-600 hover:bg-blue-700", size: "sm", children: loading ? '...' : '🔍' })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-semibold text-slate-700 mb-1", children: "Nume \u0219i Prenume" }), _jsx("input", { type: "text", value: nume, onChange: (e) => setNume(e.target.value), disabled: !verificat, className: "w-full px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-slate-100", placeholder: "Ex: Popescu Ion" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-semibold text-slate-700 mb-1", children: "Adres\u0103" }), _jsx("input", { type: "text", value: adresa, onChange: (e) => setAdresa(e.target.value), disabled: !verificat, className: "w-full px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-slate-100", placeholder: "Ex: Str. Libert\u0103\u021Bii nr. 10" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-semibold text-slate-700 mb-1", children: "Calitate" }), _jsx("input", { type: "text", value: calitate, onChange: (e) => setCalitate(e.target.value), disabled: !verificat, className: "w-full px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-slate-100", placeholder: "Ex: Membru activ" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-semibold text-slate-700 mb-1", children: "Data \u00CEnscriere (DD-MM-YYYY)" }), _jsx("input", { type: "text", value: dataInscr, onChange: (e) => setDataInscr(e.target.value), disabled: !verificat, className: "w-full px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-slate-100", placeholder: "Ex: 15-01-2024" })] }), _jsx("div", { className: "flex items-end", children: _jsxs(Button, { onClick: handleReset, variant: "outline", className: "w-full border-2 border-red-500 text-red-600 hover:bg-red-50", children: [_jsx(RotateCcw, { className: "w-4 h-4 mr-2" }), "Reset"] }) })] }), verificat && (_jsxs("div", { className: "mb-6 hidden lg:block", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(AlertCircle, { className: "w-5 h-5 text-blue-600" }), _jsx("h3", { className: "text-lg font-bold text-slate-800", children: membruExistent ? 'Istoric Financiar (Read-Only)' : 'Date Financiare Inițiale' })] }), _jsx(Card, { children: _jsxs(CardContent, { className: "p-4", children: [_jsxs("div", { className: "grid grid-cols-[4fr_1fr_3fr] gap-2", children: [_jsxs("div", { className: "border-[3px] border-red-500 rounded-lg overflow-hidden bg-gradient-to-b from-red-50 to-red-100", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-red-200 to-red-300 border-b-2 border-red-400", children: "Situa\u021Bie \u00CEmprumuturi" }), _jsxs("div", { className: "grid grid-cols-4 gap-px bg-gray-300", children: [_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Dob\u00E2nd\u0103" }), _jsx("textarea", { ref: dobandaRef, value: colDobanda, onChange: (e) => setColDobanda(e.target.value), onScroll: handleScroll, disabled: membruExistent, className: "h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0", style: { scrollbarWidth: 'thin' }, placeholder: "0" })] }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "\u00CEmprumut" }), _jsx("textarea", { ref: imprDebRef, value: colImprDeb, onChange: (e) => setColImprDeb(e.target.value), onScroll: handleScroll, disabled: membruExistent, className: "h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0", style: { scrollbarWidth: 'thin' }, placeholder: "0" })] }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Rat\u0103 Achitat\u0103" }), _jsx("textarea", { ref: imprCredRef, value: colImprCred, onChange: (e) => setColImprCred(e.target.value), onScroll: handleScroll, disabled: membruExistent, className: "h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0", style: { scrollbarWidth: 'thin' }, placeholder: "0" })] }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Sold \u00CEmprumut" }), _jsx("textarea", { ref: imprSoldRef, value: colImprSold, onChange: (e) => setColImprSold(e.target.value), onScroll: handleScroll, disabled: membruExistent, className: "h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0", style: { scrollbarWidth: 'thin' }, placeholder: "0" })] })] })] }), _jsxs("div", { className: "border-[3px] border-slate-500 rounded-lg overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-slate-300 to-slate-400 border-b-2 border-slate-500", children: "Dat\u0103" }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Lun\u0103-An" }), _jsx("textarea", { ref: lunaAnRef, value: colLunaAn, onChange: (e) => setColLunaAn(e.target.value), onScroll: handleScroll, disabled: membruExistent, className: "h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono font-semibold focus:outline-none disabled:bg-slate-100 resize-none border-0", style: { scrollbarWidth: 'thin' }, placeholder: "LL-AAAA" })] })] }), _jsxs("div", { className: "border-[3px] border-green-600 rounded-lg overflow-hidden bg-gradient-to-b from-green-50 to-green-100", children: [_jsx("div", { className: "text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-500", children: "Situa\u021Bie Depuneri" }), _jsxs("div", { className: "grid grid-cols-3 gap-px bg-gray-300", children: [_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Cotiza\u021Bie" }), _jsx("textarea", { ref: depDebRef, value: colDepDeb, onChange: (e) => setColDepDeb(e.target.value), onScroll: handleScroll, disabled: membruExistent, className: "h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0", style: { scrollbarWidth: 'thin' }, placeholder: "0" })] }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Retragere" }), _jsx("textarea", { ref: depCredRef, value: colDepCred, onChange: (e) => setColDepCred(e.target.value), onScroll: handleScroll, disabled: membruExistent, className: "h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0", style: { scrollbarWidth: 'thin' }, placeholder: "0" })] }), _jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400", children: "Sold Depuneri" }), _jsx("textarea", { ref: depSoldRef, value: colDepSold, onChange: (e) => setColDepSold(e.target.value), onScroll: handleScroll, disabled: membruExistent, className: "h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0", style: { scrollbarWidth: 'thin' }, placeholder: "0" })] })] })] })] }), _jsxs("div", { className: "mt-2 text-xs text-slate-500 text-center flex items-center justify-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full animate-pulse" }), "Scroll sincronizat \u00EEntre toate coloanele"] })] }) }), membruExistent && (_jsx(Alert, { className: "mt-3 bg-blue-50 border-blue-300", children: _jsxs(AlertDescription, { className: "text-sm text-blue-800", children: ["\u2139\uFE0F Pentru membri existen\u021Bi, istoricul financiar este ", _jsx("strong", { children: "read-only" }), ". Pute\u021Bi modifica doar datele personale (nume, adres\u0103, calitate, dat\u0103 \u00EEnscriere)."] }) }))] })), verificat && (_jsxs("div", { className: "mb-6 lg:hidden", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(AlertCircle, { className: "w-5 h-5 text-blue-600" }), _jsx("h3", { className: "text-lg font-bold text-slate-800", children: membruExistent ? 'Istoric Financiar' : 'Date Financiare Inițiale' })] }), membruExistent ? (
                                /* MEMBRU EXISTENT - Afișare istoric ca listă de carduri */
                                _jsxs("div", { className: "space-y-3", children: [istoric.map((tranz, idx) => (_jsxs(Card, { className: "border-l-4 border-blue-500", children: [_jsx(CardHeader, { className: "pb-2 bg-slate-50", children: _jsx(CardTitle, { className: "text-sm flex items-center justify-between", children: _jsxs("span", { children: ["Luna ", String(tranz.luna).padStart(2, '0'), "-", tranz.anul] }) }) }), _jsxs(CardContent, { className: "pt-3 space-y-2 text-sm", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "font-bold text-red-700 border-b border-red-200 pb-1", children: "\u00CEMPRUMUTURI" }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "Dob\u00E2nd\u0103:" }), _jsxs("span", { className: "font-mono", children: [tranz.dobanda, " RON"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "\u00CEmprumut:" }), _jsxs("span", { className: "font-mono", children: [tranz.impr_deb, " RON"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "Rat\u0103 Achitat\u0103:" }), _jsxs("span", { className: "font-mono", children: [tranz.impr_cred, " RON"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "Sold:" }), _jsxs("span", { className: "font-mono font-bold", children: [tranz.impr_sold, " RON"] })] })] }), _jsxs("div", { className: "space-y-1 mt-3", children: [_jsx("div", { className: "font-bold text-green-700 border-b border-green-200 pb-1", children: "DEPUNERI" }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "Cotiza\u021Bie:" }), _jsxs("span", { className: "font-mono", children: [tranz.dep_deb, " RON"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "Retragere:" }), _jsxs("span", { className: "font-mono", children: [tranz.dep_cred, " RON"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "Sold:" }), _jsxs("span", { className: "font-mono font-bold", children: [tranz.dep_sold, " RON"] })] })] })] })] }, idx))), _jsx(Alert, { className: "bg-blue-50 border-blue-300", children: _jsxs(AlertDescription, { className: "text-sm text-blue-800", children: ["\u2139\uFE0F Pentru membri existen\u021Bi, istoricul financiar este ", _jsx("strong", { children: "read-only" }), ". Pute\u021Bi modifica doar datele personale."] }) })] })) : (
                                /* MEMBRU NOU - Formular vertical simplu */
                                _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "bg-red-50 border-2 border-red-200 rounded-lg p-4 space-y-3", children: [_jsx("h4", { className: "font-bold text-red-700 text-sm", children: "\u00CEMPRUMUTURI" }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-700 mb-1", children: "Dob\u00E2nd\u0103 (RON)" }), _jsx("input", { type: "text", value: colDobanda, onChange: (e) => setColDobanda(e.target.value), className: "w-full px-3 py-2 border-2 border-red-300 rounded font-mono text-sm focus:border-red-500 focus:outline-none", placeholder: "0" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-700 mb-1", children: "\u00CEmprumut Acordat (RON)" }), _jsx("input", { type: "text", value: colImprDeb, onChange: (e) => setColImprDeb(e.target.value), className: "w-full px-3 py-2 border-2 border-red-300 rounded font-mono text-sm focus:border-red-500 focus:outline-none", placeholder: "0" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-700 mb-1", children: "Rat\u0103 Achitat\u0103 (RON)" }), _jsx("input", { type: "text", value: colImprCred, onChange: (e) => setColImprCred(e.target.value), className: "w-full px-3 py-2 border-2 border-red-300 rounded font-mono text-sm focus:border-red-500 focus:outline-none", placeholder: "0" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-700 mb-1", children: "Sold \u00CEmprumut (RON)" }), _jsx("input", { type: "text", value: colImprSold, onChange: (e) => setColImprSold(e.target.value), className: "w-full px-3 py-2 border-2 border-red-300 rounded font-mono text-sm focus:border-red-500 focus:outline-none", placeholder: "0" })] })] }), _jsxs("div", { className: "bg-slate-50 border-2 border-slate-300 rounded-lg p-4", children: [_jsx("h4", { className: "font-bold text-slate-700 text-sm mb-3", children: "DAT\u0102" }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-700 mb-1", children: "Lun\u0103-An (LL-AAAA)" }), _jsx("input", { type: "text", value: colLunaAn, onChange: (e) => setColLunaAn(e.target.value), className: "w-full px-3 py-2 border-2 border-slate-400 rounded font-mono text-sm focus:border-slate-600 focus:outline-none", placeholder: "LL-AAAA" })] })] }), _jsxs("div", { className: "bg-green-50 border-2 border-green-200 rounded-lg p-4 space-y-3", children: [_jsx("h4", { className: "font-bold text-green-700 text-sm", children: "DEPUNERI" }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-700 mb-1", children: "Cotiza\u021Bie (RON)" }), _jsx("input", { type: "text", value: colDepDeb, onChange: (e) => setColDepDeb(e.target.value), className: "w-full px-3 py-2 border-2 border-green-300 rounded font-mono text-sm focus:border-green-500 focus:outline-none", placeholder: "0" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-700 mb-1", children: "Retragere (RON)" }), _jsx("input", { type: "text", value: colDepCred, onChange: (e) => setColDepCred(e.target.value), className: "w-full px-3 py-2 border-2 border-green-300 rounded font-mono text-sm focus:border-green-500 focus:outline-none", placeholder: "0" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-700 mb-1", children: "Sold Depuneri (RON)" }), _jsx("input", { type: "text", value: colDepSold, onChange: (e) => setColDepSold(e.target.value), className: "w-full px-3 py-2 border-2 border-green-300 rounded font-mono text-sm focus:border-green-500 focus:outline-none", placeholder: "0" })] })] })] }))] })), verificat && (_jsx("div", { className: "flex gap-4 mb-6", children: _jsxs(Button, { onClick: handleSalveaza, disabled: loading, className: "flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3", children: [_jsx(Check, { className: "w-5 h-5 mr-2" }), membruExistent ? 'Salvează Modificări' : 'Salvează Membru Nou'] }) })), logs.length > 0 && (_jsx("div", { className: "bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto", children: logs.map((log, idx) => (_jsx("div", { className: "leading-relaxed", children: log }, idx))) }))] })] }) }));
}
