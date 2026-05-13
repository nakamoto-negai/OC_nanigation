import { Link, Node, RouteResponse, RouteStepDetail } from "../types";

export function calcRoute(
  nodes: Node[],
  links: Link[],
  startId: number,
  goalId: number,
  blockedLinkIds: number[] = [],
): RouteResponse | null {
  const blocked = new Set(blockedLinkIds);

  type Edge = { to: number; weight: number; linkId: number };
  const graph = new Map<number, Edge[]>();

  for (const link of links) {
    if (blocked.has(link.id)) continue;
    if (!graph.has(link.from_node_id)) graph.set(link.from_node_id, []);
    if (!graph.has(link.to_node_id)) graph.set(link.to_node_id, []);
    graph.get(link.from_node_id)!.push({ to: link.to_node_id, weight: link.distance, linkId: link.id });
    if (link.bidirectional) {
      graph.get(link.to_node_id)!.push({ to: link.from_node_id, weight: link.distance, linkId: link.id });
    }
  }

  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const prevLink = new Map<number, number>();

  type PQItem = { nodeId: number; cost: number };
  const pq: PQItem[] = [{ nodeId: startId, cost: 0 }];
  dist.set(startId, 0);

  while (pq.length > 0) {
    let minIdx = 0;
    for (let i = 1; i < pq.length; i++) {
      if (pq[i].cost < pq[minIdx].cost) minIdx = i;
    }
    const cur = pq.splice(minIdx, 1)[0];

    if (cur.nodeId === goalId) break;
    if (cur.cost > (dist.get(cur.nodeId) ?? Infinity)) continue;

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

  if (!dist.has(goalId)) return null;

  const nodeIds: number[] = [];
  const seen = new Set<number>();
  for (let at = goalId; at !== startId; ) {
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
    total_distance: dist.get(goalId)!,
  };
}
