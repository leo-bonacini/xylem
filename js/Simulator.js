// Tick-based execution engine. Each control/decorator node is implemented
// as a generator function; `yield 'RUNNING'` suspends exactly at the
// current point and resumes there on the next external tick (Step or the
// Play interval), which gives execution "memory" (which child is active,
// how many attempts have happened, etc.) without needing a manual state machine.

const BASE_TICK_MS = 700;

class Simulator {
  /**
   * @param {object} opts
   * @param {import('./BehaviorTree.js').BehaviorTree} opts.tree
   * @param {(nodeId:string, state:string)=>void} opts.onNodeState
   * @param {(entry:object)=>void} opts.onLog
   * @param {(simState:string)=>void} opts.onSimStateChange
   * @param {()=>void} [opts.onStatsChange]
   * @param {(node:import('./Node.js').Node)=>void} [opts.onBreakpointHit]
   */
  constructor({ tree, onNodeState, onLog, onSimStateChange, onStatsChange, onBreakpointHit }) {
    this.tree = tree;
    this.onNodeState = onNodeState;
    this.onLog = onLog;
    this.onSimStateChange = onSimStateChange;
    this.onStatsChange = onStatsChange;
    this.onBreakpointHit = onBreakpointHit;

    this.speed = 1;
    this.intervalId = null;
    this.rootGenerator = null;
    this.nodeStates = new Map();
    this.nodeStartTimes = new Map();
    this.simState = 'idle'; // idle | running | paused | success | failure
    this.debugMode = false;
    this.stats = this._emptyStats();
    this._breakpointHit = null;

    this.retryAttempts = new Map();
    this.repeatCounts = new Map();
  }

  _emptyStats() {
    return { successes: 0, failures: 0, durations: [], lastTickAt: null, fps: 0 };
  }

  /** Stats ready for display: counts + average/max duration of completed
   * transitions (Success/Failure) + observed FPS from Play. */
  getStats() {
    const { successes, failures, durations, fps } = this.stats;
    const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const maxDuration = durations.length ? Math.max(...durations) : 0;
    return { successes, failures, avgDuration, maxDuration, fps };
  }

  setSpeed(mult) {
    this.speed = mult;
    if (this.simState === 'running') this._restartInterval();
  }

  play() {
    if (this.simState === 'running') return;
    if (!this.rootGenerator) {
      const started = this._startNewRun();
      if (!started) return;
    }
    this.simState = 'running';
    this.onSimStateChange?.(this.simState);
    this._restartInterval();
  }

  pause() {
    if (this.simState !== 'running') return;
    this._clearInterval();
    this.simState = 'paused';
    this.onSimStateChange?.(this.simState);
  }

  step() {
    this._clearInterval();
    if (!this.rootGenerator) {
      const started = this._startNewRun();
      if (!started) return;
    }
    this._tick();
    if (this.simState === 'running' || this.simState === 'idle') {
      this.simState = this.rootGenerator ? 'paused' : this.simState;
      this.onSimStateChange?.(this.simState);
    }
  }

  stop() {
    this._clearInterval();
    this.rootGenerator = null;
    this.simState = 'idle';
    this.onSimStateChange?.(this.simState);
  }

  reset() {
    this.stop();
    for (const id of [...this.nodeStates.keys()]) this._setState(id, 'idle');
    this.nodeStates.clear();
    this.nodeStartTimes.clear();
    this.retryAttempts.clear();
    this.repeatCounts.clear();
    this.stats = this._emptyStats();
    this._breakpointHit = null;
    this.onStatsChange?.();
  }

  _clearInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  _restartInterval() {
    this._clearInterval();
    this.intervalId = setInterval(() => this._tick(), BASE_TICK_MS / this.speed);
  }

  _startNewRun() {
    for (const id of [...this.nodeStates.keys()]) this._setState(id, 'idle');
    this.retryAttempts.clear();
    this.repeatCounts.clear();
    this.stats = this._emptyStats();
    this.onStatsChange?.();

    const roots = this.tree.getRoots();
    const root = roots[0];
    if (!root || root.childIds.length === 0) {
      this.onLog?.(this._makeLogEntry({ id: null, title: 'Simulator', type: null }, 'ERROR', 'Tree is empty or the Root has no child connected.'));
      return false;
    }
    this.rootGenerator = this._tickNode(root.id);
    return true;
  }

