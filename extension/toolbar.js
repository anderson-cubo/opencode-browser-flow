/**
 * toolbar.js — page-world toolbar for the opencode browser companion extension.
 *
 * Runs in the page itself (injected by injector.js), so it reads/writes the
 * same contract the opencode browser-flow plugin polls over CDP:
 *   window.__opencodePickQueue  — picked elements [{t,selector,tag,text,rect,url}]
 *   window.__opencodePicked     — last pick
 *   window.__opencodeFlow       — flow events (picks, user clicks/inputs)
 *   window.__opencodeRecording  — flow recording flag (Record button toggles)
 *   window.__opencodeShotRequested — Shot button sets this flag
 *   window.__opencodeResizeRequest  — Resize button cycles widths here
 *
 * NOTE: the plugin's embedded overlay (overlaySource in browser-flow-plugin.ts)
 * is a fallback copy of this logic for browsers without the extension.
 * Keep the two in sync when changing behavior or the window.* contract.
 */
(() => {
  const ID = "__opencode_browser_overlay__";
  if (document.getElementById(ID)) return "already-visible";
  const SOURCE = (document.currentScript && document.currentScript.dataset.source) || "extension";

  const bar = document.createElement("div");
  bar.id = ID;
  bar.setAttribute("data-opencode-overlay", "1");
  bar.dataset.source = SOURCE;
  bar.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;gap:6px;align-items:center;background:rgba(17,17,27,.92);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px 10px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35)";
  const label = document.createElement("span");
  label.textContent = "opencode";
  label.style.cssText = "opacity:.75;margin-right:2px";
  bar.appendChild(label);
  const mk = (text, title) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.title = title;
    b.style.cssText =
      "cursor:pointer;border:1px solid rgba(255,255,255,.25);background:#2b2b40;color:#fff;border-radius:7px;padding:4px 8px;font-size:12px";
    bar.appendChild(b);
    return b;
  };
  const status = document.createElement("span");
  status.style.cssText =
    "opacity:.8;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  bar.appendChild(status);
  const say = (t) => {
    status.textContent = t;
  };

  window.__opencodeFlow = window.__opencodeFlow || [];
  window.__opencodeRecording = window.__opencodeRecording || false;
  const restored = window.__opencodeRestoredPicks || [];
  const existingKeys = new Set((window.__opencodePickQueue || []).map((pick) => `${pick.t}|${pick.selector}|${pick.url}`));
  window.__opencodePickQueue = [...(window.__opencodePickQueue || []), ...restored.filter((pick) => !existingKeys.has(`${pick.t}|${pick.selector}|${pick.url}`))];
  window.__opencodePickQueue = Array.from(new Map(window.__opencodePickQueue.map((pick) => [`${pick.t}|${pick.selector}|${pick.url}`, pick])).values());
  window.__opencodeRestoredPicks = [];

  // Side-panel commands arrive through the content script, while this
  // page-world toolbar owns the actual DOM inspector.
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data?.__opencodeSidePanel) return;
    if (event.data.command === "select") armInspector();
    if (event.data.command === "record") {
      window.__opencodeRecording = Boolean(event.data.recording);
      window.__opencodeFlow = window.__opencodeFlow || [];
    }
    if (event.data.command === "restore-picks") {
      window.__opencodePickQueue = [...(window.__opencodePickQueue || []), ...(event.data.picks || [])];
    }
    if (event.data.command === "clear-picks") window.__opencodePickQueue = [];
  });

  const cssPath = (el) => {
    if (!el || el === document.body) return "body";
    const parts = [];
    let node = el;
    while (node && node !== document.body && parts.length < 6) {
      let sel = node.tagName.toLowerCase();
      if (node.id) {
        sel += "#" + CSS.escape(node.id);
        parts.unshift(sel);
        break;
      }
      const cls =
        node.className && typeof node.className === "string"
          ? node.className.trim().split(/\s+/).slice(0, 2).map((c) => "." + CSS.escape(c)).join("")
          : "";
      const sib = node.parentElement
        ? Array.from(node.parentElement.children).filter((c) => c.tagName === node.tagName)
        : [];
      const idx = sib.length > 1 ? ":nth-of-type(" + (sib.indexOf(node) + 1) + ")" : "";
      parts.unshift(sel + cls + idx);
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  // Multi-pick inspector: every click queues a pick, Esc/right-click finishes.
  const armInspector = () => {
    say("picking… click elements (Esc/right-click to finish)");
    const picked = [];
    const inBar = (el) => el === bar || bar.contains(el);
    const hover = (e) => {
      const el = e.target;
      if (el && !inBar(el) && !picked.includes(el)) {
        el.setAttribute("data-opencode-hover", "1");
        try {
          el.style.outline = "2px solid #7c5cff";
        } catch {}
      }
    };
    const out = (e) => {
      const el = e.target;
      if (el && !picked.includes(el)) {
        try {
          el.style.outline = "";
          el.removeAttribute("data-opencode-hover");
        } catch {}
      }
    };
    const cancel = () => {
      document.removeEventListener("mouseover", hover, true);
      document.removeEventListener("mouseout", out, true);
      document.removeEventListener("click", pick, true);
      document.removeEventListener("keydown", esc, true);
      document.removeEventListener("contextmenu", finish, true);
      for (const el of document.querySelectorAll("[data-opencode-hover]")) {
        if (!picked.includes(el)) {
          try {
            el.style.outline = "";
            el.removeAttribute("data-opencode-hover");
          } catch {}
        }
      }
      say(picked.length ? "picked " + picked.length + " — queued for opencode" : "");
    };
    const finish = (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };
    const esc = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    const pick = (e) => {
      const el = e.target;
      if (inBar(el)) return;
      e.preventDefault();
      e.stopPropagation();
      picked.push(el);
      try {
        el.style.outline = "2px solid #22c55e";
        el.removeAttribute("data-opencode-hover");
      } catch {}
      const r = el.getBoundingClientRect();
      const info = {
        t: Date.now(),
        type: "pick",
        selector: cssPath(el),
        tag: el.tagName,
        text: (el.innerText || "").slice(0, 200),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        url: location.href,
      };
      window.__opencodePicked = info;
      window.__opencodePickQueue.push(info);
      window.__opencodeFlow.push(info);
      window.postMessage({ __opencodePick: info }, "*");
      say("picked " + picked.length + ": " + info.selector.slice(0, 50));
    };
    document.addEventListener("mouseover", hover, true);
    document.addEventListener("mouseout", out, true);
    document.addEventListener("click", pick, true);
    document.addEventListener("keydown", esc, true);
    document.addEventListener("contextmenu", finish, true);
  };

  // In-page flow recorder: captures real user clicks/inputs while watching.
  if (!window.__opencodeRecorderInstalled) {
    window.__opencodeRecorderInstalled = true;
    const push = (entry) => {
      if (window.__opencodeRecording) {
        const event = { t: Date.now(), ...entry };
        window.__opencodeFlow.push(event);
        window.postMessage({ __opencodeFlowEvent: event }, "*");
      }
    };
    document.addEventListener(
      "click",
      (e) => {
        const el = e.target;
        push({ type: "user-click", selector: cssPath(el), text: (el.innerText || el.value || "").slice(0, 200) });
      },
      true,
    );
    document.addEventListener(
      "input",
      (e) => {
        const el = e.target;
        push({ type: "user-input", selector: cssPath(el), value: String(el.value || "").slice(0, 200) });
      },
      true,
    );
    document.addEventListener(
      "submit",
      (e) => {
        push({ type: "user-submit", selector: cssPath(e.target) });
      },
      true,
    );
  }

  mk("Select", "Pick elements (hover highlights, each click queues, Esc finishes)").onclick = armInspector;
  mk("Resize", "Cycle viewport 1280 / 390 / 768 wide").onclick = () => {
    const sizes = [1280, 390, 768];
    const i = (window.__opencodeSizeIdx = ((window.__opencodeSizeIdx ?? 0) + 1) % sizes.length);
    window.__opencodeResizeRequest = sizes[i];
    say("resize → " + sizes[i] + "px (agent applies)");
  };
  const recBtn = mk("Record", "Toggle flow recording");
  const paint = () => {
    recBtn.textContent = window.__opencodeRecording ? "Stop ●" : "Record";
  };
  paint();
  recBtn.onclick = () => {
    window.__opencodeRecording = !window.__opencodeRecording;
    paint();
    say(window.__opencodeRecording ? "recording…" : "paused");
  };
  mk("Shot", "Ask the agent for a screenshot").onclick = () => {
    window.__opencodeShotRequested = true;
    say("screenshot requested");
  };

  // In the companion extension the browser side panel is the permanent UI;
  // keep the page clean and expose only the inspector/recording bridge.
  // The standalone/plugin fallback still gets the bottom toolbar.
  if (SOURCE !== "extension") document.documentElement.appendChild(bar);
  return "visible";
})();
