# HNSW Lab

**Vector search does not scan your data. It walks a graph. This is that walk, one hop at a time.**

An interactive visualizer for HNSW, the algorithm behind almost every vector database. Click to move the query, drag the sliders, and watch the search descend the layer stack. No build step, no dependencies, one HTML file and four small modules.

[**Open the lab →**](https://sushantlokhande14.github.io/hnsw-lab/)

## Why this exists

I wrote [Proxima](https://github.com/sushantlokhande14/proxima), a C++17 HNSW engine that serves 12,049 queries a second at 0.999 recall, 1.8× faster than hnswlib. Explaining *why* it is fast to someone who has not read the paper is hard, because the interesting part is a shape: a stack of graphs that gets sparser as you go up, so a search can cross the whole dataset in a few hops before it starts looking around locally.

Static diagrams of that lose the thing that matters, which is the motion. So this runs the real algorithm on points you can see and replays the walk.

## What you are looking at

Layers are drawn as stacked planes, sparsest on top. The dataset is the same in every layer; what changes is how many points participate.

| | |
| :-- | :-- |
| red dot | the query, projected onto each layer |
| white dot | the node currently being expanded |
| green dot | a point whose distance was actually computed |
| amber dot | one of the k neighbors returned |
| bright edge | an edge the search traversed |
| dashed line | the descent from one layer's exit node to the next layer's entry |

The stats panel is the honest part. **Distances computed** versus dataset size is the whole value proposition of an ANN index: on 400 points a typical query touches around 70 of them, so it skips over 80% of the work brute force would do. **Recall@k** is checked against a brute-force ground truth every single query, so when you crank `ef` down and the recall drops, you see exactly what you traded away.

## Things worth trying

- **Drop `ef` to 4.** Watch recall fall below 100%. This is the speed/accuracy dial every vector database exposes, and now you can see what it actually does.
- **Drop `M` to 3.** The graph gets sparse and poorly connected, hop count climbs, and search starts getting stuck in the wrong neighborhood.
- **Click far from every cluster.** An outlier query has no dense neighborhood to settle into, so the walk wanders and computes more distances.
- **Raise points to 900.** Layer count grows on its own. Nobody chooses it; it falls out of the geometric level assignment.

## How it works

Four modules, each small enough to read in one sitting:

- **`src/vec.js`** — distance, a seeded PRNG so datasets are reproducible, clustered gaussian sampling, and a brute-force k-NN for ground truth.
- **`src/hnsw.js`** — the index. Geometric level assignment, greedy per-layer search during insertion, symmetric linking with degree pruning, and the diversity heuristic for neighbor selection.
- **`src/search.js`** — query-time search, instrumented so every hop and distance computation is recorded for replay.
- **`src/render.js`** — the isometric canvas renderer.

The one piece of the paper worth calling out is **neighbor selection**. The obvious move when inserting a node is to link it to its `M` nearest neighbors. That builds a badly connected graph: all your edges bunch up on one side and the long-range links that make the upper layers useful never form. HNSW instead keeps a candidate only if it is closer to the new node than to any candidate already chosen, which forces edges to fan out in different directions. That one rule is most of the difference between a navigable graph and a slow one.

## Running it locally

No toolchain. Any static server works, because ES modules will not load over `file://`:

```bash
npx serve .
```

## Credits

Algorithm from *Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs*, Malkov & Yashunin, TPAMI 2018.

Built by [Sushant Lokhande](https://sushantlokhande.me). MIT licensed.