  _tick() {
    if (!this.rootGenerator) return;
    const now = Date.now();
    if (this.stats.lastTickAt != null) {
      const dt = now - this.stats.lastTickAt;
      if (dt > 0) this.stats.fps = Math.round(1000 / dt);
    }
    this.stats.lastTickAt = now;

    this._breakpointHit = null;
    let iter;
    try {
      iter = this.rootGenerator.next();
    } catch (err) {
      this.onLog?.(this._makeLogEntry({ id: null, title: 'Simulator', type: null }, 'ERROR', err.message));
      this.stop();
      return;
    }
    if (iter.done) {
      const finalStatus = iter.value;
      this._clearInterval();
      this.rootGenerator = null;
      this.simState = finalStatus === 'SUCCESS' ? 'success' : 'failure';
      this.onSimStateChange?.(this.simState);
    } else if (this._breakpointHit) {
      const hitNode = this._breakpointHit;
      this._breakpointHit = null;
      this._clearInterval();
      this.simState = 'paused';
      this.onSimStateChange?.(this.simState);
      this.onBreakpointHit?.(hitNode);
    }
    this.onStatsChange?.();
  }

  _setState(nodeId, state) {
    if (state === 'running' && this.debugMode && !this._breakpointHit) {
      const node = this.tree.getNode(nodeId);
      if (node?.breakpoint) this._breakpointHit = node;
    }
    if (this.nodeStates.get(nodeId) === state) return;
    this.nodeStates.set(nodeId, state);
    this.onNodeState?.(nodeId, state);
  }

  _makeLogEntry(node, state, note) {
    return {
      time: Date.now(),
      nodeId: node.id,
      nodeTitle: node.title,
      nodeType: node.type,
      state,
      durationMs: null,
      note: note || null,
    };
  }

  _logTransition(node, state) {
    const now = Date.now();
    let durationMs = null;
    if (state === 'RUNNING') {
      this.nodeStartTimes.set(node.id, now);
    } else {
      const start = this.nodeStartTimes.get(node.id);
      if (start != null) durationMs = now - start;
      if (state === 'SUCCESS') this.stats.successes++;
      else if (state === 'FAILURE') this.stats.failures++;
      if (durationMs != null) this.stats.durations.push(durationMs);
    }
    this.onLog?.({
      time: now,
      nodeId: node.id,
      nodeTitle: node.title,
      nodeType: node.type,
      state,
      durationMs,
      note: null,
    });
  }

  _markSkippedSubtree(nodeId) {
    const node = this.tree.getNode(nodeId);
    if (!node) return;
    this._setState(nodeId, 'skipped');
    for (const childId of node.childIds) this._markSkippedSubtree(childId);
  }

  // tick tree

  *_tickNode(nodeId) {
    const node = this.tree.getNode(nodeId);
    if (!node) return 'FAILURE';

    if (node.type === 'condition') {
      const result = this._evalCondition(node);
      this._setState(nodeId, result.toLowerCase());
      this._logTransition(node, result);
      return result;
    }

    this._setState(nodeId, 'running');
    this._logTransition(node, 'RUNNING');

    let result;
    switch (node.type) {
      case 'root': result = yield* this._tickRoot(node); break;
      case 'sequence': result = yield* this._tickSequence(node); break;
      case 'fallback': result = yield* this._tickFallback(node); break;
      case 'parallel': result = yield* this._tickParallel(node); break;
      case 'inverter': result = yield* this._tickInverter(node); break;
      case 'retry': result = yield* this._tickRetry(node); break;
      case 'repeat': result = yield* this._tickRepeat(node); break;
      case 'timeout': result = yield* this._tickTimeout(node); break;
      case 'action': result = yield* this._tickAction(node); break;
      case 'success': result = 'SUCCESS'; break;
      case 'failure': result = 'FAILURE'; break;
      case 'running': while (true) yield 'RUNNING'; // eslint-disable-line no-unreachable-loop
      default: result = 'FAILURE';
    }

    this._setState(nodeId, result.toLowerCase());
    this._logTransition(node, result);
    return result;
  }

  *_tickRoot(node) {
    const childId = node.childIds[0];
    if (!childId) return 'FAILURE';
    return yield* this._tickNode(childId);
  }

  *_tickSequence(node) {
    const children = node.childIds;
    for (let i = 0; i < children.length; i++) {
      const result = yield* this._tickNode(children[i]);
      if (result === 'FAILURE') {
        for (let j = i + 1; j < children.length; j++) this._markSkippedSubtree(children[j]);
        return 'FAILURE';
      }
    }
    return 'SUCCESS';
  }

  *_tickFallback(node) {
    const children = node.childIds;
    for (let i = 0; i < children.length; i++) {
      const result = yield* this._tickNode(children[i]);
      if (result === 'SUCCESS') {
        for (let j = i + 1; j < children.length; j++) this._markSkippedSubtree(children[j]);
        return 'SUCCESS';
      }
    }
    return 'FAILURE';
  }

