import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./sidepanel.css";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";

type Pick = { selector: string; tag: string; text?: string; url?: string; t?: number };
type FlowEvent = { type?: string; selector?: string; value?: string; text?: string; url?: string; t?: number };

const Bubble = ({ pick, index }: { pick: Pick; index: number }) => (
  <article className="bubble" style={{ animationDelay: `${index * 35}ms` }}>
    <div className="bubble-dot" />
    <strong>{pick.selector}</strong>
    <small>{pick.tag} {pick.text ? `· ${pick.text}` : ""}</small>
    <small className="url">{pick.url || "Current page"}</small>
  </article>
);

function App() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [flowEvents, setFlowEvents] = useState<FlowEvent[]>([]);
  const [site, setSite] = useState("No active page");
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Select something in the page to send it here.");

  const refresh = async () => {
    const data = await chrome.storage.local.get({ picks: [], flowEvents: [], recording: false });
    setPicks(data.picks as Pick[]);
    setFlowEvents(data.flowEvents as FlowEvent[]);
    setRecording(Boolean(data.recording));
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    setSite(active?.url || "No active page");
  };

  const send = async (message: unknown) => {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!active?.id) throw new Error("No active page tab");
    await chrome.tabs.sendMessage(active.id, message);
  };

  useEffect(() => {
    void refresh();
    const changed = () => void refresh();
    chrome.storage.onChanged.addListener(changed);
    chrome.tabs.onActivated.addListener(changed);
    chrome.tabs.onUpdated.addListener(changed);
    return () => {
      chrome.storage.onChanged.removeListener(changed);
      chrome.tabs.onActivated.removeListener(changed);
      chrome.tabs.onUpdated.removeListener(changed);
    };
  }, []);

  const select = async () => {
    try { await send({ type: "opencode-arm-select" }); setStatus("Click one or more elements; press Escape when finished."); }
    catch (error) { setStatus((error as Error).message); }
  };

  const toggleRecord = async () => {
    const next = !recording;
    setRecording(next);
    await chrome.storage.local.set({ recording: next });
    setStatus(next ? "Flow recording is live across navigation." : "Flow recording paused.");
    try { await send({ type: "opencode-record", recording: next }); } catch {}
  };

  const clear = async () => {
    await chrome.storage.local.set({ picks: [], flowEvents: [] });
    try { await send({ type: "opencode-clear-picks" }); } catch {}
    setStatus("Pick storage cleared.");
  };

  const sendToOpencode = async () => {
    if (!picks.length) { setStatus("Select an element first."); return; }
    try {
      const response = await fetch("http://127.0.0.1:39173/picks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ picks }),
      });
      if (!response.ok) throw new Error(`Bridge returned HTTP ${response.status}`);
      setStatus(`${picks.length} selection bubble${picks.length === 1 ? "" : "s"} sent to opencode chat.`);
    } catch (error) {
      setStatus(`Start /browser first, then retry: ${(error as Error).message}`);
    }
  };

  return (
    <div className="panel-shell">
      <header className="topbar">
        <div><div className="eyebrow">CONNECTED TOOLING</div><h1>Browser flow</h1></div>
        <Badge className={`live-pill ${recording ? "active" : ""}`}><i />{recording ? "LIVE" : "READY"}</Badge>
      </header>
      <div className="site-row" title={site}><span className="globe">◉</span>{site}</div>
      <Card className="command-card">
        <div className="command-copy"><span className="command-icon">⌁</span><div><strong>Point at the UI</strong><small>Pick targets from the active page</small></div></div>
        <Button className="accent" onClick={select}>Select</Button>
      </Card>
      <div className="toolbar-row">
        <Button className={recording ? "danger" : ""} onClick={toggleRecord}><span className="record-dot" />{recording ? "Stop flow" : "Watch flow"}</Button>
        <Button onClick={clear}>Clear</Button>
      </div>
      <div className="status-bubble"><span className="spark">✦</span>{status}</div>
      {recording && <section className="recording-card"><div className="recording-wave"><i /><i /><i /><i /><i /></div><div><strong>Watching this flow</strong><small>{flowEvents.length} action bubble{flowEvents.length === 1 ? "" : "s"} captured across pages</small></div><span className="recording-pulse" /></section>}
      <section className="section-heading"><div><span className="eyebrow">SAVED CONTEXT</span><h2>Selected elements <em>{picks.length}</em></h2></div><Badge className="storage">● persisted</Badge></section>
      <main className="bubble-list">{picks.length ? picks.map((pick, i) => <Bubble key={`${pick.t}-${i}`} pick={pick} index={i} />) : <div className="empty-state"><span>◎</span><p>Your selected elements will<br />bubble up here.</p></div>}</main>
      {flowEvents.length > 0 && <section className="flow-list"><div className="eyebrow">FLOW BUBBLES</div>{flowEvents.slice(-8).map((event, i) => <div className="flow-bubble" key={`${event.t}-${i}`}><span className="flow-icon">↳</span><span><strong>{event.type || "action"}</strong><small>{event.selector || event.text || event.value || "page interaction"}</small></span></div>)}</section>}
      <footer className="footer-note"><button className="button send-button" onClick={sendToOpencode}>Send bubbles to opencode</button><span>↗</span> Picks persist across Reddit, Google, routes, tabs, and browser restarts.</footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
