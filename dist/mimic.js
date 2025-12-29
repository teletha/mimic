const noop = () => {
}, isString = (value2) => typeof value2 === "string" || value2 instanceof String, parseHTML = (text) => {
  let t = document.createElement("template");
  t.innerHTML = text;
  if (text.startsWith("<o-")) Mimic(t.content).children().add("mimic");
  return t.content;
}, all = function* (e, action, stopper) {
  let stop = stopper ? isString(stopper) ? (e2) => e2.matches(stopper) : (e2) => e2 === stopper : (e2) => false;
  while ((e = action(e)) && !stop(e)) yield e;
}, flat = (traverser, filterIndex = 0) => function(...arg) {
  let unique = [...new Set(this.nodes.flatMap((n) => traverser(n, ...arg)))];
  return Mimic(arg[filterIndex] ? unique.filter((e) => e.matches(arg[filterIndex])) : unique);
}, self = (action) => function(...arg) {
  return Mimic(this.nodes.map((n) => action(n, ...arg) || n));
}, value = (action) => function(...arg) {
  if (typeof arg[0] == "function") {
    let component = this.closest(".mimic").nodes[0];
    if (component) {
      let info = component.mimic || (component.mimic = {});
      let renders = info.renders || (info.renders = []);
      renders.push(arg[0]);
    }
    arg[0] = arg[0]();
  }
  let result = this.nodes.map((n) => action(n, ...arg))[0];
  return result === void 0 || result === arg[arg.length - 1] ? this : result;
}, nodify = (v, action) => {
  if (v instanceof Element || v instanceof Text || v instanceof ShadowRoot) {
    action(v);
  } else if (Array.isArray(v)) {
    v.forEach((i) => nodify(i, action));
  } else if (isString(v)) {
    action(v.trim()[0] === "<" ? parseHTML(v) : $(v));
  } else if (v instanceof Mimic) {
    nodify(v.nodes, action);
  }
};
function Mimic(query) {
  let o = Object.create(this ? this.constructor.prototype : Mimic.prototype);
  o.nodes = isString(query) ? [...query.trim()[0] === "<" ? parseHTML(query).children : document.querySelectorAll(query)] : Array.isArray(query) ? query : !query ? [document] : query instanceof Node ? [query] : query instanceof Mimic ? [...query.nodes] : (
    /* query instanceof NodeList || query instanceof HTMLCollection ? */
    [...query]
  );
  return o;
}
Mimic.prototype = {
  each: self((e, action) => action(e)),
  contain: flat((e, selector) => e.querySelector(selector) ? e : [], 9),
  filter: flat((e, condition) => condition(e) ? e : [], 9),
  is: flat((e, selector) => e.matches(selector) ? e : [], 9),
  parent: flat((e) => e.parentNode),
  parents: flat((e) => [...all(e, (x) => x.parentElement)]),
  closest: self((e, selector) => e.closest(selector)),
  children: flat((e) => [...e.children]),
  find: flat((e, selector) => [...e.querySelectorAll(selector)], 9),
  first: flat((e) => e.firstElementChild),
  last: flat((e) => e.lastElementChild),
  prev: flat((e) => e.previousElementSibling),
  prevs: flat((e) => [...all(e, (x) => x.previousElementSibling)]),
  prevUntil: flat((e, selectorOrElement) => [...all(e, (x) => x.previousElementSibling, selectorOrElement)], 1),
  next: flat((e) => e.nextElementSibling),
  nexts: flat((e) => [...all(e, (x) => x.nextElementSibling)]),
  nextUntil: flat((e, selectorOrElement) => [...all(e, (x) => x.nextElementSibling, selectorOrElement)], 1),
  append: self((e, node) => nodify(node, (n) => e.append(n))),
  appendTo: self((e, node) => nodify(node, (n) => n.append(e))),
  prepend: self((e, node) => nodify(node, (n) => e.prepend(n))),
  prependTo: self((e, node) => nodify(node, (n) => n.prepend(e))),
  before: self((e, node) => nodify(node, (n) => e.before(n))),
  insertBefore: self((e, node) => nodify(node, (n) => n.before(e))),
  after: self((e, node) => nodify(node, (n) => e.after(n))),
  insertAfter: self((e, node) => nodify(node, (n) => n.after(e))),
  clone: self((e) => e.cloneNode()),
  make: flat((e, name, items, action) => action ? items.map((item) => {
    let dom = Mimic(e).make(name).model(item);
    action(item, dom);
    return dom;
  }).flatMap((e2) => e2.nodes) : e.appendChild(document.createElement(name)), 9),
  svg: flat((e, path) => e.appendChild(Mimic(`<svg class='svg ${path.substring(path.indexOf("#") + 1)}' viewBox='0 0 24 24'><use href='${path}'/></svg>`).nodes[0]), 9),
  empty: self((e) => e.replaceChildren()),
  clear: self((e) => e.parentNode.removeChild(e)),
  html: value((e, text) => text ? e.innerHTML = text : e.innerHTML),
  text: value((e, text) => text ? e.textContent = text : e.textContent),
  attr: value((e, name, value2) => value2 ? e.setAttribute(name, value2) : e.getAttribute(name)),
  data: value((e, name, value2) => value2 ? e.dataset[name] = value2 : e.dataset[name]),
  css: self((e, style) => isString(style) ? e.style.cssText = style : Object.keys(style).forEach((name) => e.style[name] = style[name])),
  model: value((e, value2) => value2 !== void 0 ? e.model = value2 : e.model),
  value: value((e, value2) => value2 !== void 0 ? e.value = value2 : e.value),
  toString: value((e) => e.outerHTML),
  add: value((e, name) => e.classList.add(name)),
  remove: value((e, name) => e.classList.remove(name)),
  toggle: value((e, name, addAction = noop, removeAction = noop) => e.classList.toggle(name) ? addAction() : removeAction()),
  has: value((e, name) => e.classList.contains(name)),
  set: value((e, nameAndCondition) => Object.keys(nameAndCondition).forEach((name) => e.classList[nameAndCondition[name] ? "add" : "remove"](name))),
  reset: value((e, name) => e.className = name || ""),
  // In cases where event listeners are registered during event processing, we delay the registration of all event listeners
  // because it may cause an infinite loop or supplement the event at an unintended timing.
  on: value((e, type, listener, options) => {
    activatable(e, type);
    setTimeout(() => e.addEventListener(type, (options == null ? void 0 : options.where) ? (event) => event.target.matches(options.where + "," + options.where + " *") ? listener(event) : null : listener, options), 0);
  }),
  off: value((e, type, listener) => e.removeEventListener(type, listener)),
  dispatch: self((e, type) => e.dispatchEvent(new Event(type, { bubbles: true }))),
  show: self((e, show) => e.style.display = show ? "" : "none")
};
"blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change input select submit keydown keypress keyup contextmenu".split(" ").forEach((type) => {
  Mimic.prototype[type] = function(listener, options) {
    return this.on(type, listener, options);
  };
});
"id title href placeholder label name src type".split(" ").forEach((type) => {
  Mimic.prototype[type] = function(value2) {
    return this.attr(type, value2);
  };
});
function activatable(element, type) {
  if (element.closest) {
    let component = element.closest(".mimic");
    if (component) {
      let info = component.mimic || (component.mimic = {});
      let count = ++info[type] || (info[type] = 1);
      if (count === 1) component.addEventListener(type, (e) => {
        var _a;
        console.log("need redraw ", component, e, info);
        (_a = info.renders) == null ? void 0 : _a.forEach((render) => render());
      });
    }
  }
}
export {
  Mimic
};
