// Applies the saved theme before first paint to avoid a light/dark flash.
// Kept as an external file (not inline) so the CSP can stay `script-src 'self'`.
(function () {
  try {
    var stored = localStorage.getItem("aos-theme");
    var dark = stored === "dark" || ((!stored || stored === "system") && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {
    /* localStorage unavailable – fall back to light */
  }
})();
