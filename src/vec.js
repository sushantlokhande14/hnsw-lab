// 2-D vectors, so the graph the algorithm walks is the graph you see.
// Real HNSW runs on hundreds of dimensions; the algorithm is identical,
// only the distance function cares how many there are.

export function dist(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// A seeded PRNG keeps a given dataset reproducible across reloads,
// which matters when you are comparing two parameter settings.
export function rng(seed) {
  let s = seed >>> 0;
  return function next() {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// Points land in a handful of gaussian blobs rather than uniformly.
// Uniform noise makes every ANN index look equally good; clusters are
// where graph structure starts to matter.
export function sampleClustered(count, seed, clusters = 6, spread = 0.075) {
  const next = rng(seed);
  const centers = [];
  for (let c = 0; c < clusters; c++) {
    centers.push([0.15 + next() * 0.7, 0.15 + next() * 0.7]);
  }

  const gauss = () => {
    // Box-Muller, clipped so a rare tail cannot fling a point off-canvas.
    const u = Math.max(next(), 1e-9);
    const v = next();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(-3, Math.min(3, g));
  };

  const points = [];
  for (let i = 0; i < count; i++) {
    const [cx, cy] = centers[i % clusters];
    points.push([
      Math.max(0.02, Math.min(0.98, cx + gauss() * spread)),
      Math.max(0.02, Math.min(0.98, cy + gauss() * spread)),
    ]);
  }
  return points;
}

// Ground truth by brute force. The whole point of an ANN index is to
// approximate this without paying for it, so we need it to score recall.
export function exactKnn(points, query, k) {
  return points
    .map((p, id) => ({ id, d: dist(p, query) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((r) => r.id);
}
