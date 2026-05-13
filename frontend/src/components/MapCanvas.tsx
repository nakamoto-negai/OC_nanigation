import React, { useRef, useState, useCallback } from "react";
import { Link, Node } from "../types";

interface Props {
  nodes: Node[];
  links: Link[];
  selectedStart: number | null;
  selectedGoal: number | null;
  routeNodeIds: number[];
  routeLinkIds: number[];
  onNodeClick: (node: Node) => void;
  onCanvasClick: (x: number, y: number) => void;
  adminMode: boolean;
}

const NODE_R = 18;

export const MapCanvas: React.FC<Props> = ({
  nodes,
  links,
  selectedStart,
  selectedGoal,
  routeNodeIds,
  routeLinkIds,
  onNodeClick,
  onCanvasClick,
  adminMode,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!adminMode) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = nodes.find(
        (n) => Math.hypot(n.x - x, n.y - y) <= NODE_R
      );
      if (hit) {
        onNodeClick(hit);
      } else {
        onCanvasClick(x, y);
      }
    },
    [adminMode, nodes, onNodeClick, onCanvasClick]
  );

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.stopPropagation();
      onNodeClick(node);
    },
    [onNodeClick]
  );

  const getLinkColor = (link: Link) => {
    if (routeLinkIds.includes(link.id)) return "#f59e0b";
    return "#94a3b8";
  };

  const getLinkWidth = (link: Link) => {
    return routeLinkIds.includes(link.id) ? 4 : 2;
  };

  const getNodeFill = (node: Node) => {
    if (node.id === selectedStart) return "#22c55e";
    if (node.id === selectedGoal) return "#ef4444";
    if (routeNodeIds.includes(node.id)) return "#fbbf24";
    return "#3b82f6";
  };

  return (
    <svg
      ref={svgRef}
      className="map-canvas"
      onClick={handleSvgClick}
      style={{ cursor: adminMode ? "crosshair" : "default" }}
    >
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
        </marker>
        <marker id="arrow-route" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#f59e0b" />
        </marker>
      </defs>

      {links.map((link) => {
        const from = nodes.find((n) => n.id === link.from_node_id);
        const to = nodes.find((n) => n.id === link.to_node_id);
        if (!from || !to) return null;
        const isRoute = routeLinkIds.includes(link.id);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const x2 = to.x - ux * (NODE_R + 6);
        const y2 = to.y - uy * (NODE_R + 6);

        return (
          <g key={link.id}>
            <line
              x1={from.x}
              y1={from.y}
              x2={x2}
              y2={y2}
              stroke={getLinkColor(link)}
              strokeWidth={getLinkWidth(link)}
              markerEnd={isRoute ? "url(#arrow-route)" : "url(#arrow)"}
              strokeDasharray={isRoute ? "none" : "none"}
            />
            {link.name && (
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 6}
                textAnchor="middle"
                fontSize="11"
                fill="#475569"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {link.name}
              </text>
            )}
          </g>
        );
      })}

      {nodes.map((node) => (
        <g
          key={node.id}
          onClick={(e) => handleNodeClick(e, node)}
          onMouseEnter={(e) => {
            const svg = svgRef.current;
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            setTooltip({ x: node.x, y: node.y - NODE_R - 8, text: node.name });
          }}
          onMouseLeave={() => setTooltip(null)}
          style={{ cursor: "pointer" }}
        >
          <circle
            cx={node.x}
            cy={node.y}
            r={NODE_R}
            fill={getNodeFill(node)}
            stroke="white"
            strokeWidth={2}
          />
          <text
            x={node.x}
            y={node.y + 4}
            textAnchor="middle"
            fontSize="11"
            fill="white"
            fontWeight="bold"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {node.name.length > 4 ? node.name.slice(0, 3) + "…" : node.name}
          </text>
          {(node.id === selectedStart) && (
            <text x={node.x} y={node.y - NODE_R - 4} textAnchor="middle" fontSize="10" fill="#22c55e" fontWeight="bold">S</text>
          )}
          {(node.id === selectedGoal) && (
            <text x={node.x} y={node.y - NODE_R - 4} textAnchor="middle" fontSize="10" fill="#ef4444" fontWeight="bold">G</text>
          )}
        </g>
      ))}

      {tooltip && (
        <g>
          <rect
            x={tooltip.x - 40}
            y={tooltip.y - 16}
            width={80}
            height={20}
            rx={4}
            fill="rgba(0,0,0,0.7)"
          />
          <text
            x={tooltip.x}
            y={tooltip.y - 2}
            textAnchor="middle"
            fontSize="11"
            fill="white"
            style={{ pointerEvents: "none" }}
          >
            {tooltip.text}
          </text>
        </g>
      )}
    </svg>
  );
};
