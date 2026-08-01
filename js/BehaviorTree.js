
function makeCommentId() {
  return crypto.randomUUID ? crypto.randomUUID() : `cm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class BehaviorTree {
  constructor() {
    this.nodes = new Map();
    // Freestanding visual comments on the canvas (not part of the execution
    // tree, just annotations). Kept alongside the tree so they travel with
    // it through save/open/export JSON, and undo/redo (a snapshot of
    // tree.toJSON()) covers them for free.
    this.comments = [];
  }

  addNode(node) {
    this.nodes.set(node.id, node);
    return node;
  }

  addComment({ x = 0, y = 0, text = '' } = {}) {
    const comment = { id: makeCommentId(), x, y, text };
    this.comments.push(comment);
    return comment;
  }

  updateComment(id, patch) {
    const comment = this.comments.find((c) => c.id === id);
    if (comment) Object.assign(comment, patch);
  }

  removeComment(id) {
    this.comments = this.comments.filter((c) => c.id !== id);
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  /** Removes a node. Its children become orphans (parentId = null); they are
   * NOT removed in cascade, so validation can warn the user and let them
   * decide whether to reconnect or delete them. */
  removeNode(id) {
    const node = this.nodes.get(id);
    if (!node) return;
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) parent.childIds = parent.childIds.filter((c) => c !== id);
    }
    for (const childId of node.childIds) {
      const child = this.nodes.get(childId);
      if (child) child.parentId = null;
    }
    this.nodes.delete(id);
  }

  getRoots() {
    return [...this.nodes.values()].filter((n) => n.type === 'root');
  }

  /** Removes a node AND its whole subtree (used by Cut — unlike removeNode,
   * which preserves children as orphans). */
  removeSubtree(id) {
    const node = this.nodes.get(id);
    if (!node) return;
    for (const childId of [...node.childIds]) this.removeSubtree(childId);
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) parent.childIds = parent.childIds.filter((c) => c !== id);
    }
    this.nodes.delete(id);
  }

  /** Serializes a node and all of its descendants (in this order: the node
   * itself first, then the subtree) — used by Copy/Cut. */
  getSubtreeJSON(id) {
    const node = this.nodes.get(id);
    if (!node) return [];
    return [node.toJSON(), ...node.childIds.flatMap((childId) => this.getSubtreeJSON(childId))];
  }

  /** Recreates the nodes from `nodesJson` (generating new IDs, remapping
   * parent/children internally) offset by dx/dy. The first element of
   * `nodesJson` is always the root of the copied subtree (see
   * getSubtreeJSON) and becomes a detached subtree with no parent — the
   * caller decides where to reconnect it. Returns the ID of the new pasted
   * root node. */
  pasteSubtreeJSON(nodesJson, dx = 40, dy = 40) {
    if (!nodesJson || nodesJson.length === 0) return null;
    const idMap = new Map();
    const newNodes = nodesJson.map((data) => {
      const node = Node.fromJSON({ ...data, id: undefined, parentId: null, childIds: [] });
      idMap.set(data.id, node.id);
      return node;
    });
    newNodes.forEach((node, i) => {
      const original = nodesJson[i];
      node.x = original.x + dx;
      node.y = original.y + dy;
      node.parentId = original.parentId && idMap.has(original.parentId) ? idMap.get(original.parentId) : null;
      node.childIds = original.childIds.map((cid) => idMap.get(cid)).filter(Boolean);
      this.addNode(node);
    });
    return idMap.get(nodesJson[0].id);
  }

  isDescendant(ancestorId, nodeId) {
    let current = this.nodes.get(nodeId);
    while (current && current.parentId) {
      if (current.parentId === ancestorId) return true;
      current = this.nodes.get(current.parentId);
    }
    return false;
  }

  /** Checks whether parentId can accept childId as a child. Returns
   * { ok:true } or { ok:false, reason }. */
  canConnect(parentId, childId) {
    if (parentId === childId) return { ok: false, reason: 'A node cannot connect to itself.' };
    const parent = this.nodes.get(parentId);
    const child = this.nodes.get(childId);
    if (!parent || !child) return { ok: false, reason: 'Invalid node.' };

    const parentDef = getNodeType(parent.type);
    if (parentDef.maxChildren === 0) {
      return { ok: false, reason: `${parentDef.label} does not accept children.` };
    }
    if (parent.childIds.length >= parentDef.maxChildren) {
      return { ok: false, reason: `${parentDef.label} has already reached its maximum number of children.` };
    }
    if (child.parentId) {
      return { ok: false, reason: 'The target node already has a parent. Disconnect it first.' };
    }
    if (child.type === 'root') {
      return { ok: false, reason: 'Root cannot be the child of another node.' };
    }
    if (this.isDescendant(childId, parentId) || childId === parentId) {
      return { ok: false, reason: 'This connection would create a cycle.' };
    }
    return { ok: true };
  }

  connect(parentId, childId) {
    const check = this.canConnect(parentId, childId);
    if (!check.ok) return check;
    const parent = this.nodes.get(parentId);
    const child = this.nodes.get(childId);
    parent.childIds.push(childId);
    child.parentId = parentId;
    return { ok: true };
  }

  disconnect(childId) {
    const child = this.nodes.get(childId);
    if (!child || !child.parentId) return;
    const parent = this.nodes.get(child.parentId);
    if (parent) parent.childIds = parent.childIds.filter((c) => c !== childId);
    child.parentId = null;
  }

  getConnections() {
    const connections = [];
    for (const node of this.nodes.values()) {
      for (const childId of node.childIds) {
        connections.push(new Connection(node.id, childId));
      }
    }
    return connections;
  }

  /** Runs structural validations and returns a list of
   * { level: 'error'|'warning', message, nodeId } friendly to the user. */
  validate() {
    const issues = [];
    const roots = this.getRoots();

    if (roots.length === 0) {
      issues.push({ level: 'warning', message: 'The tree has no Root node.' });
    } else if (roots.length > 1) {
      issues.push({ level: 'error', message: `There is more than one Root node (${roots.length}).`, nodeId: roots[1].id });
    }

    for (const node of this.nodes.values()) {
      if (node.type !== 'root' && !node.parentId) {
        issues.push({ level: 'warning', message: `Node "${node.title}" has no parent (disconnected).`, nodeId: node.id });
      }
      const def = getNodeType(node.type);
      if (node.childIds.length > def.maxChildren) {
        issues.push({ level: 'error', message: `Node "${node.title}" exceeds the maximum allowed number of children (${def.maxChildren}).`, nodeId: node.id });
      }
    }

    // Cycle detection: DFS starting from every parentless node (forest roots).
    const visited = new Set();
    const inStack = new Set();
    const visit = (id) => {
      if (inStack.has(id)) {
        issues.push({ level: 'error', message: 'A cycle was detected in the tree.', nodeId: id });
        return;
      }
      if (visited.has(id)) return;
      visited.add(id);
      inStack.add(id);
      const node = this.nodes.get(id);
      if (node) for (const childId of node.childIds) visit(childId);
      inStack.delete(id);
    };
    for (const node of this.nodes.values()) {
      if (!node.parentId) visit(node.id);
    }

    return issues;
  }

  clear() {
    this.nodes.clear();
    this.comments = [];
  }

  toJSON() {
    return {
      schemaVersion: 1,
      nodes: [...this.nodes.values()].map((n) => n.toJSON()),
      comments: this.comments.map((c) => ({ ...c })),
    };
  }

  static fromJSON(data) {
    const tree = new BehaviorTree();
    for (const nodeData of data.nodes || []) {
      tree.addNode(Node.fromJSON(nodeData));
    }
    tree.comments = (data.comments || []).map((c) => ({ ...c }));
    return tree;
  }
}
