// Query-time search, instrumented. Same algorithm as the one used during
// construction, but every hop and every distance computation is recorded so
// the visualizer can replay the walk one step at a time.

import { dist } from './vec.js';

export function searchTraced(index, query, { k = 5, ef = 24 } = {}) {
  const trace = {
    steps: [], // one entry per accepted hop, in order
    compared: [], // every distance actually computed
    perLayer: [], // entry/exit node per layer, for drawing the descent
    hopCount: 0,
    distanceCalls: 0,
  };

  if (index.entryPoint === -1) return { ids: [], trace };

  let ep = [index.entryPoint];

  // Ride the sparse upper layers with ef=1: no candidate list to maintain,
  // just keep stepping to a closer neighbor until none is closer.
  for (let l = index.maxLevel; l >= 1; l--) {
    const from = ep[0];
    const res = greedyStep(index, query, ep, 1, l, trace);
    ep = [res[0].id];
    trace.perLayer.push({ layer: l, from, to: ep[0], ef: 1 });
  }

  // Layer 0 holds every point, so this is where we actually gather results.
  const from0 = ep[0];
  const results = greedyStep(index, query, ep, Math.max(ef, k), 0, trace);
  trace.perLayer.push({ layer: 0, from: from0, to: results[0]?.id ?? from0, ef });

  return { ids: results.slice(0, k).map((r) => r.id), trace, candidates: results };
}

function greedyStep(index, query, entryIds, ef, layer, trace) {
  const visited = new Set(entryIds);
  const candidates = entryIds.map((id) => {
    trace.distanceCalls++;
    return { id, d: dist(query, index.points[id]) };
  });
  let results = [...candidates];

  while (candidates.length) {
    candidates.sort((a, b) => a.d - b.d);
    const current = candidates.shift();
    results.sort((a, b) => a.d - b.d);
    const worst = results[Math.min(results.length, ef) - 1];

    if (worst && current.d > worst.d && results.length >= ef) break;

    trace.hopCount++;
    const neighborIds = index.neighborsAt(layer, current.id);
    trace.steps.push({
      layer,
      id: current.id,
      d: current.d,
      neighbors: neighborIds.slice(),
      bestSoFar: results[0]?.id ?? current.id,
    });

    for (const nid of neighborIds) {
      if (visited.has(nid)) continue;
      visited.add(nid);
      trace.distanceCalls++;
      const d = dist(query, index.points[nid]);
      trace.compared.push({ layer, id: nid, d });
      candidates.push({ id: nid, d });
      results.push({ id: nid, d });
      results.sort((a, b) => a.d - b.d);
      if (results.length > ef) results.length = ef;
    }
  }

  results.sort((a, b) => a.d - b.d);
  return results.slice(0, ef);
}

// Recall@k against brute force. This is the number that matters: a fast
// index that returns the wrong neighbors is just a fast wrong answer.
export function recallAt(approxIds, exactIds) {
  if (!exactIds.length) return 1;
  const truth = new Set(exactIds);
  const hit = approxIds.filter((id) => truth.has(id)).length;
  return hit / exactIds.length;
}
