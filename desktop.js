/**
 * TSO Bolech - Automatický Desktop / PC Engine (desktop.js)
 * Aktivuje se automaticky pro všechny uživatele podle šířky obrazovky:
 * - PC / notebook (šířka >= 900px): aktivuje desktop-mode a zednické (masonry) rozvržení
 * - Mobil / menší displej (< 900px): ponechává čistou mobilní verzi
 */

(function () {
  'use strict';

  let desktopResizeObserver = null;
  let mutationObserver = null;
  let masonryDebounceTimer = null;

  // Media query pro detekci PC / monitoru (od šířky 900px)
  const desktopMediaQuery = window.matchMedia('(min-width: 900px)');

  // Výpočet a nastavení počtu span řádků pro kartu i admin lištu (krok 8px, mezera 20px)
  function updateCardMasonrySpan(item) {
    if (!document.body.classList.contains('desktop-mode')) {
      item.style.gridRowEnd = '';
      return;
    }

    const rowHeight = 8;
    const rowGap = 20;
    const height = item.getBoundingClientRect().height;
    if (height === 0) return;

    // U admin lišty přidáme mírný odstup, aby karty nebyly nalepené přímo na ní
    const extraMargin = item.classList.contains('admin-actions') ? 8 : 0;
    const span = Math.ceil((height + rowGap + extraMargin) / (rowHeight + rowGap));
    item.style.gridRowEnd = `span ${span}`;
  }

  // Přepočet všech položek v Akcích i Historii
  function refreshDesktopMasonry() {
    if (!document.body.classList.contains('desktop-mode')) return;

    const containers = [
      document.getElementById('eventsContainer'),
      document.getElementById('archiveContainer')
    ];

    if (!desktopResizeObserver) {
      desktopResizeObserver = new ResizeObserver(entries => {
        if (!document.body.classList.contains('desktop-mode')) return;
        for (const entry of entries) {
          updateCardMasonrySpan(entry.target);
        }
      });
    }

    containers.forEach(cont => {
      if (!cont) return;
      const items = cont.querySelectorAll('.admin-actions, .card-flip-container, .card-oznameni');
      items.forEach(el => {
        updateCardMasonrySpan(el);
        desktopResizeObserver.observe(el);
      });
    });
  }

  // Sledování změn v DOM (při překreslení akcí nebo synchronizaci na pozadí)
  function setupDomMutationWatcher() {
    if (mutationObserver) return;

    const containers = [
      document.getElementById('eventsContainer'),
      document.getElementById('archiveContainer')
    ];

    mutationObserver = new MutationObserver(() => {
      if (!document.body.classList.contains('desktop-mode')) return;
      clearTimeout(masonryDebounceTimer);
      masonryDebounceTimer = setTimeout(refreshDesktopMasonry, 40);
    });

    containers.forEach(c => {
      if (c) {
        mutationObserver.observe(c, { childList: true });
      }
    });
  }

  // Automatické vyhodnocení velikosti displeje
  function applyResponsiveLayout() {
    const isDesktop = desktopMediaQuery.matches;

    if (isDesktop) {
      if (!document.body.classList.contains('desktop-mode')) {
        document.body.classList.add('desktop-mode');
      }
      setTimeout(refreshDesktopMasonry, 40);
    } else {
      if (document.body.classList.contains('desktop-mode')) {
        document.body.classList.remove('desktop-mode');
        // Vyčistit zednické styly na mobilu
        document.querySelectorAll('#eventsContainer [style*="grid-row-end"], #archiveContainer [style*="grid-row-end"]').forEach(el => {
          el.style.gridRowEnd = '';
        });
      }
    }
  }

  // Inicializace při startu
  function initDesktopMode() {
    applyResponsiveLayout();
    setupDomMutationWatcher();

    // Dynamická reakce na otočení zařízení nebo změnu velikosti okna prohlížeče
    if (desktopMediaQuery.addEventListener) {
      desktopMediaQuery.addEventListener('change', applyResponsiveLayout);
    } else if (desktopMediaQuery.addListener) {
      desktopMediaQuery.addListener(applyResponsiveLayout);
    }
  }

  // Zpřístupnění do globálního window pro případné volání
  window.initDesktopMode = initDesktopMode;
  window.refreshDesktopMasonry = refreshDesktopMasonry;

  // Automatické napojení na stávající funkce aplikace
  function hookIntoApp() {
    if (typeof window.initApp === 'function') {
      const originalInitApp = window.initApp;
      window.initApp = function () {
        originalInitApp.apply(this, arguments);
        initDesktopMode();
      };
    }

    if (typeof window.renderEvents === 'function') {
      const originalRenderEvents = window.renderEvents;
      window.renderEvents = function () {
        originalRenderEvents.apply(this, arguments);
        if (desktopMediaQuery.matches) {
          setTimeout(refreshDesktopMasonry, 30);
        }
      };
    }

    // Pokud je DOM již připraven
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initDesktopMode();
    } else {
      document.addEventListener('DOMContentLoaded', initDesktopMode);
    }
  }

  hookIntoApp();
})();