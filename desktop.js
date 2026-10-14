/**
 * TSO Bolech - Desktop / PC Mode Engine (desktop.js)
 * Samostatný modul pro správu PC režimu a zednického (masonry) rozvržení karet.
 * Aktivuje se pouze pro roli Admin a nezasahuje do mobilní verze.
 */

(function () {
  'use strict';

  let desktopResizeObserver = null;
  let mutationObserver = null;
  let masonryDebounceTimer = null;

  // Ověření, zda je přihlášený uživatel Admin
  function isCurrentUserAdmin() {
    try {
      if (typeof user !== 'undefined' && user && user.role) {
        return String(user.role).trim().toLowerCase().includes('admin');
      }
      const saved = localStorage.getItem('bolech_auth_member');
      if (saved) {
        const u = JSON.parse(saved);
        return String(u.role || '').trim().toLowerCase().includes('admin');
      }
    } catch (e) {
      console.warn('desktop.js: Chyba při ověřování role:', e);
    }
    return false;
  }

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

  // Přepočet všech položek (admin panel, akce i informace) v Akcích i Historii
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
      // Zahrnujeme i .admin-actions, aby karty neskočily přes ovládací tlačítka
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

  // Aktualizace ikony v záhlaví
  function updateLayoutIcon(isDesktop) {
    const icon = document.getElementById('layout-icon');
    const btn = document.getElementById('layoutToggleBtn');
    if (icon) {
      icon.innerText = isDesktop ? '📱' : '🖥️';
    }
    if (btn) {
      btn.title = isDesktop ? 'Přepnout na mobilní zobrazení (Admin)' : 'Přepnout na PC zobrazení (Admin)';
    }
  }

  // Inicializace režimu při startu aplikace
  function initDesktopMode() {
    const btn = document.getElementById('layoutToggleBtn');
    const isAdmin = isCurrentUserAdmin();

    if (!isAdmin) {
      document.body.classList.remove('desktop-mode');
      if (btn) btn.style.display = 'none';
      return;
    }

    // Admin má tlačítko viditelné
    if (btn) btn.style.display = 'inline-flex';

    const savedMode = localStorage.getItem('bolech_layout_mode');
    if (savedMode === 'desktop') {
      document.body.classList.add('desktop-mode');
      updateLayoutIcon(true);
      setTimeout(refreshDesktopMasonry, 50);
    } else if (savedMode === 'mobile') {
      document.body.classList.remove('desktop-mode');
      updateLayoutIcon(false);
    } else {
      // Automatická detekce při prvním spuštění na PC (myš/touchpad + široké okno)
      const isPC = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)').matches;
      if (isPC) {
        document.body.classList.add('desktop-mode');
        updateLayoutIcon(true);
        setTimeout(refreshDesktopMasonry, 50);
      } else {
        document.body.classList.remove('desktop-mode');
        updateLayoutIcon(false);
      }
    }

    setupDomMutationWatcher();
  }

  // Přepnutí režimu kliknutím na tlačítko
  function toggleLayoutMode() {
    if (!isCurrentUserAdmin()) return;
    const isDesktop = document.body.classList.toggle('desktop-mode');
    localStorage.setItem('bolech_layout_mode', isDesktop ? 'desktop' : 'mobile');
    updateLayoutIcon(isDesktop);

    if (isDesktop) {
      setTimeout(refreshDesktopMasonry, 50);
    } else {
      document.querySelectorAll('#eventsContainer [style*="grid-row-end"], #archiveContainer [style*="grid-row-end"]').forEach(el => {
        el.style.gridRowEnd = '';
      });
    }
  }

  // Zpřístupnění do globálního window pro onclick v HTML
  window.toggleLayoutMode = toggleLayoutMode;
  window.initDesktopMode = initDesktopMode;
  window.refreshDesktopMasonry = refreshDesktopMasonry;

  // Automatické napojení na stávající funkce app.js (bez nutnosti je upravovat)
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
        if (document.body.classList.contains('desktop-mode')) {
          setTimeout(refreshDesktopMasonry, 30);
        }
      };
    }

    // Pokud již byl uživatel přihlášen a DOM je připraven
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initDesktopMode();
    } else {
      document.addEventListener('DOMContentLoaded', initDesktopMode);
    }
  }

  hookIntoApp();
})();