import { useCallback, useEffect, useRef, useState } from "react";
import Graph from "./Graph";
import type { FlowEvent, Snapshot, Stats } from "./types";

const WS_URL =
  (import.meta.env.VITE_BACKEND_WS_URL as string | undefined) ??
  `ws://${window.location.hostname}:8080/ws`;

const PROTOCOL_COLORS: Record<string, string> = {
  TCP: "var(--proto-tcp)",
  UDP: "var(--proto-udp)",
};

function protocolColor(protocol: string): string {
  return PROTOCOL_COLORS[protocol] ?? "var(--proto-other)";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ProtocolBadge({ protocol }: { protocol: string }) {
  const color = protocolColor(protocol);
  return (
    <span className="protocol-badge" style={{ color }}>
      <span className="dot" style={{ background: color }} />
      {protocol}
    </span>
  );
}

function NetworkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="4" r="2.5" fill="currentColor" />
      <circle cx="4" cy="18" r="2.5" fill="currentColor" opacity="0.55" />
      <circle cx="20" cy="18" r="2.5" fill="currentColor" opacity="0.55" />
      <path d="M12 6.5V12M12 12L5.2 16M12 12L18.8 16" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export default function App() {
  const [flows, setFlows] = useState<FlowEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<FlowEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => !cancelled && setConnected(true);
      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        retryTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => {
        const snapshot: Snapshot = JSON.parse(event.data);
        setFlows(snapshot.flows);
        setStats(snapshot.stats);
      };
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, []);

  const onSelectFlow = useCallback((flow: FlowEvent | null) => setSelectedFlow(flow), []);

  const sortedFlows = [...flows].sort((a, b) => b.bytes - a.bytes);

  return (
    <div className="app">
      <div className="main">
        <header className="header">
          <div className="header-title">
            <NetworkIcon />
            <div>
              <h1>Docker Network Traffic Visualizer</h1>
              <p className="header-subtitle">Live flows between Dockerized systems and the internet</p>
            </div>
          </div>
          <span className="status-pill">
            <span className={`status-dot ${connected ? "live" : "down"}`} />
            {connected ? "Live" : "Reconnecting…"}
          </span>
        </header>

        <div className="graph-shell">
          <Graph flows={flows} onSelectFlow={onSelectFlow} selectedFlowId={selectedFlow?.id ?? null} />

          <div className="graph-legend">
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: "var(--series-system)" }} />
              Dockerized system
            </span>
            <span className="legend-item">
              <span className="legend-swatch" style={{ background: "var(--series-destination)" }} />
              Internet destination
            </span>
            <span className="legend-item">
              <span className="legend-swatch line" style={{ background: "var(--proto-tcp)" }} />
              TCP
            </span>
            <span className="legend-item">
              <span className="legend-swatch line" style={{ background: "var(--proto-udp)" }} />
              UDP
            </span>
            <span className="legend-item">
              <span className="legend-swatch line" style={{ background: "var(--proto-other)" }} />
              Other
            </span>
          </div>
        </div>
      </div>

      <aside className="sidebar">
        <section className="panel">
          <h2 className="panel-title">Traffic Statistics</h2>
          {stats ? (
            <div className="stat-grid">
              <div className="stat-cell">
                <div className="stat-label">Total packets</div>
                <div className="stat-value">{stats.total_packets.toLocaleString()}</div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Total bytes</div>
                <div className="stat-value">{formatBytes(stats.total_bytes)}</div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Active flows</div>
                <div className="stat-value">{stats.active_flows}</div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Traffic rate</div>
                <div className="stat-value">{formatBytes(stats.traffic_rate_bytes_per_sec)}/s</div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Top destination</div>
                <div className="stat-value wide">{stats.top_destination || "—"}</div>
              </div>
              <div className="stat-cell">
                <div className="stat-label">Top source</div>
                <div className="stat-value wide">{stats.top_source || "—"}</div>
              </div>
            </div>
          ) : (
            <p className="empty-hint">Waiting for data…</p>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">Flow Detail</h2>
          {selectedFlow ? (
            <div className="detail-rows">
              <div className="detail-row">
                <span className="k">Source</span>
                <span className="v">{selectedFlow.source}</span>
              </div>
              <div className="detail-row">
                <span className="k">Destination</span>
                <span className="v">{selectedFlow.destination}</span>
              </div>
              <div className="detail-row">
                <span className="k">Protocol</span>
                <span className="v"><ProtocolBadge protocol={selectedFlow.protocol} /></span>
              </div>
              <div className="detail-row">
                <span className="k">Packets</span>
                <span className="v">{selectedFlow.packets.toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span className="k">Bytes</span>
                <span className="v">{formatBytes(selectedFlow.bytes)}</span>
              </div>
              <div className="detail-row">
                <span className="k">First seen</span>
                <span className="v">{selectedFlow.first_seen}</span>
              </div>
              <div className="detail-row">
                <span className="k">Last seen</span>
                <span className="v">{selectedFlow.last_seen}</span>
              </div>
              <div className="detail-row">
                <span className="k">Duration</span>
                <span className="v">{selectedFlow.duration_seconds.toFixed(1)}s</span>
              </div>
            </div>
          ) : (
            <p className="empty-hint">Click a connection to see details.</p>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">Active Flows</h2>
          {sortedFlows.length === 0 ? (
            <p className="empty-hint">No flows yet.</p>
          ) : (
            <ul className="flow-list">
              {sortedFlows.map((flow) => (
                <li
                  key={flow.id}
                  onClick={() => setSelectedFlow(flow)}
                  className={`flow-row ${selectedFlow?.id === flow.id ? "selected" : ""}`}
                >
                  <ProtocolBadge protocol={flow.protocol} />
                  <span className="route">
                    {flow.source} → {flow.destination}
                  </span>
                  <span className="bytes">{formatBytes(flow.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
