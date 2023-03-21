/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Util is a class that provides common utility functions that don't fit in anywhere else.
 */
class Util {

  /**
   * Throttles the callback function by the specified wait (ms).
   * Note: This function is derived from code written by robertmirro @ github.com.
   * TODO: Investigate using rIC (requestIdleCallback) and rAF (requestAnimationFrame) for appending to the DOM.
   *
   * @param {function} fn - the callback function to throttle
   * @param {number} wait - the time in ms to wait (throttle)
   * @returns {function (): void} the invoked function
   * @see https://gist.github.com/beaucharman/e46b8e4d03ef30480d7f4db5a78498ca#gistcomment-3015837
   * @see https://developer.mozilla.org/docs/Web/API/Document/scroll_event#scroll_event_throttling
   * @public
   */
  static throttle(fn, wait) {
    let previouslyRun = 0;
    let timeout;
    return function invokeFn(...args) {
      const now = Date.now();
      const elapsed = now - previouslyRun;
      clearTimeout(timeout);
      if (elapsed >= wait) {
        console.log("throttle() - executing fn, wait=" + wait + ", elapsed=" + elapsed);
        fn.apply(null, args);
        previouslyRun = now;
      } else {
        timeout = setTimeout(invokeFn.bind(null, ...args), wait - elapsed);
      }
    }
  }

  /**
   * Clones an object via various methods:
   * 1. structuredClone (Chrome 98+)
   * 2. JSON.parse(JSON.stringify())
   *
   * @param {Object} object - the object to clone
   * @param {string} method - the cloning method to use
   * @param {boolean} fallback - true if the method should try and fallback to using other methods, false if not
   * @returns {Object} the cloned object
   * @public
   */
  static clone(object, method = "structuredClone", fallback = true) {
    console.log("clone() - method=" + method + ", fallback=" + fallback);
    let clonedObject;
    try {
      switch (method) {
        case "json":
          clonedObject = JSON.parse(JSON.stringify(object));
          break;
        // case "structuredClone":
        default:
          clonedObject = structuredClone(object);
          break;
      }
    } catch (e) {
      const alternateMethod = method === "structuredClone" ? "json" : "structuredClone";
      console.log("clone() - Error cloning via " + method + ", falling back to " + alternateMethod + ". Error:");
      console.log(e);
      if (fallback) {
        return Util.clone(object, alternateMethod, false);
      }
    }
    return clonedObject;
  }

  /**
   * Determines if a potential URL is a valid URL based on the specific logic to use.
   *
   * @param {string} url - the URL to parse
   * @param {string} logic - the logic to use (e.g. "next-prev" or "default")
   * @param {Object} details - the details object that stores details about this action, such as error messages that were caught
   * @returns {boolean} true if the URL is a valid URL, false otherwise
   * @public
   */
  static isValidURL(url, logic = "default", details = {}) {
    // console.log("isValidURL() - url=" + url + ", logic=" + logic + ", details=" + details);
    let valid = false;
    // Banned protocols for a valid URL Object. Note: We probably want to keep "blob:" for the list action
    const protocols = ["about:", "javascript:", "mailto:"];
    try {
      const urlObject = new URL(url);
      switch (logic) {
        case "next-prev":
        // case "list":
          // Next Prev: A URL must 1) have a href, 2) not be the same URL as this URL, 3) be in the same domain/origin (hostname) due to CORS
          // TODO: Enforcing the href not being window.location.href messes up with us when we are checking for prev urls in the popup...
          // TODO: However, we must do this check now to exclude the URL from being a possible candidate
          // Note that we always get the absolute URL from next.js so we don't have to convert it here with the second argument in the URL constructor
          // Note: Doing the hostname check implicitly bans the protocol mailto: so we don't have to check for that (it seems)
          valid = urlObject && urlObject.href && urlObject.href !== window.location.href && urlObject.hostname === window.location.hostname;
          break;
        // case "protocol-relative":
        //   // Tests if a URL is valid, but also with the assumption that the URL may be a protocol-relative URL
        //   // https://stackoverflow.com/questions/10687099/how-to-test-if-a-url-string-is-absolute-or-relative
        //   // https://en.wikipedia.org/wiki/List_of_URI_schemes
        //   valid = new RegExp("^([a-z]+:)?//", "i").test(url);
        //   break;
        default:
          // Default: A URL must simply not throw an exception and have a href and have a banned protocol like mailto:
          valid = !!urlObject.href && !protocols.includes(urlObject.protocol);
          break;
      }
    } catch (e) {
      console.log("isValidURL() - Error:");
      console.log(e);
      details.error = e.message;
    }
    return valid;
  }

