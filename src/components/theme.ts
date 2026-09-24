export function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function setDarkMode(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("theme", dark ? "dark" : "light");
  document.querySelector('meta[name="theme-color"][media]')?.setAttribute("content", dark ? "#E03A52" : "#C8102E");
  document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute("content", dark ? "#E03A52" : "#C8102E");
}
