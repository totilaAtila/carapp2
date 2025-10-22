import { useState } from 'react';
import { detectPlatformCapabilities } from '../services/platformDetector';
import { loadDatabasesFromFilesystem, loadDatabasesFromUpload, type DBSet } from '../services/databaseManager';

interface Props {
  onDatabasesLoaded: (dbs: DBSet) => void;
}

export default function LandingPage({ onDatabasesLoaded }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const capabilities = detectPlatformCapabilities();

  async function handleFilesystemAccess() {
    setLoading(true);
    setError(null);
    try {
      const dbs = await loadDatabasesFromFilesystem();
      onDatabasesLoaded(dbs);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload() {
    setLoading(true);
    setError(null);
    try {
      const dbs = await loadDatabasesFromUpload();
      onDatabasesLoaded(dbs);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏦</div>
          <h1 className="text-4xl font-bold text-slate-800 mb-2">
            CARapp Petroșani
          </h1>
          <p className="text-slate-600 text-lg">
            Casa de Ajutor Reciproc - Gestiune membri și împrumuturi
          </p>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">👋 Bine ați venit!</h3>
          <p className="text-blue-800 text-sm">
            Pentru a începe, trebuie să încărcați bazele de date. 
            Alegeți metoda preferată mai jos.
          </p>
        </div>

        {/* Opțiuni încărcare */}
        <div className="space-y-4 mb-6">
          {/* Filesystem Access - doar pentru browsere compatibile */}
          {capabilities.supportsFileSystemAccess && (
            <button
              onClick={handleFilesystemAccess}
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl p-6 text-left transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              <div className="flex items-center gap-4">
                <div className="text-4xl">🗂️</div>
                <div className="flex-1">
                  <div className="text-xl font-bold mb-1">
                    Selectează dosar cu baze de date
                  </div>
                  <div className="text-green-100 text-sm">
                    ✨ Recomandat: Aplicația va lucra direct pe fișiere, fără upload/download
                  </div>
                  <div className="text-green-200 text-xs mt-1">
                    📱 Disponibil pe: {capabilities.browserName} ({capabilities.platform})
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Upload - pentru toate browserele */}
          <button
            onClick={handleFileUpload}
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl p-6 text-left transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            <div className="flex items-center gap-4">
              <div className="text-4xl">📤</div>
              <div className="flex-1">
                <div className="text-xl font-bold mb-1">
                  Încarcă fișiere baze de date
                </div>
                <div className="text-blue-100 text-sm">
                  Compatibil: Upload fișiere, lucrează în aplicație, salvează înapoi
                </div>
                <div className="text-blue-200 text-xs mt-1">
                  📱 Disponibil pe: Toate browserele și platformele
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Info fișiere necesare */}
        <div className="bg-slate-50 rounded-lg p-4 text-sm mb-6">
          <div className="font-semibold text-slate-700 mb-2">📋 Fișiere necesare:</div>
          <div className="space-y-1 text-xs text-slate-600">
            <div>✅ <span className="font-medium">MEMBRII.db</span> - Obligatoriu</div>
            <div>✅ <span className="font-medium">DEPCRED.db</span> - Obligatoriu</div>
            <div>ℹ️ <span className="font-medium">LICHIDATI.db</span> - Opțional</div>
            <div>ℹ️ <span className="font-medium">ACTIVI.db</span> - Opțional</div>
          </div>
        </div>

        {/* Info platformă */}
        <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600">
          <div className="font-semibold mb-2">ℹ️ Informații platformă:</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>📱 Browser: <span className="font-medium">{capabilities.browserName}</span></div>
            <div>💻 Platformă: <span className="font-medium">{capabilities.platform}</span></div>
            <div>✅ PWA: <span className="font-medium">{capabilities.isPWA ? 'Da' : 'Nu'}</span></div>
            <div>🌐 Online: <span className="font-medium">{capabilities.isOnline ? 'Da' : 'Nu'}</span></div>
          </div>
        </div>

        {/* Eroare */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <div className="font-semibold mb-1">❌ Eroare</div>
            <div className="text-sm">{error}</div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 flex items-center gap-3">
            <div className="animate-spin text-2xl">⏳</div>
            <div>Se încarcă bazele de date...</div>
          </div>
        )}
      </div>
    </div>
  );
}