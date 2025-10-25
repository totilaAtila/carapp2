import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import GenerareLuna from './components/GenerareLuna';
import Sidebar from './components/Sidebar';
import Taskbar from './components/Taskbar';
export default function App() {
    const [appState, setAppState] = useState('loading');
    const [databases, setDatabases] = useState(null);
    const [currentModule, setCurrentModule] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    useEffect(() => {
        setTimeout(() => {
            setAppState('needs-setup');
        }, 500);
    }, []);
    function handleDatabasesLoaded(dbs) {
        setDatabases(dbs);
        setAppState('ready');
        setCurrentModule('dashboard');
    }
    function handleChangeDatabaseSource() {
        setDatabases(null);
        setAppState('needs-setup');
        setCurrentModule('dashboard');
    }
    async function handleDatabasesReloaded(newDbs) {
        setDatabases(newDbs);
    }
    function handleModuleSelect(moduleId) {
        setCurrentModule(moduleId);
        setSidebarOpen(false); // Închide sidebar-ul după selectare pe mobile
    }
    // --- Loading State ---
    if (appState === 'loading') {
        return (_jsxs("div", { className: "flex flex-col items-center justify-center min-h-screen bg-slate-100", children: [_jsx("div", { className: "text-6xl mb-4 animate-pulse", children: "\uD83C\uDFE6" }), _jsx("div", { className: "text-xl text-slate-600", children: "\u00CEnc\u0103rcare CARapp..." })] }));
    }
    // --- Setup State ---
    if (appState === 'needs-setup') {
        return _jsx(LandingPage, { onDatabasesLoaded: handleDatabasesLoaded });
    }
    // --- Main App State ---
    return (_jsxs("div", { className: "relative min-h-screen bg-slate-100", children: [_jsx(Sidebar, { isOpen: sidebarOpen, onToggle: () => setSidebarOpen(!sidebarOpen), onSelect: handleModuleSelect }), _jsx("div", { className: `
          min-h-screen
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'ml-[220px]' : 'ml-[72px]'}
          pb-[60px]
        `, children: _jsxs("div", { className: "w-full h-full p-4 md:p-6", children: [currentModule === 'generare-luna' && databases && (_jsx(GenerareLuna, { databases: databases, onBack: () => setCurrentModule('dashboard') })), currentModule === 'dashboard' && databases && (_jsx(Dashboard, { databases: databases, onModuleSelect: (module) => setCurrentModule(module), onChangeDatabaseSource: handleChangeDatabaseSource })), currentModule !== 'dashboard' && currentModule !== 'generare-luna' && (_jsxs("div", { className: "flex flex-col items-center justify-center min-h-[calc(100vh-140px)]", children: [_jsx("div", { className: "text-6xl mb-4", children: "\uD83D\uDEA7" }), _jsx("div", { className: "text-2xl font-bold text-slate-800 mb-2", children: "Modul \u00EEn dezvoltare" }), _jsxs("div", { className: "text-slate-600 mb-6", children: ["Modulul \"", currentModule, "\" va fi disponibil \u00EEn cur\u00E2nd"] }), _jsx("button", { onClick: () => setCurrentModule('dashboard'), className: "bg-slate-600 hover:bg-slate-700 text-white px-6 py-3 rounded-lg transition-colors", children: "\u2190 \u00CEnapoi la Dashboard" })] }))] }) }), databases && (_jsx("div", { className: `
          fixed bottom-0 right-0
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'left-[220px]' : 'left-[72px]'}
        `, children: _jsx(Taskbar, { databases: databases, onDatabasesReloaded: handleDatabasesReloaded, onMenuToggle: () => setSidebarOpen(!sidebarOpen) }) }))] }));
}
