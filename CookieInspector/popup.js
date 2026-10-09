const ext = (typeof browser !== 'undefined') ? browser : chrome;

const btnGet    = document.getElementById('btn-get');
const btnStore  = document.getElementById('btn-get-storage');
const btnToken  = document.getElementById('btn-get-token');
const btnCopy   = document.getElementById('btn-copy');
const output    = document.getElementById('output');
const domainBdg = document.getElementById('domain-badge');
const countBdg  = document.getElementById('count-badge');
const countNum  = document.getElementById('count-num');
const countLbl  = document.getElementById('count-label');
const footerTs  = document.getElementById('footer-ts');
const filterIn  = document.getElementById('filter');
const filterClr = document.getElementById('filter-clear');

let currentJson = '';
let currentCopy = '';
let currentObj  = {};
let currentKind = 'cookie';

async function getActiveTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function fetchAllCookies(url) {
  const { hostname } = new URL(url);
  const cleanDomain = hostname.replace(/^www\./, '');
  let allCookies = [];
  
  try {
    const byDomain = await ext.cookies.getAll({ domain: cleanDomain });
    allCookies = allCookies.concat(byDomain);
  } catch (e) {}
  
  if (!cleanDomain.startsWith('www.')) {
    try {
      const byWwwDomain = await ext.cookies.getAll({ domain: 'www.' + cleanDomain });
      allCookies = allCookies.concat(byWwwDomain);
    } catch (e) {}
  }
  
  try {
    const byUrl = await ext.cookies.getAll({ url });
    allCookies = allCookies.concat(byUrl);
  } catch (e) {}
  
  const parts = cleanDomain.split('.');
  if (parts.length > 2) {
    const rootDomain = '.' + parts.slice(-2).join('.');
    try {
      const byRoot = await ext.cookies.getAll({ domain: rootDomain });
      allCookies = allCookies.concat(byRoot);
    } catch (e) {}
  }
  
  const seen = new Map();
  for (const c of allCookies) {
    if (!seen.has(c.name)) {
      seen.set(c.name, c);
    }
  }
  
  return Array.from(seen.values());
}

async function fetchLocalStorage(tabId) {
  const results = await ext.scripting.executeScript({
    target: { tabId },
    func: () => {
      const out = {};
      try {
        const store = window.localStorage;
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k === null) continue;
          const raw = store.getItem(k);
          const t = raw === null ? '' : raw.trim();
          let val = raw;
          if (t.startsWith('{') || t.startsWith('[')) {
            try { val = JSON.parse(t); } catch {}
          }
          out[k] = val;
        }
      } catch (e) {
        return { __error__: (e && e.message) || String(e) };
      }
      return out;
    }
  });
  return results?.[0]?.result ?? {};
}

async function fetchSessionToken(tabId) {
  const results = await ext.scripting.executeScript({
    target: { tabId },
    func: () => {
      const norm = (k) => String(k).replace(/[_-]/g, '').toLowerCase();
      const found = {};

      const visit = (node, depth) => {
        if (depth > 6 || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const item of node) visit(item, depth + 1);
          return;
        }
        for (const [k, v] of Object.entries(node)) {
          const n = norm(k);
          if ((n === 'accesstoken' || n === 'refreshtoken') && typeof v === 'string' && v) {
            const slot = n === 'accesstoken' ? 'access_token' : 'refresh_token';
            if (!found[slot]) found[slot] = v;
          } else if (typeof v === 'string') {
            const s = v.trim();
            if (s.startsWith('{') || s.startsWith('[')) {
              try { visit(JSON.parse(s), depth + 1); } catch {}
            }
          } else {
            visit(v, depth + 1);
          }
        }
      };

      const ls = window.localStorage;
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        const v = ls.getItem(k);
        if (v === null) continue;
        const s = v.trim();
        if (s.startsWith('{') || s.startsWith('[')) {
          try { visit(JSON.parse(s), 0); } catch {}
        } else {
          visit({ [k]: v }, 0);
        }
      }

      if (!found.access_token && !found.refresh_token) {
        return { __error__: 'no access_token/refresh_token in this page localStorage' };
      }
      return found;
    }
  });
  return results?.[0]?.result ?? {};
}

function cookiesToObject(cookies) {
  const obj = {};
  for (const c of cookies) {
    let key = c.name || '(unnamed)';
    if (key in obj) {
      let i = 2;
      while (`${key}_${i}` in obj) i++;
      key = `${key}_${i}`;
    }
    obj[key] = c.value;
  }
  return obj;
}

