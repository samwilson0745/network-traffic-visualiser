package main

import (
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
	"github.com/gorilla/websocket"
)

type PacketMeta struct {
	Timestamp       time.Time `json:"timestamp"`
	SourceIP        string    `json:"source_ip"`
	DestinationIP   string    `json:"destination_ip"`
	SourcePort      int       `json:"source_port"`
	DestinationPort int       `json:"destination_port"`
	Protocol        string    `json:"protocol"`
	PacketSize      int       `json:"packet_size"`
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// connectBackend dials the backend's /ingest websocket, retrying until it succeeds.
func connectBackend(url string) *websocket.Conn {
	for {
		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err == nil {
			log.Printf("connected to backend at %s", url)
			return conn
		}
		log.Printf("backend not ready (%v), retrying in 2s", err)
		time.Sleep(2 * time.Second)
	}
}

func parsePacket(packet gopacket.Packet) (PacketMeta, bool) {
	var srcIP, dstIP string
	var protocol string

	if ipLayer := packet.Layer(layers.LayerTypeIPv4); ipLayer != nil {
		ip, _ := ipLayer.(*layers.IPv4)
		srcIP = ip.SrcIP.String()
		dstIP = ip.DstIP.String()
	} else if ipLayer := packet.Layer(layers.LayerTypeIPv6); ipLayer != nil {
		ip, _ := ipLayer.(*layers.IPv6)
		srcIP = ip.SrcIP.String()
		dstIP = ip.DstIP.String()
	} else {
		return PacketMeta{}, false
	}

	var srcPort, dstPort int

	if tcpLayer := packet.Layer(layers.LayerTypeTCP); tcpLayer != nil {
		tcp, _ := tcpLayer.(*layers.TCP)
		srcPort = int(tcp.SrcPort)
		dstPort = int(tcp.DstPort)
		protocol = "TCP"
	} else if udpLayer := packet.Layer(layers.LayerTypeUDP); udpLayer != nil {
		udp, _ := udpLayer.(*layers.UDP)
		srcPort = int(udp.SrcPort)
		dstPort = int(udp.DstPort)
		protocol = "UDP"
	} else {
		protocol = "OTHER"
	}

	meta := PacketMeta{
		Timestamp:       time.Now(),
		SourceIP:        srcIP,
		DestinationIP:   dstIP,
		SourcePort:      srcPort,
		DestinationPort: dstPort,
		Protocol:        protocol,
		PacketSize:      len(packet.Data()),
	}
	return meta, true
}

func main() {
	iface := envOr("CAPTURE_INTERFACE", "any")
	filter := envOr("CAPTURE_FILTER", "")
	backendURL := envOr("BACKEND_WS_URL", "ws://localhost:8080/ingest")

	handle, err := pcap.OpenLive(iface, 262144, true, pcap.BlockForever)
	if err != nil {
		log.Fatalf("failed to open interface %q: %v", iface, err)
	}
	defer handle.Close()

	if filter != "" {
		if err := handle.SetBPFFilter(filter); err != nil {
			log.Fatalf("failed to set BPF filter %q: %v", filter, err)
		}
	}

	log.Printf("capturing on interface=%s filter=%q", iface, filter)

	conn := connectBackend(backendURL)
	defer conn.Close()

	packetSource := gopacket.NewPacketSource(handle, handle.LinkType())
	for packet := range packetSource.Packets() {
		meta, ok := parsePacket(packet)
		if !ok {
			continue
		}

		payload, err := json.Marshal(meta)
		if err != nil {
			log.Printf("failed to marshal packet metadata: %v", err)
			continue
		}

		if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
			log.Printf("failed to send to backend (%v), reconnecting", err)
			conn.Close()
			conn = connectBackend(backendURL)
		}
	}
}
