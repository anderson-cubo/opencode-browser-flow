chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "opencode-pick") {
    chrome.storage.local.get({ picks: [] }, ({ picks }) => {
      const key = (pick) => `${pick.t}|${pick.selector}|${pick.url}`;
      const known = new Set(picks.map(key));
      const next = known.has(key(message.pick)) ? picks : [...picks, message.pick].slice(-500);
      chrome.storage.local.set({ picks: next }, () => sendResponse({ ok: true }));
    });
    return true;
  }
  if (message?.type === "opencode-flow-event") {
    chrome.storage.local.get({ flowEvents: [] }, ({ flowEvents }) => {
      chrome.storage.local.set({ flowEvents: [...flowEvents, message.event].slice(-500) }, () => sendResponse({ ok: true }));
    });
    return true;
  }
  return false;
});
