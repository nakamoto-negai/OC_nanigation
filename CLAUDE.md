# OC Navigation

屋内施設向けナビゲーションアプリ。管理者がノード（地点）とリンク（経路）を登録し、ユーザーが目的地を選んで道案内を受けられる。WebSocketでユーザーの現在位置をリアルタイムに管理者画面へ表示する機能も持つ。

## アーキテクチャ

```
frontend/ (React + TypeScript + Vite)
backend/  (Go + Gin + GORM + PostgreSQL)
docker-compose.yml       # 開発環境
docker-compose.prod.yml  # 本番環境
```

nginx がフロントエンドを配信しつつ、`/api/`・`/uploads/`・`/ws/` をバックエンド（:8080）へプロキシする。

## 開発環境の起動

```bash
# 初回 or コード変更後
docker compose up --build

# バックエンドのみ強制再ビルド（キャッシュが残る場合）
docker compose build --no-cache backend
docker compose up -d backend
```

| サービス | URL |
|---|---|
| フロントエンド | http://localhost:3000 |
| バックエンドAPI | http://localhost:8080 |
| DB (PostgreSQL) | localhost:5433 |

## 本番環境

```bash
cp .env.prod.example .env.prod  # DB_PASSWORD を変更すること
docker compose -f docker-compose.prod.yml up -d --build
```

## ngrok で外部公開（スマホ実機テスト）

カメラ・コンパス・GPS は **HTTPS（または localhost）でしか動かない**。スマホ実機で AR を試すには ngrok の HTTPS トンネルが手軽。

フロントの nginx(:3000) が `/api`・`/uploads`・`/ws` を同一オリジンでプロキシしており、フロントは相対パス＋`window.location.host` を使うため、**3000番をトンネルするだけで全機能が動く**（WS は https→wss を自動選択）。

```bash
# 1. authtoken を取得して .env に記載（.env は .gitignore 済み）
cp .env.ngrok.example .env   # NGROK_AUTHTOKEN を記入

# 2. 起動（ngrok サービスを追加で立ち上げる）
docker compose -f docker-compose.yml -f docker-compose.ngrok.yml up --build

# 3. http://localhost:4040 で公開URL（https://〜.ngrok-free.app）を確認しスマホで開く
```

- 無料プランは初回アクセスで警告ページが出るので「Visit Site」を1回クリックする。
- `VITE_API_URL` は **設定しない**こと（設定するとフロントが絶対URLを焼き込み、ngrok 経由で壊れる）。

## LAN 内 HTTPS で実機テスト（ngrok 不要）

同じ WiFi のスマホから HTTPS でアクセスし、インターネット無しで AR を試す方法。自己署名証明書で nginx を 443 配信する。

```bash
# 1. 自己署名証明書を生成（PC の LAN IP を SAN に自動で含める。openssl 不要・Docker 使用）
powershell -ExecutionPolicy Bypass -File scripts/gen-local-cert.ps1
#   → certs/server.crt, certs/server.key が生成される（certs/ は .gitignore 済み）

# 2. HTTPS override で起動
docker compose -f docker-compose.yml -f docker-compose.https.yml up --build

# 3. スマホ（同じ WiFi）で https://<PCのLAN IP> を開く
```

- 自己署名のため初回は証明書警告 → 「詳細」→「アクセスする」で続行（HTTPS 扱いになりカメラ/コンパスが有効）。
- 443 が使えない場合は `docker-compose.https.yml` の `"443:443"` を `"8443:443"` にして `https://<IP>:8443`。
- スマホから繋がらない時は Windows ファイアウォールの受信許可（443/3000）を確認。
- 証明書は LAN IP を SAN に含む必要があるため、IP が変わったら `gen-local-cert.ps1` を再実行。

## バックエンド構成

### 主要パッケージ
- **Gin** — HTTPルーティング
- **GORM** — PostgreSQL ORM（AutoMigrate で自動スキーマ管理）
- **gorilla/websocket** — WebSocket
- **gin-contrib/cors** — 全オリジン許可（開発・本番共通）

### モデル（`backend/models/`）

| モデル | 内容 |
|---|---|
| `Node` | 地点。名前・説明・マップ座標(x,y)・GPS座標(lat,lng) |
| `Link` | ノード間の経路。距離・双方向フラグ・写真複数枚 |
| `Photo` | リンクに紐付く写真。sort_order で順序管理 |
| `NodePhoto` | 地点（ノード）に紐付く写真。管理者が管理画面で登録し、道案内のゴールカードにユーザー閲覧専用で表示される |
| `Setting` | ID=1 のシングルトン。map_north_offset（コンパス補正用） |
| `MapImage` | マップ背景画像。is_active フラグで1枚を選択 |
| `User` | ブラウザ初回起動時に自動登録。device_id (UUID) で識別 |

### ルーティング（`backend/main.go`）

```
/api/nodes          GET/POST
/api/nodes/:id      GET/PUT/DELETE
/api/nodes/:id/photos  GET     — ノードの到着地点写真一覧（公開・閲覧のみ）
/api/node-photos    POST        — ノードに写真登録（管理者のみ）
/api/node-photos/:id DELETE     — ノード写真削除（管理者のみ）
/api/links          GET/POST
/api/links/:id      GET/PUT/DELETE
/api/photos         POST
/api/photos/:id     DELETE
/api/photos/reorder PUT
/api/route          POST  — Dijkstra最短経路計算
/api/settings       GET/PUT
/api/users/register POST
/api/users          GET
/api/map-images     GET/POST
/api/map-images/active         GET
/api/map-images/:id/activate   PUT
/api/map-images/:id            DELETE
/ws/user   — ユーザー側WebSocket（現在地送信）
/ws/admin  — 管理者側WebSocket（全ユーザー位置受信）
/uploads/  — Static配信
/health    — ヘルスチェック
```

