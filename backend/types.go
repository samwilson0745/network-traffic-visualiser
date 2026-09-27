package main

import "time"

// PacketMeta is the packet-level metadata sent by the collector.
type PacketMeta struct {
	Timestamp       time.Time `json:"timestamp"`
	SourceIP        string    `json:"source_ip"`
	DestinationIP   string    `json:"destination_ip"`
	SourcePort      int       `json:"source_port"`
	DestinationPort int       `json:"destination_port"`
	Protocol        string    `json:"protocol"`
	PacketSize      int       `json:"packet_size"`
}

// FlowKey identifies an aggregated flow between a known system and a destination.
type FlowKey struct {
	Source      string
	Destination string
	Protocol    string
}

// Flow holds running totals for a single aggregated flow.
type Flow struct {
	Source      string    `json:"source"`
	Destination string    `json:"destination"`
	Protocol    string    `json:"protocol"`
	Packets     int64     `json:"packets"`
	Bytes       int64     `json:"bytes"`
	FirstSeen   time.Time `json:"first_seen"`
	LastSeen    time.Time `json:"last_seen"`
}

// FlowEvent is the JSON representation of a flow sent to the frontend.
type FlowEvent struct {
	ID              string  `json:"id"`
	Source          string  `json:"source"`
	Destination     string  `json:"destination"`
	Protocol        string  `json:"protocol"`
	Packets         int64   `json:"packets"`
	Bytes           int64   `json:"bytes"`
	FirstSeen       string  `json:"first_seen"`
	LastSeen        string  `json:"last_seen"`
	DurationSeconds float64 `json:"duration_seconds"`
}

// Stats summarizes global traffic statistics for the current snapshot.
type Stats struct {
	TotalPackets    int64   `json:"total_packets"`
	TotalBytes      int64   `json:"total_bytes"`
	ActiveFlows     int     `json:"active_flows"`
	TrafficRateBps  float64 `json:"traffic_rate_bytes_per_sec"`
	TopDestination  string  `json:"top_destination"`
	TopSource       string  `json:"top_source"`
}

// Snapshot is the message broadcast to frontend clients over /ws.
type Snapshot struct {
	Type  string      `json:"type"`
	Flows []FlowEvent `json:"flows"`
	Stats Stats       `json:"stats"`
}
