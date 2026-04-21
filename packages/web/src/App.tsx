import React, { useCallback, useRef, useState } from "react";
import { Tldraw, Editor } from "tldraw";
import "tldraw/tldraw.css";
import { BridgeClient } from "./bridgeClient.js";
import { makeAdapter } from "./tldrawAdapter.js";

export function App() {
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const adapterRef = useRef<ReturnType<typeof makeAdapter> | null>(null);

  const handleMount = useCallback((editor: Editor) => {
    const adapter = makeAdapter(editor);
    adapterRef.current = adapter;
    const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const client = new BridgeClient(wsUrl, {
      onCreate: (shapes) => { setStatus("connected"); return adapter.create(shapes); },
      onUpdate: (updates) => { setStatus("connected"); adapter.update(updates); },
      onDelete: (ids) => { setStatus("connected"); adapter.remove(ids); },
      onQuery: () => { setStatus("connected"); return adapter.snapshot(); }
    });
    client.start();
    setStatus("connected");
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw onMount={handleMount} />
      <div style={badgeStyle}>tldraw MCP · {status}</div>
    </div>
  );
}

const badgeStyle: React.CSSProperties = {
  position: "fixed", bottom: 12, right: 12, zIndex: 1000,
  background: "rgba(0,0,0,0.7)", color: "white",
  padding: "4px 10px", borderRadius: 6, fontFamily: "system-ui", fontSize: 12
};
