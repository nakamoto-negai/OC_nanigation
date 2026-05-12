import { useEffect, useState } from "react";

function getWsBase(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl) return apiUrl.replace(/^https/, "wss").replace(/^http/, "ws");
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

export interface UserPosition {
  user_id: string;
  step: number;
  total_steps: number;
  from_node: string;
  to_node: string;
  from_node_id: number;
  to_node_id: number;
  updated_at: string;
}

export function useAdminWS() {
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(`${getWsBase()}/ws/admin`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "all_positions") {
        setPositions(msg.positions ?? []);
      }
    };
    return () => ws.close();
  }, []);

  return { positions, connected };
}
