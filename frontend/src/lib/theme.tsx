import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
export type FontSize = "sm" | "md" | "lg" | "xl";
type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  fontSize: FontSize;
  setFontSize: (f: FontSize) => void;
  animations: boolean;
  setAnimations: (a: boolean) => void;
};

const ThemeContext = createContext<Ctx>({
  theme: "light",
  setTheme: () => {},
  fontSize: "md",
  setFontSize: () => {},
  animations: false,
  setAnimations: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [fontSize, setFontSizeState] = useState<FontSize>("xl");
  const [animations, setAnimationsState] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = localStorage.getItem("reef-theme") as Theme | null;
    const f = localStorage.getItem("reef-font-size") as FontSize | null;
    const a = localStorage.getItem("reef-animations");
    if (t === "dark" || t === "light") {
      setThemeState(t);
      document.documentElement.classList.toggle("dark", t === "dark");
    } else {
      document.documentElement.classList.add("dark");
    }
    if (f && ["sm", "md", "lg", "xl"].includes(f)) {
      setFontSizeState(f);
      document.documentElement.setAttribute("data-font-size", f);
    } else {
      document.documentElement.setAttribute("data-font-size", "xl");
    }
    const on = a === null ? true : a === "on";
    setAnimationsState(on);
    document.documentElement.setAttribute("data-animations", on ? "on" : "off");
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    try { localStorage.setItem("reef-theme", t); } catch {}
  };
  const setFontSize = (f: FontSize) => {
    setFontSizeState(f);
    document.documentElement.setAttribute("data-font-size", f);
    try { localStorage.setItem("reef-font-size", f); } catch {}
  };
  const setAnimations = (a: boolean) => {
    setAnimationsState(a);
    document.documentElement.setAttribute("data-animations", a ? "on" : "off");
    try { localStorage.setItem("reef-animations", a ? "on" : "off"); } catch {}
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, fontSize, setFontSize, animations, setAnimations }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
