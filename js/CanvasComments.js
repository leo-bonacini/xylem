// Freestanding visual comments on the canvas ("post-its"), independent of
// nodes. They live inside #comments-layer, a sibling of #nodes-layer inside
// #world - it inherits the same pan/zoom automatically, so a comment's
// x/y coordinates are world coordinates, exactly like a node's.

class CanvasComments {
  /**
   * @param {object} opts
   * @param {import('./BehaviorTree.js').BehaviorTree} opts.tree
   * @param {HTMLElement} opts.containerEl
   * @param {import('./Renderer.js').Renderer} opts.renderer
   * @param {()=>void} [opts.onBeforeMutate] to integrate with undo/redo
   * @param {()=>void} [opts.onChange] for autosave/validate/minimap
   */
  constructor({ tree, containerEl, renderer, onBeforeMutate, onChange }) {
    this.tree = tree;
    this.containerEl = containerEl;
    this.renderer = renderer;
    this.onBeforeMutate = onBeforeMutate;
    this.onChange = onChange;
    this._drag = null;
  }

  renderAll() {
    this.containerEl.innerHTML = '';
    for (const comment of this.tree.comments) {
      this.containerEl.appendChild(this._createEl(comment));
    }
  }

  addAt(x, y) {
    this.onBeforeMutate?.();
    const comment = this.tree.addComment({ x, y, text: '' });
    this.renderAll();
    this.onChange?.();
    return comment;
  }

  _createEl(comment) {
    const el = document.createElement('div');
    el.className = 'canvas-comment';
    el.dataset.id = comment.id;
    el.style.left = `${comment.x}px`;
    el.style.top = `${comment.y}px`;

    const del = document.createElement('button');
    del.className = 'comment-delete';
    del.type = 'button';
    del.textContent = '×';
    del.title = 'Remove comment';
    del.addEventListener('pointerdown', (e) => e.stopPropagation());
    del.addEventListener('click', () => {
      this.onBeforeMutate?.();
      this.tree.removeComment(comment.id);
      el.remove();
      this.onChange?.();
    });
    el.appendChild(del);

    const textarea = document.createElement('textarea');
    textarea.className = 'comment-text';
    textarea.value = comment.text;
    textarea.placeholder = 'Comment...';
    textarea.addEventListener('pointerdown', (e) => e.stopPropagation());
    textarea.addEventListener('focus', () => this.onBeforeMutate?.());
    textarea.addEventListener('input', () => {
      comment.text = textarea.value;
      this.onChange?.();
    });
    el.appendChild(textarea);

    el.addEventListener('pointerdown', (e) => this._onPointerDown(e, comment));
    return el;
  }

  _onPointerDown(e, comment) {
    e.stopPropagation();
    const world = this.renderer.screenToWorld(e.clientX, e.clientY);
    this._drag = { comment, offsetX: world.x - comment.x, offsetY: world.y - comment.y, moved: false };
    document.addEventListener('pointermove', this._onPointerMove);
    document.addEventListener('pointerup', this._onPointerUp);
    document.addEventListener('pointercancel', this._onPointerUp);
  }

  _onPointerMove = (e) => {
    if (!this._drag) return;
    if (!this._drag.moved) this.onBeforeMutate?.();
    const world = this.renderer.screenToWorld(e.clientX, e.clientY);
    this._drag.comment.x = world.x - this._drag.offsetX;
    this._drag.comment.y = world.y - this._drag.offsetY;
    this._drag.moved = true;
    const el = this.containerEl.querySelector(`.canvas-comment[data-id="${this._drag.comment.id}"]`);
    if (el) {
      el.style.left = `${this._drag.comment.x}px`;
      el.style.top = `${this._drag.comment.y}px`;
    }
  };

  _onPointerUp = () => {
    if (this._drag?.moved) this.onChange?.();
    this._drag = null;
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup', this._onPointerUp);
    document.removeEventListener('pointercancel', this._onPointerUp);
  };
}
