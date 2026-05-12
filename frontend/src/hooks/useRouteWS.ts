import { useEffect, useRef } from "react";
import { getDeviceId } from "./useUser";

function getWsBase(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl) return apiUrl.replace(/^https/, "wss").replace(/^http/, "ws");
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

export function useRouteWS() {
  const wsRef = useRef<WebSocket | null>(null);
  const lastStepRef = useRef<number>(-1);
  const userID = getDeviceId();

  useEffect(() => {
    const ws = new WebSocket(`${getWsBase()}/ws/user`);
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  const sendPosition = (
    step: number,
    totalSteps: number,
    fromNode: string,
    toNode: string,
    fromNodeId: number,
    toNodeId: number,
  ) => {
    if (step === lastStepRef.current) return;
    lastStepRef.current = step;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "position",
        user_id: userID,
        step,
        total_steps: totalSteps,
        from_node: fromNode,
        to_node: toNode,
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
      })
    );
  };

  return { sendPosition, userID };
}
