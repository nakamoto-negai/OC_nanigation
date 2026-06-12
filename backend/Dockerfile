# gocv（OpenCV の Go バインディング）を使うため、OpenCV を同梱した公式イメージでビルドする。
# CGO 経由で OpenCV C++ を呼ぶので CGO_ENABLED=1。alpine の静的ビルドは使えない。
FROM gocv/opencv:4.11.0 AS builder
WORKDIR /app
COPY . .
# ソースを置いた状態で tidy し、gocv を go.sum に取り込む
# （既存 go.sum には未記載。ソースより先に tidy すると import が無く gocv が落ちてしまう）
RUN go mod tidy
RUN CGO_ENABLED=1 GOOS=linux go build -o server .

# ランタイムも OpenCV 共有ライブラリが必要なため、同じ OpenCV 同梱イメージを土台にする。
FROM gocv/opencv:4.11.0
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]