  /**
   * Checks if this URL has a valid file extension.
   *
   * @param {string} url - the URL whose file extension to check
   * @param {string} logic - the logic to use (e.g. "next-prev" or "default")
   * @param {Object} details - the details object that stores details about this action, such as error messages that were caught
   * @returns {boolean} true if the URL has a valid file extension, false otherwise
   * @public
   */
  static isValidExtension(url, logic = "default", details = {}) {
    // TODO: Next Prev should start as true, others false
    let valid = false;
    const extension = Util.findExtension(Util.findFilenameAndExtension(url)).toLowerCase();
    // Images
    // Note: apng (animated png) are usually saved as png. webp, avif, and jxl (jpeg xl) are newer web image formats
    const images =  ["jpg", "jpeg", "png", "gif", "svg", "webp", "avif", "jxl"];
    // Fonts
    const fonts = ["otf", "ttf", "woff", "woff2"];
    // Texts
    // Because the next prev link algorithm is aggressive, we ought to relax it and ignore common text extension
    // filenames like ".css" and ".js" that we know can't possibly be the next link. Note that we only enforce
    // this when checking keywords just in case the user actually WANTS to find css and js next links as a path
    // TODO: Should we also ban html, php, jsp? Probably not...
    const texts = ["css", "ico", "js", "json", "txt", "xml"];
    try {
      switch (logic) {
        case "next-prev":
          valid = !(texts.concat(images).concat(fonts)).includes(extension);
          // TODO: This shouldn't be reported to the user instead if the path fails to find a link, should it?
          // details.error = "invalid extension:" + extension;
          break;
        case "list":
          // Allow images for list in case of append media mode
          valid = !(texts.concat(fonts)).includes(extension);
          // valid = true;
          break;
        case "image":
          valid = images.includes(extension);
          break;
        case "download":
          valid = extension && extension.trim().length > 0 && /^[a-z0-9\\.]+$/i.test(extension) && extension.length <= 8;
          break;
        default:
          break;
      }
    } catch (e) {
      console.log("isValidExtension() - Error:");
      console.log(e);
      // details.error = e.message;
    }
    return valid;
  }

  /**
   * Finds the filename joined together with its extension from a URL.
   *
   * @param {string} url - the URL to parse
   * @returns {string} the filename and extension joined together
   * @public
   */
  static findFilenameAndExtension(url) {
    let filenameAndExtension = "";
    if (url) {
      filenameAndExtension = url.split('#').shift().split('?').shift().split('/').pop();
    }
    return filenameAndExtension;
  }

  /**
   * Finds the filename from a string containing a filename and extension joined together.
   *
   * @param {string} filenameAndExtension - the filename and extension (joined together) to parse
   * @returns {string} the filename (if found)
   * @public
   */
  static findFilename(filenameAndExtension) {
    let filename = "";
    if (filenameAndExtension) {
      filename = filenameAndExtension.split('.').shift();
    }
    return filename;
  }

  /**
   * Finds the extension from a string containing a filename and extension joined together.
   *
   * @param {string} filenameAndExtension - the filename and extension (joined together) to parse
   * @returns {string} the extension (if found)
   * @public
   */
  static findExtension(filenameAndExtension) {
    let extension = "";
    if (filenameAndExtension && filenameAndExtension.includes(".")) {
      extension = filenameAndExtension.split('.').pop();
      // If extension is not valid, throw it out
      // if (!isValidExtension(extension)) {
      //   extension = "";
      // }
    }
    return extension;
  }

