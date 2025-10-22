import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import LandingPage from "./components/LandingPage";
import Dashboard from "./components/Dashboard";
import GenerareLuna from "./components/GenerareLuna";
function App() {
    const [currentView, setCurrentView] = useState('landing');
    const [databases, setDatabases] = useState(null);
    function handleDatabasesLoaded(dbs) {
        setDatabases(dbs);
        setCurrentView('dashboard');
    }
    function handleModuleSelect(module) {
        setCurrentView(module);
    }
    function handleBackToDashboard() {
        setCurrentView('dashboard');
    }
    function handleChangeDatabaseSource() {
        setDatabases(null);
        setCurrentView('landing');
    }
    return (_jsxs("div", { className: "min-h-screen bg-slate-100", children: [currentView === 'landing' && (_jsx(LandingPage, { onDatabasesLoaded: handleDatabasesLoaded })), currentView === 'dashboard' && databases && (_jsx(Dashboard, { databases: databases, onModuleSelect: handleModuleSelect, onChangeDatabaseSource: handleChangeDatabaseSource })), currentView === 'generare-luna' && databases && (_jsx(GenerareLuna, { databases: databases, onBack: handleBackToDashboard }))] }));
}
export default App;
