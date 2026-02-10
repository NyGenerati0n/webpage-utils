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

  function stripRequiredSuffix(labelText) {
    return String(labelText ?? "")
      .replace(/\(\s*krävs\s*\)/ig, "")
      .replace(/\(\s*required\s*\)/ig, "")
      .replace(/\s+/g, " ")
      .trim();
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

  function closestForm(startEl) {
    if (!startEl) return null;
    const direct = startEl.closest && startEl.closest("form");
    if (direct) return direct;

    const dialog = startEl.closest
      ? startEl.closest('[role="dialog"],[aria-modal="true"]')
      : null;
    if (dialog) {
      const f = dialog.querySelector("form");
      if (f) return f;
    }
    return null;
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

  function findLabelWrapper(wrapper, labelEl) {
    // Heuristic: label's parent often holds required suffix/error in many themes.
    return labelEl && labelEl.parentElement ? labelEl.parentElement : wrapper;
  }

  // ---------- Error rendering ----------
  function ensureErrorEl(labelWrapper) {
    let err = labelWrapper.querySelector(".ssac-error");
    if (!err) {
      err = document.createElement("p");
      err.className = "ssac-error";
      // Put it early so it matches common “error under label” patterns
      const firstP = labelWrapper.querySelector("p");
      if (firstP) labelWrapper.insertBefore(err, firstP);
      else labelWrapper.appendChild(err);
    }
    return err;
  }

  function showError(wrapper, carrier, labelWrapper, msg) {
    const err = ensureErrorEl(labelWrapper);
    err.textContent = msg;
    err.style.display = "";
    carrier.setAttribute("aria-invalid", "true");
    wrapper.dataset.ssacInvalid = "1";
  }

  function clearError(wrapper, carrier, labelWrapper) {
    const err = labelWrapper.querySelector(".ssac-error");
    if (err) {
      err.textContent = "";
      err.style.display = "none";
    }
    carrier.removeAttribute("aria-invalid");
    delete wrapper.dataset.ssacInvalid;
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
      const orig = labelEl.textContent;
      const stripped = stripRequiredSuffix(orig);
      if (stripped !== orig) labelEl.textContent = stripped;
    }

    const labelWrapper = findLabelWrapper(wrapper, labelEl);

    // Build UI and inject before carrier (so it inherits theme styling as you observed)
    const uiInput = buildUIInput(carrier, fieldCfg.placeholder || "Sök och välj…");
    const panel = buildPanel();

    carrier.parentElement.insertBefore(uiInput, carrier);
    carrier.parentElement.insertBefore(panel, carrier);

    // Ensure wrapper is positioning context for dropdown
    const cs = global.getComputedStyle(wrapper);
    if (cs.position === "static") wrapper.style.position = "relative";

    // Hide carrier but keep in DOM for submit
    // (Adjust if your theme layout breaks)
    carrier.style.position = "absolute";
    carrier.style.opacity = "0";
    carrier.style.pointerEvents = "none";
    carrier.style.height = "0";
    carrier.style.margin = "0";
    carrier.style.padding = "0";
    carrier.style.border = "0";

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
      })
      .finally(() => {
        // no-op
      });

    function openPanel() {
      if (state.disabled) return;
      state.isOpen = true;
      panel.hidden = false;
    }
    function closePanel() {
      state.isOpen = false;
      panel.hidden = true;
      state.activeIndex = -1;
    }
    function updateResults() {
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
      clearError(wrapper, carrier, labelWrapper);
      closePanel();
      // Note: do NOT write to carrier here (avoid “state fights”); do it just-in-time on submit.
    }

    function commitToCarrierForSubmit() {
      // Rules:
      // - Must explicitly select if there's any text (requireExplicitSelection = true)
      // - If empty:
      //     - if isRequired false -> sentinel
      //     - if isRequired true  -> invalid (leave blank)
      // - If selected -> write submitValue (label/id/custom) to carrier

      const uiHasText = String(uiInput.value || "").trim().length > 0;

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

    // Close if click outside wrapper
    global.document.addEventListener(
      "mousedown",
      (e) => {
        if (!wrapper.contains(e.target)) closePanel();
      },
      true
    );

    // Submit handler (capture: we run before most libs)
    form.addEventListener(
      "submit",
      (e) => {
        const res = commitToCarrierForSubmit();

        if (!res.ok) {
          e.preventDefault();
          e.stopPropagation();

          const msg =
            res.reason === "typed_no_selection"
              ? (fieldCfg.errorText || "Välj ett alternativ från listan.")
              : (fieldCfg.requiredErrorText || "Det här fältet är obligatoriskt.");

          showError(wrapper, carrier, labelWrapper, msg);
          uiInput.focus();
        } else {
          clearError(wrapper, carrier, labelWrapper);
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
    obs.observe(global.document.body, cfg.observer);

    log(cfg, "Initialized with fields:", cfg.fields.map((x) => x._key));
    return { destroy: () => obs.disconnect() };
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