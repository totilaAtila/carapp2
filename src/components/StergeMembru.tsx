import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { UserMinus, RotateCcw, Trash2, AlertTriangle, Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { getActiveDB, assertCanWrite } from '../services/databaseManager';

// Tipuri pentru TypeScript
interface AutoCompleteState {
  suggestions: string[];
  isVisible: boolean;
  selectedIndex: number;
  prefix: string;
}

interface MembruData {
  nr_fisa: string;
  nume: string;
  adresa: string;
  calitate: string;
  data_inscr: string;
}

interface IstoricTranzactie {
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

interface DatabaseConfig {
  db: 'membrii' | 'depcred' | 'activi' | 'inactivi' | 'lichidati' | 'chitante';
  table: string;
  key: string;
}

// Hook pentru debounce
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function StergeMembru({ databases }: { databases: any }) {
  // State pentru căutare
  const [numeSearch, setNumeSearch] = useState('');
  const [nrFisaSearch, setNrFisaSearch] = useState('');
  
  // State pentru auto-completare
  const [autoComplete, setAutoComplete] = useState<AutoCompleteState>({
    suggestions: [],
    isVisible: false,
    selectedIndex: -1,
    prefix: ''
  });
  
  // State pentru datele membrului
  const [membruData, setMembruData] = useState<MembruData | null>(null);
  const [istoric, setIstoric] = useState<IstoricTranzactie[]>([]);
  
  // State pentru UI
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showFooter, setShowFooter] = useState(true);
  
  // Refs pentru scroll sincronizat și input
  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);
  const numeInputRef = useRef<HTMLInputElement>(null);
  const autoCompleteRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Debounce pentru auto-completare
  const debouncedSearch = useDebounce(numeSearch, 300);
  
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
  
  // Efect pentru animații header la scroll
  useEffect(() => {
    const handleScroll = () => {
      if (headerRef.current) {
        const scrollY = window.scrollY;
        const opacity = Math.min(1, scrollY / 100);
        headerRef.current.style.boxShadow = `0 8px 25px rgba(0, 0, 0, ${0.15 + opacity * 0.2})`;
        headerRef.current.style.transform = `translateY(-${Math.min(scrollY * 0.1, 10)}px)`;
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Efect pentru auto-completare debounced
  useEffect(() => {
    if (debouncedSearch.length >= 2) {
      handleAutoComplete(debouncedSearch);
    } else {
      setAutoComplete({ suggestions: [], isVisible: false, selectedIndex: -1, prefix: debouncedSearch });
    }
  }, [debouncedSearch]);

  const pushLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
    setShowFooter(false);
  }, []);
  
  // Funcție pentru sincronizare scroll între toate coloanele
  const handleScroll = useCallback((sourceIdx: number, e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    scrollRefs.current.forEach((ref, idx) => {
      if (ref && idx !== sourceIdx && Math.abs(ref.scrollTop - scrollTop) > 1) {
        ref.scrollTop = scrollTop;
      }
    });
  }, []);
  
  // Auto-completare cu prefix
  const handleAutoComplete = useCallback(async (prefix: string) => {
    try {
      const result = getActiveDB(databases, 'membrii').exec(`
        SELECT NUM_PREN FROM membrii 
        WHERE NUM_PREN LIKE ? COLLATE NOCASE 
        ORDER BY NUM_PREN LIMIT 50
      `, [`${prefix}%`]);
      
      const suggestions = result.length > 0 ? result[0].values.map((row: any[]) => String(row[0])) : [];
      setAutoComplete({
        suggestions,
        isVisible: suggestions.length > 0,
        selectedIndex: -1,
        prefix
      });
    } catch (error) {
      console.error('Eroare auto-completare:', error);
      pushLog(`❌ Eroare auto-completare: ${error}`);
      setAutoComplete({ suggestions: [], isVisible: false, selectedIndex: -1, prefix });
    }
  }, [databases, pushLog]);
  
  // Gestionare input căutare nume
  const handleNumeSearchChange = (value: string) => {
    setNumeSearch(value);
  };
  
  // Selectare sugestie auto-completare
  const handleSelectSuggestion = (suggestion: string) => {
    setNumeSearch(suggestion);
    setAutoComplete(prev => ({ ...prev, isVisible: false }));
    handleCautaMembru('nume', suggestion);
  };
  
  // Navigare prin sugestii cu taste
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
  
  // Căutare membru (după nr_fisa sau nume)
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
      let query = '';
      let params: string[] = [];
      
      if (type === 'fisa') {
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
      } else {
        alert('❌ Membrul nu a fost găsit în baza de date!');
        pushLog('❌ MEMBRU NEGĂSIT');
        setMembruData(null);
        setIstoric([]);
        setShowFooter(true);
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
        const istoricData: IstoricTranzactie[] = result[0].values.map((row: any[]) => ({
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
    setNumeSearch('');
    setNrFisaSearch('');
    setMembruData(null);
    setIstoric([]);
    setLogs([]);
    setShowConfirmDialog(false);
    setAutoComplete({ suggestions: [], isVisible: false, selectedIndex: -1, prefix: '' });
    setShowFooter(true);
    
    setTimeout(() => {
      if (numeInputRef.current) {
        numeInputRef.current.focus();
      }
    }, 100);
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
      const databasesToProcess: DatabaseConfig[] = [
        { db: 'membrii', table: 'MEMBRII', key: 'NR_FISA' },
        { db: 'depcred', table: 'DEPCRED', key: 'NR_FISA' },
        { db: 'activi', table: 'ACTIVI', key: 'NR_FISA' },
        { db: 'inactivi', table: 'inactivi', key: 'nr_fisa' },
        { db: 'lichidati', table: 'lichidati', key: 'nr_fisa' }
      ];
      
      for (const { db, table, key } of databasesToProcess) {
        try {
          pushLog(`Ștergere din ${table}...`);
          getActiveDB(databases, db).run(
            `DELETE FROM ${table} WHERE ${key} = ?`,
            [nrFisa]
          );
          successes.push(`✅ Șters din ${table}`);
          pushLog(`✅ Șters din ${table}`);
        } catch (e: any) {
          const errorMsg = `⚠️ Eroare la ștergere din ${table}: ${e.message || e}`;
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
        
        // Verificare completă a ștergerii
        pushLog('');
        pushLog('🔍 VERIFICARE COMPLETĂ A ȘTERGERII...');
        await verificaStergereCompleta(nrFisa);
        
        alert(`✅ Membrul ${membruData.nume} (Nr. Fișă ${nrFisa}) a fost șters definitiv!`);
        handleGoleste();
      }
    } catch (error: any) {
      pushLog('');
      pushLog(`❌ EROARE LA ȘTERGERE: ${error.message || error}`);
      alert(`❌ Eroare la ștergere: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Verificare completă a ștergerii
  const verificaStergereCompleta = async (nrFisa: string) => {
    try {
      const databasesToVerify: DatabaseConfig[] = [
        { db: 'membrii', table: 'MEMBRII', key: 'NR_FISA' },
        { db: 'depcred', table: 'DEPCRED', key: 'NR_FISA' },
        { db: 'activi', table: 'ACTIVI', key: 'NR_FISA' },
        { db: 'inactivi', table: 'inactivi', key: 'nr_fisa' },
        { db: 'lichidati', table: 'lichidati', key: 'nr_fisa' }
      ];
      
      for (const { db, table, key } of databasesToVerify) {
        try {
          const result = getActiveDB(databases, db).exec(
            `SELECT COUNT(*) as count FROM ${table} WHERE ${key} = ?`,
            [nrFisa]
          );
          
          if (result.length > 0 && result[0].values.length > 0) {
            const count = result[0].values[0][0];
            if (count > 0) {
              pushLog(`⚠️ Găsite ${count} înregistrări rămase în ${table}`);
            } else {
              pushLog(`✅ Curățat complet din ${table}`);
            }
          } else {
            pushLog(`ℹ️ Tabelul ${table} nu a putut fi verificat`);
          }
        } catch (e: any) {
          pushLog(`❓ Nu s-a putut verifica ${table}: ${e.message || e}`);
        }
      }
    } catch (error: any) {
      pushLog(`❌ Eroare la verificarea ștergerii: ${error.message || error}`);
    }
  };
  
  // Format pentru display valori financiare
  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  
  // Format pentru display luna-an
  const formatLunaAn = (luna: number, anul: number) => {
    return `${String(luna).padStart(2, '0')}-${anul}`;
  };

  // Funcție pentru setarea ref-urilor de scroll
  const setScrollRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    scrollRefs.current[index] = el;
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 relative overflow-hidden">
      {/* Decorativ background elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-300 rounded-full opacity-10 -z-10 animate-blob" style={{ filter: 'blur(100px)' }} />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-red-300 rounded-full opacity-10 -z-10 animate-blob animation-delay-2000" style={{ filter: 'blur(100px)' }} />
      
      <Card ref={headerRef} className="border-3 border-blue-600 bg-gradient-to-br from-blue-50 to-blue-300/20 shadow-xl mb-6 overflow-hidden premium-section">
        <CardHeader className="bg-gradient-to-r from-blue-100 to-blue-300 border-b-3 border-blue-500 premium-header">
          <CardTitle className="flex items-center gap-3 text-blue-900 font-extrabold text-2xl tracking-tight">
            <div className="w-3 h-3 bg-blue-900 rounded-full shadow-lg" />
            <UserMinus className="h-8 w-8 text-blue-800 drop-shadow-md" /> 
            Ștergere Membru CAR
            <div className="w-3 h-3 bg-blue-900 rounded-full shadow-lg" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 bg-white/50 backdrop-blur-sm">
          <div className="space-y-6">
            {/* Rândul 1: Căutare Nume și Nr. Fișă */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-end">
              {/* Coloana 1: Nume Prenume */}
              <div className="space-y-3">
                <Label htmlFor="nume-search" className="block text-sm font-bold text-slate-800 bg-gradient-to-b from-slate-100 to-slate-200 p-2 rounded-t-lg border-b-2 border-slate-300 shadow-sm">
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
                    className="w-full border-3 border-blue-400 rounded-xl focus:border-blue-600 focus:ring-3 focus:ring-blue-300 transition-all duration-300 shadow-md"
                    placeholder="Căutare după nume..."
                    disabled={loading}
                    onFocus={(e) => e.target.select()}
                  />
                  {numeSearch && (
                    <button
                      onClick={() => setNumeSearch('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors duration-200 z-10"
                    >
                      <X className="h-5 w-5 hover:scale-125 transition-transform duration-200" />
                    </button>
                  )}
                  {autoComplete.isVisible && autoComplete.suggestions.length > 0 && (
                    <div
                      className="absolute z-50 w-full mt-2 bg-white border-3 border-blue-400 rounded-xl shadow-2xl max-h-72 overflow-y-auto"
                      style={{
                        background: 'linear-gradient(to bottom, #f0f9ff, #dbeafe)',
                        backdropFilter: 'blur(10px)'
                      }}
                    >
                      {autoComplete.suggestions.map((suggestion, index) => (
                        <div
                          key={`suggestion-${suggestion}-${index}`}
                          className={`px-4 py-3 cursor-pointer transition-all duration-200 ${
                            index === autoComplete.selectedIndex
                              ? 'bg-blue-200 border-l-4 border-blue-700 text-blue-900 shadow-md'
                              : 'hover:bg-blue-100 text-slate-800'
                          } ${index > 0 ? 'border-t-2 border-slate-200' : ''} hover:translate-x-1`}
                          onClick={() => handleSelectSuggestion(suggestion)}
                          onMouseEnter={() => setAutoComplete(prev => ({ ...prev, selectedIndex: index }))}
                        >
                          <div className="font-semibold text-lg flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            {suggestion}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Coloana 2: Număr Fișă */}
              <div className="space-y-3">
                <Label htmlFor="fisa-search" className="block text-sm font-bold text-slate-800 bg-gradient-to-b from-slate-100 to-slate-200 p-2 rounded-t-lg border-b-2 border-slate-300 shadow-sm">
                  Număr Fișă:
                </Label>
                <Input
                  id="fisa-search"
                  type="text"
                  value={nrFisaSearch}
                  onChange={(e) => setNrFisaSearch(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCautaMembru('fisa')}
                  className="w-full border-3 border-blue-400 rounded-xl focus:border-blue-600 focus:ring-3 focus:ring-blue-300 transition-all duration-300 shadow-md"
                  placeholder="Căutare după fișă..."
                  disabled={loading}
                  inputMode="numeric"
                />
              </div>
              
              {/* Coloana 3: Buton Căutare */}
              <div className="space-y-3">
                <Label className="block text-sm font-bold text-slate-800 bg-gradient-to-b from-slate-100 to-slate-200 p-2 rounded-t-lg border-b-2 border-slate-300 shadow-sm opacity-0">
                  Spațiu gol
                </Label>
                <Button
                  onClick={() => {
                    if (numeSearch.trim() !== '') handleCautaMembru('nume');
                    else if (nrFisaSearch.trim() !== '') handleCautaMembru('fisa');
                  }}
                  disabled={loading || (!numeSearch.trim() && !nrFisaSearch.trim())}
                  className="w-full bg-gradient-to-b from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white py-4 rounded-xl shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed border-3 border-blue-700"
                >
                  <Search className="h-5 w-5 mr-2 animate-pulse" />
                  {loading ? 'Se caută...' : 'Caută Membru'}
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400/30 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </Button>
              </div>
              
              {/* Coloana 4: Goală pentru aliniere */}
              <div className="space-y-3" />
            </div>
            
            {/* Afișare informații membru */}
            {membruData && (
              <>
                {/* Rândul 2: Adresa și Calitate + Butoane */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-end">
                  {/* Coloana 1: Adresa */}
                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-slate-800 bg-gradient-to-b from-slate-100 to-slate-200 p-2 rounded-t-lg border-b-2 border-slate-300 shadow-sm block">
                      Adresa:
                    </Label>
                    <Input
                      value={membruData.adresa}
                      readOnly
                      className="w-full bg-gradient-to-br from-slate-50 to-slate-100 border-3 border-slate-300 rounded-xl text-slate-800 font-medium focus:border-slate-400 transition-all duration-300 shadow-inner"
                    />
                  </div>
                  
                  {/* Coloana 2: Calitatea */}
                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-slate-800 bg-gradient-to-b from-slate-100 to-slate-200 p-2 rounded-t-lg border-b-2 border-slate-300 shadow-sm block">
                      Calitatea:
                    </Label>
                    <Input
                      value={membruData.calitate}
                      readOnly
                      className="w-full bg-gradient-to-br from-slate-50 to-slate-100 border-3 border-slate-300 rounded-xl text-slate-800 font-medium focus:border-slate-400 transition-all duration-300 shadow-inner"
                    />
                  </div>
                  
                  {/* Coloana 3: Buton Reset */}
                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-slate-800 bg-gradient-to-b from-slate-100 to-slate-200 p-2 rounded-t-lg border-b-2 border-slate-300 shadow-sm block opacity-0">
                      Spațiu gol
                    </Label>
                    <Button
                      onClick={handleGoleste}
                      className="w-full bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-4 rounded-xl shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 border-3 border-orange-600"
                    >
                      <RotateCcw className="h-5 w-5 mr-2 animate-spin-slow" />
                      Golește formular
                    </Button>
                  </div>
                  
                  {/* Coloana 4: Buton Ștergere */}
                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-slate-800 bg-gradient-to-b from-slate-100 to-slate-200 p-2 rounded-t-lg border-b-2 border-slate-300 shadow-sm block opacity-0">
                      Spațiu gol
                    </Label>
                    <Button
                      onClick={handleInitiereStergere}
                      disabled={!membruData || loading}
                      className="w-full bg-gradient-to-b from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 text-white py-4 rounded-xl shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed border-3 border-red-700 animate-pulse-danger"
                    >
                      <Trash2 className="h-5 w-5 mr-2 animate-bounce" />
                      ⚠️ Șterge Definitiv
                    </Button>
                  </div>
                </div>
                
                {/* Rândul 3: Data Înscrierii */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-end">
                  {/* Coloana 1: Data Înscrierii */}
                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-slate-800 bg-gradient-to-b from-slate-100 to-slate-200 p-2 rounded-t-lg border-b-2 border-slate-300 shadow-sm block">
                      Data înscrierii:
                    </Label>
                    <Input
                      value={membruData.data_inscr}
                      readOnly
                      className="w-full bg-gradient-to-br from-slate-50 to-slate-100 border-3 border-slate-300 rounded-xl text-slate-800 font-medium focus:border-slate-400 transition-all duration-300 shadow-inner"
                    />
                  </div>
                  
                  {/* Coloanele 2, 3, 4: Goale pentru aliniere */}
                  <div className="space-y-3" />
                  <div className="space-y-3" />
                  <div className="space-y-3" />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* ISTORIC FINANCIAR - DOAR DACĂ AVEM DATE */}
      {membruData && istoric.length > 0 && (
        <>
          {/* Versiune DESKTOP */}
          <Card className="hidden lg:block border-0 shadow-2xl mb-8 premium-section">
            <CardHeader className="bg-gradient-to-r from-slate-100 to-slate-300 border-b-3 border-slate-400 pb-4 premium-header">
              <CardTitle className="text-xl font-extrabold text-slate-800 flex items-center gap-4">
                <div className="w-4 h-4 bg-blue-600 rounded-full drop-shadow-md" />
                Istoric Financiar - <span className="text-blue-700">{membruData.nume}</span>
                <span className="text-slate-600 ml-2"> (Fișa: {membruData.nr_fisa})</span>
                <div className="w-4 h-4 bg-blue-600 rounded-full drop-shadow-md" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[4fr_1fr_3fr] gap-5 p-6">
                {/* Secțiunea Împrumuturi */}
                <div className="border-[4px] border-[#e74c3c] rounded-2xl overflow-hidden bg-gradient-to-b from-red-50/90 to-red-100/80 shadow-2xl premium-section">
                  <div className="text-center font-extrabold text-slate-800 py-4 bg-gradient-to-b from-red-200 to-red-300 border-b-3 border-red-400 text-lg shadow-md premium-header">
                    Situație Împrumuturi
                  </div>
                  <div className="grid grid-cols-4 gap-0 bg-red-200/70 backdrop-blur-sm">
                    {['Dobândă', 'Împrumut', 'Rată Achitată', 'Sold Împrumut'].map((title, colIndex) => (
                      <div key={`impr-header-${title}`} className="flex flex-col">
                        <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-3 text-center font-bold text-sm text-slate-800 border-b-3 border-slate-400 shadow-inner">
                          {title}
                        </div>
                        <div
                          ref={setScrollRef(colIndex)}
                          onScroll={(e) => handleScroll(colIndex, e)}
                          className="h-[450px] overflow-y-auto bg-white/90 backdrop-blur-sm [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
                          style={{
                            scrollbarWidth: 'thin',
                            scrollbarColor: '#e2e8f0 #f8fafc'
                          }}
                        >
                          <div className="divide-y divide-slate-200">
                            {istoric.map((tranz, idx) => (
                              <div
                                key={`impr-${colIndex}-${tranz.luna}-${tranz.anul}-${idx}`}
                                className={`p-3 text-center text-base hover:bg-blue-50 font-mono transition-colors duration-200 ${colIndex === 3 ? 'text-red-600 font-bold' : ''}`}
                              >
                                {formatCurrency(
                                  colIndex === 0 ? tranz.dobanda :
                                  colIndex === 1 ? tranz.impr_deb :
                                  colIndex === 2 ? tranz.impr_cred :
                                  tranz.impr_sold
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Secțiunea Dată */}
                <div className="border-[4px] border-[#6c757d] rounded-2xl overflow-hidden bg-gradient-to-b from-slate-50/90 to-slate-100/80 shadow-2xl premium-section">
                  <div className="text-center font-extrabold text-slate-800 py-4 bg-gradient-to-b from-slate-300 to-slate-400 border-b-3 border-slate-500 text-lg shadow-md premium-header">
                    Dată
                  </div>
                  <div className="flex flex-col">
                    <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-3 text-center font-bold text-sm text-slate-800 border-b-3 border-slate-400 shadow-inner">
                      Luna-An
                    </div>
                    <div
                      ref={setScrollRef(4)}
                      onScroll={(e) => handleScroll(4, e)}
                      className="h-[450px] overflow-y-auto bg-white/90 backdrop-blur-sm [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#e2e8f0 #f8fafc'
                      }}
                    >
                      <div className="divide-y divide-slate-200">
                        {istoric.map((tranz, idx) => (
                          <div
                            key={`luna-an-${tranz.luna}-${tranz.anul}-${idx}`}
                            className="p-3 text-center text-base font-semibold hover:bg-green-50 transition-colors duration-200"
                          >
                            {formatLunaAn(tranz.luna, tranz.anul)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Secțiunea Depuneri */}
                <div className="border-[4px] border-[#28a745] rounded-2xl overflow-hidden bg-gradient-to-b from-green-50/90 to-green-100/80 shadow-2xl premium-section">
                  <div className="text-center font-extrabold text-slate-800 py-4 bg-gradient-to-b from-green-200 to-green-300 border-b-3 border-green-500 text-lg shadow-md premium-header">
                    Situație Depuneri
                  </div>
                  <div className="grid grid-cols-3 gap-0 bg-green-200/70 backdrop-blur-sm">
                    {['Cotizație', 'Retragere Fond', 'Sold Depunere'].map((title, colIndex) => (
                      <div key={`dep-header-${title}`} className="flex flex-col">
                        <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-3 text-center font-bold text-sm text-slate-800 border-b-3 border-slate-400 shadow-inner">
                          {title}
                        </div>
                        <div
                          ref={setScrollRef(5 + colIndex)}
                          onScroll={(e) => handleScroll(5 + colIndex, e)}
                          className="h-[450px] overflow-y-auto bg-white/90 backdrop-blur-sm [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
                          style={{
                            scrollbarWidth: 'thin',
                            scrollbarColor: '#e2e8f0 #f8fafc'
                          }}
                        >
                          <div className="divide-y divide-slate-200">
                            {istoric.map((tranz, idx) => (
                              <div
                                key={`dep-${colIndex}-${tranz.luna}-${tranz.anul}-${idx}`}
                                className={`p-3 text-center text-base hover:bg-purple-50 font-mono transition-colors duration-200 ${colIndex === 2 ? 'text-green-700 font-bold' : ''}`}
                              >
                                {formatCurrency(
                                  colIndex === 0 ? tranz.dep_deb :
                                  colIndex === 1 ? tranz.dep_cred :
                                  tranz.dep_sold
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
              <div className="mt-4 text-center text-sm text-slate-600 pb-4 flex items-center justify-center gap-3">
                <ChevronUp className="h-5 w-5 text-blue-600 animate-bounce" />
                ↕️ Scroll-ul este sincronizat între toate coloanele
                <ChevronDown className="h-5 w-5 text-blue-600 animate-bounce" />
              </div>
            </CardContent>
          </Card>
          
          {/* Versiune MOBIL */}
          <div className="lg:hidden space-y-5 mb-8">
            <Card className="shadow-2xl premium-section">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b-3 border-blue-200 premium-header">
                <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-3">
                  <div className="w-3 h-3 bg-blue-500 rounded-full drop-shadow" />
                  Istoric Financiar - <span className="text-blue-700">{membruData.nume}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="space-y-5">
                  {istoric.map((tranz, idx) => (
                    <div key={`mobile-${tranz.luna}-${tranz.anul}-${idx}`} className="border-3 border-slate-300 rounded-2xl p-5 bg-white shadow-md">
                      <div className="text-center font-bold text-xl text-slate-800 mb-4 pb-3 border-b-3 border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-xl -mx-5 -mt-5 p-4 shadow-inner premium-header">
                        {formatLunaAn(tranz.luna, tranz.anul)}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Împrumuturi */}
                        <div className="p-4 bg-red-50/80 rounded-xl border-3 border-red-200 backdrop-blur-sm">
                          <div className="font-bold text-lg text-red-800 mb-4 flex items-center gap-3">
                            <div className="w-4 h-4 bg-red-500 rounded-full shadow-md" />
                            ÎMPRUMUTURI
                          </div>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border-2">
                              <span className="text-slate-700 font-medium text-lg">Dobândă:</span>
                              <span className="font-bold font-mono text-lg text-red-600">{formatCurrency(tranz.dobanda)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border-2">
                              <span className="text-slate-700 font-medium text-lg">Împrumut:</span>
                              <span className="font-bold font-mono text-lg">{formatCurrency(tranz.impr_deb)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border-2">
                              <span className="text-slate-700 font-medium text-lg">Rată Achitată:</span>
                              <span className="font-bold font-mono text-lg text-green-700">{formatCurrency(tranz.impr_cred)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border-2">
                              <span className="text-slate-700 font-medium text-lg">Sold:</span>
                              <span className="font-bold font-mono text-xl text-red-700">{formatCurrency(tranz.impr_sold)}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Depuneri */}
                        <div className="p-4 bg-green-50/80 rounded-xl border-3 border-green-200 backdrop-blur-sm">
                          <div className="font-bold text-lg text-green-800 mb-4 flex items-center gap-3">
                            <div className="w-4 h-4 bg-green-500 rounded-full shadow-md" />
                            DEPUNERI
                          </div>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border-2">
                              <span className="text-slate-700 font-medium text-lg">Cotizație:</span>
                              <span className="font-bold font-mono text-lg text-blue-700">{formatCurrency(tranz.dep_deb)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border-2">
                              <span className="text-slate-700 font-medium text-lg">Retragere Fond:</span>
                              <span className="font-bold font-mono text-lg text-orange-700">{formatCurrency(tranz.dep_cred)}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border-2">
                              <span className="text-slate-700 font-medium text-lg">Sold Depunere:</span>
                              <span className="font-bold font-mono text-xl text-green-700">{formatCurrency(tranz.dep_sold)}</span>
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
      
      {/* Dialog confirmare ștergere */}
      {showConfirmDialog && membruData && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <Card className="max-w-2xl w-full border-4 border-red-700 shadow-2xl animate-scale-in">
            <CardHeader className="bg-gradient-to-b from-red-100 to-red-300 border-b-4 border-red-400 premium-header">
              <CardTitle className="flex items-center gap-4 text-red-900 text-2xl font-extrabold tracking-tight">
                <AlertTriangle className="h-10 w-10 text-red-700 drop-shadow-lg" />
                ⚠️ ATENȚIE MAXIMĂ
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <Alert className="border-4 border-red-600 bg-red-50/90 backdrop-blur-sm">
                <AlertDescription className="text-red-900 font-extrabold text-2xl text-center py-3 animate-pulse">
                  ACȚIUNE IREVERSIBILĂ!
                </AlertDescription>
              </Alert>
              <div className="space-y-5 text-lg">
                <p className="font-bold text-slate-800 text-center">Sunteți sigur că doriți să ștergeți DEFINITIV membrul:</p>
                <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-200 rounded-2xl border-4 border-slate-400 space-y-4 shadow-xl">
                  <div className="flex justify-between items-center">
                    <strong className="text-xl text-slate-800">Nr. Fișă:</strong>
                    <span className="font-mono font-extrabold text-2xl text-blue-800">{membruData.nr_fisa}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <strong className="text-xl text-slate-800">Nume:</strong>
                    <span className="font-bold text-2xl text-blue-900">{membruData.nume}</span>
                  </div>
                  <div>
                    <strong className="text-xl text-slate-800 block mb-2">Adresă:</strong>
                    <div className="text-slate-700 text-lg p-3 bg-white rounded-xl border-2 border-slate-300 shadow-inner">
                      {membruData.adresa}
                    </div>
                  </div>
                </div>
                <p className="text-red-800 font-extrabold text-center border-4 border-red-300 bg-red-50/90 p-5 rounded-2xl text-xl leading-relaxed shadow-lg animate-shake">
                  🗑️ Toate datele vor fi eliminate DEFINITIV din toate tabelele bazei de date!
                  <br />
                  <span className="text-base font-normal text-red-700 block mt-2">Această acțiune NU poate fi anulată!</span>
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-6 pt-6">
                <Button
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 bg-gradient-to-b from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white py-4 rounded-2xl shadow-2xl transition-all duration-300 text-lg font-bold hover:shadow-3xl hover:-translate-y-1"
                >
                  Anulează
                </Button>
                <Button
                  onClick={handleStergeDefinitiv}
                  className="flex-1 bg-gradient-to-b from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 text-white py-4 rounded-2xl shadow-2xl transition-all duration-300 text-lg font-extrabold border-4 border-red-700 hover:shadow-3xl hover:-translate-y-1 animate-pulse-danger"
                >
                  <Trash2 className="h-6 w-6 mr-3 animate-bounce" />
                  DA, Șterge DEFINITIV!
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Log-uri operații */}
      {(logs.length > 0 || showFooter) && (
        <Card className="mt-6 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-green-50 to-green-200 border-b-3 border-green-300">
            <CardTitle className="text-lg font-bold flex items-center gap-3 text-green-900">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              {logs.length > 0 ? "Log Operații" : "Informații Sistem"}
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length > 0 ? (
              <div className="bg-slate-900 text-green-400 p-5 rounded-xl font-mono text-sm max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-green-500 scrollbar-track-slate-800">
                {logs.map((log, idx) => (
                  <div
                    key={`log-${idx}`}
                    className={`border-b border-slate-800 py-2 ${idx === logs.length - 1 ? 'border-b-0' : ''} ${
                      log.includes('✅') ? 'text-green-300' : log.includes('⚠️') || log.includes('❌') ? 'text-red-300' : 'text-blue-300'
                    } hover:bg-slate-800/50 transition-colors`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl border-2 border-blue-300">
                <UserMinus className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-float" />
                <h3 className="text-xl font-bold text-slate-800 mb-2">Ștergere Membru CAR</h3>
                <p className="text-slate-600 text-lg">Introduceți numele sau numărul fișei membrului pentru a începe procesul de ștergere</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm">
          <Card className="bg-white shadow-2xl border-4 border-blue-600 animate-scale-in">
            <CardContent className="p-10">
              <div className="flex flex-col items-center gap-5">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 border-t-4 border-blue-300 shadow-lg" />
                <div className="text-2xl font-extrabold text-slate-800 text-center">Se procesează...</div>
                <div className="text-lg text-slate-600 text-center max-w-md">
                  Acest proces poate dura câteva momente. Vă rugăm să așteptați...
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
