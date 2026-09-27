FROM golang:1.23-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN go mod tidy && CGO_ENABLED=0 go build -o /backend .

FROM alpine:3.20
COPY --from=build /backend /backend
EXPOSE 8080
ENTRYPOINT ["/backend"]
