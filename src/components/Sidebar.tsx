import { motion } from "framer-motion";
import { Home, Calendar, BarChart2, Users, UserMinus, Coins, Menu, X } from "lucide-react";
import { useState } from "react";

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (module: string) => void;
}

export default function Sidebar({ isOpen, onToggle, onSelect }: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const items = [
    { id: "sume-lunare", icon: BarChart2, label: "Sume lunare" },
    { id: "generare-luna", icon: Calendar, label: "Generare lună" },
    { id: "vizualizare-lunara", icon: Home, label: "Vizualizare lunară" },
    { id: "vizualizare-anuala", icon: BarChart2, label: "Vizualizare anuală" },
    { id: "adauga-membru", icon: Users, label: "Adăugare membru" },
    { id: "sterge-membru", icon: UserMinus, label: "Ștergere membru" },
    { id: "dividende", icon: Coins, label: "Dividende" },
  ];

  function handleMobileSelect(moduleId: string) {
    onSelect(moduleId);
    setMobileMenuOpen(false);
  }

  return (
    <>
      {/* ========================================
          DESKTOP SIDEBAR - Păstrat exact ca înainte
          ======================================== */}
      <motion.div
        animate={{ width: isOpen ? 220 : 72 }}
        className="
          hidden lg:flex
          fixed left-0 top-0 bottom-0 z-40
          bg-slate-900/90 backdrop-blur-md text-white
          flex-col justify-between border-r border-slate-700 shadow-xl
          overflow-hidden transition-all
        "
      >
        <div className="flex flex-col mt-4 space-y-1">
          {items.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className="
                flex items-center gap-3 px-3 py-2 rounded-lg mx-2
                hover:bg-slate-700 transition-all
                text-sm text-left
              "
            >
              <Icon className="w-5 h-5" />
              {isOpen && <span>{label}</span>}
            </button>
          ))}
        </div>

        {/* Buton glisare DESKTOP */}
        <button
          onClick={onToggle}
          className="
            mb-4 mx-auto flex items-center justify-center
            bg-slate-700 hover:bg-slate-600
            w-10 h-10 rounded-full transition
          "
          title="Deschide / Închide meniu"
        >
          {isOpen ? "◀" : "▶"}
        </button>
      </motion.div>

      {/* ========================================
          MOBILE HAMBURGER BUTTON - Colț stânga jos
          ======================================== */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="
          lg:hidden
          fixed bottom-20 left-4 z-50
          bg-slate-900 hover:bg-slate-800
          text-white
          w-14 h-14 rounded-full
          flex items-center justify-center
          shadow-2xl
          transition-all active:scale-95
          border-2 border-slate-700
        "
        title="Deschide meniu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* ========================================
          MOBILE DRAWER - Sheet/Overlay
          ======================================== */}
      {mobileMenuOpen && (
        <>
          {/* Overlay */}
          <div
            className="
              lg:hidden
              fixed inset-0 z-50
              bg-black/50 backdrop-blur-sm
              transition-opacity
            "
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="
              lg:hidden
              fixed left-0 top-0 bottom-0 z-50
              w-[280px]
              bg-slate-900 text-white
              shadow-2xl
              flex flex-col
              border-r border-slate-700
            "
          >
            {/* Header */}
            <div className="
              flex items-center justify-between
              px-4 py-4
              border-b border-slate-700
            ">
              <h2 className="text-lg font-semibold">Meniu</h2>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="
                  p-2 rounded-lg
                  hover:bg-slate-800
                  transition-colors
                "
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Menu Items */}
            <div className="flex-1 overflow-y-auto py-4">
              <div className="flex flex-col space-y-1 px-2">
                {items.map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    onClick={() => handleMobileSelect(id)}
                    className="
                      flex items-center gap-3
                      px-4 py-3 rounded-lg
                      hover:bg-slate-800
                      transition-all
                      text-left
                    "
                  >
                    <Icon className="w-5 h-5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </>
  );
}