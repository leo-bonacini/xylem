// A Connection is a view-layer object derived from the parent/child
// relationship stored on the nodes themselves (Node.parentId / Node.childIds).
// The order of children in the parent's childIds array is what defines
// execution order in Sequence/Fallback, so it is always the source of truth.

class Connection {
  constructor(fromId, toId) {
    this.id = `${fromId}->${toId}`;
    this.fromId = fromId;
    this.toId = toId;
  }
}
