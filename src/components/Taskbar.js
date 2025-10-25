import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { persistDatabases, loadDatabasesFromUpload } from '../services/databaseManager';
import { Menu } from 'lucide-react';
export default function Taskbar({ databases, onDatabasesReloaded, onMenuToggle }) {
    async function handleSave() {
        try {
            await persistDatabases(databases);
            alert('✔️ Bazele de date au fost salvate cu succes.');
        }
        catch (err) {
            alert('❌ Eroare la salvare: ' + err.message);
        }
    }
    async function handleReload() {
        try {
            const newDbs = await loadDatabasesFromUpload();
            onDatabasesReloaded(newDbs);
            alert('📤 Bazele de date au fost reîncărcate cu succes.');
        }
        catch (err) {
            alert('❌ Eroare la reîncărcare: ' + err.message);
        }
    }
    return (_jsxs("div", { className: "\r\n        fixed bottom-0 left-0 w-full\r\n        bg-slate-800/70 backdrop-blur-md\r\n        text-white text-sm flex justify-between\r\n        items-center px-6 py-2\r\n        border-t border-slate-700 shadow-inner z-50\r\n      ", children: [_jsx("button", { onClick: onMenuToggle, className: "flex items-center gap-2 bg-slate-700 hover:bg-slate-600 rounded-xl px-3 py-2", "aria-label": "Deschide/\u00EEnchide meniul lateral", title: "Meniu", children: _jsx(Menu, { className: "w-5 h-5" }) }), _jsxs("div", { className: "flex gap-4", children: [_jsx("button", { onClick: handleReload, className: "flex items-center gap-2 bg-blue-600 hover:bg-blue-700 rounded-xl px-4 py-2 transition-all active:scale-95 shadow-lg", children: "\uD83D\uDCE4 Re\u00EEncarc\u0103" }), _jsx("button", { onClick: handleSave, className: "flex items-center gap-2 bg-green-600 hover:bg-green-700 rounded-xl px-4 py-2 transition-all active:scale-95 shadow-lg", children: "\uD83D\uDCBE Salveaz\u0103" })] })] }));
}
