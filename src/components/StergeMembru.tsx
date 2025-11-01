import { useState, useRef } from 'react';
import { Database } from 'sql.js';
import { Button } from './ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { UserMinus, RotateCcw, Trash2, AlertTriangle, Search } from 'lucide-react';

interface Props {
  databases: {
    membrii: Database;
    depcred: Database;
    activi?: Database;
    lichidati?: Database;
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

export default function StergeMembru({ databases }: Props) {
  // State pentru căutare
  const [searchTerm, setSearchTerm] = useState('');

  // State pentru datele membrului
  const [membruData, setMembruData] = useState<MembruData | null>(null);
  const [istoric, setIstoric] = useState<IstoricLine[]>([]);

  // State pentru UI
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Refs pentru scroll sincronizat
  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);

  const pushLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  // Funcție pentru sincronizare scroll între toate coloanele
  const handleScroll = (sourceIdx: number, e: React.UIEvent<HTMLDivElement>) => {
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
      let params: string[] = [];

      if (isNumeric) {
        query = `
          SELECT NR_FISA, NUM_PREN, DOMICILIUL, CALITATEA, DATA_INSCR
          FROM membrii
          WHERE NR_FISA = ?
        `;
        params = [searchTerm.trim()];
      } else {
        query = `
          SELECT NR_FISA, NUM_PREN, DOMICILIUL, CALITATEA, DATA_INSCR
          FROM membrii
          WHERE NUM_PREN LIKE ?
        `;
        params = [`%${searchTerm.trim()}%`];
      }

      const result = databases.membrii.exec(query, params);

      if (result.length > 0 && result[0].values.length > 0) {
        if (result[0].values.length > 1) {
          alert('⚠️ Căutarea a returnat mai mulți membri. Vă rugăm să fiți mai specific sau să utilizați numărul fișei.');
          pushLog(`⚠️ Găsiți ${result[0].values.length} membri`);
          setLoading(false);
          return;
        }

        const row = result[0].values[0];
        const membru: MembruData = {
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

      } else {
        alert('❌ Membrul nu a fost găsit în baza de date!');
        pushLog('❌ MEMBRU NEGĂSIT');
        setMembruData(null);
        setIstoric([]);
      }

    } catch (error) {
      pushLog(`❌ Eroare căutare: ${error}`);
      alert(`❌ Eroare la căutare: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Încărcare istoric financiar
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
        pushLog(`✅ Istoric încărcat: ${istoricData.length} înregistrări`);
      } else {
        pushLog('⚠️ Nu există istoric în DEPCRED');
        setIstoric([]);
      }

    } catch (error) {
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
    if (!membruData) return;

    setLoading(true);
    setShowConfirmDialog(false);
    pushLog('');
    pushLog('🗑️ ȘTERGERE MEMBRU ÎN CURS...');
    pushLog(`Nr. Fișă: ${membruData.nr_fisa}`);
    pushLog(`Nume: ${membruData.nume}`);

    try {
      const nrFisa = membruData.nr_fisa;

      // DELETE din 5 tabele (EXACT ca Python - respectăm case sensitivity!)

      // 1. DELETE din MEMBRII (uppercase)
      pushLog('Ștergere din MEMBRII...');
      databases.membrii.run(`DELETE FROM membrii WHERE NR_FISA = ?`, [nrFisa]);

      // 2. DELETE din DEPCRED (uppercase)
      pushLog('Ștergere din DEPCRED...');
      databases.depcred.run(`DELETE FROM depcred WHERE nr_fisa = ?`, [nrFisa]);

      // 3. DELETE din ACTIVI (uppercase)
      // Folosește databases.activi dacă există (fișier separat), altfel încearcă databases.membrii
      pushLog('Ștergere din ACTIVI...');
      try {
        if (databases.activi) {
          databases.activi.run(`DELETE FROM ACTIVI WHERE NR_FISA = ?`, [nrFisa]);
          pushLog('✅ Șters din ACTIVI (fișier separat)');
        } else {
          databases.membrii.run(`DELETE FROM ACTIVI WHERE NR_FISA = ?`, [nrFisa]);
          pushLog('✅ Șters din ACTIVI (din membrii.db)');
        }
      } catch (e) {
        pushLog(`⚠️ Tabelul ACTIVI nu există sau nu are date: ${e}`);
      }

      // 4. DELETE din inactivi (lowercase!)
      // Folosește databases.lichidati dacă există (fișier separat), altfel încearcă databases.membrii
      pushLog('Ștergere din inactivi...');
      try {
        if (databases.lichidati) {
          databases.lichidati.run(`DELETE FROM inactivi WHERE NR_FISA = ?`, [nrFisa]);
          pushLog('✅ Șters din inactivi (fișier separat)');
        } else {
          databases.membrii.run(`DELETE FROM inactivi WHERE NR_FISA = ?`, [nrFisa]);
          pushLog('✅ Șters din inactivi (din membrii.db)');
        }
      } catch (e) {
        pushLog(`⚠️ Tabelul inactivi nu există sau nu are date: ${e}`);
      }

      // 5. DELETE din lichidati (lowercase!)
      // Folosește databases.lichidati dacă există (fișier separat), altfel încearcă databases.membrii
      pushLog('Ștergere din lichidati...');
      try {
        if (databases.lichidati) {
          databases.lichidati.run(`DELETE FROM lichidati WHERE NR_FISA = ?`, [nrFisa]);
          pushLog('✅ Șters din lichidati (fișier separat)');
        } else {
          databases.membrii.run(`DELETE FROM lichidati WHERE NR_FISA = ?`, [nrFisa]);
          pushLog('✅ Șters din lichidati (din membrii.db)');
        }
      } catch (e) {
        pushLog(`⚠️ Tabelul lichidati nu există sau nu are date: ${e}`);
      }

      pushLog('');
      pushLog('✅ MEMBRU ȘTERS CU SUCCES!');
      pushLog(`Membru ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost eliminat din toate tabelele.`);

      alert(`✅ Membrul ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost șters definitiv!`);

      // Golește formularul după ștergere
      handleGoleste();

    } catch (error) {
      pushLog('');
      pushLog(`❌ EROARE LA ȘTERGERE: ${error}`);
      alert(`❌ Eroare la ștergere: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Format pentru display valori financiare
  const formatCurrency = (value: string): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return '0.00';
    return num.toFixed(2);
  };

  // Format pentru display luna-an
  const formatLunaAn = (luna: number, anul: number): string => {
    return `${String(luna).padStart(2, '0')}-${anul}`;
  };

  return (
    <div className="space-y-4">
      {/* HEADER - Căutare membru */}
      <Card className="border-2 border-red-600">
        <CardHeader className="bg-gradient-to-b from-red-100 to-red-200">
          <CardTitle className="flex items-center gap-2 text-red-800">
            <UserMinus className="h-6 w-6" />
            Ștergere Membru
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Căutare */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Căutare după Nr. Fișă sau Nume
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCautaMembru()}
                  className="w-full px-3 py-2 border-2 border-slate-300 rounded-md focus:border-blue-500 focus:outline-none"
                  placeholder="Ex: 123 sau Popescu Ion"
                  disabled={loading}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleCautaMembru}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Caută
                </Button>
              </div>
            </div>

            {/* Date membru (READ-ONLY) */}
            {membruData && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg border-2 border-slate-300">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Nr. Fișă</label>
                  <div className="px-3 py-2 bg-white border-2 border-slate-300 rounded-md text-slate-800 font-semibold">
                    {membruData.nr_fisa}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Nume și Prenume</label>
                  <div className="px-3 py-2 bg-white border-2 border-slate-300 rounded-md text-slate-800">
                    {membruData.nume}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Adresă</label>
                  <div className="px-3 py-2 bg-white border-2 border-slate-300 rounded-md text-slate-800">
                    {membruData.adresa}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Calitate</label>
                  <div className="px-3 py-2 bg-white border-2 border-slate-300 rounded-md text-slate-800">
                    {membruData.calitate}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Data Înscriere</label>
                  <div className="px-3 py-2 bg-white border-2 border-slate-300 rounded-md text-slate-800">
                    {membruData.data_inscr}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ISTORIC FINANCIAR - 3 Secțiuni (DESKTOP) */}
      {membruData && istoric.length > 0 && (
        <>
          {/* Desktop Layout */}
          <Card className="hidden lg:block">
            <CardHeader>
              <CardTitle>Istoric Financiar</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-[4fr_1fr_3fr] gap-2">
                {/* Secțiunea Împrumuturi - Roșu (#e74c3c) */}
                <div className="border-[3px] border-[#e74c3c] rounded-lg overflow-hidden bg-gradient-to-b from-red-50 to-red-100">
                  <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-red-200 to-red-300 border-b-2 border-red-400">
                    Situație Împrumuturi
                  </div>
                  <div className="grid grid-cols-4 gap-px bg-gray-300">
                    {/* Dobândă */}
                    <div className="flex flex-col">
                      <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                        Dobândă
                      </div>
                      <div
                        ref={(el) => { scrollRefs.current[0] = el; }}
                        onScroll={(e) => handleScroll(0, e)}
                        className="h-[400px] overflow-y-auto bg-white"
                        style={{ scrollbarWidth: 'thin' }}
                      >
                        <div className="divide-y divide-slate-200">
                          {istoric.map((tranz, idx) => (
                            <div
                              key={`dobanda-${idx}`}
                              className="p-2 text-center text-sm hover:bg-blue-50"
                            >
                              {formatCurrency(tranz.dobanda)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Debit Împrumut */}
                    <div className="flex flex-col">
                      <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                        Debit
                      </div>
                      <div
                        ref={(el) => { scrollRefs.current[1] = el; }}
                        onScroll={(e) => handleScroll(1, e)}
                        className="h-[400px] overflow-y-auto bg-white"
                        style={{ scrollbarWidth: 'thin' }}
                      >
                        <div className="divide-y divide-slate-200">
                          {istoric.map((tranz, idx) => (
                            <div
                              key={`impr-deb-${idx}`}
                              className="p-2 text-center text-sm hover:bg-blue-50"
                            >
                              {formatCurrency(tranz.impr_deb)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Credit Împrumut */}
                    <div className="flex flex-col">
                      <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                        Credit
                      </div>
                      <div
                        ref={(el) => { scrollRefs.current[2] = el; }}
                        onScroll={(e) => handleScroll(2, e)}
                        className="h-[400px] overflow-y-auto bg-white"
                        style={{ scrollbarWidth: 'thin' }}
                      >
                        <div className="divide-y divide-slate-200">
                          {istoric.map((tranz, idx) => (
                            <div
                              key={`impr-cred-${idx}`}
                              className="p-2 text-center text-sm hover:bg-blue-50"
                            >
                              {formatCurrency(tranz.impr_cred)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Sold Împrumut */}
                    <div className="flex flex-col">
                      <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                        Sold
                      </div>
                      <div
                        ref={(el) => { scrollRefs.current[3] = el; }}
                        onScroll={(e) => handleScroll(3, e)}
                        className="h-[400px] overflow-y-auto bg-white"
                        style={{ scrollbarWidth: 'thin' }}
                      >
                        <div className="divide-y divide-slate-200">
                          {istoric.map((tranz, idx) => (
                            <div
                              key={`impr-sold-${idx}`}
                              className="p-2 text-center text-sm hover:bg-blue-50"
                            >
                              {formatCurrency(tranz.impr_sold)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Secțiunea Dată - Gri (#6c757d) */}
                <div className="border-[3px] border-[#6c757d] rounded-lg overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
                  <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-slate-300 to-slate-400 border-b-2 border-slate-500">
                    Dată
                  </div>
                  <div className="flex flex-col">
                    <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                      Luna-An
                    </div>
                    <div
                      ref={(el) => { scrollRefs.current[4] = el; }}
                      onScroll={(e) => handleScroll(4, e)}
                      className="h-[400px] overflow-y-auto bg-white"
                      style={{ scrollbarWidth: 'thin' }}
                    >
                      <div className="divide-y divide-slate-200">
                        {istoric.map((tranz, idx) => (
                          <div
                            key={`luna-an-${idx}`}
                            className="p-2 text-center text-sm font-semibold hover:bg-green-50"
                          >
                            {formatLunaAn(tranz.luna, tranz.anul)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Secțiunea Depuneri - Verde (#28a745) */}
                <div className="border-[3px] border-[#28a745] rounded-lg overflow-hidden bg-gradient-to-b from-green-50 to-green-100">
                  <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-500">
                    Situație Depuneri
                  </div>
                  <div className="grid grid-cols-3 gap-px bg-gray-300">
                    {/* Debit Depuneri */}
                    <div className="flex flex-col">
                      <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                        Debit
                      </div>
                      <div
                        ref={(el) => { scrollRefs.current[5] = el; }}
                        onScroll={(e) => handleScroll(5, e)}
                        className="h-[400px] overflow-y-auto bg-white"
                        style={{ scrollbarWidth: 'thin' }}
                      >
                        <div className="divide-y divide-slate-200">
                          {istoric.map((tranz, idx) => (
                            <div
                              key={`dep-deb-${idx}`}
                              className="p-2 text-center text-sm hover:bg-purple-50"
                            >
                              {formatCurrency(tranz.dep_deb)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Credit Depuneri */}
                    <div className="flex flex-col">
                      <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                        Credit
                      </div>
                      <div
                        ref={(el) => { scrollRefs.current[6] = el; }}
                        onScroll={(e) => handleScroll(6, e)}
                        className="h-[400px] overflow-y-auto bg-white"
                        style={{ scrollbarWidth: 'thin' }}
                      >
                        <div className="divide-y divide-slate-200">
                          {istoric.map((tranz, idx) => (
                            <div
                              key={`dep-cred-${idx}`}
                              className="p-2 text-center text-sm hover:bg-purple-50"
                            >
                              {formatCurrency(tranz.dep_cred)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Sold Depuneri */}
                    <div className="flex flex-col">
                      <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                        Sold
                      </div>
                      <div
                        ref={(el) => { scrollRefs.current[7] = el; }}
                        onScroll={(e) => handleScroll(7, e)}
                        className="h-[400px] overflow-y-auto bg-white"
                        style={{ scrollbarWidth: 'thin' }}
                      >
                        <div className="divide-y divide-slate-200">
                          {istoric.map((tranz, idx) => (
                            <div
                              key={`dep-sold-${idx}`}
                              className="p-2 text-center text-sm hover:bg-purple-50"
                            >
                              {formatCurrency(tranz.dep_sold)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer indicator */}
              <div className="mt-2 text-center text-xs text-slate-500">
                ↕️ Scroll-ul este sincronizat între toate coloanele
              </div>
            </CardContent>
          </Card>

          {/* Mobile Layout - Vertical Cards */}
          <div className="lg:hidden space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Istoric Financiar</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {istoric.map((tranz, idx) => (
                    <div
                      key={`mobile-${idx}`}
                      className="border-2 border-slate-300 rounded-lg p-3 bg-slate-50"
                    >
                      {/* Luna-An */}
                      <div className="text-center font-bold text-lg text-slate-800 mb-2 pb-2 border-b-2 border-slate-300">
                        {formatLunaAn(tranz.luna, tranz.anul)}
                      </div>

                      {/* Împrumuturi */}
                      <div className="mb-3 p-2 bg-red-50 rounded border border-red-300">
                        <div className="font-bold text-xs text-red-800 mb-2">ÎMPRUMUTURI</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-600">Dobândă:</span>
                            <span className="ml-1 font-semibold">{formatCurrency(tranz.dobanda)}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">Debit:</span>
                            <span className="ml-1 font-semibold">{formatCurrency(tranz.impr_deb)}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">Credit:</span>
                            <span className="ml-1 font-semibold">{formatCurrency(tranz.impr_cred)}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">Sold:</span>
                            <span className="ml-1 font-semibold">{formatCurrency(tranz.impr_sold)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Depuneri */}
                      <div className="p-2 bg-green-50 rounded border border-green-300">
                        <div className="font-bold text-xs text-green-800 mb-2">DEPUNERI</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-600">Debit:</span>
                            <span className="ml-1 font-semibold">{formatCurrency(tranz.dep_deb)}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">Credit:</span>
                            <span className="ml-1 font-semibold">{formatCurrency(tranz.dep_cred)}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-600">Sold:</span>
                            <span className="ml-1 font-semibold">{formatCurrency(tranz.dep_sold)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* BUTOANE ACȚIUNI */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* Golește formular - mereu activ */}
            <Button
              onClick={handleGoleste}
              className="bg-slate-600 hover:bg-slate-700 text-white px-8"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Golește formular
            </Button>

            {/* Șterge Definitiv - activ doar când există membru selectat */}
            <Button
              onClick={handleInitiereStergere}
              disabled={!membruData || loading}
              className="bg-red-600 hover:bg-red-700 text-white px-8 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              ⚠️ Șterge Definitiv
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG CONFIRMARE */}
      {showConfirmDialog && membruData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full border-4 border-red-600">
            <CardHeader className="bg-gradient-to-b from-red-100 to-red-200">
              <CardTitle className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="h-6 w-6" />
                ⚠️ ATENȚIE MAXIMĂ
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <Alert className="border-2 border-red-500 bg-red-50">
                <AlertDescription className="text-red-900 font-bold">
                  ACȚIUNE IREVERSIBILĂ!
                </AlertDescription>
              </Alert>

              <div className="space-y-2 text-sm">
                <p className="font-semibold text-slate-800">
                  Sunteți sigur că doriți să ștergeți membrul:
                </p>
                <div className="p-3 bg-slate-100 rounded border-2 border-slate-300">
                  <div><strong>Nr. Fișă:</strong> {membruData.nr_fisa}</div>
                  <div><strong>Nume:</strong> {membruData.nume}</div>
                  <div><strong>Adresă:</strong> {membruData.adresa}</div>
                </div>
                <p className="text-red-700 font-semibold">
                  Toate datele acestui membru vor fi eliminate DEFINITIV din toate tabelele bazei de date!
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 bg-slate-600 hover:bg-slate-700 text-white"
                >
                  Anulează
                </Button>
                <Button
                  onClick={handleStergeDefinitiv}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  DA, Șterge Definitiv!
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* LOG-URI */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Log Operații</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 text-green-400 p-3 rounded font-mono text-xs max-h-48 overflow-y-auto">
              {logs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