function renderJson(obj) {
  const entries = Object.entries(obj);

  if (entries.length === 0) {
    output.innerHTML = `
      <div class="state-empty">
        <div class="emoji">🤷</div>
        <div>Nothing found<br>for this domain</div>
      </div>`;
    return;
  }

  const lines = entries.map(([k, v], i) => {
    const comma = i < entries.length - 1 ? '<span class="j-comma">,</span>' : '';
    const keyHtml  = `<span class="j-key">"${escHtml(k)}"</span>`;
    const valHtml  = (v !== null && typeof v === 'object')
      ? `<span class="j-str">${escHtml(JSON.stringify(v, null, 2))}</span>`
      : `<span class="j-str">"${escHtml(v)}"</span>`;
    return `<div class="j-entry">&nbsp;&nbsp;${keyHtml}<span class="j-brace">:</span>&nbsp;${valHtml}${comma}</div>`;
  });

  output.innerHTML = `
    <div class="json-root">
      <span class="j-brace">{</span>
      ${lines.join('')}
      <span class="j-brace">}</span>
    </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const COOKIES_BTN_HTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
         <circle cx="6.5" cy="6.5" r="5.5" stroke="#0d0f14" stroke-width="1.6"/>
         <path d="M6.5 3.5V6.5L8.5 8" stroke="#0d0f14" stroke-width="1.6" stroke-linecap="round"/>
       </svg> GET COOKIES`;

const STORAGE_BTN_HTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
         <ellipse cx="6.5" cy="3.2" rx="5" ry="2.2" stroke="#0d0f14" stroke-width="1.4"/>
         <path d="M1.5 3.2v6.6c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V3.2" stroke="#0d0f14" stroke-width="1.4"/>
         <path d="M1.5 6.5c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2" stroke="#0d0f14" stroke-width="1.4"/>
       </svg> GET STORAGE`;

const TOKEN_BTN_HTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
         <rect x="3" y="6" width="7" height="5" rx="1.4" stroke="#0d0f14" stroke-width="1.4"/>
         <path d="M5 6V4.4a1.5 1.5 0 013 0V6" stroke="#0d0f14" stroke-width="1.4"/>
       </svg> GET TOKEN`;

function setLoading(btn, on, idleHtml) {
  btn.disabled = on;
  btn.innerHTML = on
    ? `<span class="loading">⏳</span>&nbsp;LOADING…`
    : idleHtml;
}

// Keeps entries whose key or value matches q; nested objects are pruned down to the matching branches.
function pruneMatches(node, q) {
  if (node === null || typeof node !== 'object') {
    return String(node).toLowerCase().includes(q) ? node : undefined;
  }
  const out = Array.isArray(node) ? [] : {};
  for (const [k, v] of Object.entries(node)) {
    const keyHit = k.toLowerCase().includes(q);
    const sub = (v !== null && typeof v === 'object') ? (keyHit ? v : pruneMatches(v, q)) : (keyHit || String(v).toLowerCase().includes(q) ? v : undefined);
    if (sub === undefined) continue;
    if (Array.isArray(out)) out.push(sub); else out[k] = sub;
  }
  return Object.keys(out).length ? out : undefined;
}

function applyFilter() {
  const q = filterIn.value.trim().toLowerCase();
  filterClr.style.display = q ? 'block' : 'none';

  const keys = Object.keys(currentObj);
  const shown = {};
  for (const k of keys) {
    if (!q) { shown[k] = currentObj[k]; continue; }
    const v = currentObj[k];
    const sub = k.toLowerCase().includes(q) ? v : pruneMatches(v, q);
    if (sub !== undefined) shown[k] = sub;
  }

  currentJson = JSON.stringify(shown, null, 2);
  currentCopy = JSON.stringify(shown);
  renderJson(shown);

  const label = { cookies: 'cookie', storage: 'key', token: 'token' }[currentKind];
  const n = Object.keys(shown).length;
  countNum.textContent = q ? `${n} / ${keys.length}` : n;
  countLbl.textContent = label;
  countBdg.style.display = 'flex';
  btnCopy.disabled = n === 0;
}

async function run(kind) {
  const btn  = { cookies: btnGet, storage: btnStore, token: btnToken }[kind];
  const idle = { cookies: COOKIES_BTN_HTML, storage: STORAGE_BTN_HTML, token: TOKEN_BTN_HTML }[kind];

  setLoading(btn, true, idle);
  btnCopy.disabled = true;
  btnCopy.classList.remove('copied');
  countBdg.style.display = 'none';
  currentJson = '';
  currentCopy = '';
  currentObj  = {};

  try {
    const tab = await getActiveTab();
    const url = tab?.url ?? null;

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      throw new Error('Page not supported (use http/https).');
    }

    const { hostname } = new URL(url);
    domainBdg.textContent = hostname;

    let obj;
    if (kind === 'storage') {
      obj = await fetchLocalStorage(tab.id);
      if (obj.__error__) throw new Error(`localStorage not readable: ${obj.__error__}`);
    } else if (kind === 'token') {
      obj = await fetchSessionToken(tab.id);
      if (obj.__error__) throw new Error(obj.__error__);
    } else {
      obj = cookiesToObject(await fetchAllCookies(url));
    }

    currentObj  = obj;
    currentKind = kind;
    applyFilter();
    footerTs.textContent = new Date().toLocaleTimeString('en-US');

  } catch (err) {
    output.innerHTML = `<div class="state-error">⚠️ ${escHtml(err.message)}</div>`;
    domainBdg.textContent = 'error';
  } finally {
    setLoading(btn, false, idle);
  }
}

filterIn.addEventListener('input', () => {
  if (Object.keys(currentObj).length) applyFilter();
});

filterClr.addEventListener('click', () => {
  filterIn.value = '';
  applyFilter();
  filterIn.focus();
});

btnGet.addEventListener('click', () => run('cookies'));
btnStore.addEventListener('click', () => run('storage'));
btnToken.addEventListener('click', () => run('token'));

btnCopy.addEventListener('click', async () => {
  if (!currentCopy) return;
  try {
    await navigator.clipboard.writeText(currentCopy);
    btnCopy.textContent = '✓ COPIED';
    btnCopy.classList.add('copied');
    setTimeout(() => {
      btnCopy.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 8H2a1 1 0 01-1-1V2a1 1 0 011-1h5a1 1 0 011 1v1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg> COPY JSON`;
      btnCopy.classList.remove('copied');
    }, 1800);
  } catch {
    btnCopy.textContent = '✗ Error';
  }
});