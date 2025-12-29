/*
 * Copyright (C) 2025 Mimic Development Team
 *
 * Licensed under the MIT License (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *          https://opensource.org/licenses/MIT
 */

/**
 * Lightweight, dependency-free class that enables SPA-like page transitions.
 * Designed as a minimal alternative to swup.js and fully satisfies the following requirements:
 *
 * 1. Navigation management using the History API
 * 2. Partial replacement of <main> and <head> elements (including re-execution of scripts)
 * 3. Differential updates of CSS and meta tags in <head> to prevent FOUC
 * 4. Full scroll position restoration (back/forward support and hash-anchor support)
 * 5. Transition animation control via CSS class (is-leaving) with a guaranteed minimum delay
 * 6. Prefetching on link hover or touch
 */
class Flash {
	constructor() {
		/**
		 * Cache for fetched HTML strings.
		 * The key is a “clean URL” with query parameters removed.
		 * @type {Map<string, string>}
		 */
		this.cache = new Map();

		/** @type {DOMParser} Used to convert HTML strings into DOM documents */
		this.parser = new DOMParser();

		// Disable the browser's native scroll restoration.
		// In async navigations, browser timing does not match rendering timing,
		// so scroll position must be managed manually.
		if ("scrollRestoration" in history) {
			history.scrollRestoration = "manual";

			// Initialize the current history entry with scroll data
			history.replaceState(this.data(), "");
		}

		// =============================================
		// Initialization
		// =============================================

		// Intercept link clicks
		document.addEventListener("click", (e) => {
			const link = e.target.closest("a");

			// Exclude:
			// - non-anchor clicks
			// - external links
			// - target="_blank"
			// - modifier-key clicks (Ctrl/Meta/Alt/Shift)
			// - links explicitly opting out via data-no-swup
			if (!link || link.origin !== location.origin || link.target || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || link.hasAttribute("data-no-swup")) {
				return;
			}

			// This link is a valid SPA navigation target
			e.preventDefault();

			const currentUrl = new URL(window.location.href);
			const targetUrl = new URL(link.href);

			// If pathname and query string are identical,
			// the user is effectively navigating to the same page.
			if (currentUrl.pathname === targetUrl.pathname && currentUrl.search === targetUrl.search) {
				// If only the hash differs, update history and scroll accordingly
				if (currentUrl.hash !== targetUrl.hash) {
					history.replaceState(this.data(), "", link.href);

					const targetId = targetUrl.hash.slice(1);
					if (targetId) {
						document.getElementById(targetId)?.scrollIntoView();
					}
				}
				return;
			}

			// Save the final scroll position of the current page
			history.replaceState(this.data(), "");

			// Push a new history entry
			// NOTE:
			// Due to a known bug in Cloudflare Beacon, the URL object must not be used directly.
			// The URL is reconstructed manually from pathname + search + hash.
			history.pushState(this.data(0), "", targetUrl.pathname + targetUrl.search + targetUrl.hash);

			// Start a new navigation (scroll restoration is null for fresh transitions)
			this.transit(link.href, null);
		});

		// Handle browser back/forward navigation
		window.addEventListener("popstate", (e) => {
			// The browser has already updated the URL.
			// Only DOM rendering and scroll restoration are required.
			this.transit(location.href, e.state?.scroll ?? 0);
		});

		// Track and persist scroll position
		let timer;
		window.addEventListener(
			"scroll",
			() => {
				clearTimeout(timer);
				timer = setTimeout(() => {
					// Update only the state object without changing the URL
					history.replaceState(this.data(), "");
				}, 100);
			},
			{ passive: true }
		);

		// Enable prefetching on initial DOM
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
		// Mark the document as leaving (used by CSS animations)
		document.documentElement.classList.add("is-leaving");

		// Ensure a minimum transition delay for visual consistency
		const delay = new Promise((resolve) => setTimeout(resolve, 120));

		try {
			// Run delay and fetch in parallel and wait for both
			const [_, html] = await Promise.all([delay, this.fetchPage(url)]);

			// Apply the new DOM
			this.render(html, scrollTo);
		} catch (err) {
			// On failure, abort SPA behavior and fall back to a full page load
			window.location.href = url;
			return;
		}

		// Remove transition marker
		document.documentElement.classList.remove("is-leaving");

		// Dispatch a custom event for external scripts (analytics, etc.)
		document.dispatchEvent(new CustomEvent("swup:page:view"));
	}

