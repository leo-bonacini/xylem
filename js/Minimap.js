const MINIMAP_NODE_W = 190;
const MINIMAP_NODE_H = 70;
const MINIMAP_PAD = 20;

class Minimap {
  /**
   * @param {object} opts
   * @param {HTMLCanvasElement} opts.canvasEl
   * @param {import('./BehaviorTree.js').BehaviorTree} opts.tree
   * @param {import('./Renderer.js').Renderer} opts.renderer
   * @param {HTMLElement} opts.viewportEl main viewport (to know the visible rectangle)
   */
  constructor({ canvasEl, tree, renderer, viewportEl }) {
    this.canvasEl = canvasEl;
    this.tree = tree;
    this.renderer = renderer;
    this.viewportEl = viewportEl;
    this.ctx = canvasEl.getContext('2d');
    this._scale = 1;
    this._minX = 0;
    this._minY = 0;
    this._ox = 0;
    this._oy = 0;
    this._dragging = false;

    canvasEl.addEventListener('mousedown', (e) => {
      this._dragging = true;
      this._jumpTo(e);
    });
    document.addEventListener('mousemove', (e) => {
      if (this._dragging) this._jumpTo(e);
    });
    document.addEventListener('mouseup', () => {
      this._dragging = false;
    });
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvasEl.width;
    const h = this.canvasEl.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a1d25';
    ctx.fillRect(0, 0, w, h);

    const nodes = [...this.tree.nodes.values()];
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + MINIMAP_NODE_W);
      maxY = Math.max(maxY, n.y + MINIMAP_NODE_H);
    }
    minX -= MINIMAP_PAD; minY -= MINIMAP_PAD; maxX += MINIMAP_PAD; maxY += MINIMAP_PAD;

    const scale = Math.min(w / (maxX - minX), h / (maxY - minY));
    const ox = (w - (maxX - minX) * scale) / 2;
    const oy = (h - (maxY - minY) * scale) / 2;
    this._scale = scale;
    this._minX = minX;
    this._minY = minY;
    this._ox = ox;
    this._oy = oy;

    for (const n of nodes) {
      const def = getNodeType(n.type);
      ctx.fillStyle = def.color;
      const x = ox + (n.x - minX) * scale;
      const y = oy + (n.y - minY) * scale;
      ctx.fillRect(x, y, Math.max(2, MINIMAP_NODE_W * scale), Math.max(2, MINIMAP_NODE_H * scale));
    }

    const vpRect = this.viewportEl.getBoundingClientRect();
    const { pan, zoom } = this.renderer;
    const worldLeft = -pan.x / zoom;
    const worldTop = -pan.y / zoom;
    const worldW = vpRect.width / zoom;
    const worldH = vpRect.height / zoom;
    ctx.strokeStyle = '#4f8cff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      ox + (worldLeft - minX) * scale,
      oy + (worldTop - minY) * scale,
      worldW * scale,
      worldH * scale
    );
  }

  _jumpTo(e) {
    const rect = this.canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldX = this._minX + (mx - this._ox) / this._scale;
    const worldY = this._minY + (my - this._oy) / this._scale;
    this.renderer.panTo(worldX, worldY);
    this.render();
  }
}
