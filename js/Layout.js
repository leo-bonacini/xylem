// Auto layout: positions the tree in layers (depth = row), with each parent
// node centered over the span occupied by its children. This is the same
// classic algorithm used to draw family trees/org charts.

const LAYOUT_NODE_WIDTH = 190;
const LAYOUT_LEVEL_HEIGHT = 150;
const LAYOUT_LEAF_SPACING = 220;

function computeTreeLayout(tree, startX = 40, startY = 40) {
  const root = tree.getRoots()[0];
  if (!root) return;
  const cursor = { x: startX };
  assignLayoutPositions(tree, root.id, 0, cursor, startY, new Set());
}

function assignLayoutPositions(tree, nodeId, depth, cursor, startY, visited) {
  const node = tree.getNode(nodeId);
  if (!node || visited.has(nodeId)) return cursor.x + LAYOUT_NODE_WIDTH / 2;
  visited.add(nodeId);

  const y = startY + depth * LAYOUT_LEVEL_HEIGHT;
  let center;
  if (node.childIds.length === 0) {
    center = cursor.x + LAYOUT_NODE_WIDTH / 2;
    cursor.x += LAYOUT_LEAF_SPACING;
  } else {
    const childCenters = node.childIds.map((childId) =>
      assignLayoutPositions(tree, childId, depth + 1, cursor, startY, visited)
    );
    center = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
  }
  node.x = center - LAYOUT_NODE_WIDTH / 2;
  node.y = y;
  return center;
}
