# ---------- Build stage ----------
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Cần git để go mod download fetch một số deps
RUN apk add --no-cache git ca-certificates

# Copy go.mod trước, chạy tidy để tự cập nhật go.sum trong container
COPY go.mod ./
RUN go mod download || true

# Copy toàn bộ source
COPY . .

# Tidy lại để đảm bảo go.sum đầy đủ với mọi dependency hiện tại
RUN go mod tidy

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -o app

# ---------- Runtime stage ----------
FROM alpine:3.19

WORKDIR /app

# Cert cho HTTPS calls ra ngoài (InfluxDB Cloud)
RUN apk add --no-cache ca-certificates tzdata

# Set timezone
ENV TZ=Asia/Ho_Chi_Minh

# Copy binary
COPY --from=builder /app/app .

EXPOSE 8088

CMD ["./app"]
