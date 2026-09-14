/**
 * injector.js — content-script (isolated world).
 *
 * Re-runs on every page load, so the toolbar survives navigations that wipe
 * DOM-injected overlays (route changes, link clicks, reloads). Injects the
 * real toolbar into the page world, which shares the pick-queue contract
 * (`window.__opencodePickQueue`, `window.__opencodeFlow`,
 * `window.__opencodeRecording`) with the opencode browser-flow plugin.
 */
(() => {
  if (!/^(https?|file):/.test(location.protocol)) return;
  // Marker in the DOM so the plugin/host can verify the extension ran here.
  if (document.documentElement) document.documentElement.dataset.opencodeExt = "1";
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "opencode-arm-select" || message?.type === "opencode-record" || message?.type === "opencode-clear-picks") {
      window.postMessage({
        __opencodeSidePanel: true,
        command: message.type === "opencode-arm-select" ? "select" : message.type === "opencode-clear-picks" ? "clear-picks" : "record",
        recording: message.recording,
      }, "*");
    }
  });
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.__opencodePick) {
      chrome.runtime.sendMessage({ type: "opencode-pick", pick: event.data.__opencodePick });
    }
    if (event.data?.__opencodeFlowEvent) {
      chrome.runtime.sendMessage({ type: "opencode-flow-event", event: event.data.__opencodeFlowEvent });
    }
  });
  chrome.storage.local.get({ recording: false }, ({ recording }) => {
    if (recording) window.postMessage({ __opencodeSidePanel: true, command: "record", recording: true }, "*");
  });
  if (document.getElementById("__opencode_browser_overlay__")) return;
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("toolbar.js");
  script.dataset.source = "extension";
  (document.documentElement || document.head || document.body).appendChild(script);
})();
