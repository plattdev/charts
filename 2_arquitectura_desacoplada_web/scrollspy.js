/**
 * Chart Index Scrollspy Module:
 * Synchronizes aria-current with CSS :target-current when native CSS
 * scroll-target-group is supported, and falls back to IntersectionObserver otherwise.
 */

(() => {
  "use strict";

  function initChartIndexScrollspy() {
    const nav = document.querySelector(".chart-index-nav");
    if (!nav) return;

    const sectionEntries = Array.from(nav.querySelectorAll('a[href^="#"]'))
      .map((link) => {
        const id = link.getAttribute("href").slice(1);
        const section = id ? document.getElementById(id) : null;
        return section ? { id, link, section } : null;
      })
      .filter(Boolean);

    if (sectionEntries.length === 0) return;

    const setAriaCurrent = (activeLink) => {
      for (const { link } of sectionEntries) {
        link.setAttribute("aria-current", link === activeLink ? "true" : "false");
      }
    };

    const setFallbackActive = (activeId) => {
      for (const { id, link } of sectionEntries) {
        const isActive = id === activeId;
        link.classList.toggle("target-current", isActive);
        link.setAttribute("aria-current", isActive ? "true" : "false");
      }
    };

    if (CSS.supports("scroll-target-group: auto")) {
      const syncAriaCurrent = () => {
        setAriaCurrent(nav.querySelector("a:target-current"));
      };

      syncAriaCurrent();
      document.addEventListener("scrollend", syncAriaCurrent, { passive: true });
      window.addEventListener("hashchange", () => requestAnimationFrame(syncAriaCurrent));
      return;
    }

    const initialHashId = window.location.hash.slice(1);
    const initialMatch = sectionEntries.find((entry) => entry.id === initialHashId);
    setFallbackActive(initialMatch ? initialMatch.id : sectionEntries[0].id);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setFallbackActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    for (const { id, link, section } of sectionEntries) {
      observer.observe(section);
      link.addEventListener("click", () => setFallbackActive(id));
    }
  }

  document.addEventListener("DOMContentLoaded", initChartIndexScrollspy);
})();
