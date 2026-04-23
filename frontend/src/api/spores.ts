export interface LineageNode {
  id: string;
  type: 'artifact' | 'event' | 'agent';
}

export interface LineageEdge {
  from: string;
  to: string;
  type: 'PERFORMED' | 'PRODUCED' | 'CHILD_OF';
}

export interface LineageResponse {
  success: boolean;
  artifactId: string;
  missionId: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export async function fetchLineage(
  artifactId: string,
  missionId: string
): Promise<LineageResponse> {
  const url =
    `/api/spores/${encodeURIComponent(artifactId)}/lineage` +
    `?mission_id=${encodeURIComponent(missionId)}`;

  const res = await fetch(url);

  if (res.status === 404) throw new Error('Artifact not found');
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);

  const data: LineageResponse = await res.json();
  if (!data.success) throw new Error('API returned success: false');

  return data;
}
