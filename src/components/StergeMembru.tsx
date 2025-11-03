import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { UserMinus, RotateCcw, Trash2, AlertTriangle, Search, X } from 'lucide-react';
import { getActiveDB, assertCanWrite, type DBSet } from '../services/databaseManager';

interface Props {
  databases: DBSet;
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

interface AutoCompleteState {
  suggestions: string[];
  isVisible: boolean;
  selectedIndex: number;
  prefix: string;
}

export default function StergeMembru({ databases }: Props) {
  // State pentru căutare și auto-completare
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<'nume' | 'fisa'>('nume');
  const [autoComplete, setAutoComplete] = useState<AutoCompleteState>({
    suggestions: [],
    isVisible: false,
    selectedIndex: -1,
    prefix: ''
  });

  // State pentru datele membrului
  const [membruData, setMembruData] = useState<MembruData | null>(null);
  const [istoric, setIstoric] = useState<IstoricLine[]>([]);

  // State pentru UI
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Refs pentru scroll sincronizat și input
  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autoCompleteRef = useRef<HTMLDivElement>(null);

  // Efect pentru inchidere auto-completare la click in afara
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autoCompleteRef.current && !autoCompleteRef.current.contains(event.target as Node)) {
        setAutoComplete(prev => ({ ...prev, isVisible: false }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pushLog = (msg: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Funcție pentru sincronizare scroll între toate coloanele
  const handleScroll = useCallback((sourceIdx: number, e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    scrollRefs.current.forEach((ref, idx) => {
      if (ref && idx !== sourceIdx) {
        ref.scrollTop = scrollTop;
      }
    });
  }, []);

  // Auto-completare cu prefix
  const handleAutoComplete = useCallback(async (prefix: string) => {
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
    } catch (error) {
      console.error('Eroare auto-completare:', error);
      setAutoComplete({ suggestions: [], isVisible: false, selectedIndex: -1, prefix });
    }
  }, [databases]);

  // Gestionare input căutare
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchType === 'nume') {
      handleAutoComplete(value);
    }
  };

  // Selectare sugestie auto-completare
  const handleSelectSuggestion = (suggestion: string) => {
    setSearchTerm(suggestion);
    setAutoComplete(prev => ({ ...prev, isVisible: false }));
    handleCautaMembru(suggestion);
  };

  // Navigare prin sugestii cu taste
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!autoComplete.isVisible) return;

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
        } else if (searchTerm) {
          handleCautaMembru();
        }
        break;
      case 'Escape':
        setAutoComplete(prev => ({ ...prev, isVisible: false }));
        break;
    }
  };

  // Căutare membru (după nr_fisa sau nume)
  const handleCautaMembru = async (specificTerm?: string) => {
    const term = specificTerm || searchTerm.trim();
    if (!term) {
      alert('⚠️ Introduceți numărul fișei sau numele membrului!');
      return;
    }

    setLoading(true);
    setLogs([]);
    pushLog('🔍 CĂUTARE MEMBRU...');
    pushLog(`Termen căutare: ${term}`);

    try {
      const isNumeric = /^\d+$/.test(term);
      let query = '';
      let params: string[] = [];

      if (isNumeric) {
        query = `
          SELECT NR_FISA, NUM_PREN, DOMICILIUL, CALITATEA, DATA_INSCR
          FROM membrii
          WHERE NR_FISA = ?
        `;
        params = [term];
      } else {
        query = `
          SELECT NR_FISA, NUM_PREN, DOMICILIUL, CALITATEA, DATA_INSCR
          FROM membrii
          WHERE NUM_PREN = ? COLLATE NOCASE
        `;
        params = [term];
      }

      const result = getActiveDB(databases, 'membrii').exec(query, params);

      if (result.length > 0 && result[0].values.length > 0) {
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
      setAutoComplete(prev => ({ ...prev, isVisible: false }));
    }
  };

  // Încărcare istoric financiar
  const incarcaIstoric = async (nr_fisa: string) => {
    try {
      const result = getActiveDB(databases, 'depcred').exec(`
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
    if (!membruData) return;

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
      const errors: string[] = [];
      const successes: string[] = [];

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
          const result = getActiveDB(databases, db as any).run(
            `DELETE FROM ${table} WHERE ${key} = ?`,
            [nrFisa]
          );
          
          successes.push(`✅ Șters din ${table}`);
          pushLog(`✅ Șters din ${table}`);
        } catch (e) {
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
      } else {
        pushLog('✅ MEMBRU ȘTERS CU SUCCES!');
        pushLog(`Membru ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost eliminat din toate tabelele.`);
        alert(`✅ Membrul ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost șters definitiv!`);
        handleGoleste();
      }

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
      <Card className="border-2 border-red-600 bg-gradient-to-br from-red-50 to-red-100">
        <CardHeader className="bg-gradient-to-b from-red-100 to-red-200 border-b-2 border-red-300">
          <CardTitle className="flex items-center gap-2 text-red-800">
            <UserMinus className="h-6 w-6" />
            Ștergere Membru CAR
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Căutare cu Auto-completare */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative" ref={autoCompleteRef}>
                <Label className="block text-sm font-semibold text-slate-700 mb-1">
                  Căutare după Nume (auto-completare)
                </Label>
                <div className="relative">
                  <Input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="Introduceți primele litere ale numelui..."
                    disabled={loading}
                  />
                  {searchTerm && (
                    <button
                      onClick={handleGoleste}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown Auto-completare */}
                {autoComplete.isVisible && autoComplete.suggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border-2 border-blue-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {autoComplete.suggestions.map((suggestion, index) => (
                      <div
                        key={suggestion}
                        className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                          index === autoComplete.selectedIndex ? 'bg-blue-100 border-l-4 border-blue-500' : ''
                        } ${index > 0 ? 'border-t border-slate-100' : ''}`}
                        onClick={() => handleSelectSuggestion(suggestion)}
                        onMouseEnter={() => setAutoComplete(prev => ({ ...prev, selectedIndex: index }))}
                      >
                        <div className="font-medium text-slate-800">{suggestion}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-end gap-2">
                <Button
                  onClick={() => handleCautaMembru()}
                  disabled={loading || !searchTerm.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Search className="h-4 w-4 mr-2" />
                  {loading ? 'Caută...' : 'Caută'}
                </Button>
              </div>
            </div>

            {/* Date membru (READ-ONLY) */}
            {membruData && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-white rounded-lg border-2 border-slate-300 shadow-sm">
                <div>
                  <Label className="block text-xs font-bold text-slate-600 mb-1">Nr. Fișă</Label>
                  <div className="px-3 py-2 bg-slate-50 border-2 border-slate-300 rounded-md text-slate-800 font-semibold text-sm">
                    {membruData.nr_fisa}
                  </div>
                </div>
                <div>
                  <Label className="block text-xs font-bold text-slate-600 mb-1">Nume și Prenume</Label>
                  <div className="px-3 py-2 bg-slate-50 border-2 border-slate-300 rounded-md text-slate-800 text-sm">
                    {membruData.nume}
                  </div>
                </div>
                <div>
                  <Label className="block text-xs font-bold text-slate-600 mb-1">Adresă</Label>
                  <div className="px-3 py-2 bg-slate-50 border-2 border-slate-300 rounded-md text-slate-800 text-sm">
                    {membruData.adresa}
                  </div>
                </div>
                <div>
                  <Label className="block text-xs font-bold text-slate-600 mb-1">Calitate</Label>
                  <div className="px-3 py-2 bg-slate-50 border-2 border-slate-300 rounded-md text-slate-800 text-sm">
                    {membruData.calitate}
                  </div>
                </div>
                <div>
                  <Label className="block text-xs font-bold text-slate-600 mb-1">Data Înscriere</Label>
                  <div className="px-3 py-2 bg-slate-50 border-2 border-slate-300 rounded-md text-slate-800 text-sm">
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
          {/* Desktop Layout - IDENTIC CU PYTHON */}
          <Card className="hidden lg:block border-0 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Istoric Financiar - {membruData.nume}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[4fr_1fr_3fr] gap-3 p-4">
                {/* Secțiunea Împrumuturi - Design 3D Glossy Roșu */}
                <div className="border-[3px] border-[#e74c3c] rounded-xl overflow-hidden bg-gradient-to-b from-red-50 to-red-100 shadow-lg">
                  <div className="text-center font-bold text-slate-800 py-3 bg-gradient-to-b from-red-200 to-red-300 border-b-2 border-red-400">
                    Situație Împrumuturi
                  </div>
                  <div className="grid grid-cols-4 gap-0 bg-red-200">
                    {['Dobândă', 'Împrumut', 'Rată Achitată', 'Sold Împrumut'].map((title, colIndex) => (
                      <div key={title} className="flex flex-col">
                        <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                          {title}
                        </div>
                        <div
                          ref={(el) => { scrollRefs.current[colIndex] = el; }}
                          onScroll={(e) => handleScroll(colIndex, e)}
                          className="h-[400px] overflow-y-auto bg-white [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
                        >
                          <div className="divide-y divide-slate-200">
                            {istoric.map((tranz, idx) => (
                              <div
                                key={`impr-${colIndex}-${idx}`}
                                className="p-2 text-center text-sm hover:bg-blue-50 font-mono"
                              >
                                {formatCurrency(
                                  colIndex === 0 ? tranz.dobanda :
                                  colIndex === 1 ? tranz.impr_deb :
                                  colIndex === 2 ? tranz.impr_cred : tranz.impr_sold
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Secțiunea Dată - Design 3D Glossy Gri */}
                <div className="border-[3px] border-[#6c757d] rounded-xl overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 shadow-lg">
                  <div className="text-center font-bold text-slate-800 py-3 bg-gradient-to-b from-slate-300 to-slate-400 border-b-2 border-slate-500">
                    Dată
                  </div>
                  <div className="flex flex-col">
                    <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                      Luna-An
                    </div>
                    <div
                      ref={(el) => { scrollRefs.current[4] = el; }}
                      onScroll={(e) => handleScroll(4, e)}
                      className="h-[400px] overflow-y-auto bg-white [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
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

                {/* Secțiunea Depuneri - Design 3D Glossy Verde */}
                <div className="border-[3px] border-[#28a745] rounded-xl overflow-hidden bg-gradient-to-b from-green-50 to-green-100 shadow-lg">
                  <div className="text-center font-bold text-slate-800 py-3 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-500">
                    Situație Depuneri
                  </div>
                  <div className="grid grid-cols-3 gap-0 bg-green-200">
                    {['Cotizație', 'Retragere Fond', 'Sold Depunere'].map((title, colIndex) => (
                      <div key={title} className="flex flex-col">
                        <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                          {title}
                        </div>
                        <div
                          ref={(el) => { scrollRefs.current[5 + colIndex] = el; }}
                          onScroll={(e) => handleScroll(5 + colIndex, e)}
                          className="h-[400px] overflow-y-auto bg-white [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
                        >
                          <div className="divide-y divide-slate-200">
                            {istoric.map((tranz, idx) => (
                              <div
                                key={`dep-${colIndex}-${idx}`}
                                className="p-2 text-center text-sm hover:bg-purple-50 font-mono"
                              >
                                {formatCurrency(
                                  colIndex === 0 ? tranz.dep_deb :
                                  colIndex === 1 ? tranz.dep_cred : tranz.dep_sold
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer indicator scroll sincronizat */}
              <div className="mt-2 text-center text-xs text-slate-500 pb-3">
                ↕️ Scroll-ul este sincronizat între toate coloanele
              </div>
            </CardContent>
          </Card>

          {/* Mobile Layout - ÎMBUNĂTĂȚIT */}
          <div className="lg:hidden space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Istoric Financiar - {membruData.nume}</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-4">
                  {istoric.map((tranz, idx) => (
                    <div
                      key={`mobile-${idx}`}
                      className="border-2 border-slate-300 rounded-xl p-4 bg-white shadow-sm"
                    >
                      {/* Header Luna-An */}
                      <div className="text-center font-bold text-lg text-slate-800 mb-3 pb-2 border-b-2 border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-lg -mx-4 -mt-4 p-3">
                        {formatLunaAn(tranz.luna, tranz.anul)}
                      </div>

                      {/* Grid pentru Împrumuturi și Depuneri */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Împrumuturi */}
                        <div className="p-3 bg-red-50 rounded-lg border-2 border-red-200">
                          <div className="font-bold text-sm text-red-800 mb-3 flex items-center gap-2">
                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                            ÎMPRUMUTURI
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between items-center p-2 bg-white rounded border">
                              <span className="text-slate-600">Dobândă:</span>
                              <span className="font-semibold font-mono">{formatCurrency(tranz.dobanda)}</span>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-white rounded border">
                              <span className="text-slate-600">Împrumut:</span>
                              <span className="font-semibold font-mono">{formatCurrency(tranz.impr_deb)}</span>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-white rounded border">
                              <span className="text-slate-600">Rată Achitată:</span>
                              <span className="font-semibold font-mono">{formatCurrency(tranz.impr_cred)}</span>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-white rounded border">
                              <span className="text-slate-600">Sold:</span>
                              <span className="font-semibold font-mono text-red-700">{formatCurrency(tranz.impr_sold)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Depuneri */}
                        <div className="p-3 bg-green-50 rounded-lg border-2 border-green-200">
                          <div className="font-bold text-sm text-green-800 mb-3 flex items-center gap-2">
                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                            DEPUNERI
                          </div>
                          <div className="grid grid-cols-1 gap-3 text-sm">
                            <div className="flex justify-between items-center p-2 bg-white rounded border">
                              <span className="text-slate-600">Cotizație:</span>
                              <span className="font-semibold font-mono">{formatCurrency(tranz.dep_deb)}</span>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-white rounded border">
                              <span className="text-slate-600">Retragere Fond:</span>
                              <span className="font-semibold font-mono">{formatCurrency(tranz.dep_cred)}</span>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-white rounded border">
                              <span className="text-slate-600">Sold Depunere:</span>
                              <span className="font-semibold font-mono text-green-700">{formatCurrency(tranz.dep_sold)}</span>
                            </div>
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
      <Card className="bg-gradient-to-br from-slate-50 to-slate-100">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {/* Golește formular - mereu activ */}
            <Button
              onClick={handleGoleste}
              className="bg-slate-600 hover:bg-slate-700 text-white px-8 py-3 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl min-w-[160px]"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Golește Formular
            </Button>

            {/* Șterge Definitiv - activ doar când există membru selectat */}
            <Button
              onClick={handleInitiereStergere}
              disabled={!membruData || loading}
              className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              ⚠️ Șterge Definitiv
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG CONFIRMARE ȘTERGERE */}
      {showConfirmDialog && membruData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 [--webkit-backdrop-filter:blur(8px)] [backdrop-filter:blur(8px)]">
          <Card className="max-w-md w-full border-4 border-red-600 shadow-2xl">
            <CardHeader className="bg-gradient-to-b from-red-100 to-red-200 border-b-2 border-red-300">
              <CardTitle className="flex items-center gap-3 text-red-800 text-xl">
                <AlertTriangle className="h-7 w-7" />
                ⚠️ ATENȚIE MAXIMĂ
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <Alert className="border-2 border-red-500 bg-red-50">
                <AlertDescription className="text-red-900 font-bold text-center">
                  ACȚIUNE IREVERSIBILĂ!
                </AlertDescription>
              </Alert>

              <div className="space-y-4 text-sm">
                <p className="font-semibold text-slate-800 text-center">
                  Sunteți sigur că doriți să ștergeți DEFINITIV membrul:
                </p>
                <div className="p-4 bg-slate-100 rounded-xl border-2 border-slate-300 space-y-2">
                  <div className="flex justify-between">
                    <strong>Nr. Fișă:</strong>
                    <span className="font-mono">{membruData.nr_fisa}</span>
                  </div>
                  <div className="flex justify-between">
                    <strong>Nume:</strong>
                    <span>{membruData.nume}</span>
                  </div>
                  <div>
                    <strong>Adresă:</strong>
                    <div className="text-slate-700 mt-1">{membruData.adresa}</div>
                  </div>
                </div>
                <p className="text-red-700 font-semibold text-center border-2 border-red-200 bg-red-50 p-3 rounded-lg">
                  Toate datele vor fi eliminate DEFINITIV din toate tabelele bazei de date!
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 bg-slate-600 hover:bg-slate-700 text-white py-3 rounded-lg shadow-lg transition-all duration-200"
                >
                  Anulează
                </Button>
                <Button
                  onClick={handleStergeDefinitiv}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg shadow-lg transition-all duration-200 font-bold"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  DA, Șterge!
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* LOG-URI OPERAȚII */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Log Operații
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-xs max-h-64 overflow-y-auto [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
              {logs.map((log, idx) => (
                <div key={idx} className="border-b border-slate-700 py-1 last:border-b-0">
                  {log}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 [--webkit-backdrop-filter:blur(4px)] [backdrop-filter:blur(4px)]">
          <Card className="bg-white shadow-2xl">
            <CardContent className="p-8">
              <div className="flex items-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <div className="text-lg font-semibold text-slate-700">Se procesează...</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
