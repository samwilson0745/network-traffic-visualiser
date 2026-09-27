FROM golang:1.23-bookworm AS build

RUN apt-get update && apt-get install -y --no-install-recommends libpcap-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN go mod tidy && CGO_ENABLED=1 go build -o /collector .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libpcap0.8 && rm -rf /var/lib/apt/lists/*
COPY --from=build /collector /collector
ENTRYPOINT ["/collector"]
