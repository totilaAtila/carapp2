import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import GenerareLuna from './components/GenerareLuna';
import VizualizareLunara from './components/VizualizareLunara';
import VizualizareAnuala from './components/VizualizareAnuala';
import VizualizareTrimestriala from './components/VizualizareTrimestriala'; // ← nou
import SumeLunare from './components/SumeLunare';
import AdaugaMembru from './components/AdaugaMembru';
import StergeMembru from './components/StergeMembru';
import Dividende from './components/Dividende';
import Statistici from './components/Statistici';
import Listari from './components/Listari';
import Conversion from './components/Conversion';
import Taskbar from './components/Taskbar';
import FloatingBackButton from './components/FloatingBackButton';
import UpdatePrompt from './components/UpdatePrompt';
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
    function handleModuleSelect(moduleId) {
        setCurrentModule(moduleId);
        setSidebarOpen(false);
    }
    function handleCurrencyChange(currency) {
        if (!databases)
            return;
        const updatedDatabases = { ...databases, activeCurrency: currency };
        setDatabases(updatedDatabases);
        console.log(`🔄 Modul activ: ${currency}`);
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
    return (_jsxs("div", { className: "relative min-h-screen bg-slate-100", children: [_jsx("main", { role: "main", className: "min-h-screen pb-[60px]", children: _jsxs("div", { className: "w-full h-full p-4 md:p-6", children: [currentModule === 'generare-luna' && databases && (_jsx(GenerareLuna, { databases: databases, onBack: () => setCurrentModule('dashboard') })), currentModule === 'vizualizare-lunara' && databases && (_jsx(VizualizareLunara, { databases: databases, onBack: () => setCurrentModule('dashboard') })), currentModule === 'vizualizare-anuala' && databases && (_jsx(VizualizareAnuala, { databases: databases, onBack: () => setCurrentModule('dashboard') })), currentModule === 'vizualizare-trimestriala' && databases && (_jsx(VizualizareTrimestriala, { databases: databases, onBack: () => setCurrentModule('dashboard') })), currentModule === 'sume-lunare' && databases && (_jsx(SumeLunare, { databases: databases, onBack: () => setCurrentModule('dashboard') })), currentModule === 'adauga-membru' && databases && (_jsx(AdaugaMembru, { databases: databases })), currentModule === 'sterge-membru' && databases && (_jsx(StergeMembru, { databases: databases })), currentModule === 'dashboard' && databases && (_jsx(Dashboard, { databases: databases, onModuleSelect: (module) => setCurrentModule(module), onChangeDatabaseSource: handleChangeDatabaseSource })), currentModule === 'dividende' && databases && (_jsx(Dividende, { databases: databases, onBack: () => setCurrentModule('dashboard') })), currentModule === 'statistici' && databases && (_jsx(Statistici, { databases: databases, onBack: () => setCurrentModule('dashboard') })), currentModule === 'listari' && databases && (_jsx(Listari, { databases: databases, onBack: () => setCurrentModule('dashboard') })), currentModule === 'conversion' && databases && (_jsx(Conversion, { databases: databases, onBack: () => setCurrentModule('dashboard') })), databases && ![
                            'dashboard',
                            'generare-luna',
                            'vizualizare-lunara',
                            'vizualizare-anuala',
                            'vizualizare-trimestriala',
                            'sume-lunare',
                            'adauga-membru',
                            'sterge-membru',
                            'dividende',
                            'statistici',
                            'listari',
                            'conversion',
                        ].includes(currentModule) && (_jsxs("div", { className: "flex flex-col items-center justify-center min-h-[calc(100vh-140px)]", children: [_jsx("div", { className: "text-6xl mb-4", children: "\uD83D\uDEA7" }), _jsx("div", { className: "text-2xl font-bold text-slate-800 mb-2", children: "Modul \u00EEn dezvoltare" }), _jsxs("div", { className: "text-slate-600 mb-6", children: ["Modulul \"", currentModule, "\" va fi disponibil \u00EEn cur\u00E2nd"] }), _jsx("button", { onClick: () => setCurrentModule('dashboard'), className: "bg-slate-600 hover:bg-slate-700 text-white px-6 py-3 rounded-lg transition-colors", children: "\u2190 \u00CEnapoi la Dashboard" })] }))] }) }), databases && (_jsx(FloatingBackButton, { onBackToDashboard: () => setCurrentModule('dashboard'), isVisible: currentModule !== 'dashboard' })), databases && (_jsx(Taskbar, { databases: databases, onModuleSelect: handleModuleSelect, onCurrencyChange: handleCurrencyChange, menuOpen: sidebarOpen, onMenuToggle: () => setSidebarOpen(!sidebarOpen) })), _jsx(UpdatePrompt, {})] }));
}
