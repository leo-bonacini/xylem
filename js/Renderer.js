
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const DEFAULT_NODE_W = 190;
const DEFAULT_NODE_H = 70;

function bezierPath(p1, p2) {
  const dy = Math.max(40, Math.abs(p2.y - p1.y) / 2);
  return `M ${p1.x} ${p1.y} C ${p1.x} ${p1.y + dy}, ${p2.x} ${p2.y - dy}, ${p2.x} ${p2.y}`;
}

class Renderer {
  /**
   * @param {object} opts
   * @param {import('./BehaviorTree.js').BehaviorTree} opts.tree
   * @param {HTMLElement} opts.viewportEl
   * @param {HTMLElement} opts.worldEl
   * @param {SVGElement} opts.svgEl
   * @param {HTMLElement} opts.nodesLayerEl
   * @param {HTMLElement} opts.hintEl
   * @param {HTMLElement} opts.zoomLevelEl
   * @param {(nodeId:string|null)=>void} opts.onSelectNode
   * @param {()=>void} opts.onTreeChange
   * @param {(message:string, type?:string)=>void} opts.onToast
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.pan = { x: 60, y: 40 };
    this.zoom = 1;
    this.selectedNodeId = null;
    this.selectedConnectionId = null;
    this.nodeStates = new Map();
    this.snapEnabled = false;
    this.gridSize = 20;
    this._drag = null;

    this.viewportEl.addEventListener('mousedown', (e) => this._onViewportMouseDown(e));
    this.viewportEl.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.viewportEl.addEventListener('dragover', (e) => e.preventDefault());
    this.viewportEl.addEventListener('drop', (e) => this._onDrop(e));

    this._applyTransform();
  }

  // coords

  screenToWorld(clientX, clientY) {
    const rect = this.viewportEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.pan.x) / this.zoom,
      y: (clientY - rect.top - this.pan.y) / this.zoom,
    };
  }

  // rendering

  renderAll() {
    this.nodesLayerEl.innerHTML = '';
    for (const node of this.tree.nodes.values()) {
      this.nodesLayerEl.appendChild(this._createNodeEl(node));
    }
    this._updateConnections();
    this._applySelectionStyles();
    for (const [nodeId, state] of this.nodeStates) this._setStateClass(nodeId, state);
    if (this.hintEl) this.hintEl.classList.toggle('hidden', this.tree.nodes.size > 1);
  }

  // simulation state

  _setStateClass(nodeId, state) {
    const el = this.nodesLayerEl.querySelector(`.bt-node[data-id="${nodeId}"]`);
    if (!el) return;
    el.classList.remove('state-running', 'state-success', 'state-failure', 'state-skipped');
    if (state && state !== 'idle') el.classList.add(`state-${state}`);
  }

  /** Called by the Simulator on every node state transition. */
  applyNodeState(nodeId, state) {
    this.nodeStates.set(nodeId, state);
    const el = this.nodesLayerEl.querySelector(`.bt-node[data-id="${nodeId}"]`);
    if (el) {
      el.classList.remove('pulse-once');
      this._setStateClass(nodeId, state);
      if (state === 'success' || state === 'failure') {
        void el.offsetWidth; // force reflow to restart the animation
        el.classList.add('pulse-once');
      }
    }
    this.svgEl.querySelectorAll(`path.connection-path[data-from-id="${nodeId}"]`).forEach((p) => {
      p.classList.toggle('flowing', state === 'running');
    });
  }

  resetNodeStates() {
    for (const nodeId of [...this.nodeStates.keys()]) this.applyNodeState(nodeId, 'idle');
    this.nodeStates.clear();
  }

