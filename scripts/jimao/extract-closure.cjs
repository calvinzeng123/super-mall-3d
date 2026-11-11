#!/usr/bin/env node
/*
 * extract-closure.cjs — mechanical lift of a dependency closure out of an esbuild IIFE bundle
 * (three.js + game code in one scope) into a standalone ES module.
 *
 * Nothing inside a copied unit is rewritten: every unit is emitted as the exact source slice of the bundle.
 * Identifiers that are defined in the three.js part of the bundle are bound from the real package by
 * aliasing the public export name to the bundle's minified identifier.
 *
 * usage:
 *   node extract-closure.cjs --src pretty.js --entries dm,Gg --out rifle.module.js --report rifle.report.json
 *        [--game-start 17146] [--export dm:createWeapon,Gg:createMats] [--ctx dm:0,Gg:0]
 *        [--target-three /path/to/node_modules/three] [--no-emit] [--copy-internals]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// acorn 和 eslint-scope 不是本项目的依赖：先找已安装的（npm i --no-save acorn eslint-scope），再退到云端环境自带的那份。
const need = (name) => { try { return require(name); } catch { return require('/opt/node-tools/node_modules/' + name); } };
const acorn = need('acorn');
const eslintScope = need('eslint-scope');

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const a = { gameStart: 17146, entries: [], exports: {}, ctx: [], emit: true, copyInternals: false, carry: true };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--src') { a.src = v; i++; }
    else if (k === '--entries') { a.entries = v.split(',').filter(Boolean); i++; }
    else if (k === '--out') { a.out = v; i++; }
    else if (k === '--report') { a.report = v; i++; }
    else if (k === '--game-start') { a.gameStart = +v; i++; }
    else if (k === '--export') { for (const p of v.split(',')) { const [m, n] = p.split(':'); a.exports[m] = n; } i++; }
    else if (k === '--ctx') { a.ctx = v.split(',').filter(Boolean).map((p) => { const [n, idx] = p.split(':'); return { name: n, index: +(idx || 0) }; }); i++; }
    else if (k === '--target-three') { a.targetThree = v; i++; }
    else if (k === '--no-emit') a.emit = false;
    else if (k === '--copy-internals') a.copyInternals = true;
    else if (k === '--no-carry') a.carry = false;
    else if (k === '--label') { a.label = v; i++; }
    else throw new Error('unknown argument ' + k);
  }
  if (!a.src) throw new Error('--src required');
  if (!a.entries.length) throw new Error('--entries required');
  return a;
}

// Code of three.js addons that esbuild bundled next to the game code. A unit that matches is not copied;
// it is imported from the real addon instead.
const ADDON_SIGNATURES = [
  { module: 'three/addons/utils/BufferGeometryUtils.js', exportName: 'mergeGeometries', file: 'examples/jsm/utils/BufferGeometryUtils.js', test: (s) => s.includes('THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index') },
  { module: 'three/addons/utils/BufferGeometryUtils.js', exportName: 'mergeAttributes', file: 'examples/jsm/utils/BufferGeometryUtils.js', test: (s) => s.includes('THREE.BufferGeometryUtils: .mergeAttributes() failed') && !s.includes('.mergeGeometries() failed') },
];

// ---------------------------------------------------------------- AST helpers
function setParents(root) {
  const stack = [root];
  root.parent = null;
  while (stack.length) {
    const n = stack.pop();
    for (const k in n) {
      if (k === 'parent' || k === 'loc' || k === 'range') continue;
      const v = n[k];
      if (!v || typeof v !== 'object') continue;
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') { c.parent = n; stack.push(c); } }
      else if (typeof v.type === 'string') { v.parent = n; stack.push(v); }
    }
  }
}
function walk(node, fn) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (fn(n) === false) continue;
    for (const k in n) {
      if (k === 'parent' || k === 'loc' || k === 'range') continue;
      const v = n[k];
      if (!v || typeof v !== 'object') continue;
      if (Array.isArray(v)) { for (let i = v.length - 1; i >= 0; i--) { const c = v[i]; if (c && typeof c.type === 'string') stack.push(c); } }
      else if (typeof v.type === 'string') stack.push(v);
    }
  }
}
// root identifier of a member/call chain:  A.b.c -> A ;  A().b -> A ;  A.b().c -> A
function rootIdent(n) {
  for (;;) {
    if (!n) return null;
    if (n.type === 'Identifier') return n;
    if (n.type === 'MemberExpression') n = n.object;
    else if (n.type === 'CallExpression' || n.type === 'NewExpression') n = n.callee;
    else if (n.type === 'ChainExpression') n = n.expression;
    else return null;
  }
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv);
  const t0 = Date.now();
  const src = fs.readFileSync(args.src, 'utf8');
  const sha = crypto.createHash('sha256').update(src).digest('hex').slice(0, 16);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, ranges: true });
  setParents(ast);

  // the bundle is one IIFE: (() => { ... })()
  if (ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement' || ast.body[0].expression.type !== 'CallExpression') throw new Error('bundle is not a single IIFE');
  const iife = ast.body[0].expression.callee;
  if (!/FunctionExpression$/.test(iife.type)) throw new Error('bundle is not a single IIFE');
  const top = iife.body.body;

  // ---- units
  const units = [];          // in source order
  const byName = new Map();  // name -> [unit]
  const addUnit = (u) => { u.id = units.length; u.refs = new Set(); u.globals = new Set(); u.globalWrites = new Set(); u.directWrites = new Set(); u.memberWrites = new Set(); units.push(u); if (u.name) { if (!byName.has(u.name)) byName.set(u.name, []); byName.get(u.name).push(u); } return u; };
  for (const s of top) {
    if (s.type === 'FunctionDeclaration') addUnit({ kind: 'function', name: s.id.name, node: s, start: s.start, end: s.end, l0: s.loc.start.line, l1: s.loc.end.line });
    else if (s.type === 'VariableDeclaration') {
      for (const d of s.declarations) {
        if (d.id.type !== 'Identifier') throw new Error('destructuring declarator at top level, line ' + d.loc.start.line + ' — not supported');
        addUnit({ kind: 'var', declKind: s.kind, name: d.id.name, node: d, start: d.start, end: d.end, l0: d.loc.start.line, l1: d.loc.end.line });
      }
    } else if (s.type === 'ClassDeclaration') addUnit({ kind: 'class', name: s.id.name, node: s, start: s.start, end: s.end, l0: s.loc.start.line, l1: s.loc.end.line });
    else addUnit({ kind: 'stmt', name: null, node: s, start: s.start, end: s.end, l0: s.loc.start.line, l1: s.loc.end.line });
  }
  const duplicateNames = [...byName].filter(([, us]) => us.length > 1).map(([n]) => n);
  const starts = units.map((u) => u.start);
  const unitAt = (pos) => {
    let lo = 0, hi = units.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= pos) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    if (ans < 0) return null;
    const u = units[ans];
    return pos < u.end ? u : null;
  };

  // ---- three export table:  <helper>(<ns>, { PublicName: () => min, ... })
  let exportStmt = null;
  for (const u of units) {
    if (u.kind !== 'stmt') continue;
    const e = u.node.type === 'ExpressionStatement' && u.node.expression;
    if (e && e.type === 'CallExpression' && e.callee.type === 'Identifier' && e.arguments.length === 2 && e.arguments[0].type === 'Identifier' && e.arguments[1].type === 'ObjectExpression' &&
      e.arguments[1].properties.length > 200 && e.arguments[1].properties.every((p) => p.value.type === 'ArrowFunctionExpression' && p.value.body.type === 'Identifier')) { exportStmt = u; break; }
  }
  if (!exportStmt) throw new Error('three export table not found');
  const exportHelper = exportStmt.node.expression.callee.name;
  const threeNs = exportStmt.node.expression.arguments[0].name;
  const min2pub = new Map();
  let exportCount = 0;
  for (const p of exportStmt.node.expression.arguments[1].properties) {
    const pub = p.key.type === 'Identifier' ? p.key.name : p.key.value;
    const min = p.value.body.name;
    if (!min2pub.has(min)) min2pub.set(min, []);
    min2pub.get(min).push(pub);
    exportCount++;
  }

  // ---- regions
  for (const u of units) {
    // units in front of the three export table are the bundler's own runtime helpers (esbuild __defProp/__export):
    // they are not three.js, so they are copied like game code when something in the closure needs them
    u.region = u.l0 >= args.gameStart ? 'game' : u.start < exportStmt.start && u.name !== threeNs ? 'runtime' : 'three';
    if (u.region === 'game' && u.kind === 'function') {
      const text = src.slice(u.start, u.end);
      for (const sig of ADDON_SIGNATURES) if (sig.test(text)) { u.region = 'addon'; u.addon = sig; break; }
    }
  }

  // ---- scope analysis
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script', ignoreEval: true });
  const topScope = sm.acquire(iife);
  if (!topScope) throw new Error('no scope for the IIFE');
  const resolvedAt = new Map(); // identifier start offset -> Variable (any scope)
  for (const sc of sm.scopes) for (const r of sc.references) if (r.resolved) resolvedAt.set(r.identifier.range[0], r.resolved);
  const topVarOf = new Map(); // identifier start -> top-level name
  for (const v of topScope.variables) {
    if (v.name === 'arguments' && v.defs.length === 0) continue;
    for (const r of v.references) {
      const u = unitAt(r.identifier.range[0]);
      if (!u) continue;
      topVarOf.set(r.identifier.range[0], v.name);
      const declaredHere = u.name === v.name;
      if (!declaredHere) { u.refs.add(v.name); if (r.isWrite()) u.directWrites.add(v.name); }
    }
  }
  // free identifiers (resolve to no binding of the bundle => globals)
  for (const r of sm.globalScope.through) {
    const u = unitAt(r.identifier.range[0]);
    if (!u) continue;
    u.globals.add(r.identifier.name);
    if (r.isWrite()) u.globalWrites.add(r.identifier.name);
  }
  // member writes to top-level bindings:  X.a.b = ...,  X.a++ , delete X.a
  walk(iife.body, (n) => {
    let target = null;
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression') target = n.left;
    else if (n.type === 'UpdateExpression' && n.argument.type === 'MemberExpression') target = n.argument;
    else if (n.type === 'UnaryExpression' && n.operator === 'delete' && n.argument.type === 'MemberExpression') target = n.argument;
    if (!target) return;
    const r = rootIdent(target);
    if (!r) return;
    const name = topVarOf.get(r.range[0]);
    if (!name) return;
    const u = unitAt(r.range[0]);
    if (u && u.name !== name) u.memberWrites.add(name);
  });

  // ---- side-effect statement targets (what the statement mutates / calls)
  const isTop = (id) => id && topVarOf.has(id.range[0]) ? topVarOf.get(id.range[0]) : null;
  function exprTargets(e, out) {
    if (!e) return;
    switch (e.type) {
      case 'AssignmentExpression': { const n = isTop(rootIdent(e.left)); if (n) out.add(n); break; }
      case 'UpdateExpression': { const n = isTop(rootIdent(e.argument)); if (n) out.add(n); break; }
      case 'CallExpression': {
        if (e.callee.type === 'Identifier' && e.callee.name === exportHelper) { const n = isTop(rootIdent(e.arguments[0])); if (n) out.add(n); }
        else { const n = isTop(rootIdent(e.callee)); if (n) out.add(n); }
        break;
      }
      case 'SequenceExpression': for (const x of e.expressions) exprTargets(x, out); break;
      case 'LogicalExpression': exprTargets(e.left, out); exprTargets(e.right, out); break;
      case 'ConditionalExpression': exprTargets(e.consequent, out); exprTargets(e.alternate, out); break;
      case 'AwaitExpression': case 'UnaryExpression': exprTargets(e.argument, out); break;
      default: break;
    }
  }
  function stmtTargets(s, out) {
    switch (s.type) {
      case 'ExpressionStatement': exprTargets(s.expression, out); break;
      case 'BlockStatement': for (const x of s.body) stmtTargets(x, out); break;
      case 'ForOfStatement': case 'ForInStatement':
        walk(s.right, (n) => { if (n.type === 'Identifier') { const t = isTop(n); if (t) out.add(t); } });
        stmtTargets(s.body, out); break;
      case 'ForStatement': case 'WhileStatement': case 'DoWhileStatement': stmtTargets(s.body, out); break;
      case 'IfStatement': stmtTargets(s.consequent, out); if (s.alternate) stmtTargets(s.alternate, out); break;
      case 'TryStatement': stmtTargets(s.block, out); break;
      default: break;
    }
  }
  for (const u of units) if (u.kind === 'stmt') { u.targets = new Set(); stmtTargets(u.node, u.targets); }

  // ---- closure
  for (const e of args.entries) if (!byName.has(e)) throw new Error('entry "' + e + '" is not a top-level binding of the bundle');
  const included = new Set();      // game units (ids)
  const includedNames = new Set(); // names of copied game bindings
  const threeRefs = new Map();     // minified three name -> Set(referencing game unit label)
  const addonRefs = new Map();
  const internalCopied = new Set();
  const label = (u) => (u.name || ('stmt@' + u.l0)) + '@' + u.l0;
  const queue = [];
  const push = (name, from) => queue.push([name, from]);
  for (const e of args.entries) push(e, null);
  const carried = new Set();
  function drain() {
    while (queue.length) {
      const [name, from] = queue.pop();
      const us = byName.get(name);
      if (!us) continue;
      for (const u of us) {
        if (u.region === 'three') {
          const isPublic = min2pub.has(name) || name === threeNs;
          if (!isPublic && args.copyInternals) {
            if (!internalCopied.has(u.id)) { internalCopied.add(u.id); for (const r of u.refs) push(r, u); }
          }
          if (!threeRefs.has(name)) threeRefs.set(name, new Set());
          if (from) threeRefs.get(name).add(label(from));
          continue;
        }
        if (u.region === 'addon') { if (!addonRefs.has(name)) addonRefs.set(name, new Set()); if (from) addonRefs.get(name).add(label(from)); continue; }
        if (included.has(u.id)) continue;
        included.add(u.id); includedNames.add(name);
        for (const r of u.refs) push(r, u);
      }
    }
  }
  drain();
  if (args.carry) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const u of units) {
        if (u.kind !== 'stmt' || u.region !== 'game' || carried.has(u.id)) continue;
        if ([...u.targets].some((t) => includedNames.has(t))) { carried.add(u.id); for (const r of u.refs) push(r, u); changed = true; }
      }
      drain();
    }
  }

  // ---- classify three references
  const aliases = [];     // {min, pub}
  const nonPublic = [];   // {min, line, kind, usedBy}
  let nsReferenced = false;
  for (const [min, users] of [...threeRefs].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    if (min === threeNs) { nsReferenced = true; continue; }
    const pubs = min2pub.get(min);
    if (pubs) aliases.push({ min, pub: pubs[0], also: pubs.slice(1), usedBy: users.size });
    else { const u = byName.get(min)[0]; nonPublic.push({ min, line: u.l0, kind: u.kind, usedBy: [...users].slice(0, 8), usedByCount: users.size, head: src.slice(u.start, Math.min(u.end, u.start + 140)).replace(/\s+/g, ' ') }); }
  }
  aliases.sort((a, b) => a.pub < b.pub ? -1 : 1);
  const addons = [...addonRefs].map(([min, users]) => { const u = byName.get(min)[0]; return { min, exportName: u.addon.exportName, module: u.addon.module, file: u.addon.file, line: u.l0, usedBy: users.size }; });

  // ---- copied set, in source order
  const copied = units.filter((u) => included.has(u.id) || carried.has(u.id) || internalCopied.has(u.id));
  const lineSet = new Set();
  let bytes = 0;
  for (const u of copied) { for (let l = u.l0; l <= u.l1; l++) lineSet.add(l); bytes += u.end - u.start; }
  const kinds = { function: 0, var: 0, class: 0, stmt: 0 };
  for (const u of copied) kinds[u.kind]++;
  const gameCopied = copied.filter((u) => u.region === 'game');
  const runtimeCopied = copied.filter((u) => u.region === 'runtime').map((u) => u.name);
  const span = gameCopied.length ? [Math.min(...gameCopied.map((u) => u.l0)), Math.max(...gameCopied.map((u) => u.l1))] : null;

  // ---- (d) side-effect statements touching copied units
  const sideEffects = [];
  for (const u of units) {
    if (u.kind !== 'stmt' || u.region !== 'game') continue;
    const touched = [...u.refs].filter((r) => includedNames.has(r));
    if (!touched.length && !carried.has(u.id)) continue;
    sideEffects.push({ line: u.l0, endLine: u.l1, carried: carried.has(u.id), targets: [...u.targets], touches: touched.slice(0, 12), touchesCount: touched.length, head: src.slice(u.start, Math.min(u.end, u.start + 110)).replace(/\s+/g, ' ') });
  }

  // ---- (e) free identifiers
  const freeIds = new Map();
  const implicitGlobalWrites = new Set();
  for (const u of copied) { for (const g of u.globals) { if (!freeIds.has(g)) freeIds.set(g, 0); freeIds.set(g, freeIds.get(g) + 1); } for (const g of u.globalWrites) implicitGlobalWrites.add(g); }

  // ---- (f) copied state that is written by units OUTSIDE the closure (state initialised elsewhere)
  const outsideWriters = [];
  for (const u of units) {
    if (u.region !== 'game' || included.has(u.id) || carried.has(u.id)) continue;
    const dw = [...u.directWrites].filter((n) => includedNames.has(n));
    const mw = [...u.memberWrites].filter((n) => includedNames.has(n));
    if (dw.length || mw.length) outsideWriters.push({ writer: label(u), kind: u.kind, assigns: dw, mutatesMembersOf: mw });
  }

  // ---- (g) shared-context member paths of entry factories (static)
  const ctxReports = [];
  for (const c of args.ctx) ctxReports.push(analyzeContext(c.name, c.index));

  function fnNodeOf(u) {
    if (u.kind === 'function') return u.node;
    if (u.kind === 'var' && u.node.init && /Function(Expression)?$/.test(u.node.init.type)) return u.node.init;
    // a class: the context arrives through the constructor
    const cls = u.kind === 'class' ? u.node : (u.kind === 'var' && u.node.init && u.node.init.type === 'ClassExpression' ? u.node.init : null);
    if (cls) { const c = cls.body.body.find((m) => m.type === 'MethodDefinition' && m.kind === 'constructor'); return c ? c.value : null; }
    return null;
  }
  function analyzeContext(name, index) {
    const out = new Map(); // path -> Set(kind)
    const passedTo = new Set();
    const opaque = [];
    const visitedFn = new Set();
    const visitedVar = new Set();
    const rec = (p, kind) => { const k = p.join('.'); if (!k) return; if (!out.has(k)) out.set(k, new Set()); out.get(k).add(kind); };
    function enterFn(uName, idx, prefix) {
      const key = uName + ':' + idx + ':' + prefix.join('.');
      if (visitedFn.has(key)) return; visitedFn.add(key);
      const us = byName.get(uName); if (!us) return;
      const fn = fnNodeOf(us[0]); if (!fn) return;
      const p = fn.params[idx]; if (!p) return;
      const vars = sm.getDeclaredVariables(fn);
      bindPattern(p, prefix, (id) => vars.find((v) => v.name === id.name && v.defs.some((d) => d.name === id)));
    }
    function bindPattern(p, prefix, find) {
      if (p.type === 'Identifier') { const v = find(p); if (v) trackVar(v, prefix); }
      else if (p.type === 'AssignmentPattern') bindPattern(p.left, prefix, find);
      else if (p.type === 'ObjectPattern') {
        for (const prop of p.properties) {
          if (prop.type === 'RestElement') { opaque.push('rest destructuring of ' + (prefix.join('.') || 'ctx')); continue; }
          const key = prop.key.type === 'Identifier' && !prop.computed ? prop.key.name : prop.key.type === 'Literal' ? String(prop.key.value) : '[*]';
          rec(prefix.concat(key), 'R');
          bindPattern(prop.value, prefix.concat(key), find);
        }
      }
    }
    function trackVar(variable, prefix) {
      const key = variable.scope.block.range[0] + ':' + variable.name + ':' + prefix.join('.');
      if (visitedVar.has(key)) return; visitedVar.add(key);
      for (const ref of variable.references) {
        if (ref.isWrite() && !ref.isRead()) continue;
        climbAndFlow(ref.identifier, prefix);
      }
    }
    function climbAndFlow(start, prefix) {
      let node = start;
      const p = prefix.slice();
      let stop = false;
      while (!stop) {
        const par = node.parent;
        if (par && par.type === 'MemberExpression' && par.object === node) {
          if (!par.computed && par.property.type === 'Identifier') p.push(par.property.name);
          else if (par.computed && par.property.type === 'Literal') p.push(String(par.property.value));
          else { p.push('[*]'); stop = true; }
          node = par;
        } else if (par && par.type === 'ChainExpression') node = par;
        else break;
      }
      flow(node, p);
    }
    // the context (or a part of it) stored on the instance:  this.G = ctx  ->  follow every this.G... inside the class
    function trackThisField(assignTarget, prefix) {
      let cls = assignTarget;
      while (cls && cls.type !== 'ClassBody') cls = cls.parent;
      if (!cls) { opaque.push('context stored on `this.' + assignTarget.property.name + '` outside a class at line ' + assignTarget.loc.start.line); return; }
      const field = assignTarget.property.name;
      const key = 'this:' + cls.range[0] + ':' + field + ':' + prefix.join('.');
      if (visitedVar.has(key)) return; visitedVar.add(key);
      walk(cls, (n) => {
        if (n.type === 'MemberExpression' && n.object.type === 'ThisExpression' && !n.computed && n.property.type === 'Identifier' && n.property.name === field) {
          if (n.parent && n.parent.type === 'AssignmentExpression' && n.parent.left === n) return;
          climbAndFlow(n, prefix);
        }
      });
    }
    function flow(node, p) {
      const par = node.parent;
      if (!par) return;
      if (par.type === 'CallExpression' || par.type === 'NewExpression') {
        if (par.callee === node) { rec(p, 'C'); return; }
        const k = par.arguments.indexOf(node);
        if (k >= 0) {
          const calleeTop = par.callee.type === 'Identifier' ? topVarOf.get(par.callee.range[0]) : null;
          if (calleeTop && byName.has(calleeTop) && byName.get(calleeTop)[0].region === 'game' && fnNodeOf(byName.get(calleeTop)[0])) {
            if (!p.length) passedTo.add(calleeTop);
            rec(p, 'R'); enterFn(calleeTop, k, p); return;
          }
          rec(p, 'R');
          if (!p.length) opaque.push('whole context passed to ' + src.slice(par.callee.start, Math.min(par.callee.end, par.callee.start + 40)) + '() at line ' + par.loc.start.line);
          return;
        }
      }
      if (par.type === 'VariableDeclarator' && par.init === node) { rec(p, 'R'); alias(par.id, p, par); return; }
      if (par.type === 'AssignmentExpression') {
        if (par.left === node) { rec(p, 'W'); return; }
        if (par.right === node && par.left.type === 'Identifier') { rec(p, 'R'); const v = resolvedAt.get(par.left.range[0]); if (v) trackVar(v, p); return; }
        if (par.right === node && par.left.type === 'MemberExpression' && par.left.object.type === 'ThisExpression' && !par.left.computed && par.left.property.type === 'Identifier') { rec(p, 'R'); trackThisField(par.left, p); return; }
        if (par.right === node && !p.length) { rec(p, 'R'); opaque.push('whole context stored in ' + src.slice(par.left.start, Math.min(par.left.end, par.left.start + 40)) + ' at line ' + par.loc.start.line); return; }
      }
      if (par.type === 'UpdateExpression') { rec(p, 'W'); return; }
      if (par.type === 'LogicalExpression' || par.type === 'ConditionalExpression' || par.type === 'SequenceExpression' || par.type === 'AwaitExpression') {
        rec(p, 'R');
        // value may flow on (e.g.  let r = i.renderer || i.render && i.render.renderer)
        if (par.type === 'ConditionalExpression' && par.test === node) return;
        if (par.type === 'SequenceExpression' && par.expressions[par.expressions.length - 1] !== node) return;
        if (par.type === 'LogicalExpression' && par.left === node && par.operator === '&&') return;
        flow(par, p);
        return;
      }
      rec(p, 'R');
      if (!p.length && (par.type === 'ReturnStatement' || par.type === 'Property' || par.type === 'ArrayExpression' || par.type === 'SpreadElement')) opaque.push('whole context escapes via ' + par.type + ' at line ' + par.loc.start.line);
    }
    function alias(id, p, declarator) {
      const decl = declarator.parent; // VariableDeclaration
      const vars = sm.getDeclaredVariables(decl);
      bindPattern(id, p, (x) => vars.find((v) => v.name === x.name && v.defs.some((d) => d.name === x)));
    }
    enterFn(name, index, []);
    const paths = [...out].map(([k, kinds]) => ({ path: k, use: [...kinds].sort().join('') })).sort((a, b) => a.path < b.path ? -1 : 1);
    const topLevel = [...new Set(paths.map((x) => x.path.split('.')[0]))];
    return { entry: name, paramIndex: index, topLevelMembers: topLevel, paths, wholeContextPassedTo: [...passedTo], opaque };
  }

  // ---- target three check
  let targetCheck = null;
  const finish = async () => {
    if (args.targetThree) {
      targetCheck = { path: args.targetThree };
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(args.targetThree, 'package.json'), 'utf8'));
        targetCheck.version = pkg.version;
        const mod = await import(path.join(args.targetThree, 'build/three.module.js'));
        targetCheck.revision = mod.REVISION;
        targetCheck.missing = aliases.filter((a) => !(a.pub in mod)).map((a) => a.pub);
        targetCheck.addonMissing = addons.filter((a) => { try { return !new RegExp('\\b' + a.exportName + '\\b').test(fs.readFileSync(path.join(args.targetThree, a.file), 'utf8')); } catch { return true; } }).map((a) => a.exportName);
      } catch (e) { targetCheck.error = String(e && e.message || e); }
    }

    // ---- emit
    const allIdents = new Set();
    walk(iife.body, (n) => { if (n.type === 'Identifier') allIdents.add(n.name); });
    let nsName = 'THREE';
    while (allIdents.has(nsName)) nsName = '_' + nsName;
    const exportLines = [];
    for (const e of args.entries) { exportLines.push(e); if (args.exports[e]) exportLines.push(e + ' as ' + args.exports[e]); }

    const report = {
      label: args.label || args.entries.join(','),
      source: { file: path.resolve(args.src), sha256_16: sha, lines: src.split('\n').length, topLevelUnits: units.length, gameStartLine: args.gameStart, threeExportTable: { helper: exportHelper, namespace: threeNs, names: exportCount } },
      entries: args.entries,
      a_copied: { units: copied.length, functions: kinds.function, varDeclarators: kinds.var, classes: kinds.class, carriedStatements: kinds.stmt, distinctSourceLines: lineSet.size, bytes, lineSpan: span, threeInternalsCopied: internalCopied.size, bundlerRuntimeHelpersCopied: runtimeCopied },
      b_threeAliases: { count: aliases.length, names: aliases.map((a) => a.pub), map: Object.fromEntries(aliases.map((a) => [a.pub, a.min])), namespaceObjectReferenced: nsReferenced },
      b2_addonImports: addons,
      c_nonPublicThreeInternals: nonPublic,
      d_sideEffectStatements: sideEffects,
      e_freeIdentifiers: Object.fromEntries([...freeIds].sort((a, b) => a[0] < b[0] ? -1 : 1)),
      e2_implicitGlobalWrites: [...implicitGlobalWrites],
      f_writersOutsideClosure: outsideWriters,
      g_context: ctxReports,
      duplicateTopLevelNames: duplicateNames,
      targetThree: targetCheck,
      copiedUnits: copied.map((u) => ({ name: u.name, kind: u.kind, region: u.region, lines: [u.l0, u.l1], bytes: u.end - u.start })),
      ms: Date.now() - t0,
    };

    if (args.emit && args.out) {
      const L = [];
      L.push('// =====================================================================================');
      L.push('// AUTO-GENERATED by extract-closure.cjs — mechanical lift, no code inside the units was rewritten.');
      L.push('// source  : ' + path.basename(args.src) + '  (sha256 ' + sha + '…, ' + report.source.lines + ' lines)');
      L.push('// entries : ' + args.entries.join(', '));
      L.push('//');
      L.push('// (a) copied units          : ' + copied.length + '  (' + kinds.function + ' functions, ' + kinds.var + ' var declarators, ' + kinds.class + ' classes, ' + kinds.stmt + ' carried side-effect statements)');
      L.push('//     distinct source lines : ' + lineSet.size + '   bytes: ' + bytes + '   line span: ' + (span ? span[0] + '–' + span[1] : '-'));
      L.push('// (b) three public names aliased (' + aliases.length + '): ' + aliases.map((a) => a.pub + '→' + a.min).join(', '));
      L.push('//     addon imports (' + addons.length + '): ' + addons.map((a) => a.exportName + '→' + a.min + ' from ' + a.module).join(', '));
      L.push('// (c) NON-PUBLIC three internals referenced (' + nonPublic.length + '): ' + (nonPublic.map((n) => n.min + '@' + n.line).join(', ') || 'none'));
      L.push('// (d) top-level side-effect statements touching copied units (' + sideEffects.length + '):');
      for (const s of sideEffects) L.push('//       line ' + s.line + (s.carried ? '  CARRIED     ' : '  not carried ') + ' targets=[' + s.targets.join(',') + ']  ' + s.head.slice(0, 80));
      L.push('// (e) free identifiers (must be globals of the host) (' + freeIds.size + '): ' + [...freeIds.keys()].sort().join(', '));
      if (implicitGlobalWrites.size) L.push('//     WRITES to undeclared globals (strict-mode hazard): ' + [...implicitGlobalWrites].join(', '));
      L.push('// (f) copied bindings written by units outside the closure (' + outsideWriters.length + '): ' + (outsideWriters.map((w) => w.writer + '→' + [...w.assigns, ...w.mutatesMembersOf.map((m) => m + '.*')].join('/')).join(', ') || 'none'));
      if (targetCheck) L.push('// target three: ' + (targetCheck.error ? 'check failed: ' + targetCheck.error : 'r' + targetCheck.revision + ' — aliased names missing there: ' + (targetCheck.missing.join(', ') || 'none') + '; addon exports missing: ' + (targetCheck.addonMissing.join(', ') || 'none')));
      L.push('// =====================================================================================');
      L.push("import * as " + nsName + " from 'three';");
      const byModule = new Map();
      for (const a of addons) { if (!byModule.has(a.module)) byModule.set(a.module, []); byModule.get(a.module).push(a.exportName + ' as ' + a.min); }
      for (const [m, names] of byModule) L.push('import { ' + names.join(', ') + " } from '" + m + "';");
      if (aliases.length) L.push('const { ' + aliases.map((a) => a.pub === a.min ? a.pub : a.pub + ': ' + a.min).join(', ') + ' } = ' + nsName + ';');
      if (nsReferenced) L.push('const ' + threeNs + ' = ' + nsName + ';');
      if (!args.copyInternals) for (const n of nonPublic) L.push('const ' + n.min + ' = /* NON-PUBLIC three internal, bundle line ' + n.line + ' */ undefined;');
      L.push('');
      for (const u of copied) {
        const text = src.slice(u.start, u.end);
        const tag = u.region === 'three' ? '  [three internal copied]' : u.region === 'runtime' ? '  [bundler runtime helper]' : '';
        L.push('// ---- ' + (u.name || 'side-effect statement') + '  (bundle line ' + u.l0 + (u.l1 !== u.l0 ? '–' + u.l1 : '') + ')' + tag);
        if (u.kind === 'var') L.push('var ' + text + ';');
        else L.push(text);
      }
      L.push('');
      L.push('export { ' + exportLines.join(', ') + ' };');
      const outText = L.join('\n') + '\n';
      // self-check: the emitted file must parse as an ES module (strict) and every free identifier must be accounted for
      let selfCheck = { parsedAsModule: false };
      try {
        const m = acorn.parse(outText, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
        selfCheck.parsedAsModule = true;
        const sm2 = eslintScope.analyze(m, { ecmaVersion: 2022, sourceType: 'module' });
        const through = new Set(sm2.globalScope.through.map((r) => r.identifier.name));
        selfCheck.freeIdentifiersInEmittedModule = [...through].sort();
        selfCheck.unexpectedFree = [...through].filter((n) => !freeIds.has(n)).sort();
      } catch (e) { selfCheck.error = String(e && e.message || e); }
      report.emitted = { file: path.resolve(args.out), lines: outText.split('\n').length - 1, bytes: Buffer.byteLength(outText), selfCheck };
      fs.writeFileSync(args.out, outText);
    }
    if (args.report) fs.writeFileSync(args.report, JSON.stringify(report, null, 1));

    // console summary
    const s = report;
    console.log('== ' + s.label + ' ==');
    console.log('(a) copied units: ' + s.a_copied.units + ' (fn ' + s.a_copied.functions + ', var ' + s.a_copied.varDeclarators + ', stmt ' + s.a_copied.carriedStatements + ')  lines ' + s.a_copied.distinctSourceLines + '  bytes ' + s.a_copied.bytes + '  span ' + (span ? span.join('–') : '-'));
    console.log('(b) three aliases: ' + s.b_threeAliases.count + '   addon imports: ' + addons.map((a) => a.exportName).join(',') + (nsReferenced ? '   [three namespace object referenced]' : ''));
    console.log('(c) non-public three internals: ' + nonPublic.length + (nonPublic.length ? '  ' + nonPublic.map((n) => n.min + '@' + n.line).join(', ') : ''));
    console.log('(d) side-effect statements touching closure: ' + sideEffects.length + ' (carried ' + sideEffects.filter((x) => x.carried).length + ')');
    console.log('(e) free identifiers: ' + [...freeIds.keys()].sort().join(', ') + (implicitGlobalWrites.size ? '   IMPLICIT GLOBAL WRITES: ' + [...implicitGlobalWrites].join(',') : ''));
    console.log('(f) writers outside closure: ' + outsideWriters.length);
    for (const c of ctxReports) console.log('(g) ctx of ' + c.entry + ': ' + c.topLevelMembers.join(', ') + (c.wholeContextPassedTo.length ? '   [whole ctx passed to: ' + c.wholeContextPassedTo.join(', ') + ']' : '') + (c.opaque.length ? '   [opaque: ' + c.opaque.join('; ') + ']' : ''));
    if (targetCheck) console.log('target three: ' + JSON.stringify(targetCheck));
    if (report.emitted) console.log('emitted ' + report.emitted.file + ' (' + report.emitted.lines + ' lines, ' + report.emitted.bytes + ' bytes) selfCheck=' + JSON.stringify(report.emitted.selfCheck.error || { parsed: report.emitted.selfCheck.parsedAsModule, unexpectedFree: report.emitted.selfCheck.unexpectedFree }));
    console.log('ms ' + (Date.now() - t0));
  };
  return finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
