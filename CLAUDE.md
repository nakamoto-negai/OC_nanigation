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

同じ WiFi のスマホから HTTPS でアクセスし、インターネット無しで AR を試す方法。**HTTPS(443) はベースの `docker-compose.yml` に統合済み**なので、素の `docker compose up` だけで常に 443 が有効になる（override 指定は不要）。

```bash
# 1. （推奨）LAN IP を SAN に含む証明書を生成しておく。openssl 不要・Docker 使用。
#    スマホの証明書警告を軽くするため。省略しても起動時に自己署名証明書を自動生成する。
powershell -ExecutionPolicy Bypass -File scripts/gen-local-cert.ps1
#   → certs/server.crt, certs/server.key（certs/ は .gitignore 済み）

# 2. 起動（override 不要。443 と 3000 の両方で配信される）
docker compose up -d --build

# 3. スマホ（同じ WiFi）で https://<PCのLAN IP> を開く
```

- 仕組み: frontend の Dockerfile が `nginx.local-https.conf`（3000+443 配信）を焼き込み、起動時に `docker-ensure-cert.sh` が証明書を確認（無ければ自己署名を自動生成）。`certs/` があればそれを優先。
- 自己署名のため初回は証明書警告 → 「詳細」→「アクセスする」で続行（HTTPS 扱いになりカメラ/コンパスが有効）。
- 443 が使えない場合は `FRONTEND_HTTPS_PORT=8443 docker compose up -d` として `https://<IP>:8443`。
- スマホから繋がらない時は Windows ファイアウォールの受信許可（443/3000）を確認（パブリックネットワークだと既定でブロックされる）。
- 証明書は LAN IP を SAN に含む必要があるため、IP が変わったら `gen-local-cert.ps1` を再実行して `docker compose up -d`（フロント再作成で新証明書を読む）。
- `docker-compose.https.yml` は後方互換のための空 override（何も上書きしない）。付けても外しても同じ。

## バックエンド構成

### 主要パッケージ
- **Gin** — HTTPルーティング
- **GORM** — PostgreSQL ORM（AutoMigrate で自動スキーマ管理）
- **gorilla/websocket** — WebSocket
- **gin-contrib/cors** — 全オリジン許可（開発・本番共通）

### 認証・ロール（`backend/middleware/auth.go`）
パスワードから HMAC トークンを作る方式。ログイン（`POST /api/admin/login`）は `{token, role}` を返す。2ロール:
- **admin**（`ADMIN_PASSWORD`、既定 "admin"）… 全機能。`middleware.AdminAuth()` で保護。
- **cafeteria**（`CAFETERIA_PASSWORD`、既定 "cafeteria"）… 食堂の混雑度だけ編集可。`middleware.CafeteriaAuth()`（admin トークンも許可）で保護された `PUT /api/cafeterias/:id/congestion` のみ使える（食堂の追加・削除・改名は不可＝管理者専用）。

フロントは `localStorage["admin_role"]` を見て、cafeteria なら食堂混雑度専用画面（`CafeteriaPage`）、admin なら通常の `AdminPage` を表示する（`App.tsx` の `AdminApp`）。

### モデル（`backend/models/`）

