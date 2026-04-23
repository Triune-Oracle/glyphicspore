import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import type { LineageNode, LineageEdge } from '../api/spores';

const NODE_W = 180;
const NODE_H = 44;

const NODE_STYLE: Record<string, React.CSSProperties> = {
  artifact: {
    background: '#7c3aed', color: '#fff',
    border: '1px solid #5b21b6', borderRadius: 8,
    fontSize: 13, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: NODE_W, height: NODE_H,
  },
  event: {
    background: '#1d4ed8', color: '#fff',
    border: '1px solid #1e40af', borderRadius: 8,
    fontSize: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: NODE_W, height: NODE_H,
  },
  agent: {
    background: '#059669', color: '#fff',
    border: '1px solid #047857', borderRadius: 8,
    fontSize: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: NODE_W, height: NODE_H,
  },
};

function nodeLabel(id: string): string {
  const colon = id.indexOf(':');
  return colon >= 0 ? id.slice(colon + 1) : id;
}

// CHILD_OF is stored as child→parent; flip to parent→child for LR display
function displaySource(e: LineageEdge): string {
  return e.type === 'CHILD_OF' ? e.to : e.from;
}
function displayTarget(e: LineageEdge): string {
  return e.type === 'CHILD_OF' ? e.from : e.to;
}

function buildLayout(
  nodes: LineageNode[],
  edges: LineageEdge[]
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 50 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(displaySource(e), displayTarget(e)));

  dagre.layout(g);

  const flowNodes: Node[] = nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { label: nodeLabel(n.id) },
      style: NODE_STYLE[n.type] ?? {},
    };
  });

  const flowEdges: Edge[] = edges.map((e) => ({
    id: `${e.from}|${e.to}|${e.type}`,
    source: displaySource(e),
    target: displayTarget(e),
    label: e.type,
    labelStyle: { fontSize: 10, fill: '#6b7280' },
    labelBgStyle: { fill: '#f9fafb', fillOpacity: 0.85 },
    labelBgPadding: [3, 6] as [number, number],
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { stroke: '#9ca3af' },
  }));

  return { flowNodes, flowEdges };
}

interface Props {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export function LineageGraph({ nodes, edges }: Props) {
  const { flowNodes, flowEdges } = useMemo(
    () => buildLayout(nodes, edges),
    [nodes, edges]
  );

  if (flowNodes.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#9ca3af', fontSize: 14,
      }}>
        No lineage data for this artifact.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.2}
    >
      <Background color="#e5e7eb" gap={20} />
      <Controls />
    </ReactFlow>
  );
}
