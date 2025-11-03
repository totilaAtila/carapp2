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
import Taskbar from './components/Taskbar';
import UpdatePrompt from './components/UpdatePrompt';
import { loadDatabasesFromUpload, persistDatabases } from './services/databaseManager';
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
  | 'dividende';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [databases, setDatabases] = useState<DBSet | null>(null);
  const [currentModule, setCurrentModule] = useState<ModuleId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ✅ Ensure proper scaling on iPhone by enforcing a correct viewport meta tag.
  useEffect(() => {
    const name = 'viewport';
    let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = name;
      document.head.appendChild(meta);
    }
    // width=device-width ensures proper mobile width; viewport-fit=cover handles iOS safe areas.
    // Avoid disabling user zoom.
    meta.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
  }, []);

  // Optional: reduce unexpected font auto-zoom on iOS
  useEffect(() => {
    document.documentElement.style.setProperty('-webkit-text-size-adjust', '100%');
  }, []);

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

  async function handleDatabasesReloaded(newDbs: DBSet) {
    setDatabases(newDbs);
  }

  function handleModuleSelect(moduleId: string) {
    setCurrentModule(moduleId as ModuleId);
    setSidebarOpen(false); // Închide sidebar-ul după selectare pe mobile
  }

  function handleCurrencyChange(currency: 'RON' | 'EUR') {
    if (!databases) return;

    // Actualizează currency în databases object
    const updatedDatabases = {
      ...databases,
      activeCurrency: currency,
    };

    setDatabases(updatedDatabases);
    console.log(`🔄 Modul activ: ${currency}`);
  }

  // --- Loading State ---
  if (appState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100svh] bg-slate-100">
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
    // Use 100svh to avoid iOS Safari address bar issues and hide accidental horizontal overflow.
    <div className="relative min-h-[100svh] bg-slate-100 overflow-x-hidden">
      {/* Sidebar - ASCUNS COMPLET (meniul este acum în Taskbar) */}

      {/* Main Content Area - Full width, fără margin pentru sidebar */}
      <div
        className="
          min-h-[100svh]
        "
        // Ensure content is never hidden behind the fixed bottom Taskbar on iOS (safe area included)
        style={{
          paddingBottom: 'calc(60px + env(safe-area-inset-bottom))',
        }}
      >
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

          {/* Placeholder pentru module viitoare */}
          {currentModule !== 'dashboard' &&
            currentModule !== 'generare-luna' &&
            currentModule !== 'vizualizare-lunara' &&
            currentModule !== 'vizualizare-anuala' && 
            currentModule !== 'sume-lunare' &&
            currentModule !== 'adauga-membru' &&
            currentModule !== 'sterge-membru' &&
            currentModule !== 'dividende' && (
              <div className="flex flex-col items-center justify-center min-h-[calc(100svh-140px)]">
                <div className="text-6xl mb-4">🚧</div>
                <div className="text-2xl font-bold text-slate-800 mb-2">Modul în dezvoltare</div>
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
          onDatabasesReloaded={handleDatabasesReloaded}
          onModuleSelect={handleModuleSelect}
          onCurrencyChange={handleCurrencyChange}
          menuOpen={sidebarOpen}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />
      )}

      {/* Update Prompt - Notificare PWA pentru versiuni noi */}
      <UpdatePrompt />
    </div>
  );
}