### WebSocketアーキテクチャ（`backend/ws/hub.go`）

#### ゴルーチンとは

Go の**ゴルーチン**は「軽量スレッド」。`go 関数名()` と書くだけで、その関数がバックグラウンドで並行して動き続ける。OS スレッドより遥かに軽く、何千本でも立ち上げられる。

#### このアプリでのゴルーチン構成

```
main()
 ├─ go Hub.Run()          ← Hub ゴルーチン（1本、アプリ全体で唯一）
 │    │
 │    │  チャネル経由でメッセージを受け取り続けるループ
 │    ├─ register チャネル     → 新しいWS接続が来たとき
 │    ├─ unregister チャネル   → WS接続が切れたとき
 │    └─ positionUpdate チャネル → ユーザーが現在地を送ってきたとき
 │
 ├─ go client.WritePump() ← ユーザーAの「送信専用」ゴルーチン
 ├─ go client.WritePump() ← ユーザーBの「送信専用」ゴルーチン
 ├─ go client.WritePump() ← 管理者の「送信専用」ゴルーチン
 │    └─ Send チャネルにデータが来たらWebSocketへ書き出す
 │
 └─ client.ReadPump()     ← HTTPハンドラーのゴルーチン内で動く（go不要）
      └─ WebSocketからメッセージを読み、Hub の positionUpdate へ送る
```

#### なぜ mutex（排他ロック）が不要か

`positions` マップ（ユーザーの現在地）を読み書きするのは **Hub ゴルーチン1本だけ**。  
複数のユーザーから同時に更新が来ても、チャネルに一列に並んで Hub が順番に処理するため、データ競合が起きない。

```
ユーザーA → positionUpdate チャネル ─┐
ユーザーB → positionUpdate チャネル ─┤→ Hub が1件ずつ順番に処理
管理者C   → register チャネル       ─┘
```

## フロントエンド構成

### コンポーネント（`frontend/src/components/`）

| コンポーネント | 役割 |
|---|---|
| `App.tsx` | 画面遷移（home / route / admin）と全状態管理 |
| `HomePage.tsx` | 目的地選択・ルート検索開始 |
| `RouteGuide.tsx` | 道案内表示。カードごとに縦スナップスクロール |
| `CompassGuide.tsx` | SVGコンパス。GPS or マップ座標で目標方角を計算 |
| `PhotoSlider.tsx` | 写真縦一列表示 |
| `MapCanvas.tsx` | SVGマップ。ノード・リンク・ルートを描画 |
| `AdminPage.tsx` | 管理画面。ノード/リンク/写真/設定/利用者の5タブ |

### カスタムフック（`frontend/src/hooks/`）

| フック | 役割 |
|---|---|
| `useUser.ts` | `localStorage` に UUID を保存し起動時にサーバーへ自動登録。`getDeviceId()` をエクスポート |
| `useRouteWS.ts` | `/ws/user` に接続。スナップスクロール変化時に現在ステップを送信 |
| `useAdminWS.ts` | `/ws/admin` に接続。全ユーザーの位置情報を受信して返す |
| `useCompass.ts` | `DeviceOrientationEvent` / `webkitCompassHeading` でコンパス値を取得。指数平滑化あり |

### ユーティリティ（`frontend/src/utils/bearing.ts`）

- `gpsBearing()` — Haversine formula でGPS座標から方角を計算
- `mapBearing()` — atan2 でマップ座標から方角を計算（map_north_offset を加算）
- `angleDiff()` — 目標方角と現在方角の差（符号あり、右回り正）

### ユーザーID

- `localStorage["nav_device_id"]` に UUID v4 を永続保存
- アプリ起動時に `POST /api/users/register` で DB に upsert（FirstOrCreate）
- WebSocket送信・管理者画面表示でも同じ ID を使用

### マップ座標系

- 単位は画像のピクセル座標（`img.naturalWidth / naturalHeight`）
- 管理画面でマップ画像をクリックするとノード位置を登録
- 表示時は `(x / naturalWidth * 100)%` でパーセント配置

## スナップスクロール（道案内カード）

各ステップカードは `height: calc(var(--card-h) - 44px)` で表示。`--card-h` は `ResizeObserver` でスクロールコンテナの実際の高さをピクセルで計測して設定する（パーセント指定は iOS Safari で正しく解決されないため）。

## nginx 注意点

- アップロード上限: `client_max_body_size 20m`（nginx.conf の `/api/` ブロック内）
- WebSocket: `proxy_http_version 1.1` と `Upgrade` ヘッダーが必要（`/ws/` ブロック）

## よくある問題

**コード変更がDockerに反映されない**  
`docker compose up --build` ではキャッシュが使われることがある。`docker compose build --no-cache <service>` で強制再ビルドする。

**位置情報のパーミッションエラー**  
ブラウザで権限を永久拒否すると `watchPosition` を呼ぶだけでコンソールエラーが出る。`Permissions API` で `denied` を確認してから呼び出すことで回避済み。URLバーのアイコンから権限をリセットできる。
