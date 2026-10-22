// Tree metrics, following the structural measures common in the behavior
// tree literature (size, depth, branching factor, node type distribution)
// plus execution measures taken from the simulator (ticks, node executions,
// coverage). Only nodes reachable from the Root count: disconnected nodes
// never run, so they are reported separately instead of skewing the numbers.

/** Static metrics, computed from the tree alone (no simulation needed).
 * Size excludes the Root itself, which is a fixed entry point. Returns null
 * when there is no Root. */
function computeStructuralMetrics(tree) {
  const root = tree.getRoots()[0];
  if (!root) return null;

  const reachable = [];
  const seen = new Set([root.id]);
  let depth = 0;
  let leaves = 0;
  const branching = [];
  const byCategory = {};

  const walk = (node, level) => {
    for (const childId of node.childIds) {
      if (seen.has(childId)) continue;
      const child = tree.getNode(childId);
      if (!child) continue;
      seen.add(childId);
      reachable.push(child);
      depth = Math.max(depth, level);
      const category = child.def.category;
      byCategory[category] = (byCategory[category] || 0) + 1;
      if (child.childIds.length === 0) leaves++;
      else branching.push(child.childIds.length);
      walk(child, level + 1);
    }
  };
  walk(root, 1);

  const size = reachable.length;
  return {
    rootId: root.id,
    reachableIds: reachable.map((n) => n.id),
    size,
    depth,
    leaves,
    avgBranching: branching.length ? branching.reduce((a, b) => a + b, 0) / branching.length : 0,
    maxBranching: branching.length ? Math.max(...branching) : 0,
    byCategory,
    disconnected: tree.nodes.size - size - 1,
  };
}

class MetricsPanel {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.bodyEl
   * @param {HTMLElement} opts.nodesLayerEl
   * @param {() => import('./BehaviorTree.js').BehaviorTree} opts.getTree
   * @param {() => object} opts.getExecution  simulator.getExecutionMetrics()
   * @param {(nodeId:string)=>void} opts.onFocusNode
   */
  constructor({ bodyEl, nodesLayerEl, getTree, getExecution, onFocusNode }) {
    this.bodyEl = bodyEl;
    this.nodesLayerEl = nodesLayerEl;
    this.getTree = getTree;
    this.getExecution = getExecution;
    this.onFocusNode = onFocusNode;
    this.visible = false;
    this.highlightUnexecuted = false;
  }

  setVisible(visible) {
    this.visible = visible;
    if (visible) this.render();
  }

  /** Cheap enough to call on every tick, but skipped while the tab is hidden
   * (the coverage highlight on the canvas is still kept in sync). */
  render() {
    const tree = this.getTree();
    const structure = computeStructuralMetrics(tree);
    const execution = this.getExecution();
    const unexecuted = structure && execution.ticks > 0
      ? structure.reachableIds.filter((id) => !execution.visits.has(id))
      : [];
    this._applyHighlight(unexecuted);
    if (!this.visible) return;

    this.bodyEl.innerHTML = '';
    if (!structure) {
      this.bodyEl.appendChild(this._el('div', 'metrics-empty', 'Add a Root node to see metrics.'));
      return;
    }
    this.bodyEl.appendChild(this._structureSection(structure));
    this.bodyEl.appendChild(this._executionSection(tree, structure, execution, unexecuted));
  }

  _structureSection(s) {
    const section = this._section('Structure');
    const grid = this._el('div', 'metrics-grid');
    grid.append(
      this._stat('Size', s.size, 'Nodes reachable from the Root (Root excluded)'),
      this._stat('Depth', s.depth, 'Longest path from the Root, in edges'),
      this._stat('Leaves', s.leaves, 'Nodes without children'),
      this._stat('Avg branching', s.avgBranching.toFixed(2), 'Mean number of children of non-leaf nodes'),
      this._stat('Max branching', s.maxBranching, 'Largest number of children of a single node'),
      this._stat('Disconnected', s.disconnected, 'Nodes not reachable from the Root (never executed)'),
    );
    section.appendChild(grid);

    const dist = this._el('div', 'metrics-dist');
    for (const category of CATEGORY_ORDER) {
      const count = s.byCategory[category];
      if (!count) continue;
      const pct = Math.round((count / s.size) * 100);
      const row = this._el('div', 'metrics-dist-row');
      const bar = this._el('div', 'metrics-bar');
      const fill = this._el('div', `metrics-bar-fill metrics-cat-${category}`);
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      row.append(this._el('span', 'metrics-dist-label', CATEGORY_LABELS[category]), bar, this._el('span', 'metrics-dist-value', `${count} · ${pct}%`));
      dist.appendChild(row);
    }
    section.appendChild(dist);
    return section;
  }

  _executionSection(tree, s, e, unexecuted) {
    const section = this._section('Execution (current run)');
    if (e.ticks === 0) {
      section.appendChild(this._el('div', 'metrics-empty', 'Play or Step the simulation to collect execution metrics.'));
      return section;
    }
    const executions = [...e.visits.values()].reduce((a, b) => a + b, 0);
    const covered = s.size - unexecuted.length;
    const coverage = s.size ? Math.round((covered / s.size) * 100) : 0;

    const grid = this._el('div', 'metrics-grid');
    grid.append(
      this._stat('Ticks', e.ticks, 'Ticks sent to the Root in this run'),
      this._stat('Node executions', executions, 'Times any node was started (a node running over several ticks counts once)'),
      this._stat('Coverage', `${coverage}%`, `${covered} of ${s.size} reachable nodes executed at least once`),
      this._stat('Not executed', unexecuted.length, 'Reachable nodes that have not run yet'),
    );
    section.appendChild(grid);

    const toggle = this._el('label', 'metrics-toggle');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.highlightUnexecuted;
    checkbox.addEventListener('change', () => {
      this.highlightUnexecuted = checkbox.checked;
      this.render();
    });
    toggle.append(checkbox, document.createTextNode(' Highlight non-executed nodes on the canvas'));
    section.appendChild(toggle);

    const table = this._el('div', 'metrics-visits');
    const rows = [...e.visits.entries()]
      .filter(([id]) => id !== s.rootId && tree.getNode(id))
      .sort((a, b) => b[1] - a[1]);
    for (const id of unexecuted) rows.push([id, 0]);
    for (const [id, count] of rows) {
      const node = tree.getNode(id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `metrics-visit-row${count === 0 ? ' metrics-unvisited' : ''}`;
      row.title = 'Select this node';
      row.append(this._el('span', '', node.title), this._el('span', 'metrics-dist-value', `${count}×`));
      row.addEventListener('click', () => this.onFocusNode(id));
      table.appendChild(row);
    }
    section.appendChild(table);
    return section;
  }

  _applyHighlight(unexecuted) {
    this.nodesLayerEl.querySelectorAll('.coverage-miss').forEach((el) => el.classList.remove('coverage-miss'));
    if (!this.highlightUnexecuted) return;
    for (const id of unexecuted) {
      this.nodesLayerEl.querySelector(`.bt-node[data-id="${id}"]`)?.classList.add('coverage-miss');
    }
  }

  _section(title) {
    const section = this._el('section', 'metrics-section');
    section.appendChild(this._el('h3', 'metrics-heading', title));
    return section;
  }

  _stat(label, value, hint) {
    const el = this._el('div', 'metrics-stat');
    el.title = hint;
    el.append(this._el('div', 'metrics-stat-value', String(value)), this._el('div', 'metrics-stat-label', label));
    return el;
  }

  _el(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
}
