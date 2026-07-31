import { sampleClustered, exactKnn } from './vec.js';
import { HNSW } from './hnsw.js';
import { searchTraced, recallAt } from './search.js';
import { Renderer } from './render.js';

const canvas = document.getElementById('stage');
const renderer = new Renderer(canvas);

const els = {
  n: document.getElementById('n'),
  M: document.getElementById('M'),
  ef: document.getElementById('ef'),
  k: document.getElementById('k'),
  speed: document.getElementById('speed'),
  nOut: document.getElementById('nOut'),
  MOut: document.getElementById('MOut'),
  efOut: document.getElementById('efOut'),
  kOut: document.getElementById('kOut'),
  rebuild: document.getElementById('rebuild'),
  replay: document.getElementById('replay'),
  statHops: document.getElementById('statHops'),
  statDist: document.getElementById('statDist'),
  statRecall: document.getElementById('statRecall'),
  statSaved: document.getElementById('statSaved'),
  statLayers: document.getElementById('statLayers'),
  narration: document.getElementById('narration'),
};

let index = null;
let query = [0.52, 0.44];
let seed = 42;
let anim = null;

const state = {
  compared: new Set(),
  results: new Set(),
  hotEdges: new Set(),
  current: null,
  perLayer: [],
  revealedLayers: new Set(),
};

function resetState() {
  state.compared.clear();
  state.results.clear();
  state.hotEdges.clear();
  state.current = null;
  state.perLayer = [];
  state.revealedLayers.clear();
}

function build() {
  const n = +els.n.value;
  const M = +els.M.value;
  const points = sampleClustered(n, seed);
  index = new HNSW(points, { M, efConstruction: Math.max(16, +els.ef.value), seed });
  els.statLayers.textContent = index.maxLevel + 1;
  runQuery();
}

function runQuery() {
  if (anim) cancelAnimationFrame(anim);
  resetState();

  const k = +els.k.value;
  const ef = +els.ef.value;
  const { ids, trace } = searchTraced(index, query, { k, ef });
  const truth = exactKnn(index.points, query, k);

  els.statHops.textContent = trace.hopCount;
  els.statDist.textContent = trace.distanceCalls;
  els.statRecall.textContent = (recallAt(ids, truth) * 100).toFixed(0) + '%';
  const saved = 1 - trace.distanceCalls / index.points.length;
  els.statSaved.textContent = (saved * 100).toFixed(0) + '%';

  animate(trace, ids);
}

// Replay the recorded walk one hop at a time. Watching it arrive is the
// whole point; a static picture of the final graph teaches nothing.
function animate(trace, resultIds) {
  const stepsPerFrame = +els.speed.value;
  let i = 0;
  const total = trace.steps.length;

  const tick = () => {
    for (let s = 0; s < stepsPerFrame && i < total; s++, i++) {
      const step = trace.steps[i];
      state.current = { layer: step.layer, id: step.id };
      state.compared.add(`${step.layer}:${step.id}`);
      state.revealedLayers.add(step.layer);
      for (const nid of step.neighbors) {
        state.compared.add(`${step.layer}:${nid}`);
        state.hotEdges.add(`${step.layer}:${step.id}:${nid}`);
      }
      const upTo = trace.perLayer.filter((p) => p.layer >= step.layer);
      state.perLayer = upTo;
      narrate(step, i, total);
    }

    if (i >= total) {
      state.current = null;
      state.perLayer = trace.perLayer;
      resultIds.forEach((id) => state.results.add(id));
      narrateDone(resultIds.length);
    }

    renderer.draw(index, query, state);
    if (i < total) anim = requestAnimationFrame(tick);
  };

  tick();
}

function narrate(step, i, total) {
  const where = step.layer === 0 ? 'layer 0, where every point lives' : `layer ${step.layer}`;
  els.narration.textContent =
    `hop ${i + 1}/${total} · standing on node ${step.id} in ${where}, ` +
    `checking ${step.neighbors.length} neighbor${step.neighbors.length === 1 ? '' : 's'}`;
}

function narrateDone(k) {
  els.narration.textContent =
    `done · ${k} nearest neighbor${k === 1 ? '' : 's'} returned, highlighted in amber`;
}

// Clicking the bottom plane moves the query. This is the fastest way to
// build intuition: put the query in a dense cluster, then in empty space,
// and watch the hop count change.
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  query = renderer.unprojectLayer0(e.clientX - rect.left, e.clientY - rect.top, index.maxLevel + 1);
  runQuery();
});

const syncLabels = () => {
  els.nOut.textContent = els.n.value;
  els.MOut.textContent = els.M.value;
  els.efOut.textContent = els.ef.value;
  els.kOut.textContent = els.k.value;
};

// M and point count change the graph itself, so they force a rebuild.
[els.n, els.M].forEach((el) =>
  el.addEventListener('input', () => {
    syncLabels();
    build();
  })
);

// ef and k only affect query time, so a re-search is enough.
[els.ef, els.k].forEach((el) =>
  el.addEventListener('input', () => {
    syncLabels();
    runQuery();
  })
);

els.rebuild.addEventListener('click', () => {
  seed = (Math.random() * 1e9) | 0;
  build();
});

els.replay.addEventListener('click', runQuery);

window.addEventListener('resize', () => {
  renderer.resize();
  renderer.draw(index, query, state);
});

syncLabels();
build();
