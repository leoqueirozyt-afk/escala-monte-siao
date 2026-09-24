import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { setDarkMode as applyDarkMode, isDark } from "./theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(isDark);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    applyDarkMode(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={dark ? "Modo claro" : "Modo escuro"}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
