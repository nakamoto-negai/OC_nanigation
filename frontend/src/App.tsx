import React, { useEffect, useState } from "react";
import { api } from "./api/client";
import { AdminLogin } from "./components/AdminLogin";
import { AdminPage } from "./components/AdminPage";
import { ARView } from "./components/ARView";
import { HomePage } from "./components/HomePage";
import { RouteGuide } from "./components/RouteGuide";
import { useUser } from "./hooks/useUser";
import { Link, Node, NodeDetour, Photo, RouteResponse, Setting } from "./types";
import "./index.css";

// /admin パスかどうかで表示を切り替える
const isAdminPath = window.location.pathname.startsWith("/admin");

// ── 管理者アプリ ──────────────────────────────────────────────
function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token") ?? "");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);

  useEffect(() => {
    if (!token) return;
    Promise.all([api.nodes.list(), api.links.list()])
      .then(([n, l]) => { setNodes(n); setLinks(l); })
      .catch(() => {});
  }, [token]);

  const handleLogin = (t: string) => setToken(t);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setToken("");
  };

  if (!token) return <AdminLogin onLogin={handleLogin} />;

  return (
    <div className="app">
      <header className="app-header">
        <h1>管理画面</h1>
        <nav>
          <button onClick={handleLogout}>ログアウト</button>
        </nav>
      </header>
      <AdminPage
        nodes={nodes}
        links={links}
        onNodeCreated={(node) => setNodes((p) => [...p, node])}
        onNodeUpdated={(node) => setNodes((p) => p.map((n) => n.id === node.id ? node : n))}
        onNodeDeleted={(id) => setNodes((p) => p.filter((n) => n.id !== id))}
        onLinkCreated={(link) => setLinks((p) => [...p, link])}
        onLinkUpdated={(link) => setLinks((p) => p.map((l) => l.id === link.id ? link : l))}
        onLinkDeleted={(id) => setLinks((p) => p.filter((l) => l.id !== id))}
        onPhotoUploaded={(linkId, photo) =>
          setLinks((p) => p.map((l) => l.id === linkId ? { ...l, photos: [...(l.photos ?? []), photo] } : l))}
        onPhotoDeleted={(linkId, photoId) =>
          setLinks((p) => p.map((l) => l.id === linkId ? { ...l, photos: (l.photos ?? []).filter((ph) => ph.id !== photoId) } : l))}
        onPhotoReordered={(linkId, photos) =>
          setLinks((p) => p.map((l) => l.id === linkId ? { ...l, photos } : l))}
      />
    </div>
  );
}

// ── ユーザーアプリ ────────────────────────────────────────────
type Screen = "home" | "route" | "ar";

const CONGESTION_LABELS = ["不明", "空き", "普通", "混雑"] as const;
const CONGESTION_COLORS = ["#94a3b8", "#22c55e", "#f59e0b", "#ef4444"] as const;

function UserApp() {
  useUser();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [nodeDetours, setNodeDetours] = useState<NodeDetour[]>([]);
  const [screen, setScreen] = useState<Screen>("home");
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [settings, setSettings] = useState<Setting>({
    id: 1, map_north_offset: 0,
    reroute_visibility: true, reroute_incident: true,
    reroute_congestion: true, reroute_other: true,
    stamp_url: "", cafeteria_congestion: 0,
  });

  useEffect(() => {
    Promise.all([api.nodes.list(), api.links.list(), api.nodeDetours.list()])
      .then(([n, l, d]) => { setNodes(n); setLinks(l); setNodeDetours(d); })
      .catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    api.settings.get().then(setSettings).catch(() => {});
  }, []);

  const handleRouteReady = (r: RouteResponse) => {
    setRoute(r);
    setScreen("route");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={() => setScreen("home")} style={{ cursor: "pointer" }}>
          道案内アプリ
        </h1>
        <div className="header-actions">
          <span className="cafeteria-congestion" title="食堂の混雑度">
            <span className="cafeteria-congestion-label">食堂</span>
            <span
              className="cafeteria-congestion-badge"
              style={{ background: CONGESTION_COLORS[settings.cafeteria_congestion] ?? CONGESTION_COLORS[0] }}
            >
              {CONGESTION_LABELS[settings.cafeteria_congestion] ?? "不明"}
            </span>
          </span>
          {settings.stamp_url && (
            <a
              className="stamp-button"
              href={settings.stamp_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              🎫 スタンプ
            </a>
          )}
          {screen === "home" && (
            <button onClick={() => setScreen("ar")}>AR</button>
          )}
          {screen !== "home" && (
            <button onClick={() => setScreen("home")}>← 戻る</button>
          )}
        </div>
      </header>

      {loadError && (
        <div className="global-error" onClick={() => setLoadError("")}>
          {loadError} ✕
        </div>
      )}

      {screen === "home" && (
        <HomePage nodes={nodes} links={links} onRouteReady={handleRouteReady} />
      )}

      {screen === "ar" && <ARView nodes={nodes} />}

      {screen === "route" && route && (
        <RouteGuide
          route={route}
          nodes={nodes}
          links={links}
          nodeDetours={nodeDetours}
          onClose={() => setScreen("home")}
          settings={settings}
          onReroute={(newRoute) => setRoute(newRoute)}
        />
      )}
    </div>
  );
}

// ── ルートエントリ ────────────────────────────────────────────
export default function App() {
  return isAdminPath ? <AdminApp /> : <UserApp />;
}
