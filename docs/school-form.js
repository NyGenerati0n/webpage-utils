/* school-form.js
 * Squarespace school autocomplete (Fuse) with config-driven selectors.
 * - Requires Fuse.js (auto-loads if missing)
 * - Supports JSONP for Apps Script URLs (to avoid CORS)
 * - Does NOT wrap/move the school input (to avoid changing its styling)
 * - Optional activity filter: activityFilter = "all" | "active" | "inactive" (default "all")
 * - If config missing/invalid, prints a debug dump + config template (and auto-copies if DevTools supports copy()).
 */
(() => {
  const GLOBAL_KEY = "SCHOOL_FORM_CONFIG";
  const ATTACHED_KEY = "schoolAutocompleteAttached";

  const DEFAULTS = {
    maxSuggestions: 8,
    threshold: 0.35,
    hintText: 'Välj en skola i listan – eller kryssa i “Min skola finns inte”.',
    errorChoose: 'Välj en skola i listan, eller kryssa i “Min skola finns inte”.',
    errorFreeText: 'Skriv din skolas namn, eller avmarkera och välj från listan.',
    activityFilter: "all", // "all" | "active" | "inactive"
  };

  // --------- Utilities ---------
  const esc = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function foldSv(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[åä]/g, "a")
      .replace(/ö/g, "o");
  }

  function onceInjectStyles_() {
    if (document.getElementById("school-ac-styles")) return;
    const style = document.createElement("style");
    style.id = "school-ac-styles";
    style.textContent = `
      /* Overlay list - does not alter input styling */
      .school-ac-list {
        position: absolute;
        z-index: 999999;
        background: white;
        border: 1px solid rgba(0,0,0,.15);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        display: none;
        max-height: 320px;
        overflow-y: auto;
      }
      .school-ac-item { padding: 10px 12px; cursor: pointer; font-size: 14px; }
      .school-ac-item:hover, .school-ac-item.is-active { background: rgba(0,0,0,.06); }
      .school-ac-hint { font-size: 12px; opacity: .75; margin-top: 6px; }
      .school-ac-error { margin-top: 8px; font-size: 13px; color: #b00020; display: none; }
      .school-ac-error.is-visible { display: block; }
    `;
    document.head.appendChild(style);
  }

  function isAppsScriptUrl_(url) {
    return /script\.google\.com|script\.googleusercontent\.com/.test(String(url || ""));
  }

  // --------- Fuse loader (optional) ---------
  function ensureFuse_() {
    if (window.Fuse) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/fuse.js@7.1.0";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Kunde inte ladda Fuse.js från CDN."));
      document.head.appendChild(s);
    });
  }

  // --------- Data loading + cache per URL ---------
  const dataCache = new Map(); // url -> Promise<schoolsPrepared[]>

  function loadSchoolsPrepared_(dataUrl) {
    const key = String(dataUrl || "");
    if (!key) return Promise.reject(new Error("schoolsDataUrl saknas."));
    if (dataCache.has(key)) return dataCache.get(key);

    const p = (isAppsScriptUrl_(key) ? loadJsonp_(key) : loadFetchJson_(key))
      .then((payload) => prepareSchools_(payload));

    dataCache.set(key, p);
    return p;
  }

  function loadFetchJson_(url) {
    return fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`Kunde inte hämta JSON (${r.status}).`);
      return r.json();
    });
  }

  function loadJsonp_(url) {
    return new Promise((resolve, reject) => {
      const cb = "__schoolsCb_" + Math.random().toString(36).slice(2);
      const sep = url.includes("?") ? "&" : "?";
      const src = url + sep + "callback=" + encodeURIComponent(cb);

      const script = document.createElement("script");
      window[cb] = (data) => {
        try { delete window[cb]; } catch (_) {}
        script.remove();
        resolve(data);
      };
      script.src = src;
      script.onerror = () => {
        try { delete window[cb]; } catch (_) {}
        script.remove();
        reject(new Error("JSONP-laddning misslyckades (script error)."));
      };
      document.head.appendChild(script);
    });
  }

  function prepareSchools_(payload) {
    const arr = payload && (payload.schools || payload);
    const list = Array.isArray(arr) ? arr : [];
    return list.map((s) => ({
      id: s.id,
      name: s.name,
      city: s.adress?.city || "",
      isActive: !!s.isActive,
      _fold: foldSv(`${s.name} ${s.adress?.city || ""}`),
    }));
  }

  function applyActivityFilter_(schoolsPrepared, activityFilter) {
    const f = (activityFilter ?? "all");
    if (f === "active" || f === true || f === 1) return schoolsPrepared.filter(s => s.isActive);
    if (f === "inactive" || f === false || f === 0) return schoolsPrepared.filter(s => !s.isActive);
    return schoolsPrepared; // "all"
  }

  // --------- Debug helpers ---------
  function suggestSelector_(el) {
    if (!el) return null;
    const tag = el.tagName.toLowerCase();
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `${tag}[name="${cssAttr_(el.name)}"]`;
    if (el.type) return `${tag}[type="${cssAttr_(el.type)}"]`;
    return tag;
  }
  function cssAttr_(s) {
    return String(s).replace(/"/g, '\\"');
  }

  function debugDumpForms_() {
    const forms = Array.from(document.querySelectorAll("form"));
    const info = forms.map((form, idx) => {
      const labels = Array.from(form.querySelectorAll("label, .title, .field-title, .form-field-title"))
        .map((x) => x.textContent.trim())
        .filter(Boolean);

      const inputs = Array.from(form.querySelectorAll("input, textarea, select")).map((el) => ({
        tag: el.tagName,
        type: el.type || null,
        id: el.id || null,
        name: el.name || null,
        selector: suggestSelector_(el),
      }));

      return { idx, labels, inputs };
    });

    const template = {
      schoolsDataUrl: "https://DIN_URL/exec?path=schools.json",
      activityFilter: "all", // "all" | "active" | "inactive"
      selectors: {
        schoolInput: "SÄTT_SELECTOR_HÄR",
        notFoundCb: "SÄTT_SELECTOR_HÄR",
        schoolIdInput: "SÄTT_SELECTOR_HÄR",
      },
      maxSuggestions: 8,
      threshold: 0.35
    };

    console.group("SchoolFormAutocomplete: FORM DEBUG");
    console.log("Hittade formulär:", info.length);
    info.forEach((f) => {
      console.group(`Form #${f.idx}`);
      console.log("Labels:", f.labels);
      console.table(f.inputs);
      console.groupEnd();
    });

    console.log("Config-template (kopiera och fyll i selectors):");
    console.log(template);

    // Auto-copy if DevTools supports it
    try {
      if (typeof copy === "function") {
        copy(`window.${GLOBAL_KEY} = [${JSON.stringify(template, null, 2)}];`);
        console.log("✅ Kopierade en config-template till clipboard (DevTools copy()).");
      }
    } catch (_) {}

    console.groupEnd();

    return info;
  }

  window.SchoolFormAutocomplete = window.SchoolFormAutocomplete || {};
  window.SchoolFormAutocomplete.debug = debugDumpForms_;

  // --------- Core attach logic ---------
  function buildFuse_(schoolsPrepared, threshold) {
    return new window.Fuse(schoolsPrepared, {
      includeScore: true,
      threshold: typeof threshold === "number" ? threshold : DEFAULTS.threshold,
      ignoreLocation: true,
      keys: [
        { name: "name", weight: 3 },
        { name: "city", weight: 1 },
        { name: "_fold", weight: 4 },
      ],
    });
  }

  function attachFromConfig_(cfg, schoolsPreparedAll) {
    const selectors = cfg.selectors || {};
    const schoolEl = document.querySelector(selectors.schoolInput || "");
    const cbEl = document.querySelector(selectors.notFoundCb || "");
    const idEl = document.querySelector(selectors.schoolIdInput || "");

    if (!schoolEl || !cbEl || !idEl) {
      console.group("SchoolFormAutocomplete: config matchade inte element");
      console.log("Config:", cfg);
      console.log("Hittade:", { schoolEl, cbEl, idEl });
      console.log("Kör window.SchoolFormAutocomplete.debug() för att se selectors du kan använda.");
      console.groupEnd();
      debugDumpForms_();
      return false;
    }

    const form = schoolEl.closest("form");
    if (!form) {
      console.warn("SchoolFormAutocomplete: hittade inget <form> runt schoolInput.");
      return false;
    }

    if (form.dataset[ATTACHED_KEY] === "1") return true;
    form.dataset[ATTACHED_KEY] = "1";

    onceInjectStyles_();

    // Hide ID field visually (keep in submission)
    const idWrapper = idEl.closest(".field, .form-item, .form-field") || idEl.parentElement;
    if (idWrapper) idWrapper.style.display = "none";

    // Insert hint + error near input (doesn't change input styling)
    const fieldWrap = schoolEl.closest(".field, .form-item, .form-field") || schoolEl.parentElement;

    const hint = document.createElement("div");
    hint.className = "school-ac-hint";
    hint.textContent = cfg.hintText || DEFAULTS.hintText;

    const err = document.createElement("div");
    err.className = "school-ac-error";

    // place hint+err after input inside same field wrapper if possible
    try {
      schoolEl.insertAdjacentElement("afterend", hint);
      hint.insertAdjacentElement("afterend", err);
    } catch (_) {
      if (fieldWrap) {
        fieldWrap.appendChild(hint);
        fieldWrap.appendChild(err);
      }
    }

    // Create dropdown list as an overlay attached to body (so no layout/style changes)
    const list = document.createElement("div");
    list.className = "school-ac-list";
    document.body.appendChild(list);

    // Filter dataset for this config
    const schoolsPrepared = applyActivityFilter_(schoolsPreparedAll, cfg.activityFilter);

    const fuse = buildFuse_(schoolsPrepared, cfg.threshold);

    let selected = null;
    let activeIndex = -1;

    function positionList_() {
      const rect = schoolEl.getBoundingClientRect();
      const top = rect.bottom + window.scrollY + 6;
      const left = rect.left + window.scrollX;
      list.style.top = `${top}px`;
      list.style.left = `${left}px`;
      list.style.width = `${rect.width}px`;
    }

    function showError(msg) {
      err.textContent = msg;
      err.classList.add("is-visible");
      schoolEl.setAttribute("aria-invalid", "true");
    }
    function clearError() {
      err.textContent = "";
      err.classList.remove("is-visible");
      schoolEl.removeAttribute("aria-invalid");
    }
    function hideList() {
      list.style.display = "none";
      list.innerHTML = "";
      activeIndex = -1;
    }
    function clearSelected() {
      selected = null;
      idEl.value = "";
    }
    function setSelected(s) {
      selected = s;
      schoolEl.value = s.name;
      idEl.value = s.id;
      clearError();
      hideList();
    }

    function search(q) {
      const qq = String(q || "").trim();
      if (!qq) return [];
      return fuse.search(qq).map((r) => r.item).slice(0, cfg.maxSuggestions || DEFAULTS.maxSuggestions);
    }

    function render(items) {
      list.innerHTML = "";
      activeIndex = -1;
      if (!items.length) { hideList(); return; }

      items.forEach((s) => {
        const row = document.createElement("div");
        row.className = "school-ac-item";
        row.innerHTML =
          `<strong>${esc(s.name)}</strong>` +
          (s.city ? ` <span>– ${esc(s.city)}</span>` : "") +
          (s.isActive ? " • Aktiv" : " • Inte aktiv");

        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          setSelected(s);
        });

        list.appendChild(row);
      });

      positionList_();
      list.style.display = "block";
    }

    // Keep list positioned on scroll/resize while open
    const repositionIfOpen = () => {
      if (list.style.display === "block") positionList_();
    };
    window.addEventListener("scroll", repositionIfOpen, true);
    window.addEventListener("resize", repositionIfOpen);

    // Events
    schoolEl.addEventListener("input", () => {
      clearError();

      if (cbEl.checked) {
        hideList();
        clearSelected();
        return;
      }

      if (selected && schoolEl.value !== selected.name) clearSelected();
      render(search(schoolEl.value));
    });

    schoolEl.addEventListener("keydown", (e) => {
      if (list.style.display !== "block") return;
      const rows = Array.from(list.querySelectorAll(".school-ac-item"));
      if (!rows.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, rows.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
      } else if (e.key === "Enter") {
        if (activeIndex >= 0) {
          e.preventDefault();
          const items = search(schoolEl.value);
          if (items[activeIndex]) setSelected(items[activeIndex]);
        }
      } else if (e.key === "Escape") {
        hideList();
      }

      rows.forEach((r) => r.classList.remove("is-active"));
      if (activeIndex >= 0 && rows[activeIndex]) rows[activeIndex].classList.add("is-active");
    });

    schoolEl.addEventListener("blur", () => setTimeout(hideList, 150));

    cbEl.addEventListener("change", () => {
      clearError();
      if (cbEl.checked) {
        hideList();
        clearSelected();
      } else {
        clearSelected();
      }
    });

    function validateOrBlock(evt) {
      clearError();
      const text = String(schoolEl.value || "").trim();

      if (cbEl.checked) {
        if (!text) {
          evt.preventDefault(); evt.stopPropagation(); evt.stopImmediatePropagation();
          showError(cfg.errorFreeText || DEFAULTS.errorFreeText);
          return false;
        }
        return true;
      }

      if (!selected || !idEl.value) {
        evt.preventDefault(); evt.stopPropagation(); evt.stopImmediatePropagation();
        showError(cfg.errorChoose || DEFAULTS.errorChoose);
        return false;
      }

      return true;
    }

    form.addEventListener("submit", validateOrBlock);
    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) submitBtn.addEventListener("click", validateOrBlock);

    return true;
  }

  // --------- Init / re-init (Squarespace AJAX nav) ---------
  let initRunning = false;

  function getConfigs_() {
    const cfg = window[GLOBAL_KEY];
    if (!cfg) return [];
    if (Array.isArray(cfg)) return cfg;
    return [cfg];
  }

  async function init_() {
    if (initRunning) return;
    initRunning = true;
    try {
      const configs = getConfigs_();

      if (!configs.length) {
        console.group("SchoolFormAutocomplete: ingen config hittades");
        console.log(`Lägg till t.ex:\nwindow.${GLOBAL_KEY} = [{ schoolsDataUrl: "...", selectors: {...}}];`);
        console.log("Kör window.SchoolFormAutocomplete.debug() för att se fält och selectors.");
        console.groupEnd();
        debugDumpForms_();
        return;
      }

      await ensureFuse_();

      for (const cfg of configs) {
        const merged = Object.assign({}, DEFAULTS, cfg);

        if (!merged.schoolsDataUrl) {
          console.group("SchoolFormAutocomplete: config saknar schoolsDataUrl");
          console.log("Config:", cfg);
          console.groupEnd();
          debugDumpForms_();
          continue;
        }
        if (!merged.selectors || !merged.selectors.schoolInput || !merged.selectors.notFoundCb || !merged.selectors.schoolIdInput) {
          console.group("SchoolFormAutocomplete: config saknar selectors");
          console.log("Config:", cfg);
          console.log("Behövs selectors: schoolInput, notFoundCb, schoolIdInput");
          console.groupEnd();
          debugDumpForms_();
          continue;
        }

        const schoolsPreparedAll = await loadSchoolsPrepared_(merged.schoolsDataUrl);
        attachFromConfig_(merged, schoolsPreparedAll);
      }
    } catch (err) {
      console.log("SchoolFormAutocomplete init failed:", err);
    } finally {
      initRunning = false;
    }
  }

  function scheduleInit_() {
    clearTimeout(scheduleInit_._t);
    scheduleInit_._t = setTimeout(init_, 200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleInit_);
  } else {
    scheduleInit_();
  }

  const mo = new MutationObserver(() => scheduleInit_());
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
