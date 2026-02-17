/*!
 * SSAutocomplete v0.1
 * Host this file externally and load on Squarespace pages.
 */
(function (global) {
  "use strict";

  const DEFAULTS = {
    debug: false,

    // Optional: if your popup is always a dialog/overlay, you can tune detection.
    observer: { subtree: true, childList: true },

    // Per-field configs live in fields: [...]
    fields: [],

    // Fuse global default (can be overridden per field)
    fuseDefaults: {
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 1,
    },

    // Fetch default
    fetch: {
      cache: "no-store", // "default" if you want normal caching
    },
  };

  // One global outside-click handler per init-session (undviker en per fält)
  let SSAC_OPEN_PANELS = null;
  let SSAC_OUTSIDE_HANDLER = null;
  let SSAC_OUTSIDE_BOUND = false;

  // ---------- Utilities ----------
  function log(cfg, ...args) {
    if (cfg && cfg.debug) console.log("[SSAutocomplete]", ...args);
  }

  function normalizeText(s) {
    return String(s ?? "")
      .replace(/\s+/g, " ")
      .replace(/\*/g, "")
      .trim()
      .toLowerCase();
  }

  function removeRequiredSuffixSafely(labelEl) {
    // Tar bort "(Krävs)" / "(Required)" utan att förstöra wrappers/spans i labeln.
    const re = /\(\s*krävs\s*\)|\(\s*required\s*\)/ig;

    // Gå igenom bara textnoderna inuti labeln
    const walker = global.document.createTreeWalker(labelEl, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    for (const tn of nodes) {
      const before = tn.nodeValue || "";
      const after = before.replace(re, "").replace(/\s+/g, " ");
      if (after !== before) tn.nodeValue = after;
    }
  }

  function setNativeValue(el, value) {
    const proto =
      el.tagName.toLowerCase() === "textarea"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && typeof desc.set === "function") desc.set.call(el, value);
    else el.value = value;
  }

  function dispatchInputEvents(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findLabelInForm(form, targetLabel) {
    const want = normalizeText(targetLabel);
    const labels = Array.from(form.querySelectorAll("label"));
    return (
      labels.find((lab) => {
        const txt = normalizeText(lab.textContent);
        return txt === want || txt.includes(want);
      }) || null
    );
  }

  function findFieldWrapperFromLabel(labelEl, form) {
    let el = labelEl;
    for (let i = 0; i < 12; i++) {
      if (!el || el === form) break;
      if (el.querySelector) {
        const input = el.querySelector(
          'input[type="text"], input:not([type]), textarea'
        );
        if (input && el.contains(labelEl)) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function findCarrierInput(wrapper) {
    const candidates = Array.from(wrapper.querySelectorAll("input, textarea")).filter(
      (el) => {
        const t = (el.getAttribute("type") || "").toLowerCase();
        if (t === "hidden" || t === "submit" || t === "button") return false;
        return el.tagName.toLowerCase() === "textarea" || t === "" || t === "text";
      }
    );
    return candidates[0] || null;
  }

  function findFieldBlockFromLabel(labelEl, form) {
    // Försök hitta ett “fältblock” som omsluter label + dess kontroll.
    // Vi tar en defensiv approach: gå upp några nivåer och välj första som innehåller label
    // och innehåller någon form av form-control (input/select/textarea).
    let el = labelEl;
    for (let i = 0; i < 14; i++) {
      if (!el || el === form) break;
      if (el.querySelector && el.contains(labelEl)) {
        const hasControl = el.querySelector("input, select, textarea");
        if (hasControl) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function findControlByLabel(form, labelText) {
    const labelEl = findLabelInForm(form, labelText);
    if (!labelEl) return null;

    // 1) label[for] -> element id (mest korrekt när det finns)
    const forId = labelEl.getAttribute && labelEl.getAttribute("for");
    if (forId) {
      const byId = form.querySelector("#" + CSS.escape(forId)) || global.document.getElementById(forId);
      if (byId) return byId;
    }

    // 2) input inuti label (vanligt i checkbox/radio)
    const inside = labelEl.querySelector && labelEl.querySelector("input, select, textarea");
    if (inside) return inside;

    // 3) hitta “fältblock” och välj en rimlig kontroll
    const block = findFieldBlockFromLabel(labelEl, form);
    if (!block) return null;

    // Prioritera checkbox/radio/select framför textinputs (så du inte råkar ta första textfältet)
    const preferred =
      block.querySelector('input[type="checkbox"]') ||
      block.querySelector('input[type="radio"]') ||
      block.querySelector("select") ||
      block.querySelector("textarea") ||
      block.querySelector("input");

    return preferred || null;
  }


  function bindOutsideClickOnce() {
    if (SSAC_OUTSIDE_BOUND) return;

    SSAC_OUTSIDE_HANDLER = function (e) {
      if (!SSAC_OPEN_PANELS) return;
      for (const api of SSAC_OPEN_PANELS) {
        // defensivt: om wrapper försvunnit (popup stängd), städa bort den
        if (!api || !api.wrapper || !api.close) continue;
        if (!global.document.documentElement.contains(api.wrapper)) {
          SSAC_OPEN_PANELS.delete(api);
          continue;
        }
        if (!api.wrapper.contains(e.target)) api.close();
      }
    };

    global.document.addEventListener("mousedown", SSAC_OUTSIDE_HANDLER, true);
    SSAC_OUTSIDE_BOUND = true;
  }

  function unbindOutsideClickIfAny() {
    if (!SSAC_OUTSIDE_BOUND) return;
    global.document.removeEventListener("mousedown", SSAC_OUTSIDE_HANDLER, true);
    SSAC_OUTSIDE_BOUND = false;
    SSAC_OUTSIDE_HANDLER = null;
  }

  function enforceCarrierHidden(carrier) {
    if (!carrier) return;

    carrier.classList.add("ssac-carrier-hidden");

    // Sätt styles med !important så Squarespace inte “reset:ar fram” inputen
    const s = carrier.style;
    s.setProperty("position", "absolute", "important");
    s.setProperty("opacity", "0", "important");
    s.setProperty("pointer-events", "none", "important");
    s.setProperty("height", "0", "important");
    s.setProperty("margin", "0", "important");
    s.setProperty("padding", "0", "important");
    s.setProperty("border", "0", "important");

    // Extra säkerhet om temat sätter width/visibility
    s.setProperty("width", "1px", "important");
    s.setProperty("max-height", "0", "important");
    s.setProperty("overflow", "hidden", "important");
  }


  function bindConditionControls(form, fieldCfg, applyFn) {
    // fieldCfg.conditionControls:
    // {
    //   selectorMap: { missingSchool: 'input[name="..."]', region: 'select[name="..."]' }
    //   or byLabel:  { missingSchool: 'Skolan finns inte i listan' }  // checkbox via label-text
    //   events: ["change"] // default
    // }
    const cc = fieldCfg && fieldCfg.conditionControls;
    if (!cc || typeof applyFn !== "function") return { controls: {}, unbind: () => {} };

    const controls = {};

    // 1) selectors
    if (cc.selectorMap && typeof cc.selectorMap === "object") {
      for (const key of Object.keys(cc.selectorMap)) {
        const sel = cc.selectorMap[key];
        if (!sel) continue;
        const el = form.querySelector(sel);
        if (el) controls[key] = el;
      }
    }

    // 2) byLabel (främst checkbox/radio/select – men funkar generellt)
    if (cc.byLabel && typeof cc.byLabel === "object") {
      for (const key of Object.keys(cc.byLabel)) {
        const labelText = cc.byLabel[key];
        if (!labelText) continue;

        const el = findControlByLabel(form, labelText);
        if (el) controls[key] = el;
      }
    }

    // Events (default: change)
    const events = Array.isArray(cc.events) && cc.events.length ? cc.events : ["change"];

    function handler(e) {
      // Guard: kör bara om event-target matchar något av våra controls
      const t = e && e.target;
      if (!t) return;

      for (const k of Object.keys(controls)) {
        if (controls[k] === t) {
          applyFn(controls);
          return;
        }
      }
    }

    // Bind
    for (const ev of events) form.addEventListener(ev, handler, true);

    // Initial apply
    applyFn(controls);

    return {
      controls,
      unbind: () => {
        for (const ev of events) form.removeEventListener(ev, handler, true);
      },
    };
  }





  // ---------- UI ----------
  function buildUIInput(carrier, placeholder) {
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = placeholder || "";
    if (carrier.className) input.className = carrier.className; // helps “native look”
    input.dataset.ssacUi = "1";
    return input;
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.className = "ssac-panel";
    panel.hidden = true;
    panel.setAttribute("role", "listbox");
    return panel;
  }

  function buildPanelAnchor() {
    const anchor = document.createElement("div");
    anchor.className = "ssac-anchor";
    
    return anchor;
  }

  function mountPanelUnderInput(uiInput, panel) {
    // Anchor direkt efter uiInput, panel inuti anchor
    const anchor = buildPanelAnchor();
    anchor.appendChild(panel);

    // Lägg ankaret direkt efter uiInput (men före carrier), så det hamnar under input i flödet.
    uiInput.insertAdjacentElement("afterend", anchor);
    panel.classList.add("ssac-panel--anchored");

    return anchor;
  }


  function renderPanel(panel, items, activeIndex, emptyText) {
    panel.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "ssac-item ssac-muted";
      empty.textContent = emptyText || "Inga träffar";
      empty.setAttribute("aria-disabled", "true");
      panel.appendChild(empty);
      return;
    }

    items.forEach((item, idx) => {
      const div = document.createElement("div");
      div.className = "ssac-item";
      div.textContent = item.label;
      div.setAttribute("role", "option");
      div.setAttribute("aria-selected", idx === activeIndex ? "true" : "false");
      div.dataset.ssacIndex = String(idx);
      panel.appendChild(div);
    });
  }

  // ---------- Data loading & search ----------
  async function loadDataOnce(field, rootCfg) {
    if (field._dataLoaded) return;

    let raw = null;

    if (Array.isArray(field.data)) {
        raw = field.data;
    } else if (field.dataUrl) {
        const fetchOpts = Object.assign({}, rootCfg.fetch, field.fetch || {});
        const res = await fetch(field.dataUrl, fetchOpts);
        if (!res.ok) throw new Error(`Fetch failed for ${field.dataUrl}`);
        raw = await res.json();
    } else {
        raw = [];
    }

    // 1) plocka ut listan från svaret via listPath
    const list = extractList(raw, field.listPath);

    // 2) mappa items -> standardformat
    const mapFn = typeof field.mapItem === "function"
        ? field.mapItem
        : (x) => ({ id: String(x.id ?? ""), label: String(x.label ?? ""), _raw: x });

    // 3) optional filter
    const filterFn = typeof field.filterItem === "function" ? field.filterItem : null;

    const items = Array.isArray(list) ? list.map(mapFn) : [];
    field._items = items
        .filter((x) => x && String(x.label || "").trim().length > 0)
        .filter((x) => (filterFn ? filterFn(x) : true));

    field._dataLoaded = true;

    // Fuse optional
    if (typeof global.Fuse !== "undefined") {
        const fuseOpts = Object.assign(
        {},
        rootCfg.fuseDefaults,
        field.fuse || {},
        { keys: field.keys || (field.fuse && field.fuse.keys) || ["label"] }
        );
        field._fuse = new global.Fuse(field._items, fuseOpts);
    } else {
        field._fuse = null;
    }
    }

    // Hjälpfunktion: path -> array
    function extractList(raw, listPath) {
    // Om ingen listPath: om raw redan är array, använd den; annars tomt.
    if (!listPath) return Array.isArray(raw) ? raw : [];

    // Stöd för t.ex. "schools" eller "data.schools"
    const parts = String(listPath).split(".").map((p) => p.trim()).filter(Boolean);

    let cur = raw;
    for (const p of parts) {
        if (cur && typeof cur === "object" && p in cur) cur = cur[p];
        else return [];
    }
    return Array.isArray(cur) ? cur : [];
    }


  function search(field, query, maxResults) {
    const q = String(query || "").trim();
    const items = field._items || [];
    const limit = Math.max(1, Number(maxResults || 8));

    if (!q) return items.slice(0, limit);

    if (field._fuse) {
      return field._fuse.search(q).slice(0, limit).map((r) => r.item);
    }

    // Fallback: simple includes on label
    const nq = normalizeText(q);
    return items
      .filter((it) => normalizeText(it.label).includes(nq))
      .slice(0, limit);
  }

  // ---------- Enhancement per field ----------
  function enhanceField(form, rootCfg, fieldCfg) {
    const labelEl = findLabelInForm(form, fieldCfg.targetLabel);
    if (!labelEl) return false;

    const wrapper = findFieldWrapperFromLabel(labelEl, form);
    if (!wrapper) return false;
    if (wrapper.dataset[`ssacEnhanced_${fieldCfg._key}`] === "1") return true;

    const carrier = findCarrierInput(wrapper);
    if (!carrier) return false;

    // Optional: remove "(Krävs)" from label if not required
    if (fieldCfg.removeRequiredSuffix && !fieldCfg.isRequired) {
      removeRequiredSuffixSafely(labelEl);
    }

    // Build UI and inject before carrier (so it inherits theme styling as you observed)
    const uiInput = buildUIInput(carrier, fieldCfg.placeholder || "Sök och välj…");
    const panel = buildPanel();

    carrier.parentElement.insertBefore(uiInput, carrier);
    // Panelen ska inte vara syskon direkt – den ska ligga i anchor under uiInput:
    mountPanelUnderInput(uiInput, panel);

    // Ensure wrapper is positioning context for dropdown
    const cs = global.getComputedStyle(wrapper);
    if (cs.position === "static") wrapper.style.position = "relative";

    // Hide carrier but keep in DOM for submit
    // (Adjust if your theme layout breaks)
    enforceCarrierHidden(carrier);


    // Per-field state
    const state = {
      selectedItem: null,
      isOpen: false,
      results: [],
      activeIndex: -1,
      disabled: false,
    };

    // Load data (async)
    loadDataOnce(fieldCfg, rootCfg)
      .catch((e) => {
        state.disabled = true;
        uiInput.disabled = true;
        uiInput.placeholder = fieldCfg.loadErrorPlaceholder || "Kunde inte ladda listan";
        if (rootCfg.debug) console.warn(e);
      });

    function openPanel() {
      if (state.disabled) return;
      if (!state.listEnabled) return;
      state.isOpen = true;
      panel.hidden = false;
    }
    function closePanel() {
      state.isOpen = false;
      panel.hidden = true;
      state.activeIndex = -1;
    }

    const panelApi = { wrapper, close: closePanel };
    if (SSAC_OPEN_PANELS) SSAC_OPEN_PANELS.add(panelApi);
    


    function updateResults() {
      if (!state.listEnabled) {
        state.results = [];
        renderPanel(panel, [], -1, fieldCfg.emptyText);
        return;
      }
      
      if (!fieldCfg._dataLoaded) {
        state.results = [];
        renderPanel(panel, [], -1, fieldCfg.emptyText);
        return;
      }
      state.results = search(fieldCfg, uiInput.value, fieldCfg.maxResults || 8);
      state.activeIndex = state.results.length ? 0 : -1;
      renderPanel(panel, state.results, state.activeIndex, fieldCfg.emptyText);
    }

    function clearSelectionOnType() {
      state.selectedItem = null;
    }

    function commitSelection(item) {
      state.selectedItem = item;
      uiInput.value = item.label;
      closePanel();
      // Note: do NOT write to carrier here (avoid “state fights”); do it just-in-time on submit.
    }

    function commitToCarrierForSubmit() {
      // Rules:
      // - If empty:
      //     - if isRequired false -> sentinel
      //     - if isRequired true  -> invalid (leave blank)
      // - If selected -> write submitValue (label/id/custom) to carrier

      const uiHasText = String(uiInput.value || "").trim().length > 0;

      if (state.freeTextMode) {
        const v = String(uiInput.value || "").trim();
        setNativeValue(carrier, v);
        dispatchInputEvents(carrier);
        return { ok: true, freeText: true };
      }


      if (state.selectedItem) {
        const submitValue =
          typeof fieldCfg.getSubmitValue === "function"
            ? fieldCfg.getSubmitValue(state.selectedItem)
            : (fieldCfg.submitValue === "id" ? state.selectedItem.id : state.selectedItem.label);

        setNativeValue(carrier, String(submitValue ?? ""));
        dispatchInputEvents(carrier);
        return { ok: true, sentinel: false };
      }

      if (!uiHasText) {
        if (fieldCfg.isRequired) {
          setNativeValue(carrier, "");
          dispatchInputEvents(carrier);
          return { ok: false, reason: "required_empty" };
        } else {
          setNativeValue(carrier, fieldCfg.sentinelValue || "__SS_EMPTY__");
          dispatchInputEvents(carrier);
          return { ok: true, sentinel: true };
        }
      }

      // Has typed text but no explicit selection
      setNativeValue(carrier, "");
      dispatchInputEvents(carrier);
      return { ok: false, reason: "typed_no_selection" };
    }


    // ---- Conditions / toggles (optional) ----
    function setEnabled(enabled) {
      state.disabled = !enabled;
      uiInput.disabled = !enabled;
      if (!enabled) closePanel();
    }

    function setFreeTextMode(on) {
      state.freeTextMode = !!on;
      if (state.freeTextMode) closePanel();
    }

    // default
    state.listEnabled = true;
    state.freeTextMode = false;

    // Bind condition controls only if configured
    const condBinding = bindConditionControls(form, fieldCfg, (controls) => {
      // Om du vill ge användaren full frihet, kan conditions vara en funktion:
      // fieldCfg.conditions({ controls, form, wrapper, uiInput, carrier, state })
      if (typeof fieldCfg.conditions === "function") {
        const res = fieldCfg.conditions({ controls, form, wrapper, uiInput, carrier, state }) || {};
        if (typeof res.enabled === "boolean") setEnabled(res.enabled);
        if (typeof res.freeTextMode === "boolean") setFreeTextMode(res.freeTextMode);

        if (typeof res.listEnabled === "boolean") {
          state.listEnabled = res.listEnabled;
          if (!state.listEnabled) closePanel();
        }

        if (res.clearSelection) {
          state.selectedItem = null;
          uiInput.value = "";
        }
        return;
      }

      // Om ingen conditions-funktion finns: gör inget (men du kan fortfarande använda helpern senare)
    });


    // UI events
    uiInput.addEventListener("input", () => {
      clearSelectionOnType();
      updateResults();
      openPanel();
    });

    uiInput.addEventListener("focus", () => {
      updateResults();
      openPanel();
    });

    uiInput.addEventListener("blur", () => {
      setTimeout(closePanel, 150); // allow click selection
    });

    uiInput.addEventListener("keydown", (e) => {
      if (panel.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        updateResults();
        openPanel();
      }
      if (panel.hidden) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (state.results.length) {
          state.activeIndex = Math.min(state.activeIndex + 1, state.results.length - 1);
          renderPanel(panel, state.results, state.activeIndex, fieldCfg.emptyText);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (state.results.length) {
          state.activeIndex = Math.max(state.activeIndex - 1, 0);
          renderPanel(panel, state.results, state.activeIndex, fieldCfg.emptyText);
        }
      } else if (e.key === "Enter") {
        if (state.activeIndex >= 0 && state.results[state.activeIndex]) {
          e.preventDefault();
          commitSelection(state.results[state.activeIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
      }
    });

    panel.addEventListener("mousedown", (e) => {
      const itemEl = e.target.closest(".ssac-item");
      if (!itemEl) return;
      const idx = Number(itemEl.dataset.ssacIndex);
      const item = state.results[idx];
      if (!item) return;
      commitSelection(item);
    });

    // Submit handler (capture: we run before most libs)
    form.addEventListener(
      "submit",
      (e) => {
        const res = commitToCarrierForSubmit();

        if (!res.ok) {
          // Squarespace kan re-rendera fältet efter submit → re-hide carrier
          setTimeout(() => enforceCarrierHidden(carrier), 0);
          requestAnimationFrame(() => enforceCarrierHidden(carrier));

          global.setTimeout(() => uiInput.focus(), 0);
          return;
        }
      },
      true
    );


    form.addEventListener(
      "invalid",
      (ev) => {
        if (ev.target === carrier) {
          // Nästa tick + nästa frame brukar vinna över deras DOM-justeringar
          setTimeout(() => enforceCarrierHidden(carrier), 0);
          requestAnimationFrame(() => enforceCarrierHidden(carrier));
        }
      },
      true
    );




    wrapper.dataset[`ssacEnhanced_${fieldCfg._key}`] = "1";
    return true;
  }

  // ---------- Main init ----------
  function init(userCfg) {
    const cfg = deepMerge({}, DEFAULTS, userCfg || {});
    if (!Array.isArray(cfg.fields)) cfg.fields = [];

    // Key fields so we can mark enhanced safely
    cfg.fields = cfg.fields.map((f, idx) => {
      const ff = Object.assign({}, f);
      ff._key = String(ff.key || ff.targetLabel || idx);
      ff.isRequired = !!ff.isRequired;
      ff.removeRequiredSuffix = ff.removeRequiredSuffix !== false;
      ff.submitValue = ff.submitValue || "label";
      ff.sentinelValue = ff.sentinelValue || "__SS_EMPTY__";
      ff.maxResults = ff.maxResults || 8;
      return ff;
    });

    SSAC_OPEN_PANELS = new Set();
    bindOutsideClickOnce();


    // Enhance any existing forms
    global.document.querySelectorAll("form").forEach((form) => {
      for (const f of cfg.fields) enhanceField(form, cfg, f);
      form.dataset.ssacInit = "1";
    });

    // Observe new nodes (popup forms)
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;

          const forms = node.matches("form")
            ? [node]
            : Array.from(node.querySelectorAll ? node.querySelectorAll("form") : []);

          for (const form of forms) {
            for (const f of cfg.fields) enhanceField(form, cfg, f);
            form.dataset.ssacInit = "1";
          }
        }
      }
    });
  
    const rootNode = global.document.body || global.document.documentElement;
    if (!rootNode) {
      global.document.addEventListener("DOMContentLoaded", () => {
        const rn = global.document.body || global.document.documentElement;
        if (rn) obs.observe(rn, cfg.observer);
      }, { once: true });
    } else {
      obs.observe(rootNode, cfg.observer);
    }

    log(cfg, "Initialized with fields:", cfg.fields.map((x) => x._key));
    
    return {
      destroy: () => {
        obs.disconnect();
        if (SSAC_OPEN_PANELS) SSAC_OPEN_PANELS.clear();
        SSAC_OPEN_PANELS = null;
        unbindOutsideClickIfAny();
      }
    };
  }

  // ---------- Deep merge ----------
  function deepMerge(target, ...sources) {
    for (const src of sources) {
      if (!src || typeof src !== "object") continue;
      for (const k of Object.keys(src)) {
        const v = src[k];
        if (Array.isArray(v)) target[k] = v.slice();
        else if (v && typeof v === "object") {
          if (!target[k] || typeof target[k] !== "object") target[k] = {};
          deepMerge(target[k], v);
        } else target[k] = v;
      }
    }
    return target;
  }

  // Export
  global.SSAutocomplete = { init };
})(window);