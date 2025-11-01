import { useState, useRef, useEffect } from 'react';
import { Database } from 'sql.js';
import { Button } from './ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { UserPlus, RotateCcw, Check, AlertCircle } from 'lucide-react';
import Decimal from 'decimal.js';

interface Props {
  databases: {
    membrii: Database;
    depcred: Database;
  };
}

interface MembruData {
  nr_fisa: string;
  nume: string;
  adresa: string;
  calitate: string;
  data_inscr: string;
}

interface IstoricLine {
  luna: number;
  anul: number;
  dobanda: string;
  impr_deb: string;
  impr_cred: string;
  impr_sold: string;
  dep_deb: string;
  dep_cred: string;
  dep_sold: string;
}

export default function AdaugaMembru({ databases }: Props) {
  // Funcție pentru formatare dată curentă (DD.MM.YYYY)
  const getDataCurenta = () => {
    const now = new Date();
    const zi = String(now.getDate()).padStart(2, '0');
    const luna = String(now.getMonth() + 1).padStart(2, '0');
    const an = now.getFullYear();
    return `${zi}.${luna}.${an}`;
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
  const [loadedNrFisa, setLoadedNrFisa] = useState<string | null>(null);
  const [istoric, setIstoric] = useState<IstoricLine[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Refs pentru scroll sincronizat
  const dobandaRef = useRef<HTMLTextAreaElement>(null);
  const imprDebRef = useRef<HTMLTextAreaElement>(null);
  const imprCredRef = useRef<HTMLTextAreaElement>(null);
  const imprSoldRef = useRef<HTMLTextAreaElement>(null);
  const lunaAnRef = useRef<HTMLTextAreaElement>(null);
  const depDebRef = useRef<HTMLTextAreaElement>(null);
  const depCredRef = useRef<HTMLTextAreaElement>(null);
  const depSoldRef = useRef<HTMLTextAreaElement>(null);

  const pushLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  // Funcție pentru sincronizare scroll
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    [dobandaRef, imprDebRef, imprCredRef, imprSoldRef, lunaAnRef, depDebRef, depCredRef, depSoldRef].forEach(ref => {
      if (ref.current && ref.current !== e.currentTarget) {
        ref.current.scrollTop = scrollTop;
      }
    });
  };

  // Verificare format dată (DD.MM.YYYY)
  const verificaFormatData = (data: string): boolean => {
    const regex = /^\d{2}\.\d{2}\.\d{4}$/;
    if (!regex.test(data)) return false;

    const [zi, luna, an] = data.split('.').map(Number);
    if (luna < 1 || luna > 12) return false;
    if (zi < 1 || zi > 31) return false;
    if (an < 1900 || an > 2100) return false;

    return true;
  };

  // Verificare format lună-an (LL-AAAA)
  const verificaFormatLunaAn = (lunaAn: string): boolean => {
    const regex = /^\d{2}-\d{4}$/;
    if (!regex.test(lunaAn)) return false;

    const [luna, an] = lunaAn.split('-').map(Number);
    if (luna < 1 || luna > 12) return false;
    if (an < 1900 || an > 2100) return false;

    return true;
  };

  // Validare număr real
  const valideazaNumarReal = (valoare: string): boolean => {
    if (valoare.trim() === '') return true; // Gol este valid
    try {
      const decimal = new Decimal(valoare);
      return decimal.greaterThanOrEqualTo(0);
    } catch {
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

      } else {
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

    } catch (error) {
      pushLog(`❌ Eroare: ${error}`);
      alert(`Eroare la verificare: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Încărcare istoric membru
  const incarcaIstoric = async (nr_fisa: string) => {
    try {
      const result = databases.depcred.exec(`
        SELECT luna, anul, dobanda, impr_deb, impr_cred, impr_sold,
               dep_deb, dep_cred, dep_sold
        FROM depcred
        WHERE nr_fisa = ?
        ORDER BY anul ASC, luna ASC
      `, [nr_fisa]);

      if (result.length > 0 && result[0].values.length > 0) {
        const istoricData: IstoricLine[] = result[0].values.map(row => ({
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
      } else {
        pushLog('⚠️ Nu există istoric în DEPCRED.db');
        setIstoric([]);
      }

    } catch (error) {
      pushLog(`❌ Eroare încărcare istoric: ${error}`);
    }
  };

  // Validare câmpuri pentru membru nou
  const verificaCampuriCompletate = (): boolean => {
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
      alert('❌ Formatul datei este incorect! Folosiți: DD.MM.YYYY');
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

      } else {
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

    } catch (error) {
      pushLog(`❌ EROARE SALVARE: ${error}`);
      alert(`❌ Eroare la salvare:\n${error}`);
    } finally {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="max-w-[1400px] mx-auto shadow-xl">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <CardTitle className="flex items-center gap-3 text-2xl">
            <UserPlus className="w-8 h-8" />
            Adăugare / Modificare Membru
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          {/* SECȚIUNE HEADER - Date Personale */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 p-4 bg-white rounded-lg border-2 border-blue-200">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Număr Fișă
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nrFisa}
                  onChange={(e) => setNrFisa(e.target.value)}
                  disabled={verificat}
                  className="flex-1 px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                  placeholder="Ex: 123"
                />
                <Button
                  onClick={handleVerificaNrFisa}
                  disabled={loading || verificat}
                  className="bg-blue-600 hover:bg-blue-700"
                  size="sm"
                >
                  {loading ? '...' : '🔍'}
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Nume și Prenume
              </label>
              <input
                type="text"
                value={nume}
                onChange={(e) => setNume(e.target.value)}
                disabled={!verificat}
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                placeholder="Ex: Popescu Ion"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Adresă
              </label>
              <input
                type="text"
                value={adresa}
                onChange={(e) => setAdresa(e.target.value)}
                disabled={!verificat}
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                placeholder="Ex: Str. Libertății nr. 10"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Calitate
              </label>
              <input
                type="text"
                value={calitate}
                onChange={(e) => setCalitate(e.target.value)}
                disabled={!verificat}
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                placeholder="Ex: Membru activ"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Data Înscriere (DD.MM.YYYY)
              </label>
              <input
                type="text"
                value={dataInscr}
                onChange={(e) => setDataInscr(e.target.value)}
                disabled={!verificat}
                className="w-full px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                placeholder="Ex: 15.01.2024"
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleReset}
                variant="outline"
                className="w-full border-2 border-red-500 text-red-600 hover:bg-red-50"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>

          {/* SECȚIUNE COLOANE FINANCIARE - DESKTOP ONLY */}
          {verificat && (
            <div className="mb-6 hidden lg:block">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-800">
                  {membruExistent ? 'Istoric Financiar (Read-Only)' : 'Date Financiare Inițiale'}
                </h3>
              </div>

              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-[4fr_1fr_3fr] gap-2">
                    {/* Secțiunea Împrumuturi - 50% */}
                    <div className="border-[3px] border-red-500 rounded-lg overflow-hidden bg-gradient-to-b from-red-50 to-red-100">
                      <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-red-200 to-red-300 border-b-2 border-red-400">
                        Situație Împrumuturi
                      </div>
                      <div className="grid grid-cols-4 gap-px bg-gray-300">
                        {/* Coloană Dobândă */}
                        <div className="flex flex-col">
                          <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                            Dobândă
                          </div>
                          <textarea
                            ref={dobandaRef}
                            value={colDobanda}
                            onChange={(e) => setColDobanda(e.target.value)}
                            onScroll={handleScroll}
                            disabled={membruExistent}
                            className="h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0"
                            style={{ scrollbarWidth: 'thin' }}
                            placeholder="0"
                          />
                        </div>

                        {/* Coloană Împrumut Debit */}
                        <div className="flex flex-col">
                          <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                            Împrumut
                          </div>
                          <textarea
                            ref={imprDebRef}
                            value={colImprDeb}
                            onChange={(e) => setColImprDeb(e.target.value)}
                            onScroll={handleScroll}
                            disabled={membruExistent}
                            className="h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0"
                            style={{ scrollbarWidth: 'thin' }}
                            placeholder="0"
                          />
                        </div>

                        {/* Coloană Împrumut Credit */}
                        <div className="flex flex-col">
                          <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                            Rată Achitată
                          </div>
                          <textarea
                            ref={imprCredRef}
                            value={colImprCred}
                            onChange={(e) => setColImprCred(e.target.value)}
                            onScroll={handleScroll}
                            disabled={membruExistent}
                            className="h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0"
                            style={{ scrollbarWidth: 'thin' }}
                            placeholder="0"
                          />
                        </div>

                        {/* Coloană Împrumut Sold */}
                        <div className="flex flex-col">
                          <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                            Sold Împrumut
                          </div>
                          <textarea
                            ref={imprSoldRef}
                            value={colImprSold}
                            onChange={(e) => setColImprSold(e.target.value)}
                            onScroll={handleScroll}
                            disabled={membruExistent}
                            className="h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0"
                            style={{ scrollbarWidth: 'thin' }}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Secțiunea Dată - 12.5% */}
                    <div className="border-[3px] border-slate-500 rounded-lg overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
                      <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-slate-300 to-slate-400 border-b-2 border-slate-500">
                        Dată
                      </div>
                      <div className="flex flex-col">
                        <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                          Lună-An
                        </div>
                        <textarea
                          ref={lunaAnRef}
                          value={colLunaAn}
                          onChange={(e) => setColLunaAn(e.target.value)}
                          onScroll={handleScroll}
                          disabled={membruExistent}
                          className="h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono font-semibold focus:outline-none disabled:bg-slate-100 resize-none border-0"
                          style={{ scrollbarWidth: 'thin' }}
                          placeholder="LL-AAAA"
                        />
                      </div>
                    </div>

                    {/* Secțiunea Depuneri - 37.5% */}
                    <div className="border-[3px] border-green-600 rounded-lg overflow-hidden bg-gradient-to-b from-green-50 to-green-100">
                      <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-500">
                        Situație Depuneri
                      </div>
                      <div className="grid grid-cols-3 gap-px bg-gray-300">
                        {/* Coloană Depunere Debit */}
                        <div className="flex flex-col">
                          <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                            Cotizație
                          </div>
                          <textarea
                            ref={depDebRef}
                            value={colDepDeb}
                            onChange={(e) => setColDepDeb(e.target.value)}
                            onScroll={handleScroll}
                            disabled={membruExistent}
                            className="h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0"
                            style={{ scrollbarWidth: 'thin' }}
                            placeholder="0"
                          />
                        </div>

                        {/* Coloană Depunere Credit */}
                        <div className="flex flex-col">
                          <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                            Retragere
                          </div>
                          <textarea
                            ref={depCredRef}
                            value={colDepCred}
                            onChange={(e) => setColDepCred(e.target.value)}
                            onScroll={handleScroll}
                            disabled={membruExistent}
                            className="h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0"
                            style={{ scrollbarWidth: 'thin' }}
                            placeholder="0"
                          />
                        </div>

                        {/* Coloană Depunere Sold */}
                        <div className="flex flex-col">
                          <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                            Sold Depuneri
                          </div>
                          <textarea
                            ref={depSoldRef}
                            value={colDepSold}
                            onChange={(e) => setColDepSold(e.target.value)}
                            onScroll={handleScroll}
                            disabled={membruExistent}
                            className="h-[400px] overflow-y-auto bg-white px-2 py-1 text-sm font-mono focus:outline-none disabled:bg-slate-100 resize-none border-0"
                            style={{ scrollbarWidth: 'thin' }}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer cu info scroll sincronizat */}
                  <div className="mt-2 text-xs text-slate-500 text-center flex items-center justify-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    Scroll sincronizat între toate coloanele
                  </div>
                </CardContent>
              </Card>

              {membruExistent && (
                <Alert className="mt-3 bg-blue-50 border-blue-300">
                  <AlertDescription className="text-sm text-blue-800">
                    ℹ️ Pentru membri existenți, istoricul financiar este <strong>read-only</strong>.
                    Puteți modifica doar datele personale (nume, adresă, calitate, dată înscriere).
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* SECȚIUNE DATE FINANCIARE - MOBILE ONLY */}
          {verificat && (
            <div className="mb-6 lg:hidden">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-800">
                  {membruExistent ? 'Istoric Financiar' : 'Date Financiare Inițiale'}
                </h3>
              </div>

              {membruExistent ? (
                /* MEMBRU EXISTENT - Afișare istoric ca listă de carduri */
                <div className="space-y-3">
                  {istoric.map((tranz, idx) => (
                    <Card key={idx} className="border-l-4 border-blue-500">
                      <CardHeader className="pb-2 bg-slate-50">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span>Luna {String(tranz.luna).padStart(2, '0')}-{tranz.anul}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3 space-y-2 text-sm">
                        <div className="space-y-1">
                          <div className="font-bold text-red-700 border-b border-red-200 pb-1">ÎMPRUMUTURI</div>
                          <div className="flex justify-between"><span className="text-slate-600">Dobândă:</span><span className="font-mono">{tranz.dobanda} RON</span></div>
                          <div className="flex justify-between"><span className="text-slate-600">Împrumut:</span><span className="font-mono">{tranz.impr_deb} RON</span></div>
                          <div className="flex justify-between"><span className="text-slate-600">Rată Achitată:</span><span className="font-mono">{tranz.impr_cred} RON</span></div>
                          <div className="flex justify-between"><span className="text-slate-600">Sold:</span><span className="font-mono font-bold">{tranz.impr_sold} RON</span></div>
                        </div>
                        <div className="space-y-1 mt-3">
                          <div className="font-bold text-green-700 border-b border-green-200 pb-1">DEPUNERI</div>
                          <div className="flex justify-between"><span className="text-slate-600">Cotizație:</span><span className="font-mono">{tranz.dep_deb} RON</span></div>
                          <div className="flex justify-between"><span className="text-slate-600">Retragere:</span><span className="font-mono">{tranz.dep_cred} RON</span></div>
                          <div className="flex justify-between"><span className="text-slate-600">Sold:</span><span className="font-mono font-bold">{tranz.dep_sold} RON</span></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Alert className="bg-blue-50 border-blue-300">
                    <AlertDescription className="text-sm text-blue-800">
                      ℹ️ Pentru membri existenți, istoricul financiar este <strong>read-only</strong>.
                      Puteți modifica doar datele personale.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                /* MEMBRU NOU - Formular vertical simplu */
                <div className="space-y-4">
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 space-y-3">
                    <h4 className="font-bold text-red-700 text-sm">ÎMPRUMUTURI</h4>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Dobândă (RON)</label>
                      <input
                        type="text"
                        value={colDobanda}
                        onChange={(e) => setColDobanda(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-red-300 rounded font-mono text-sm focus:border-red-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Împrumut Acordat (RON)</label>
                      <input
                        type="text"
                        value={colImprDeb}
                        onChange={(e) => setColImprDeb(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-red-300 rounded font-mono text-sm focus:border-red-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Rată Achitată (RON)</label>
                      <input
                        type="text"
                        value={colImprCred}
                        onChange={(e) => setColImprCred(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-red-300 rounded font-mono text-sm focus:border-red-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Sold Împrumut (RON)</label>
                      <input
                        type="text"
                        value={colImprSold}
                        onChange={(e) => setColImprSold(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-red-300 rounded font-mono text-sm focus:border-red-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 border-2 border-slate-300 rounded-lg p-4">
                    <h4 className="font-bold text-slate-700 text-sm mb-3">DATĂ</h4>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Lună-An (LL-AAAA)</label>
                      <input
                        type="text"
                        value={colLunaAn}
                        onChange={(e) => setColLunaAn(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-slate-400 rounded font-mono text-sm focus:border-slate-600 focus:outline-none"
                        placeholder="LL-AAAA"
                      />
                    </div>
                  </div>

                  <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 space-y-3">
                    <h4 className="font-bold text-green-700 text-sm">DEPUNERI</h4>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Cotizație (RON)</label>
                      <input
                        type="text"
                        value={colDepDeb}
                        onChange={(e) => setColDepDeb(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-green-300 rounded font-mono text-sm focus:border-green-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Retragere (RON)</label>
                      <input
                        type="text"
                        value={colDepCred}
                        onChange={(e) => setColDepCred(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-green-300 rounded font-mono text-sm focus:border-green-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Sold Depuneri (RON)</label>
                      <input
                        type="text"
                        value={colDepSold}
                        onChange={(e) => setColDepSold(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-green-300 rounded font-mono text-sm focus:border-green-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BUTOANE ACȚIUNE */}
          {verificat && (
            <div className="flex gap-4 mb-6">
              <Button
                onClick={handleSalveaza}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
              >
                <Check className="w-5 h-5 mr-2" />
                {membruExistent ? 'Salvează Modificări' : 'Salvează Membru Nou'}
              </Button>
            </div>
          )}

          {/* CONSOLE LOGS */}
          {logs.length > 0 && (
            <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto">
              {logs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">
                  {log}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
