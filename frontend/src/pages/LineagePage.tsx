import { useState } from 'react';
import { LineageGraph } from '../components/LineageGraph';
import { fetchLineage, type LineageResponse } from '../api/spores';

const INPUT: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  width: 240,
  outline: 'none',
  background: '#fff',
};

const BTN: React.CSSProperties = {
  padding: '7px 18px',
  background: '#7c3aed',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const BTN_DISABLED: React.CSSProperties = {
  ...BTN,
  background: '#c4b5fd',
  cursor: 'default',
};

const DOT: React.CSSProperties = {
  display: 'inline-block',
  width: 10,
  height: 10,
  borderRadius: 2,
  marginRight: 6,
  verticalAlign: 'middle',
};

export function LineagePage() {
  const [artifactId, setArtifactId] = useState('');
  const [missionId, setMissionId] = useState('TriumvirateSwarm');
  const [result, setResult]   = useState<LineageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    if (!artifactId.trim() || !missionId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await fetchLineage(artifactId.trim(), missionId.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const canFetch = !loading && artifactId.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>
          GlyphicSpore
        </h1>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Lineage viewer</p>
      </div>

      {/* Controls */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <form onSubmit={handleFetch} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151', fontWeight: 500 }}>
            ARTIFACT ID
            <input
              value={artifactId}
              onChange={(e) => setArtifactId(e.target.value)}
              placeholder="artifact-123"
              style={INPUT}
              autoFocus
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151', fontWeight: 500 }}>
            MISSION ID
            <input
              value={missionId}
              onChange={(e) => setMissionId(e.target.value)}
              placeholder="TriumvirateSwarm"
              style={INPUT}
            />
          </label>
          <button type="submit" disabled={!canFetch} style={canFetch ? BTN : BTN_DISABLED}>
            {loading ? 'Loading…' : 'Fetch lineage'}
          </button>
        </form>

        {error && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>
        )}
        {result && !error && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#6b7280' }}>
            {result.nodes.length} nodes · {result.edges.length} edges
          </p>
        )}
      </div>

      {/* Graph canvas */}
      <div style={{ flex: 1, background: '#f9fafb', position: 'relative' }}>
        {result ? (
          <LineageGraph nodes={result.nodes} edges={result.edges} />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#9ca3af', fontSize: 14,
          }}>
            {loading ? 'Fetching lineage…' : 'Enter an artifact ID above to view its lineage.'}
          </div>
        )}
      </div>

      {/* Legend */}
      {result && (
        <div style={{
          padding: '8px 24px', borderTop: '1px solid #e5e7eb', background: '#fff',
          display: 'flex', gap: 20, fontSize: 12, color: '#6b7280',
        }}>
          <span><span style={{ ...DOT, background: '#7c3aed' }} />Artifact</span>
          <span><span style={{ ...DOT, background: '#1d4ed8' }} />Event</span>
          <span><span style={{ ...DOT, background: '#059669' }} />Agent</span>
        </div>
      )}
    </div>
  );
}
