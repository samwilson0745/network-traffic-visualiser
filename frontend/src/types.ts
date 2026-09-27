export interface FlowEvent {
  id: string;
  source: string;
  destination: string;
  protocol: string;
  packets: number;
  bytes: number;
  first_seen: string;
  last_seen: string;
  duration_seconds: number;
}

export interface Stats {
  total_packets: number;
  total_bytes: number;
  active_flows: number;
  traffic_rate_bytes_per_sec: number;
  top_destination: string;
  top_source: string;
}

export interface Snapshot {
  type: "snapshot";
  flows: FlowEvent[];
  stats: Stats;
}
