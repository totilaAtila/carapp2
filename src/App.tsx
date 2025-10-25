import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import GenerareLuna from './components/GenerareLuna';
import Sidebar from './components/Sidebar';
import Taskbar from './components/Taskbar';
import { loadDatabasesFromUpload, persistDatabases } from './services/databaseManager';
import type { DBSet } from './services/databaseManager';

type AppState = 'loading' | 'needs-setup' | 'ready';
type ModuleId = 'dashboard' | 'generare-luna' | 'sume-lunare' | 'vizualizare-lunara' | 'vizualizare-anuala' | 'adauga-membru' | 'sterge-membru' | 'dividende';

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

  async function handleDatabasesReloaded(newDbs: DBSet) {
    setDatabases(newDbs);
  }

  function handleModuleSelect(moduleId: string) {
    setCurrentModule(moduleId as ModuleId);
    setSidebarOpen(false);
  }

  // --- Loading State ---
  if (appState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100">
        <div className="text-6xl mb-4 animate-pulse">🦅</div>
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
      {/* Sidebar - Desktop fix, Mobile drawer */}
      <Sidebar 
        isOpen={sidebarOpen} 
        onToggle={() => setSidebarOpen(!sidebarOpen)} 
        onSelect={handleModuleSelect} 
      />

      {/* Main Content Area */}
      <div 
        className={`
          min-h-screen
          transition-all duration-300 ease-in-out
          pb-[60px]
          lg:${sidebarOpen ? 'ml-[220px]' : 'ml-[72px]'}
          ml-0
        `}
      >
        <div className="w-full h-full p-4 md:p-6">
          {currentModule === 'generare-luna' && databases && (
            <GenerareLuna
              databases={databases}
              onBack={() => setCurrentModule('dashboard')}
            />
          )}

          {currentModule === 'dashboard' && databases && (
            <Dashboard
              databases={databases}
              onModuleSelect={(module) => setCurrentModule(module as ModuleId)}
              onChangeDatabaseSource={handleChangeDatabaseSource}
            />
          )}

          {/* Placeholder pentru module viitoare */}
          {currentModule !== 'dashboard' && currentModule !== 'generare-luna' && (
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

      {/* Taskbar - Fixed Bottom */}
      {databases && (
        <div className={`
          fixed bottom-0 right-0
          transition-all duration-300 ease-in-out
          lg:${sidebarOpen ? 'left-[220px]' : 'left-[72px]'}
          left-0
        `}>
          <Taskbar 
            databases={databases} 
            onDatabasesReloaded={handleDatabasesReloaded}
            onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          />
        </div>
      )}
    </div>
  );
}