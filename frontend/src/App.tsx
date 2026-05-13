import React, { useEffect, useState } from "react";
import { api } from "./api/client";
import { AdminLogin } from "./components/AdminLogin";
import { AdminPage } from "./components/AdminPage";
import { HomePage } from "./components/HomePage";
import { RouteGuide } from "./components/RouteGuide";
import { useUser } from "./hooks/useUser";
import { Link, Node, Photo, RouteResponse, Setting } from "./types";
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
type Screen = "home" | "route";

function UserApp() {
  useUser();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [screen, setScreen] = useState<Screen>("home");
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [settings, setSettings] = useState<Setting>({ id: 1, map_north_offset: 0 });

  useEffect(() => {
    Promise.all([api.nodes.list(), api.links.list()])
      .then(([n, l]) => { setNodes(n); setLinks(l); })
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
        {screen === "route" && (
          <nav>
            <button onClick={() => setScreen("home")}>← 目的地選択に戻る</button>
          </nav>
        )}
      </header>

      {loadError && (
        <div className="global-error" onClick={() => setLoadError("")}>
          {loadError} ✕
        </div>
      )}

      {screen === "home" && (
        <HomePage nodes={nodes} links={links} onRouteReady={handleRouteReady} />
      )}

      {screen === "route" && route && (
        <RouteGuide
          route={route}
          nodes={nodes}
          links={links}
          onClose={() => setScreen("home")}
          mapNorthOffset={settings.map_north_offset}
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
