import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { persistDatabases } from '../services/databaseManager';
import { Menu, Home, Calendar, BarChart2, Users, UserMinus, Coins, FileText, ArrowLeftRight } from 'lucide-react';
import CurrencyToggle from './CurrencyToggle';
export default function Taskbar({ databases, onModuleSelect, onCurrencyChange, menuOpen, onMenuToggle, }) {
    // + Statistici în meniu
    const menuItems = [
        { id: "sume-lunare", icon: BarChart2, label: "Sume lunare" },
        { id: "generare-luna", icon: Calendar, label: "Generare lună" },
        { id: "vizualizare-lunara", icon: Home, label: "Vizualizare lunară" },
        { id: "vizualizare-anuala", icon: BarChart2, label: "Vizualizare anuală" },
        { id: "adauga-membru", icon: Users, label: "Adăugare membru" },
        { id: "sterge-membru", icon: UserMinus, label: "Ștergere membru" },
        { id: "dividende", icon: Coins, label: "Dividende" },
        { id: "statistici", icon: BarChart2, label: "Statistici" },
        { id: "listari", icon: FileText, label: "Chitanțe" },
        { id: "conversion", icon: ArrowLeftRight, label: "Conversie RON→EUR" },
    ];
    function handleModuleClick(moduleId) {
        onModuleSelect(moduleId);
        onMenuToggle(); // Închide meniul după selectare
    }
    async function handleSave() {
        try {
            await persistDatabases(databases);
            alert('✔️ Bazele de date au fost salvate cu succes.');
        }
        catch (err) {
            alert('❌ Eroare la salvare: ' + err.message);
        }
    }
    return (_jsxs(_Fragment, { children: [menuOpen && (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-40", onClick: onMenuToggle }), _jsxs("div", { className: "\n              fixed bottom-16 left-4 z-50\n              bg-slate-900/95 backdrop-blur-md\n              text-white rounded-xl shadow-2xl\n              border border-slate-700\n              w-64 max-h-[500px] overflow-y-auto\n              animate-in slide-in-from-bottom-5 duration-200\n            ", children: [_jsx("div", { className: "px-4 py-3 border-b border-slate-700", children: _jsx("h3", { className: "font-semibold text-sm text-slate-300", children: "Meniu Aplica\u021Bie" }) }), _jsx("div", { className: "py-2", children: menuItems.map(({ id, icon: Icon, label }) => (_jsxs("button", { onClick: () => handleModuleClick(id), className: "\n                    w-full flex items-center gap-3 px-4 py-3\n                    hover:bg-slate-700/50 transition-colors\n                    text-left text-sm\n                  ", children: [_jsx(Icon, { className: "w-5 h-5 text-slate-400" }), _jsx("span", { children: label })] }, id))) })] })] })), _jsxs("div", { className: "\n          fixed bottom-0 left-0 w-full\n          bg-slate-800/70 backdrop-blur-md\n          text-white text-sm flex justify-between\n          items-center px-6 py-2\n          border-t border-slate-700 shadow-inner z-50\n        ", children: [_jsx("button", { onClick: onMenuToggle, className: `
            flex items-center gap-2 rounded-xl px-3 py-2 transition-colors
            ${menuOpen ? 'bg-slate-600' : 'bg-slate-700 hover:bg-slate-600'}
          `, "aria-label": "Deschide/\u00EEnchide meniul", title: "Meniu", children: _jsx(Menu, { className: "w-5 h-5" }) }), _jsx(CurrencyToggle, { databases: databases, onCurrencyChange: onCurrencyChange }), _jsx("div", { className: "flex gap-4", children: _jsx("button", { onClick: handleSave, className: "flex items-center gap-2 bg-green-600 hover:bg-green-700 rounded-xl px-4 py-2 transition-all active:scale-95 shadow-lg", children: "Salveaz\u0103" }) })] })] }));
}
