var _a;
class Flash {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    this.parser = new DOMParser();
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
      history.replaceState(this.data(), "");
    }
    document.addEventListener("click", (e) => {
      var _a2;
      const link = e.target.closest("a");
      if (!link || link.origin !== location.origin || link.target || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || link.hasAttribute("data-no-swup")) {
        return;
      }
      e.preventDefault();
      const currentUrl = new URL(window.location.href);
      const targetUrl = new URL(link.href);
      if (currentUrl.pathname === targetUrl.pathname && currentUrl.search === targetUrl.search) {
        if (currentUrl.hash !== targetUrl.hash) {
          history.replaceState(this.data(), "", link.href);
          const targetId = targetUrl.hash.slice(1);
          if (targetId) {
            (_a2 = document.getElementById(targetId)) == null ? void 0 : _a2.scrollIntoView();
          }
        }
        return;
      }
      history.replaceState(this.data(), "");
      history.pushState(this.data(0), "", targetUrl.pathname + targetUrl.search + targetUrl.hash);
      this.transit(link.href, null);
    });
    window.addEventListener("popstate", (e) => {
      var _a2;
      this.transit(location.href, ((_a2 = e.state) == null ? void 0 : _a2.scroll) ?? 0);
    });
    let timer;
    window.addEventListener(
      "scroll",
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          history.replaceState(this.data(), "");
        }, 100);
      },
      { passive: true }
    );
    this.applyPrefetch(document);
  }
  /**
   * Generate a History API state object.
   *
   * @param {number} scroll Scroll position to store
   * @return {{scroll: number}}
   */
  data(scroll = window.scrollY) {
    return { scroll };
  }
  /**
   * Main navigation workflow.
   * Handles animation → fetch → DOM update → event dispatch.
   *
   * @param {string} url URL to fetch
   * @param {number|null} scrollTo Scroll position to restore (null = new navigation)
   */
  async transit(url, scrollTo) {
    document.documentElement.classList.add("is-leaving");
    const delay = new Promise((resolve) => setTimeout(resolve, 120));
    try {
      const [_, html] = await Promise.all([delay, this.fetchPage(url)]);
      this.render(html, scrollTo);
    } catch (err) {
      window.location.href = url;
      return;
    }
    document.documentElement.classList.remove("is-leaving");
    document.dispatchEvent(new CustomEvent("swup:page:view"));
  }
  /**
   * Parse HTML and update the current DOM.
   *
   * @param {string} html Fetched HTML
   * @param {number|null} scrollTo Scroll position to restore
   */
  render(html, scrollTo) {
    const doc = this.parser.parseFromString(html, "text/html");
    this.updateHead(doc.head);
    const newMain = doc.querySelector("main");
    const currentMain = document.querySelector("main");
    if (newMain && currentMain) {
      currentMain.innerHTML = newMain.innerHTML;
      this.runMainScripts(currentMain);
    }
    if (typeof scrollTo === "number") {
      window.scrollTo(0, scrollTo);
    } else {
      const hash = window.location.hash;
      const targetId = hash ? hash.slice(1) : null;
      const target = targetId ? document.getElementById(targetId) : null;
      if (target) {
        target.scrollIntoView();
      } else {
        window.scrollTo(0, 0);
      }
    }
    this.applyPrefetch(currentMain);
  }
  /**
   * Update the <head> element.
   * CSS and style tags are updated differentially to prevent FOUC.
   *
   * @param {HTMLHeadElement} newHead
   */
  updateHead(newHead) {
    var _a2;
    document.title = ((_a2 = newHead.querySelector("title")) == null ? void 0 : _a2.innerText) || "";
    document.head.querySelectorAll("meta").forEach((el) => el.remove());
    newHead.querySelectorAll("meta").forEach((el) => {
      document.head.appendChild(el.cloneNode(true));
    });
    const newTags = Array.from(newHead.querySelectorAll("link, style"));
    const currentTags = Array.from(document.head.querySelectorAll("link, style"));
    const getKey = (el) => el.tagName === "LINK" ? el.href : el.textContent;
    newTags.forEach((newTag) => {
      const newKey = getKey(newTag);
      const existing = currentTags.find((curr) => getKey(curr) === newKey);
      if (existing) {
        existing._keep = true;
      } else {
        document.head.appendChild(newTag.cloneNode(true));
      }
    });
    currentTags.forEach((curr) => {
      if (curr._keep) {
        delete curr._keep;
      } else {
        curr.remove();
      }
    });
  }
  /**
   * Re-execute scripts inside <main>.
   * Scripts added via innerHTML are inert by specification.
   *
   * @param {HTMLElement} container
   */
  runMainScripts(container) {
    const scripts = container.querySelectorAll("script");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }
  /**
   * Fetch page HTML.
   * Uses a normalized URL (without query parameters) for caching.
   *
   * @param {string} url
   */
  async fetchPage(url) {
    const u = new URL(url, window.location.href);
    url = u.origin + u.pathname;
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error("Network error");
    const text = await res.text();
    this.cache.set(url, text);
    return text;
  }
  /**
   * Attach prefetch handlers to links.
   *
   * @param {ParentNode} root
   */
  applyPrefetch(root) {
    root.querySelectorAll("a").forEach((link) => {
      if (link.origin !== location.origin || link.hasAttribute("data-no-swup")) {
        return;
      }
      link.addEventListener("mouseenter", () => this.fetchPage(link.href), { once: true });
      link.addEventListener("touchstart", () => this.fetchPage(link.href), { once: true, passive: true });
    });
  }
}
new Flash();
const beacon = (_a = document.currentScript) == null ? void 0 : _a.dataset.cfBeacon;
if (beacon) {
  const suffix = "initcfb";
  const path = window.location.pathname;
  history.replaceState({}, "", path + suffix);
  const proto = XMLHttpRequest.prototype;
  const originalSend = proto.send;
  proto.send = function(body) {
    if (body == null ? void 0 : body.includes(suffix)) {
      setTimeout(() => history.replaceState({}, "", path));
      proto.send = originalSend;
      body = body.replaceAll(suffix, "");
    }
    return originalSend.apply(this, [body]);
  };
  const originalSendBeacon = navigator.sendBeacon;
  navigator.sendBeacon = async function(url, body) {
    if (body instanceof Blob) {
      body = new Blob([(await body.text()).replaceAll(suffix, "")], { type: body.type });
    }
    return originalSendBeacon.apply(this, [url, body]);
  };
  const script = document.createElement("script");
  script.dataset.cfBeacon = beacon;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  document.body.appendChild(script);
}
