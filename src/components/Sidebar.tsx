import { motion } from "framer-motion";
import { Home, Calendar, BarChart2, Users, UserMinus, Coins } from "lucide-react";

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (module: string) => void;
}

export default function Sidebar({ isOpen, onToggle, onSelect }: Props) {
  const items = [
    { id: "sume-lunare", icon: BarChart2, label: "Sume lunare" },
    { id: "generare-luna", icon: Calendar, label: "Generare lună" },
    { id: "vizualizare-lunara", icon: Home, label: "Vizualizare lunară" },
    { id: "vizualizare-anuala", icon: BarChart2, label: "Vizualizare anuală" },
    { id: "adauga-membru", icon: Users, label: "Adăugare membru" },
    { id: "sterge-membru", icon: UserMinus, label: "Ștergere membru" },
    { id: "dividende", icon: Coins, label: "Dividende" },
  ];

  return (
    <motion.div
      animate={{ width: isOpen ? 220 : 72 }}
      className="
        fixed left-0 top-0 bottom-0 z-40
        bg-slate-900/90 backdrop-blur-md text-white
        flex flex-col justify-between border-r border-slate-700 shadow-xl
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

      {/* Buton glisare */}
      <button
        onClick={onToggle}
        className="
          mb-4 mx-auto flex items-center justify-center
          bg-slate-700 hover:bg-slate-600
          w-10 h-10 rounded-full transition
        "
        title="Deschide / Închide meniu"
      >
        {isOpen ? "⏪" : "⏩"}
      </button>
    </motion.div>
  );
}
