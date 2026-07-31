// HNSW, following Malkov & Yashunin (TPAMI 2018).
//
// The idea in one paragraph: build a stack of graphs over the same points.
// The top layer is sparse and holds only a few nodes, so a greedy walk there
// crosses the whole space in a couple of hops. Each layer down is denser.
// Search enters at the top, greedily descends to the closest node it can
// find, then uses that node as the entry point for the layer below. By the
// time it reaches layer 0, which holds every point, it is already standing
// in the right neighborhood and only has to look around locally.

import { dist } from './vec.js';

export class HNSW {
  constructor(points, { M = 6, efConstruction = 24, seed = 42, mL = null } = {}) {
    this.points = points;
    this.M = M;
    this.Mmax0 = M * 2; // layer 0 tolerates twice the degree; it carries every point
    this.efConstruction = efConstruction;
    // Level assignment is geometric with mean 1/ln(M). That constant is what
    // makes the layer sizes fall off by a factor of M each step up.
    this.mL = mL ?? 1 / Math.log(Math.max(2, M));

    // neighbors[layer] is a Map: node id -> array of neighbor ids
    this.neighbors = [];
    this.levelOf = new Int32Array(points.length);
    this.entryPoint = -1;
    this.maxLevel = -1;

    this._rand = this._makeRand(seed);
    this.build();
  }

  _makeRand(seed) {
    let s = (seed * 2654435761) >>> 0;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
  }

  _assignLevel() {
    const r = Math.max(this._rand(), 1e-12);
    return Math.floor(-Math.log(r) * this.mL);
  }

  _layer(l) {
    while (this.neighbors.length <= l) this.neighbors.push(new Map());
    return this.neighbors[l];
  }

  _link(l, a, b) {
    const layer = this._layer(l);
    if (!layer.has(a)) layer.set(a, []);
    if (!layer.has(b)) layer.set(b, []);
    if (!layer.get(a).includes(b)) layer.get(a).push(b);
    if (!layer.get(b).includes(a)) layer.get(b).push(a);
  }

  neighborsAt(l, id) {
    const layer = this.neighbors[l];
    if (!layer) return [];
    return layer.get(id) ?? [];
  }

  nodesAt(l) {
    const layer = this.neighbors[l];
    return layer ? [...layer.keys()] : [];
  }

  build() {
    for (let id = 0; id < this.points.length; id++) {
      this.insert(id);
    }
  }

  insert(id) {
    const level = this._assignLevel();
    this.levelOf[id] = level;

    if (this.entryPoint === -1) {
      for (let l = 0; l <= level; l++) this._layer(l).set(id, []);
      this.entryPoint = id;
      this.maxLevel = level;
      return;
    }

    const q = this.points[id];
    let ep = [this.entryPoint];

    // Phase 1: from the top down to level+1, a plain greedy walk with ef=1.
    // We are not collecting candidates yet, only riding the sparse layers to
    // get near the query cheaply.
    for (let l = this.maxLevel; l > level; l--) {
      const found = this._searchLayer(q, ep, 1, l);
      ep = [found[0].id];
    }

    // Phase 2: from min(level, maxLevel) down to 0, search properly and link.
    for (let l = Math.min(level, this.maxLevel); l >= 0; l--) {
      const candidates = this._searchLayer(q, ep, this.efConstruction, l);
      const maxDegree = l === 0 ? this.Mmax0 : this.M;
      const chosen = this._selectNeighbors(q, candidates, this.M);

      this._layer(l).set(id, this._layer(l).get(id) ?? []);
      for (const nid of chosen) this._link(l, id, nid);

      // Linking is symmetric, so a popular node can blow past its degree
      // budget. Prune it back using the same heuristic that chose the links.
      for (const nid of chosen) {
        const conns = this._layer(l).get(nid);
        if (conns.length > maxDegree) {
          const repruned = this._selectNeighbors(
            this.points[nid],
            conns.map((c) => ({ id: c, d: dist(this.points[nid], this.points[c]) })),
            maxDegree
          );
          this._layer(l).set(nid, repruned);
        }
      }

      ep = candidates.map((c) => c.id);
    }

    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.entryPoint = id;
    }
  }

  // Greedy best-first search within a single layer, keeping the ef best
  // candidates seen. Returns them sorted, closest first.
  _searchLayer(q, entryIds, ef, l, trace = null) {
    const visited = new Set(entryIds);
    const candidates = entryIds.map((id) => ({ id, d: dist(q, this.points[id]) }));
    let results = [...candidates];
    let hops = 0;

    while (candidates.length) {
      candidates.sort((a, b) => a.d - b.d);
      const current = candidates.shift();
      results.sort((a, b) => a.d - b.d);
      const worst = results[Math.min(results.length, ef) - 1];

      // Every reachable node is farther than our current worst keeper, so
      // walking further can only make things worse. Stop.
      if (worst && current.d > worst.d && results.length >= ef) break;

      hops++;
      if (trace) trace.hops.push({ layer: l, id: current.id });

      for (const nid of this.neighborsAt(l, current.id)) {
        if (visited.has(nid)) continue;
        visited.add(nid);
        const d = dist(q, this.points[nid]);
        if (trace) trace.compared.push({ layer: l, id: nid, d });
        candidates.push({ id: nid, d });
        results.push({ id: nid, d });
        results.sort((a, b) => a.d - b.d);
        if (results.length > ef) results.length = ef;
      }
    }

    if (trace) {
      trace.visitedCount += visited.size;
      trace.hopCount += hops;
    }

    results.sort((a, b) => a.d - b.d);
    return results.slice(0, ef);
  }

  // The diversity heuristic, and the reason HNSW beats a plain k-NN graph.
  // Taking the M nearest neighbors clusters all your edges on one side and
  // leaves the graph poorly connected. Instead, keep a candidate only if it
  // is closer to the query than to anything already chosen: that forces
  // edges to fan out in different directions and keeps long-range links.
  _selectNeighbors(q, candidates, M) {
    const pool = [...candidates].sort((a, b) => a.d - b.d);
    const chosen = [];
    for (const c of pool) {
      if (chosen.length >= M) break;
      const diverse = chosen.every((s) => dist(this.points[c.id], this.points[s]) > c.d);
      if (diverse) chosen.push(c.id);
    }
    // If the heuristic was too strict to fill the budget, top up by distance.
    for (const c of pool) {
      if (chosen.length >= M) break;
      if (!chosen.includes(c.id)) chosen.push(c.id);
    }
    return chosen;
  }
}
