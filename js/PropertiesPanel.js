
class PropertiesPanel {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.contentEl
   * @param {(node:import('./Node.js').Node)=>void} opts.onChange called after any field edit
   * @param {(nodeId:string)=>void} opts.onDelete
   * @param {()=>void} [opts.onBeforeEdit] called once per focus session,
   *   before the first change in a field — used to push an undo/redo entry.
   */
  constructor({ contentEl, onChange, onDelete, onBeforeEdit }) {
    this.contentEl = contentEl;
    this.onChange = onChange;
    this.onDelete = onDelete;
    this.onBeforeEdit = onBeforeEdit;
    this.node = null;
  }

  /** Wires up focus (records an undo snapshot) + the edit event on a field. */
  _bindField(inputEl, eventName, updateFn) {
    inputEl.addEventListener('focus', () => this.onBeforeEdit?.());
    inputEl.addEventListener(eventName, () => {
      updateFn();
      this.onChange?.(this.node);
    });
  }

  show(node) {
    this.node = node;
    if (!node) {
      this.contentEl.innerHTML = '';
      this.contentEl.className = 'panel-empty';
      this.contentEl.textContent = 'Select a node to edit its properties.';
      return;
    }
    this.contentEl.className = '';
    this.contentEl.innerHTML = '';
    const def = getNodeType(node.type);

    this.contentEl.appendChild(this._buildGeneralFields(node, def));
    if (def.params.length > 0) {
      this.contentEl.appendChild(this._buildParamFields(node, def));
    }
    this.contentEl.appendChild(this._buildCommentsField(node));
    this.contentEl.appendChild(this._buildActions(node));
  }

  refresh() {
    if (this.node) this.show(this.node);
  }

  _field(labelText, inputEl, { readonly = false, hint } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'field' + (readonly ? ' readonly' : '');
    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);
    wrap.appendChild(inputEl);
    if (hint) {
      const hintEl = document.createElement('div');
      hintEl.className = 'field-hint';
      hintEl.textContent = hint;
      wrap.appendChild(hintEl);
    }
    return wrap;
  }

  _buildGeneralFields(node, def) {
    const group = document.createElement('div');
    group.className = 'field-group';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = node.title;
    this._bindField(nameInput, 'input', () => { node.title = nameInput.value || def.label; });
    group.appendChild(this._field('Name', nameInput));

    const idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.value = node.id;
    idInput.readOnly = true;
    group.appendChild(this._field('ID', idInput, { readonly: true }));

    const typeInput = document.createElement('input');
    typeInput.type = 'text';
    typeInput.value = `${def.icon} ${def.label}`;
    typeInput.readOnly = true;
    group.appendChild(this._field('Type', typeInput, { readonly: true }));

    const descInput = document.createElement('textarea');
    descInput.placeholder = def.description;
    descInput.value = node.description;
    this._bindField(descInput, 'input', () => { node.description = descInput.value; });
    group.appendChild(this._field('Description', descInput));

    return group;
  }

  _buildParamFields(node, def) {
    const group = document.createElement('div');
    group.className = 'field-group';

    for (const p of def.params) {
      let input;
      if (p.type === 'select') {
        input = document.createElement('select');
        for (const opt of p.options) {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          if (node.params[p.key] === opt) o.selected = true;
          input.appendChild(o);
        }
        this._bindField(input, 'change', () => { node.params[p.key] = input.value; });
      } else if (p.type === 'number') {
        input = document.createElement('input');
        input.type = 'number';
        input.value = node.params[p.key] ?? p.default;
        this._bindField(input, 'input', () => { node.params[p.key] = Number(input.value); });
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = node.params[p.key] ?? p.default ?? '';
        this._bindField(input, 'input', () => { node.params[p.key] = input.value; });
      }
      group.appendChild(this._field(p.label, input, { hint: p.hint }));
    }
    return group;
  }

  _buildCommentsField(node) {
    const group = document.createElement('div');
    group.className = 'field-group';
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Free-form comments about this node...';
    textarea.value = node.comments;
    this._bindField(textarea, 'input', () => { node.comments = textarea.value; });
    group.appendChild(this._field('Comments', textarea));
    return group;
  }

  _buildActions(node) {
    const wrap = document.createElement('div');
    wrap.className = 'field-actions';
    const btn = document.createElement('button');
    btn.className = 'btn btn-danger btn-block';
    btn.textContent = 'Delete node';
    btn.addEventListener('click', () => this.onDelete?.(node.id));
    wrap.appendChild(btn);
    return wrap;
  }
}
