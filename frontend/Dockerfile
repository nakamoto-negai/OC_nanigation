FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
# 自己署名証明書を起動時に自動生成できるよう openssl を入れる
RUN apk add --no-cache openssl
COPY --from=builder /app/dist /usr/share/nginx/html
# HTTP(3000) と HTTPS(443) の両方を配信する設定をベースに焼き込む。
# これにより override（docker-compose.https.yml）無しでも常に 443 が有効になる。
COPY nginx.local-https.conf /etc/nginx/conf.d/default.conf
# nginx 起動前に証明書が無ければ生成するスクリプト（nginx:alpine の仕組み）
COPY docker-ensure-cert.sh /docker-entrypoint.d/40-ensure-cert.sh
RUN chmod +x /docker-entrypoint.d/40-ensure-cert.sh
EXPOSE 3000 443
CMD ["nginx", "-g", "daemon off;"]
