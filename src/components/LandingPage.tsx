import { useState } from 'react';
import { X } from 'lucide-react';
import { detectPlatformCapabilities } from '../services/platformDetector';
import { loadDatabasesFromFilesystem, loadDatabasesFromUpload, type DBSet } from '../services/databaseManager';

interface Props {
  onDatabasesLoaded: (dbs: DBSet) => void;
}

export default function LandingPage({ onDatabasesLoaded }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const capabilities = detectPlatformCapabilities();

  async function handleClearAllCache() {
    if (!confirm('Ștergeți TOATE datele cache (Service Workers, Cache Storage, IndexedDB)?\n\nAceastă operație este ireversibilă.')) {
      return;
    }

    setClearing(true);
    let cleared: string[] = [];
    let errors: string[] = [];

    try {
      // 1. Unregister Service Workers
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
          if (registrations.length > 0) {
            cleared.push(`${registrations.length} Service Worker(s)`);
          }
        }
      } catch (err) {
        console.error('Eroare Service Workers:', err);
        errors.push('Service Workers');
      }

      // 2. Clear Cache Storage
      try {
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          for (const name of cacheNames) {
            await caches.delete(name);
          }
          if (cacheNames.length > 0) {
            cleared.push(`${cacheNames.length} Cache(s)`);
          }
        }
      } catch (err) {
        console.error('Eroare Cache Storage:', err);
        errors.push('Cache Storage');
      }

      // 3. Clear IndexedDB (databases() is experimental - not in Safari/Firefox)
      try {
        if ('indexedDB' in window && typeof indexedDB.databases === 'function') {
          const databases = await indexedDB.databases();
          for (const db of databases) {
            if (db.name) {
              indexedDB.deleteDatabase(db.name);
            }
          }
          if (databases.length > 0) {
            cleared.push(`${databases.length} IndexedDB(s)`);
          }
        } else if ('indexedDB' in window) {
          // databases() nu e disponibil, dar putem încerca să ștergem known databases
          const knownDbs = ['carapp-membrii', 'carapp-depcred', 'carapp-activi',
                           'carapp-inactivi', 'carapp-lichidati', 'carapp-chitante',
                           'carapp-membriieur', 'carapp-depcredeur', 'carapp-activieur',
                           'carapp-inactivieur', 'carapp-lichidatieur'];
          let deletedCount = 0;
          for (const dbName of knownDbs) {
            try {
              indexedDB.deleteDatabase(dbName);
              deletedCount++;
            } catch {
              // Ignore individual delete errors
            }
          }
          if (deletedCount > 0) {
            cleared.push(`${deletedCount} Known IndexedDB(s)`);
          }
        }
      } catch (err) {
        console.error('Eroare IndexedDB:', err);
        errors.push('IndexedDB');
      }

      // 4. Clear localStorage & sessionStorage
      try {
        localStorage.clear();
        sessionStorage.clear();
        cleared.push('LocalStorage');
      } catch (err) {
        console.error('Eroare LocalStorage:', err);
        errors.push('LocalStorage');
      }

      // Afișează rezultat
      let message = '';
      if (cleared.length > 0) {
        message += `✅ Cache curățat cu succes!\n\nȘters: ${cleared.join(', ')}`;
      }
      if (errors.length > 0) {
        message += `\n\n⚠️ Unele componente nu au putut fi șterse: ${errors.join(', ')}`;
      }
      if (cleared.length === 0 && errors.length === 0) {
        message = 'ℹ️ Nu s-a găsit cache de șters.';
      }
      message += '\n\nPagina se va reîncărca acum.';

      alert(message);

      // Reload pagina pentru a aplica modificările
      window.location.reload();
    } catch (err) {
      console.error('Eroare la curățarea cache:', err);
      alert(`❌ Eroare la curățarea cache: ${(err as Error).message}`);
    } finally {
      setClearing(false);
    }
  }

  async function handleFilesystemAccess() {
    setLoading(true);
    setError(null);
    try {
      const dbs = await loadDatabasesFromFilesystem();
      onDatabasesLoaded(dbs);
    } catch (err) {
      if (
        err instanceof DOMException && err.name === "AbortError"
      ) {
        console.log("📂 Selectarea dosarului a fost anulată de utilizator.");
        return;
      }

      const message = err instanceof Error
        ? err.message
        : "A apărut o eroare necunoscută la încărcarea bazelor de date.";
      setError(message);
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
          <p className="text-blue-800 text-sm leading-relaxed">
            Aplicația funcționează DOAR dacă încărcați bazele de date de pe dispozitivul personal.
            Bazele de date sunt încărcate și prelucrate în memoria dispozitivelor (mobil, tabletă, desktop).
            <span className="font-semibold"> NU părăsesc niciodată dispozitivul utilizatorului, NU se încarcă în Cloud/internet.</span>
          </p>
        </div>

        {/* Opțiuni încărcare */}
        <div className="space-y-4 mb-6">
          {/* Filesystem Access - doar pentru browsere compatibile */}
          {capabilities.supportsFileSystemAccess && !capabilities.isIOS && (
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

          {/* RON - Obligatorii */}
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700 mb-1">🇷🇴 Baze de date RON (Obligatorii):</div>
            <div className="space-y-0.5 text-xs text-slate-600 ml-2">
              <div>✅ <span className="font-medium">MEMBRII.db</span></div>
              <div>✅ <span className="font-medium">DEPCRED.db</span></div>
              <div>✅ <span className="font-medium">activi.db</span> <span className="text-orange-600">(lowercase!)</span></div>
              <div>✅ <span className="font-medium">INACTIVI.db</span></div>
              <div>✅ <span className="font-medium">LICHIDATI.db</span></div>
              <div>✅ <span className="font-medium">CHITANTE.db</span></div>
            </div>
          </div>

          {/* EUR - Opționale */}
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1">🇪🇺 Baze de date EUR (Opționale):</div>
            <div className="space-y-0.5 text-xs text-slate-600 ml-2">
              <div>ℹ️ <span className="font-medium">MEMBRIIEUR.db</span></div>
              <div>ℹ️ <span className="font-medium">DEPCREDEUR.db</span></div>
              <div>ℹ️ <span className="font-medium">activiEUR.db</span></div>
              <div>ℹ️ <span className="font-medium">INACTIVIEUR.db</span></div>
              <div>ℹ️ <span className="font-medium">LICHIDATIEUR.db</span></div>
            </div>
            <div className="mt-2 text-xs text-slate-500 italic">
              💡 CHITANTE.db este comună pentru RON și EUR
            </div>
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

        {/* Buton debug - Clear cache */}
        <div className="mt-4">
          <button
            onClick={handleClearAllCache}
            disabled={clearing || loading}
            className="w-full bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg p-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {clearing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                Curățare cache...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                🧹 Curățare forțată cache (Debug)
              </span>
            )}
          </button>
          <div className="text-xs text-slate-500 text-center mt-1">
            Șterge Service Workers, Cache, IndexedDB (folosește doar dacă aplicația nu se încarcă corect)
          </div>
        </div>

        {/* Modal Eroare */}
        {error && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
              {/* Buton închidere */}
              <button
                onClick={() => setError(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Conținut */}
              <div className="text-center mb-4">
                <div className="text-6xl mb-3">❌</div>
                <h3 className="text-2xl font-bold text-red-600 mb-2">Eroare</h3>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 text-sm whitespace-pre-line">
                  {error}
                </p>
              </div>

              <button
                onClick={() => setError(null)}
                className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg py-3 font-semibold transition-colors"
              >
                Închide
              </button>
            </div>
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
