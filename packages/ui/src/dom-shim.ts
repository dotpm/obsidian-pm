/**
 * Obsidian extends the DOM prototypes with helpers such as `createDiv`, `empty` and
 * `setText`, and the primitives and composites are written against them. Outside Obsidian
 * (tests, a web page) this installs equivalents; inside Obsidian every helper already
 * exists and nothing is touched.
 */

type AttrValue = string | number | boolean | null

interface ElementInfo {
  cls?: string | string[]
  text?: string | DocumentFragment
  attr?: Record<string, AttrValue>
  title?: string
  parent?: Node
  value?: string
  type?: string
  prepend?: boolean
  placeholder?: string
  href?: string
}

function classList(classes: string | string[]): string[] {
  return (Array.isArray(classes) ? classes : classes.split(' ')).filter(Boolean)
}

function setAttribute(el: Element, name: string, value: AttrValue): void {
  if (value === null) el.removeAttribute(name)
  else el.setAttribute(name, String(value))
}

function applyInfo(el: Element, info: ElementInfo | string | undefined): void {
  if (info === undefined) return
  const o: ElementInfo = typeof info === 'string' ? { cls: info } : info
  if (o.cls) el.classList.add(...classList(o.cls))
  if (o.text !== undefined) setText(el, o.text)
  if (o.attr) for (const [name, value] of Object.entries(o.attr)) setAttribute(el, name, value)
  if (o.title !== undefined) el.setAttribute('title', o.title)
  if (o.value !== undefined) (el as HTMLInputElement).value = o.value
  if (o.type !== undefined) el.setAttribute('type', o.type)
  if (o.placeholder !== undefined) el.setAttribute('placeholder', o.placeholder)
  if (o.href !== undefined) el.setAttribute('href', o.href)
}

function attach(el: Node, container: Node | undefined, info: ElementInfo | string | undefined): void {
  const o: ElementInfo = typeof info === 'string' || info === undefined ? {} : info
  const parent = o.parent ?? container
  if (!parent) return
  if (o.prepend) parent.insertBefore(el, parent.firstChild)
  else parent.appendChild(el)
}

function documentOf(node: Node | undefined): Document {
  if (node instanceof Document) return node
  return node?.ownerDocument ?? document
}

function setText(el: Node, value: string | DocumentFragment): void {
  if (typeof value === 'string') {
    el.textContent = value
    return
  }
  empty(el)
  el.appendChild(value)
}

function empty(node: Node): void {
  while (node.lastChild) node.removeChild(node.lastChild)
}

function createElIn(
  container: Node | undefined,
  tag: string,
  info?: ElementInfo | string,
  callback?: (el: HTMLElement) => void
): HTMLElement {
  const el = documentOf(container).createElement(tag)
  applyInfo(el, info)
  attach(el, container, info)
  callback?.(el)
  return el
}

function createSvgIn(
  container: Node | undefined,
  tag: string,
  info?: ElementInfo | string,
  callback?: (el: SVGElement) => void
): SVGElement {
  const el = documentOf(container).createElementNS('http://www.w3.org/2000/svg', tag)
  applyInfo(el, info)
  attach(el, container, info)
  callback?.(el)
  return el
}

function setCssStyles(this: HTMLElement | SVGElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(this.style, styles)
}

function setCssProps(this: HTMLElement | SVGElement, props: Record<string, string>): void {
  for (const [name, value] of Object.entries(props)) this.style.setProperty(name, value)
}

const nodeMethods = {
  createEl(this: Node, tag: string, info?: ElementInfo | string, callback?: (el: HTMLElement) => void) {
    return createElIn(this, tag, info, callback)
  },
  createDiv(this: Node, info?: ElementInfo | string, callback?: (el: HTMLElement) => void) {
    return createElIn(this, 'div', info, callback)
  },
  createSpan(this: Node, info?: ElementInfo | string, callback?: (el: HTMLElement) => void) {
    return createElIn(this, 'span', info, callback)
  },
  createSvg(this: Node, tag: string, info?: ElementInfo | string, callback?: (el: SVGElement) => void) {
    return createSvgIn(this, tag, info, callback)
  },
  detach(this: Node) {
    this.parentNode?.removeChild(this)
  },
  empty(this: Node) {
    empty(this)
  },
  insertAfter(this: Node, node: Node, child: Node | null) {
    return this.insertBefore(node, child ? child.nextSibling : this.firstChild)
  },
  indexOf(this: Node, other: Node) {
    return Array.prototype.indexOf.call(this.childNodes, other)
  },
  appendText(this: Node, value: string) {
    this.appendChild(documentOf(this).createTextNode(value))
  }
}

