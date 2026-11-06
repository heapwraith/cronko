// Apply the stored theme before first paint to avoid a flash.
// Kept as an external file so the CSP can forbid inline scripts.
try {
  const t = localStorage.getItem("cronko_theme") || "light"
  const dark =
    t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
} catch (_) {}
