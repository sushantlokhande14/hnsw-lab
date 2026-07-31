// Canvas renderer. Layers are drawn as stacked planes in a light isometric
// skew so you can see the descent happen, rather than stacking them
// invisibly on top of each other.

const THEME = {
  bg: '#0d1117',
  plane: 'rgba(94, 158, 255, 0.03)',
  planeEdge: 'rgba(94, 158, 255, 0.16)',
  edge: 'rgba(94, 158, 255, 0.16)',
  edgeHot: 'rgba(94, 158, 255, 0.85)',
  node: 'rgba(155, 182, 224, 0.5)',
  nodeUpper: '#5e9eff',
  visited: '#7ee787',
  current: '#ffffff',
  result: '#ffd479',
  query: '#ff7b72',
  label: 'rgba(139, 148, 158, 0.9)',
  descent: 'rgba(255, 212, 121, 0.5)',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.skew = 0.42; // vertical squash, gives the planes their tilt
    this.layerGap = 118;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
  }

  // Map a unit-square point on layer l into screen space.
  project(p, l, layerCount) {
    const planeW = this.w * 0.62;
    const planeH = planeW * this.skew;
    const cx = this.w * 0.46;
    const topPad = 70;
    const baseY = topPad + (layerCount - 1 - l) * this.layerGap;
    // shear the upper layers slightly right so the stack reads as 3-D
    const shear = (layerCount - 1 - l) * 26;
    return [
      cx - planeW / 2 + p[0] * planeW + shear,
      baseY + p[1] * planeH,
    ];
  }

  clear() {
    this.ctx.fillStyle = THEME.bg;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  drawPlane(l, layerCount, nodeCount) {
    const ctx = this.ctx;
    const corners = [
      this.project([0, 0], l, layerCount),
      this.project([1, 0], l, layerCount),
      this.project([1, 1], l, layerCount),
      this.project([0, 1], l, layerCount),
    ];
    ctx.beginPath();
    ctx.moveTo(...corners[0]);
    for (let i = 1; i < 4; i++) ctx.lineTo(...corners[i]);
    ctx.closePath();
    ctx.fillStyle = THEME.plane;
    ctx.fill();
    ctx.strokeStyle = THEME.planeEdge;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = THEME.label;
    ctx.font = "12px ui-monospace, 'Cascadia Code', Menlo, monospace";
    ctx.textAlign = 'left';
    const [lx, ly] = corners[0];
    ctx.fillText(`layer ${l}  ·  ${nodeCount} nodes`, lx - 8, ly - 10);
  }

  drawEdges(index, l, layerCount, hotSet) {
    const ctx = this.ctx;
    const ids = index.nodesAt(l);
    ctx.lineWidth = 1;
    for (const id of ids) {
      const a = this.project(index.points[id], l, layerCount);
      for (const nid of index.neighborsAt(l, id)) {
        if (nid < id) continue; // draw each undirected edge once
        const b = this.project(index.points[nid], l, layerCount);
        const hot = hotSet && (hotSet.has(`${l}:${id}:${nid}`) || hotSet.has(`${l}:${nid}:${id}`));
        ctx.strokeStyle = hot ? THEME.edgeHot : THEME.edge;
        ctx.lineWidth = hot ? 1.8 : 1;
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      }
    }
  }

  drawNodes(index, l, layerCount, state) {
    const ctx = this.ctx;
    for (const id of index.nodesAt(l)) {
      const [x, y] = this.project(index.points[id], l, layerCount);
      let color = l === 0 ? THEME.node : THEME.nodeUpper;
      let r = l === 0 ? 2.6 : 3.6;

      if (state.compared.has(`${l}:${id}`)) {
        color = THEME.visited;
        r = 3.6;
      }
      if (state.results.has(id) && l === 0) {
        color = THEME.result;
        r = 5;
      }
      if (state.current && state.current.layer === l && state.current.id === id) {
        color = THEME.current;
        r = 6;
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (state.current && state.current.layer === l && state.current.id === id) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
  }

  drawQuery(index, query, layerCount, l) {
    const ctx = this.ctx;
    const [x, y] = this.project(query, l, layerCount);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = THEME.query;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,123,114,0.4)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // The dotted line that shows the walk falling from layer to layer.
  drawDescent(index, perLayer, layerCount) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = THEME.descent;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < perLayer.length - 1; i++) {
      const cur = perLayer[i];
      const nxt = perLayer[i + 1];
      const a = this.project(index.points[cur.to], cur.layer, layerCount);
      const b = this.project(index.points[nxt.from], nxt.layer, layerCount);
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.stroke();
    }
    ctx.restore();
  }

  draw(index, query, state) {
    const layerCount = index.maxLevel + 1;
    this.clear();

    // Back to front: highest layer first so lower layers overlap it.
    for (let l = layerCount - 1; l >= 0; l--) {
      this.drawPlane(l, layerCount, index.nodesAt(l).length);
      this.drawEdges(index, l, layerCount, state.hotEdges);
      this.drawNodes(index, l, layerCount, state);
      if (state.revealedLayers.has(l)) this.drawQuery(index, query, layerCount, l);
    }

    if (state.perLayer.length > 1) {
      this.drawDescent(index, state.perLayer, layerCount);
    }
  }

  // Screen point -> unit square on layer 0, for click-to-query.
  unprojectLayer0(px, py, layerCount) {
    const planeW = this.w * 0.62;
    const planeH = planeW * this.skew;
    const cx = this.w * 0.46;
    const topPad = 70;
    const baseY = topPad + (layerCount - 1) * this.layerGap;
    const x = (px - (cx - planeW / 2)) / planeW;
    const y = (py - baseY) / planeH;
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
  }
}
