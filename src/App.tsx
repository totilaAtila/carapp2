import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import GenerareLuna from './components/GenerareLuna';
import type { DBSet } from './services/databaseManager';

type AppState = 'loading' | 'needs-setup' | 'ready';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [databases, setDatabases] = useState<DBSet | null>(null);
  const [currentModule, setCurrentModule] = useState<'dashboard' | 'generare-luna'>('dashboard');

  useEffect(() => {
    // În viitor: verifică dacă există baze cached în IndexedDB
    // Pentru acum, cere mereu setup
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