FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod tidy || true
COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o server .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]