  /** Parallel needs to advance ALL children on a single external tick, so it
   * cannot use plain `yield*` (which would suspend on the first still-running
   * child before even touching the rest). Each child gets its own generator,
   * advanced manually once per round. */
  *_tickParallel(node) {
    const total = node.childIds.length;
    if (total === 0) return 'FAILURE';
    let successThreshold = node.params.success_threshold;
    if (successThreshold == null || successThreshold < 0) successThreshold = total;
    const failureThreshold = node.params.failure_threshold ?? 1;

    const slots = node.childIds.map((id) => ({ id, gen: null, result: null }));

    while (true) {
      let successCount = 0, failureCount = 0, runningCount = 0;
      for (const slot of slots) {
        if (slot.result) {
          if (slot.result === 'SUCCESS') successCount++; else failureCount++;
          continue;
        }
        if (!slot.gen) slot.gen = this._tickNode(slot.id);
        const iter = slot.gen.next();
        if (iter.done) {
          slot.result = iter.value;
          if (slot.result === 'SUCCESS') successCount++; else failureCount++;
        } else {
          runningCount++;
        }
      }
      if (successCount >= successThreshold) {
        for (const slot of slots) if (!slot.result) this._markSkippedSubtree(slot.id);
        return 'SUCCESS';
      }
      if (failureCount >= failureThreshold) {
        for (const slot of slots) if (!slot.result) this._markSkippedSubtree(slot.id);
        return 'FAILURE';
      }
      if (runningCount === 0) {
        return failureCount > 0 ? 'FAILURE' : 'SUCCESS';
      }
      yield 'RUNNING';
    }
  }

  *_tickInverter(node) {
    const childId = node.childIds[0];
    if (!childId) return 'FAILURE';
    const result = yield* this._tickNode(childId);
    return result === 'SUCCESS' ? 'FAILURE' : 'SUCCESS';
  }

  *_tickRetry(node) {
    const childId = node.childIds[0];
    if (!childId) return 'FAILURE';
    const maxAttempts = node.params.num_attempts ?? 3;
    let attempts = this.retryAttempts.get(node.id) || 0;
    while (true) {
      const result = yield* this._tickNode(childId);
      if (result === 'SUCCESS') {
        this.retryAttempts.delete(node.id);
        return 'SUCCESS';
      }
      attempts++;
      this.retryAttempts.set(node.id, attempts);
      if (attempts >= maxAttempts) {
        this.retryAttempts.delete(node.id);
        return 'FAILURE';
      }
      yield 'RUNNING';
    }
  }

  *_tickRepeat(node) {
    const childId = node.childIds[0];
    if (!childId) return 'FAILURE';
    const maxCycles = node.params.num_cycles ?? 3;
    let count = this.repeatCounts.get(node.id) || 0;
    while (true) {
      const result = yield* this._tickNode(childId);
      if (result === 'FAILURE') {
        this.repeatCounts.delete(node.id);
        return 'FAILURE';
      }
      count++;
      this.repeatCounts.set(node.id, count);
      if (count >= maxCycles) {
        this.repeatCounts.delete(node.id);
        return 'SUCCESS';
      }
      yield 'RUNNING';
    }
  }

  *_tickTimeout(node) {
    const childId = node.childIds[0];
    if (!childId) return 'FAILURE';
    const msec = node.params.msec ?? 1000;
    const startedAt = Date.now();
    const gen = this._tickNode(childId);
    while (true) {
      const iter = gen.next();
      if (iter.done) return iter.value;
      if (Date.now() - startedAt >= msec) {
        this._markSkippedSubtree(childId);
        return 'FAILURE';
      }
      yield 'RUNNING';
    }
  }

  *_tickAction(node) {
    const configured = node.params.result || 'Success';
    if (configured === 'Running') {
      while (true) yield 'RUNNING'; // eslint-disable-line no-unreachable-loop
    }
    yield 'RUNNING'; // a real action is never instantaneous: show at least one "running" tick
    return configured === 'Failure' ? 'FAILURE' : 'SUCCESS';
  }

  /** User expression evaluated in a restricted sandbox (no access to outer
   * scope). This is not a real robot simulator, it's pure tree logic. */
  _evalCondition(node) {
    const expr = (node.params.expression || '').trim();
    if (!expr) return 'SUCCESS';
    try {
      const fn = new Function(`"use strict"; return (${expr});`);
      return fn() ? 'SUCCESS' : 'FAILURE';
    } catch {
      return 'FAILURE';
    }
  }
}
