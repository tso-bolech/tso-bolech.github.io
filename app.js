// Registrace a automatická aktualizace Service Workeru
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update();
      setInterval(() => {
        reg.update();
      }, 30 * 60 * 1000);
    }).catch((err) => {
      console.warn('Registrace SW selhala:', err);
    });
  });
}

const API_URL = "https://script.google.com/macros/s/AKfycbwVHLODjApvEPwE4RQo5nQxdr9Y8Ng-EoWTGGsH3l45L174huUMCh_99edIV-cbXQVHQQ/exec";

let user = null; 
let appData = { akce: [], noty: [], ucast: [], clenove: [], zadosti: [], orchestraConfig: {} };

// Seznam vybraných not pro odeslání e-mailem
window.vybraneNotyKEmailu = [];

const PARTITURA_SECTIONS = [
  "1. Housle", "2. Housle", "Violy", "Violoncella", "Kontrabasy", "Baskytara",
  "Flétny", "Hoboje", "Klarinety / Saxofony", "Fagoty", "Lesní rohy", 
  "Trubky", "Trombóny a Tuba", "Bicí nástroje", "Klávesy", "Kytary", "Zpěv", 
  "Smyčce", "Dechy", "Dřeva", "Žestě", "Hosté"
];

// Široké rozvržení pódia (viewBox 660 x 375)
const ORCHESTRA_LAYOUT_CFG = {
  "1. Housle": { type: "strings", centerX: 100, yStart: 320, defaultCap: 10 },
  "2. Housle": { type: "strings", centerX: 250, yStart: 320, defaultCap: 10 },
  "Violy":      { type: "strings", centerX: 410, yStart: 320, defaultCap: 8 },
  "Violoncella":{ type: "strings", centerX: 560, yStart: 320, defaultCap: 8 },

  "Kontrabasy": { type: "row", y: 205, defaultCap: 4 },
  "Baskytara":  { type: "bassguitar", y: 205, defaultCap: 0 },

  "Flétny":               { type: "woodwinds", defaultCap: 4 },
  "Hoboje":               { type: "woodwinds", defaultCap: 3 },
  "Klarinety / Saxofony":{ type: "woodwinds", defaultCap: 4 },
  "Fagoty":               { type: "woodwinds", defaultCap: 3 },
  "Klávesy":              { type: "woodwinds", defaultCap: 2 },
  "Kytary":               { type: "woodwinds", defaultCap: 0 },

  "Lesní rohy":     { type: "brass", y: 78, defaultCap: 4 },
  "Trubky":         { type: "brass", y: 78, defaultCap: 4 },
  "Trombóny a Tuba":{ type: "brass", y: 78, defaultCap: 4 },
  "Bicí nástroje":   { type: "percussion", y: 32, centerX: 330, spacing: 38, defaultCap: 4 }
};

const SMYCKE_SECTIONS = ["housl", "viol", "cell", "kontrabas", "baskytara", "smyčce", "smycce"];
const DECHOVE_SECTIONS = ["flétn", "hoboj", "klarinet", "saxofon", "fagot", "roh", "trubk", "trubc", "trombón", "trombon", "tuba", "tuby", "tubě", "tubou", "dech", "dřev", "žest"];

// Pomocné funkce pro role
function isDirigentPerson(jmeno, sekce, role) {
  const j = String(jmeno || "").toLowerCase();
  const s = String(sekce || "").toLowerCase();
  const r = String(role || "").toLowerCase();
  return r === 'dirigent' || s.includes('dirigent') || j.includes('sycha');
}

// Má uživatel právo tvořit/měnit akce, noty a obsazení? (Admin, Dirigent, Vedení)
function hasEditRights(role) {
  const r = String(role || "").trim().toLowerCase();
  return r.includes('admin') || r.includes('dirigent') || r.includes('vedení') || r.includes('vedeni');
}

// Patří uživatel do vedení nebo je pomocníkem výboru? (Má právo číst interní zprávy)
function isCommitteeMember(role) {
  if (!role) return false;
  const r = String(role).trim().toLowerCase();
  return hasEditRights(r) || r.includes('výbor') || r.includes('vybor') || r.includes('pomocn');
}

// =====================================================
// GLOBÁLNÍ NASTAVENÍ PÍSMA A TÉMATU
// =====================================================
const FONT_LEVELS = [
  { id: 'small',  scale: 0.88, title: 'Malé',        sample: 'Kompaktní zobrazení' },
  { id: 'normal', scale: 1.0,  title: 'Výchozí',     sample: 'Standardní čitelnost' },
  { id: 'large',  scale: 1.15, title: 'Větší',       sample: 'Pohodlné čtení' },
  { id: 'xlarge', scale: 1.3,  title: 'Extra velké', sample: 'Maximální čitelnost' }
];

function initFontSize() {
  const savedScale = localStorage.getItem('bolech_font_scale') || '1';
  document.documentElement.style.setProperty('--font-scale', savedScale);
}
initFontSize();

function setAppFontSize(scaleValue) {
  document.documentElement.style.setProperty('--font-scale', scaleValue);
  localStorage.setItem('bolech_font_scale', String(scaleValue));
  
  document.querySelectorAll('.font-size-option').forEach(el => {
    if (Math.abs(parseFloat(el.dataset.scale) - scaleValue) < 0.02) {
      el.classList.add('active');
      el.querySelector('.font-check').innerText = '✓';
    } else {
      el.classList.remove('active');
      el.querySelector('.font-check').innerText = '';
    }
  });
}

function openFontSizeModal() {
  const currentScale = parseFloat(localStorage.getItem('bolech_font_scale') || '1');
  let optionsHtml = '';
  FONT_LEVELS.forEach(lvl => {
    const isActive = Math.abs(lvl.scale - currentScale) < 0.02;
    optionsHtml += `
      <div class="font-size-option ${isActive ? 'active' : ''}" data-scale="${lvl.scale}" onclick="setAppFontSize(${lvl.scale})">
        <div>
          <div style="font-size: 16px;">${lvl.title}</div>
          <div style="font-size: 13px; color: var(--text-muted);">${lvl.sample}</div>
        </div>
        <div class="font-check" style="font-size: 18px; font-weight: bold; color: var(--primary-light);">${isActive ? '✓' : ''}</div>
      </div>
    `;
  });

  const modalHtml = `
    <div id="fontModal" class="modal-overlay" onclick="if(event.target === this) document.getElementById('fontModal').remove()">
      <div class="modal-box" style="max-width: 380px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
          <h3 style="margin:0; font-size: 19px; color: var(--text);">Velikost písma</h3>
          <button type="button" style="background:transparent; border:none; font-size: 20px; color: var(--text-muted); cursor:pointer;" onclick="document.getElementById('fontModal').remove()">✕</button>
        </div>
        <div style="margin-bottom: 16px;">${optionsHtml}</div>
        <button type="button" class="btn" onclick="document.getElementById('fontModal').remove()">Hotovo</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function initTheme() {
  const savedTheme = localStorage.getItem('bolech_theme');
  if (savedTheme === 'dark') { document.body.classList.add('dark-mode'); updateThemeIcon(true); }
}
function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('bolech_theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);
}
function updateThemeIcon(isDark) {
  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  if (isDark) icon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
  else icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
}
initTheme(); 

// =====================================================
// PŘEPÍNAČ ZOBRAZENÍ: MOBILNÍ VS. PC (POUZE PRO ADMINA)
// =====================================================
function isAdminUser(u = user) {
  if (!u || !u.role) return false;
  return String(u.role).trim().toLowerCase().includes('admin');
}

function initLayoutMode() {
  const btn = document.getElementById('layoutToggleBtn');
  if (!isAdminUser()) {
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
  } else if (savedMode === 'mobile') {
    document.body.classList.remove('desktop-mode');
    updateLayoutIcon(false);
  } else {
    // Automatická detekce při prvním spuštění na PC (myš + široké okno)
    const isPC = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)').matches;
    if (isPC) {
      document.body.classList.add('desktop-mode');
      updateLayoutIcon(true);
    } else {
      document.body.classList.remove('desktop-mode');
      updateLayoutIcon(false);
    }
  }
}

function toggleLayoutMode() {
  if (!isAdminUser()) return;
  const isDesktop = document.body.classList.toggle('desktop-mode');
  localStorage.setItem('bolech_layout_mode', isDesktop ? 'desktop' : 'mobile');
  updateLayoutIcon(isDesktop);
}

function updateLayoutIcon(isDesktop) {
  const icon = document.getElementById('layout-icon');
  const btn = document.getElementById('layoutToggleBtn');
  if (!icon) return;
  icon.innerText = isDesktop ? '📱' : '🖥️';
  if (btn) {
    btn.title = isDesktop ? 'Přepnout na mobilní zobrazení (Admin)' : 'Přepnout na PC zobrazení (Admin)';
  }
}

async function runGoogleScript(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload }),
      redirect: 'follow'
    });
    if (!response.ok) throw new Error('Chyba serveru: ' + response.status);
    return await response.json();
  } catch (error) {
    console.error("Detail chyby sítě:", error); 
    return { success: false, error: error.toString() };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("bolech_auth_member");
  if(saved) { user = JSON.parse(saved); initApp(); } 
  else { document.getElementById("loginScreen").style.display = "block"; }
});

function handleLoginSubmit(e) { 
  e.preventDefault(); 
  
  const loginCard = document.getElementById('loginFormCard');
  const queryVal = document.getElementById('loginQuery').value;
  const pinVal = document.getElementById('loginPin').value;

  loginCard.innerHTML = `
    <div class="welcome-loader-card">
      <div class="welcome-clef-icon">🎼</div>
      <h3 style="margin: 0 0 6px 0; color: var(--text);">Vítejte v Bolechu</h3>
      <div id="loaderStatusMsg" style="font-size: 0.92rem; color: var(--text-muted); min-height: 24px;">
        Ověřuji přihlašovací údaje...
      </div>
      
      <div class="orchestra-progress-track">
        <div id="loaderProgressBar" class="orchestra-progress-bar"></div>
      </div>
      
      <small style="color: var(--text-muted); font-size: 0.78rem;">Při prvním spuštění ladíme orchestrální data</small>
    </div>
  `;

  let progress = 15;
  const bar = document.getElementById('loaderProgressBar');
  const msg = document.getElementById('loaderStatusMsg');
  if (bar) bar.style.width = progress + "%";

  const progressInterval = setInterval(() => {
    progress += Math.floor(Math.random() * 6) + 3;
    if (progress > 90) progress = 90;
    if (bar) bar.style.width = progress + "%";

    if (progress > 25 && progress < 55) {
      if (msg) msg.textContent = "Ladíme nástroje a stahujeme rozpis akcí...";
    } else if (progress >= 55 && progress < 78) {
      if (msg) msg.textContent = "Připravujeme pódium a obsazení...";
    } else if (progress >= 78) {
      if (msg) msg.textContent = "Už jen okamžik, otevíráme pult...";
    }
  }, 450);

  runGoogleScript("authenticateMember", { query: queryVal, pin: pinVal })
  .then(res => { 
    if (res.success) { 
      user = res.member; 

      const jmeno = String(user.name || "").toLowerCase();
      const sekce = String(user.section || "").toLowerCase();
      const role = String(user.role || "").toLowerCase();
      if (sekce.includes('host') || jmeno.includes('host') || role === 'host') {
        user.platnostDo = Date.now() + (14 * 24 * 60 * 60 * 1000); 
      }
      localStorage.setItem('bolech_auth_member', JSON.stringify(user));

      if (res.initialData) {
        appData = res.initialData;
        localStorage.setItem("bolech_data_cache", JSON.stringify(appData));
      }

      clearInterval(progressInterval);
      if (bar) bar.style.width = "100%";
      if (msg) msg.textContent = "Připraveno!";

      setTimeout(() => {
        document.getElementById('loginScreen').style.display = 'none'; 
        initApp(); 
      }, 350);

    } else { 
      clearInterval(progressInterval);
      alert(res.error); 
      location.reload(); 
    } 
  }).catch(err => {
    clearInterval(progressInterval);
    alert("Chyba spojení se serverem: " + err);
    location.reload();
  }); 
}

// =========================================================================
// ZPRÁVY A NOVINKY PRO EDITORY (PO KLIKNUTÍ NA ŽÁROVKU 💡)
// Ukládají se v Google Sheets stejně jako akce (cílová skupina: editory)
// =========================================================================
function initAdminNewsBulb(canEdit) {
  const badgeEl = document.getElementById("userBadge");
  if (!badgeEl) return;

  let bulbBtn = document.getElementById("adminBulbBtn");
  if (!bulbBtn && canEdit) {
    bulbBtn = document.createElement("button");
    bulbBtn.id = "adminBulbBtn";
    bulbBtn.type = "button";
    bulbBtn.title = "Novinky a tipy pro editory";
    bulbBtn.innerHTML = "💡";
    bulbBtn.style.background = "transparent";
    bulbBtn.style.border = "none";
    bulbBtn.style.cursor = "pointer";
    bulbBtn.style.fontSize = "18px";
    bulbBtn.style.padding = "2px 4px";
    bulbBtn.style.marginLeft = "6px";
    bulbBtn.style.verticalAlign = "middle";
    bulbBtn.style.lineHeight = "1";
    bulbBtn.style.display = "inline-flex";
    bulbBtn.style.alignItems = "center";
    bulbBtn.style.justifyContent = "center";
    bulbBtn.style.transition = "transform 0.15s ease";
    bulbBtn.onmouseenter = () => bulbBtn.style.transform = "scale(1.25)";
    bulbBtn.onmouseleave = () => bulbBtn.style.transform = "scale(1)";
    bulbBtn.onclick = (e) => {
      if (e) e.stopPropagation();
      openAdminNewsModal();
    };
    badgeEl.insertAdjacentElement("afterend", bulbBtn);
  } else if (bulbBtn) {
    bulbBtn.style.display = canEdit ? "inline-flex" : "none";
  }
}

function openAdminNewsForm() {
  const existing = document.getElementById('adminNewsModal');
  if (existing) existing.remove();

  checkAndOpenAkceForm(null);
  setTimeout(() => {
    const typSel = document.getElementById('f_typ');
    if (typSel) {
      typSel.value = 'Informace';
      toggleAkceFields();
    }
    const csSel = document.getElementById('f_cilovaSkupina');
    if (csSel) {
      csSel.value = 'editory';
    }
    const nazevIn = document.getElementById('f_nazev');
    if (nazevIn) {
      nazevIn.placeholder = 'např. Důležité novinky v zadávání zkoušek...';
      nazevIn.focus();
    }
  }, 80);
}

function openAdminNewsModal() {
  const existing = document.getElementById('adminNewsModal');
  if (existing) { existing.remove(); return; }

  // Načteme všechny položky určené pro editory seřazené od nejnovější
  const newsItems = (appData.akce || [])
    .filter(a => {
      const cs = String(a.cilovaSkupina || '').trim().toLowerCase();
      const t = String(a.typ || '').trim();
      return cs === 'editory' || t === 'Informace pro editory';
    })
    .sort((a, b) => parseDate(b.datum) - parseDate(a.datum));

  let newsHtml = '';
  if (newsItems.length === 0) {
    newsHtml = `
      <div style="text-align: center; padding: 28px 12px; color: var(--text-muted); font-size: 14px;">
        Zatím nebyly vloženy žádné zprávy pro editory.
      </div>
    `;
  } else {
    newsItems.forEach(item => {
      const parsed = parsovatPoznamku(item.poznamka);
      const canEdit = hasEditRights(user.role);
      const editBtn = canEdit ? `
        <button type="button" style="background: transparent; border: 1px solid var(--border); border-radius: 4px; padding: 3px 8px; font-size: 12px; color: var(--primary-light); cursor: pointer; white-space:nowrap;" onclick="document.getElementById('adminNewsModal').remove(); checkAndOpenAkceForm('${escapeHtml(item.id)}');" title="Upravit položku">
          ✏️ Upravit
        </button>
      ` : '';

      newsHtml += `
        <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px; gap: 8px;">
            <div>
              <strong style="font-size: 15px; color: var(--text); display: block;">${escapeHtml(item.nazev)}</strong>
              <span style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;">${escapeHtml(formatDisplayDate(item.datum))}</span>
            </div>
            ${editBtn}
          </div>
          ${parsed.mainNote ? `<div style="font-size: 13.5px; line-height: 1.5; color: var(--text); margin-bottom: 4px;">${formatRichText(parsed.mainNote)}</div>` : ''}
          ${formatHarmonogramHtml(parsed.schedData)}
          ${formatProgramHtml(parsed.progData)}
        </div>
      `;
    });
  }

  const isAdmin = isAdminUser(user);
  const addBtnHtml = isAdmin ? `
    <button type="button" class="btn" style="background: var(--success); color: white; width: 100%; margin-bottom: 14px; font-size: 13.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px;" onclick="openAdminNewsForm()">
      ➕ Přidat novou zprávu pro editory
    </button>
  ` : '';

  const html = `
    <div id="adminNewsModal" class="modal-overlay" style="padding: 6px;" onclick="if(event.target===this) document.getElementById('adminNewsModal').remove()">
      <div class="modal-box" style="max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto;">
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
          <div style="display:flex; align-items:center; gap: 8px;">
            <span style="font-size: 22px;">💡</span>
            <div>
              <h3 style="margin:0; font-size: 1.15rem; color: var(--text);">Novinky a pokyny pro editory</h3>
              <small style="color: var(--primary-light); font-weight: 700; font-size: 11px;">🔒 Viditelné pouze pro vedení a dirigenty</small>
            </div>
          </div>
          <button type="button" style="background:transparent; border:none; font-size:22px; color:var(--text-muted); cursor:pointer; padding: 4px;" onclick="document.getElementById('adminNewsModal').remove()">✕</button>
        </div>

        ${addBtnHtml}

        <div style="margin-bottom: 16px;">
          ${newsHtml}
        </div>

        <button type="button" class="btn" style="width: 100%; background: var(--primary); font-weight: 700;" onclick="document.getElementById('adminNewsModal').remove()">
          Zavřít
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
}

function initApp() {
  document.getElementById("mainApp").style.display = "block";
  document.getElementById("userBadge").innerText = user.name;
  initLayoutMode();
  
  const userRole = String(user.role || "").trim().toLowerCase();
  const canEdit = hasEditRights(user.role) || userRole.includes('veden') || userRole.includes('admin');
  initAdminNewsBulb(canEdit);
  const jeDirigent = userRole === 'dirigent';
  
  // 1. Zobrazení dolní záložky "Archiv not"
  const adminNavBtn = document.getElementById('btn-nav-admin');
  if (adminNavBtn) {
    adminNavBtn.style.display = canEdit ? 'flex' : 'none';
  }

  // 2. Zobrazení tlačítka historie hodin ⏱ v horní liště
  const cachedData = localStorage.getItem("bolech_data_cache");
  if (cachedData) { 
    appData = JSON.parse(cachedData); 
    renderEvents(); 
    vykresliNoty(appData.noty || [], user.section, jeDirigent);
    if (canEdit) vykresliAdminNoty();
  } else if (appData && appData.akce && appData.akce.length > 0) {
    renderEvents();
    vykresliNoty(appData.noty || [], user.section, jeDirigent);
    if (canEdit) vykresliAdminNoty();
  }

  runGoogleScript("getInitialData").then(d => { 
    if(d && d.akce) {
      appData = d; 
      localStorage.setItem("bolech_data_cache", JSON.stringify(appData));
      renderEvents(); 
      vykresliNoty(appData.noty || [], user.section, jeDirigent);
      if (canEdit) vykresliAdminNoty();
    }
  });
}

const CZECH_DAYS_SHORT = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  if (/^(Po|Út|Ut|St|Čt|Ct|Pá|Pa|So|Ne)\b/i.test(s)) {
    return s;
  }
  const match = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (match) {
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const y = parseInt(match[3], 10);
    const dateObj = new Date(y, m, d);
    const dayName = CZECH_DAYS_SHORT[dateObj.getDay()];
    return `${dayName} ${d}. ${m + 1}. ${y}`;
  }
  return s;
}

function parseDate(dateStr) {
  if (!dateStr) return 0;
  const match = String(dateStr).match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (match) {
    return new Date(parseInt(match[3], 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10)).getTime();
  }
  return new Date(dateStr).getTime() || 0;
}

function formatDisplayTime(timeStr) {
  if (!timeStr) return "";
  const s = String(timeStr).trim();
  // Pokud Google Sheets pošle ISO formát s UTC časem (např. 1899-12-30T19:00:00.000Z)
  if (s.includes('T') && (s.endsWith('Z') || s.includes('+') || s.includes('-'))) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  }
  // Běžný textový formát (např. "20:00" nebo "9:30")
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hh = match[1].padStart(2, '0');
    const mm = match[2];
    return `${hh}:${mm}`;
  }
  return s;
}

function parseTimeToMinutes(timeStr) {
  const clean = formatDisplayTime(timeStr);
  if (!clean) return 0;
  const match = clean.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }
  return 0;
}

function getAkceBarInfo(akce) {
  const typ = String(akce.typ || "").trim();
  let barClass = 'bar-tutti';
  let abbr = 'Tu';

  if (typ === 'Koncert') {
    barClass = 'bar-koncert';
    abbr = 'Ko';
  } else if (typ === 'Generálka') {
    barClass = 'bar-generalka';
    abbr = 'Gz';
  } else if (typ === 'Zkouška smyčců') {
    barClass = 'bar-zkouska-smycce';
    abbr = 'Sm';
  } else if (typ === 'Zkouška dechů') {
    barClass = 'bar-zkouska-dechy';
    abbr = 'Dch';
  }

  return { typ, barClass, abbr };
}

function escapeHtml(str) { return String(str||'').replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag])); }

