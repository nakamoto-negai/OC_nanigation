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
  const goalSentRef = useRef(false);
  const userID = getDeviceId();

  useEffect(() => {
    const ws = new WebSocket(`${getWsBase()}/ws/user`);
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  // originNode / destNode はナビ全体の出発地・目的地。各ログにこれを載せることで、
  // 管理画面のログから「どこからどこまで移動したか」が一目で分かるようにする。
  const sendPosition = (
    step: number,
    totalSteps: number,
    fromNode: string,
    toNode: string,
    fromNodeId: number,
    toNodeId: number,
    originNode: string,
    destNode: string,
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
        origin_node: originNode,
        dest_node: destNode,
        from_node: fromNode,
        to_node: toNode,
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
      })
    );
  };

  const sendReroute = (
    step: number,
    totalSteps: number,
    fromNode: string,
    toNode: string,
    reason: string,
    originNode: string,
    destNode: string,
  ) => {
    try {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: "reroute",
          user_id: userID,
          step,
          total_steps: totalSteps,
          origin_node: originNode,
          dest_node: destNode,
          from_node: fromNode,
          to_node: toNode,
          reason,
        })
      );
    } catch {}
  };

  // 汎用アクションログ（AR開始・到着地点確認など）。バックエンドがホワイトリストで許可した action だけ記録する。
  const sendAction = (
    action: string,
    step: number,
    totalSteps: number,
    fromNode: string,
    toNode: string,
    originNode: string,
    destNode: string,
  ) => {
    try {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: "action",
          user_id: userID,
          action,
          step,
          total_steps: totalSteps,
          origin_node: originNode,
          dest_node: destNode,
          from_node: fromNode,
          to_node: toNode,
        })
      );
    } catch {}
  };

  const sendGoalReached = (
    goalNodeName: string,
    goalNodeId: number,
    totalSteps: number,
    originNode: string,
  ) => {
    if (goalSentRef.current) return;
    goalSentRef.current = true;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "goal_reached",
        user_id: userID,
        origin_node: originNode,
        dest_node: goalNodeName,
        to_node: goalNodeName,
        to_node_id: goalNodeId,
        total_steps: totalSteps,
      })
    );
  };

  return { sendPosition, sendGoalReached, sendReroute, sendAction, userID };
}
