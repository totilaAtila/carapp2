import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import GenerareLuna from './components/GenerareLuna';
import { loadDatabasesFromUpload, persistDatabases } from './services/databaseManager';
import type { DBSet } from './services/databaseManager';

type AppState = 'loading' | 'needs-setup' | 'ready';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [databases, setDatabases] = useState<DBSet | null>(null);
  const [currentModule, setCurrentModule] = useState<'dashboard' | 'generare-luna'>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

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

  async function handleDatabasesReloaded() {
    try {
      const newDbs = await loadDatabasesFromUpload();
      setDatabases(newDbs);
      alert('📤 Bazele de date au fost reîncărcate cu succes.');
    } catch (err: any) {
      alert('❌ Eroare la reîncărcare: ' + err.message);
    }
  }

  async function handleSaveDatabases() {
    if (!databases) return;
    try {
      await persistDatabases(databases);
      alert('✔️ Bazele de date au fost salvate cu succes.');
    } catch (err: any) {
      alert('❌ Eroare la salvare: ' + err.message);
    }
  }

  // --- UI principal ---
  if (appState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100">
        <div className="text-6xl mb-4 animate-pulse">🏦</div>
        <div className="text-xl text-slate-600">Încărcare CARapp...</div>
      </div>
    );
  }

  if (appState === 'needs-setup') {
    return <LandingPage onDatabasesLoaded={handleDatabasesLoaded} />;
  }

  return (
    <div className="relative min-h-screen bg-slate-100 overflow-hidden">
      {/* --- Meniul lateral glisant --- */}
      <div
        className={`
          fixed top-0 left-0 h-full w-64 bg-slate-800 text-white
          transform transition-transform duration-300 ease-in-out z-40
          ${menuOpen ? 'translate-x-0' : '-translate-x-56'}
        `}
      >
        <div className="p-4 text-lg font-semibold border-b border-slate-700">
          📋 Meniu principal
        </div>
        <ul className="flex flex-col mt-4 space-y-2 px-3 text-sm">
          <li className="hover:bg-slate-700 rounded-lg p-2 cursor-pointer">💰 Sume lunare</li>
          <li
            className="hover:bg-slate-700 rounded-lg p-2 cursor-pointer"
            onClick={() => setCurrentModule('generare-luna')}
          >
            🧮 Generare lună
          </li>
          <li className="hover:bg-slate-700 rounded-lg p-2 cursor-pointer">📅 Vizualizare lunară</li>
          <li className="hover:bg-slate-700 rounded-lg p-2 cursor-pointer">📆 Vizualizare anuală</li>
          <li className="hover:bg-slate-700 rounded-lg p-2 cursor-pointer">➕ Adăugare membru</li>
          <li className="hover:bg-slate-700 rounded-lg p-2 cursor-pointer">🗑️ Ștergere membru</li>
          <li className="hover:bg-slate-700 rounded-lg p-2 cursor-pointer">🏦 Dividende</li>
        </ul>
      </div>

      {/* --- Conținut principal --- */}
      <div
        className={`transition-all duration-300 ${menuOpen ? 'ml-64' : 'ml-12'} pb-16`}
      >
        {currentModule === 'generare-luna' && databases ? (
          <GenerareLuna
            databases={databases}
            onBack={() => setCurrentModule('dashboard')}
          />
        ) : (
          <Dashboard
            databases={databases!}
            onModuleSelect={(module) => setCurrentModule(module)}
            onChangeDatabaseSource={handleChangeDatabaseSource}
          />
        )}
      </div>

      {/* --- Taskbar permanent --- */}
      {databases && (
        <div
          className="
            fixed bottom-0 left-0 w-full
            bg-slate-800/70 backdrop-blur-md
            text-white text-sm flex justify-between
            items-center px-6 py-2 border-t border-slate-700
            shadow-inner z-50
          "
        >
          {/* Buton meniu */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="
              flex items-center gap-2 bg-slate-700 hover:bg-slate-600
              text-white font-semibold rounded-xl px-4 py-2 transition-all
              active:scale-95 shadow-md
            "
          >
            ☰ Meniu
          </button>

          <div className="flex gap-3">
            <button
              onClick={handleDatabasesReloaded}
              className="
                flex items-center gap-2 bg-blue-600 hover:bg-blue-700
                text-white font-semibold rounded-xl px-4 py-2 transition-all
                active:scale-95 shadow-lg
              "
            >
              📤 Reîncarcă bazele
            </button>

            <button
              onClick={handleSaveDatabases}
              className="
                flex items-center gap-2 bg-green-600 hover:bg-green-700
                text-white font-semibold rounded-xl px-4 py-2 transition-all
                active:scale-95 shadow-lg
              "
            >
              💾 Salvează
            </button>
          </div>
        </div>
      )}
    </div>
  );
}        <div className="text-6xl mb-4 animate-pulse">🏦</div>
        <div className="text-xl text-slate-600">Încărcare CARapp...</div>
      </div>
    );
  }

  if (appState === 'needs-setup') {
    return <LandingPage onDatabasesLoaded={handleDatabasesLoaded} />;
  }

  if (currentModule === 'generare-luna' && databases) {
    return (
      <GenerareLuna 
        databases={databases}
        onBack={() => setCurrentModule('dashboard')}
      />
    );
  }

  return (
    <Dashboard 
      databases={databases!}
      onModuleSelect={(module) => setCurrentModule(module)}
      onChangeDatabaseSource={handleChangeDatabaseSource}
    />
  );
}