	/**
	 * Parse HTML and update the current DOM.
	 *
	 * @param {string} html Fetched HTML
	 * @param {number|null} scrollTo Scroll position to restore
	 */
	render(html, scrollTo) {
		// Parse HTML string into a document
		const doc = this.parser.parseFromString(html, "text/html");

		// Update <head>
		this.updateHead(doc.head);

		// Update <main>
		const newMain = doc.querySelector("main");
		const currentMain = document.querySelector("main");

		if (newMain && currentMain) {
			currentMain.innerHTML = newMain.innerHTML;

			// Scripts inserted via innerHTML do not execute,
			// so they must be recreated manually.
			this.runMainScripts(currentMain);
		}

		// Scroll handling
		if (typeof scrollTo === "number") {
			// A. Back/forward navigation: restore stored scroll position
			window.scrollTo(0, scrollTo);
		} else {
			// B. New navigation: handle hash anchors if present
			const hash = window.location.hash;
			const targetId = hash ? hash.slice(1) : null;
			const target = targetId ? document.getElementById(targetId) : null;

			if (target) {
				target.scrollIntoView();
			} else {
				window.scrollTo(0, 0);
			}
		}

		// Reapply prefetch listeners to newly inserted links
		this.applyPrefetch(currentMain);
	}

	/**
	 * Update the <head> element.
	 * CSS and style tags are updated differentially to prevent FOUC.
	 *
	 * @param {HTMLHeadElement} newHead
	 */
	updateHead(newHead) {
		// Update document title
		document.title = newHead.querySelector("title")?.innerText || "";

		// Replace all meta tags
		document.head.querySelectorAll("meta").forEach((el) => el.remove());
		newHead.querySelectorAll("meta").forEach((el) => {
			document.head.appendChild(el.cloneNode(true));
		});

		// Differential update for link (CSS) and style tags
		const newTags = Array.from(newHead.querySelectorAll("link, style"));
		const currentTags = Array.from(document.head.querySelectorAll("link, style"));

		// Generate a comparison key
		const getKey = (el) => (el.tagName === "LINK" ? el.href : el.textContent);

		newTags.forEach((newTag) => {
			const newKey = getKey(newTag);
			const existing = currentTags.find((curr) => getKey(curr) === newKey);

			if (existing) {
				// Mark existing tag to keep
				existing._keep = true;
			} else {
				// Append new tag
				document.head.appendChild(newTag.cloneNode(true));
			}
		});

		// Remove obsolete tags
		currentTags.forEach((curr) => {
			if (curr._keep) {
				delete curr._keep;
			} else {
				curr.remove();
			}
		});

		// Scripts inside <head> are intentionally ignored
		// to avoid duplicate execution.
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

			// Copy attributes
			Array.from(oldScript.attributes).forEach((attr) => {
				newScript.setAttribute(attr.name, attr.value);
			});

			// Copy inline code
			newScript.textContent = oldScript.textContent;

			// Replace and execute
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
		// Normalize URL by removing query parameters
		const u = new URL(url, window.location.href);
		url = u.origin + u.pathname;

		// Cache hit
		if (this.cache.has(url)) {
			return this.cache.get(url);
		}

		// Fetch from network
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
			// Exclude external links and opt-out links
			if (link.origin !== location.origin || link.hasAttribute("data-no-swup")) {
				return;
			}

			// Prefetch once on hover or touch
			link.addEventListener("mouseenter", () => this.fetchPage(link.href), { once: true });
			link.addEventListener("touchstart", () => this.fetchPage(link.href), { once: true, passive: true });
		});
	}
}

// Instantiate and activate Flash
new Flash();

/* =====================================================================
   Cloudflare Beacon SPA workaround
   =====================================================================

   Due to Cloudflare Beacon's SPA behavior, page views originating from
   the initially loaded page ("Start") are not always recorded.

   Example sequence:
     Start -> A -> B -> Start -> C -> D

   In this case, page views for A and C may not be tracked.

   Workaround:
   - Temporarily spoof the URL before Beacon records history
   - Restore the original URL afterward
   - Strip spoofed suffix from outgoing Beacon payloads

   WARNING:
   This relies on Beacon's internal implementation and may break
   in future versions.
*/
const beacon = document.currentScript?.dataset.cfBeacon;
if (beacon) {
	const suffix = "initcfb";
	const path = window.location.pathname;

	// Temporarily modify the URL
	history.replaceState({}, "", path + suffix);

	// Patch XMLHttpRequest.send
	const proto = XMLHttpRequest.prototype;
	const originalSend = proto.send;
	proto.send = function (body) {
		if (body?.includes(suffix)) {
			setTimeout(() => history.replaceState({}, "", path));
			proto.send = originalSend;
			body = body.replaceAll(suffix, "");
		}
		return originalSend.apply(this, [body]);
	};

	// Patch navigator.sendBeacon as well
	const originalSendBeacon = navigator.sendBeacon;
	navigator.sendBeacon = async function (url, body) {
		if (body instanceof Blob) {
			body = new Blob([(await body.text()).replaceAll(suffix, "")], { type: body.type });
		}
		return originalSendBeacon.apply(this, [url, body]);
	};

	// Dynamically load Cloudflare Beacon
	// - Avoids timing issues present when embedding directly in HTML
	// - Using <script> ensures correct origin and avoids intermittent CORS errors
	const script = document.createElement("script");
	script.dataset.cfBeacon = beacon;
	script.src = "https://static.cloudflareinsights.com/beacon.min.js";
	document.body.appendChild(script);
}
