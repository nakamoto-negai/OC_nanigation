import { Link, Node, RouteResponse } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  nodes: {
    list: () => req<Node[]>("/api/nodes"),
    create: (data: Partial<Node>) =>
      req<Node>("/api/nodes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Node>) =>
      req<Node>(`/api/nodes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      req<void>(`/api/nodes/${id}`, { method: "DELETE" }),
  },
  links: {
    list: () => req<Link[]>("/api/links"),
    create: (data: Partial<Link>) =>
      req<Link>("/api/links", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Link>) =>
      req<Link>(`/api/links/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      req<void>(`/api/links/${id}`, { method: "DELETE" }),
  },
  photos: {
    upload: (form: FormData) =>
      fetch(`${BASE}/api/photos`, { method: "POST", body: form }).then((r) => {
        if (!r.ok) throw new Error("upload failed");
        return r.json();
      }),
    delete: (id: number) =>
      req<void>(`/api/photos/${id}`, { method: "DELETE" }),
    reorder: (orders: { id: number; order: number }[]) =>
      req<void>("/api/photos/reorder", {
        method: "PUT",
        body: JSON.stringify({ orders }),
      }),
  },
  route: {
    calc: (start_id: number, goal_id: number) =>
      req<RouteResponse>("/api/route", {
        method: "POST",
        body: JSON.stringify({ start_id, goal_id }),
      }),
  },
};
