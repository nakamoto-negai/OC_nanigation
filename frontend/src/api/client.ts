import { ARFeature, ARObject, Category, Link, MapImage, Node, NodeDetour, Setting, User, UserLog } from "../types";

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
  photos: {
    upload: (form: FormData) =>
      adminFetch("/api/photos", { method: "POST", body: form }).then((r) => {
        if (!r.ok) throw new Error("upload failed");
        return r.json();
      }),
    delete: (id: number) =>
      adminReq<void>(`/api/photos/${id}`, { method: "DELETE" }),
    reorder: (orders: { id: number; order: number }[]) =>
      adminReq<void>("/api/photos/reorder", {
        method: "PUT",
        body: JSON.stringify({ orders }),
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
        return r.json() as Promise<ARFeature>;
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
  admin: {
    login: (password: string) =>
      req<{ token: string }>("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  },
};