// Bezpečný převod formátování (Markdown + auto links)
function formatRichText(raw) {
  if (!raw) return "";
  let text = escapeHtml(raw);

  // **tučně**
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // *kurzíva*
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // __podtržení__
  text = text.replace(/__(.*?)__/g, '<u>$1</u>');

  // Klikací webové odkazy
  text = text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

  // Odrážky na začátku řádku (- nebo •)
  const lines = text.split('\n');
  let result = '';

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      const itemContent = trimmed.substring(2);
      result += `<div class="list-item"><span class="list-bullet">•</span><span class="list-content">${itemContent}</span></div>`;
    } else {
      result += lines[i];
    }
  }

  return result;
}

function insertFormatTag(prefix, suffix = prefix) {
  const textarea = document.getElementById('f_poznamka');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);

  if (prefix === 'LINK') {
    const url = prompt("Zadejte URL adresu (např. https://drive.google.com):", "https://");
    if (!url) return;
    const replacement = url;
    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + replacement.length, start + replacement.length);
    return;
  }

  const replacement = prefix + (selectedText || (prefix === '- ' ? 'položka' : 'text')) + suffix;
  textarea.value = text.substring(0, start) + replacement + text.substring(end);

  textarea.focus();
  if (selectedText.length > 0) {
    textarea.setSelectionRange(start, start + replacement.length);
  } else {
    const newCursor = start + prefix.length;
    textarea.setSelectionRange(newCursor, newCursor + (prefix === '- ' ? 7 : 4));
  }
}

