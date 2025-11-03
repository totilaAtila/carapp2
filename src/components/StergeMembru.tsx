import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { UserMinus, RotateCcw, Trash2, AlertTriangle, Search, X } from 'lucide-react';

// Interfețe pentru tipuri
interface DBSet {
  [key: string]: any;
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

// Mock functions pentru a evita erorile de compilare
const getActiveDB = (databases: DBSet, dbName: string) => {
  return {
    exec: (query: string, params: any[] = []) => {
      console.log('Executing query:', query, params);
      return [];
    },
    run: (query: string, params: any[] = []) => {
      console.log('Running query:', query, params);
    }
  };
};

const assertCanWrite = (databases: DBSet, operation: string) => {
  console.log('Checking write permissions for:', operation);
};

// Componenta principală
const StergeMembru: React.FC<{ databases: DBSet }> = ({ databases }) => {
  // State pentru căutare și auto-completare
  const [numeSearch, setNumeSearch] = useState('');
  const [nrFisaSearch, setNrFisaSearch] = useState('');
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
  const numeInputRef = useRef<HTMLInputElement>(null);
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

  // Auto-completare cu prefix pentru nume
  const handleAutoComplete = useCallback(async (prefix: string) => {
    if (prefix.length < 2) {
      setAutoComplete({ suggestions: [], isVisible: false, selectedIndex: -1, prefix });
      return;
    }

    try {
      // Mock data pentru auto-completare
      const mockSuggestions = [
        'Popescu Ion',
        'Popescu Maria',
        'Popa Vasile',
        'Popovici Ana'
      ].filter(name => 
        name.toLowerCase().startsWith(prefix.toLowerCase())
      );

      setAutoComplete({
        suggestions: mockSuggestions,
        isVisible: mockSuggestions.length > 0,
        selectedIndex: -1,
        prefix
      });
    } catch (error) {
      console.error('Eroare auto-completare:', error);
      setAutoComplete({ suggestions: [], isVisible: false, selectedIndex: -1, prefix });
    }
  }, []);

  // Gestionare input căutare nume
  const handleNumeSearchChange = (value: string) => {
    setNumeSearch(value);
    handleAutoComplete(value);
  };

  // Selectare sugestie auto-completare
  const handleSelectSuggestion = (suggestion: string) => {
    setNumeSearch(suggestion);
    setAutoComplete(prev => ({ ...prev, isVisible: false }));
    handleCautaMembru('nume', suggestion);
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
        } else if (numeSearch) {
          handleCautaMembru('nume', numeSearch);
        }
        break;
      case 'Escape':
        setAutoComplete(prev => ({ ...prev, isVisible: false }));
        break;
    }
  };

  // Căutare membru (după nume sau nr_fisa)
  const handleCautaMembru = async (type: 'nume' | 'fisa', specificTerm?: string) => {
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
      // Mock data pentru testare
      const mockMembru: MembruData = {
        nr_fisa: type === 'fisa' ? term : '123',
        nume: type === 'nume' ? term : 'Popescu Ion',
        adresa: 'Str. Principala, Nr. 1',
        calitate: 'Membru',
        data_inscr: '01-01-2023'
      };

      setMembruData(mockMembru);
      setNumeSearch(mockMembru.nume);
      setNrFisaSearch(mockMembru.nr_fisa);
      
      pushLog('✅ MEMBRU GĂSIT');
      pushLog(`Nr. Fișă: ${mockMembru.nr_fisa}`);
      pushLog(`Nume: ${mockMembru.nume}`);
      pushLog(`Adresă: ${mockMembru.adresa}`);
      pushLog('');
      pushLog('📋 Încărcare istoric financiar...');

      // Mock istoric financiar
      const mockIstoric: IstoricLine[] = [
        {
          luna: 1,
          anul: 2024,
          dobanda: '150.00',
          impr_deb: '1000.00',
          impr_cred: '200.00',
          impr_sold: '800.00',
          dep_deb: '500.00',
          dep_cred: '0.00',
          dep_sold: '500.00'
        },
        {
          luna: 2,
          anul: 2024,
          dobanda: '120.00',
          impr_deb: '0.00',
          impr_cred: '200.00',
          impr_sold: '600.00',
          dep_deb: '500.00',
          dep_cred: '0.00',
          dep_sold: '1000.00'
        }
      ];

      setIstoric(mockIstoric);
      pushLog(`✅ Istoric încărcat: ${mockIstoric.length} înregistrări`);

    } catch (error) {
      pushLog(`❌ Eroare căutare: ${error}`);
      alert(`❌ Eroare la căutare: ${error}`);
    } finally {
      setLoading(false);
      setAutoComplete(prev => ({ ...prev, isVisible: false }));
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
    if (!membruData) return;

    setLoading(true);
    setShowConfirmDialog(false);
    pushLog('');
    pushLog('🗑️ ȘTERGERE MEMBRU ÎN CURS...');
    pushLog(`Nr. Fișă: ${membruData.nr_fisa}`);
    pushLog(`Nume: ${membruData.nume}`);

    try {
      assertCanWrite(databases, 'Ștergere membru');

      const nrFisa = membruData.nr_fisa;
      const successes: string[] = [];

      // Mock ștergere din baze de date
      const databasesToProcess = [
        { db: 'membrii', table: 'MEMBRII' },
        { db: 'depcred', table: 'DEPCRED' },
        { db: 'activi', table: 'ACTIVI' },
        { db: 'inactivi', table: 'inactivi' },
        { db: 'lichidati', table: 'lichidati' }
      ];

      for (const { table } of databasesToProcess) {
        pushLog(`Ștergere din ${table}...`);
        successes.push(`✅ Șters din ${table}`);
        pushLog(`✅ Șters din ${table}`);
      }

      pushLog('');
      pushLog('✅ MEMBRU ȘTERS CU SUCCES!');
      pushLog(`Membru ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost eliminat din toate tabelele.`);
      
      alert(`✅ Membrul ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost șters definitiv!`);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      {/* HEADER PRINCIPAL - EXACT CA ÎN PYTHON */}
      <Card className="border-2 border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 shadow-xl mb-6">
        <CardContent className="p-6">
          {/* Grid Layout identic cu Python - 3 rânduri, 4 coloane */}
          <div className="space-y-4">
            
            {/* Rândul 1: Căutare Nume și Nr. Fișă */}
            <div className="grid grid-cols-4 gap-4 items-end">
              {/* Coloana 1: Nume Prenume */}
              <div className="space-y-2">
                <Label htmlFor="nume-search" className="text-sm font-bold text-slate-700 block">
                  Nume Prenume:
                </Label>
                <div className="relative" ref={autoCompleteRef}>
                  <Input
                    id="nume-search"
                    ref={numeInputRef}
                    type="text"
                    value={numeSearch}
                    onChange={(e) => handleNumeSearchChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                    placeholder="Căutare după nume..."
                    disabled={loading}
                  />
                  {numeSearch && (
                    <button
                      onClick={() => setNumeSearch('')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  
                  {/* Auto-completare Dropdown */}
                  {autoComplete.isVisible && autoComplete.suggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border-2 border-blue-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                      {autoComplete.suggestions.map((suggestion, index) => (
                        <div
                          key={suggestion}
                          className={`px-3 py-2 cursor-pointer transition-colors ${
                            index === autoComplete.selectedIndex 
                              ? 'bg-blue-100 border-l-4 border-blue-500 text-blue-800' 
                              : 'hover:bg-blue-50 text-slate-800'
                          } ${index > 0 ? 'border-t border-slate-100' : ''}`}
                          onClick={() => handleSelectSuggestion(suggestion)}
                          onMouseEnter={() => setAutoComplete(prev => ({ ...prev, selectedIndex: index }))}
                        >
                          <div className="font-medium">{suggestion}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Coloana 2: Număr Fișă */}
              <div className="space-y-2">
                <Label htmlFor="fisa-search" className="text-sm font-bold text-slate-700 block">
                  Număr Fișă:
                </Label>
                <Input
                  id="fisa-search"
                  type="text"
                  value={nrFisaSearch}
                  onChange={(e) => setNrFisaSearch(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCautaMembru('fisa')}
                  className="w-full border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                  placeholder="Căutare după fișă..."
                  disabled={loading}
                />
              </div>

              {/* Coloana 3: Buton Căutare */}
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700 block opacity-0">
                  Buton Căutare
                </Label>
                <Button
                  onClick={() => {
                    if (numeSearch) handleCautaMembru('nume');
                    else if (nrFisaSearch) handleCautaMembru('fisa');
                  }}
                  disabled={loading || (!numeSearch && !nrFisaSearch)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Search className="h-4 w-4 mr-2" />
                  {loading ? 'Se caută...' : 'Caută'}
                </Button>
              </div>

              {/* Coloana 4: Goală pentru aliniere */}
              <div></div>
            </div>

            {/* Rândul 2: Informații Membru și Butoane Acțiune */}
            <div className="grid grid-cols-4 gap-4 items-end">
              {/* Coloana 1: Adresa */}
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700 block">
                  Adresa:
                </Label>
                <Input
                  value={membruData?.adresa || ''}
                  readOnly
                  className="w-full bg-slate-50 border-2 border-slate-300 rounded-lg text-slate-700 focus:border-slate-400 transition-all duration-200"
                />
              </div>

              {/* Coloana 2: Calitate */}
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700 block">
                  Calitatea:
                </Label>
                <Input
                  value={membruData?.calitate || ''}
                  readOnly
                  className="w-full bg-slate-50 border-2 border-slate-300 rounded-lg text-slate-700 focus:border-slate-400 transition-all duration-200"
                />
              </div>

              {/* Coloana 3: Buton Reset */}
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700 block opacity-0">
                  Buton Reset
                </Label>
                <Button
                  onClick={handleGoleste}
                  className="w-full bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-2.5 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl border-2 border-orange-600"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Golește formular
                </Button>
              </div>

              {/* Coloana 4: Buton Ștergere */}
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700 block opacity-0">
                  Buton Ștergere
                </Label>
                <Button
                  onClick={handleInitiereStergere}
                  disabled={!membruData || loading}
                  className="w-full bg-gradient-to-b from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white py-2.5 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed border-2 border-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  ⚠️ Șterge Definitiv
                </Button>
              </div>
            </div>

            {/* Rândul 3: Data Înscrierii */}
            <div className="grid grid-cols-4 gap-4 items-end">
              {/* Coloana 1: Data Înscrierii */}
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700 block">
                  Data înscrierii:
                </Label>
                <Input
                  value={membruData?.data_inscr || ''}
                  readOnly
                  className="w-full bg-slate-50 border-2 border-slate-300 rounded-lg text-slate-700 focus:border-slate-400 transition-all duration-200"
                />
              </div>

              {/* Coloanele 2, 3, 4: Goale pentru aliniere */}
              <div></div>
              <div></div>
              <div></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ISTORIC FINANCIAR - 3 Secțiuni (DESKTOP) */}
      {membruData && istoric.length > 0 && (
        <>
          {/* Desktop Layout - IDENTIC CU PYTHON */}
          <Card className="hidden lg:block border-0 shadow-2xl mb-6">
            <CardHeader className="pb-4 border-b border-slate-200">
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                Istoric Financiar - {membruData.nume} (Fișa: {membruData.nr_fisa})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[4fr_1fr_3fr] gap-4 p-6">
                
                {/* Secțiunea Împrumuturi - Design 3D Glossy Roșu */}
                <div className="border-[3px] border-[#e74c3c] rounded-xl overflow-hidden bg-gradient-to-b from-red-50 to-red-100 shadow-lg">
                  <div className="text-center font-bold text-slate-800 py-3 bg-gradient-to-b from-red-200 to-red-300 border-b-2 border-red-400 text-sm">
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
                          className="h-[400px] overflow-y-auto bg-white [scrollbar-width:thin]"
                        >
                          <div className="divide-y divide-slate-200">
                            {istoric.map((tranz, idx) => (
                              <div
                                key={`impr-${colIndex}-${idx}`}
                                className="p-2 text-center text-sm hover:bg-blue-50 font-mono transition-colors duration-150"
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
                  <div className="text-center font-bold text-slate-800 py-3 bg-gradient-to-b from-slate-300 to-slate-400 border-b-2 border-slate-500 text-sm">
                    Dată
                  </div>
                  <div className="flex flex-col">
                    <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                      Luna-An
                    </div>
                    <div
                      ref={(el) => { scrollRefs.current[4] = el; }}
                      onScroll={(e) => handleScroll(4, e)}
                      className="h-[400px] overflow-y-auto bg-white [scrollbar-width:thin]"
                    >
                      <div className="divide-y divide-slate-200">
                        {istoric.map((tranz, idx) => (
                          <div
                            key={`luna-an-${idx}`}
                            className="p-2 text-center text-sm font-semibold hover:bg-green-50 transition-colors duration-150"
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
                  <div className="text-center font-bold text-slate-800 py-3 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-500 text-sm">
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
                          className="h-[400px] overflow-y-auto bg-white [scrollbar-width:thin]"
                        >
                          <div className="divide-y divide-slate-200">
                            {istoric.map((tranz, idx) => (
                              <div
                                key={`dep-${colIndex}-${idx}`}
                                className="p-2 text-center text-sm hover:bg-purple-50 font-mono transition-colors duration-150"
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
              <div className="mt-4 text-center text-xs text-slate-500 pb-4 flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                ↕️ Scroll-ul este sincronizat între toate coloanele
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              </div>
            </CardContent>
          </Card>

          {/* Mobile Layout - ÎMBUNĂTĂȚIT */}
          <div className="lg:hidden space-y-4 mb-6">
            <Card className="shadow-xl">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-200">
                <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  Istoric Financiar - {membruData.nume}
                </CardTitle>
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

      {/* LOG-URI OPERAȚII */}
      {logs.length > 0 && (
        <Card className="shadow-xl mb-6">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Log Operații
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="bg-slate-900 text-green-400 p-4 rounded-b-lg font-mono text-xs max-h-64 overflow-y-auto [scrollbar-width:thin]">
              {logs.map((log, idx) => (
                <div key={idx} className="border-b border-slate-700 py-1 last:border-b-0 hover:bg-slate-800 transition-colors">
                  {log}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* DIALOG CONFIRMARE ȘTERGERE */}
      {showConfirmDialog && membruData && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full border-4 border-red-600 shadow-2xl">
            <CardHeader className="bg-gradient-to-b from-red-100 to-red-200 border-b-2 border-red-300">
              <CardTitle className="flex items-center gap-3 text-red-800 text-xl font-bold">
                <AlertTriangle className="h-7 w-7 text-red-600" />
                ⚠️ ATENȚIE MAXIMĂ
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <Alert className="border-2 border-red-500 bg-red-50">
                <AlertDescription className="text-red-900 font-bold text-center text-lg">
                  ACȚIUNE IREVERSIBILĂ!
                </AlertDescription>
              </Alert>

              <div className="space-y-4 text-sm">
                <p className="font-semibold text-slate-800 text-center text-base">
                  Sunteți sigur că doriți să ștergeți DEFINITIV membrul:
                </p>
                <div className="p-4 bg-slate-100 rounded-xl border-2 border-slate-300 space-y-3 shadow-inner">
                  <div className="flex justify-between items-center">
                    <strong className="text-slate-700">Nr. Fișă:</strong>
                    <span className="font-mono font-bold text-slate-900">{membruData.nr_fisa}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <strong className="text-slate-700">Nume:</strong>
                    <span className="font-semibold text-slate-900">{membruData.nume}</span>
                  </div>
                  <div>
                    <strong className="text-slate-700">Adresă:</strong>
                    <div className="text-slate-700 mt-1 text-sm bg-white p-2 rounded border">{membruData.adresa}</div>
                  </div>
                </div>
                <p className="text-red-700 font-bold text-center border-2 border-red-200 bg-red-50 p-3 rounded-lg text-sm leading-relaxed">
                  🗑️ Toate datele vor fi eliminate DEFINITIV din toate tabelele bazei de date!
                  <br />
                  <span className="text-xs">Această acțiune NU poate fi anulată!</span>
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 bg-slate-600 hover:bg-slate-700 text-white py-3 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl font-semibold"
                >
                  Anulează
                </Button>
                <Button
                  onClick={handleStergeDefinitiv}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl font-bold border-2 border-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  DA, Șterge!
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <Card className="bg-white shadow-2xl border-2 border-blue-500">
            <CardContent className="p-8">
              <div className="flex items-center gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                <div className="text-lg font-semibold text-slate-700">Se procesează...</div>
              </div>
              <div className="mt-4 text-center text-sm text-slate-500">
                Acest proces poate dura câteva momente
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Footer Informativ */}
      {!membruData && (
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-100 border-2 border-blue-300 shadow-lg">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <UserMinus className="h-6 w-6 text-blue-600" />
              <h3 className="text-lg font-bold text-slate-800">Ștergere Membru CAR</h3>
            </div>
            <p className="text-slate-600 text-sm">
              Introduceți numele sau numărul fișei membrului pentru a începe procesul de ștergere
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StergeMembru;
