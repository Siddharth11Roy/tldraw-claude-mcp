import React, { useCallback, useEffect, useRef, useState } from "react";
import { Tldraw, Editor } from "tldraw";
import "tldraw/tldraw.css";
import { BridgeClient } from "./bridgeClient.js";
import { makeAdapter } from "./tldrawAdapter.js";

type Status = "connecting" | "connected" | "drawing";

export function App() {
  const [status, setStatus] = useState<Status>("connecting");
  const clientRef = useRef<BridgeClient | null>(null);
  const flashTimer = useRef<number | null>(null);

  const handleMount = useCallback((editor: Editor) => {
    const adapter = makeAdapter(editor);

    // Briefly show "drawing" so the user can see the canvas is being driven,
    // which matters when a large diagram lands all at once.
    const flash = () => {
      setStatus("drawing");
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setStatus("connected"), 600);
    };

    const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const client = new BridgeClient(wsUrl, {
      onCreate: (shapes) => adapter.create(shapes),
      onConnect: (connections) => adapter.connect(connections),
      onUpdate: (updates) => adapter.update(updates),
      onDelete: (ids) => adapter.remove(ids),
      onClear: () => adapter.clear(),
      onFit: () => adapter.fit(),
      onQuery: () => adapter.snapshot(),
      onActivity: flash
    });
    client.start();
    clientRef.current = client;
    setStatus("connected");
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      clientRef.current?.stop();
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw onMount={handleMount} persistenceKey="tldraw-mcp" />
      <div style={{ ...badgeStyle, background: BADGE_COLOR[status] }}>
        tldraw MCP · {status}
      </div>
    </div>
  );
}

const BADGE_COLOR: Record<Status, string> = {
  connecting: "rgba(120,120,120,0.85)",
  connected: "rgba(0,0,0,0.7)",
  drawing: "rgba(22,120,60,0.9)"
};

const badgeStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 12,
  right: 12,
  zIndex: 1000,
  color: "white",
  padding: "4px 10px",
  borderRadius: 6,
  fontFamily: "system-ui",
  fontSize: 12,
  pointerEvents: "none",
  transition: "background 200ms"
};
