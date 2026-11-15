// Applies the saved theme before first paint to avoid a light/dark flash.
// Kept as an external file (not inline) so the CSP can stay `script-src 'self'`.
(function () {
  try {
    var stored = localStorage.getItem("aos-theme");
    var dark = stored === "dark" || ((!stored || stored === "system") && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    // Accent colour and font style (src/lib/appearance.ts), so the first paint already has them.
    var accent = localStorage.getItem("aos-accent");
    var font = localStorage.getItem("aos-font");
    document.documentElement.setAttribute("data-accent", /^[a-z]{3,12}$/.test(accent || "") ? accent : "indigo");
    document.documentElement.setAttribute("data-font", /^[a-z]{3,12}$/.test(font || "") ? font : "modern");
  } catch (e) {
    /* localStorage unavailable – fall back to light */
  }
})();
