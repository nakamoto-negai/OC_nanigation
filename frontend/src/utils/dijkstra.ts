import { Link, Node, RouteResponse, RouteStepDetail } from "../types";

// 単一ゴールへの経路計算（後方互換）。内部的には複数ゴール版に委譲する。
export function calcRoute(
  nodes: Node[],
  links: Link[],
  startId: number,
  goalId: number,
  blockedLinkIds: number[] = [],
): RouteResponse | null {
  return calcRouteToNodes(nodes, links, startId, [goalId], blockedLinkIds);
}

// 複数ゴール候補（1つの目的地に属する複数ノード）のうち、現在地から最短で到達できる
// ノードへの経路を返す。Dijkstra はコストの小さい順にノードを確定するため、
// goalIds のいずれかを最初に取り出した時点で、それが最寄りのゴールになる。
export function calcRouteToNodes(
  nodes: Node[],
  links: Link[],
  startId: number,
  goalIds: number[],
  blockedLinkIds: number[] = [],
): RouteResponse | null {
  const goalSet = new Set(goalIds);
  if (goalSet.size === 0) return null;
  // 現在地自身がゴール候補なら経路なし（0距離）扱いで null（呼び出し側で同一判定済み想定）。
  const blocked = new Set(blockedLinkIds);

  type Edge = { to: number; weight: number; linkId: number };
  const graph = new Map<number, Edge[]>();

  for (const link of links) {
    if (blocked.has(link.id)) continue;
    if (!graph.has(link.from_node_id)) graph.set(link.from_node_id, []);
    if (!graph.has(link.to_node_id)) graph.set(link.to_node_id, []);
    graph.get(link.from_node_id)!.push({ to: link.to_node_id, weight: link.distance, linkId: link.id });
  }

  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const prevLink = new Map<number, number>();

  type PQItem = { nodeId: number; cost: number };
  const pq: PQItem[] = [{ nodeId: startId, cost: 0 }];
  dist.set(startId, 0);

  // 最初に確定した（＝最寄りの）ゴール候補ノード。
  let reachedGoal: number | null = null;

  while (pq.length > 0) {
    let minIdx = 0;
    for (let i = 1; i < pq.length; i++) {
      if (pq[i].cost < pq[minIdx].cost) minIdx = i;
    }
    const cur = pq.splice(minIdx, 1)[0];

    if (cur.cost > (dist.get(cur.nodeId) ?? Infinity)) continue;
    // ゴール候補を取り出した時点で、それが最短到達のゴール。
    if (goalSet.has(cur.nodeId)) { reachedGoal = cur.nodeId; break; }

    for (const edge of graph.get(cur.nodeId) ?? []) {
      const newCost = cur.cost + edge.weight;
      if (newCost < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, newCost);
        prev.set(edge.to, cur.nodeId);
        prevLink.set(edge.to, edge.linkId);
        pq.push({ nodeId: edge.to, cost: newCost });
      }
    }
  }

  if (reachedGoal == null) return null;

  const nodeIds: number[] = [];
  const seen = new Set<number>();
  for (let at = reachedGoal; at !== startId; ) {
    if (seen.has(at) || !prev.has(at)) return null;
    seen.add(at);
    nodeIds.unshift(at);
    at = prev.get(at)!;
  }
  nodeIds.unshift(startId);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const linkMap = new Map(links.map((l) => [l.id, l]));

  const nodePath = nodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);

  const steps: RouteStepDetail[] = nodeIds.slice(1).map((toId, i) => ({
    step_number: i + 1,
    link: linkMap.get(prevLink.get(toId)!)!,
    from_node: nodeMap.get(nodeIds[i])!,
    to_node: nodeMap.get(toId)!,
  }));

  return {
    node_path: nodePath,
    steps,
    total_distance: dist.get(reachedGoal)!,
  };
}
