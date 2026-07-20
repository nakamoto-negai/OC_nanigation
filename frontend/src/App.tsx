import React, { useEffect, useRef, useState } from "react";
import { api } from "./api/client";
import { AdminLogin } from "./components/AdminLogin";
import { AdminPage } from "./components/AdminPage";
import { ARView } from "./components/ARView";
import { HomePage } from "./components/HomePage";
import { RouteGuide } from "./components/RouteGuide";
import { SurveyForm } from "./components/SurveyForm";
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
type Screen = "home" | "route" | "ar" | "survey";

// URL パスと画面の対応（ハッシュを使わないパス方式のルーティング）
const screenToPath: Record<Screen, string> = {
  home: "/", route: "/route", ar: "/ar", survey: "/survey",
};
function pathToScreen(path: string): Screen {
  if (path === "/route") return "route";
  if (path === "/ar") return "ar";
  if (path === "/survey") return "survey";
  return "home";
}

const CONGESTION_LABELS = ["不明", "空き", "普通", "混雑"] as const;
const CONGESTION_COLORS = ["#94a3b8", "#22c55e", "#f59e0b", "#ef4444"] as const;

function UserApp() {
  useUser();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [nodeDetours, setNodeDetours] = useState<NodeDetour[]>([]);
  // 初期画面は URL から決める。ただし route はルートデータが無いと表示できないため、
  // コールドロードで /route を開いた場合は home にフォールバックする。
  const [screen, setScreen] = useState<Screen>(() => {
    const s = pathToScreen(window.location.pathname);
    return s === "route" ? "home" : s;
  });
  const [route, setRoute] = useState<RouteResponse | null>(null);
  // アンケートをアプリ内操作で開いたか（true のとき閉じるは履歴を戻す）
  const openedSurveyInApp = useRef(false);
  const [loadError, setLoadError] = useState("");
  const [settings, setSettings] = useState<Setting>({
    id: 1, map_north_offset: 0,
    reroute_visibility: true, reroute_incident: true,
    reroute_congestion: true, reroute_other: true,
    stamp_url: "", cafeteria_congestion: 0,
    show_cafeteria_congestion: true, show_ar_button: true,
    survey_url: "", default_dest_node_id: null,
  });

  useEffect(() => {
    Promise.all([api.nodes.list(), api.links.list(), api.nodeDetours.list()])
      .then(([n, l, d]) => { setNodes(n); setLinks(l); setNodeDetours(d); })
      .catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    api.settings.get().then(setSettings).catch(() => {});
  }, []);

  // 初期表示が URL と食い違う場合は URL 側を画面に合わせる（例: コールドロードの /route → home）
  useEffect(() => {
    const desired = screenToPath[screen];
    if (window.location.pathname !== desired) {
      window.history.replaceState(null, "", desired);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ブラウザの戻る/進むで URL が変わったら画面も追従する。
  useEffect(() => {
    const onPop = () => {
      let s = pathToScreen(window.location.pathname);
      if (s === "route" && !route) s = "home"; // ルートデータが無ければ home
      setScreen(s);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [route]);

  // 画面遷移。URL も同時に更新する（push でブラウザ履歴に積む／replace で置換）。
  const navigate = (s: Screen, opts?: { replace?: boolean }) => {
    const path = screenToPath[s];
    if (window.location.pathname !== path) {
      if (opts?.replace) window.history.replaceState(null, "", path);
      else window.history.pushState(null, "", path);
    }
    setScreen(s);
  };

  const handleRouteReady = (r: RouteResponse) => {
    setRoute(r);
    navigate("route");
  };

  // 到着カードのボタンからアプリ内アンケート（/survey）へ遷移する。
  const openSurvey = () => {
    openedSurveyInApp.current = true;
    navigate("survey");
  };

  // アンケートを閉じる。アプリ内で開いた場合は履歴を戻して元画面へ、
  // 直接 /survey を開いた場合は home へ置換で戻る。
  const closeSurvey = () => {
    if (openedSurveyInApp.current) {
      openedSurveyInApp.current = false;
      window.history.back();
    } else {
      navigate("home", { replace: true });
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        {/* タイトルは非表示。ホームへ戻る導線は「← 戻る」「AR」ボタンで担保。
            space-between の右寄せレイアウトを保つため空のスペーサーを置く。 */}
        <span className="header-spacer" onClick={() => navigate("home")} />
        <div className="header-actions">
          {settings.show_cafeteria_congestion && (
            <span className="cafeteria-congestion" title="食堂の混雑度">
              <span className="cafeteria-congestion-label">食堂</span>
              <span
                className="cafeteria-congestion-badge"
                style={{ background: CONGESTION_COLORS[settings.cafeteria_congestion] ?? CONGESTION_COLORS[0] }}
              >
                {CONGESTION_LABELS[settings.cafeteria_congestion] ?? "不明"}
              </span>
            </span>
          )}
          {settings.stamp_url && (
            <a
              className="stamp-button"
              href={settings.stamp_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              スタンプ
            </a>
          )}
          {screen === "home" && settings.show_ar_button && (
            <button onClick={() => navigate("ar")}>AR</button>
          )}
          {screen !== "home" && screen !== "survey" && (
            <button onClick={() => navigate("home")}>← 戻る</button>
          )}
        </div>
      </header>

      {loadError && (
        <div className="global-error" onClick={() => setLoadError("")}>
          {loadError} ✕
        </div>
      )}

      {screen === "home" && (
        <HomePage
          nodes={nodes}
          links={links}
          nodeDetours={nodeDetours}
          settings={settings}
          surveyUrl={settings.survey_url}
          onOpenSurvey={openSurvey}
        />
      )}

      {screen === "ar" && <ARView nodes={nodes} />}

      {/* 道案内は survey を開いている間も裏で残す（アンケートは上に重ねて表示） */}
      {(screen === "route" || screen === "survey") && route && (
        <RouteGuide
          route={route}
          nodes={nodes}
          links={links}
          nodeDetours={nodeDetours}
          onClose={() => navigate("home")}
          settings={settings}
          onReroute={(newRoute) => setRoute(newRoute)}
          onOpenSurvey={openSurvey}
        />
      )}

      {screen === "survey" && (
        <SurveyForm fallbackUrl={settings.survey_url} onClose={closeSurvey} />
      )}
    </div>
  );
}

// ── ルートエントリ ────────────────────────────────────────────
export default function App() {
  return isAdminPath ? <AdminApp /> : <UserApp />;
}
