/* school-form.js (v4)
 * Hybrid layout:
 * - Dropdown list ALWAYS lives inside the field wrapper (popup-safe) via a zero-height anchor.
 * - Hint+error live OUTSIDE wrapper by default.
 * - If themeTweaks.tryFormInputEffectsGridHack succeeds (span.form-input-effects exists),
 *   hint+error are placed INSIDE wrapper (because grid can accommodate it nicely).
 * - If tweak enabled but element missing, logs and falls back to outside placement.
 *
 * Other:
 * - Fuse.js auto-load if missing
 * - JSONP for Apps Script URLs to avoid CORS
 * - activityFilter: "all" | "active" | "inactive" (default "all")
 * - spacing: { mode: "none" | "measure", desiredGap, maxAdjust } (default "none")
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

    spacing: {
      mode: "none",      // "none" | "measure"
      desiredGap: 6,
      maxAdjust: 20,
    },

    themeTweaks: {
      tryFormInputEffectsGridHack: false, // if ON: try span.form-input-effects { grid-row-end:3 }
    },
  };

  // ---------- util ----------
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

  function px_(v) {
    const n = parseFloat(v || "0");
    return Number.isFinite(n) ? n : 0;
  }

  function isAppsScriptUrl_(url) {
    return /script\.google\.com|script\.googleusercontent\.com/.test(String(url || ""));
  }

  // ---------- CSS ----------
  function onceInjectStyles_() {
    if (document.getElementById("school-ac-styles")) return;
    const style = document.createElement("style");
    style.id = "school-ac-styles";
    style.textContent = `
      /* Anchor inside wrapper: takes no space, allows absolute dropdown without moving layout */
      .school-ac-inwrap-anchor{
        position: relative;
        height: 0;
        overflow: visible;
        width: 100%;
      }

      /* If wrapper is grid, this makes anchor span full width */
      .school-ac-inwrap-anchor{
        grid-column: 1 / -1;
      }

      .school-ac-list{
        position: absolute;
        z-index: 2147483647;
        left: 0; right: 0;
        top: 0;
        background: white;
        border: 1px solid rgba(0,0,0,.15);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        display: none;
        max-height: 320px;
        overflow-y: auto;
        pointer-events: auto;
      }

      .school-ac-item{ padding: 10px 12px; cursor: pointer; font-size: 14px; }
      .school-ac-item:hover, .school-ac-item.is-active{ background: rgba(0,0,0,.06); }

      /* Hint/error blocks */
      .school-ac-hint{ opacity: .75; margin-top: 6px; }
      .school-ac-error{ margin-top: 8px; font-size: 13px; color: #b00020; display: none; }
      .school-ac-error.is-visible{ display: block; }

      /* When hint/error placed inside wrapper, keep them behaving like regular blocks */
      .school-ac-inwrap{
        grid-column: 1 / -1;
        background: transparent;
        border: 0;
        padding: 0;
        margin: 5px;
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- Fuse loader ----------
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

  // ---------- data loading (cached per URL) ----------
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
    return schoolsPrepared;
  }

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

  // ---------- debug helpers ----------
  function suggestSelector_(el) {
    if (!el) return null;
    const tag = el.tagName.toLowerCase();
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `${tag}[name="${String(el.name).replace(/"/g, '\\"')}"]`;
    return tag;
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
      activityFilter: "all",
      selectors: {
        schoolInput: "SÄTT_SELECTOR_HÄR",
        notFoundCb: "SÄTT_SELECTOR_HÄR",
        schoolIdInput: "SÄTT_SELECTOR_HÄR",
      },
      spacing: { mode: "none", desiredGap: 6, maxAdjust: 20 },
      themeTweaks: { tryFormInputEffectsGridHack: false },
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

  // ---------- spacing (optional) ----------
  function measureAndTightenGap_(fieldWrap, externalBlock, spacingCfg) {
    if (!fieldWrap || !externalBlock) return;
    const desired = px_(spacingCfg?.desiredGap ?? DEFAULTS.spacing.desiredGap);
    const maxAdjust = px_(spacingCfg?.maxAdjust ?? DEFAULTS.spacing.maxAdjust);

    const r1 = fieldWrap.getBoundingClientRect();
    const r2 = externalBlock.getBoundingClientRect();
    const currentGap = r2.top - r1.bottom;

    const delta = currentGap - desired;
    if (delta > 0) {
      const adjust = Math.min(delta, maxAdjust);
      externalBlock.style.marginTop = (-adjust) + "px";
    }
  }

  // ---------- theme tweak ----------
  function tryApplyFormInputEffectsHack_(fieldWrap, enable) {
    if (!enable) return { applied: false, reason: "disabled" };
    if (!fieldWrap) return { applied: false, reason: "no_fieldWrap" };

    const effects = fieldWrap.querySelector("span.form-input-effects");
    if (!effects) {
      console.info(
        "SchoolFormAutocomplete: themeTweaks.tryFormInputEffectsGridHack=ON men span.form-input-effects saknas → placerar hint/error utanför wrappern (fallback)."
      );
      return { applied: false, reason: "not_found" };
    }

    // Only change this element; does not move input or touch wrapper positioning context
    effects.style.gridRowEnd = "3";
    return { applied: true, reason: "ok" };
  }

  // ---------- attach ----------
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

    const fieldWrap = schoolEl.closest(".field, .form-item, .form-field") || schoolEl.parentElement;

    // Theme tweak result determines hint/error placement policy
    const tweak = tryApplyFormInputEffectsHack_(fieldWrap, !!cfg.themeTweaks?.tryFormInputEffectsGridHack);

    // 1) LIST always inside wrapper via a zero-height anchor (no layout shift)
    let inwrapAnchor = fieldWrap?.querySelector(":scope > .school-ac-inwrap-anchor");
    if (!inwrapAnchor) {
      inwrapAnchor = document.createElement("div");
      inwrapAnchor.className = "school-ac-inwrap-anchor";
      try {
        schoolEl.insertAdjacentElement("afterend", inwrapAnchor);
      } catch (_) {
        fieldWrap?.appendChild(inwrapAnchor);
      }
    }

    const list = document.createElement("div");
    list.className = "school-ac-list";
    inwrapAnchor.appendChild(list);

    // 2) Hint + Error placement:
    const hint = document.createElement("div");
    hint.className = "school-ac-hint";
    hint.textContent = cfg.hintText || DEFAULTS.hintText;

    const err = document.createElement("div");
    err.className = "school-ac-error";

    if (tweak.applied) {
      hint.classList.add("school-ac-inwrap");
      err.classList.add("school-ac-inwrap");
      inwrapAnchor.insertAdjacentElement("afterend", hint);
      hint.insertAdjacentElement("afterend", err);
    } else {
      const outside = document.createElement("div");
      outside.className = "school-ac-outside";
      if (fieldWrap && fieldWrap.insertAdjacentElement) {
        fieldWrap.insertAdjacentElement("afterend", outside);
      } else {
        schoolEl.insertAdjacentElement("afterend", outside);
      }
      outside.appendChild(hint);
      outside.appendChild(err);
    }

    // dataset per config
    const schoolsPrepared = applyActivityFilter_(schoolsPreparedAll, cfg.activityFilter);
    const fuse = buildFuse_(schoolsPrepared, cfg.threshold);

    // --- Selection state + guarded lock ---
    let selected = null;
    let selectedName = "";
    let selectedId = "";
    let lastTyped = "";
    let isLocked = false;
    let activeIndex = -1;

    // Native value getter/setter (for safe writes even when we override)
    const _valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const _origGetValue = _valueDesc.get;
    const _origSetValue = _valueDesc.set;

    function installValueGuard_() {
      if (schoolEl.dataset.valueGuardInstalled === "1") return;

      Object.defineProperty(schoolEl, "value", {
        configurable: true,
        enumerable: true,
        get() {
          return _origGetValue.call(this);
        },
        set(v) {
          // If locked + selected exists: clamp to selectedName
          if (isLocked && selectedName && v !== selectedName) {
            _origSetValue.call(this, selectedName);
            return;
          }
          _origSetValue.call(this, v);
        }
      });

      schoolEl.dataset.valueGuardInstalled = "1";
    }

    function uninstallValueGuard_() {
      if (schoolEl.dataset.valueGuardInstalled !== "1") return;
      delete schoolEl.value; // remove own-property override
      delete schoolEl.dataset.valueGuardInstalled;
    }

    function lockField_() {
      if (!selectedName || !selectedId || cbEl.checked) return;
      isLocked = true;
      schoolEl.readOnly = true;
      installValueGuard_();

      // Force correct values (use native setter to avoid recursion)
      _origSetValue.call(schoolEl, selectedName);
      idEl.value = selectedId;

      schoolEl.dataset.selectedSchoolName = selectedName;
      schoolEl.dataset.selectedSchoolId = selectedId;
    }

    function unlockField_() {
      isLocked = false;
      schoolEl.readOnly = false;
      uninstallValueGuard_();
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
      selectedName = "";
      selectedId = "";
      idEl.value = "";
      delete schoolEl.dataset.selectedSchoolName;
      delete schoolEl.dataset.selectedSchoolId;
      unlockField_();
    }

    function setSelected(s) {
      // Make sure guard isn't blocking switching selection
      unlockField_();

      selected = s;
      selectedName = s?.name || "";
      selectedId = s?.id || "";

      _origSetValue.call(schoolEl, selectedName);
      idEl.value = selectedId;

      schoolEl.dataset.selectedSchoolName = selectedName;
      schoolEl.dataset.selectedSchoolId = selectedId;

      clearError();
      hideList();

      lockField_();
    }

    function getStoredSelectedName_() {
      return selectedName || schoolEl.dataset.selectedSchoolName || "";
    }
    function getStoredSelectedId_() {
      return selectedId || schoolEl.dataset.selectedSchoolId || "";
    }

    function search(q) {
      const qq = String(q || "").trim();
      if (!qq) return [];
      return fuse.search(qq).map((r) => r.item).slice(0, cfg.maxSuggestions || DEFAULTS.maxSuggestions);
    }

    function render(items) {
      list.innerHTML = "";
      activeIndex = -1;

      if (!items.length) {
        hideList();
        return;
      }

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

      list.style.display = "block";
    }

    // --- UX: unlock when user returns to the school field ---
    schoolEl.addEventListener("mousedown", () => {
      if (!isLocked) return;
      unlockField_();
    });

    schoolEl.addEventListener("focus", () => {
      if (!isLocked) return;
      unlockField_();
      try { schoolEl.select(); } catch (_) {}
    });

    // --- Event wiring ---
    schoolEl.addEventListener("input", () => {
      clearError();

      if (cbEl.checked) {
        hideList();
        clearSelected();
        return;
      }

      // If we were locked (shouldn't accept typing), ensure unlocked
      if (isLocked) unlockField_();

      const storedName = getStoredSelectedName_();
      if (storedName && schoolEl.value !== storedName) {
        lastTyped = schoolEl.value;
        clearSelected();
      }

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

    // Hide list shortly after blur (allows mousedown selection)
    schoolEl.addEventListener("blur", () => {
      setTimeout(() => {
        hideList();

        // If selection exists, enforce + lock again after leaving field
        const storedName = getStoredSelectedName_();
        const storedId = getStoredSelectedId_();

        if (!cbEl.checked && storedName && storedId) {
          selectedName = storedName;
          selectedId = storedId;
          lockField_();
        }
      }, 0);
    });

    cbEl.addEventListener("change", () => {
      clearError();

      if (cbEl.checked) {
        // free-text mode
        hideList();
        clearSelected();
        unlockField_();
      } else {
        // must-choose mode again
        clearSelected();
        if (lastTyped) _origSetValue.call(schoolEl, lastTyped);
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

      const storedName = getStoredSelectedName_();
      const storedId = getStoredSelectedId_();

      if (!storedName || !storedId) {
        evt.preventDefault(); evt.stopPropagation(); evt.stopImmediatePropagation();
        showError(cfg.errorChoose || DEFAULTS.errorChoose);
        return false;
      }

      // Ensure correct values right before submit (native set to avoid guard recursion issues)
      selectedName = storedName;
      selectedId = storedId;
      _origSetValue.call(schoolEl, storedName);
      idEl.value = storedId;

      // Keep locked for submit
      lockField_();

      return true;
    }

    form.addEventListener("submit", validateOrBlock);
    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      submitBtn.addEventListener("click", (e) => {
        validateOrBlock(e);
      });
    }

    return true;
  }



  // ---------- init ----------
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

      for (const rawCfg of configs) {
        const cfg = {
          ...DEFAULTS,
          ...rawCfg,
          spacing: { ...DEFAULTS.spacing, ...(rawCfg?.spacing || {}) },
          themeTweaks: { ...DEFAULTS.themeTweaks, ...(rawCfg?.themeTweaks || {}) },
        };

        if (!cfg.schoolsDataUrl) {
          console.group("SchoolFormAutocomplete: config saknar schoolsDataUrl");
          console.log("Config:", rawCfg);
          console.groupEnd();
          debugDumpForms_();
          continue;
        }
        if (!cfg.selectors || !cfg.selectors.schoolInput || !cfg.selectors.notFoundCb || !cfg.selectors.schoolIdInput) {
          console.group("SchoolFormAutocomplete: config saknar selectors");
          console.log("Config:", rawCfg);
          console.log("Behövs selectors: schoolInput, notFoundCb, schoolIdInput");
          console.groupEnd();
          debugDumpForms_();
          continue;
        }

        const schoolsPreparedAll = await loadSchoolsPrepared_(cfg.schoolsDataUrl);
        attachFromConfig_(cfg, schoolsPreparedAll);
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

  // Squarespace dynamic navigation support
  const mo = new MutationObserver(() => scheduleInit_());
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
