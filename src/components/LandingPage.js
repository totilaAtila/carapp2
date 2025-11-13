import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { X } from 'lucide-react';
import { detectPlatformCapabilities } from '../services/platformDetector';
import { loadDatabasesFromFilesystem, loadDatabasesFromUpload } from '../services/databaseManager';
export default function LandingPage({ onDatabasesLoaded }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [clearing, setClearing] = useState(false);
    const capabilities = detectPlatformCapabilities();
    async function handleClearAllCache() {
        if (!confirm('Ștergeți TOATE datele cache (Service Workers, Cache Storage, IndexedDB)?\n\nAceastă operație este ireversibilă și va reîncărca pagina.')) {
            return;
        }
        setClearing(true);
        let cleared = [];
        let errors = [];
        try {
            // 1. Unregister Service Workers și forțează activarea noului state
            try {
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    console.log('🔍 Găsite Service Workers:', registrations.length);
                    for (const registration of registrations) {
                        // Încearcă să activezi skipWaiting dacă SW e în waiting
                        if (registration.waiting) {
                            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                        }
                        const success = await registration.unregister();
                        console.log('🗑️ Unregister SW:', success);
                    }
                    if (registrations.length > 0) {
                        cleared.push(`${registrations.length} Service Worker(s)`);
                        // Așteaptă puțin ca unregister să se aplice
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
            catch (err) {
                console.error('❌ Eroare Service Workers:', err);
                errors.push('Service Workers: ' + err.message);
            }
            // 2. Clear Cache Storage (DUPĂ ce Service Workers sunt șterse)
            try {
                if ('caches' in window) {
                    const cacheNames = await caches.keys();
                    console.log('🔍 Găsite Caches:', cacheNames);
                    let deletedCaches = 0;
                    for (const name of cacheNames) {
                        const deleted = await caches.delete(name);
                        if (deleted) {
                            deletedCaches++;
                            console.log('🗑️ Cache șters:', name);
                        }
                        else {
                            console.warn('⚠️ Cache nu a putut fi șters:', name);
                        }
                    }
                    if (deletedCaches > 0) {
                        cleared.push(`${deletedCaches}/${cacheNames.length} Cache(s)`);
                    }
                    else if (cacheNames.length > 0) {
                        errors.push(`Cache Storage (${cacheNames.length} locked)`);
                    }
                }
            }
            catch (err) {
                console.error('❌ Eroare Cache Storage:', err);
                errors.push('Cache Storage: ' + err.message);
            }
            // 3. Clear IndexedDB (databases() is experimental - not in Safari/Firefox)
            try {
                if ('indexedDB' in window && typeof indexedDB.databases === 'function') {
                    const databases = await indexedDB.databases();
                    console.log('🔍 Găsite IndexedDB:', databases);
                    let deletedCount = 0;
                    for (const db of databases) {
                        if (db.name) {
                            const deleteRequest = indexedDB.deleteDatabase(db.name);
                            await new Promise((resolve, reject) => {
                                deleteRequest.onsuccess = () => {
                                    deletedCount++;
                                    console.log('🗑️ IndexedDB șters:', db.name);
                                    resolve(true);
                                };
                                deleteRequest.onerror = () => {
                                    console.warn('⚠️ IndexedDB nu a putut fi șters:', db.name);
                                    resolve(false);
                                };
                                deleteRequest.onblocked = () => {
                                    console.warn('🔒 IndexedDB blocat:', db.name);
                                    resolve(false);
                                };
                                // Timeout după 2 secunde
                                setTimeout(() => resolve(false), 2000);
                            });
                        }
                    }
                    if (deletedCount > 0) {
                        cleared.push(`${deletedCount}/${databases.length} IndexedDB(s)`);
                    }
                    else if (databases.length > 0) {
                        errors.push(`IndexedDB (${databases.length} locked/blocked)`);
                    }
                }
                else if ('indexedDB' in window) {
                    // databases() nu e disponibil, dar putem încerca să ștergem known databases
                    const knownDbs = ['carapp-membrii', 'carapp-depcred', 'carapp-activi',
                        'carapp-inactivi', 'carapp-lichidati', 'carapp-chitante',
                        'carapp-membriieur', 'carapp-depcredeur', 'carapp-activieur',
                        'carapp-inactivieur', 'carapp-lichidatieur'];
                    let deletedCount = 0;
                    for (const dbName of knownDbs) {
                        try {
                            const deleteRequest = indexedDB.deleteDatabase(dbName);
                            const deleted = await new Promise((resolve) => {
                                deleteRequest.onsuccess = () => resolve(true);
                                deleteRequest.onerror = () => resolve(false);
                                deleteRequest.onblocked = () => resolve(false);
                                setTimeout(() => resolve(false), 1000);
                            });
                            if (deleted)
                                deletedCount++;
                        }
                        catch {
                            // Ignore individual delete errors
                        }
                    }
                    if (deletedCount > 0) {
                        cleared.push(`${deletedCount} Known IndexedDB(s)`);
                    }
                }
            }
            catch (err) {
                console.error('❌ Eroare IndexedDB:', err);
                errors.push('IndexedDB: ' + err.message);
            }
            // 4. Clear localStorage & sessionStorage
            try {
                localStorage.clear();
                sessionStorage.clear();
                cleared.push('LocalStorage');
                console.log('🗑️ LocalStorage cleared');
            }
            catch (err) {
                console.error('❌ Eroare LocalStorage:', err);
                errors.push('LocalStorage: ' + err.message);
            }
            // Afișează rezultat
            let message = '';
            if (cleared.length > 0) {
                message += `✅ Cache curățat:\n${cleared.join('\n')}`;
            }
            if (errors.length > 0) {
                message += `\n\n⚠️ Nu s-au putut șterge:\n${errors.join('\n')}`;
                message += '\n\nAceste resurse sunt blocate de browser sau în uz.';
            }
            if (cleared.length === 0 && errors.length === 0) {
                message = 'ℹ️ Nu s-a găsit cache de șters.';
            }
            // Dacă au fost erori, explică ce să facă
            if (errors.length > 0) {
                message += '\n\n💡 Pentru curățare completă:\n';
                message += '1. Închideți toate tab-urile cu această aplicație\n';
                message += '2. Reîncărcați pagina\n';
                message += '3. Sau folosiți Setări Chrome → Clear browsing data';
            }
            message += '\n\nReîncărcare pagină...';
            alert(message);
            // Reload pagina pentru a aplica modificările
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }
        catch (err) {
            console.error('❌ Eroare generală la curățarea cache:', err);
            alert(`❌ Eroare la curățarea cache: ${err.message}\n\nVerificați consola pentru detalii.`);
        }
        finally {
            setClearing(false);
        }
    }
    async function handleFilesystemAccess() {
        setLoading(true);
        setError(null);
        try {
            const dbs = await loadDatabasesFromFilesystem();
            onDatabasesLoaded(dbs);
        }
        catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                console.log("📂 Selectarea dosarului a fost anulată de utilizator.");
                return;
            }
            const message = err instanceof Error
                ? err.message
                : "A apărut o eroare necunoscută la încărcarea bazelor de date.";
            setError(message);
        }
        finally {
            setLoading(false);
        }
    }
    async function handleFileUpload() {
        setLoading(true);
        setError(null);
        try {
            const dbs = await loadDatabasesFromUpload();
            onDatabasesLoaded(dbs);
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-4", children: _jsxs("div", { className: "max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8", children: [_jsxs("div", { className: "text-center mb-8", children: [_jsx("div", { className: "text-6xl mb-4", children: "\uD83C\uDFE6" }), _jsx("h1", { className: "text-4xl font-bold text-slate-800 mb-2", children: "CARapp Petro\u0219ani" }), _jsx("p", { className: "text-slate-600 text-lg", children: "Casa de Ajutor Reciproc - Gestiune membri \u0219i \u00EEmprumuturi" })] }), _jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6", children: [_jsx("h2", { className: "font-semibold text-blue-900 mb-2", children: "\uD83D\uDC4B Bine a\u021Bi venit!" }), _jsxs("p", { className: "text-blue-800 text-sm leading-relaxed", children: ["Aplica\u021Bia func\u021Bioneaz\u0103 DOAR dac\u0103 \u00EEnc\u0103rca\u021Bi bazele de date de pe dispozitivul personal. Bazele de date sunt \u00EEnc\u0103rcate \u0219i prelucrate \u00EEn memoria dispozitivelor (mobil, tablet\u0103, desktop).", _jsx("span", { className: "font-semibold", children: " NU p\u0103r\u0103sesc niciodat\u0103 dispozitivul utilizatorului, NU se \u00EEncarc\u0103 \u00EEn Cloud/internet." })] })] }), _jsxs("div", { className: "space-y-4 mb-6", children: [capabilities.supportsFileSystemAccess && !capabilities.isIOS && (_jsx("button", { onClick: handleFilesystemAccess, disabled: loading, className: "w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl p-6 text-left transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "text-4xl", children: "\uD83D\uDDC2\uFE0F" }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-xl font-bold mb-1", children: "Selecteaz\u0103 dosar cu baze de date" }), _jsx("div", { className: "text-green-100 text-sm", children: "\u2728 Recomandat: Aplica\u021Bia va lucra direct pe fi\u0219iere, f\u0103r\u0103 upload/download" }), _jsxs("div", { className: "text-green-200 text-xs mt-1", children: ["\uD83D\uDCF1 Disponibil pe: ", capabilities.browserName, " (", capabilities.platform, ")"] })] })] }) })), _jsx("button", { onClick: handleFileUpload, disabled: loading, className: "w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl p-6 text-left transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "text-4xl", children: "\uD83D\uDCE4" }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "text-xl font-bold mb-1", children: "\u00CEncarc\u0103 fi\u0219iere baze de date" }), _jsx("div", { className: "text-blue-100 text-sm", children: "Compatibil: Upload fi\u0219iere, lucreaz\u0103 \u00EEn aplica\u021Bie, salveaz\u0103 \u00EEnapoi" }), _jsx("div", { className: "text-blue-200 text-xs mt-1", children: "\uD83D\uDCF1 Disponibil pe: Toate browserele \u0219i platformele" })] })] }) })] }), _jsxs("div", { className: "bg-slate-50 rounded-lg p-4 text-sm mb-6", children: [_jsx("div", { className: "font-semibold text-slate-700 mb-2", children: "\uD83D\uDCCB Fi\u0219iere necesare:" }), _jsxs("div", { className: "mb-3", children: [_jsx("div", { className: "text-xs font-semibold text-slate-700 mb-1", children: "\uD83C\uDDF7\uD83C\uDDF4 Baze de date RON (Obligatorii):" }), _jsxs("div", { className: "space-y-0.5 text-xs text-slate-600 ml-2", children: [_jsxs("div", { children: ["\u2705 ", _jsx("span", { className: "font-medium", children: "MEMBRII.db" })] }), _jsxs("div", { children: ["\u2705 ", _jsx("span", { className: "font-medium", children: "DEPCRED.db" })] }), _jsxs("div", { children: ["\u2705 ", _jsx("span", { className: "font-medium", children: "activi.db" }), " ", _jsx("span", { className: "text-orange-600", children: "(lowercase!)" })] }), _jsxs("div", { children: ["\u2705 ", _jsx("span", { className: "font-medium", children: "INACTIVI.db" })] }), _jsxs("div", { children: ["\u2705 ", _jsx("span", { className: "font-medium", children: "LICHIDATI.db" })] }), _jsxs("div", { children: ["\u2705 ", _jsx("span", { className: "font-medium", children: "CHITANTE.db" })] })] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-semibold text-slate-700 mb-1", children: "\uD83C\uDDEA\uD83C\uDDFA Baze de date EUR (Op\u021Bionale):" }), _jsxs("div", { className: "space-y-0.5 text-xs text-slate-600 ml-2", children: [_jsxs("div", { children: ["\u2139\uFE0F ", _jsx("span", { className: "font-medium", children: "MEMBRIIEUR.db" })] }), _jsxs("div", { children: ["\u2139\uFE0F ", _jsx("span", { className: "font-medium", children: "DEPCREDEUR.db" })] }), _jsxs("div", { children: ["\u2139\uFE0F ", _jsx("span", { className: "font-medium", children: "activiEUR.db" })] }), _jsxs("div", { children: ["\u2139\uFE0F ", _jsx("span", { className: "font-medium", children: "INACTIVIEUR.db" })] }), _jsxs("div", { children: ["\u2139\uFE0F ", _jsx("span", { className: "font-medium", children: "LICHIDATIEUR.db" })] })] }), _jsx("div", { className: "mt-2 text-xs text-slate-500 italic", children: "\uD83D\uDCA1 CHITANTE.db este comun pentru RON \u0219i EUR" })] })] }), _jsxs("div", { className: "bg-slate-50 rounded-lg p-4 text-sm text-slate-600", children: [_jsx("div", { className: "font-semibold mb-2", children: "\u2139\uFE0F Informa\u021Bii platform\u0103:" }), _jsxs("div", { className: "grid grid-cols-2 gap-2 text-xs", children: [_jsxs("div", { children: ["\uD83D\uDCF1 Browser: ", _jsx("span", { className: "font-medium", children: capabilities.browserName })] }), _jsxs("div", { children: ["\uD83D\uDCBB Platform\u0103: ", _jsx("span", { className: "font-medium", children: capabilities.platform })] }), _jsxs("div", { children: ["\u2705 PWA: ", _jsx("span", { className: "font-medium", children: capabilities.isPWA ? 'Da' : 'Nu' })] }), _jsxs("div", { children: ["\uD83C\uDF10 Online: ", _jsx("span", { className: "font-medium", children: capabilities.isOnline ? 'Da' : 'Nu' })] })] })] }), _jsxs("div", { className: "mt-4", children: [_jsx("button", { onClick: handleClearAllCache, disabled: clearing || loading, className: "w-full bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg p-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed", children: clearing ? (_jsxs("span", { className: "flex items-center justify-center gap-2", children: [_jsx("span", { className: "animate-spin", children: "\u23F3" }), "Cur\u0103\u021Bare cache..."] })) : (_jsx("span", { className: "flex items-center justify-center gap-2", children: "\uD83E\uDDF9 Cur\u0103\u021Bare for\u021Bat\u0103 cache (Debug)" })) }), _jsx("div", { className: "text-xs text-slate-500 text-center mt-1", children: "\u0218terge Service Workers, Cache, IndexedDB (folose\u0219te doar dac\u0103 aplica\u021Bia nu se \u00EEncarc\u0103 corect)" })] }), error && (_jsx("div", { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50", children: _jsxs("div", { className: "bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative", children: [_jsx("button", { onClick: () => setError(null), className: "absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors", children: _jsx(X, { className: "w-6 h-6" }) }), _jsxs("div", { className: "text-center mb-4", children: [_jsx("div", { className: "text-6xl mb-3", children: "\u274C" }), _jsx("h3", { className: "text-2xl font-bold text-red-600 mb-2", children: "Eroare" })] }), _jsx("div", { className: "bg-red-50 border border-red-200 rounded-lg p-4 mb-4", children: _jsx("p", { className: "text-red-800 text-sm whitespace-pre-line", children: error }) }), _jsx("button", { onClick: () => setError(null), className: "w-full bg-red-600 hover:bg-red-700 text-white rounded-lg py-3 font-semibold transition-colors", children: "\u00CEnchide" })] }) })), loading && (_jsxs("div", { className: "mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 flex items-center gap-3", children: [_jsx("div", { className: "animate-spin text-2xl", children: "\u23F3" }), _jsx("div", { children: "Se \u00EEncarc\u0103 bazele de date..." })] }))] }) }));
}
