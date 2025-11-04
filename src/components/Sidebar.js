import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from "framer-motion";
import { Home, Calendar, BarChart2, Users, UserMinus, Coins, Menu, FileText } from "lucide-react";
export default function Sidebar({ isOpen, onToggle, onSelect }) {
    // Adăugat itemul "statistici" la lista existentă
    const items = [
        { id: "sume-lunare", icon: BarChart2, label: "Sume lunare" },
        { id: "generare-luna", icon: Calendar, label: "Generare lună" },
        { id: "vizualizare-lunara", icon: Home, label: "Vizualizare lunară" },
        { id: "vizualizare-anuala", icon: BarChart2, label: "Vizualizare anuală" },
        { id: "adauga-membru", icon: Users, label: "Adăugare membru" },
        { id: "sterge-membru", icon: UserMinus, label: "Ștergere membru" },
        { id: "dividende", icon: Coins, label: "Dividende" },
        { id: "statistici", icon: BarChart2, label: "Statistici" },
        { id: "listari", icon: FileText, label: "Chitanțe" },
    ];
    return (_jsxs(motion.div, { animate: { width: isOpen ? 220 : 72 }, className: "\n        fixed left-0 top-0 bottom-0 z-40\n        bg-slate-900/90 backdrop-blur-md text-white\n        flex flex-col justify-between border-r border-slate-700 shadow-xl\n        overflow-hidden transition-all\n      ", children: [_jsx("div", { className: "flex flex-col mt-4 space-y-1", children: items.map(({ id, icon: Icon, label }) => (_jsxs("button", { onClick: () => onSelect(id), className: "\n              flex items-center gap-3 px-3 py-2 rounded-lg mx-2\n              hover:bg-slate-700 transition-all\n              text-sm text-left\n            ", children: [_jsx(Icon, { className: "w-5 h-5" }), isOpen && _jsx("span", { children: label })] }, id))) }), _jsx("button", { onClick: onToggle, className: "\n          mb-4 mx-auto flex items-center justify-center\n          bg-slate-700 hover:bg-slate-600\n          w-10 h-10 rounded-full transition\n        ", title: "Deschide / \u00CEnchide meniu", "aria-label": "Toggle sidebar", children: _jsx(Menu, { className: "w-5 h-5" }) })] }));
}
