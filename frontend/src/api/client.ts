import { Announcement, ArrivalPhoto, ARFeature, ARObject, Cafeteria, Category, DemoOverlay, Destination, Event, ImageOptimizeResult, ImageStat, IndoorTransition, Link, MapImage, Node, NodeDetour, OverlayImage, Photo, Setting, SuperCategory, SurveyAnswerInput, SurveyPublic, SurveyQuestion, SurveyResponse, User, UserLog } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "";

function getAdminToken() {
  return localStorage.getItem("admin_token") ?? "";
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function adminReq<T>(path: string, init?: RequestInit): Promise<T> {
  return req<T>(path, {
    ...init,
    headers: { "X-Admin-Token": getAdminToken(), ...(init?.headers as Record<string, string>) },
  });
}

function adminFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { "X-Admin-Token": getAdminToken(), ...(init.headers as Record<string, string>) },
  });
}

export const api = {
  nodes: {
    list: () => req<Node[]>("/api/nodes"),
    create: (data: Partial<Node>) =>
      adminReq<Node>("/api/nodes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Node>) =>
      adminReq<Node>(`/api/nodes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      adminReq<void>(`/api/nodes/${id}`, { method: "DELETE" }),
  },
  links: {
    list: () => req<Link[]>("/api/links"),
    create: (data: Partial<Link>) =>
      adminReq<Link>("/api/links", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Link>) =>
      adminReq<Link>(`/api/links/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      adminReq<void>(`/api/links/${id}`, { method: "DELETE" }),
  },
  // 経路ネットワーク（ノード＋リンク）を1回で取得する。フロントはこれをクライアント側
  // Dijkstra に渡す。バックエンドは network.Provider インターフェース越しに配信する。
  routeNetwork: {
    get: () => req<{ nodes: Node[]; links: Link[] }>("/api/route-network"),
  },
  // 屋内案内（リンクペア＋画像）。一覧は公開、登録・更新・削除は管理者のみ。
  indoorTransitions: {
    list: () => req<IndoorTransition[]>("/api/indoor-transitions"),
    create: (form: FormData) =>
      adminFetch("/api/indoor-transitions", { method: "POST", body: form }).then(async (r) => {
        if (!r.ok) {
          let detail = await r.text();
          try { detail = JSON.parse(detail).error ?? detail; } catch { /* プレーンテキスト */ }
          throw new Error(detail || "登録に失敗しました");
        }
        return r.json() as Promise<IndoorTransition>;
      }),
    // 画像の差し替え（合成結果の上書きにも使う）。
    update: (id: number, form: FormData) =>
      adminFetch(`/api/indoor-transitions/${id}`, { method: "PUT", body: form }).then((r) => {
        if (!r.ok) throw new Error("update failed");
        return r.json() as Promise<IndoorTransition>;
      }),
    delete: (id: number) =>
      adminReq<void>(`/api/indoor-transitions/${id}`, { method: "DELETE" }),
  },
  photos: {
    upload: (form: FormData) =>
      adminFetch("/api/photos", { method: "POST", body: form }).then((r) => {
        if (!r.ok) throw new Error("upload failed");
        return r.json();
      }),
    // 合成結果などで画像を差し替える（同じレコードを上書き）。
    replace: (id: number, form: FormData) =>
      adminFetch(`/api/photos/${id}`, { method: "PUT", body: form }).then((r) => {
        if (!r.ok) throw new Error("replace failed");
        return r.json() as Promise<Photo>;
      }),
    delete: (id: number) =>
      adminReq<void>(`/api/photos/${id}`, { method: "DELETE" }),
    reorder: (orders: { id: number; order: number }[]) =>
      adminReq<void>("/api/photos/reorder", {
        method: "PUT",
        body: JSON.stringify({ orders }),
      }),
  },
  // 到着地点の写真（リンクに紐づく写真）。閲覧は公開、登録・上書き・削除は管理者のみ。
  arrivalPhotos: {
    list: (linkId: number) => req<ArrivalPhoto[]>(`/api/links/${linkId}/arrival-photos`),
    upload: (form: FormData) =>
      adminFetch("/api/arrival-photos", { method: "POST", body: form }).then((r) => {
        if (!r.ok) throw new Error("upload failed");
        return r.json() as Promise<ArrivalPhoto>;
      }),
    // 合成結果などで画像を差し替える（同じレコードを上書き）。
    replace: (id: number, form: FormData) =>
      adminFetch(`/api/arrival-photos/${id}`, { method: "PUT", body: form }).then((r) => {
        if (!r.ok) throw new Error("replace failed");
        return r.json() as Promise<ArrivalPhoto>;
      }),
    delete: (id: number) =>
      adminReq<void>(`/api/arrival-photos/${id}`, { method: "DELETE" }),
  },
  // 合成用写真（到着写真エディタで重ねる素材）。すべて管理者のみ。
  overlayImages: {
    list: () => adminReq<OverlayImage[]>("/api/overlay-images"),
    upload: (form: FormData) =>
      adminFetch("/api/overlay-images", { method: "POST", body: form }).then((r) => {
        if (!r.ok) throw new Error("upload failed");
        return r.json() as Promise<OverlayImage>;
      }),
    delete: (id: number) =>
      adminReq<void>(`/api/overlay-images/${id}`, { method: "DELETE" }),
  },
  // アップロード画像の一括最適化（画素数を下げて同名で上書き）。管理者のみ。
  images: {
    stats: () => adminReq<{ count: number; total_bytes: number; items: ImageStat[] }>("/api/images/stats"),
    optimize: (max_edge: number, quality: number) =>
      adminReq<ImageOptimizeResult>("/api/images/optimize", {
        method: "POST",
        body: JSON.stringify({ max_edge, quality }),
      }),
  },
  settings: {
    get: () => req<Setting>("/api/settings"),
    update: (data: Partial<Setting>) =>
      adminReq<Setting>("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
  },
  users: {
    register: (device_id: string) =>
      req<User>("/api/users/register", { method: "POST", body: JSON.stringify({ device_id }) }),
    list: () => adminReq<User[]>("/api/users"),
  },
  logs: {
    list: (device_id?: string) =>
      adminReq<UserLog[]>(`/api/logs${device_id ? `?device_id=${encodeURIComponent(device_id)}` : ""}`),
  },
  mapImages: {
    list: () => adminReq<MapImage[]>("/api/map-images"),
    getActive: () => req<MapImage>("/api/map-images/active"),
    upload: (form: FormData) =>
      adminFetch("/api/map-images", { method: "POST", body: form }).then((r) => {
        if (!r.ok) throw new Error("upload failed");
        return r.json() as Promise<MapImage>;
      }),
    activate: (id: number) => adminReq<MapImage>(`/api/map-images/${id}/activate`, { method: "PUT" }),
    delete: (id: number) => adminReq<void>(`/api/map-images/${id}`, { method: "DELETE" }),
  },
  categories: {
    list: () => req<Category[]>("/api/categories"),
    create: (data: Partial<Category>) =>
      adminReq<Category>("/api/categories", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Category>) =>
      adminReq<Category>(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      adminReq<void>(`/api/categories/${id}`, { method: "DELETE" }),
  },
  superCategories: {
    list: () => req<SuperCategory[]>("/api/super-categories"),
    create: (data: Partial<SuperCategory>) =>
      adminReq<SuperCategory>("/api/super-categories", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<SuperCategory>) =>
      adminReq<SuperCategory>(`/api/super-categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      adminReq<void>(`/api/super-categories/${id}`, { method: "DELETE" }),
  },
  events: {
    list: (destinationId?: number) =>
      req<Event[]>(`/api/events${destinationId ? `?destination_id=${destinationId}` : ""}`),
    create: (data: { destination_id: number; name: string; category_id?: number | null; sort_order?: number }) =>
      adminReq<Event>("/api/events", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Event>) =>
      adminReq<Event>(`/api/events/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      adminReq<void>(`/api/events/${id}`, { method: "DELETE" }),
  },
  destinations: {
    list: () => req<Destination[]>("/api/destinations"),
    create: (data: { name: string; category_id?: number | null; sort_order?: number; is_bus_stop?: boolean; node_ids?: number[] }) =>
      adminReq<Destination>("/api/destinations", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { name: string; category_id?: number | null; sort_order?: number; is_bus_stop?: boolean; node_ids?: number[] }) =>
      adminReq<Destination>(`/api/destinations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      adminReq<void>(`/api/destinations/${id}`, { method: "DELETE" }),
  },
  nodeDetours: {
    list: () => req<NodeDetour[]>("/api/node-detours"),
    create: (form: FormData) =>
      adminFetch("/api/node-detours", { method: "POST", body: form }).then(async (r) => {
        if (!r.ok) {
          let detail = await r.text();
          try { detail = JSON.parse(detail).error ?? detail; } catch { /* プレーンテキスト */ }
          throw new Error(detail || "追加に失敗しました");
        }
        return r.json() as Promise<NodeDetour>;
      }),
    update: (id: number, form: FormData) =>
      adminFetch(`/api/node-detours/${id}`, { method: "PUT", body: form }).then(async (r) => {
        if (!r.ok) {
          let detail = await r.text();
          try { detail = JSON.parse(detail).error ?? detail; } catch { /* プレーンテキスト */ }
          throw new Error(detail || "更新に失敗しました");
        }
        return r.json() as Promise<NodeDetour>;
      }),
    delete: (id: number) =>
      adminReq<void>(`/api/node-detours/${id}`, { method: "DELETE" }),
  },
  arFeatures: {
    list: () => adminReq<ARFeature[]>("/api/ar-features"),
    // 公開エンドポイント（ユーザーアプリからも利用）。viewpointNodeId で現在地から見える建物に絞り込む
    matchset: (viewpointNodeId?: number) =>
      req<ARFeature[]>(
        `/api/ar-features/matchset${viewpointNodeId ? `?viewpoint_node_id=${viewpointNodeId}` : ""}`,
      ),
    create: (form: FormData) =>
      adminFetch("/api/ar-features", { method: "POST", body: form }).then(async (r) => {
        if (!r.ok) {
          // サーバーは {"error": "..."} で理由を返すので、それを表示に使う
          const body = await r.text();
          let detail = body;
          try { detail = JSON.parse(body).error ?? body; } catch { /* プレーンテキスト */ }
          throw new Error(detail || "登録に失敗しました");
        }
        // 複数画像に対応：{ created: ARFeature[], skipped: number } を返す
        return r.json() as Promise<{ created: ARFeature[]; skipped: number }>;
      }),
    delete: (id: number) => adminReq<void>(`/api/ar-features/${id}`, { method: "DELETE" }),
  },
  arObjects: {
    list: () => req<ARObject[]>("/api/ar-objects"),
    create: (data: Partial<ARObject>) =>
      adminReq<ARObject>("/api/ar-objects", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<ARObject>) =>
      adminReq<ARObject>(`/api/ar-objects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => adminReq<void>(`/api/ar-objects/${id}`, { method: "DELETE" }),
  },
  survey: {
    // ユーザーアプリ: 有効な質問と回答済みフラグを取得
    get: (deviceId: string) =>
      req<SurveyPublic>(`/api/survey?device_id=${encodeURIComponent(deviceId)}`),
    // ユーザーアプリ: 回答送信
    submit: (deviceId: string, answers: SurveyAnswerInput[]) =>
      req<SurveyResponse>("/api/survey/responses", {
        method: "POST",
        body: JSON.stringify({ device_id: deviceId, answers }),
      }),
    // 管理: 質問CRUD（無効な質問も含む一覧）
    listQuestions: () => adminReq<SurveyQuestion[]>("/api/survey/questions"),
    createQuestion: (data: Partial<SurveyQuestion>) =>
      adminReq<SurveyQuestion>("/api/survey/questions", { method: "POST", body: JSON.stringify(data) }),
    updateQuestion: (id: number, data: Partial<SurveyQuestion>) =>
      adminReq<SurveyQuestion>(`/api/survey/questions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteQuestion: (id: number) =>
      adminReq<void>(`/api/survey/questions/${id}`, { method: "DELETE" }),
    // 管理: 回答一覧
    listResponses: () => adminReq<SurveyResponse[]>("/api/survey/responses"),
  },
  // お知らせ（POP画像）
  announcements: {
    // 公開: 有効なお知らせを取得（無ければ null）
    getActive: async (): Promise<Announcement | null> => {
      const res = await fetch(`${BASE}/api/announcement/active`);
      if (res.status === 204 || !res.ok) return null;
      return res.json();
    },
    // 管理
    list: () => adminReq<Announcement[]>("/api/announcements"),
    create: (form: FormData) =>
      adminFetch("/api/announcements", { method: "POST", body: form }).then(async (r) => {
        if (!r.ok) {
          let detail = await r.text();
          try { detail = JSON.parse(detail).error ?? detail; } catch { /* プレーンテキスト */ }
          throw new Error(detail || "登録に失敗しました");
        }
        return r.json() as Promise<Announcement>;
      }),
    activate: (id: number) => adminReq<Announcement>(`/api/announcements/${id}/activate`, { method: "PUT" }),
    deactivate: (id: number) => adminReq<Announcement>(`/api/announcements/${id}/deactivate`, { method: "PUT" }),
    delete: (id: number) => adminReq<void>(`/api/announcements/${id}`, { method: "DELETE" }),
  },
  // 道案内ARデモ用の重ね画像（すべて管理者トークン必須＝管理画面からのみ利用可能）
  demoOverlays: {
    list: () => adminReq<DemoOverlay[]>("/api/demo-overlays"),
    upload: (form: FormData) =>
      adminFetch("/api/demo-overlays", { method: "POST", body: form }).then(async (r) => {
        if (!r.ok) {
          let detail = await r.text();
          try { detail = JSON.parse(detail).error ?? detail; } catch { /* プレーンテキスト */ }
          throw new Error(detail || "アップロードに失敗しました");
        }
        return r.json() as Promise<DemoOverlay>;
      }),
    delete: (id: number) => adminReq<void>(`/api/demo-overlays/${id}`, { method: "DELETE" }),
  },
  admin: {
    login: (password: string) =>
      req<{ token: string; role: string }>("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  },
  // 食堂。一覧は公開、登録・編集・削除は管理者のみ、混雑度だけの更新は食堂編集用アカウント or 管理者。
  cafeterias: {
    list: () => req<Cafeteria[]>("/api/cafeterias"),
    create: (data: { name: string; congestion_level?: number; sort_order?: number }) =>
      adminReq<Cafeteria>("/api/cafeterias", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { name: string; congestion_level: number; sort_order?: number }) =>
      adminReq<Cafeteria>(`/api/cafeterias/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      adminReq<void>(`/api/cafeterias/${id}`, { method: "DELETE" }),
    // 混雑度だけを更新（食堂編集用アカウントが利用）。
    updateCongestion: (id: number, level: number) =>
      adminReq<Cafeteria>(`/api/cafeterias/${id}/congestion`, {
        method: "PUT",
        body: JSON.stringify({ congestion_level: level }),
      }),
  },
};
