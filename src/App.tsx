import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import GenerareLuna from './components/GenerareLuna';
import VizualizareLunara from './components/VizualizareLunara';
import VizualizareAnuala from './components/VizualizareAnuala';
import SumeLunare from './components/SumeLunare';
import AdaugaMembru from './components/AdaugaMembru';
import StergeMembru from './components/StergeMembru';
import Dividende from './components/Dividende';
import Statistici from './components/Statistici'; // ← nou
import Listari from './components/Listari';
import Conversion from './components/Conversion'; // ← nou
import Taskbar from './components/Taskbar';
import UpdatePrompt from './components/UpdatePrompt';
import type { DBSet } from './services/databaseManager';

type AppState = 'loading' | 'needs-setup' | 'ready';
type ModuleId =
  | 'dashboard'
  | 'generare-luna'
  | 'sume-lunare'
  | 'vizualizare-lunara'
  | 'vizualizare-anuala'
  | 'adauga-membru'
  | 'sterge-membru'
  | 'dividende'
  | 'statistici'
  | 'listari'
  | 'conversion';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [databases, setDatabases] = useState<DBSet | null>(null);
  const [currentModule, setCurrentModule] = useState<ModuleId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setAppState('needs-setup');
    }, 500);
  }, []);

  function handleDatabasesLoaded(dbs: DBSet) {
    setDatabases(dbs);
    setAppState('ready');
    setCurrentModule('dashboard');
  }

  function handleChangeDatabaseSource() {
    setDatabases(null);
    setAppState('needs-setup');
    setCurrentModule('dashboard');
  }

  function handleModuleSelect(moduleId: string) {
    setCurrentModule(moduleId as ModuleId);
    setSidebarOpen(false);
  }

  function handleCurrencyChange(currency: "RON" | "EUR") {
    if (!databases) return;
    const updatedDatabases = { ...databases, activeCurrency: currency };
    setDatabases(updatedDatabases);
    console.log(`🔄 Modul activ: ${currency}`);
  }

  // --- Loading State ---
  if (appState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100">
        <div className="text-6xl mb-4 animate-pulse">🏦</div>
        <div className="text-xl text-slate-600">Încărcare CARapp...</div>
      </div>
    );
  }

  // --- Setup State ---
  if (appState === 'needs-setup') {
    return <LandingPage onDatabasesLoaded={handleDatabasesLoaded} />;
  }

  // --- Main App State ---
  return (
    <div className="relative min-h-screen bg-slate-100">
      <div className="min-h-screen pb-[60px]">
        <div className="w-full h-full p-4 md:p-6">
          {currentModule === 'generare-luna' && databases && (
            <GenerareLuna
              databases={databases}
              onBack={() => setCurrentModule('dashboard')}
            />
          )}

          {currentModule === 'vizualizare-lunara' && databases && (
            <VizualizareLunara
              databases={databases}
              onBack={() => setCurrentModule('dashboard')}
            />
          )}

          {currentModule === 'vizualizare-anuala' && databases && (
            <VizualizareAnuala
              databases={databases}
              onBack={() => setCurrentModule('dashboard')}
            />
          )}

          {currentModule === 'sume-lunare' && databases && (
            <SumeLunare
              databases={databases}
              onBack={() => setCurrentModule('dashboard')}
            />
          )}

          {currentModule === 'adauga-membru' && databases && (
            <AdaugaMembru databases={databases} />
          )}

          {currentModule === 'sterge-membru' && databases && (
            <StergeMembru databases={databases} />
          )}

          {currentModule === 'dashboard' && databases && (
            <Dashboard
              databases={databases}
              onModuleSelect={(module) => setCurrentModule(module as ModuleId)}
              onChangeDatabaseSource={handleChangeDatabaseSource}
            />
          )}

          {currentModule === 'dividende' && databases && (
            <Dividende
              databases={databases}
              onBack={() => setCurrentModule('dashboard')}
            />
          )}

          {currentModule === 'statistici' && databases && (
            <Statistici
              databases={databases}
              onBack={() => setCurrentModule('dashboard')}
            />
          )}

          {currentModule === 'listari' && databases && (
            <Listari
              databases={databases}
              onBack={() => setCurrentModule('dashboard')}
            />
          )}

          {currentModule === 'conversion' && databases && (
            <Conversion
              databases={databases}
              onBack={() => setCurrentModule('dashboard')}
            />
          )}

          {/* Placeholder pentru module neimplementate */}
          {databases && ![
            'dashboard',
            'generare-luna',
            'vizualizare-lunara',
            'vizualizare-anuala',
            'sume-lunare',
            'adauga-membru',
            'sterge-membru',
            'dividende',
            'statistici',
            'listari',
            'conversion',
          ].includes(currentModule) && (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)]">
              <div className="text-6xl mb-4">🚧</div>
              <div className="text-2xl font-bold text-slate-800 mb-2">
                Modul în dezvoltare
              </div>
              <div className="text-slate-600 mb-6">
                Modulul "{currentModule}" va fi disponibil în curând
              </div>
              <button
                onClick={() => setCurrentModule('dashboard')}
                className="bg-slate-600 hover:bg-slate-700 text-white px-6 py-3 rounded-lg transition-colors"
              >
                ← Înapoi la Dashboard
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Taskbar - Fixed Bottom, Full Width */}
      {databases && (
        <Taskbar
          databases={databases}
          onModuleSelect={handleModuleSelect}
          onCurrencyChange={handleCurrencyChange}
          menuOpen={sidebarOpen}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />
      )}

      <UpdatePrompt />
    </div>
  );
            }