| モデル | 内容 |
|---|---|
| `Node` | 地点。名前・説明・マップ座標(x,y)・GPS座標(lat,lng)・混雑度・待ち時間。中継地点も含む純粋な地図上の点 |
| `Destination` | 目的地。ユーザーが選ぶ「行き先」の単位。1つの目的地に複数ノードを多対多(`destination_nodes`)で登録でき、経路案内では現在地から最も近い所属ノードへ案内する。カテゴリ・イベントは目的地に紐づく |
| `Category` | 目的地のカテゴリ。目的地選択画面のグループ見出しに使う |
| `Event` | 目的地で開催されるイベント。`destination_id` で目的地に紐づく |
| `Link` | ノード間の経路。距離・双方向フラグ・写真複数枚・enters_indoors（この区間で屋内に入る＝道案内でこのカード直後に「屋内に入ります」カードを挿入）・indoor_image_url（屋内カードに表示する画像。未設定なら内蔵SVGイラスト） |
| `Photo` | リンクに紐付く道中写真。道案内中のスライダー表示に使う。sort_order で順序管理 |
| `ArrivalPhoto` | リンクに紐付く「到着地点の写真」。管理者が写真タブでリンクごとに登録し、道案内の「到着地点を確認する」でユーザー閲覧専用に表示される（道中の Photo とは別系統）。合成エディタで合成後は同レコードを上書き（PUT で URL 差し替え） |
| `OverlayImage` | 到着写真に重ねる「合成用写真」（ステッカー等）。管理画面「合成素材」タブで事前登録し、写真タブの各到着写真の「合成」ボタンからブラウザ側 canvas で合成→1枚に平坦化して上書き保存する |
| `Cafeteria` | 食堂。管理画面「食堂」タブから複数登録でき、それぞれ名前・混雑度(0〜4)・並び順を持つ。ヘッダーに名前＋混雑度バッジで表示。混雑度は食堂編集用アカウント(/cafeteria)からも更新できる |
| `Setting` | ID=1 のシングルトン。map_north_offset（コンパス補正用）・default_destination_id（初期目的地）・show_cafeteria_congestion（食堂表示ON/OFF）・destinations_migrated / cafeterias_migrated（移行フラグ）。※旧 cafeteria_congestion（単一値）は Cafeteria へ移行し削除済み |
| `MapImage` | マップ背景画像。is_active フラグで1枚を選択 |
| `User` | ブラウザ初回起動時に自動登録。device_id (UUID) で識別 |

**目的地モデルへの移行**: 旧スキーマでは `Node.is_selectable` で目的地を管理し、カテゴリ・イベントもノードに紐づいていた。`backend/database/db.go` の `migrateToDestinations` が起動時に一度だけ、`is_selectable=true` の各ノードを「1ノードだけを持つ目的地」に変換し、カテゴリ・イベント・デフォルト目的地設定を引き継ぐ（`Setting.destinations_migrated` で冪等化）。移行後は旧カラム（`nodes.is_selectable`/`nodes.category_id`/`events.node_id`/`settings.default_dest_node_id`）を削除する。

**経路計算**: バックエンドに経路APIは無く、フロントの `frontend/src/utils/dijkstra.ts` がクライアント側で計算する。`calcRouteToNodes(nodes, links, start, goalIds[])` は複数のゴール候補（目的地の所属ノード）のうち最寄りへの経路を返す（`calcRoute` は単一ゴールの後方互換ラッパー）。

### ルーティング（`backend/main.go`）

```
/api/nodes          GET/POST
/api/nodes/:id      GET/PUT/DELETE
/api/links          GET/POST
/api/links/:id      GET/PUT/DELETE
/api/links/:id/arrival-photos  GET   — リンクの到着地点写真一覧（公開・閲覧のみ）
/api/links/:id/indoor-image    POST/DELETE  — 屋内案内カードの画像の設定・削除（管理者のみ）
/api/arrival-photos       POST       — リンクに到着地点写真を登録（管理者のみ）
/api/arrival-photos/:id   PUT        — 到着地点写真の画像を差し替え＝合成結果の上書き（管理者のみ）
/api/arrival-photos/:id   DELETE     — 到着地点写真を削除（管理者のみ）
/api/overlay-images       GET/POST         — 合成用写真の一覧・登録（管理者のみ）
/api/overlay-images/:id   DELETE           — 合成用写真の削除（管理者のみ）
/api/photos         POST
/api/photos/:id     PUT/DELETE   — PUT は道中写真の画像差し替え（合成結果の上書き。管理者のみ）
/api/photos/reorder PUT
/api/destinations       GET          — 目的地一覧（公開）
/api/destinations       POST         — 目的地登録（管理者のみ。node_ids で所属ノードを指定）
/api/destinations/:id   PUT/DELETE   — 目的地更新・削除（管理者のみ）
/api/settings       GET/PUT
/api/cafeterias                 GET          — 食堂一覧（公開・ヘッダー表示用）
/api/cafeterias                 POST         — 食堂登録（管理者のみ）
/api/cafeterias/:id             PUT/DELETE   — 食堂の更新・削除（管理者のみ）
/api/cafeterias/:id/congestion  PUT          — 食堂の混雑度だけを更新（食堂編集用アカウント or 管理者）
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
