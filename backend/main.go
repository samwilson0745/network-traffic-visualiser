package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envIntOr(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func loadSystemIPs() map[string]string {
	systemIPs := make(map[string]string)
	for i := 1; i <= 3; i++ {
		ip := os.Getenv("SYSTEM_" + strconv.Itoa(i) + "_IP")
		name := os.Getenv("SYSTEM_" + strconv.Itoa(i) + "_NAME")
		if ip != "" && name != "" {
			systemIPs[ip] = name
		}
	}
	if len(systemIPs) == 0 {
		// sensible defaults matching docker-compose.yml
		systemIPs["172.31.0.11"] = "system-1"
		systemIPs["172.31.0.12"] = "system-2"
		systemIPs["172.31.0.13"] = "system-3"
	}
	return systemIPs
}

var ingestUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func handleIngest(aggregator *Aggregator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := ingestUpgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("ingest upgrade failed: %v", err)
			return
		}
		defer conn.Close()

		log.Printf("collector connected on /ingest")

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("collector disconnected: %v", err)
				return
			}

			var pkt PacketMeta
			if err := json.Unmarshal(message, &pkt); err != nil {
				log.Printf("invalid packet metadata: %v", err)
				continue
			}
			aggregator.Ingest(pkt)
		}
	}
}

func main() {
	windowMs := envIntOr("AGGREGATION_WINDOW_MS", 1000)
	idleTimeoutSeconds := envIntOr("FLOW_IDLE_TIMEOUT_SECONDS", 30)
	window := time.Duration(windowMs) * time.Millisecond
	idleTimeout := time.Duration(idleTimeoutSeconds) * time.Second

	systemIPs := loadSystemIPs()
	log.Printf("monitoring systems: %v", systemIPs)

	aggregator := NewAggregator(systemIPs, idleTimeout)
	hub := NewHub()

	http.HandleFunc("/ingest", handleIngest(aggregator))
	http.HandleFunc("/ws", hub.HandleFrontend)
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	go func() {
		ticker := time.NewTicker(window)
		defer ticker.Stop()
		for range ticker.C {
			snapshot := aggregator.Snapshot(window)
			hub.Broadcast(snapshot)
		}
	}()

	addr := envOr("LISTEN_ADDR", ":8080")
	log.Printf("backend listening on %s", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