const elementMethods = {
  getText(this: Element) {
    return this.textContent ?? ''
  },
  setText(this: Element, value: string | DocumentFragment) {
    setText(this, value)
  },
  addClass(this: Element, ...classes: string[]) {
    this.classList.add(...classes.flatMap(classList))
  },
  addClasses(this: Element, classes: string[]) {
    this.classList.add(...classes.flatMap(classList))
  },
  removeClass(this: Element, ...classes: string[]) {
    this.classList.remove(...classes.flatMap(classList))
  },
  removeClasses(this: Element, classes: string[]) {
    this.classList.remove(...classes.flatMap(classList))
  },
  toggleClass(this: Element, classes: string | string[], value: boolean) {
    for (const cls of classList(classes)) this.classList.toggle(cls, value)
  },
  hasClass(this: Element, cls: string) {
    return this.classList.contains(cls)
  },
  setAttr(this: Element, name: string, value: AttrValue) {
    setAttribute(this, name, value)
  },
  setAttrs(this: Element, attrs: Record<string, AttrValue>) {
    for (const [name, value] of Object.entries(attrs)) setAttribute(this, name, value)
  },
  getAttr(this: Element, name: string) {
    return this.getAttribute(name)
  },
  matchParent(this: Element, selector: string, lastParent?: Element) {
    const found = this.closest(selector)
    return found && (!lastParent || lastParent.contains(found)) ? found : null
  },
  find(this: Element, selector: string) {
    return this.querySelector(selector)
  },
  findAll(this: Element, selector: string) {
    return Array.from(this.querySelectorAll(selector))
  },
  findAllSelf(this: Element, selector: string) {
    const found = Array.from(this.querySelectorAll(selector))
    return this.matches(selector) ? [this, ...found] : found
  },
  isActiveElement(this: Element) {
    return this.ownerDocument.activeElement === this
  }
}

const htmlElementMethods = {
  show(this: HTMLElement) {
    this.style.removeProperty('display')
  },
  hide(this: HTMLElement) {
    this.style.setProperty('display', 'none')
  },
  toggle(this: HTMLElement, show: boolean) {
    if (show) this.style.removeProperty('display')
    else this.style.setProperty('display', 'none')
  },
  toggleVisibility(this: HTMLElement, visible: boolean) {
    if (visible) this.style.removeProperty('visibility')
    else this.style.setProperty('visibility', 'hidden')
  },
  isShown(this: HTMLElement) {
    if (!this.isConnected || this.style.display === 'none') return false
    for (let node = this.parentElement; node; node = node.parentElement) {
      if (node.style.display === 'none') return false
    }
    return true
  },
  setCssStyles,
  setCssProps,
  onClickEvent(this: HTMLElement, listener: (ev: MouseEvent) => unknown, options?: boolean | AddEventListenerOptions) {
    this.addEventListener('click', listener, options)
  }
}

function install(target: object, methods: Record<string, unknown>): void {
  for (const [name, fn] of Object.entries(methods)) {
    if (name in target) continue
    Object.defineProperty(target, name, { value: fn, writable: true, configurable: true })
  }
}

function installGetter(target: object, name: string, get: () => unknown): void {
  if (name in target) return
  Object.defineProperty(target, name, { get, configurable: true })
}

export function installDomShim(): void {
  if (typeof Node === 'undefined') return
  install(Node.prototype, nodeMethods)
  install(Element.prototype, elementMethods)
  install(HTMLElement.prototype, htmlElementMethods)
  install(SVGElement.prototype, { setCssStyles, setCssProps })
  installGetter(Node.prototype, 'doc', function (this: Node) {
    return documentOf(this)
  })
  installGetter(Node.prototype, 'win', function (this: Node) {
    return documentOf(this).defaultView ?? window
  })
  install(globalThis, {
    createEl: (tag: string, info?: ElementInfo | string, callback?: (el: HTMLElement) => void) =>
      createElIn(undefined, tag, info, callback),
    createDiv: (info?: ElementInfo | string, callback?: (el: HTMLElement) => void) =>
      createElIn(undefined, 'div', info, callback),
    createSpan: (info?: ElementInfo | string, callback?: (el: HTMLElement) => void) =>
      createElIn(undefined, 'span', info, callback),
    createSvg: (tag: string, info?: ElementInfo | string, callback?: (el: SVGElement) => void) =>
      createSvgIn(undefined, tag, info, callback),
    createFragment: (callback?: (el: DocumentFragment) => void) => {
      const fragment = document.createDocumentFragment()
      callback?.(fragment)
      return fragment
    }
  })
  installGetter(globalThis, 'activeDocument', () => document)
  installGetter(globalThis, 'activeWindow', () => window)
}

installDomShim()