  /**
   * Fixes a URL in two ways by comparing it to the location.
   *
   * 1. protocol: Converts a URL's protocol from https to http (or vice versa) if the location's protocol is different
   * 2. hostname: Converts a URL's hostname from www to no wwww (or vice versa) if the location's hostname is different
   *
   * @param {string} url - the url
   * @returns {string} the fixed url
   * @see https://stackoverflow.com/questions/5491196/rewriting-http-url-to-https-using-regular-expression-and-javascript/5491311
   * @public
   */
  static fixURL(url) {
    try {
      const urlo = new URL(url);
      // First fix: protocol (https and http)
      if ((urlo.protocol === "http:" && window.location.protocol === "https:") ||
          (window.location.protocol === "http:" && urlo.protocol === "https:")) {
        url = url.replace(urlo.protocol, window.location.protocol);
        console.log("fixURL() - fixed protocol https/http, url after=" + url);
      }
      // Second fix: hostname (www or no www)
      if ((urlo.hostname.startsWith("www.") && (urlo.hostname.replace("www.", "") === window.location.hostname)) ||
          (window.location.hostname.startsWith("www.") && (window.location.hostname.replace("www.", "") === urlo.hostname))) {
        url = url.replace(urlo.hostname, window.location.hostname);
        console.log("fixURL() - fixed hostname www/no www, url after=" + url);
      }
    } catch (e) {
      console.log("fixURL() - Error:");
      console.log(e);
    }
    return url;
  }

  /**
   * Converts a string with wildcard characters (*) into a regular expression.
   *
   * This lets us provide an "easy" regular expression option for users who don't want to deal with the complexities of
   * the full regex syntax.
   *
   * @param {string} wildcard - the wildcard string
   * @returns {RegExp} the converted regular expression object
   * @see https://gist.github.com/donmccurdy/6d073ce2c6f3951312dfa45da14a420f
   * @public
   */
  static wildcardToRegularExpression(wildcard) {
    return new RegExp("^" + wildcard.split(/\*+/).map(Util.escapeRegularExpression).join(".*") + "$");
  }

  /**
   * Escapes reserved characters in a regular expression string input so that it can be compiled into a regular
   * expression object.
   *
   * @param {string} regex - the regular expression string to escape
   * @returns {string} the escaped regular expression string
   * @see https://developer.mozilla.org/docs/Web/JavaScript/Guide/Regular_Expressions
   * @see https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_a_parameter
   * @public
   */
  static escapeRegularExpression(regex) {
    // Escapes the following reserved regex characters: . * + $ ? | \ { } ( ) [ ]
    // Note: "$&" Inserts the matched substring (meaning to match the whole string)
    return regex.replace(/[.*+^$?|\\{}()[\]]/g, "\\$&");
  }

  // TODO: This was meant to be a helper function for setting individual style properties but decided not to use it for now
  // /**
  //  *
  //  * @param element
  //  * @param name
  //  * @param value
  //  * @param priority
  //  * @see https://developer.mozilla.org/docs/Web/API/CSSStyleDeclaration/setProperty
  //  * @public
  //  */
  // static processIndividualStyle(element, name, value, priority) {
  //   // element.style.setProperty("display", "block", "important");
  //   element.style.setProperty(name, value, priority);
  // }

  /**
   * Process a semicolon delimited style string with !important added for each style.
   *
   * @param {string} style - the style to process, e.g. "display: none; visibility: hidden;"
   * @returns {string} the processed style with !important, e.g. "display none !important; visibility: hidden !important;"
   * @public
   */
  static processStyle(style) {
    return style.replaceAll(";", " !important;");
  }

