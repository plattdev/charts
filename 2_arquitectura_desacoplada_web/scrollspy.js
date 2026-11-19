/**
 * Chart Index Scrollspy Module:
 * Synchronizes aria-current with CSS :target-current when scroll-target-group
 * is natively supported, and falls back to IntersectionObserver otherwise.
 */

(() => {
  function initChartIndexScrollspy() {
    const nav = document.querySelector(".chart-index-nav");
    if (!nav) return;

    const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    if (links.length === 0) return;

    const sectionEntries = links
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
        const currentLink = nav.querySelector("a:target-current");
        setAriaCurrent(currentLink);
      };

      syncAriaCurrent();
      document.addEventListener("scrollend", syncAriaCurrent);
      window.addEventListener("hashchange", () => {
        requestAnimationFrame(syncAriaCurrent);
      });
      return;
    }

    // Fallback for browsers without scroll-target-group (Firefox, Safari, older browsers)
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

    for (const { section } of sectionEntries) {
      observer.observe(section);
    }

    for (const { id, link } of sectionEntries) {
      link.addEventListener("click", () => {
        setFallbackActive(id);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", initChartIndexScrollspy);
})();
