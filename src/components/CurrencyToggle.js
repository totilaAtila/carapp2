import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { getAccessMode } from '../services/databaseManager';
export default function CurrencyToggle({ databases, onCurrencyChange }) {
    const access = getAccessMode(databases);
    // Ascunde toggle dacă nu există baze EUR
    if (!access.showToggle) {
        return null;
    }
    const handleSwitch = (currency) => {
        if (databases.activeCurrency === currency)
            return; // Deja pe această monedă
        onCurrencyChange(currency);
    };
    return (_jsxs("div", { className: "flex items-center gap-3 px-4 py-2 bg-slate-800/90 rounded-lg border border-slate-600/50 backdrop-blur-sm", children: [_jsx("span", { className: "text-xs font-medium text-slate-400 uppercase tracking-wide", children: "Moned\u0103:" }), _jsxs("div", { className: "flex rounded-lg overflow-hidden border border-slate-600", children: [_jsx("button", { onClick: () => handleSwitch("RON"), disabled: databases.activeCurrency === "RON", className: `
            px-4 py-1.5 font-bold text-sm transition-all duration-200
            ${databases.activeCurrency === "RON"
                            ? "bg-blue-600 text-white cursor-default shadow-lg shadow-blue-600/50"
                            : "bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-500"}
          `, children: "RON" }), _jsx("button", { onClick: () => handleSwitch("EUR"), disabled: databases.activeCurrency === "EUR", className: `
            px-4 py-1.5 font-bold text-sm transition-all duration-200 border-l border-slate-600
            ${databases.activeCurrency === "EUR"
                            ? "bg-green-600 text-white cursor-default shadow-lg shadow-green-600/50"
                            : "bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-500"}
          `, children: "EUR" })] }), _jsx("div", { className: "flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-700/50 border border-slate-600/30", children: access.canWriteRon || access.canWriteEur ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-green-400 text-sm", children: "\u2705" }), _jsx("span", { className: "text-xs font-medium text-green-300", children: "Citire + Scriere" })] })) : (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-orange-400 text-sm", children: "\uD83D\uDC41\uFE0F" }), _jsx("span", { className: "text-xs font-medium text-orange-300", children: "Doar Citire" })] })) })] }));
}