  /**
   * Gets the total height of the document in pixels. This is also known as the bottom position of the document.
   *
   * Normally, we would only care about the body clientHeight when calculating the document's height. However some
   * websites are coded strangely where their height may not be calculated based on just that, so we look at the max
   * from all six possible height values from both the html and body.
   *
   * @param {Document} doc - the specific document whose height to calculate (iframes can have their own documents!)
   * @returns {number} the total height of the document in pixels
   * @see https://stackoverflow.com/questions/1145850/how-to-get-height-of-entire-document-with-javascript
   * @public
   */
  static getTotalHeight(doc) {
    const html = doc?.documentElement;
    const body = doc?.body;
    console.log("getTotalHeight() - hch="  + html?.clientHeight + ", hsh=" + html?.scrollHeight + ", hoh=" + html?.offsetHeight + ", bch=" + body?.clientHeight + ", bsh=" + body?.scrollHeight + ", boh=" + body?.offsetHeight);
    return Math.max(html?.clientHeight, html?.scrollHeight, html?.offsetHeight, body?.clientHeight, body?.scrollHeight, body?.offsetHeight);
  }

  /**
   * Creates the specified SVG icon by name.
   *
   * Note: infinity icon generated by loading.io
   *
   * @param {string} name - the name of the icon (FontAwesome icon name if applicable)
   * @param {Object} options - the options to override the default icon properties: color, width, height, and animated
   * @returns {SVGSVGElement | Text} the svg element or a text node if SVGs aren't supported
   * @see https://loading.io
   * @public
   */
  static createIcon(name, options = { color: "#000000" }) {
    console.log("createIcon() - icon=" + name);
    let svg;
    const icons = {
      "infinity": {
        viewBox: "0 0 100 100",
        width: "33",
        height: "33",
        fill: "none",
        stroked: true,
        strokeWidth: "15",
        strokeLinecap: "round",
        pathStyle: "transform:scale(0.77); transform-origin:50px 50px;",
        path: "M24.3 30C11.4 30 5 43.3 5 50s6.4 20 19.3 20c19.3 0 32.1-40 51.4-40 C88.6 30 95 43.3 95 50s-6.4 20-19.3 20C56.4 70 43.6 30 24.3 30z",
        style: ""
      },
      "angle-down": {
        viewBox: "0 0 384 512",
        width: "20",
        height: "20",
        path: "M192 384c-8.188 0-16.38-3.125-22.62-9.375l-160-160c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L192 306.8l137.4-137.4c12.5-12.5 32.75-12.5 45.25 0s12.5 32.75 0 45.25l-160 160C208.4 380.9 200.2 384 192 384z",
        style: "cursor: pointer; margin-left: 16px;"
      },
      "angle-up": {
        viewBox: "0 0 384 512",
        width: "20",
        height: "20",
        path: "M352 352c-8.188 0-16.38-3.125-22.62-9.375L192 205.3l-137.4 137.4c-12.5 12.5-32.75 12.5-45.25 0s-12.5-32.75 0-45.25l160-160c12.5-12.5 32.75-12.5 45.25 0l160 160c12.5 12.5 12.5 32.75 0 45.25C368.4 348.9 360.2 352 352 352z",
        style: "cursor: pointer; margin-right: 16px;"
      },
      "angles-down": {
        viewBox: "0 0 384 512",
        width: "20",
        height: "20",
        path: "M169.4 278.6C175.6 284.9 183.8 288 192 288s16.38-3.125 22.62-9.375l160-160c12.5-12.5 12.5-32.75 0-45.25s-32.75-12.5-45.25 0L192 210.8L54.63 73.38c-12.5-12.5-32.75-12.5-45.25 0s-12.5 32.75 0 45.25L169.4 278.6zM329.4 265.4L192 402.8L54.63 265.4c-12.5-12.5-32.75-12.5-45.25 0s-12.5 32.75 0 45.25l160 160C175.6 476.9 183.8 480 192 480s16.38-3.125 22.62-9.375l160-160c12.5-12.5 12.5-32.75 0-45.25S341.9 252.9 329.4 265.4z",
        style: "cursor: pointer; margin-left: 16px;"
      },
      "angles-up": {
        viewBox: "0 0 384 512",
        width: "20",
        height: "20",
        path: "M54.63 246.6L192 109.3l137.4 137.4C335.6 252.9 343.8 256 352 256s16.38-3.125 22.62-9.375c12.5-12.5 12.5-32.75 0-45.25l-160-160c-12.5-12.5-32.75-12.5-45.25 0l-160 160c-12.5 12.5-12.5 32.75 0 45.25S42.13 259.1 54.63 246.6zM214.6 233.4c-12.5-12.5-32.75-12.5-45.25 0l-160 160c-12.5 12.5-12.5 32.75 0 45.25s32.75 12.5 45.25 0L192 301.3l137.4 137.4C335.6 444.9 343.8 448 352 448s16.38-3.125 22.62-9.375c12.5-12.5 12.5-32.75 0-45.25L214.6 233.4z",
        style: "cursor: pointer; margin-right: 16px;"
      },
      // TODO: These two circle-chevron icons aren't currently being used but we might have a need for them in the future
      // "circle-chevron-down": {
      //   viewBox: "0 0 512 512",
      //   width: "20",
      //   height: "20",
      //   path: "M256 0C114.6 0 0 114.6 0 256c0 141.4 114.6 256 256 256s256-114.6 256-256C512 114.6 397.4 0 256 0zM390.6 246.6l-112 112C272.4 364.9 264.2 368 256 368s-16.38-3.125-22.62-9.375l-112-112c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L256 290.8l89.38-89.38c12.5-12.5 32.75-12.5 45.25 0S403.1 234.1 390.6 246.6z",
      //   style: "cursor: pointer; margin-left: 16px;"
      // },
      // "circle-chevron-up": {
      //   viewBox: "0 0 512 512",
      //   width: "20",
      //   height: "20",
      //   path: "M256 0C114.6 0 0 114.6 0 256c0 141.4 114.6 256 256 256s256-114.6 256-256C512 114.6 397.4 0 256 0zM390.6 310.6c-12.5 12.5-32.75 12.5-45.25 0L256 221.3L166.6 310.6c-12.5 12.5-32.75 12.5-45.25 0s-12.5-32.75 0-45.25l112-112C239.6 147.1 247.8 144 256 144s16.38 3.125 22.62 9.375l112 112C403.1 277.9 403.1 298.1 390.6 310.6z",
      //   style: "cursor: pointer; margin-right: 12px;"
      // },
      "circle-xmark": {
        viewBox: "0 0 512 512",
        width: "20",
        height: "20",
        path: "M0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256zM175 208.1L222.1 255.1L175 303C165.7 312.4 165.7 327.6 175 336.1C184.4 346.3 199.6 346.3 208.1 336.1L255.1 289.9L303 336.1C312.4 346.3 327.6 346.3 336.1 336.1C346.3 327.6 346.3 312.4 336.1 303L289.9 255.1L336.1 208.1C346.3 199.6 346.3 184.4 336.1 175C327.6 165.7 312.4 165.7 303 175L255.1 222.1L208.1 175C199.6 165.7 184.4 165.7 175 175C165.7 184.4 165.7 199.6 175 208.1V208.1z",
        style: "cursor: pointer; position: fixed; top: 4px; right: 4px; padding: 2px;",
        title: chrome.i18n.getMessage("close_label")
      },
      "xmark": {
        viewBox: "0 0 320 512",
        width: "20",
        height: "20",
        path: "M310.6 361.4c12.5 12.5 12.5 32.75 0 45.25C304.4 412.9 296.2 416 288 416s-16.38-3.125-22.62-9.375L160 301.3L54.63 406.6C48.38 412.9 40.19 416 32 416S15.63 412.9 9.375 406.6c-12.5-12.5-12.5-32.75 0-45.25l105.4-105.4L9.375 150.6c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L160 210.8l105.4-105.4c12.5-12.5 32.75-12.5 45.25 0s12.5 32.75 0 45.25l-105.4 105.4L310.6 361.4z",
        style: "cursor: pointer; position: fixed; top: 4px; right: 4px; padding: 2px;",
        title: chrome.i18n.getMessage("close_label")
      }
    };
    const icon = icons[name];
    try {
      // TODO: Should we also use setAttributeNS() instead of setAttribute()? Also, figure out if there is a way to set these with !important without adding a class
      const ns = "http://www.w3.org/2000/svg";
      svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", options.size || options.width || icon.width);
      svg.setAttribute("height", options.size || options.height || icon.height);
      svg.setAttribute("viewBox", icon.viewBox);
      svg.setAttribute("preserveAspectRatio", "xMidYMid");
      svg.setAttribute("style", Util.processStyle("display: inline; position: initial; margin: auto; shape-rendering: auto; vertical-align: middle; visibility: visible; width: initial; height: initial; " + (options.style || icon.style)));
      const path = document.createElementNS(ns, "path");
      path.setAttribute("fill", icon.fill === "none" ? "none" : options.color);
      path.setAttribute("d", icon.path);
      if (icon.stroked) {
        path.setAttribute("stroke", options.color);
        path.setAttribute("stroke-width", icon.strokeWidth);
        path.setAttribute("stroke-linecap", icon.strokeLinecap);
        path.setAttribute("style", Util.processStyle(icon.pathStyle));
      }
      if (options.animated) {
        path.setAttribute("stroke-dasharray", "205.271142578125 51.317785644531256");
        const animate = document.createElementNS(ns, "animate");
        animate.setAttribute("attributeName", "stroke-dashoffset");
        animate.setAttribute("repeatCount", "indefinite");
        animate.setAttribute("dur", "2s");
        animate.setAttribute("keyTimes", "0;1");
        animate.setAttribute("values", "0;256.58892822265625");
        path.appendChild(animate);
      }
      if (icon.title) {
        const title = document.createElementNS(ns, "title");
        title.textContent = icon.title;
        svg.appendChild(title);
      }
      svg.appendChild(path);
    } catch (e) {
      console.log("createIcon() - Error:");
      console.log(e);
      svg = document.createTextNode(" ");
    }
    return svg;
  }