  _createNodeEl(node) {
    const def = getNodeType(node.type);
    const el = document.createElement('div');
    el.className = 'bt-node';
    el.dataset.id = node.id;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.setProperty('--node-color', def.color);

    const header = document.createElement('div');
    header.className = 'bt-node-header';
    header.innerHTML = `
      <span class="n-icon">${def.icon}</span>
      <span class="n-title"></span>
      <span class="n-type-badge">${def.label}</span>
    `;
    header.querySelector('.n-title').textContent = node.title;
    el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'bt-node-body';
    body.textContent = node.description || def.description;
    el.appendChild(body);

    if (node.type !== 'root') {
      const input = document.createElement('div');
      input.className = 'connector input';
      input.title = 'Input';
      el.appendChild(input);
    }

    const output = document.createElement('div');
    output.className = 'connector output' + (def.maxChildren === 0 ? ' no-output' : '');
    output.title = 'Output';
    if (def.maxChildren > 0) {
      output.addEventListener('mousedown', (e) => this._onConnectorMouseDown(e, node.id));
    }
    el.appendChild(output);

    const bpDot = document.createElement('div');
    bpDot.className = 'bp-dot' + (node.breakpoint ? ' active' : '');
    bpDot.title = 'Toggle breakpoint (pauses the simulation here in Debug Mode)';
    bpDot.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      node.breakpoint = !node.breakpoint;
      bpDot.classList.toggle('active', node.breakpoint);
      this.onTreeChange?.();
    });
    el.appendChild(bpDot);

    el.addEventListener('mousedown', (e) => this._onNodeMouseDown(e, node.id));
    return el;
  }

  _updateConnections(tempLine = null) {
    const svg = this.svgEl;
    svg.innerHTML = '';
    for (const conn of this.tree.getConnections()) {
      const p1 = this._connectorPos(conn.fromId, 'output');
      const p2 = this._connectorPos(conn.toId, 'input');
      if (!p1 || !p2) continue;
      const isFlowing = this.nodeStates.get(conn.fromId) === 'running';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', bezierPath(p1, p2));
      path.setAttribute('class', 'connection-path'
        + (conn.id === this.selectedConnectionId ? ' selected' : '')
        + (isFlowing ? ' flowing' : ''));
      path.dataset.id = conn.id;
      path.dataset.fromId = conn.fromId;
      path.dataset.toId = conn.toId;
      path.style.pointerEvents = 'stroke';
      path.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.selectConnection(conn.id);
      });
      svg.appendChild(path);
    }
    if (tempLine) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', bezierPath(tempLine.from, tempLine.to));
      path.setAttribute('class', 'connection-path temp');
      svg.appendChild(path);
    }
  }

  /** Node rectangle in world coordinates (independent of pan/zoom). Also
   * used by the SVG/PNG exporters. */
  getNodeBounds(nodeId) {
    const node = this.tree.getNode(nodeId);
    if (!node) return null;
    const el = this.nodesLayerEl.querySelector(`.bt-node[data-id="${nodeId}"]`);
    const width = el ? el.offsetWidth : DEFAULT_NODE_W;
    const height = el ? el.offsetHeight : DEFAULT_NODE_H;
    return { x: node.x, y: node.y, width, height };
  }

  _connectorPos(nodeId, kind) {
    const bounds = this.getNodeBounds(nodeId);
    if (!bounds) return null;
    return kind === 'output'
      ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }
      : { x: bounds.x + bounds.width / 2, y: bounds.y };
  }

  _applySelectionStyles() {
    this.nodesLayerEl.querySelectorAll('.bt-node').forEach((el) => {
      el.classList.toggle('selected', el.dataset.id === this.selectedNodeId);
    });
  }

  // selection

  selectNode(nodeId) {
    this.selectedNodeId = nodeId;
    this.selectedConnectionId = null;
    this._applySelectionStyles();
    this._updateConnections();
    this.onSelectNode?.(nodeId ? this.tree.getNode(nodeId) : null);
  }

  selectConnection(connId) {
    this.selectedConnectionId = connId;
    this.selectedNodeId = null;
    this._applySelectionStyles();
    this._updateConnections();
    this.onSelectNode?.(null);
  }

  deleteSelected() {
    if (this.selectedNodeId) {
      this.onBeforeMutate?.();
      this.tree.removeNode(this.selectedNodeId);
      this.selectedNodeId = null;
      this.renderAll();
      this.onSelectNode?.(null);
      this.onTreeChange?.();
    } else if (this.selectedConnectionId) {
      this.onBeforeMutate?.();
      const [, toId] = this._parseConnId(this.selectedConnectionId);
      this.tree.disconnect(toId);
      this.selectedConnectionId = null;
      this.renderAll();
      this.onTreeChange?.();
    }
  }

  _parseConnId(id) {
    return id.split('->');
  }

  // node drag

  _onNodeMouseDown(e, nodeId) {
    if (e.target.closest('.connector')) return;
    e.stopPropagation();
    this.selectNode(nodeId);
    const node = this.tree.getNode(nodeId);
    const world = this.screenToWorld(e.clientX, e.clientY);
    this._drag = {
      mode: 'node',
      nodeId,
      offsetX: world.x - node.x,
      offsetY: world.y - node.y,
      moved: false,
    };
    document.addEventListener('mousemove', this._onDocMouseMove);
    document.addEventListener('mouseup', this._onDocMouseUp);
  }

  // connector drag

  _onConnectorMouseDown(e, nodeId) {
    e.stopPropagation();
    const from = this._connectorPos(nodeId, 'output');
    this._drag = { mode: 'connect', fromNodeId: nodeId, from };
    document.addEventListener('mousemove', this._onDocMouseMove);
    document.addEventListener('mouseup', this._onDocMouseUp);
  }

  // panning

  _onViewportMouseDown(e) {
    if (e.button !== 0) return;
    this.selectNode(null);
    this._drag = { mode: 'pan', startClientX: e.clientX, startClientY: e.clientY, startPan: { ...this.pan } };
    this.viewportEl.classList.add('panning');
    document.addEventListener('mousemove', this._onDocMouseMove);
    document.addEventListener('mouseup', this._onDocMouseUp);
  }

  // shared doc handlers

  _onDocMouseMove = (e) => {
    if (!this._drag) return;
    if (this._drag.mode === 'node') {
      if (!this._drag.moved) this.onBeforeMutate?.();
      const node = this.tree.getNode(this._drag.nodeId);
      const world = this.screenToWorld(e.clientX, e.clientY);
      let x = world.x - this._drag.offsetX;
      let y = world.y - this._drag.offsetY;
      if (this.snapEnabled) {
        x = Math.round(x / this.gridSize) * this.gridSize;
        y = Math.round(y / this.gridSize) * this.gridSize;
      }
      node.x = x;
      node.y = y;
      this._drag.moved = true;
      const el = this.nodesLayerEl.querySelector(`.bt-node[data-id="${node.id}"]`);
      if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; }
      this._updateConnections();
    } else if (this._drag.mode === 'connect') {
      const to = this.screenToWorld(e.clientX, e.clientY);
      this._updateConnections({ from: this._drag.from, to });
    } else if (this._drag.mode === 'pan') {
      this.pan.x = this._drag.startPan.x + (e.clientX - this._drag.startClientX);
      this.pan.y = this._drag.startPan.y + (e.clientY - this._drag.startClientY);
      this._applyTransform();
    }
  };

  _onDocMouseUp = (e) => {
    if (!this._drag) return;
    if (this._drag.mode === 'node' && this._drag.moved) {
      this.onTreeChange?.();
    } else if (this._drag.mode === 'connect') {
      const targetConnector = e.target.closest?.('.connector.input');
      if (targetConnector) {
        const targetNodeEl = targetConnector.closest('.bt-node');
        const toId = targetNodeEl?.dataset.id;
        if (toId) this.onBeforeMutate?.();
        const result = toId ? this.tree.connect(this._drag.fromNodeId, toId) : { ok: false };
        if (!result.ok) {
          if (result.reason) this.onToast?.(result.reason, 'error');
        } else {
          this.onTreeChange?.();
        }
      }
      this.renderAll();
    } else if (this._drag.mode === 'pan') {
      this.viewportEl.classList.remove('panning');
    }
    this._drag = null;
    document.removeEventListener('mousemove', this._onDocMouseMove);
    document.removeEventListener('mouseup', this._onDocMouseUp);
  };

  // drop from palette

  _onDrop(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData('node-type');
    if (!type) return;
    const world = this.screenToWorld(e.clientX, e.clientY);
    this.onDropNodeType?.(type, world.x - DEFAULT_NODE_W / 2, world.y - 20);
  }

  // zoom

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const rect = this.viewportEl.getBoundingClientRect();
    this._zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
  }

  _zoomAt(factor, screenX, screenY) {
    const worldX = (screenX - this.pan.x) / this.zoom;
    const worldY = (screenY - this.pan.y) / this.zoom;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.pan.x = screenX - worldX * newZoom;
    this.pan.y = screenY - worldY * newZoom;
    this.zoom = newZoom;
    this._applyTransform();
  }

  zoomIn() {
    const rect = this.viewportEl.getBoundingClientRect();
    this._zoomAt(1.2, rect.width / 2, rect.height / 2);
  }

  zoomOut() {
    const rect = this.viewportEl.getBoundingClientRect();
    this._zoomAt(1 / 1.2, rect.width / 2, rect.height / 2);
  }

  resetView() {
    const nodes = [...this.tree.nodes.values()];
    if (nodes.length === 0) {
      this.pan = { x: 60, y: 40 };
      this.zoom = 1;
      this._applyTransform();
      return;
    }
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + DEFAULT_NODE_W + 40;
    const maxY = Math.max(...ys) + DEFAULT_NODE_H + 80;
    const rect = this.viewportEl.getBoundingClientRect();
    const scaleX = rect.width / (maxX - minX);
    const scaleY = rect.height / (maxY - minY);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY, 1)));
    this.pan.x = -minX * this.zoom;
    this.pan.y = -minY * this.zoom;
    this._applyTransform();
  }

  _applyTransform() {
    this.worldEl.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    if (this.zoomLevelEl) this.zoomLevelEl.textContent = `${Math.round(this.zoom * 100)}%`;
    this.onViewportChange?.();
  }

  /** Centers the main viewport on a point in world space (used by the
   * minimap and when focusing a node from the validation panel). */
  panTo(worldX, worldY) {
    const rect = this.viewportEl.getBoundingClientRect();
    this.pan.x = rect.width / 2 - worldX * this.zoom;
    this.pan.y = rect.height / 2 - worldY * this.zoom;
    this._applyTransform();
  }

  setViewport(viewport) {
    if (!viewport) return;
    this.pan = viewport.pan || this.pan;
    this.zoom = viewport.zoom || this.zoom;
    this._applyTransform();
  }

  getViewport() {
    return { pan: { ...this.pan }, zoom: this.zoom };
  }
}
