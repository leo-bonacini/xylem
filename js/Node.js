
function makeId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

class Node {
  constructor({ id, type, x = 0, y = 0, title, description, params, comments = '', breakpoint = false } = {}) {
    const def = getNodeType(type);
    this.id = id || makeId();
    this.type = type;
    this.x = x;
    this.y = y;
    this.title = title ?? def.label;
    this.description = description ?? '';
    this.comments = comments;
    this.breakpoint = breakpoint;
    this.params = params ? { ...Node.defaultParams(type), ...params } : Node.defaultParams(type);
    this.parentId = null;
    this.childIds = [];
  }

  static defaultParams(type) {
    const def = getNodeType(type);
    const params = {};
    for (const p of def.params) params[p.key] = p.default;
    return params;
  }

  get def() {
    return getNodeType(this.type);
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      title: this.title,
      description: this.description,
      comments: this.comments,
      breakpoint: this.breakpoint,
      params: this.params,
      parentId: this.parentId,
      childIds: [...this.childIds],
    };
  }

  static fromJSON(data) {
    const node = new Node({
      id: data.id,
      type: data.type,
      x: data.x,
      y: data.y,
      title: data.title,
      description: data.description,
      params: data.params,
      comments: data.comments,
      breakpoint: data.breakpoint,
    });
    node.parentId = data.parentId ?? null;
    node.childIds = Array.isArray(data.childIds) ? [...data.childIds] : [];
    return node;
  }
}
