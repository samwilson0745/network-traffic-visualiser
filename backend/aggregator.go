package main

import (
	"fmt"
	"sync"
	"time"
)

// Aggregator groups packet metadata into flows keyed by (source system, destination, protocol).
type Aggregator struct {
	mu          sync.Mutex
	flows       map[FlowKey]*Flow
	systemIPs   map[string]string // ip -> friendly name
	idleTimeout time.Duration

	totalPacketsWindow int64
	totalBytesWindow   int64
	totalPacketsAll    int64
	totalBytesAll      int64
}

func NewAggregator(systemIPs map[string]string, idleTimeout time.Duration) *Aggregator {
	return &Aggregator{
		flows:       make(map[FlowKey]*Flow),
		systemIPs:   systemIPs,
		idleTimeout: idleTimeout,
	}
}

// Ingest folds a single packet into its flow, if it involves a known system.
func (a *Aggregator) Ingest(pkt PacketMeta) {
	var source, destination string

	if name, ok := a.systemIPs[pkt.SourceIP]; ok {
		source = name
		destination = pkt.DestinationIP
	} else if name, ok := a.systemIPs[pkt.DestinationIP]; ok {
		source = name
		destination = pkt.SourceIP
	} else {
		return // not related to any of our monitored systems
	}

	key := FlowKey{Source: source, Destination: destination, Protocol: pkt.Protocol}

	a.mu.Lock()
	defer a.mu.Unlock()

	flow, exists := a.flows[key]
	if !exists {
		flow = &Flow{
			Source:      source,
			Destination: destination,
			Protocol:    pkt.Protocol,
			FirstSeen:   pkt.Timestamp,
		}
		a.flows[key] = flow
	}
	flow.Packets++
	flow.Bytes += int64(pkt.PacketSize)
	flow.LastSeen = pkt.Timestamp

	a.totalPacketsWindow++
	a.totalBytesWindow += int64(pkt.PacketSize)
	a.totalPacketsAll++
	a.totalBytesAll += int64(pkt.PacketSize)
}

// Snapshot builds the current flow list + stats, expires idle flows, and resets window counters.
func (a *Aggregator) Snapshot(windowDuration time.Duration) Snapshot {
	a.mu.Lock()
	defer a.mu.Unlock()

	now := time.Now()
	flowEvents := make([]FlowEvent, 0, len(a.flows))

	var topSource, topDestination string
	var topSourceBytes, topDestinationBytes int64
	destBytes := make(map[string]int64)
	sourceBytes := make(map[string]int64)

	for key, flow := range a.flows {
		if now.Sub(flow.LastSeen) > a.idleTimeout {
			delete(a.flows, key)
			continue
		}

		flowEvents = append(flowEvents, FlowEvent{
			ID:              fmt.Sprintf("%s|%s|%s", flow.Source, flow.Destination, flow.Protocol),
			Source:          flow.Source,
			Destination:     flow.Destination,
			Protocol:        flow.Protocol,
			Packets:         flow.Packets,
			Bytes:           flow.Bytes,
			FirstSeen:       flow.FirstSeen.Format(time.RFC3339),
			LastSeen:        flow.LastSeen.Format(time.RFC3339),
			DurationSeconds: flow.LastSeen.Sub(flow.FirstSeen).Seconds(),
		})

		destBytes[flow.Destination] += flow.Bytes
		sourceBytes[flow.Source] += flow.Bytes
	}

	for dest, bytes := range destBytes {
		if bytes > topDestinationBytes {
			topDestinationBytes = bytes
			topDestination = dest
		}
	}
	for src, bytes := range sourceBytes {
		if bytes > topSourceBytes {
			topSourceBytes = bytes
			topSource = src
		}
	}

	var rate float64
	if windowDuration > 0 {
		rate = float64(a.totalBytesWindow) / windowDuration.Seconds()
	}

	stats := Stats{
		TotalPackets:   a.totalPacketsAll,
		TotalBytes:     a.totalBytesAll,
		ActiveFlows:    len(flowEvents),
		TrafficRateBps: rate,
		TopDestination: topDestination,
		TopSource:      topSource,
	}

	a.totalPacketsWindow = 0
	a.totalBytesWindow = 0

	return Snapshot{Type: "snapshot", Flows: flowEvents, Stats: stats}
}