function generovatIdAkce(typ) {
  let prefix = 'akce_';
  const t = String(typ).toLowerCase();
  if (t.includes('koncert')) prefix = 'kon_';
  else if (t.includes('generálka')) prefix = 'gen_';
  else if (t.includes('zkouška') || t.includes('zkouska')) prefix = 'zk_'; 
  else if (t.includes('informace') || t.includes('oznámení')) prefix = 'info_';

  let max = 0;
  (appData.akce || []).forEach(a => {
    if (a.id && String(a.id).startsWith(prefix)) {
      let num = parseInt(String(a.id).replace(prefix, ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return prefix + String(max + 1).padStart(3, '0');
}

// Zabezpečené filtrování: Kdo jakou akci v kalendáři vidí
function isEventVisibleForUser(akce) {
  if (!akce) return false;

  const typ = String(akce.typ || "").trim();
  const jeInfo = typ.includes("Oznámení") || typ.includes("Informace");
  const cilovaSkupina = String(akce.cilovaSkupina || "vsichni").trim().toLowerCase();
  const userRole = String(user.role || "").trim().toLowerCase();
  const userSecL = String(user.section || "").toLowerCase();

  // 1. Zprávy pro editory jsou určeny výhradně do plovoucího okna žárovky 💡
  if (cilovaSkupina === "editory" || typ === "Informace pro editory") {
    return false;
  }

  // 2. Pomocné vnitřní ověření: Diriguje přihlášený uživatel tuto akci?
  const clean = str => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const uName = clean(user.name);
  
  // Hledáme v kolonce dirigent, ale pro jistotu i v poznámce a názvu
  const dirField = clean(akce.dirigent);
  const poznamkaField = clean(akce.poznamka);
  const nazevField = clean(akce.nazev);
  const prohledavanyText = `${dirField} ${poznamkaField} ${nazevField}`;

  let jaJsemDirigent = false;
  if (uName && prohledavanyText) {
    if (prohledavanyText.includes(uName)) {
      jaJsemDirigent = true;
    } else {
      // Shoda po slovech delších než 2 znaky (např. shoda pouze příjmení)
      const uWords = uName.split(/\s+/).filter(w => w.length > 2);
      jaJsemDirigent = uWords.some(w => prohledavanyText.includes(w));
    }
  }

  // 3. PRAVIDLO PRO HOSTUJÍCÍHO DIRIGENTA:
  // Vidí výhradně akce, které sám diriguje (včetně zkoušek smyčců/dechů)
  const isHostConductor = userRole === "host" && (userSecL.includes("dirigent") || userRole.includes("dirigent"));
  if (isHostConductor) {
    return jaJsemDirigent;
  }

  // 4. Běžná interní sdělení pro vedení a výbor
  if (cilovaSkupina === "vedeni") {
    return isCommitteeMember(userRole);
  }

  if (jeInfo) return true; 
  if (hasEditRights(userRole)) return true; 

  // Pokud běžný člen tuto akci diriguje (např. houslista u dechů), vidí ji
  if (jaJsemDirigent) return true;

  // 5. Původní filtry pro nástrojové sekce hráčů
  if (typ === "Zkouška smyčců") return SMYCKE_SECTIONS.some(s => userSecL.includes(s));
  if (typ === "Zkouška dechů") return DECHOVE_SECTIONS.some(s => userSecL.includes(s));

  return true; 
}

function isMemberEligibleForAkce(clen, datumAkceText) {
  const role = String(clen.role || "").trim().toLowerCase();
  const aktivni = String(clen.aktivni || "").trim().toUpperCase();

  if (role === 'host') {
    if (!clen.platnost) return false;
    const expTime = parseDate(clen.platnost);
    const akceTime = parseDate(datumAkceText);
    return (expTime + 86399000) >= akceTime;
  }
  return (aktivni === 'ANO' || aktivni === 'TRUE' || aktivni === '1');
}

function getPlayerDisplayLabel(fullName, isKm) {
  if (isKm) return "★ KM";
  const parts = String(fullName || "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 5);
  const first = parts[0];
  const last = parts[parts.length - 1];
  
  if (first.length <= 4) {
    return `${first} ${last[0]}.`;
  }
  return `${first[0]}${last[0]}`.toUpperCase();
}

function getHexPoints(cx, cy, r = 19.5) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + (Math.PI / 6);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

let aktivniOtocenaKartaId = null;

function flipCard(cardId) {
  const flipper = document.getElementById(cardId);
  if (!flipper) { zavritOtocenouKartu(); return; }

  const container = flipper.closest('.card-flip-container');
  const isCurrentlyFlipped = flipper.classList.contains('is-flipped');

  if (!isCurrentlyFlipped) {
    zavritOtocenouKartu();
    flipper.classList.add('is-flipped');
    if (container) container.classList.add('active-focus');
    document.body.classList.add('card-flipped-active');
    aktivniOtocenaKartaId = cardId;
  } else {
    zavritOtocenouKartu();
  }
}

function zavritOtocenouKartu() {
  if (!aktivniOtocenaKartaId && !document.body.classList.contains('card-flipped-active')) return;
  aktivniOtocenaKartaId = null;
  document.body.classList.remove('card-flipped-active');
  document.querySelectorAll('.card-flipper.is-flipped').forEach(f => f.classList.remove('is-flipped'));
  document.querySelectorAll('.card-flip-container.active-focus').forEach(c => c.classList.remove('active-focus'));
}

function parsovatPoznamku(rawNote) {
  let text = String(rawNote || '').trim();
  if (!text) return { mainNote: '', progData: '', schedData: '' };

  const progRegex = /={2,}\s*PROGRAM\s*={2,}/i;
  const harmRegex = /={2,}\s*HARMONOGRAM\s*={2,}/i;

  let progMatch = progRegex.exec(text);
  let harmMatch = harmRegex.exec(text);

  let mainNote = '';
  let progData = '';
  let schedData = '';

  if (!progMatch && !harmMatch) {
    mainNote = text;
  } else if (progMatch && !harmMatch) {
    mainNote = text.substring(0, progMatch.index);
    progData = text.substring(progMatch.index + progMatch[0].length);
  } else if (!progMatch && harmMatch) {
    mainNote = text.substring(0, harmMatch.index);
    schedData = text.substring(harmMatch.index + harmMatch[0].length);
  } else if (progMatch.index < harmMatch.index) {
    mainNote = text.substring(0, progMatch.index);
    progData = text.substring(progMatch.index + progMatch[0].length, harmMatch.index);
    schedData = text.substring(harmMatch.index + harmMatch[0].length);
  } else {
    mainNote = text.substring(0, harmMatch.index);
    schedData = text.substring(harmMatch.index + harmMatch[0].length, progMatch.index);
    progData = text.substring(progMatch.index + progMatch[0].length);
  }

  if (progRegex.test(mainNote)) {
    let pMatch = progRegex.exec(mainNote);
    let extraProg = mainNote.substring(pMatch.index + pMatch[0].length);
    mainNote = mainNote.substring(0, pMatch.index);
    if (!progData) progData = extraProg;
  }
  if (harmRegex.test(mainNote)) {
    let hMatch = harmRegex.exec(mainNote);
    let extraHarm = mainNote.substring(hMatch.index + hMatch[0].length);
    mainNote = mainNote.substring(0, hMatch.index);
    if (!schedData) schedData = extraHarm;
  }

  mainNote = mainNote
    .replace(/={2,}\s*PROGRAM\s*={2,}[\s\S]*/gi, '')
    .replace(/={2,}\s*HARMONOGRAM\s*={2,}[\s\S]*/gi, '')
    .trim();

  return { 
    mainNote: mainNote, 
    progData: progData.trim(), 
    schedData: schedData.trim() 
  };
}

function formatHarmonogramHtml(sData) {
  if (!sData) return '';
  let lines = sData.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return '';

  let html = `<div style="margin-top:16px; padding-top:14px; border-top: 1px dashed var(--border);">
      <h4 style="margin-top:0; margin-bottom:10px; font-size:16px; color:var(--text);">⏱️ Časový plán</h4>
      <table style="width:100%; border-collapse: collapse; font-size:15px;">`;
  
  lines.forEach((line, index) => {
      let time = '', desc = '';
      if (line.includes('|')) {
        let p = line.split('|');
        time = escapeHtml(p[0]||'').trim();
        desc = escapeHtml(p[1]||'').trim().replace(/\[BR\]/g, '<br>');
      } else {
        desc = escapeHtml(line).replace(/\[BR\]/g, '<br>');
      }

      if (!time && !desc) return;
      let borderObj = (index === lines.length - 1) ? 'none' : '1px solid var(--border)';
      
      html += `<tr>
          <td style="padding:6px 10px 6px 0; vertical-align:top; text-align:right; border-bottom:${borderObj}; white-space:nowrap; font-weight:bold; width:1%; color:var(--text);">${time}</td>
          <td style="padding:6px 0; vertical-align:top; border-bottom:${borderObj}; color:var(--text);">${desc}</td>
      </tr>`;
  });
  html += `</table></div>`;
  return html;
}

function formatProgramHtml(pData) {
  if (!pData) return '';
  let lines = pData.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return '';

  let rows = '';
  lines.forEach((line, idx) => {
    let num = '', author = '', piece = '';
    if (line.includes('|')) {
      let parts = line.split('|');
      num = escapeHtml(parts[0] || '').trim();
      author = escapeHtml(parts[1] || '').trim();
      piece = escapeHtml(parts[2] || '').trim().replace(/\[BR\]/g, '<br>');
    } else if (line.includes(' - ')) {
      let parts = line.split(' - ');
      num = String(idx + 1);
      author = escapeHtml(parts[0] || '').trim();
      piece = escapeHtml(parts.slice(1).join(' - ') || '').trim().replace(/\[BR\]/g, '<br>');
    } else {
      num = String(idx + 1);
      piece = escapeHtml(line).replace(/\[BR\]/g, '<br>');
    }

    if (author || piece) {
      rows += `
        <tr>
          <td class="col-num">${num ? num + '.' : ''}</td>
          <td class="col-author">${author}</td>
          <td class="col-piece">${piece}</td>
        </tr>
      `;
    }
  });

  if (!rows) return '';

  return `
    <div style="margin-top: 4px;">
      <h4 style="margin-top:0; margin-bottom: 8px; font-size: 16px; color: var(--text);">🎼 Program</h4>
      <table class="program-table">
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// =====================================================
// VYKRESLENÍ AKCÍ (CHYTRÉ ŘAZENÍ: BUDOUCÍ VS. HISTORIE)
// =====================================================
function renderEvents() {
  zavritOtocenouKartu();

  const cont = document.getElementById("eventsContainer"); 
  cont.innerHTML = "";
  const archCont = document.getElementById("archiveContainer"); 
  archCont.innerHTML = "";
  
  const canEdit = hasEditRights(user.role);
  const isAdmin = isAdminUser(user);
  
  if (canEdit) {
    cont.innerHTML += `
      <div class="admin-actions" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
        <!-- 1. ŘADA: Přidat, Obsazení, Hosté -->
        <div style="display:flex; gap:8px;">
          <button class="btn" style="background:var(--success); color:#ffffff; flex:1; padding:10px 4px; font-size:13px; display:inline-flex; align-items:center; justify-content:center; gap:5px;" onclick="checkAndOpenAkceForm()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Přidat</span>
          </button>
          <button class="btn" style="background:var(--primary); color:#ffffff; flex:1; padding:10px 4px; font-size:13px; display:inline-flex; align-items:center; justify-content:center; gap:5px;" onclick="openOrchestrModal()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
            <span>Obsazení</span>
          </button>
          <button class="btn" style="background:var(--primary-light); color:#ffffff; flex:1; padding:10px 4px; font-size:13px; display:inline-flex; align-items:center; justify-content:center; gap:5px;" onclick="openGuestManager()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            <span>Hosté</span>
          </button>
        </div>

        <!-- 2. ŘADA: Poslat e-mail, Aktivita, Členové (pro admina) -->
        <div style="display:flex; gap:8px;">
          <button class="btn" style="background:var(--surface); color:var(--text); border:1px solid var(--border); flex:1; padding:9px 4px; font-size:13px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:5px;" onclick="openMailBroadcastModal()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            <span>E-maily</span>
          </button>
          <button type="button" class="btn" style="background:var(--surface); color:var(--text); border:1px solid var(--border); flex:1; padding:9px 4px; font-size:13px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:5px;" onclick="openActivityModal()" title="Historie změn a aktivit">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>Aktivita</span>
          </button>
          ${isAdmin ? `
            <button type="button" class="btn" style="background:var(--surface); color:var(--primary-light); border:1px solid var(--primary-light); flex:1; padding:9px 4px; font-size:13px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:5px;" onclick="openMemberManager()" title="Správa členů orchestru">
              <span style="font-size:15px; line-height:1;">👥</span>
              <span>Členové</span>
            </button>
          ` : ''}
        </div>
      </div>`;
  }

  const vsechnyViditelne = (appData.akce || []).filter(a => isEventVisibleForUser(a));

  // Nastavení hranice na dnešní půlnoc (akce z dneška zůstává aktivní celý den)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();

  // 1. Aktivní textová oznámení / informace (vždy nahoře v záložce Akce)
  const aktivniOznameni = vsechnyViditelne
    .filter(a => (a.typ === 'Oznámení' || a.typ === 'Informace'))
    .sort((a, b) => {
      const dateDiff = parseDate(b.datum) - parseDate(a.datum);
      if (dateDiff !== 0) return dateDiff;
      return parseTimeToMinutes(a.casOd) - parseTimeToMinutes(b.casOd);
    });

  // 2. Hudební akce (zkoušky, koncerty, generálky)
  const hudebniAkce = vsechnyViditelne.filter(a => !a.typ.includes('Oznámení') && !a.typ.includes('Informace'));

  // Nadcházející akce (dnes a v budoucnu) -> ŘAZENÍ VZESTUPNĚ (nejbližší první, při shodě dne podle času začátku!)
  const nadchazejiciAkce = hudebniAkce
    .filter(a => parseDate(a.datum) >= todayTs)
    .sort((a, b) => {
      const dateDiff = parseDate(a.datum) - parseDate(b.datum);
      if (dateDiff !== 0) return dateDiff;
      return parseTimeToMinutes(a.casOd) - parseTimeToMinutes(b.casOd);
    });

  // Proběhlé hudební akce
  const probehleAkce = hudebniAkce
    .filter(a => parseDate(a.datum) < todayTs);

  // Archivovaná textová oznámení / informace v historii
  const archivOznameni = vsechnyViditelne
    .filter(a => a.typ === 'Oznámení (Archiv)' || a.typ === 'Informace (Infoarchiv)' || a.typ === 'Informace (Historie)');

  // SPOLEČNÁ HISTORIE: sjednocení proběhlých akcí i informací a seřazení od NEJNOVĚJŠÍCH k NEJSTARŠÍM (ve stejném dni podle času začátku)
  const historieVse = [...probehleAkce, ...archivOznameni]
    .sort((a, b) => {
      const dateDiff = parseDate(b.datum) - parseDate(a.datum);
      if (dateDiff !== 0) return dateDiff;
      return parseTimeToMinutes(a.casOd) - parseTimeToMinutes(b.casOd);
    });

  // --- VYKRESLENÍ ZÁLOŽKY „AKCE“ ---
  aktivniOznameni.forEach(a => cont.innerHTML += generateOznameniHtml(a, canEdit));
  
  if (nadchazejiciAkce.length === 0 && aktivniOznameni.length === 0) {
    cont.innerHTML += `<div style="text-align:center; padding:40px; color:var(--text-muted);">Žádné nadcházející akce nejsou naplánovány.</div>`;
  } else {
    nadchazejiciAkce.forEach(a => cont.innerHTML += generateAkceHtml(a, canEdit));
  }

  // --- VYKRESLENÍ ZÁLOŽKY „HISTORIE“ (jednotně podle data sestupně) ---
  if (historieVse.length === 0) {
    archCont.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">Historie je prázdná.</div>`;
  } else {
    historieVse.forEach(item => {
      const jeInfo = item.typ.includes('Informace') || item.typ.includes('Oznámení');
      if (jeInfo) {
        archCont.innerHTML += generateOznameniHtml(item, canEdit, true);
      } else {
        archCont.innerHTML += generateAkceHtml(item, canEdit);
      }
    });
  }
}

function generateAkceHtml(akce, canEdit) {
  const myVote = (appData.ucast||[]).find(u => String(u.akceId) === String(akce.id) && u.jmeno === user.name);
  const jePotvrzenoAno = myVote && myVote.stav === 'Ano';
  const jePotvrzenoNe = myVote && myVote.stav === 'Ne';

  let barClass = 'bar-tutti';
  if(akce.typ === 'Koncert') barClass = 'bar-koncert';
  else if(akce.typ === 'Generálka') barClass = 'bar-generalka';
  else if(akce.typ === 'Zkouška smyčců') barClass = 'bar-zkouska-smycce';
  else if(akce.typ === 'Zkouška dechů') barClass = 'bar-zkouska-dechy';
  
  const editBtn = canEdit ? `
    <button type="button" class="edit-btn" onclick="event.preventDefault(); event.stopPropagation(); checkAndOpenAkceForm('${escapeHtml(akce.id)}');" title="Upravit akci">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
      </svg>
    </button>
  ` : "";

  const parsed = parsovatPoznamku(akce.poznamka);
  const hasProgram = !!parsed.progData;
  const cardFlipperId = `flipper-${akce.id}`;

  return `
    <div class="card-flip-container">
      <div class="card-flipper" id="${cardFlipperId}">
        
        <!-- PŘEDNÍ STRANA KARTY -->
        <div class="card-front">
          ${hasProgram ? `<button type="button" class="corner-fold-btn" onclick="event.stopPropagation(); flipCard('${cardFlipperId}')" title="Zobrazit program"></button>` : ''}
          
          <div class="card-top-bar ${barClass}">
            <span>${akce.typ}</span>
            <span>${formatDisplayDate(akce.datum)}</span>
          </div>

          <div class="card-body" style="padding-bottom: 0;">
            <div class="card-title-row">
              <div class="card-title" style="flex:1;">${escapeHtml(akce.nazev)}</div>
              ${editBtn}
            </div>

            <div class="${hasProgram ? 'card-clickable-area' : ''}" ${hasProgram ? `onclick="flipCard('${cardFlipperId}')"` : ''}>
              <p style="margin-bottom:6px;">🎼 Dirigent: <strong>${escapeHtml(akce.dirigent || "Jiří Sycha")}</strong></p>
              ${akce.misto ? `<p style="margin-bottom:6px;">📍 ${escapeHtml(akce.misto)}</p>` : ''}
              ${akce.casOd && akce.casDo 
                ? `<p style="margin-bottom:6px;">🕒 Čas: <strong>${escapeHtml(formatDisplayTime(akce.casOd))} – ${escapeHtml(formatDisplayTime(akce.casDo))}</strong></p>`
                : (akce.casOd 
                  ? `<p style="margin-bottom:6px;">🕒 Začátek: <strong>${escapeHtml(formatDisplayTime(akce.casOd))}</strong></p>` 
                  : (akce.casDo 
                    ? `<p style="margin-bottom:6px;">⌛ Konec: <strong>${escapeHtml(formatDisplayTime(akce.casDo))}</strong></p>` 
                    : ''))}
              ${akce.casSrazu ? `<p style="margin-bottom:6px;">⏰ Sraz: <strong>${escapeHtml(formatDisplayTime(akce.casSrazu))}</strong></p>` : ''}
              ${akce.zacatekGeneralky ? `<p style="margin-bottom:6px;">🎻 Generálka: <strong>${escapeHtml(formatDisplayTime(akce.zacatekGeneralky))}</strong></p>` : ''}
              ${akce.damy ? `<p style="margin-bottom:6px;">👗 Dámy: ${escapeHtml(akce.damy)}</p>` : ''}
              ${akce.pani ? `<p style="margin-bottom:6px;">🤵 Páni: ${escapeHtml(akce.pani)}</p>` : ''}
              ${parsed.mainNote ? `<div class="oznameni-text formatted-note" style="margin-top: 10px; margin-bottom: 6px;">${formatRichText(parsed.mainNote)}</div>` : ''}
              ${formatHarmonogramHtml(parsed.schedData)}
            </div>
          </div>

          <div class="card-body" style="padding-top: 16px;">
            <div class="att-buttons">
              <button class="btn-att ${jePotvrzenoAno ? 'selected-ano' : ''}" onclick="submitUcast('${akce.id}','${akce.datum}','Ano',this)">✓ Účastním se</button>
              <button class="btn-att ${jePotvrzenoNe ? 'selected-ne' : ''}" onclick="submitUcast('${akce.id}','${akce.datum}','Ne',this)">✕ Neúčastním</button>
            </div>
            <div id="duvod-${akce.id}" class="duvod-box" style="display:${jePotvrzenoNe && (!myVote || !myVote.duvod) ? 'block' : 'none'}">
              <input type="text" id="in-${akce.id}" placeholder="Důvod neúčasti" class="modal-input" style="margin-bottom:12px;">
              <button class="btn" onclick="saveDuvod('${akce.id}','${akce.datum}',this)">Odeslat důvod</button>
            </div>
            <div id="roster-container-${akce.id}">${generateRosterHtml(akce.id)}</div>
          </div>
        </div>

        <!-- ZADNÍ STRANA KARTY: PROGRAM -->
        <div class="card-back card-clickable-area" onclick="flipCard('${cardFlipperId}')" title="Klepnutím otočíte zpět na přehled">
          <div class="card-top-bar ${barClass}">
            <span>PROGRAM KONCERTU</span>
          </div>
          <div class="card-body">
            ${formatProgramHtml(parsed.progData)}
          </div>
        </div>

      </div>
    </div>`;
}

// VYKRESLENÍ INFORMACE: ROZLIŠENÍ VEŘEJNÉ VS. INTERNÍ (VÝBOR)
function generateOznameniHtml(akce, canEdit, isArchiv = false) {
  const isInternal = String(akce.cilovaSkupina || "").toLowerCase() === 'vedeni';

  const editBtn = canEdit ? `
    <button type="button" class="edit-btn" onclick="event.preventDefault(); event.stopPropagation(); checkAndOpenAkceForm('${escapeHtml(akce.id)}');" title="Upravit informaci">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
      </svg>
    </button>
  ` : "";
  
  let akceBtn = "";
  if (canEdit) {
    if (!isArchiv) {
      akceBtn = `<button class="btn" style="background:transparent; color:var(--text-muted); border:1px solid var(--border); padding:8px; margin-top:16px; font-size:14px;" onclick="archivovatOznameni('${akce.id}')">📜 Přesunout do historie</button>`;
    } else {
      akceBtn = `<button class="btn" style="background:transparent; color:var(--primary-light); border:1px solid var(--primary-light); padding:8px; margin-top:16px; font-size:14px;" onclick="obnovitOznameni('${akce.id}')">↩️ Vrátit zpět na hlavní stránku</button>`;
    }
  }

  const parsed = parsovatPoznamku(akce.poznamka);

  const cardClass = isInternal ? "card card-oznameni card-info-vedeni" : "card card-oznameni card-info-vsichni";
  const barClass = isInternal ? "card-top-bar bar-info-vedeni" : "card-top-bar bar-oznameni";
  const badgeTitle = isInternal ? "🔒 Interní info" : "💡 Informace";

  return `
    <div class="${cardClass}">
      <div class="${barClass}">
        <span>${badgeTitle}</span>
        <span>${formatDisplayDate(akce.datum)}</span>
      </div>
      <div class="card-body" style="padding-top:12px;">
        <div class="card-title-row" style="margin-bottom:4px;">
          <div class="card-title" style="font-size:20px; flex:1;">${escapeHtml(akce.nazev)}</div>
          ${editBtn}
        </div>
        ${parsed.mainNote ? `<div class="oznameni-text formatted-note" style="margin-top:12px;">${formatRichText(parsed.mainNote)}</div>` : ''}
        ${formatHarmonogramHtml(parsed.schedData)}
        ${formatProgramHtml(parsed.progData)}
        ${akceBtn}
      </div>
    </div>`;
}

function generateRosterHtml(akceId) {
  const potvrdili = (appData.ucast || []).filter(u => String(u.akceId) === String(akceId) && u.stav === 'Ano');
  const akce = (appData.akce || []).find(a => String(a.id) === String(akceId));
  
  // Dirigent akce je pevně daný (z akce nebo výchozí Jiří Sycha)
  const dirigentJmeno = (akce && akce.dirigent && akce.dirigent.trim()) 
    ? akce.dirigent.trim() 
    : "Jiří Sycha";

  const dirigentPotvrdil = potvrdili.some(p => p.jmeno === dirigentJmeno);
  const grouped = {};

  potvrdili.forEach(p => {
    // Pokud je to dirigent této konkrétní akce, neřadíme ho mezi hráče v sekcích
    if (p.jmeno === dirigentJmeno) {
      return;
    }

    let hracSekce = String(p.sekce || "Ostatní").trim().toLowerCase();
    let nalezenaSekce = PARTITURA_SECTIONS.find(s => s.toLowerCase().includes(hracSekce) || hracSekce.includes(s.toLowerCase())) || "Ostatní / Hosté";
    if (!grouped[nalezenaSekce]) grouped[nalezenaSekce] = [];
    grouped[nalezenaSekce].push(p.jmeno);
  });

  const celkemPocet = potvrdili.length + (dirigentPotvrdil ? 0 : 1);

  let html = `
    <button class="roster-toggle" onclick="toggleRoster('${akceId}')">
      <span>👥 Obsazení (${celkemPocet})</span>
      <span id="arrow-${akceId}">▼</span>
    </button>
    <div id="content-${akceId}" class="roster-content">
      <button type="button" class="btn-stage-toggle" onclick="openStageModalForAkce('${akceId}')">
        🗺️ Zobrazit obsazení orchestru (${celkemPocet})
      </button>
  `;

  if (dirigentJmeno) {
    html += `
      <div class="roster-section" style="border-left: 3px solid #f59e0b; padding-left: 8px; margin-bottom: 10px; background: rgba(245, 158, 11, 0.08); border-radius: 4px;">
        <div class="roster-section-title" style="color: #d97706; font-weight: 800;">🎼 Dirigent</div>
        <div class="roster-members" style="font-weight: 700; font-size: 15px;">
          ${escapeHtml(dirigentJmeno)} ${dirigentPotvrdil ? '<span style="color:var(--success); font-size:12px; font-weight:normal;">(potvrzeno)</span>' : ''}
        </div>
      </div>
    `;
  }

  PARTITURA_SECTIONS.forEach(s => { 
    if (grouped[s]) html += `<div class="roster-section"><div class="roster-section-title">${s}</div><div class="roster-members">${grouped[s].join(', ')}</div></div>`; 
  });
  if (grouped["Ostatní / Hosté"]) html += `<div class="roster-section"><div class="roster-section-title">Ostatní / Hosté</div><div class="roster-members">${grouped["Ostatní / Hosté"].join(', ')}</div></div>`;
  if (potvrdili.length === 0 && !dirigentJmeno) html += '<div style="font-size:15px; color:var(--text-muted); font-style:italic; padding:8px 0;">Zatím nikdo nepotvrdil účast.</div>';
  return html + '</div>';
}

function toggleRoster(id) { 
  const content = document.getElementById('content-' + id);
  const arrow = document.getElementById('arrow-' + id);
  if (content.style.display === 'block') { content.style.display = 'none'; arrow.innerText = '▼'; } 
  else { content.style.display = 'block'; arrow.innerText = '▲'; }
}

function getOrchestraSvgHtml(prefix = "stage") {
  return `
  <div class="stage-wrapper">
    <div class="stage-header-info">
      <span>Obsazení přihlášených</span>
      <span class="stage-count-badge" id="${prefix}-total-count">0 na pódiu</span>
    </div>

    <svg viewBox="0 0 660 375" id="${prefix}-svg" style="width:100%; height:auto; display:block; user-select:none;">
      <rect x="190" y="4" width="280" height="46" rx="8" fill="var(--sec-bg)"/>
      <rect x="8" y="52" width="644" height="52" rx="8" fill="var(--sec-bg)"/>
      <rect x="6" y="106" width="648" height="74" rx="8" fill="var(--sec-bg)"/>
      <rect x="4" y="182" width="652" height="188" rx="10" fill="var(--sec-bg)"/>

      <rect x="306" y="300" width="48" height="50" rx="6" fill="rgba(245, 158, 11, 0.12)" stroke="rgba(245, 158, 11, 0.4)" stroke-dasharray="2,2"/>
      <text x="330" y="362" class="sec-label" style="fill:#d97706; font-weight:bold;">Dirigent</text>

      <text x="330" y="18" class="sec-label">Bicí nástroje</text>
      <text x="120" y="66" class="sec-label">Lesní rohy</text>
      <text x="330" y="66" class="sec-label">Trubky</text>
      <text x="540" y="66" class="sec-label">Trombóny / Tuba</text>

      <g id="${prefix}-dynamic-labels"></g>
      <g id="${prefix}-dynamic-spots"></g>

      <text x="100" y="362" class="sec-label">1. Housle</text>
      <text x="245" y="362" class="sec-label">2. Housle</text>
      <text x="415" y="362" class="sec-label">Violy</text>
      <text x="560" y="362" class="sec-label">Violoncella</text>
    </svg>

    <div id="${prefix}-detail-box" class="stage-player-detail">
      <div class="detail-name" style="font-size:0.95rem; font-weight:normal; color:var(--text-muted);">
        👆 Klepněte na hráče nebo dirigenta pro detail
      </div>
      <div class="detail-status" style="color:var(--text-muted); font-size:0.8rem;">
        Zobrazují se pouze ti, kteří potvrdili účast
      </div>
    </div>
  </div>`;
}

function bindOrchestraSvgData(prefix, akceId, cfgKM = null, cfgLimits = {}, cfgRoster = null) {
  const akce = (appData.akce || []).find(a => String(a.id) === String(akceId));
  const datumAkce = akce ? akce.datum : "";
  const ucastAkce = (appData.ucast || []).filter(u => String(u.akceId) === String(akceId));
  
  const savedCfg = (appData.orchestraConfig && appData.orchestraConfig[akceId]) || 
                   JSON.parse(localStorage.getItem(`bolech_orch_${akceId}`) || "{}");
  const kmName = cfgKM !== null ? cfgKM : (savedCfg.km || "");
  const limits = Object.keys(cfgLimits).length > 0 ? cfgLimits : (savedCfg.limits || {});
  const activeRoster = cfgRoster !== null ? cfgRoster : (savedCfg.roster || {});

  const dynamicGroup = document.getElementById(`${prefix}-dynamic-spots`);
  const dynamicLabelsGroup = document.getElementById(`${prefix}-dynamic-labels`);
  if (!dynamicGroup) return;
  dynamicGroup.innerHTML = "";
  if (dynamicLabelsGroup) dynamicLabelsGroup.innerHTML = "";

  let celkemHraje = 0;

  // Dirigent akce je daný (zadaný u akce, případně výchozí Jiří Sycha)
  const dirigentJmeno = (akce && akce.dirigent && akce.dirigent.trim()) 
    ? akce.dirigent.trim() 
    : "Jiří Sycha";
  const dirigentPotvrdil = ucastAkce.some(u => u.stav === "Ano" && u.jmeno === dirigentJmeno);

  const attendingBySec = {};

  Object.keys(ORCHESTRA_LAYOUT_CFG).forEach(sec => {
    const cfg = ORCHESTRA_LAYOUT_CFG[sec];
    const capacity = limits[sec] !== undefined ? parseInt(limits[sec], 10) : cfg.defaultCap;
    if (capacity <= 0) {
      attendingBySec[sec] = [];
      return;
    }

    if (sec === "Baskytara") {
      const chosenBass = (activeRoster["Baskytara"] && activeRoster["Baskytara"][0]) || "";
      if (chosenBass) {
        const u = ucastAkce.find(item => item.jmeno === chosenBass);
        if (u && u.stav === "Ano") {
          attendingBySec["Baskytara"] = [{ celeJmeno: chosenBass, sekce: "Baskytara" }];
        }
      }
      return;
    }

    let eligiblePlayers = (appData.clenove || []).filter(c => {
      // Dirigent této akce se do sekcí hráčů nepočítá
      if (c.celeJmeno === dirigentJmeno) return false;
      
      return c.sekce === sec && isMemberEligibleForAkce(c, datumAkce);
    });

    let chosenPlayers = [];
    if (activeRoster && activeRoster[sec] && Array.isArray(activeRoster[sec])) {
      chosenPlayers = eligiblePlayers.filter(p => activeRoster[sec].includes(p.celeJmeno));
    } else {
      chosenPlayers = [...eligiblePlayers];
    }

    if (sec === "1. Housle" && kmName) {
      chosenPlayers.sort((a, b) => (a.celeJmeno === kmName ? -1 : b.celeJmeno === kmName ? 1 : 0));
    }

    const attending = chosenPlayers.filter(p => {
      const u = ucastAkce.find(item => item.jmeno === p.celeJmeno);
      return u && u.stav === "Ano";
    });

    attendingBySec[sec] = attending.slice(0, capacity);
  });

  function renderHexSpot(x, y, p, isKm, secName, isDir = false) {
    celkemHraje++;
    const spot = document.createElementNS("http://www.w3.org/2000/svg", "g");
    spot.setAttribute("class", `hex-spot ${isKm ? 'is-km' : ''} ${isDir ? 'is-dirigent' : ''}`);

    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", getHexPoints(x, y, 19.5));
    spot.appendChild(polygon);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x);
    label.setAttribute("y", y);
    label.textContent = isDir ? "DIR" : getPlayerDisplayLabel(p.celeJmeno, isKm);
    spot.appendChild(label);

    const playerLabel = p.celeJmeno + (isKm ? " 🎻 (Koncertní mistr)" : "");
    const statusText = isDir ? "🎼 Dirigent" : secName;
    const statusColor = isDir ? "#d97706" : "var(--primary-light)";

    spot.onclick = () => {
      document.querySelectorAll(`#${prefix}-svg .hex-spot`).forEach(el => el.classList.remove("is-selected"));
      spot.classList.add("is-selected");
      showPlayerDetailBox(prefix, playerLabel, statusText, statusColor);
    };

    dynamicGroup.appendChild(spot);
    return spot;
  }

  function renderLabel(x, y, text) {
    if (!dynamicLabelsGroup) return;
    const l = document.createElementNS("http://www.w3.org/2000/svg", "text");
    l.setAttribute("x", x);
    l.setAttribute("y", y);
    l.setAttribute("class", "sec-label");
    l.textContent = text;
    dynamicLabelsGroup.appendChild(l);
  }

  if (dirigentJmeno) {
    const dirSpot = renderHexSpot(330, 325, { celeJmeno: dirigentJmeno }, false, "Dirigent", true);
    if (dirSpot) {
      dirSpot.classList.add("is-selected");
      showPlayerDetailBox(prefix, dirigentJmeno, "🎼 Dirigent", "#d97706");
    }
  } else {
    const detailBox = document.getElementById(`${prefix}-detail-box`);
    if (detailBox) {
      detailBox.innerHTML = `
        <div class="detail-name" style="font-size:0.95rem; font-weight:normal; color:var(--text-muted);">
          👆 Klepněte na hráče pro detail
        </div>
      `;
    }
  }

  ["1. Housle", "2. Housle", "Violy", "Violoncella"].forEach(sec => {
    const list = attendingBySec[sec] || [];
    const cfg = ORCHESTRA_LAYOUT_CFG[sec];
    list.forEach((p, idx) => {
      const perRow = 3;
      const row = Math.floor(idx / perRow);
      const col = idx % perRow;
      const rowOffsetX = (row % 2 === 1) ? 17 : 0;
      const colPitch = 34;
      const rowPitch = 29;

      const x = (cfg.centerX - ((perRow - 1) * colPitch) / 2) + (col * colPitch) + rowOffsetX;
      const y = cfg.yStart - (row * rowPitch);
      const isKm = (sec === "1. Housle" && p.celeJmeno === kmName);
      renderHexSpot(x, y, p, isKm, sec);
    });
  });

  const cbList = attendingBySec["Kontrabasy"] || [];
  const bassList = attendingBySec["Baskytara"] || [];
  const hasBass = bassList.length > 0;
  const cbCenter = hasBass ? 275 : 330;

  renderLabel(cbCenter, 196, "Kontrabasy");
  cbList.forEach((p, idx) => {
    const offset = (idx - (cbList.length - 1) / 2) * 38;
    renderHexSpot(cbCenter + offset, 218, p, false, "Kontrabasy");
  });

  if (hasBass) {
    const bassX = Math.max(cbCenter + (cbList.length * 20) + 38, 415);
    renderLabel(bassX, 196, "Baskytara");
    renderHexSpot(bassX, 218, bassList[0], false, "Baskytara");
  }

  const baseWoodwinds = [
    { sec: "Flétny", label: "Flétny" },
    { sec: "Hoboje", label: "Hoboje" },
    { sec: "Klarinety / Saxofony", label: "Klarinety" },
    { sec: "Fagoty", label: "Fagoty" },
    { sec: "Klávesy", label: "Klávesy" }
  ];

  const hasGuitar = attendingBySec["Kytary"] && attendingBySec["Kytary"].length > 0;
  if (hasGuitar) {
    baseWoodwinds.push({ sec: "Kytary", label: "Kytara" });
  }

  const totalCols = baseWoodwinds.length;
  const blockWidth = Math.min(620 / totalCols, 115);
  const startX = 330 - ((totalCols - 1) * blockWidth) / 2;

  baseWoodwinds.forEach((item, bIdx) => {
    const bCenter = startX + (bIdx * blockWidth);
    renderLabel(bCenter, 120, item.label);

    const list = attendingBySec[item.sec] || [];
    list.forEach((p, idx) => {
      const offset = (idx - (list.length - 1) / 2) * 36;
      renderHexSpot(bCenter + offset, 144, p, false, item.sec);
    });
  });

  const hornList = attendingBySec["Lesní rohy"] || [];
  hornList.forEach((p, idx) => {
    const offset = (idx - (hornList.length - 1) / 2) * 36;
    renderHexSpot(120 + offset, 88, p, false, "Lesní rohy");
  });

  const trpList = attendingBySec["Trubky"] || [];
  trpList.forEach((p, idx) => {
    const offset = (idx - (trpList.length - 1) / 2) * 36;
    renderHexSpot(330 + offset, 88, p, false, "Trubky");
  });

  const trbList = attendingBySec["Trombóny a Tuba"] || [];
  trbList.forEach((p, idx) => {
    const offset = (idx - (trbList.length - 1) / 2) * 36;
    renderHexSpot(540 + offset, 88, p, false, "Trombóny / Tuba");
  });

  const biciList = attendingBySec["Bicí nástroje"] || [];
  biciList.forEach((p, idx) => {
    const offset = (idx - (biciList.length - 1) / 2) * 38;
    renderHexSpot(330 + offset, 38, p, false, "Bicí nástroje");
  });

  const countBadge = document.getElementById(`${prefix}-total-count`);
  if (countBadge) {
    countBadge.textContent = `${celkemHraje} na pódiu`;
  }
}

function showPlayerDetailBox(prefix, name, status, color) {
  const box = document.getElementById(`${prefix}-detail-box`);
  if (!box) return;
  box.innerHTML = `
    <div class="detail-name">${escapeHtml(name)}</div>
    <div class="detail-status" style="color: ${color};">${escapeHtml(status)}</div>
  `;
}

function openStageModalForAkce(akceId) {
  const akce = (appData.akce || []).find(a => String(a.id) === String(akceId));
  const html = `
    <div id="viewStageModal" class="modal-overlay" style="padding: 4px;" onclick="if(event.target===this) document.getElementById('viewStageModal').remove()">
      <div class="modal-box" style="max-width: 820px; width: 100%; padding: 8px 6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px; padding: 0 4px;">
          <div>
            <h3 style="margin:0; font-size:1.15rem; color:var(--primary);">${escapeHtml(akce ? akce.nazev : "Obsazení orchestru")}</h3>
            <span style="font-size:0.82rem; color:var(--text-muted);">${escapeHtml(akce ? formatDisplayDate(akce.datum) : "")}</span>
          </div>
          <button type="button" style="background:transparent; border:none; font-size:22px; color:var(--text-muted); cursor:pointer; padding:4px 8px;" onclick="document.getElementById('viewStageModal').remove()">✕</button>
        </div>
        
        ${getOrchestraSvgHtml("view")}
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  bindOrchestraSvgData("view", akceId);
}

function openOrchestrModal() {
  const vsechnyAkce = (appData.akce || []).filter(a => !a.typ.includes("Oznámení") && !a.typ.includes("Informace"));
  if (vsechnyAkce.length === 0) {
    alert("Zatím nemáte vytvořeny žádné hudební akce.");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();

  const nadchazejiciAkce = vsechnyAkce
    .filter(a => parseDate(a.datum) >= todayTs)
    .sort((a, b) => {
      const dateDiff = parseDate(a.datum) - parseDate(b.datum);
      if (dateDiff !== 0) return dateDiff;
      return parseTimeToMinutes(a.casOd) - parseTimeToMinutes(b.casOd);
    });

  const probehleAkce = vsechnyAkce
    .filter(a => parseDate(a.datum) < todayTs)
    .sort((a, b) => {
      const dateDiff = parseDate(b.datum) - parseDate(a.datum);
      if (dateDiff !== 0) return dateDiff;
      return parseTimeToMinutes(a.casOd) - parseTimeToMinutes(b.casOd);
    });

  const formatOptionLabel = (a) => {
    const info = getAkceBarInfo(a);
    const cas = a.casOd ? ` ${formatDisplayTime(a.casOd)}` : '';
    return `[${info.abbr}] ${escapeHtml(a.nazev)} (${formatDisplayDate(a.datum)}${cas})`;
  };

  let akceOptions = "";
  if (nadchazejiciAkce.length > 0) {
    akceOptions += nadchazejiciAkce.map(a => `<option value="${a.id}">${formatOptionLabel(a)}</option>`).join('');
  } else {
    akceOptions += probehleAkce.map(a => `<option value="${a.id}">${formatOptionLabel(a)}</option>`).join('');
  }

  let historyGroupHtml = "";
  if (nadchazejiciAkce.length > 0 && probehleAkce.length > 0) {
    historyGroupHtml = `
      <optgroup id="orch_history_group" label="── Proběhlé akce ──" style="display:none;">
        ${probehleAkce.map(a => `<option value="${a.id}">📜 ${formatOptionLabel(a)}</option>`).join('')}
      </optgroup>
    `;
  }

  let limitsHtml = '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px;">';
  Object.keys(ORCHESTRA_LAYOUT_CFG).forEach(sec => {
    limitsHtml += `
      <div style="font-size:0.82rem; background:var(--bg); padding:6px 8px; border-radius:6px; border:1px solid var(--border);">
        <label style="display:block; font-weight:700; margin-bottom:4px;">${sec}:</label>
        <div style="display:flex; align-items:center; gap:4px;">
          <button type="button" class="btn" style="width:28px; height:28px; padding:0; font-size:14px; background:var(--surface); color:var(--text); border:1px solid var(--border);" onclick="stepSecLimit('${sec}', -1)">−</button>
          <input type="number" min="0" max="30" class="modal-input sec-limit-input" data-sec="${sec}" value="${ORCHESTRA_LAYOUT_CFG[sec].defaultCap}" onchange="renderRosterSelectionInputs()" style="text-align:center; padding:4px; font-size:0.9rem; height:28px; margin:0; font-weight:700;">
          <button type="button" class="btn" style="width:28px; height:28px; padding:0; font-size:14px; background:var(--surface); color:var(--text); border:1px solid var(--border);" onclick="stepSecLimit('${sec}', 1)">+</button>
        </div>
      </div>
    `;
  });
  limitsHtml += '</div>';

  const html = `
    <div id="orchestrModal" class="modal-overlay" style="padding: 4px;">
      <div class="modal-box" style="max-height: 94vh; max-width: 820px; width: 100%; overflow-y: auto; padding: 10px 6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; padding: 0 4px;">
          <h3 style="margin:0; font-size:1.15rem; color:var(--text);">🎼 Obsazení orchestru</h3>
          <button type="button" style="background:transparent; border:none; font-size:22px; color:var(--text-muted); cursor:pointer; padding:4px 8px;" onclick="document.getElementById('orchestrModal').remove()">✕</button>
        </div>

        <div style="margin-bottom:10px; padding: 0 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <label style="font-size:0.82rem; font-weight:700;">Vyberte akci / projekt:</label>
            ${(nadchazejiciAkce.length > 0 && probehleAkce.length > 0) ? `
              <button type="button" id="btnToggleOrchHistory" style="background:transparent; border:none; color:var(--primary-light); font-size:12px; cursor:pointer; padding:2px 4px; text-decoration:underline;" onclick="toggleOrchHistoryEvents(${probehleAkce.length})">
                📜 Historie akcí (${probehleAkce.length})
              </button>
            ` : ''}
          </div>
          <select id="orch_modal_akce" class="modal-input" onchange="onOrchModalAkceChange()" style="margin-top:2px;">
            ${akceOptions}
            ${historyGroupHtml}
          </select>
          <div id="orch_active_badge_row" style="margin-top:6px; display:flex; align-items:center; gap:8px;"></div>
        </div>

        <div style="margin-bottom:10px; margin-left:4px; margin-right:4px; background:var(--bg); padding:8px 10px; border-radius:8px; border:1px solid var(--border);">
          <label style="font-size:0.82rem; font-weight:800; color:var(--primary-light);">🎻 Koncertní mistr (1. židle):</label>
          <select id="orch_modal_km" class="modal-input" onchange="onConcertMasterChange()" style="margin-top:4px;">
          </select>
        </div>

        <details style="margin: 0 4px 10px 4px; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:6px 10px;">
          <summary style="cursor:pointer; font-weight:700; font-size:0.85rem; color:var(--text);">🏛️ Nastavení kapacity sekcí v sále</summary>
          ${limitsHtml}
        </details>

        <details id="details_roster_selection" style="margin: 0 4px 10px 4px; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:8px 10px;">
          <summary style="cursor:pointer; font-weight:800; font-size:0.85rem; color:var(--primary-light);">👥 Výběr konkrétních hráčů na projekt</summary>
          <div id="roster_selection_container" style="margin-top:8px;"></div>
        </details>
        <!-- NOVÁ SEKCE: OMLUVENKY -->
        <details id="details_omluvenky" style="margin: 0 4px 10px 4px; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:8px 10px;">
          <summary style="cursor:pointer; font-weight:800; font-size:0.85rem; color:var(--danger); display:flex; justify-content:space-between; align-items:center;">
            <span id="omluvenky_summary_title">📋 Omluvenky (0)</span>
          </summary>
          <div id="omluvenky_container" style="margin-top:8px;"></div>
        </details>      

        <div id="orch_preview_wrapper" style="margin-bottom: 10px;">
          ${getOrchestraSvgHtml("manage")}
        </div>

        <div style="display:flex; gap:8px; padding: 0 4px;">
          <button type="button" class="btn" style="background:var(--success); flex:1;" onclick="saveOrchestrSettings()">💾 Uložit obsazení</button>
          <button type="button" class="btn" style="background:var(--border); color:var(--text); width:auto;" onclick="document.getElementById('orchestrModal').remove()">Zavřít</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  onOrchModalAkceChange();
}

function renderOmluvenkyList(akceId) {
  const container = document.getElementById("omluvenky_container");
  const titleEl = document.getElementById("omluvenky_summary_title");
  if (!container) return;

  const omluveni = (appData.ucast || []).filter(u => String(u.akceId) === String(akceId) && u.stav === "Ne");

  if (titleEl) {
    titleEl.textContent = `📋 Omluvenky (${omluveni.length})`;
  }

  if (omluveni.length === 0) {
    container.innerHTML = `<p style="font-size:0.82rem; color:var(--text-muted); margin:0;">K této akci nejsou evidovány žádné omluvenky.</p>`;
    return;
  }

  // Seřazení podle sekce a jména
  omluveni.sort((a, b) => {
    const secComp = String(a.sekce || "").localeCompare(String(b.sekce || ""), "cs");
    if (secComp !== 0) return secComp;
    return String(a.jmeno || "").localeCompare(String(b.jmeno || ""), "cs");
  });

  let html = `<div style="display:flex; flex-direction:column; gap:6px;">`;
  omluveni.forEach(item => {
    const duvodText = (item.duvod && item.duvod.trim()) ? escapeHtml(item.duvod.trim()) : `<em style="color:var(--text-muted);">důvod neuveden</em>`;
    html += `
      <div style="background:var(--surface); border:1px solid var(--border); border-left:3px solid var(--danger); border-radius:6px; padding:6px 10px; font-size:13px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
          <strong style="color:var(--text);">${escapeHtml(item.jmeno)}</strong>
          <span style="font-size:11px; color:var(--text-muted); font-weight:600;">${escapeHtml(item.sekce || "")}</span>
        </div>
        <div style="font-size:12px; color:var(--text-muted);">
          💬 Důvod: <span style="color:var(--text);">${duvodText}</span>
        </div>
      </div>
    `;
  });
  html += `</div>`;

  container.innerHTML = html;
}


function toggleOrchHistoryEvents(pocet) {
  const optGroup = document.getElementById("orch_history_group");
  const btn = document.getElementById("btnToggleOrchHistory");
  if (!optGroup || !btn) return;

  const isHidden = optGroup.style.display === "none";
  if (isHidden) {
    optGroup.style.display = "";
    btn.textContent = "✕ Skrýt historii";
  } else {
    optGroup.style.display = "none";
    btn.textContent = `📜 Historie akcí (${pocet})`;
  }
}

function stepSecLimit(sec, step) {
  const input = document.querySelector(`.sec-limit-input[data-sec="${sec}"]`);
  if (!input) return;
  let val = parseInt(input.value || "0", 10) + step;
  if (val < 0) val = 0;
  input.value = val;
  renderRosterSelectionInputs();
}

function onOrchModalAkceChange() {
  const akceId = document.getElementById("orch_modal_akce").value;
  const akce = (appData.akce || []).find(a => String(a.id) === String(akceId));
  const datumAkce = akce ? akce.datum : "";

  // Okamžitá synchronizace dirigenta v informačním panelu pod mapkou
  const dirigentJmeno = (akce && akce.dirigent && akce.dirigent.trim()) 
    ? akce.dirigent.trim() 
    : "Jiří Sycha";
  const ucastAkce = (appData.ucast || []).filter(u => String(u.akceId) === String(akceId));
  const dirigentPotvrdil = ucastAkce.some(u => u.stav === "Ano" && u.jmeno === dirigentJmeno);

  showPlayerDetailBox(
    "manage",
    dirigentJmeno,
    "🎼 Dirigent",
    "#d97706"
  );

  const badgeContainer = document.getElementById("orch_active_badge_row");
  if (badgeContainer && akce) {
    const info = getAkceBarInfo(akce);
    const casText = akce.casOd ? ` • ${formatDisplayTime(akce.casOd)}${akce.casDo ? '–' + formatDisplayTime(akce.casDo) : ''}` : '';
    badgeContainer.innerHTML = `
      <span class="card-top-bar ${info.barClass}" style="display:inline-flex; align-items:center; padding:3px 10px; border-radius:6px; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; width:auto; margin:0;">
        ${info.abbr} · ${escapeHtml(info.typ)}
      </span>
      <span style="font-size:12px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${formatDisplayDate(akce.datum)}${casText}
      </span>
    `;
  }

  const savedCfg = (appData.orchestraConfig && appData.orchestraConfig[akceId]) ||
                   JSON.parse(localStorage.getItem(`bolech_orch_${akceId}`) || "{}");

  const vl1Players = (appData.clenove || []).filter(c => {
    return c.sekce === "1. Housle" && isMemberEligibleForAkce(c, datumAkce);
  });

  const kmSelect = document.getElementById("orch_modal_km");
  if (kmSelect) {
    kmSelect.innerHTML = `<option value="">-- Vyberte koncertního mistra --</option>` + 
      vl1Players.map(p => `<option value="${escapeHtml(p.celeJmeno)}">${escapeHtml(p.celeJmeno)}</option>`).join('');
    kmSelect.value = savedCfg.km || "";
  }

  const limits = savedCfg.limits || {};
  document.querySelectorAll(".sec-limit-input").forEach(sel => {
    const sec = sel.dataset.sec;
    if (limits[sec] !== undefined) sel.value = limits[sec];
  });

  renderRosterSelectionInputs();
  renderOmluvenkyList(akceId);
}

function onConcertMasterChange() {
  renderRosterSelectionInputs();
}

function renderRosterSelectionInputs() {
  const akceId = document.getElementById("orch_modal_akce").value;
  const akce = (appData.akce || []).find(a => String(a.id) === String(akceId));
  const datumAkce = akce ? akce.datum : "";

  const savedCfg = (appData.orchestraConfig && appData.orchestraConfig[akceId]) ||
                   JSON.parse(localStorage.getItem(`bolech_orch_${akceId}`) || "{}");
  const activeRoster = savedCfg.roster || {};
  const currentKm = document.getElementById("orch_modal_km")?.value || "";

  const container = document.getElementById("roster_selection_container");
  if (!container) return;

  let html = "";
  let anyForm = false;

  const bassLimitInput = document.querySelector(`.sec-limit-input[data-sec="Baskytara"]`);
  const bassCapacity = bassLimitInput ? parseInt(bassLimitInput.value, 10) : 0;
  
  if (bassCapacity > 0) {
    anyForm = true;
    const contrabassists = (appData.clenove || []).filter(c => c.sekce === "Kontrabasy" && isMemberEligibleForAkce(c, datumAkce));
    const currentSelectedBass = (activeRoster["Baskytara"] && activeRoster["Baskytara"][0]) || "";

    html += `
      <div class="roster-select-group">
        <div class="roster-select-header">
          <strong style="font-size:0.9rem; color:var(--text);">🎸 Baskytara</strong>
          <span style="font-size:0.75rem; color:var(--primary-light); font-weight:700;">Zvolte hráče z kontrabasů</span>
        </div>
        <div class="roster-select-list">
    `;

    contrabassists.forEach(p => {
      const isSelected = p.celeJmeno === currentSelectedBass;
      html += `
        <label class="roster-player-row">
          <input type="radio" name="roster_bassguitar" class="roster-bass-radio" value="${escapeHtml(p.celeJmeno)}" ${isSelected ? 'checked' : ''} onchange="refreshStagePreviewFromForm()">
          <span class="roster-player-name">${escapeHtml(p.celeJmeno)}</span>
        </label>
      `;
    });
    html += `</div></div>`;
  }

  Object.keys(ORCHESTRA_LAYOUT_CFG).forEach(sec => {
    if (sec === "Baskytara") return;

    const eligiblePlayers = (appData.clenove || []).filter(c => {
      if (isDirigentPerson(c.celeJmeno, c.sekce, c.role)) return false;
      return c.sekce === sec && isMemberEligibleForAkce(c, datumAkce);
    });

    const limitInput = document.querySelector(`.sec-limit-input[data-sec="${sec}"]`);
    const capacity = limitInput ? parseInt(limitInput.value, 10) : ORCHESTRA_LAYOUT_CFG[sec].defaultCap;

    if (capacity === 0) return;

    if (eligiblePlayers.length > capacity) {
      anyForm = true;
      const savedForSec = activeRoster[sec] || [];

      html += `
        <div class="roster-select-group">
          <div class="roster-select-header">
            <strong style="font-size:0.9rem; color:var(--text);">${sec}</strong>
            <span style="font-size:0.75rem; color:var(--primary-light); font-weight:700;">Vyberte ${capacity} z ${eligiblePlayers.length}</span>
          </div>
          <div class="roster-select-list">
      `;

      eligiblePlayers.forEach((p, idx) => {
        const isKm = (sec === "1. Housle" && p.celeJmeno === currentKm);
        
        let isChecked = false;
        if (isKm) {
          isChecked = true;
        } else if (savedForSec.length > 0) {
          isChecked = savedForSec.includes(p.celeJmeno);
        } else {
          isChecked = idx < capacity;
        }

        html += `
          <label class="roster-player-row">
            <input type="checkbox" class="roster-checkbox" data-sec="${sec}" value="${escapeHtml(p.celeJmeno)}" 
                   ${isChecked ? 'checked' : ''} 
                   ${isKm ? 'disabled title="Koncertní mistr musí hrát"' : ''} 
                   onchange="validateRosterSelection('${sec}', ${capacity}, this)">
            <span class="roster-player-name">
              ${escapeHtml(p.celeJmeno)}${isKm ? '<span class="km-badge">KM</span>' : ''}
            </span>
          </label>
        `;
      });

      html += `</div></div>`;
    }
  });

  if (!anyForm) {
    html = `<p style="font-size:0.82rem; color:var(--text-muted); margin:0; text-align:left;">Kapacita pokrývá všechny aktivní hráče. Není nutné nikoho vyřazovat.</p>`;
  }

  container.innerHTML = html;
  refreshStagePreviewFromForm();
}

function validateRosterSelection(sec, maxCapacity, changedInput) {
  const checkedBoxes = Array.from(document.querySelectorAll(`.roster-checkbox[data-sec="${sec}"]:checked`));
  if (checkedBoxes.length > maxCapacity) {
    alert(`Pro sekci ${sec} je povoleno vybrat maximálně ${maxCapacity} hráčů podle nastavené kapacity.`);
    changedInput.checked = false;
    return;
  }
  refreshStagePreviewFromForm();
}

function getRosterFromForm() {
  const roster = {};
  const checkedBoxes = document.querySelectorAll(".roster-checkbox:checked");
  checkedBoxes.forEach(chk => {
    const sec = chk.dataset.sec;
    if (!roster[sec]) roster[sec] = [];
    roster[sec].push(chk.value);
  });

  const chosenBass = document.querySelector(".roster-bass-radio:checked");
  if (chosenBass) {
    roster["Baskytara"] = [chosenBass.value];
  }

  return roster;
}

function refreshStagePreviewFromForm() {
  const akceId = document.getElementById("orch_modal_akce").value;
  const km = document.getElementById("orch_modal_km")?.value || "";

  const limits = {};
  document.querySelectorAll(".sec-limit-input").forEach(sel => {
    limits[sel.dataset.sec] = parseInt(sel.value, 10);
  });

  const roster = getRosterFromForm();
  bindOrchestraSvgData("manage", akceId, km, limits, roster);
}

function saveOrchestrSettings() {
  const akceId = document.getElementById("orch_modal_akce").value;
  const km = document.getElementById("orch_modal_km").value;

  const limits = {};
  document.querySelectorAll(".sec-limit-input").forEach(sel => {
    limits[sel.dataset.sec] = parseInt(sel.value, 10);
  });

  const roster = getRosterFromForm();

  const payload = { 
    akceId: akceId,
    km: km, 
    limits: limits, 
    roster: roster
  };

  localStorage.setItem(`bolech_orch_${akceId}`, JSON.stringify(payload));
  if (!appData.orchestraConfig) appData.orchestraConfig = {};
  appData.orchestraConfig[akceId] = payload;
  localStorage.setItem("bolech_data_cache", JSON.stringify(appData));

  bindOrchestraSvgData("manage", akceId, km, limits, roster);

  runGoogleScript("saveOrchestraConfig", payload).then(res => {
    if (res.success) {
      alert("Obsazení orchestru bylo úspěšně uloženo!");
    } else {
      alert("Uloženo lokálně, ale zápis do tabulky selhal: " + res.error);
    }
  });
}

// =========================================================================
// SPRÁVA ZÁMKŮ AKCÍ (PESSIMISTIC LOCKING)
// =========================================================================
window.aktualneZamknutaAkceId = null;

async function checkAndOpenAkceForm(akceId = null) {
  if (!akceId) {
    openAkceForm(null, false);
    return;
  }

  const res = await runGoogleScript("lockAkce", { akceId: akceId, user: user.name });

  if (res && res.locked) {
    alert(`⚠️ Tuto položku právě upravuje ${res.editor} (od ${res.time}).\n\nFormulář se otevře pouze pro čtení, aby nedošlo k přepsání změn.`);
    openAkceForm(akceId, true);
  } else {
    window.aktualneZamknutaAkceId = akceId;
    openAkceForm(akceId, false);
  }
}

function closeAndUnlockAkceModal() {
  if (window.aktualneZamknutaAkceId) {
    runGoogleScript("unlockAkce", { akceId: window.aktualneZamknutaAkceId, user: user.name });
    window.aktualneZamknutaAkceId = null;
  }
  const modal = document.getElementById('akceModal');
  if (modal) modal.remove();
}

// FORMULÁŘ PRO AKCI / INFORMACI (VČETNĚ VOLBY CÍLOVÉ SKUPINY)
function openAkceForm(param = null, isReadOnly = false) {
  let akce = null;
  if (param !== null && typeof param === 'string') {
    akce = (appData.akce || []).find(a => String(a.id) === String(param));
  } else if (typeof param === 'object') {
    akce = param;
  }

  const isEdit = akce !== null;
  const roAttr = isReadOnly ? 'disabled style="background: var(--bg); opacity: 0.85; cursor: not-allowed;"' : '';
  const selectDisabledAttr = (isEdit || isReadOnly) ? 'disabled style="background: var(--bg); opacity: 0.85;"' : '';
  const formDateValue = formatDateForInput(akce?.datum || '');
  
  const parsed = parsovatPoznamku(akce?.poznamka || '');
  const cilovaSkupinaValue = String(akce?.cilovaSkupina || 'vsichni').toLowerCase();
  
  let programLines = [];
  if (parsed.progData) {
    programLines = parsed.progData.split('\n').map(l => l.trim()).filter(l => l.length > 0).map((line, idx) => {
      if (line.includes('|')) {
        let p = line.split('|');
        return { num: p[0] || String(idx + 1), author: p[1] || '', piece: p[2] || '' };
      } else if (line.includes(' - ')) {
        let p = line.split(' - ');
        return { num: String(idx + 1), author: p[0] || '', piece: p.slice(1).join(' - ') || '' };
      }
      return { num: String(idx + 1), author: '', piece: line };
    });
  }

  let scheduleLines = [];
  if (parsed.schedData) {
    scheduleLines = parsed.schedData.split('\n').map(l => l.trim()).filter(l => l.length > 0).map(line => {
      if (line.includes('|')) {
        let p = line.split('|');
        return { time: p[0] || '', desc: p[1] || '' };
      }
      return { time: '', desc: line };
    });
  }

  const modalTitle = isReadOnly 
    ? '👁️ Náhled položky (pouze pro čtení)' 
    : (isEdit ? 'Úprava položky' : 'Nová položka');

  const html = `
    <div id="akceModal" class="modal-overlay" style="padding: 4px;" onclick="if(event.target === this) closeAndUnlockAkceModal()">
      <div class="modal-box" style="max-height: 90vh; overflow-y: auto;">
        
        <div style="display:flex; align-items:center; margin-bottom: 20px;">
          <button type="button" style="background:transparent; border:none; font-size:16px; color:var(--text); padding:8px 16px 8px 0; margin-right:8px; cursor:pointer; display:flex; align-items:center; gap:6px;" onclick="closeAndUnlockAkceModal()">
            <span style="font-size:24px; line-height:1;">←</span> Zpět
          </button>
          <h3 style="margin:0; font-size:19px; color:${isReadOnly ? 'var(--text-muted)' : 'var(--text)'};">${modalTitle}</h3>
        </div>

        ${isReadOnly ? `
          <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid #f59e0b; border-radius: 6px; padding: 10px 12px; margin-bottom: 16px; font-size: 13px; color: var(--text);">
            🔒 <strong>Položka je uzamčena pro úpravy.</strong> Právě ji upravuje jiný člen vedení. Data jsou zobrazena pouze pro čtení.
          </div>
        ` : ''}
        
        <form id="editAkceForm" onsubmit="submitAkceForm(event, '${isEdit ? escapeHtml(akce.id) : ''}')"> 
          <label>Typ položky:</label>
          <select id="f_typ" class="modal-input" onchange="toggleAkceFields()" ${selectDisabledAttr}>
            <option value="Tutti zkouška" ${akce?.typ==='Tutti zkouška'?'selected':''}>Tutti zkouška</option>
            <option value="Zkouška smyčců" ${akce?.typ==='Zkouška smyčců'?'selected':''}>Zkouška smyčců</option>
            <option value="Zkouška dechů" ${akce?.typ==='Zkouška dechů'?'selected':''}>Zkouška dechů</option>
            <option value="Generálka" ${akce?.typ==='Generálka'?'selected':''}>Generálka</option>
            <option value="Koncert" ${akce?.typ==='Koncert'?'selected':''}>Koncert</option>
            <option value="Informace" ${(akce?.typ==='Informace' || akce?.typ==='Oznámení') ? 'selected' : ''}>Informace</option>
            <option value="Informace (Historie)" ${(akce?.typ==='Informace (Historie)' || akce?.typ==='Informace (Infoarchiv)' || akce?.typ==='Oznámení (Archiv)') ? 'selected' : ''}>Informace (Historie)</option>
          </select>

          <!-- VÝBĚR CÍLOVÉ SKUPINY PRO INFORMACE -->
          <div id="row_cilovaSkupina" style="display:none; margin-bottom:14px; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:10px 12px;">
            <label style="font-weight:700; display:block; margin-bottom:6px; font-size:13px; color:var(--text);">Komu je informace určena:</label>
            <select id="f_cilovaSkupina" class="modal-input" style="margin-bottom:4px; font-size:14px;" ${roAttr}>
              <option value="vsichni" ${cilovaSkupinaValue!=='vedeni' && cilovaSkupinaValue!=='editory' ? 'selected' : ''}>🌐 Celý orchestr (veřejná informace)</option>
              <option value="vedeni" ${cilovaSkupinaValue==='vedeni' ? 'selected' : ''}>🔒 Pouze vedení a výbor (interní informace)</option>
              ${isAdminUser(user) ? `<option value="editory" ${cilovaSkupinaValue==='editory' ? 'selected' : ''}>💡 Pouze editoři (Novinky v žárovce)</option>` : ''}
            </select>
            <small style="color:var(--text-muted); font-size:12px; display:block; line-height:1.3;">
              ${isAdminUser(user) ? 'Volbu „Pouze editoři“ máte k dispozici pouze vy jako správce systému. Zpráva se nezobrazí na zdi, ale v žárovce 💡.' : 'Interní informace uvidí pouze dirigent, vedení a pomocníci výboru. Běžným muzikantům se nezobrazí.'}
            </small>
          </div>

          <!-- NAŠEPTÁVAČ PRO DIRIGENTY -->
          <datalist id="dirigenti-list">
            <option value="Jiří Sycha"></option>
            <option value="Vojtěch Čapek"></option>
          </datalist>

          <div id="row_dirigent" style="display:none; margin-bottom: 12px;">
            <label>Dirigent akce (volitelné):</label>
            <input type="text" id="f_dirigent" list="dirigenti-list" class="modal-input" placeholder="např. Jiří Sycha, Vojtěch Čapek nebo host..." value="${escapeHtml(akce?.dirigent||'')}" ${roAttr}>
            <small style="color:var(--text-muted); font-size:12px;">Pokud zadáte jméno (např. hosta), bude po přihlášení na pódium automaticky zařazen na pozici dirigenta.</small>
          </div>
          
          <label>Název / Nadpis položky:</label>
          <input type="text" id="f_nazev" value="${escapeHtml(akce?.nazev||'')}" required class="modal-input" ${roAttr}>

          <div>
            <label>Datum:</label>
            <input type="date" id="f_datum" value="${escapeHtml(formDateValue)}" required class="modal-input" ${roAttr}>
          </div>

          <div id="row_casy_hlavni" style="display:flex; gap:12px; margin-top:8px;">
            <div id="col_casOd" style="flex:1;">
              <label>Čas začátku (od):</label>
              <input type="time" id="f_casOd" value="${escapeHtml(formatDisplayTime(akce?.casOd||''))}" class="modal-input" ${roAttr}>
            </div>
            <div id="row_casDo" style="flex:1;">
              <label>Čas konce (do – volitelné):</label>
              <input type="time" id="f_casDo" value="${escapeHtml(formatDisplayTime(akce?.casDo||''))}" class="modal-input" ${roAttr}>
            </div>
          </div>

          <div id="row_misto" style="display:block;">
            <label>Místo:</label>
            <input type="text" id="f_misto" value="${escapeHtml(akce?.misto||'')}" class="modal-input" ${roAttr}>
          </div>

          <div id="row_casy" style="display:flex; gap:12px;">
            <div style="flex:1;">
              <label>Čas srazu:</label>
              <input type="time" id="f_casSrazu" value="${escapeHtml(formatDisplayTime(akce?.casSrazu||''))}" class="modal-input" ${roAttr}>
            </div>
            <div id="col_generalka" style="flex:1;">
              <label>Čas generálky:</label>
              <input type="time" id="f_zacatekGeneralky" value="${escapeHtml(formatDisplayTime(akce?.zacatekGeneralky||''))}" class="modal-input" ${roAttr}>
            </div>
          </div>

          <div id="row_obleceni" style="display:flex; gap:12px;">
            <div style="flex:1;">
              <label>Dámy (oděv):</label>
              <input type="text" id="f_damy" value="${escapeHtml(akce?.damy||'')}" class="modal-input" ${roAttr}>
            </div>
            <div style="flex:1;">
              <label>Páni (oděv):</label>
              <input type="text" id="f_pani" value="${escapeHtml(akce?.pani||'')}" class="modal-input" ${roAttr}>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:4px; margin-top:8px;">
            <label style="margin:0;">Hlavní text (Poznámka / organizační info):</label>
            ${!isReadOnly ? `
              <div class="format-toolbar">
                <button type="button" class="format-btn" onclick="insertFormatTag('**')" title="Tučně"><b>B</b></button>
                <button type="button" class="format-btn" onclick="insertFormatTag('*')" title="Kurzíva"><i>I</i></button>
                <button type="button" class="format-btn" onclick="insertFormatTag('__')" title="Podtržení"><u>U</u></button>
                <button type="button" class="format-btn" onclick="insertFormatTag('- ', '')" title="Odrážka">• Seznam</button>
                <button type="button" class="format-btn" onclick="insertFormatTag('LINK')" title="Vložit odkaz">🔗 Odkaz</button>
              </div>
            ` : ''}
          </div>
          <textarea id="f_poznamka" class="modal-input" style="min-height:90px; resize:vertical;" placeholder="Zde můžete psát i formátovat (**tučně**, *kurzíva*, odkazy...)" ${roAttr}>${escapeHtml(parsed.mainNote)}</textarea>

          <!-- BLOK: PROGRAM -->
          <div style="margin-top: 16px; background: var(--bg); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
              <label style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; position: sticky; top: -12px; background: var(--bg); z-index: 5; padding: 6px 0; border-bottom: 1px solid var(--border);">
                  <span style="font-weight:bold; color:var(--text);">🎼 Program</span>
                  ${!isReadOnly ? `<button type="button" class="btn" style="padding:6px 12px; font-size:13px; background:var(--primary-light); width:auto;" onclick="addProgramRow()">➕ Přidat skladbu</button>` : ''}
              </label>
              <div id="program-rows"></div>
              ${!isReadOnly ? `<button type="button" class="btn" style="width:100%; margin-top:8px; padding:10px; font-size:14px; background:var(--primary-light);" onclick="addProgramRow()">➕ Přidat další skladbu</button>` : ''}
          </div>

          <!-- BLOK: HARMONOGRAM -->
          <div style="margin-top: 16px; background: var(--bg); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
              <label style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                  <span style="font-weight:bold; color:var(--text);">⏱️ Časový plán</span>
                  ${!isReadOnly ? `<button type="button" class="btn" style="padding:6px 12px; font-size:13px; background:var(--primary-light); width:auto;" onclick="addScheduleRow()">➕ Přidat čas</button>` : ''}
              </label>
              <div id="schedule-rows"></div>
          </div>

          <!-- TLAČÍTKA AKCÍ / ZAVŘENÍ -->
          <div style="display:flex; gap:12px; margin-top:24px; flex-wrap:wrap;">
            ${!isReadOnly ? `
              <button type="submit" id="btnSaveModal" class="btn" style="flex:1; min-width:120px;">Uložit</button>
              <button type="button" class="btn" style="background:var(--border); color:var(--text); flex:1; min-width:120px;" onclick="closeAndUnlockAkceModal()">Zrušit</button>
              ${isEdit ? `<button type="button" class="btn" style="background:var(--danger); color:white; width:100%; margin-top:8px;" onclick="deleteAkcePrompt('${escapeHtml(akce.id)}')">🗑 Smazat položku</button>` : ''}
            ` : `
              <button type="button" class="btn" style="background:var(--primary); width:100%;" onclick="closeAndUnlockAkceModal()">Zavřít náhled</button>
            `}
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  toggleAkceFields(); 
  
  programLines.forEach(p => addProgramRow(p.num, p.author, p.piece, isReadOnly));
  scheduleLines.forEach(s => addScheduleRow(s.time, s.desc, isReadOnly));
}

function moveProgramRow(btn, direction) {
  const row = btn.closest('.prog-item-row');
  if (!row) return;
  if (direction === -1 && row.previousElementSibling) {
    row.parentElement.insertBefore(row, row.previousElementSibling);
  } else if (direction === 1 && row.nextElementSibling) {
    row.parentElement.insertBefore(row, row.nextElementSibling, row);
  }
  renumberProgramRows();
}

function renumberProgramRows() {
  const rows = document.querySelectorAll('.prog-item-row');
  rows.forEach((r, idx) => {
    const numInput = r.querySelector('.prog-num');
    if (numInput && (!numInput.value || !isNaN(parseInt(numInput.value)))) {
      numInput.value = (idx + 1);
    }
  });
}

function removeProgramRow(btn) {
  if (confirm("Opravdu chcete tuto skladbu z programu odstranit?")) {
    const row = btn.closest('.prog-item-row');
    if (row) {
      row.remove();
      renumberProgramRows();
    }
  }
}

function addProgramRow(num = '', author = '', piece = '', isReadOnly = false) {
  const cont = document.getElementById('program-rows');
  if (!cont) return;
  
  if (!num) {
    num = cont.querySelectorAll('.prog-item-row').length + 1;
  }

  const roAttr = isReadOnly ? 'disabled style="background:var(--bg); opacity:0.85; cursor:not-allowed;"' : '';
  const div = document.createElement('div');
  div.className = 'prog-item-row';
  div.style = 'border: 1px dashed var(--border); padding: 10px; margin-bottom: 10px; border-radius: 8px; background: var(--surface);';
  
  div.innerHTML = `
    ${!isReadOnly ? `
      <div style="display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 6px;">
        <button type="button" class="btn" style="padding: 4px 10px; font-size: 12px; background: var(--bg); color: var(--text); border: 1px solid var(--border); width: auto;" onclick="moveProgramRow(this, -1)" title="Posunout nahoru">▲</button>
        <button type="button" class="btn" style="padding: 4px 10px; font-size: 12px; background: var(--bg); color: var(--text); border: 1px solid var(--border); width: auto;" onclick="moveProgramRow(this, 1)" title="Posunout dolů">▼</button>
        <button type="button" class="btn" style="padding: 4px 10px; font-size: 12px; background: transparent; color: var(--danger); border: 1px solid var(--danger); width: auto; margin-left: 6px;" onclick="removeProgramRow(this)" title="Smazat skladbu">✕</button>
      </div>
    ` : ''}

    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
      <div style="width: 52px; flex-shrink: 0;">
        <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 2px;">Pořadí:</label>
        <input type="text" class="modal-input prog-num" placeholder="1" value="${escapeHtml(num)}" style="padding: 8px 6px; font-size: 14px; text-align: right;" ${roAttr}>
      </div>
      <div style="flex: 1; min-width: 0;">
        <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 2px;">Autor / Skladatel:</label>
        <input type="text" class="modal-input prog-author" placeholder="např. Antonín Dvořák" value="${escapeHtml(author)}" style="padding: 8px 10px; font-size: 14px;" ${roAttr}>
      </div>
    </div>
    
    <div>
      <label style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 2px;">Dílo / Skladba:</label>
      <textarea class="modal-input prog-piece" placeholder="např. Symfonie č. 9 e moll „Z Nového světa“, op. 95" rows="2" style="padding: 8px 10px; font-size: 14px; min-height: 54px; resize: vertical; line-height: 1.4;" ${roAttr}>${escapeHtml(piece).replace(/\[BR\]/g, '\n')}</textarea>
    </div>
  `;
  cont.appendChild(div);
}

function addScheduleRow(time = '', desc = '', isReadOnly = false) {
  const cont = document.getElementById('schedule-rows');
  if (!cont) return;

  const roAttr = isReadOnly ? 'disabled style="background:var(--bg); opacity:0.85; cursor:not-allowed;"' : '';
  const div = document.createElement('div');
  div.style = 'border: 1px dashed var(--border); padding: 8px; margin-bottom: 8px; border-radius: 6px; position: relative;';
  div.innerHTML = `
    ${!isReadOnly ? `
      <button type="button" style="position: absolute; top: 8px; right: 8px; background: transparent; border: 1px solid var(--danger); border-radius: 4px; color: var(--danger); font-size: 12px; padding: 2px 6px; cursor:pointer;" onclick="this.parentElement.remove()">✕</button>
    ` : ''}
    <div style="margin-top: ${isReadOnly ? '0' : '20px'};">
        <label style="font-size: 12px; display: block; margin-bottom: 2px;">Čas (od - do):</label>
        <input type="text" class="modal-input sched-time" placeholder="např. 10:00 - 12:30" value="${escapeHtml(time)}" style="margin-bottom: 6px; padding: 6px 8px; font-size: 14px;" ${roAttr}>
        <label style="font-size: 12px; display: block; margin-bottom: 2px;">Popis programu:</label>
        <textarea class="modal-input sched-desc" placeholder="např. Dopolední zkouška" rows="2" style="padding: 6px 8px; font-size: 14px; min-height: 50px; resize: vertical;" ${roAttr}>${escapeHtml(desc).replace(/\[BR\]/g, '\n')}</textarea>
    </div>
  `;
  cont.appendChild(div);
}

function toggleAkceFields() {
  const typ = document.getElementById('f_typ').value;
  const jeOznameni = typ.includes('Oznámení') || typ.includes('Informace');
  const jeZkouska = typ.includes('zkouška') || typ.includes('Zkouška');
  
  // Zobrazení volby cílové skupiny pro informace
  const rowCil = document.getElementById('row_cilovaSkupina');
  if (rowCil) rowCil.style.display = jeOznameni ? 'block' : 'none';

  // Zobrazení pole pro dirigenta (skryté u informací)
  const rowDirigent = document.getElementById('row_dirigent');
  if (rowDirigent) rowDirigent.style.display = jeOznameni ? 'none' : 'block';

  // Zobrazení pole pro začátek a konec akce (pro všechny akce, skryté u informací)
  const rowCasyHlavni = document.getElementById('row_casy_hlavni');
  if (rowCasyHlavni) rowCasyHlavni.style.display = jeOznameni ? 'none' : 'flex';

  document.getElementById('row_misto').style.display = jeOznameni ? 'none' : 'block';
  document.getElementById('row_casy').style.display = (jeZkouska || jeOznameni) ? 'none' : 'flex';
  document.getElementById('row_obleceni').style.display = (typ === 'Koncert') ? 'flex' : 'none';
  document.getElementById('col_generalka').style.display = (typ === 'Koncert') ? 'block' : 'none';
}

function submitAkceForm(e, akceId) {
  e.preventDefault();
  const saveBtn = document.getElementById('btnSaveModal');
  if (saveBtn) saveBtn.innerText = "Ukládám...";
  
  const typ = document.getElementById('f_typ').value;
  const jeOznameni = typ.includes('Oznámení') || typ.includes('Informace');
  const jeZkouska = typ.includes('zkouška') || typ.includes('Zkouška');
  const finalId = akceId || generovatIdAkce(typ);

  const cilovaSkupinaEl = document.getElementById('f_cilovaSkupina');
  const finalCilovaSkupina = (jeOznameni && cilovaSkupinaEl) ? cilovaSkupinaEl.value : 'vsichni';

  let rawNoteInput = document.getElementById('f_poznamka').value;
  let finalPoznamka = rawNoteInput
    .replace(/={2,}\s*PROGRAM\s*={2,}[\s\S]*/gi, '')
    .replace(/={2,}\s*HARMONOGRAM\s*={2,}[\s\S]*/gi, '')
    .trim();
  
  const progNums = document.querySelectorAll('.prog-num');
  const progAuthors = document.querySelectorAll('.prog-author');
  const progPieces = document.querySelectorAll('.prog-piece');
  let progLines = [];
  for(let i = 0; i < progPieces.length; i++) {
    let num = progNums[i].value.trim();
    let author = progAuthors[i].value.trim();
    let piece = progPieces[i].value.trim().replace(/\n/g, '[BR]');
    if (author || piece) {
      progLines.push(`${num}|${author}|${piece}`);
    }
  }
  if (progLines.length > 0) {
    finalPoznamka += `\n\n===PROGRAM===\n` + progLines.join('\n');
  }

  const schedTimes = document.querySelectorAll('.sched-time');
  const schedDescs = document.querySelectorAll('.sched-desc');
  let schedLines = [];
  for(let i = 0; i < schedTimes.length; i++) {
    let t = schedTimes[i].value.trim();
    let d = schedDescs[i].value.trim().replace(/\n/g, '[BR]');
    if (t || d) {
      schedLines.push(`${t}|${d}`);
    }
  }
  if (schedLines.length > 0) {
    finalPoznamka += `\n\n===HARMONOGRAM===\n` + schedLines.join('\n');
  }

  const payload = {
    id: finalId, 
    typ: typ, 
    cilovaSkupina: finalCilovaSkupina,
    dirigent: jeOznameni ? "" : (document.getElementById('f_dirigent')?.value || "").trim(),
    nazev: document.getElementById('f_nazev').value, 
    datum: formatDateForSave(document.getElementById('f_datum').value), 
    misto: jeOznameni ? "" : document.getElementById('f_misto').value,
    casOd: jeOznameni ? "" : (document.getElementById('f_casOd')?.value || "").trim(),
    casDo: jeOznameni ? "" : (document.getElementById('f_casDo')?.value || "").trim(),
    casSrazu: (jeZkouska || jeOznameni) ? "" : document.getElementById('f_casSrazu').value,
    zacatekGeneralky: typ !== 'Koncert' ? "" : document.getElementById('f_zacatekGeneralky').value,
    damy: typ !== 'Koncert' ? "" : document.getElementById('f_damy').value, 
    pani: typ !== 'Koncert' ? "" : document.getElementById('f_pani').value,
    poznamka: finalPoznamka
  };
  
  runGoogleScript("saveAkce", payload).then(res => {
    if (res.success) { 
      closeAndUnlockAkceModal(); 
      
      const idx = (appData.akce || []).findIndex(a => String(a.id) === String(finalId));
      if (idx !== -1) {
        appData.akce[idx] = Object.assign({}, appData.akce[idx], payload);
      } else {
        if (!appData.akce) appData.akce = [];
        appData.akce.unshift(payload);
      }
      localStorage.setItem("bolech_data_cache", JSON.stringify(appData));
      renderEvents(); 
    } 
    else { 
      alert('Chyba: ' + res.error); 
      if (saveBtn) saveBtn.innerText = "Uložit"; 
    }
  });
}

function deleteAkcePrompt(akceId) {
  if (confirm("Opravdu chcete tuto položku nenávratně smazat z tabulky?")) {
    runGoogleScript("deleteAkce", { id: akceId }).then(res => {
      if (res.success) { 
        closeAndUnlockAkceModal(); 
        appData.akce = (appData.akce || []).filter(a => String(a.id) !== String(akceId));
        localStorage.setItem("bolech_data_cache", JSON.stringify(appData));
        renderEvents(); 
      } 
      else alert('Chyba při mazání: ' + res.error);
    });
  }
}

function archivovatOznameni(akceId) {
  if (confirm("Přesunout tuto informaci do historie? Zmizí z hlavní stránky.")) {
    const akce = (appData.akce || []).find(a => String(a.id) === String(akceId));
    if (!akce) return;
    akce.typ = 'Informace (Historie)';
    runGoogleScript("saveAkce", akce).then(res => {
      if (res.success) { 
        localStorage.setItem("bolech_data_cache", JSON.stringify(appData)); 
        renderEvents(); 
      }
    });
  }
}

function obnovitOznameni(akceId) {
  const akce = (appData.akce || []).find(a => String(a.id) === String(akceId));
  if (!akce) return;
  akce.typ = 'Informace';
  runGoogleScript("saveAkce", akce).then(res => {
    if (res.success) { 
      localStorage.setItem("bolech_data_cache", JSON.stringify(appData)); 
      renderEvents(); 
    }
  });
}

function submitUcast(id, datum, stav, btn) { 
  const origText = btn.innerText; btn.innerText = "Ukládám...";
  runGoogleScript("saveUcast", {akceId: id, datumAkce: datum, jmeno: user.name, sekce: user.section, stav: stav})
  .then(res => {
    btn.innerText = origText;
    if(res.success) {
      document.getElementById('duvod-'+id).style.display = (stav === 'Ne') ? 'block' : 'none'; 
      btn.parentElement.querySelectorAll('.btn-att').forEach(b => b.className = 'btn-att'); 
      btn.classList.add(stav === 'Ano' ? 'selected-ano' : 'selected-ne');
      let exist = (appData.ucast || []).find(u => u.akceId === id && u.jmeno === user.name);
      if(exist) exist.stav = stav; else appData.ucast.push({akceId:id, jmeno:user.name, sekce:user.section, stav:stav});
      document.getElementById('roster-container-'+id).innerHTML = generateRosterHtml(id);
      localStorage.setItem("bolech_data_cache", JSON.stringify(appData));
    }
  });
}

function saveDuvod(id, datum, btn) { 
  const duvod = document.getElementById('in-'+id).value; btn.innerText = "Ukládám...";
  runGoogleScript("saveUcast", {akceId: id, datumAkce: datum, jmeno: user.name, sekce: user.section, stav: 'Ne', duvod: duvod})
  .then(res => {
    btn.innerText = "Odeslat důvod";
    if(res.success) { document.getElementById('duvod-'+id).style.display = 'none'; }
  });
}

function formatDateForInput(dateStr) {
  if (!dateStr) return "";
  const match = String(dateStr).match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (match) {
    const d = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    const y = match[3];
    return `${y}-${m}-${d}`;
  }
  return dateStr;
}

function formatDateForSave(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    const dayName = CZECH_DAYS_SHORT[dateObj.getDay()];
    return `${dayName} ${d}. ${m + 1}. ${y}`;
  }
  return isoDate;
}

// =========================================================================
// HROMADNÁ POŠTA: ROZESÍLÁNÍ ZPRÁV ČLENŮM A VEDENÍ
// =========================================================================
function openMailBroadcastModal() {
  const html = `
    <div id="broadcastMailModal" class="modal-overlay" style="padding: 4px;" onclick="if(event.target===this) document.getElementById('broadcastMailModal').remove()">
      <div class="modal-box" style="max-width: 520px; width: 100%; max-height: 92vh; overflow-y: auto;">
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px;">
          <h3 style="margin:0; font-size:1.15rem; color:var(--text);">✉️ Hromadná zpráva</h3>
          <button type="button" style="background:transparent; border:none; font-size:22px; color:var(--text-muted); cursor:pointer;" onclick="document.getElementById('broadcastMailModal').remove()">✕</button>
        </div>

        <label style="font-size:0.85rem; font-weight:700; margin-bottom:4px; display:block;">Příjemci zprávy:</label>
        <select id="mail_target_group" class="modal-input" onchange="updateBroadcastRecipientCount()" style="margin-bottom:10px;">
          <option value="all">👥 Všichni aktivní členové orchestru</option>
          <option value="committee">🏛️ Výbor (včetně pomocníků výboru)</option>
          <option value="both">👥🏛️ Všichni členové + výbor</option>
          <option value="strings">🎻 Pouze smyčcová sekce</option>
          <option value="winds">🎺 Pouze dechová sekce</option>
          <option value="guests">👥 Pouze aktivní hosté</option>
        </select>

        <div id="broadcast_recipients_info" style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px; background:var(--bg); padding:8px 10px; border-radius:6px; border:1px solid var(--border);">
          Načítám příjemce...
        </div>

        <label style="font-size:0.85rem; font-weight:700; margin-bottom:4px; display:block;">Předmět e-mailu:</label>
        <input type="text" id="mail_broadcast_subject" class="modal-input" placeholder="např. Zkouška v pátek – změna místa" style="margin-bottom:12px;" value="TSO Bolech: ">

        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:4px;">
          <label style="font-size:0.85rem; font-weight:700; margin:0;">Text zprávy:</label>
        </div>
        <textarea id="mail_broadcast_body" class="modal-input" style="min-height:120px; resize:vertical; font-size:14px; margin-bottom:16px;" placeholder="Vážení přátelé, hudebníci..."></textarea>

        <div style="display:flex; gap:8px;">
          <button type="button" class="btn" style="background:var(--success); flex:1; font-weight:700;" onclick="sendBroadcastViaMailto()">
            🚀 Otevřít ve vašem e-mailu
          </button>
          <button type="button" class="btn" style="background:var(--border); color:var(--text); width:auto;" onclick="document.getElementById('broadcastMailModal').remove()">
            Zrušit
          </button>
        </div>
        
        <small style="display:block; margin-top:10px; font-size:0.75rem; color:var(--text-muted); text-align:center;">
          Zpráva se otevře ve vaší poštovní aplikaci se skrytými adresami (BCC), aby byly chráněny e-maily členů.
        </small>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  updateBroadcastRecipientCount();
}

function getBroadcastEmails(targetGroup) {
  const clenove = appData.clenove || [];
  const uniqueEmails = new Set();

  clenove.forEach(c => {
    const email = String(c.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return;

    const role = String(c.role || "").trim().toLowerCase();
    const isCommittee = isCommitteeMember(c.role);
    const sekce = String(c.sekce || "").toLowerCase();
    const isHost = role === 'host';

    const aktivni = String(c.aktivni || "").toUpperCase().trim();
    // Člen je považován za adresáta, pokud je aktivní, host, nebo člen výboru / pomocník výboru
    const isAktivni = aktivni === 'ANO' || aktivni === 'TRUE' || aktivni === '1' || isHost || isCommittee;
    if (!isAktivni) return;

    if (targetGroup === 'all') {
      if (!isHost) uniqueEmails.add(email);
    } else if (targetGroup === 'committee' || targetGroup === 'management') {
      if (isCommittee) uniqueEmails.add(email);
    } else if (targetGroup === 'both') {
      uniqueEmails.add(email);
    } else if (targetGroup === 'strings') {
      if (SMYCKE_SECTIONS.some(s => sekce.includes(s))) uniqueEmails.add(email);
    } else if (targetGroup === 'winds') {
      if (DECHOVE_SECTIONS.some(s => sekce.includes(s))) uniqueEmails.add(email);
    } else if (targetGroup === 'guests') {
      if (isHost) uniqueEmails.add(email);
    }
  });

  return Array.from(uniqueEmails);
}

function updateBroadcastRecipientCount() {
  const group = document.getElementById('mail_target_group')?.value || 'all';
  const emails = getBroadcastEmails(group);
  const infoEl = document.getElementById('broadcast_recipients_info');
  if (infoEl) {
    infoEl.innerHTML = `Vybráno <strong>${emails.length}</strong> adresátů se zadaným e-mailem.`;
  }
}

function sendBroadcastViaMailto() {
  const group = document.getElementById('mail_target_group')?.value || 'all';
  const subjectInput = document.getElementById('mail_broadcast_subject')?.value || '';
  const bodyInput = document.getElementById('mail_broadcast_body')?.value || '';

  const emails = getBroadcastEmails(group);
  if (emails.length === 0) {
    alert("Pro tuto skupinu nebyli nalezeni žádní členové s platnou e-mailovou adresou.");
    return;
  }

  const bccList = emails.join(',');
  const encodedSubject = encodeURIComponent(subjectInput.trim() || 'Zpráva orchestru Bolech');
  const encodedBody = encodeURIComponent(bodyInput.trim());

  const mailtoUrl = `mailto:?bcc=${bccList}&subject=${encodedSubject}&body=${encodedBody}`;

  document.getElementById('broadcastMailModal')?.remove();
  window.location.href = mailtoUrl;
}

// =========================================================================
// SPRÁVA HOSTŮ
// =========================================================================
function openGuestManager() {
  let htmlHoste = "";
  
  // Dnešní půlnoc pro přesné porovnání dat
  const dnes = new Date();
  dnes.setHours(0, 0, 0, 0);

  // Pomocná kontrola: Vypršela už platnost účtu?
  const isHostStalePlatny = platnostStr => {
    if (!platnostStr) return true;
    const str = String(platnostStr).trim();
    let expDate = null;

    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      // Formát YYYY-MM-DD (z date picker formuláře)
      const parts = str.split('T')[0].split('-');
      expDate = new Date(parts[0], parts[1] - 1, parts[2]);
    } else if (/^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/.test(str)) {
      // Formát D. M. YYYY (z Google Tabulky)
      const parts = str.split('.');
      expDate = new Date(parts[2].trim(), parts[1].trim() - 1, parts[0].trim());
    } else {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        expDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      }
    }

    // Pokud je datum neplatné nebo je dnes či v budoucnu, účet je stále aktivní
    return expDate ? expDate >= dnes : true;
  };

  if (appData.clenove) {
    appData.clenove.forEach(c => {
      const isHost = String(c.role || "").toLowerCase() === 'host';
      
      // Zobrazí se POUZE hosté, kterým ještě nevypršela platnost
      if (isHost && isHostStalePlatny(c.platnost)) {
         htmlHoste += `<div style="padding: 6px 0; border-bottom: 1px dashed var(--border); font-size: 14px;">
                        <strong>${escapeHtml(c.celeJmeno)}</strong> (${escapeHtml(c.sekce)})<br>
                        <span style="color:var(--text-muted); font-size:12px;">⏳ Platí do: ${escapeHtml(c.platnost)}</span>
                      </div>`;
      }
    });
  }
  
  if (!htmlHoste) htmlHoste = "<p style='color:var(--text-muted); font-size:13px;'>Žádní aktivní hosté.</p>";

  let html = `
    <div id="guestModal" class="modal-overlay">
      <div class="modal-box" style="max-height: 90vh; overflow-y: auto; padding-bottom: 30px;">
        <div style="display:flex; align-items:center; margin-bottom: 20px;">
          <button type="button" style="background:transparent; border:none; font-size:16px; color:var(--text); padding:8px 16px 8px 0; margin-right:8px; cursor:pointer; display:flex; align-items:center; gap:6px;" onclick="document.getElementById('guestModal').remove()">
            <span style="font-size:24px; line-height:1;">←</span> Zpět
          </button>
          <h3 style="margin:0; font-size:20px;">👥 Správa hostů</h3>
        </div>
        
        <h4 style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom:4px;">Čekající žádosti</h4>
        <div id="pendingRequestsContainer" style="margin-bottom: 24px;">`;
        
        if (!appData.zadosti || appData.zadosti.length === 0) {
          html += `<p style="color:var(--text-muted); font-size:14px;">Žádné nové žádosti.</p>`;
        } else {
          appData.zadosti.forEach(z => {
            html += `
            <div style="border: 1px solid var(--border); padding: 12px; border-radius: 6px; margin-bottom: 12px; background: var(--bg);">
              <strong>${escapeHtml(z.jmeno)}</strong> (${escapeHtml(z.nastroj)})<br>
              <span style="font-size:13px; color:var(--text-muted);">E-mail: ${escapeHtml(z.email)} | Tel: ${escapeHtml(z.telefon)}</span>
              
              <div style="margin-top: 12px; display:flex; gap:8px; align-items:flex-end;">
                <div style="flex:1;">
                  <label style="font-size:12px;">Platnost do:</label>
                  <input type="date" id="exp_${z.rowIdx}" class="modal-input" required>
                </div>
                <button type="button" class="btn" style="background:var(--success); padding:10px 14px;" onclick="schvalitHosta(${z.rowIdx}, '${escapeHtml(z.jmeno)}', '${escapeHtml(z.nastroj)}', '${escapeHtml(z.email)}', this)">Schválit a odeslat PIN</button>
              </div>
            </div>`;
          });
        }

  html += `
        </div>
        
        <h4 style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom:4px;">Přímé pozvání hosta</h4>
        <form onsubmit="pridatHostaNaprimo(event)">
          <input type="text" id="dirGuestName" required placeholder="Jméno a Příjmení" class="modal-input" style="margin-bottom: 8px;">
          
          <select id="dirGuestInst" required class="modal-input" style="margin-bottom: 8px;">
            <option value="" disabled selected>Vyberte nástrojovou sekci...</option>
            <option value="Dirigent">🎼 Dirigent (hostující)</option>
            <option value="1. Housle">1. Housle</option>
            <option value="2. Housle">2. Housle</option>
            <option value="Violy">Violy</option>
            <option value="Violoncella">Violoncella</option>
            <option value="Kontrabasy">Kontrabasy</option>
            <option value="Flétny">Flétny</option>
            <option value="Hoboje">Hoboje</option>
            <option value="Klarinety / Saxofony">Klarinety / Saxofony</option>
            <option value="Fagoty">Fagoty</option>
            <option value="Lesní rohy">Lesní rohy</option>
            <option value="Trubky">Trubky</option>
            <option value="Trombóny a Tuba">Trombóny a Tuba</option>
            <option value="Bicí nástroje">Bicí nástroje</option>
            <option value="Klávesy">Klávesy</option>
            <option value="Kytary">Kytary</option>
            <option value="Zpěv">Zpěv</option>
            <option value="Hosté">Jiný / Ostatní</option>
          </select>

          <input type="email" id="dirGuestEmail" required placeholder="E-mail hosta" class="modal-input" style="margin-bottom: 8px;">
          <label style="font-size:12px; margin-top:8px; display:block;">Platnost účtu do:</label>
          <input type="date" id="dirGuestExp" required class="modal-input" style="margin-bottom: 16px;">
          
          <button type="submit" id="dirGuestBtn" class="btn" style="width:100%; background:var(--primary-light);">Vytvořit hosta a odeslat PIN</button>
        </form>

        <h4 style="margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom:4px;">Aktivní hosté</h4>
        
        <div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border); padding: 10px; border-radius: 6px; background: var(--bg);">
          ${htmlHoste}
        </div>

      </div>
    </div>`;
  
  document.body.insertAdjacentHTML('beforeend', html);
}

function schvalitHosta(rowIdx, jmeno, nastroj, email, btnElem) {
  const expDate = document.getElementById('exp_' + rowIdx).value;
  if (!expDate) { alert("Musíte vybrat datum expirace!"); return; }
  
  btnElem.innerText = "Odesílám..."; btnElem.disabled = true;
  
  runGoogleScript("approveGuest", { zadostRowIdx: rowIdx, jmeno: jmeno, nastroj: nastroj, email: email, expirace: expDate })
  .then(res => {
    if(res.success) {
      alert("Účet byl vytvořen a PIN byl odeslán na e-mail: " + email);
      localStorage.removeItem("bolech_data_cache");
      document.getElementById('guestModal').remove();
      initApp();
    } else { alert("Chyba: " + res.error); btnElem.innerText = "Schválit a odeslat PIN"; btnElem.disabled = false; }
  });
}

function pridatHostaNaprimo(e) {
  e.preventDefault();
  const btn = document.getElementById('dirGuestBtn');
  btn.innerText = "Odesílám..."; btn.disabled = true;
  
  const payload = {
    jmeno: document.getElementById('dirGuestName').value,
    nastroj: document.getElementById('dirGuestInst').value,
    email: document.getElementById('dirGuestEmail').value,
    expirace: document.getElementById('dirGuestExp').value
  };

  runGoogleScript("approveGuest", payload).then(res => {
    if(res.success) {
      alert("Host byl vytvořen a PIN byl odeslán e-mailem!");
      localStorage.removeItem("bolech_data_cache");
      document.getElementById('guestModal').remove();
      initApp();
    } else { alert("Chyba: " + res.error); btn.innerText = "Vytvořit hosta a odeslat PIN"; btn.disabled = false; }
  });
}

function odeslatZadostHosta(e) {
  e.preventDefault();
  const btn = document.getElementById('guestReqBtn');
  const puvodniText = btn.innerText;
  btn.innerText = "Odesílám..."; btn.disabled = true;

  const payload = {
    jmeno: document.getElementById('guestName').value,
    nastroj: document.getElementById('guestInstrument').value,
    email: document.getElementById('guestEmail').value,
    telefon: document.getElementById('guestPhone').value
  };

  runGoogleScript("requestGuestAccount", payload).then(res => {
    btn.innerText = puvodniText; btn.disabled = false;
    if (res.success) {
      alert("Žádost byla úspěšně odeslána vedení! Jakmile ji schválí, přijde vám PIN na e-mail.");
      document.getElementById('guestRequestCard').style.display = 'none'; 
      document.getElementById('loginFormCard').style.display = 'block';
    } else {
      alert("Chyba při odesílání: " + res.error);
    }
  });
}

function confirmLogout() { 
  if(confirm("Opravdu se chcete odhlásit?")) { localStorage.removeItem('bolech_auth_member'); localStorage.removeItem('bolech_data_cache'); location.reload(); } 
}

// =========================================================================
// ZJIŠTĚNÍ OPRÁVNĚNÍ A PROGRAMŮ PRO DIRIGENTA
// =========================================================================
function isUserConductor(u = user) {
  if (!u) return false;
  if (isDirigentPerson(u.name, u.section, u.role)) return true;
  const uName = String(u.name || "").trim().toLowerCase();
  const uSec = String(u.section || "").trim().toLowerCase();
  if (uSec === "dirigent" || uSec.includes("dirigent")) return true;
  return (appData.akce || []).some(a => String(a.dirigent || "").trim().toLowerCase() === uName);
}

function getDirigentProgramy(u = user) {
  if (!u) return [];
  const uName = String(u.name || "").trim().toLowerCase();
  const uRole = String(u.role || "").trim().toLowerCase();
  const uSec = String(u.section || "").trim().toLowerCase();

  const vsechnyProgramy = Array.from(new Set(
    (appData.noty || []).map(n => String(n.program || "").trim()).filter(Boolean)
  ));

  // Šéfdirigent a vedení mají přístup ke všem programům
  const jeSef = uRole.includes('dirigent') || uName.includes('sycha') || hasEditRights(uRole);
  if (jeSef) return vsechnyProgramy;

  // Akce, které tento uživatel diriguje
  const dirigovaneAkce = (appData.akce || []).filter(a => {
    const aDir = String(a.dirigent || "").trim().toLowerCase();
    if (aDir && aDir === uName) return true;
    if (!aDir && (uSec === 'dirigent' || uSec.includes('dirigent'))) return true;
    return false;
  });

  if (dirigovaneAkce.length === 0) {
    return (uSec === 'dirigent' || uSec.includes('dirigent')) ? vsechnyProgramy : [];
  }

  const nalezene = new Set();
  dirigovaneAkce.forEach(a => {
    const aNazev = String(a.nazev || "").trim().toLowerCase();
    const aPozn = String(a.poznamka || "").trim().toLowerCase();

    vsechnyProgramy.forEach(prog => {
      const pLow = prog.toLowerCase();
      if (aNazev.includes(pLow) || pLow.includes(aNazev) || aPozn.includes(pLow)) {
        nalezene.add(prog);
      }
    });
  });

  return nalezene.size > 0 ? Array.from(nalezene) : vsechnyProgramy;
}

// =========================================================================
// NOTOVÝ ARCHIV PRO HRÁČE A DIRIGENTY
// =========================================================================
function vykresliNoty(dataNoty, nastrojUzivatele, jeDirigent = false) {
  const kontejner = document.getElementById('notyContainer');
  const infoText = document.getElementById('notyNastrojInfo');
  if (!kontejner) return;

  const canEdit = hasEditRights(user.role);
  const jeDirigentAktivni = isUserConductor(user);
  const povolenoPrepinat = canEdit || jeDirigentAktivni;
  const jeExterniHostDirigent = (String(user.role || "").trim().toLowerCase() === "host") && 
                                (String(user.section || "").trim().toLowerCase() === "dirigent");

  // Vyhodnocení efektivního nástroje / partitury
  let efektivniNastroj = nastrojUzivatele;
  if (efektivniNastroj === "Baskytara") efektivniNastroj = "Kontrabasy";
  if (efektivniNastroj === "Dirigent") efektivniNastroj = "Partitura";

  const jeRezimPartitury = efektivniNastroj === "Partitura";

  if (infoText) {
    infoText.textContent = jeRezimPartitury 
      ? "Režim partitury (Dirigent)" 
      : `Zobrazený part: ${efektivniNastroj}${user.section === 'Baskytara' ? ' (převzato z kontrabasů)' : ''}`;
  }

  // Seznam povolených programů pro partituru / externího hosta
  const dirigovaneProgramy = jeDirigentAktivni ? getDirigentProgramy(user) : [];

  let htmlDropdown = '';
  if (povolenoPrepinat) {
    const labelDropdownu = jeDirigentAktivni ? "🎼 Výběr partu / partitury pro kontrolu:" : "👀 Náhled partů (pouze pro vedení):";
    htmlDropdown = `
      <div style="margin-bottom: 20px; background: var(--bg); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
        <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 8px; color: var(--text);">${labelDropdownu}</label>
        <select class="modal-input" onchange="zmenitPohledNot(this.value)" style="margin-bottom:0; font-size:14px; background: var(--surface);">
          ${user.section && user.section.toLowerCase() !== 'dirigent' ? `<option value="Vlastní part" ${efektivniNastroj === user.section ? 'selected' : ''}>Můj nástroj (${user.section})</option>` : ''}
          ${jeDirigentAktivni ? `<option value="Partitura" ${efektivniNastroj === 'Partitura' ? 'selected' : ''}>🎼 Partitura (celý orchestr)</option>` : ''}
          ${PARTITURA_SECTIONS.map(s => `<option value="${s}" ${efektivniNastroj === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        ${(jeRezimPartitury && dirigovaneProgramy.length > 0 && !hasEditRights(user.role)) ? `
          <small style="color:var(--text-muted); font-size:12px; display:block; margin-top:6px;">
            Zobrazeny partitury pro dirigovaný program: <strong>${dirigovaneProgramy.join(', ')}</strong>
          </small>
        ` : ''}
      </div>
    `;
  }

  const relevantniNoty = dataNoty.filter(nota => {
    let aktivni = String(nota.aktivni || '').toUpperCase().trim();
    if (aktivni !== 'TRUE' && aktivni !== 'ANO' && aktivni !== '1') return false;

    // PRAVIDLO PRO PROGRAMY:
    // 1. Pokud je to externí hostující dirigent (role Host bez nástroje), vidí jen svůj program.
    // 2. Pokud kdokoliv (i hráč-dirigent) prohlíží PARTITURU, vidí partitury programů, které diriguje (šéfdirigent vidí vše).
    // 3. Pokud stálý hráč (např. Vojtěch Čapek) prohlíží SVŮJ NÁSTROJ (housle) nebo jiné hráčské party,
    //    vidí VŠECHNY AKTUÁLNÍ PROGRAMY na repertoáru!
    if (!hasEditRights(user.role)) {
      if (jeExterniHostDirigent) {
        if (dirigovaneProgramy.length > 0 && !dirigovaneProgramy.includes(String(nota.program || '').trim())) {
          return false;
        }
      } else if (jeRezimPartitury && jeDirigentAktivni && dirigovaneProgramy.length > 0) {
        if (!dirigovaneProgramy.includes(String(nota.program || '').trim())) {
          return false;
        }
      }
    }

    const secRaw = String(nota.sekce || '').trim();
    const prirazeneSekce = secRaw.split(/[,;/+]/).map(s => s.trim()).filter(Boolean);

    if (efektivniNastroj === 'Partitura') {
      return prirazeneSekce.includes('Partitura');
    }

    // Kontrola všech sekcí přiřazených k této notě
    for (const sec of prirazeneSekce) {
      if (sec === efektivniNastroj) return true;
      if (sec === 'Housle' && (efektivniNastroj === '1. Housle' || efektivniNastroj === '2. Housle')) return true;
      if (sec === 'Smyčce' && ['1. Housle', '2. Housle', 'Violy', 'Violoncella', 'Kontrabasy'].includes(efektivniNastroj)) return true;
      if (sec === 'Dechy' && ['Flétny', 'Hoboje', 'Klarinety / Saxofony', 'Fagoty', 'Lesní rohy', 'Trubky', 'Trombóny a Tuba'].includes(efektivniNastroj)) return true;
      if (sec === 'Dřeva' && ['Flétny', 'Hoboje', 'Klarinety / Saxofony', 'Fagoty'].includes(efektivniNastroj)) return true;
      if (sec === 'Žestě' && ['Lesní rohy', 'Trubky', 'Trombóny a Tuba'].includes(efektivniNastroj)) return true;
    }
    return false;
  });

  let html = htmlDropdown;

  if (relevantniNoty.length === 0) {
    kontejner.innerHTML = html + '<p style="color: var(--text-muted); text-align: center; margin-top: 40px; padding: 20px;">Pro tento part v daném programu nejsou k dispozici žádné noty.</p>';
    return;
  }

  const notyPodleProgramu = {};
  relevantniNoty.forEach(nota => {
    const program = nota.program || 'Ostatní repertoár';
    if (!notyPodleProgramu[program]) notyPodleProgramu[program] = [];
    notyPodleProgramu[program].push(nota);
  });

  let mujEmail = (user && user.email) ? user.email.trim() : '';
  if (!mujEmail && appData.clenove) {
    const ja = appData.clenove.find(c => (c.celeJmeno === user.name || c.jmeno === user.name || c.name === user.name));
    if (ja && ja.email) mujEmail = ja.email.trim();
  }

  for (const [program, noty] of Object.entries(notyPodleProgramu)) {
    let emailPredmet = encodeURIComponent(`Noty TSO Bolech - ${program}`);
    let emailTelo = `Dobrý den,\n\nzasílám odkazy pro přímé stažení not (Program: ${program}, Part: ${efektivniNastroj}):\n\n`;
    noty.forEach(n => {
      let stahovaciOdkaz = n.odkaz.replace(/.*\/d\/([a-zA-Z0-9_-]+).*/, 'https://drive.google.com/uc?export=download&id=$1');
      emailTelo += `- ${n.skladba}:\n  ${stahovaciOdkaz}\n\n`;
    });
    emailTelo += `Portál TSO Bolech`;

    let mailtoOdkaz = `mailto:${mujEmail}?subject=${emailPredmet}&body=${encodeURIComponent(emailTelo)}`;

    html += `
      <div class="program-header">
        <h3 class="program-title">${escapeHtml(program)}</h3>
        <a href="${mailtoOdkaz}" class="email-btn" title="Odeslat odkazy na e-mail">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>
          Poslat e-mailem
        </a>
      </div>`;
      
    noty.forEach(nota => {
      let downloadUrl = nota.odkaz.replace(/.*\/d\/([a-zA-Z0-9_-]+).*/, 'https://drive.google.com/uc?export=download&id=$1');
      html += `
        <div class="nota-card">
          <div class="nota-info">
            <h4>${escapeHtml(nota.skladba)}</h4>
            <span>${escapeHtml(nota.sekce)}</span>
          </div>
          <a href="${downloadUrl}" target="_blank" class="nota-down-btn" title="Stáhnout">
            <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </a>
        </div>`;
    });
  }
  
  kontejner.innerHTML = html;
}

function zmenitPohledNot(novyNastroj) {
  const jeDirigentAktivni = isUserConductor(user);
  let nastrojProZobrazeni = novyNastroj;
  
  if (novyNastroj === 'Vlastní part') {
    nastrojProZobrazeni = (user.section.toLowerCase() === 'dirigent') ? 'Partitura' : user.section;
  }
  
  vykresliNoty(appData.noty || [], nastrojProZobrazeni, jeDirigentAktivni);
}

window.maNeulozeneZmeny = false;

function oznacNeulozeneZmeny() {
  window.maNeulozeneZmeny = true;
  const btn = document.getElementById('btnUlozitNoty');
  if(btn) {
    btn.style.background = 'var(--danger)';
    btn.innerHTML = "⚠️ ULOŽIT ZMĚNY (neuloženo)";
  }
}

window.addEventListener('beforeunload', (e) => {
  if (window.maNeulozeneZmeny) {
    e.preventDefault();
    e.returnValue = ''; 
  }
});

function switchTab(t, b) { 
  if (window.maNeulozeneZmeny && t !== 'admin-noty') {
    if (!confirm("⚠️ Ve Správě not máte NEULOŽENÉ ZMĚNY!\n\nOpravdu chcete odejít bez uložení? Změny se nenávratně smažou.")) {
      return; 
    }
    window.maNeulozeneZmeny = false; 
  }

  document.getElementById('tab-events').style.display = t === 'events' ? 'block' : 'none'; 
  document.getElementById('tab-archive').style.display = t === 'archive' ? 'block' : 'none'; 
  document.getElementById('tab-admin-noty').style.display = t === 'admin-noty' ? 'block' : 'none';

  const tabNoty = document.getElementById('tab-sheetmusic');
  if (tabNoty) tabNoty.style.display = t === 'sheetmusic' ? 'block' : 'none'; 
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active'); 
    btn.style.color = ''; 
  }); 
  
  if (b) { 
    b.classList.add('active'); 
    if (t === 'events') b.style.color = '#3b82f6';
    else if (t === 'sheetmusic') b.style.color = 'var(--success)';
    else if (t === 'admin-noty') b.style.color = '#06b6d4';
  } 
  
  if (t === 'archive') document.body.classList.add('archive-open');
  else document.body.classList.remove('archive-open');

  const bar = document.getElementById('floatingMailBar');
  if (bar) bar.style.display = (t === 'admin-noty' && window.vybraneNotyKEmailu.length > 0) ? 'flex' : 'none';
}

window.stromSlozek = []; 

// =========================================================================
// SPRÁVA NOT VEDENÍ: VÝBĚR OBÁLKOU + PLOVOUCÍ TLAČÍTKO ODESLÁNÍ
// =========================================================================
function toggleMailSelection(odkaz, skladba, sekce, btnElem) {
  const idx = window.vybraneNotyKEmailu.findIndex(n => n.odkaz === odkaz);
  
  if (idx === -1) {
    window.vybraneNotyKEmailu.push({ odkaz, skladba, sekce });
    btnElem.classList.add('is-selected');
    btnElem.title = 'Odebrat z výběru k odeslání';
  } else {
    window.vybraneNotyKEmailu.splice(idx, 1);
    btnElem.classList.remove('is-selected');
    btnElem.title = 'Přidat do výběru k odeslání';
  }

  aktualizovatPlovouciListu();
}

function zrusitVyberNot() {
  window.vybraneNotyKEmailu = [];
  document.querySelectorAll('.btn-nota-mail').forEach(btn => {
    btn.classList.remove('is-selected');
    btn.title = 'Přidat do výběru k odeslání';
  });
  aktualizovatPlovouciListu();
}

function aktualizovatPlovouciListu() {
  let bar = document.getElementById('floatingMailBar');
  const count = window.vybraneNotyKEmailu.length;

  if (count === 0) {
    if (bar) bar.remove();
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'floatingMailBar';
    bar.className = 'floating-mail-bar';
    document.body.appendChild(bar);
  }

  bar.style.display = 'flex';
  bar.innerHTML = `
    <button type="button" class="btn" style="padding: 10px 16px; font-size: 15px; background: var(--success); flex: 1; margin-right: 8px; font-weight: 700;" onclick="otevritDialogHromadnehoEmailu()">
      ✉️ Odeslat vybrané noty (${count})
    </button>
    <button type="button" class="btn" style="padding: 10px 14px; font-size: 15px; background: var(--border); color: var(--text); width: auto;" onclick="zrusitVyberNot()" title="Zrušit výběr">
      ✕
    </button>
  `;
}

function otevritDialogHromadnehoEmailu() {
  if (window.vybraneNotyKEmailu.length === 0) return;

  const html = `
    <div id="bulkSendModal" class="modal-overlay" style="padding: 4px;" onclick="if(event.target===this) document.getElementById('bulkSendModal').remove()">
      <div class="modal-box" style="max-width: 480px; width: 100%;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
          <h3 style="margin:0; font-size:1.15rem; color:var(--text);">✉️ Odeslat vybrané noty</h3>
          <button type="button" style="background:transparent; border:none; font-size:22px; color:var(--text-muted); cursor:pointer;" onclick="document.getElementById('bulkSendModal').remove()">✕</button>
        </div>

        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">
          Zadejte e-mail příjemce (např. hosta) nebo nechte prázdné. Po kliknutí se otevře váš poštovní program s přímými odkazy na vybrané party.
        </p>

        <label style="font-size: 0.82rem; font-weight: 700; margin-bottom: 4px; display: block;">Komu (e-mail příjemce):</label>
        <input type="email" id="bulkRecipientEmail" placeholder="např. host@seznam.cz" class="modal-input" style="margin-bottom: 12px;">

        <div style="max-height: 180px; overflow-y: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px; margin-bottom: 16px;">
          <ul style="margin:0; padding-left: 18px; font-size: 0.85rem; line-height: 1.4;">
            ${window.vybraneNotyKEmailu.map(n => `<li><strong>${escapeHtml(n.skladba)}</strong> (${escapeHtml(n.sekce)})</li>`).join('')}
          </ul>
        </div>

        <div style="display:flex; gap:8px;">
          <button type="button" class="btn" style="background:var(--success); flex:1;" onclick="odeslatMailtoOdkaz()">
            🚀 Otevřít e-mail
          </button>
          <button type="button" class="btn" style="background:var(--border); color:var(--text); width:auto;" onclick="document.getElementById('bulkSendModal').remove()">
            Zrušit
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
}

function odeslatMailtoOdkaz() {
  const recipient = (document.getElementById('bulkRecipientEmail')?.value || '').trim();
  let emailPredmet = encodeURIComponent(`Noty TSO Bolech`);
  let emailTelo = `Dobrý den,\n\nzasílám odkazy pro přímé stažení not z archivu TSO Bolech:\n\n`;
  
  window.vybraneNotyKEmailu.forEach(n => {
    let dlUrl = n.odkaz.replace(/.*\/d\/([a-zA-Z0-9_-]+).*/, 'https://drive.google.com/uc?export=download&id=$1');
    emailTelo += `• ${n.skladba} (${n.sekce}):\n  ${dlUrl}\n\n`;
  });
  
  emailTelo += `Táborský symfonický orchestr Bolech`;
  
  const mailtoLink = `mailto:${recipient}?subject=${emailPredmet}&body=${encodeURIComponent(emailTelo)}`;
  
  document.getElementById('bulkSendModal')?.remove();
  window.location.href = mailtoLink;
}

function pridatSekciKNote(sIdx, fIdx, novaSekce) {
  if (!novaSekce) return;
  const soub = window.stromSlozek[sIdx]?.soubory[fIdx];
  if (!soub) return;

  let secs = String(soub.sekce || '').split(/[,;/+]/).map(s => s.trim()).filter(Boolean);
  if (!secs.includes(novaSekce)) {
    secs.push(novaSekce);
    soub.sekce = secs.join(', ');
    soub._zmenaSekce = true;

    const n = (appData.noty || []).find(item => item.odkaz === soub.odkaz);
    if (n) n.sekce = soub.sekce;

    oznacNeulozeneZmeny();
    vykresliAdminNoty(window.stromSlozek[sIdx]?.cesta);
  }
}

function odebratSekciZNoty(sIdx, fIdx, odebiranaSekce) {
  const soub = window.stromSlozek[sIdx]?.soubory[fIdx];
  if (!soub) return;

  let secs = String(soub.sekce || '').split(/[,;/+]/).map(s => s.trim()).filter(Boolean);
  if (secs.length > 1) {
    secs = secs.filter(s => s !== odebiranaSekce);
    soub.sekce = secs.join(', ');
    soub._zmenaSekce = true;

    const n = (appData.noty || []).find(item => item.odkaz === soub.odkaz);
    if (n) n.sekce = soub.sekce;

    oznacNeulozeneZmeny();
    vykresliAdminNoty(window.stromSlozek[sIdx]?.cesta);
  }
}

function vykresliAdminNoty(cestaKteraMaBytOtevrena = null) {
  const cont = document.getElementById('adminNotyContainer');
  if (!cont) return;

  cont.style.padding = "0";
  cont.style.margin = "0"; 
  cont.style.width = "100%";

  try {
    const savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;

    // 1. Zjistíme, které složky měl uživatel otevřené a jaké hodnoty byly v polích před překreslením
    const zachovanyStavSlozek = {};
    if (window.stromSlozek && window.stromSlozek.length > 0) {
      window.stromSlozek.forEach((s, idx) => {
        const chk = document.getElementById('chk_' + idx);
        const prog = document.getElementById('prog_' + idx);
        const det = chk ? chk.closest('details') : null;
        zachovanyStavSlozek[s.cesta] = {
          open: det ? det.open : false,
          aktivni: chk ? chk.checked : s.aktivni,
          program: prog ? prog.value : s.program
        };
      });
    }

    if (cestaKteraMaBytOtevrena) {
      if (!zachovanyStavSlozek[cestaKteraMaBytOtevrena]) {
        zachovanyStavSlozek[cestaKteraMaBytOtevrena] = {};
      }
      zachovanyStavSlozek[cestaKteraMaBytOtevrena].open = true;
    }

    const slozkyMap = {};

    if (!appData.noty || appData.noty.length === 0) {
      cont.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Archiv je zatím prázdný.</p>';
      return;
    }

    appData.noty.forEach(nota => {
      let skladbaText = String(nota.skladba || '').trim();
      if (!skladbaText) return;

      let lastDash = skladbaText.lastIndexOf(' - ');
      let cesta = lastDash !== -1 ? skladbaText.substring(0, lastDash).trim() : 'Základní složka';
      let soubor = lastDash !== -1 ? skladbaText.substring(lastDash + 3).trim() : skladbaText;

      if (!slozkyMap[cesta]) {
        const st = zachovanyStavSlozek[cesta];
        slozkyMap[cesta] = { 
          cesta: cesta, 
          soubory: [], 
          program: (st && st.program !== undefined) ? st.program : '', 
          aktivni: (st && st.aktivni !== undefined) ? st.aktivni : false 
        };
      }

      slozkyMap[cesta].soubory.push({ ...nota, kratkyNazev: soubor });

      // Pokud ještě nebyl stav v zachovanyStavSlozek, načteme výchozí z databáze
      if (!zachovanyStavSlozek[cesta]) {
        let aktivniHodnota = String(nota.aktivni || '').toUpperCase().trim();
        if (aktivniHodnota === 'ANO' || aktivniHodnota === 'TRUE' || aktivniHodnota === '1') {
          slozkyMap[cesta].aktivni = true;
          if (nota.program) slozkyMap[cesta].program = nota.program;
        }
      }
    });

    window.stromSlozek = Object.values(slozkyMap).sort((a, b) => {
      if (a.aktivni && !b.aktivni) return -1;
      if (!a.aktivni && b.aktivni) return 1;
      return a.cesta.localeCompare(b.cesta);
    });

    let html = `
      <style>
        details.folder-inactive:not([open]) .folder-controls {
          display: none !important;
        }
      </style>
    `;

        window.stromSlozek.forEach((s, index) => {
      const zobrazenyNazev = escapeHtml(s.cesta).replace(/\//g, '<span style="color:var(--text-muted); margin:0 4px;">❯</span>');
      const checkBg = s.aktivni ? 'var(--success)' : 'transparent';
      const stavTrida = s.aktivni ? 'folder-active' : 'folder-inactive';
      
      const st = zachovanyStavSlozek[s.cesta];
      const isOtevreno = (st && st.open) || (s.cesta === cestaKteraMaBytOtevrena);
      const openAttr = isOtevreno ? ' open' : '';

      html += `
        <details class="card ${stavTrida}"${openAttr} data-cesta="${escapeHtml(s.cesta)}" style="margin-bottom: 8px; margin-left: 0; margin-right: 0; padding: 0; overflow: hidden; width: 100%; border: 1px solid var(--border);">
          <!-- ČISTÉ ZÁHLAVÍ KARTY: KLIKNUTÍM SE KARTA POUZE OTEVÍRÁ / ZAVÍRÁ -->
          <summary style="padding: 12px 14px; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <span style="word-break: break-word; line-height: 1.3; font-size: 16px; font-weight: bold; color: var(--text);">
              📁 ${zobrazenyNazev} <small style="font-weight:normal; opacity:0.6;">(${s.soubory.length})</small>
            </span>
            <div style="display:flex; align-items:center; gap:8px;">
              ${s.aktivni ? `<span style="font-size:11px; background:var(--success); color:white; padding:2px 6px; border-radius:4px; font-weight:700;">AKTIVNÍ</span>` : ''}
              <span style="opacity: 0.4; font-size: 14px;">▼</span>
            </div>
          </summary>
          
          <!-- OVLÁDÁNÍ PROGRAMU A AKTIVITY (UVNITŘ ROZBALENÉ KARTY, MIMO SUMMARY) -->
          <div style="padding: 10px 12px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: center;">
            <input type="text" id="prog_${index}" class="modal-input" placeholder="Název programu..." value="${escapeHtml(s.program)}" style="flex: 1; margin: 0; padding: 10px; font-size: 14px; border-radius: 6px;" oninput="oznacNeulozeneZmeny()">  

            <label style="display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; min-width: 44px; background: ${checkBg}; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; transition: background 0.2s;" title="Aktivní na repertoáru">
              <input type="checkbox" id="chk_${index}" ${s.aktivni ? 'checked' : ''} style="transform: scale(1.4); margin: 0; cursor: pointer;" 
                     onchange="
                       oznacNeulozeneZmeny();
                       this.parentElement.style.background = this.checked ? 'var(--success)' : 'transparent';
                       const det = this.closest('details');
                       if(this.checked) { det.classList.remove('folder-inactive'); det.classList.add('folder-active'); }
                       else { det.classList.add('folder-inactive'); det.classList.remove('folder-active'); }
                      ">
            </label>
          </div>
          
          <div class="folder-content" style="padding: 12px; display: flex; flex-direction: column; gap: 6px; background: var(--bg);">
            ${s.soubory.map((soub, fIdx) => {
              const isSelected = window.vybraneNotyKEmailu.some(n => n.odkaz === soub.odkaz);
              const secs = String(soub.sekce || '').split(/[,;/+]/).map(x => x.trim()).filter(Boolean);

              // Možnosti dalších sekcí z partitury
              const dalsiSekceOptions = PARTITURA_SECTIONS
                .filter(sec => !secs.includes(sec))
                .map(sec => `<option value="${escapeHtml(sec)}">${escapeHtml(sec)}</option>`)
                .join('');

              return `
              <div style="border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: var(--bg-card, transparent); display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <a href="${soub.odkaz.replace(/\/view.*/, '/preview')}" target="_blank" style="font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: var(--primary); text-decoration: none; font-weight: 600; cursor: pointer;">
                    📄 <span style="text-decoration: underline;">${escapeHtml(soub.kratkyNazev)}</span>
                  </a>
                  
                  <button type="button" 
                          class="btn-nota-mail ${isSelected ? 'is-selected' : ''}" 
                          onclick="toggleMailSelection('${soub.odkaz}', '${escapeHtml(soub.skladba)}', '${escapeHtml(soub.sekce||'')}', this)" 
                          title="${isSelected ? 'Odebrat z výběru k odeslání' : 'Přidat do výběru k odeslání'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <path d="M22 6l-10 7L2 6"/>
                    </svg>
                  </button>
                </div>

                <!-- Štítky přiřazených sekcí a roletka pro další výběr -->
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px;">
                  <span style="color: var(--text-muted); font-size: 11px;">Part pro:</span>
                  ${secs.map((sName, sIdx) => `
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: ${sIdx === 0 ? 'var(--border)' : 'rgba(59, 130, 246, 0.15)'}; color: var(--text); padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                      ${escapeHtml(sName)}
                      ${sIdx > 0 ? `<span style="cursor: pointer; color: var(--danger); font-weight: bold; margin-left: 2px;" onclick="odebratSekciZNoty(${index}, ${fIdx}, '${escapeHtml(sName)}')" title="Odebrat z této sekce">✕</span>` : ''}
                    </span>
                  `).join('')}

                  <select style="padding: 3px 8px; font-size: 11px; border-radius: 4px; border: 1px dashed var(--border); background: var(--surface); color: var(--text); cursor: pointer;" onchange="pridatSekciKNote(${index}, ${fIdx}, this.value); this.value='';">
                    <option value="">Komu ještě ukázat?</option>
                    ${dalsiSekceOptions}
                  </select>
                </div>
              </div>
              `;
            }).join('')}
          </div>

        </details>
      `;
    });

    cont.innerHTML = html;
    aktualizovatPlovouciListu();
    if (savedScrollY > 0) {
      window.scrollTo(0, savedScrollY);
    }

  } catch (error) {
    cont.innerHTML = `<p style="color:var(--danger); padding:16px;">Chyba: ${error.message}</p>`;
  }
}
function ulozitZmenyNot(e) {
  const eventObj = e || window.event;
  if (eventObj && eventObj.preventDefault) eventObj.preventDefault();

  const button = eventObj ? (eventObj.currentTarget || eventObj.target) : null;
  if (button) {
    button.innerText = "⏳ Ukládám změny...";
    button.disabled = true;
  }

  const zmeny = [];
  window.stromSlozek.forEach((s, index) => {
    const chk = document.getElementById('chk_' + index);
    const inputProg = document.getElementById('prog_' + index);

    if (chk && inputProg) {
      const novaAktivni = chk.checked;
      const novyProgram = inputProg.value.trim();

      const stavText = novaAktivni ? 'ANO' : '';
      const folderChanged = (s.aktivni !== novaAktivni || s.program !== novyProgram);

      s.soubory.forEach(soubor => {
        if (folderChanged || soubor._zmenaSekce) {
          zmeny.push({
            odkaz: soubor.odkaz,
            aktivni: stavText,
            program: novyProgram,
            sekce: soubor.sekce
          });
        }
      });
    }
  });

  if (zmeny.length === 0) {
    alert("Nebyly provedeny žádné změny.");
    if (button) {
      button.disabled = false;
      button.innerText = "💾 Uložit všechny změny";
    }
    return;
  }

  runGoogleScript("updateNotyHromadne", { zmeny: zmeny }).then(res => {
    if (button) {
      button.disabled = false;
      button.innerHTML = "💾 Uložit všechny změny";
      button.style.background = "var(--success)";
    }
    if (res.success) {
      window.maNeulozeneZmeny = false;
      alert("Změny v archivu byly úspěšně uloženy.");
      localStorage.removeItem("bolech_data_cache");
      initApp(); 
    } else {
      alert("Chyba při ukládání: " + res.error);
    }
  });
}

// =========================================================================
// AUTOMATICKÁ TICHÁ AKTUALIZACE DAT (PŘI OTEVŘENÉ APLIKACI)
// =========================================================================
let posledniAktualizaceCas = Date.now();
const MIN_INTERVAL_OBNOVENI_MS = 5 * 60 * 1000; // Minimálně 5 minut mezi kontrolami

async function tichaObnovaDat(vynutit = false) {
  // Pokud uživatel ještě není přihlášen, neaktualizujeme
  if (!user) return;

  const nyni = Date.now();
  if (!vynutit && (nyni - posledniAktualizaceCas < MIN_INTERVAL_OBNOVENI_MS)) {
    return;
  }

  // Ochrana: Pokud má někdo zrovna otevřený formulář akce nebo obsazení, nepřekreslujeme
  if (document.getElementById('akceModal') || document.getElementById('orchestrModal')) {
    return;
  }

  try {
    const freshData = await runGoogleScript("getInitialData");
    if (freshData && freshData.akce) {
      appData = freshData;
      localStorage.setItem("bolech_data_cache", JSON.stringify(appData));
      posledniAktualizaceCas = Date.now();

      renderEvents();
      
      const jeDirigentAktivni = isUserConductor(user);
      const efektivniNastroj = (user.section && user.section.toLowerCase() === 'dirigent') ? 'Partitura' : user.section;
      vykresliNoty(appData.noty || [], efektivniNastroj, jeDirigentAktivni);
      
      if (hasEditRights(user.role)) {
        vykresliAdminNoty();
      }
    }
  } catch (err) {
    console.warn("Tichá aktualizace dat selhala:", err);
  }
}

// 1. Spuštění při návratu do aplikace (odemknutí telefonu, přepnutí záložky zpět)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    tichaObnovaDat();
  }
});

// 2. Spuštění při kliknutí/zaostření do okna (v prohlížeči na PC či notebooku)
window.addEventListener("focus", () => {
  tichaObnovaDat();
});

// 3. Pravidelná kontrola na pozadí pro ty, kdo mají aplikaci trvale na displeji (každých 10 minut)
setInterval(() => {
  if (document.visibilityState === "visible") {
    tichaObnovaDat(true);
  }
}, 10 * 60 * 1000);
// Aktualizováno
// Zobrazení tlačítka pouze pro vedení / administrátory
function updateActivityButtonVisibility() {
  const user = window.currentUser || JSON.parse(localStorage.getItem('bolech_auth_member') || '{}');
  const role = (user.role || '').toLowerCase();
  const btn = document.getElementById('btnActivityLog');
  if (btn) {
    btn.style.display = (role === 'vedeni' || role === 'admin') ? 'inline-flex' : 'none';
  }
}

// Otevření a zavření okna historie
function openActivityModal() {
  document.getElementById('modalActivityLog').style.display = 'flex';
  loadActivityLog();
}

function closeActivityModal() {
  document.getElementById('modalActivityLog').style.display = 'none';
}

// Načtení dat z tabulky přes Google Apps Script
async function loadActivityLog() {
  const content = document.getElementById('activityLogContent');
  content.innerHTML = '<div style="text-align: center; color: #64748b; padding: 24px;">Načítám historii...</div>';

  try {
    const res = await runGoogleScript('getActivityLog', { limit: 40 });
    const list = res.log || [];
    
    if (!list || list.length === 0) {
      content.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 24px;">Zatím nejsou zaznamenány žádné aktivity.</div>';
      return;
    }

    let html = '';
    list.forEach(item => {
      let badgeClass = 'badge-obecne';
      const cat = (item.category || '').toLowerCase();
      if (cat.includes('akce')) badgeClass = 'badge-akce';
      else if (cat.includes('host')) badgeClass = 'badge-hoste';
      else if (cat.includes('noty')) badgeClass = 'badge-noty';
      else if (cat.includes('obsazení')) badgeClass = 'badge-obsazeni';

      html += `
        <div class="activity-item">
          <span class="activity-badge ${badgeClass}">${escapeHtml(item.category)}</span>
          <div style="flex: 1;">
            <div class="activity-title">${escapeHtml(item.details)}</div>
            <div class="activity-meta">
              <span>🕒 ${escapeHtml(item.timestamp)}</span>
              <span>•</span>
              <span>👤 <strong>${escapeHtml(item.user)}</strong></span>
            </div>
          </div>
        </div>
      `;
    });

    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 24px;">Nepodařilo se načíst historii.</div>';
  }
}

// =========================================================================
// SPRÁVA ČLENŮ ORCHESTRU (POUZE PRO ADMINA)
// =========================================================================

let clenoveFilterQuery = "";
let clenoveStavFilter = "all"; // all, aktivni, neaktivni

function openMemberManager() {
  if (!isAdminUser(user)) {
    alert("Přístup ke správě členů má pouze administrátor.");
    return;
  }

  const existing = document.getElementById('memberManagerModal');
  if (existing) existing.remove();

  const html = `
    <div id="memberManagerModal" class="modal-overlay" style="padding: 4px;" onclick="if(event.target===this) document.getElementById('memberManagerModal').remove()">
      <div class="modal-box" style="max-height: 94vh; max-width: 650px; width: 100%; display: flex; flex-direction: column; padding: 12px 10px;">
        
        <!-- Hlavička modálu -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" style="background:transparent; border:none; font-size:20px; color:var(--text); cursor:pointer; padding:4px;" onclick="document.getElementById('memberManagerModal').remove()">←</button>
            <h3 style="margin:0; font-size:1.15rem; color:var(--text);">👥 Seznam členů</h3>
          </div>
          <button type="button" class="btn" style="background:var(--success); color:#fff; padding:6px 12px; font-size:13px; font-weight:700;" onclick="openEditMemberModal(null)">
            ➕ Přidat člena
          </button>
        </div>

        <!-- Vyhledávání a rychlý filtr -->
        <div style="margin-bottom: 10px; display:flex; flex-direction:column; gap:6px;">
          <input type="search" id="memberSearchInput" class="modal-input" placeholder="🔍 Hledat jméno, sekci, e-mail..." style="margin:0; font-size:14px; padding:9px 12px;" oninput="onMemberSearchChange(this.value)">
          
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn member-filter-btn active" data-filter="all" style="flex:1; padding:5px 8px; font-size:12px; background:var(--surface); border:1px solid var(--border); color:var(--text);" onclick="setMemberFilter('all', this)">Všichni</button>
            <button type="button" class="btn member-filter-btn" data-filter="aktivni" style="flex:1; padding:5px 8px; font-size:12px; background:var(--surface); border:1px solid var(--border); color:var(--text);" onclick="setMemberFilter('aktivni', this)">Jen aktivní</button>
            <button type="button" class="btn member-filter-btn" data-filter="neaktivni" style="flex:1; padding:5px 8px; font-size:12px; background:var(--surface); border:1px solid var(--border); color:var(--text);" onclick="setMemberFilter('neaktivni', this)">Neaktivní</button>
          </div>
        </div>

        <!-- Seznam členů -->
        <div id="membersListContainer" style="overflow-y:auto; flex:1; padding-right:2px; display:flex; flex-direction:column; gap:8px;">
          <!-- Karty se vykreslují dynamicky -->
        </div>

      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  renderMembersList();
}

function onMemberSearchChange(val) {
  clenoveFilterQuery = String(val || "").toLowerCase().trim();
  renderMembersList();
}

function setMemberFilter(stav, btn) {
  clenoveStavFilter = stav;
  document.querySelectorAll('.member-filter-btn').forEach(b => {
    b.style.background = 'var(--surface)';
    b.style.fontWeight = 'normal';
    b.style.borderColor = 'var(--border)';
  });
  btn.style.background = 'var(--primary-light)';
  btn.style.color = '#fff';
  btn.style.fontWeight = 'bold';
  renderMembersList();
}

function renderMembersList() {
  const container = document.getElementById("membersListContainer");
  if (!container) return;

  const clenove = [...(appData.clenove || [])];
  
  // Seřazení podle příjmení
  clenove.sort((a, b) => {
    const pA = a.prijmeni || a.celeJmeno.split(/\s+/).slice(-1)[0] || "";
    const pB = b.prijmeni || b.celeJmeno.split(/\s+/).slice(-1)[0] || "";
    return pA.localeCompare(pB, "cs");
  });

  const filtered = clenove.filter(c => {
    const isAktivni = String(c.aktivni || "").toUpperCase() === "ANO";
    if (clenoveStavFilter === "aktivni" && !isAktivni) return false;
    if (clenoveStavFilter === "neaktivni" && isAktivni) return false;

    if (!clenoveFilterQuery) return true;
    const haystack = `${c.celeJmeno} ${c.sekce} ${c.email} ${c.telefon || ""} ${c.role}`.toLowerCase();
    return haystack.includes(clenoveFilterQuery);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:14px;">Nenalezen žádný člen odpovídající filtru.</div>`;
    return;
  }

  let html = "";
  filtered.forEach(c => {
    const isAktivni = String(c.aktivni || "").toUpperCase() === "ANO";
    const statusBadge = isAktivni 
      ? `<span style="background:rgba(34,197,94,0.15); color:#16a34a; font-weight:700; font-size:11px; padding:2px 6px; border-radius:4px; border:1px solid rgba(34,197,94,0.3);">AKTIVNÍ</span>`
      : `<span style="background:rgba(148,163,184,0.15); color:#64748b; font-weight:600; font-size:11px; padding:2px 6px; border-radius:4px; border:1px solid rgba(148,163,184,0.3);">NEAKTIVNÍ</span>`;

    const roleBadge = (c.role && c.role !== 'Člen') ? `<span style="background:var(--bg); border:1px solid var(--border); font-size:11px; padding:2px 6px; border-radius:4px; color:var(--text-muted);">${escapeHtml(c.role)}</span>` : "";
    html += `
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font-size:13.5px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <div>
            <strong style="font-size:15px; color:var(--text);">${escapeHtml(c.celeJmeno)}</strong>
            <div style="font-size:12.5px; color:var(--text-muted); margin-top:1px;">
              🎻 ${escapeHtml(c.sekce || "Bez sekce")}
            </div>
          </div>
          <div style="display:flex; gap:4px; align-items:center;">
            ${roleBadge}
            ${statusBadge}
          </div>
        </div>

        <div style="font-size:13px; color:var(--text); line-height:1.4; margin-bottom:8px;">
          <div>✉️ ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="color:var(--primary-light); text-decoration:none;">${escapeHtml(c.email)}</a>` : '<em style="color:var(--text-muted);">E-mail neuveden</em>'}</div>
          <div>📞 ${c.telefon ? `<a href="tel:${escapeHtml(c.telefon)}" style="color:var(--primary-light); text-decoration:none;">${escapeHtml(c.telefon)}</a>` : '<em style="color:var(--text-muted);">Telefon neuveden</em>'}</div>
        </div>

        <div style="display:flex; gap:6px; border-top:1px dashed var(--border); padding-top:8px;">
          <button type="button" class="btn" style="flex:1; padding:6px 10px; font-size:12.5px; background:var(--surface); border:1px solid var(--border); color:var(--text);" onclick="openEditMemberModal('${escapeHtml(c.celeJmeno)}')">
            ✏️ Upravit
          </button>
          <button type="button" class="btn" style="flex:1; padding:6px 10px; font-size:12.5px; background:rgba(37,99,235,0.08); border:1px solid rgba(37,99,235,0.3); color:var(--primary-light); font-weight:600;" onclick="resendPinToMember('${escapeHtml(c.celeJmeno)}', '${escapeHtml(c.email || '')}')">
            🔑 Poslat PIN
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Dialog úpravy / přidání člena
function openEditMemberModal(celeJmeno = null) {
  const isEdit = !!celeJmeno;
  const clen = isEdit ? (appData.clenove || []).find(c => c.celeJmeno === celeJmeno) : null;

  const modalHtml = `
    <div id="memberEditFormModal" class="modal-overlay" style="padding: 4px; z-index: 10000;" onclick="if(event.target===this) document.getElementById('memberEditFormModal').remove()">
      <div class="modal-box" style="max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto;">
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px; border-bottom:1px solid var(--border); padding-bottom:8px;">
          <h3 style="margin:0; font-size:1.15rem; color:var(--text);">${isEdit ? '✏️ Úprava údajů člena' : '➕ Přidat nového člena'}</h3>
          <button type="button" style="background:transparent; border:none; font-size:22px; color:var(--text-muted); cursor:pointer;" onclick="document.getElementById('memberEditFormModal').remove()">✕</button>
        </div>

        <form onsubmit="submitMemberForm(event, ${isEdit ? `'${escapeHtml(celeJmeno)}'` : 'null'})">
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <div style="flex:1;">
              <label style="font-size:12px; font-weight:700;">Jméno:</label>
              <input type="text" id="m_jmeno" class="modal-input" required value="${escapeHtml(clen ? (clen.jmeno || clen.celeJmeno.split(' ')[0]) : '')}">
            </div>
            <div style="flex:1;">
              <label style="font-size:12px; font-weight:700;">Příjmení:</label>
              <input type="text" id="m_prijmeni" class="modal-input" required value="${escapeHtml(clen ? (clen.prijmeni || clen.celeJmeno.split(' ').slice(1).join(' ')) : '')}">
            </div>
          </div>

          <label style="font-size:12px; font-weight:700;">Nástrojová sekce:</label>
          <select id="m_sekce" class="modal-input" style="margin-bottom:8px;" required>
            ${PARTITURA_SECTIONS.map(s => `<option value="${s}" ${clen && clen.sekce === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>

          <label style="font-size:12px; font-weight:700;">E-mail:</label>
          <input type="email" id="m_email" class="modal-input" style="margin-bottom:8px;" value="${escapeHtml(clen?.email || '')}" placeholder="jmeno@domena.cz">

          <label style="font-size:12px; font-weight:700;">Telefonní číslo:</label>
          <input type="tel" id="m_telefon" class="modal-input" style="margin-bottom:8px;" value="${escapeHtml(clen?.telefon || '')}" placeholder="+420 123 456 789">

          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <div style="flex:1;">
              <label style="font-size:12px; font-weight:700;">Role v orchestru:</label>
              <select id="m_role" class="modal-input">
                <option value="" ${!clen || !clen.role || clen.role === 'Člen' ? 'selected' : ''}>Běžný hráč (bez zvláštní role)</option>
                <option value="Výbor" ${clen && clen.role === 'Výbor' ? 'selected' : ''}>Výbor</option>
                <option value="Host" ${clen && clen.role === 'Host' ? 'selected' : ''}>Host</option>
                <option value="Admin" ${clen && clen.role === 'Admin' ? 'selected' : ''}>Admin</option>
              </select>
            </div>
            <div style="flex:1;">
              <label style="font-size:12px; font-weight:700;">Stav aktivity:</label>
              <select id="m_aktivni" class="modal-input">
                <option value="ANO" ${!clen || String(clen.aktivni).toUpperCase() === 'ANO' ? 'selected' : ''}>ANO (Aktivní)</option>
                <option value="NE" ${clen && String(clen.aktivni).toUpperCase() !== 'ANO' ? 'selected' : ''}>NE (Neaktivní)</option>
              </select>
            </div>
          </div>

          ${!isEdit ? `
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:14px; cursor:pointer;">
              <input type="checkbox" id="m_sendPinNow" checked style="transform:scale(1.2);">
              <span>Rovnou vygenerovat a odeslat uvítací e-mail s PINem</span>
            </label>
          ` : ''}

          <div style="display:flex; gap:8px; margin-top:16px;">
            <button type="submit" id="btnSaveMember" class="btn" style="background:var(--success); flex:1; font-weight:700;">
              💾 Uložit do tabulky
            </button>
            <button type="button" class="btn" style="background:var(--border); color:var(--text); width:auto;" onclick="document.getElementById('memberEditFormModal').remove()">
              Zrušit
            </button>
          </div>
        </form>

      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function submitMemberForm(e, puvodniCeleJmeno) {
  e.preventDefault();
  const btn = document.getElementById("btnSaveMember");
  btn.innerText = "Ukládám...";
  btn.disabled = true;

  const jmeno = document.getElementById("m_jmeno").value.trim();
  const prijmeni = document.getElementById("m_prijmeni").value.trim();
  const sekce = document.getElementById("m_sekce").value;
  const email = document.getElementById("m_email").value.trim();
  const telefon = document.getElementById("m_telefon").value.trim();
  const role = document.getElementById("m_role").value;
  const aktivni = document.getElementById("m_aktivni").value;
  const sendPinNow = document.getElementById("m_sendPinNow")?.checked || false;

  const payload = {
    isEdit: !!puvodniCeleJmeno,
    puvodniCeleJmeno: puvodniCeleJmeno,
    jmeno: jmeno,
    prijmeni: prijmeni,
    celeJmeno: `${jmeno} ${prijmeni}`.trim(),
    sekce: sekce,
    email: email,
    telefon: telefon,
    role: role,
    aktivni: aktivni,
    sendPinNow: sendPinNow,
    editorJmeno: user.name
  };

  runGoogleScript("saveMember", payload).then(res => {
    btn.disabled = false;
    btn.innerText = "💾 Uložit do tabulky";

    if (res.success) {
      document.getElementById("memberEditFormModal").remove();
      
      // Aktualizujeme lokální mezipaměť členů
      if (!appData.clenove) appData.clenove = [];
      const idx = appData.clenove.findIndex(c => c.celeJmeno === (puvodniCeleJmeno || payload.celeJmeno));
      
      if (idx !== -1) {
        appData.clenove[idx] = Object.assign(appData.clenove[idx], payload);
      } else {
        appData.clenove.push(payload);
      }
      
      localStorage.setItem("bolech_data_cache", JSON.stringify(appData));
      renderMembersList();
      alert("Údaje člena byly úspěšně uloženy.");
    } else {
      alert("Chyba při ukládání: " + res.error);
    }
  });
}

function resendPinToMember(celeJmeno, email) {
  if (!email || !email.includes("@")) {
    alert("Tento člen nemá v tabulce vyplněnou platnou e-mailovou adresu. Nejprve ji doplňte klepnutím na Upravit.");
    return;
  }

  if (confirm(`Opravdu chcete odeslat e-mail s přihlašovacím PINem členu ${celeJmeno} na adresu ${email}?`)) {
    runGoogleScript("resendMemberPin", { celeJmeno: celeJmeno, email: email, editorJmeno: user.name }).then(res => {
      if (res.success) {
        alert(`PIN byl úspěšně odeslán na adresu: ${email}`);
      } else {
        alert("Chyba při odesílání PINu: " + res.error);
      }
    });
  }
}