  /**
   * Triggers a {@link CustomEvent}. This allows userscripts and external extensions to act accordingly on the event.
   * This usually occurs when a new node is inserted into the document.
   *
   * A CustomEvent contains a details object that contains properties about this event, like the instance's current URL.
   *
   * @param {string} name - the event name
   * @param {Element|Document} element - the element or document that triggers this event
   * @param {CustomEventInit} detail - the detail object to attach to this event
   * @param {boolean} shouldTrigger - if this event should trigger (convenience argument/parameter)
   * @param {string} browserName - the name of the browser, in order to detect if Firefox's cloneInto() should be used
   * @see https://javascript.info/dispatch-events for the difference between {@link Event} and {@link CustomEvent}
   * @see https://vhudyma-blog.eu/custom-events-in-javascript/
   * @public
   */
  static triggerCustomEvent(name, element, detail, shouldTrigger = true, browserName) {
    try {
      if (shouldTrigger) {
        console.log("triggerCustomEvent() - name=" + name + ", element=" + element);
        const object = {
          detail: undefined,
          bubbles: true,
          cancelable: false
        };
        // Depending on the browser we need to handle the detail differently:
        // Firefox: We need to use the Firefox-only "cloneInto" @see: https://stackoverflow.com/a/46081249 https://bugzilla.mozilla.org/show_bug.cgi?id=1495243
        // Firefox: Also @see https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
        // We also clone the detail due to a bug in Chrome. The detail object would normally return null. We also need this for Firefox as well. @see https://stackoverflow.com/a/53914790
        // Note: Must use JSON.parse(JSON.stringify())), Not Util.clone() or structuredClone() because it throws DOMException: Failed to execute 'structuredClone' on 'Window': HTMLDivElement object could not be cloned.
        if (browserName === "firefox" && typeof cloneInto === "function") {
          console.log("triggerCustomEvent() - using Firefox's window.cloneInto() to clone the detail");
          object.detail = cloneInto(JSON.parse(JSON.stringify(detail)), document.defaultView);
        } else {
          console.log("triggerCustomEvent() - only using normal clone to clone the detail");
          object.detail = JSON.parse(JSON.stringify(detail));
        }
        const event = new CustomEvent(name, object);
        element.dispatchEvent(event);
      }
    } catch (e) {
      console.log("triggerCustomEvent() - Error:");
      console.log(e);
    }
  }

}