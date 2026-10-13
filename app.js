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
  return hasEditRights(r) || r.includes('výbor') || r.includes('vybor') || r.includes('pomocník') || r.includes('pomocnik');
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

function initApp() {
  document.getElementById("mainApp").style.display = "block";
  document.getElementById("userBadge").innerText = user.name;
  
  const canEdit = hasEditRights(user.role);
  const jeDirigent = String(user.role || "").trim().toLowerCase() === 'dirigent';
  
  const adminNavBtn = document.getElementById('btn-nav-admin');
  if (adminNavBtn) {
    adminNavBtn.style.display = canEdit ? 'flex' : 'none';
  }

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

function parseDate(dateStr) {
  if (!dateStr) return 0;
  const parts = String(dateStr).trim().split('.');
  if (parts.length >= 3) return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10)-1, parseInt(parts[0], 10)).getTime();
  return new Date(dateStr).getTime() || 0;
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
      // Záměrně nepřidáváme <br> navíc na konce řádků
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

// Zabezpečené filtrování: Interní informace uvidí POUZE vedení a pomocníci výboru
function isEventVisibleForUser(akce) {
  const typ = String(akce.typ || "").trim();
  const jeInfo = typ.includes("Oznámení") || typ.includes("Informace");
  const cilovaSkupina = String(akce.cilovaSkupina || "vsichni").trim().toLowerCase();
  const userRole = String(user.role || "").trim().toLowerCase();

  // Kontrola interních zpráv pro vedení a výbor
  if (cilovaSkupina === "vedeni") {
    return isCommitteeMember(userRole);
  }

  if (jeInfo) return true; 
  if (hasEditRights(userRole)) return true; 

  const userSecL = String(user.section || "").toLowerCase();
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
  
  if (canEdit) {
    cont.innerHTML += `
      <div class="admin-actions" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
        <div style="display:flex; gap:8px;">
          <button class="btn" style="background:var(--success); flex:1; padding:10px 4px; font-size:13px;" onclick="checkAndOpenAkceForm()">➕ Přidat</button>
          <button class="btn" style="background:var(--primary); flex:1; padding:10px 4px; font-size:13px;" onclick="openOrchestrModal()">🎼 Obsazení</button>
          <button class="btn" style="background:var(--primary-light); flex:1; padding:10px 4px; font-size:13px;" onclick="openGuestManager()">👥 Hosté</button>
        </div>
        <button class="btn" style="background:var(--surface); color:var(--text); border:1px solid var(--border); padding:9px; font-size:13.5px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="openMailBroadcastModal()">
          ✉ Napsat zprávu orchestru / vedení
        </button>
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
    .sort((a, b) => parseDate(b.datum) - parseDate(a.datum));

  // 2. Hudební akce (zkoušky, koncerty, generálky)
  const hudebniAkce = vsechnyViditelne.filter(a => !a.typ.includes('Oznámení') && !a.typ.includes('Informace'));

  // Nadcházející akce (dnes a v budoucnu) -> ŘAZENÍ VZESTUPNĚ (nejbližší první!)
  const nadchazejiciAkce = hudebniAkce
    .filter(a => parseDate(a.datum) >= todayTs)
    .sort((a, b) => parseDate(a.datum) - parseDate(b.datum));

  // Proběhlé hudební akce
  const probehleAkce = hudebniAkce
    .filter(a => parseDate(a.datum) < todayTs);

  // Archivovaná textová oznámení / informace v historii
  const archivOznameni = vsechnyViditelne
    .filter(a => a.typ === 'Oznámení (Archiv)' || a.typ === 'Informace (Infoarchiv)' || a.typ === 'Informace (Historie)');

  // SPOLEČNÁ HISTORIE: sjednocení proběhlých akcí i informací a seřazení od NEJNOVĚJŠÍCH k NEJSTARŠÍM
  const historieVse = [...probehleAkce, ...archivOznameni]
    .sort((a, b) => parseDate(b.datum) - parseDate(a.datum));

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
            <span>${akce.datum}</span>
          </div>

          <div class="card-body" style="padding-bottom: 0;">
            <div class="card-title-row">
              <div class="card-title" style="flex:1;">${escapeHtml(akce.nazev)}</div>
              ${editBtn}
            </div>

            <div class="${hasProgram ? 'card-clickable-area' : ''}" ${hasProgram ? `onclick="flipCard('${cardFlipperId}')"` : ''}>
              ${akce.misto ? `<p style="margin-bottom:6px;">📍 ${escapeHtml(akce.misto)}</p>` : ''}
              <p style="margin-bottom:6px;">🕒 Začátek: <strong>${escapeHtml(akce.casOd)}</strong></p>
              ${akce.casSrazu ? `<p style="margin-bottom:6px;">⏰ Sraz: <strong>${escapeHtml(akce.casSrazu)}</strong></p>` : ''}
              ${akce.zacatekGeneralky ? `<p style="margin-bottom:6px;">🎻 Generálka: <strong>${escapeHtml(akce.zacatekGeneralky)}</strong></p>` : ''}
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
        <span>${akce.datum}</span>
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
  
  let dirigentJmeno = null;
  const grouped = {};

  potvrdili.forEach(p => {
    const clenInfo = (appData.clenove || []).find(c => c.celeJmeno === p.jmeno || c.jmeno === p.jmeno);
    const jeDirigent = isDirigentPerson(p.jmeno, p.sekce, clenInfo?.role);

    if (jeDirigent) {
      dirigentJmeno = p.jmeno;
      return;
    }

    let hracSekce = String(p.sekce || "Ostatní").trim().toLowerCase();
    let nalezenaSekce = PARTITURA_SECTIONS.find(s => s.toLowerCase().includes(hracSekce) || hracSekce.includes(s.toLowerCase())) || "Ostatní / Hosté";
    if (!grouped[nalezenaSekce]) grouped[nalezenaSekce] = [];
    grouped[nalezenaSekce].push(p.jmeno);
  });

  let html = `
    <button class="roster-toggle" onclick="toggleRoster('${akceId}')">
      <span>👥 Přihlášeno (${potvrdili.length})</span>
      <span id="arrow-${akceId}">▼</span>
    </button>
    <div id="content-${akceId}" class="roster-content">
      <button type="button" class="btn-stage-toggle" onclick="openStageModalForAkce('${akceId}')">
        🗺️ Zobrazit obsazení orchestru (${potvrdili.length})
      </button>
  `;

  if (dirigentJmeno) {
    html += `
      <div class="roster-section" style="border-left: 3px solid #f59e0b; padding-left: 8px; margin-bottom: 10px; background: rgba(245, 158, 11, 0.08); border-radius: 4px;">
        <div class="roster-section-title" style="color: #d97706; font-weight: 800;">🎼 Dirigent</div>
        <div class="roster-members" style="font-weight: 700; font-size: 15px;">${escapeHtml(dirigentJmeno)}</div>
      </div>
    `;
  }

  PARTITURA_SECTIONS.forEach(s => { 
    if (grouped[s]) html += `<div class="roster-section"><div class="roster-section-title">${s}</div><div class="roster-members">${grouped[s].join(', ')}</div></div>`; 
  });
  if (grouped["Ostatní / Hosté"]) html += `<div class="roster-section"><div class="roster-section-title">Ostatní / Hosté</div><div class="roster-members">${grouped["Ostatní / Hosté"].join(', ')}</div></div>`;
  if (potvrdili.length === 0) html += '<div style="font-size:15px; color:var(--text-muted); font-style:italic; padding:8px 0;">Zatím nikdo nepotvrdil účast.</div>';
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
  let dirigentPrihlasen = null;

  ucastAkce.forEach(u => {
    if (u.stav === "Ano") {
      const clen = (appData.clenove || []).find(c => c.celeJmeno === u.jmeno || c.jmeno === u.jmeno);
      if (isDirigentPerson(u.jmeno, u.sekce, clen?.role)) {
        dirigentPrihlasen = u.jmeno;
      }
    }
  });

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
      if (isDirigentPerson(c.celeJmeno, c.sekce, c.role)) return false;
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

    const playerLabel = isDir ? `${p.celeJmeno} 🎼 (Šéfdirigent)` : `${p.celeJmeno}${isKm ? " 🎻 (Koncertní mistr)" : ""}`;
    const statusText = isDir ? `✓ Potvrzena účast – Řídí orchestr` : `✓ Potvrzena účast – ${secName}`;
    const statusColor = isDir ? "#d97706" : "var(--success)";

    spot.onclick = () => {
      document.querySelectorAll(`#${prefix}-svg .hex-spot`).forEach(el => el.classList.remove("is-selected"));
      spot.classList.add("is-selected");
      showPlayerDetailBox(prefix, playerLabel, statusText, statusColor);
    };

    dynamicGroup.appendChild(spot);
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

  if (dirigentPrihlasen) {
    renderHexSpot(330, 325, { celeJmeno: dirigentPrihlasen }, false, "Dirigent", true);
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
            <span style="font-size:0.82rem; color:var(--text-muted);">${escapeHtml(akce ? akce.datum : "")}</span>
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
    .sort((a, b) => parseDate(a.datum) - parseDate(b.datum));

  const probehleAkce = vsechnyAkce
    .filter(a => parseDate(a.datum) < todayTs)
    .sort((a, b) => parseDate(b.datum) - parseDate(a.datum));

  let akceOptions = "";
  if (nadchazejiciAkce.length > 0) {
    akceOptions += nadchazejiciAkce.map(a => `<option value="${a.id}">${escapeHtml(a.nazev)} (${a.datum})</option>`).join('');
  } else {
    akceOptions += probehleAkce.map(a => `<option value="${a.id}">${escapeHtml(a.nazev)} (${a.datum})</option>`).join('');
  }

  let historyGroupHtml = "";
  if (nadchazejiciAkce.length > 0 && probehleAkce.length > 0) {
    historyGroupHtml = `
      <optgroup id="orch_history_group" label="── Proběhlé akce ──" style="display:none;">
        ${probehleAkce.map(a => `<option value="${a.id}">📜 ${escapeHtml(a.nazev)} (${a.datum})</option>`).join('')}
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
              <option value="vsichni" ${cilovaSkupinaValue!=='vedeni' ? 'selected' : ''}>🌐 Celý orchestr (veřejná informace)</option>
              <option value="vedeni" ${cilovaSkupinaValue==='vedeni' ? 'selected' : ''}>🔒 Pouze vedení a výbor (interní informace)</option>
            </select>
            <small style="color:var(--text-muted); font-size:12px; display:block; line-height:1.3;">
              Interní informace uvidí pouze dirigent, vedení a pomocníci výboru. Běžným muzikantům se nezobrazí.
            </small>
          </div>

          <label>Název / Nadpis položky:</label>
          <input type="text" id="f_nazev" value="${escapeHtml(akce?.nazev||'')}" required class="modal-input" ${roAttr}>

          <div style="display:flex; gap:12px;">
            <div style="flex:1;">
              <label>Datum:</label>
              <input type="date" id="f_datum" value="${escapeHtml(formDateValue)}" required class="modal-input" ${roAttr}>
            </div>
            <div id="col_casOd" style="flex:1;">
              <label>Čas od:</label>
              <input type="time" id="f_casOd" value="${escapeHtml(akce?.casOd||'')}" class="modal-input" ${roAttr}>
            </div>
          </div>

          <div id="row_misto" style="display:block;">
            <label>Místo:</label>
            <input type="text" id="f_misto" value="${escapeHtml(akce?.misto||'')}" class="modal-input" ${roAttr}>
          </div>

          <div id="row_casy" style="display:flex; gap:12px;">
            <div style="flex:1;">
              <label>Čas srazu:</label>
              <input type="time" id="f_casSrazu" value="${escapeHtml(akce?.casSrazu||'')}" class="modal-input" ${roAttr}>
            </div>
            <div id="col_generalka" style="flex:1;">
              <label>Čas generálky:</label>
              <input type="time" id="f_zacatekGeneralky" value="${escapeHtml(akce?.zacatekGeneralky||'')}" class="modal-input" ${roAttr}>
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
    row.parentElement.insertBefore(row.nextElementSibling, row);
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

  document.getElementById('row_misto').style.display = jeOznameni ? 'none' : 'block';
  document.getElementById('col_casOd').style.display = jeOznameni ? 'none' : 'block';
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
    nazev: document.getElementById('f_nazev').value, 
    datum: formatDateForSave(document.getElementById('f_datum').value), 
    misto: jeOznameni ? "" : document.getElementById('f_misto').value,
    casOd: jeOznameni ? "" : document.getElementById('f_casOd').value,
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
  const parts = String(dateStr).trim().split('.');
  if (parts.length === 3) {
    const d = parts[0].trim().padStart(2, '0');
    const m = parts[1].trim().padStart(2, '0');
    const y = parts[2].trim();
    return `${y}-${m}-${d}`;
  }
  return dateStr;
}

function formatDateForSave(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).split('-');
  if (parts.length === 3) {
    return `${parseInt(parts[2], 10)}. ${parseInt(parts[1], 10)}. ${parts[0]}`;
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
          <option value="management">🏛️ Pouze vedení a dirigent</option>
          <option value="both">👥🏛️ Všichni členové + celé vedení</option>
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
    const isLeadership = hasEditRights(role);
    const sekce = String(c.sekce || "").toLowerCase();
    const isHost = role === 'host';

    const aktivni = String(c.aktivni || "").toUpperCase().trim();
    const isAktivni = aktivni === 'ANO' || aktivni === 'TRUE' || aktivni === '1' || isHost;
    if (!isAktivni) return;

    if (targetGroup === 'all') {
      if (!isHost) uniqueEmails.add(email);
    } else if (targetGroup === 'management') {
      if (isLeadership) uniqueEmails.add(email);
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
  let htmlClenove = "";
  
  if (appData.clenove) {
    appData.clenove.forEach(c => {
      if (c.role.toLowerCase() === 'host') {
         htmlHoste += `<div style="padding: 6px 0; border-bottom: 1px dashed var(--border); font-size: 14px;">
                        <strong>${escapeHtml(c.celeJmeno)}</strong> (${escapeHtml(c.sekce)})<br>
                        <span style="color:var(--danger); font-size:12px;">⏳ Platí do: ${escapeHtml(c.platnost)}</span>
                      </div>`;
      } else {
         htmlClenove += `<div style="padding: 6px 0; border-bottom: 1px dashed var(--border); font-size: 14px; color:var(--text-muted);">
                        <strong>${escapeHtml(c.celeJmeno)}</strong> (${escapeHtml(c.sekce)})
                      </div>`;
      }
    });
  }
  
  if(!htmlHoste) htmlHoste = "<p style='color:var(--text-muted); font-size:13px;'>Žádní aktivní hosté.</p>";
  if(!htmlClenove) htmlClenove = "<p style='color:var(--text-muted); font-size:13px;'>Žádní členové.</p>";

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

        <h4 style="margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom:4px;">Aktivní účty (kontrola)</h4>
        
        <div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border); padding: 10px; border-radius: 6px; background: var(--bg);">
          <h5 style="margin:0 0 8px 0; color:var(--text);">Otevřené účty hostů:</h5>
          ${htmlHoste}
          
          <h5 style="margin:16px 0 8px 0; color:var(--text);">Stálí členové:</h5>
          ${htmlClenove}
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
// NOTOVÝ ARCHIV PRO HRÁČE
// =========================================================================
function vykresliNoty(dataNoty, nastrojUzivatele, jeDirigent = false) {
  const kontejner = document.getElementById('notyContainer');
  const infoText = document.getElementById('notyNastrojInfo');
  
  if (!kontejner) return;

  const canEdit = hasEditRights(user.role);
  const efektivniNastroj = (nastrojUzivatele === "Baskytara") ? "Kontrabasy" : nastrojUzivatele;

  if (infoText) {
    infoText.textContent = jeDirigent ? "Režim partitury" : `Zobrazený part: ${efektivniNastroj}${nastrojUzivatele === 'Baskytara' ? ' (převzato z kontrabasů)' : ''}`;
  }

  let htmlDropdown = '';
  if (canEdit) {
    htmlDropdown = `
      <div style="margin-bottom: 20px; background: var(--bg); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
        <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 8px; color: var(--text);">👀 Náhled partů (pouze pro vedení):</label>
        <select class="modal-input" onchange="zmenitPohledNot(this.value)" style="margin-bottom:0; font-size:14px; background: var(--surface);">
          <option value="Vlastní part" ${efektivniNastroj === user.section ? 'selected' : ''}>Můj nástroj / Výchozí pohled (${user.section})</option>
          ${PARTITURA_SECTIONS.map(s => `<option value="${s}" ${efektivniNastroj === s && efektivniNastroj !== user.section ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    `;
  }

  const relevantniNoty = dataNoty.filter(nota => {
    let aktivni = String(nota.aktivni || '').toUpperCase().trim();
    if (aktivni !== 'TRUE' && aktivni !== 'ANO' && aktivni !== '1') return false;
    if (jeDirigent && nota.sekce === 'Partitura') return true;
    if (nota.sekce === efektivniNastroj) return true;
    
    if (nota.sekce === 'Housle' && (efektivniNastroj === '1. Housle' || efektivniNastroj === '2. Housle')) return true;
    if (nota.sekce === 'Smyčce' && ['1. Housle', '2. Housle', 'Violy', 'Violoncella', 'Kontrabasy'].includes(efektivniNastroj)) return true;
    if (nota.sekce === 'Dechy' && ['Flétny', 'Hoboje', 'Klarinety / Saxofony', 'Fagoty', 'Lesní rohy', 'Trubky', 'Trombóny a Tuba'].includes(efektivniNastroj)) return true;
    if (nota.sekce === 'Dřeva' && ['Flétny', 'Hoboje', 'Klarinety / Saxofony', 'Fagoty'].includes(efektivniNastroj)) return true;
    if (nota.sekce === 'Žestě' && ['Lesní rohy', 'Trubky', 'Trombóny a Tuba'].includes(efektivniNastroj)) return true;
    return false;
  });

  let html = htmlDropdown;

  if (relevantniNoty.length === 0) {
    kontejner.innerHTML = html + '<p style="color: var(--text-muted); text-align: center; margin-top: 40px; padding: 20px;">Pro tento part aktuálně nejsou k dispozici žádné noty na repertoáru.</p>';
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

function vykresliAdminNoty() {
  const cont = document.getElementById('adminNotyContainer');
  if (!cont) return;

  cont.style.padding = "0";
  cont.style.margin = "0"; 
  cont.style.width = "100%";

  try {
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

      if (!slozkyMap[cesta]) slozkyMap[cesta] = { cesta: cesta, soubory: [], program: '', aktivni: false };

      slozkyMap[cesta].soubory.push({ ...nota, kratkyNazev: soubor });

      let aktivniHodnota = String(nota.aktivni || '').toUpperCase().trim();
      if (aktivniHodnota === 'ANO' || aktivniHodnota === 'TRUE' || aktivniHodnota === '1') {
        slozkyMap[cesta].aktivni = true;
        if (nota.program) slozkyMap[cesta].program = nota.program;
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

      html += `
        <details class="card ${stavTrida}" style="margin-bottom: 8px; margin-left: 0; margin-right: 0; padding: 0; overflow: hidden; width: 100%; border: 1px solid var(--border);">
          <summary style="padding: 10px 14px; cursor: pointer; list-style: none; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: bold; color: var(--text);">
              <span style="word-break: break-word; line-height: 1.3;">📁 ${zobrazenyNazev} <small style="font-weight:normal; opacity:0.6;">(${s.soubory.length})</small></span>
              <span style="opacity: 0.4; font-size: 14px; padding-left: 8px;">▼</span>
            </div>

            <div class="folder-controls" onclick="event.stopPropagation();" style="display: flex; gap: 8px; align-items: center; width: 100%;">
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
          </summary>
          
          <div class="folder-content" style="padding: 12px; display: flex; flex-direction: column; gap: 6px; background: var(--bg);">
            ${s.soubory.map(soub => {
              const isSelected = window.vybraneNotyKEmailu.some(n => n.odkaz === soub.odkaz);

              return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-card, transparent); gap: 8px;">
                <a href="${soub.odkaz.replace(/\/view.*/, '/preview')}" target="_blank" style="font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: var(--primary); text-decoration: none; font-weight: 600; cursor: pointer;">
                  📄 <span style="text-decoration: underline;">${escapeHtml(soub.kratkyNazev)}</span>
                </a>
                
                <span style="font-size: 11px; opacity: 0.8; white-space: nowrap; background: var(--border); padding: 4px 6px; border-radius: 4px; color: var(--text);">${escapeHtml(String(soub.sekce||''))}</span>
                
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
              `;
            }).join('')}
          </div>

        </details>
      `;
    });

    cont.innerHTML = html;
    aktualizovatPlovouciListu();

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

      if (s.aktivni !== novaAktivni || s.program !== novyProgram) {
        const stavText = novaAktivni ? 'ANO' : '';
        s.soubory.forEach(soubor => {
          zmeny.push({
            odkaz: soubor.odkaz,
            aktivni: stavText,
            program: novyProgram
          });
        });
      }
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

function zmenitPohledNot(novyNastroj) {
  const jeDirigent = String(user.role || "").trim().toLowerCase() === 'dirigent';
  const nastrojProZobrazeni = (novyNastroj === 'Vlastní part') ? user.section : novyNastroj;
  const simulujDirigenta = (novyNastroj === 'Vlastní part' && jeDirigent);
  vykresliNoty(appData.noty || [], nastrojProZobrazeni, simulujDirigenta);
}