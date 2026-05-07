import React, { useEffect, useState } from "react";
import { api } from "./api/client";
import { AdminPage } from "./components/AdminPage";
import { HomePage } from "./components/HomePage";
import { RouteGuide } from "./components/RouteGuide";
import { Link, Node, Photo, RouteResponse } from "./types";
import "./index.css";

type Screen = "home" | "route" | "admin";

export default function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [screen, setScreen] = useState<Screen>("home");
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeStart, setRouteStart] = useState<Node | null>(null);
  const [routeGoal, setRouteGoal] = useState<Node | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    Promise.all([api.nodes.list(), api.links.list()])
      .then(([n, l]) => { setNodes(n); setLinks(l); })
      .catch((e) => setLoadError(e.message));
  }, []);

  const handleRouteReady = (r: RouteResponse, start: Node, goal: Node) => {
    setRoute(r);
    setRouteStart(start);
    setRouteGoal(goal);
    setScreen("route");
  };

  const handleNodeCreated = (node: Node) => setNodes((prev) => [...prev, node]);
  const handleNodeUpdated = (node: Node) => setNodes((prev) => prev.map((n) => n.id === node.id ? node : n));
  const handleNodeDeleted = (id: number) => setNodes((prev) => prev.filter((n) => n.id !== id));
  const handleLinkCreated = (link: Link) => setLinks((prev) => [...prev, link]);
  const handleLinkUpdated = (link: Link) => setLinks((prev) => prev.map((l) => l.id === link.id ? link : l));
  const handleLinkDeleted = (id: number) => setLinks((prev) => prev.filter((l) => l.id !== id));
  const handlePhotoUploaded = (linkId: number, photo: Photo) =>
    setLinks((prev) => prev.map((l) => l.id === linkId ? { ...l, photos: [...(l.photos ?? []), photo] } : l));
  const handlePhotoDeleted = (linkId: number, photoId: number) =>
    setLinks((prev) => prev.map((l) => l.id === linkId ? { ...l, photos: (l.photos ?? []).filter((p) => p.id !== photoId) } : l));
  const handlePhotoReordered = (linkId: number, photos: Photo[]) =>
    setLinks((prev) => prev.map((l) => l.id === linkId ? { ...l, photos } : l));

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={() => setScreen("home")} style={{ cursor: "pointer" }}>
          道案内アプリ
        </h1>
        <nav>
          {screen === "route" && (
            <button onClick={() => setScreen("home")}>← 目的地選択に戻る</button>
          )}
          <button
            className={screen === "admin" ? "active" : ""}
            onClick={() => setScreen(screen === "admin" ? "home" : "admin")}
          >
            {screen === "admin" ? "← 戻る" : "管理画面"}
          </button>
        </nav>
      </header>

      {loadError && (
        <div className="global-error" onClick={() => setLoadError("")}>
          {loadError} ✕
        </div>
      )}

      {screen === "admin" && (
        <AdminPage
          nodes={nodes}
          links={links}
          onNodeCreated={handleNodeCreated}
          onNodeUpdated={handleNodeUpdated}
          onNodeDeleted={handleNodeDeleted}
          onLinkCreated={handleLinkCreated}
          onLinkUpdated={handleLinkUpdated}
          onLinkDeleted={handleLinkDeleted}
          onPhotoUploaded={handlePhotoUploaded}
          onPhotoDeleted={handlePhotoDeleted}
          onPhotoReordered={handlePhotoReordered}
        />
      )}

      {screen === "home" && (
        <HomePage nodes={nodes} onRouteReady={handleRouteReady} />
      )}

      {screen === "route" && route && (
        <RouteGuide
          route={route}
          onClose={() => setScreen("home")}
        />
      )}
    </div>
  );
}
