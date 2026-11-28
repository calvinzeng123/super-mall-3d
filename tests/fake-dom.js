// 首页（src/title/）测试共用的一个很小的假 DOM：仓库里没有 jsdom，只实现菜单、启动编排用到的那几样
// （createElement、classList、dataset、style、事件、canvas 的 2D 接口吞掉所有调用）。
export class Target {
  constructor() { this.listeners = {}; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { const l = this.listeners[t]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  dispatch(t, ev = {}) { const e = { type: t, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...ev }; for (const fn of [...(this.listeners[t] || [])]) fn(e); return e; }
  count(t) { return (this.listeners[t] || []).length; }
}
export class El extends Target {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.parentNode = null;
    this.dataset = {}; this.attrs = {}; this._text = ''; this.width = 0; this.height = 0;
    const cls = new Set(); this._cls = cls;
    this.classList = { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; if (v) cls.add(c); else cls.delete(c); return v; } };
    const style = {}; this.style = Object.assign(style, { setProperty: (k, v) => { style[k] = v; }, removeProperty: (k) => { delete style[k]; } });
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls.clear(); for (const c of String(v).split(/\s+/).filter(Boolean)) this._cls.add(c); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...cs) { for (let c of cs) { if (typeof c === 'string') { const t = new El('#text', this.ownerDocument); t._text = c; c = t; } c.parentNode = this; this.children.push(c); } }
  appendChild(c) { this.append(c); return c; }
  remove() { const p = this.parentNode; if (p) { p.children = p.children.filter((c) => c !== this); this.parentNode = null; } }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  focus() {}
  getContext() { return paint; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  find(fn) { return this.all().find(fn) || null; }
}
const noop = () => {};
const paint = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? (s) => ({ width: String(s).length * 20 }) : k.startsWith('create') ? () => ({ addColorStop: noop }) : noop), set: (t, k, v) => { t[k] = v; return true; } });
export function fakeDoc() {
  const doc = new Target();
  doc.createElement = (tag) => new El(tag, doc);
  doc.head = new El('head', doc); doc.body = new El('body', doc);
  doc.getElementById = (id) => doc.head.find((e) => e.attrs.id === id) || doc.body.find((e) => e.attrs.id === id);
  return doc;
}
