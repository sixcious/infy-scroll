/**
 * DOMPath
 * @copyright (c) 2020 Roy Six (DOMPath, InternalPath)
 * @copyright (c) 2018 The Chromium Authors (ChromiumPath)
 */

/**
 * DOMPath is an API that can generate paths for nodes using a variety of options and features. It is custom made using
 * its own internal algorithm for generating paths ({@link InternalPath}), but also provides Chromium's own DOMPath
 * algorithm as an option if desired ({@link ChromiumPath}).
 *
 * Notably, DOMPath can generate complex paths for elements inside Shadow Roots and Same-Origin Iframes.
 *
 * The Element Picker can be thought of as four components: Picker, PickerUI, HoverBox, and DOMPath.
 * DOMPath generates the paths for the elements that are clicked/picked.
 *
 * Note: var is used for declaration because this script can get executed multiple times on the page.
 */
var DOMPath = class DOMPath {

  /**
   * Generates a DOM Path (CSS Selector, XPath expression, or JS Path) for a node that takes its context into account.
   * For example, if the context of the node is in a shadow root or iframe, the path returned will be a full JS Path
   * that can work with the top-level document context. If the node is in the document context, a selector or xpath is
   * returned.
   *
   * Note: If a JS Context Path is returned, type is ignored since JS Context Paths can only be comprised of selectors.
   *
   * @param {Node} node - the node to derive a path from
   * @param {string} type - the path type to use ("selector" or "xpath")
   * @param {string} algorithm - the path algorithm to use ("internal" or "chromium")
   * @param {string} quote - the path quote style to use ("single" or "double")
   * @param {boolean} optimized - the path optimization to use (true generates the shortest path and false generates the full path)
   * @param {string} target - the type of element being targeted (may be useful to generate smarter paths for "link"s or "button"s)
   * @param {boolean} js - true generates a JavaScript path and false generates a regular DOM path
   * @returns {{path: string, meta: string}} the path along with metadata (e.g. "error")
   * @public
   */
  static generateContextPath(node, type = "selector", algorithm = "internal", quote = "single", optimized =  true, target = "generic",  js = false) {
    console.log("DOMPath.generateContextPath()");
    const contexts = DOMNode.getAncestorContexts(node);
    // If this is the top-level document context (i.e. only one context), just return the regular path
    if (contexts.length < 2) {
      // If the original type was a js path type and the node currently picked only has one context, we need to reset to selector (ideally we would reset to preferred path type)
      if (!["selector", "xpath"].includes(type)) {
        console.log("DOMPath.generateContextPath() - changing type from " + type + " to selector because this node has one context and is no longer a js path type");
        type = "selector";
      }
      return DOMPath.generatePath(node, type, algorithm, quote, optimized, target, js);
    }
    let contextPath = { path: "", meta: "" };
    for (let i = 0; i < contexts.length; i++) {
      contextPath = DOMPath.generatePath(contexts[i].node, contexts[i].context, algorithm, quote, optimized, target, true, contextPath.path);
    }
    return contextPath;
  }

  /**
   * Generates a DOM Path (CSS Selector, XPath expression, or JS Path) for a node by using the Internal algorithm or
   * Chromium's algorithm.
   *
   * This function also tests that the path is correct and ensures it matches the node using multiple fallbacks. If the
   * path doesn't match the node, it uses a final fallback to using the alternate algorithm. If the  alternate algorithm
   * also fails, the originally specified algorithm's path is returned.
   *
   * @param {Node} node - the node to derive a path from
   * @param {string} type - the path type to use ("selector" or "xpath")
   * @param {string} algorithm - the path algorithm to use ("internal" or "chromium")
   * @param {string} quote - the path quote style to use ("single" or "double")
   * @param {boolean} optimized - the path optimization to use (true generates the shortest path and false generates the full path)
   * @param {string} target - the type of element being targeted (may be useful to generate smarter paths for "link"s or "button"s)
   * @param {boolean} js - true generates a JavaScript path and false generates a regular DOM path
   * @param {string} contextPath - the current context path to generate the path from (used for nested paths e.g. shadow roots or iframes)
   * @returns {{path: string, meta: string}} the path along with metadata (e.g. "error")
   * @public
   */
  static generatePath(node, type = "selector", algorithm = "internal", quote = "single", optimized =  true, target = "generic",  js = false, contextPath = "") {
    console.log("DOMPath.generatePath() - type=" + type + ", algorithm=" + algorithm + ", quote=" + quote + ", optimized=" + optimized + ", target=" + target + ", contextPath=" + contextPath + ", node=");
    console.log(node);
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return { path: "", meta: "error" };
    }
    quote = quote === "single" ? "\'" : "\"";
    // When constructing the JS Path, we use the inverse of quote and come up with a prefix and suffix based on the type. If js is false, these will be empty
    const jsQuote = quote === "\"" ? "\'" : "\"";
    const jsPrefix = js ?
      type === "document" ? "document.querySelector(" + jsQuote :
      type === "shadow" ? ".shadowRoot.querySelector(" + jsQuote :
      type === "iframe" ? ".contentDocument.querySelector(" + jsQuote :
      type === "selector" ? "document.querySelector(" + jsQuote :
      type === "xpath" ? "document.evaluate(" + jsQuote :
      "" : "";
    const jsSuffix = js ?
      type === "document" ? jsQuote + ")" :
      type === "shadow" ? jsQuote + ")" :
      type === "iframe" ? jsQuote + ")" :
      type === "selector" ? jsQuote + ")" :
      type === "xpath" ? jsQuote + ", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue" :
      "" : "";
    // Paths will continue to be generated if they fail to match the node as this function progresses
    let internalPath = "";
    let chromiumPath = "";
    let finalPath = "";
    let context = type === "shadow" || type === "iframe";
    // algorithm = "chromium"
    if (algorithm === "chromium") {
      chromiumPath = ChromiumPath.generatePath(node, type, quote, optimized);
      finalPath = contextPath + jsPrefix + chromiumPath + jsSuffix;
      // if (evaluatePath(context ? finalPath + jsQuote + ")" : chromiumPath, type) === node) {
      if (DOMPath.#evaluatePath(context ? finalPath : chromiumPath, type) === node) {
        console.log("DOMPath.generatePath() - returning chromiumPath");
        return { path: finalPath, meta: "" };
      }
      console.log("DOMPath.generatePath() - chromiumPath failed, checking internalPath ...");
    }
    // algorithm = "internal"
    internalPath = InternalPath.generatePath(node, type, quote, optimized, target, false, false);
    finalPath = contextPath + jsPrefix + internalPath + jsSuffix;
    if (DOMPath.#evaluatePath(context ? finalPath : internalPath, type) === node) {
      console.log("DOMPath.generatePath() - returning internalPath");
      return { path: finalPath, meta: algorithm === "chromium" ? "fallback" : ""};
    }
    internalPath = InternalPath.generatePath(node, type, quote, optimized, target, true, false);
    finalPath = contextPath + jsPrefix + internalPath + jsSuffix;
    if (DOMPath.#evaluatePath(context ? finalPath : internalPath, type) === node) {
      console.log("DOMPath.generatePath() - returning internalPath (fallback)");
      return { path: finalPath, meta: algorithm === "chromium" ? "fallback" : ""};
    }
    internalPath = InternalPath.generatePath(node, type, quote, optimized, target, true, true);
    finalPath = contextPath + jsPrefix + internalPath + jsSuffix;
    if (DOMPath.#evaluatePath(context ? finalPath : internalPath, type) === node) {
      console.log("DOMPath.generatePath() - returning internalPath (fallback2)");
      return { path: finalPath, meta: algorithm === "chromium" ? "fallback" : "" };
    }
    if (algorithm === "internal") {
      chromiumPath = ChromiumPath.generatePath(node, type, quote, optimized);
      finalPath = contextPath + jsPrefix + chromiumPath + jsSuffix;
      if (DOMPath.#evaluatePath(context ? finalPath : chromiumPath, type) === node) {
        console.log("DOMPath.generatePath() - returning chromiumPath (fallback because internalPath failed)");
        return { path: finalPath, meta: "fallback" };
      }
    }
    console.log("DOMPath.generatePath() - both the internalPath and chromiumPath failed! The alternate path was:");
    console.log(algorithm === "chromium" ? internalPath : chromiumPath);
    finalPath = contextPath + jsPrefix + (algorithm === "chromium" ? chromiumPath : internalPath) + jsSuffix;
    return { path: finalPath, meta: "error" };
  }

  /**
   * Determines the path type of the string. Attempts to evaluate the string as a DOM Path (CSS Selector, XPath
   * expression, or JS Path).
   *
   * @param {string} path - the path to evaluate
   * @param {string} type - the path type to check (initially the preferred path type)
   * @param {{string[],string[]}} history - the object of arrays that stores the past attempt types and errors in order to determine if this function should be called again
   * @returns {{type: string, error: string}} the path type ("selector" or "xpath") and error
   * @see https://www.brainkart.com/article/XPath--Operators,-Special-Characters-and-Syntax_8668/
   * @public
   */
  static determinePathType(path, type, history = {types: [], errors: []}) {
    let error = "";
    try {
      // If we want to always prioritize the preferred type, we can do this check at the second attempt instead
      if (history.types.length === 0 && typeof path === "string") {
        // Note that we don't check for the "(" in document.querySelector to allow for querySelectorAll to also match
        if ((path.startsWith("document.querySelector")) ||
            (path.includes("shadowRoot.querySelector(")) ||
            (path.includes("contentDocument.querySelector("))) {
          type = "js";
        } else if (path.includes("/")) {
          type = "xpath";
        } else if (path.includes(">")) {
          type = "selector";
        }
        // } else {
        //   // Always try the preferred path type first in all other cases
        //   type = preferred || type;
        // }
      }
      // history.types.push(type);
      DOMPath.#evaluatePath(path, type, true);
      // We actually can't do the below commented out code; for example, if we are checking for an element during
      // activation time and it doesn't exist yet on the page (AJAX/SPA late activation) it will default to the
      // preferred type, which may not be what this type is
      // // We also test a node is returned. For example, xpath "body" is valid but returns nothing whereas selector "body" returns body
      // if (!node) {
      //   throw new Error();
      // }
      // history.errors.push(error);
    } catch (e) {
      error = e.message;
      history.errors.push(error);
      history.types.push(type);
      // If we still haven't checked a type in our history, keep checking (ignore js to avoid weird false positives due to context e.g. ('abc') > a
      if (["selector", "xpath"].some(type => !history.types.includes(type))) {
        return DOMPath.determinePathType(path, type === "selector" ? "xpath" : "selector", history);
        // return DOMPath.determinePathType(path, ["selector", "xpath"].every(type => history.types.includes(type)) ? "js" : type === "selector" ? "xpath" : "selector", history);
      }
      // Else if we failed all type attempts, use the first type attempt's results (usually the preferred type, but not always due to us overriding the type in the beginning)
      else {
        type = history.types[0];
        error = history.errors[0];
      }
    }
    console.log("DOMPath.determinePathType() - path=" + path + ", type=" + type + ", error=" + error + ", history=");
    console.log(history);
    return { type: type, error: error };
  }

  /**
   * Evaluates a DOM Path (CSS Selector, XPath expression, or JS Path) and returns its node.
   *
   * @param {string} path - the path to evaluate
   * @param {string} type - the path type to check
   * @param {boolean} throwError - true if this should throw an error up to the caller of this function, false otherwise
   * @returns {Node} the evaluated node
   * @private
   */
  static #evaluatePath(path, type, throwError = false) {
    let node = undefined;
    try {
      const result = DOMNode.getElement(path, type, "first", document);
      if (result.error) {
        throw new Error(result.error);
      }
      node = result.element;
    } catch (e) {
      // Don't need to log this as DOMNode.getElement() will log errors
      // console.log("DOMPath.evaluatePath() - error evaluating " + type + " path. Error:");
      // console.log(e);
      if (throwError) {
        throw new Error(e);
      }
    }
    return node;
  }

}

/**
 * InternalPath is the custom-made internal DOMPath implementation for both CSS Selectors and XPath.
 */
var InternalPath = class InternalPath {

  /**
   * Generates a DOM Path (CSS Selector or XPath expression) for a node using a custom-made internal algorithm.
   *
   * The algorithm tries to create descriptive paths suitable for multiple pages, i.e. without relying on node indices.
   * This was created due to Chromium's algorithm (XPath, notably) not being user-friendly for our purposes.
   *
   * TODO: Continue improving this algorithm so that we never have to fallback.
   *
   * @param {Element} element - the node to derive a path from
   * @param {string} type - the path type to use ("selector" or "xpath")
   * @param {string} quote - the path quote style to use ("single" or "double")
   * @param {boolean} optimized - the path optimization to use (true generates the shortest path and false generates the full path)
   * @param {string} target - the type of element being targeted (may be useful to generate smarter paths for "link"s or "button"s)
   * @param {boolean} fallback - whether to fallback to use an index [#] / :nth-of-type(#) for the child node
   * @param {boolean} fallback2 - whether to fallback to use an index [#] / :nth-of-type(#) for all nodes
   * @returns {string|null} the CSS Selector or XPath expression
   * @see originally derived from https://stackoverflow.com/a/5178132 by @stijn de ryck
   * @public
   */
  static generatePath(element, type, quote, optimized, target, fallback, fallback2) {
    // console.log("InternalPath.generatePath() - fallback=" + fallback + ", fallback2=" + fallback2);
    const separator = type === "xpath" ? "/" : " > ";
    // TODO: Decide between getElementsByTagName("*") and querySelectorAll("*"). gEBTN returns a live list of nodes that keeps updating as the document changes, whereas qSA return a static list of nodes
    const nodes = document.getElementsByTagName("*");
    const segments = [];
    for (let i = 0; element && element.nodeType === Node.ELEMENT_NODE; element = element.parentElement, i++) {
      let tag = element.localName.toLowerCase();
      // html/head/body - In a valid HTML document, there should only be one of these elements. Also, we don't need id or text, and do not want to do class name for html or body because we add the Element Picker class to one of these two elements
      if (tag === "body" || tag === "html" || tag === "head") {
        segments.unshift(tag);
        if (optimized) {
          // Prefix: XPath html needs to be /html, XPath body and head need to be //body //head, Selector needs nothing
          return (type === "xpath" ? tag === "html" ? "/" : "//" : "") + segments.join(separator);
        } else {
          continue;
        }
      }
      // XPath only: svg elements belong to a different namespace and need to be handled via name() or local-name()
      // Note: There are an abundance of SVG elements (e.g. path, use) but we'll only check for the popular ones for brevity
      // @see https://developer.mozilla.org/docs/Web/SVG/Element
      if (["svg", "path", "use"].includes(tag) && type === "xpath") {
        tag = "*[name()=" + quote + tag + quote + "]";
      }
      // id() or [@id] - if the id is unique among all the nodes, we'll stop and return. otherwise, we continue on below
      let id = "";
      if (element.hasAttribute("id")) {
        // Check if this node has a unique ID by seeing if any other nodes is equal to this same ID (assume it does to start)
        let isUniqueId = true;
        for (let j = 0; j < nodes.length; j++) {
          // Note: We can test if two nodes are equal to another using the strict equality operator @see https://developer.mozilla.org/docs/Web/API/Node/isSameNode
          if (nodes[j] !== element && nodes[j].hasAttribute("id") && nodes[j].id === element.id) {
            isUniqueId = false;
            break;
          }
        }
        // If there was only one unique ID and it's optimized, then we know this path will work and we can stop and return right here
        // Else, we'll need to save the ID and continue on and look at the parent elements in the outer for loop
        if (isUniqueId && optimized) {
          // Note: We can only do the id("abc") format with xpath if it's the root node in the path (hence, it must be optimized, as we are stopping and returning here)
          segments.unshift(type === "xpath" ? "id(" + quote + element.getAttribute("id") + quote + ")" : "#" + InternalPath.#escapeCSS(element.getAttribute("id")));
          return segments.join(separator);
        } else {
          id = type === "xpath" ? "[@id=" + quote + element.getAttribute("id") + quote + "]" : "#" + InternalPath.#escapeCSS(element.getAttribute("id"));
          if (isUniqueId) {
            segments.unshift(tag + id);
            continue;
          }
        }
      }
      // We examine the node's previous/next siblings and count them to generate the [#]. Note that we only need to look past this node (e.g. its nextSiblings) if it's the first one and there are more than one (down below)
      let index = "";
      // We need this boolean in the event that there is a previous/next sibling with the same class name. If so, we can't rely on clazz to uniquely identify this element
      let elementHasSiblingWithSameClass = false;
      // [#] (previousElementSibling) - We need to check the previous elements to see if they are the same tag name as the node, then set [#]
      for (let j = 1, sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        // Note: CSS Selector's equivalent of XPath's [#] is :nth-of-type(), not nth-child() because the latter doesn't require the nodes to be the same type
        if (sibling.localName === element.localName) {
          index = type === "xpath" ? "[" + (++j) + "]" : ":nth-of-type(" + (++j) + ")";
          if (InternalPath.#hasSiblingWithSameClass(element, sibling, type)) {
            elementHasSiblingWithSameClass = true;
          }
        }
      }
      // [#] (nextElementSibling) - We need to check the next elements in case we need to set the index and in case if they have the same class (not technically, but ...)
      for (let sibling = element.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
        if (sibling.localName === element.localName) {
          // If there were no previousElementSiblings (i.e. index hasn't been set), but there are nextElementSiblings with the same node name, then it must be the first one and we need to be specific and say [1]
          // For an example as to why we need this, see Safebooru's Auto Detect Page Element. e.g. /div[1] is not always the same as /div, because the latter tries to get all the divs children, not just the first one
          if (!index) {
            index = type === "xpath" ? "[1]" : ":nth-of-type(1)";
          }
          // TODO: We technically don't need to check the next siblings' classes, as the selector/xpath will always match the first one (this node) over them
          if (elementHasSiblingWithSameClass || InternalPath.#hasSiblingWithSameClass(element, sibling, type)) {
            elementHasSiblingWithSameClass = true;
            // When checking next siblings, we only need to check one time for the index (unlike previous siblings)
            break;
          }
        }
      }
      // console.log("InternalPath.generatePath()nodeHasSiblingWithSameClass=" + nodeHasSiblingWithSameClass + " - " + node.getAttribute("class"));
      // [@class] - We only use a node's class if it doesn't have a sibling with the same class name
      let clazz = "";
      if (!elementHasSiblingWithSameClass && element.hasAttribute("class") && element.getAttribute("class").trim() !== "") {
        // TODO: Should we also check and make sure class.trim() === class to avoid issues with leading/trailing spaces in the attribute?
        // This used to get the class attribute even if it was empty, but we probably shouldn't use this for "robust" paths:
        // clazz = type === "xpath" ? "[@class" + (node.getAttribute("class") === "" ? "]" : "=\"" + node.getAttribute("class") + "\"]") : node.getAttribute("class").trim() === "" || !node.classList ? "" : "." + [...node.classList].map(c => InternalPath.#escapeCSS(c)).join(".");
        clazz = type === "xpath" ? "[@class=" + quote + element.getAttribute("class") + quote + "]" : !element.classList ? "" : "." + [...element.classList].map(c => InternalPath.#escapeCSS(c)).join(".");
      }
      // [.="textContent"] - @see https://stackoverflow.com/a/29401875
      // TODO: We technically aren't checking the siblings if they also have the same textContent / text attribute like we do with the classes, but we do have fallback so it's OK to take this risk for now
      let text = "";
      // We only include text if we're targeting links or buttons
      if (i === 0 && (["link", "button"].includes(target))) {
        // XPath text only:
        const textContentTrimmed = type === "xpath" && element.textContent ? element.textContent.trim() : "";
        // Note: We put an upper limit of 25 characters on both the text and attribute (below). The regex disallows text that is only a number (e.g. paginated links like "1",  "2", "3") but still allow links that contain numbers (e.g. "Next 25"). We don't test for or care about negative "-2" or other complex numbers
        if (textContentTrimmed && textContentTrimmed !== "" && textContentTrimmed.length < 30 && !/^\d+$/.test(textContentTrimmed)) {
          // Note: The equivalent of an element's textContent in XPath is .=, not text() @see https://stackoverflow.com/questions/38240763/xpath-difference-between-dot-and-text
          // Note: If the text has leading/trailing spaces/tabs/new lines, we can't use .= and must use contains()
          if (textContentTrimmed === element.textContent) {
            text = "[.=" + quote + element.textContent + quote + "]";
          } else {
            text = "[contains(.," + quote + textContentTrimmed + quote + ")]";
          }
        }
        // Selector and XPath text: If no textContent, look for common link attributes that might contain text
        if (!text) {
          // Note: alt is technically not a valid attribute for anchors, but some websites use it and Google has recommended it in the past.
          // Removed "rel" due to a lot of rel="nofollow" links. Removed "rev" due to it seemingly being deprecated and is like rel. Removed "title" because it seems to be dynamically generated after the page is generated, and fails on the next page (e.g. d...)
          // @see https://stackoverflow.com/a/26071979
          const attributes = ["aria-label", "alt"];
          for (const attribute of attributes) {
            const attributeTrimmed = element.hasAttribute(attribute) ? element.getAttribute(attribute).trim() : "";
            if (attributeTrimmed !== "" && attributeTrimmed.length < 30) {
              // Note: For selector, we don't need to use escapeCSS here because we are wrapping the attribute in a quote
              text = type === "xpath" ? "[@" + attribute + "=" + quote + element.getAttribute(attribute) + quote + "]" : "[" + attribute + "=" + quote + element.getAttribute(attribute) + quote + "]";
              break;
            }
          }
        }
      }
      // Basically, we don't want to use the index in the path unless we absolutely have to (fallback or fallback2 or no clazz and no text)
      // index = ((fallback && i === 0) || fallback2 || (!clazz && !text) || (elementHasSiblingWithSameClass && !text)) ? index : "";
      const useIndex = (fallback && i === 0) || (fallback2) || (!clazz && !text);
      segments.unshift(tag + (useIndex ? index : id + clazz + text));
    }
    // Only XPath starts with the separator, e.g. /html/body... , whereas selector is html > body ...
    return segments.length > 0 ? (type === "xpath" ? separator : "") + segments.join(separator) : null;
  }

  /**
   * Checks if an element has the same class attribute as its sibling.
   *
   * @param {Element} element - the element
   * @param {Element} sibling - the element's sibling
   * @param {string} type - the path type
   * @returns {boolean} true if this element has the same class attribute as its sibling, false otherwise
   * @private
   */
  static #hasSiblingWithSameClass(element, sibling, type) {
    let same = false;
    if (element.hasAttribute("class") && sibling.hasAttribute("class")) {
      if (type === "xpath") {
        // XPath Only: If the element's class attribute equals the sibling's class attribute, we can't use the attribute to reliably select the element
        if (element.getAttribute("class") === sibling.getAttribute("class")) {
          same = true;
        }
      } else {
        // Selector Only: If the element's classes are a subset of the sibling's classes (no matter the order of the classes), we can't reliably use the classes to select it
        // @see https://stackoverflow.com/questions/38811421/how-to-check-if-an-array-is-a-subset-of-another-array-in-javascript
        if ([...element.classList].every(clazz => [...sibling.classList].includes(clazz))) {
          // console.log(element.localName + " - element.classList=" + [...element.classList] + " sibling.classList=" + [...sibling.classList]);
          same = true;
        }
      }
    }
    return same;
  }

  /**
   * Escapes a string to be suitable for use as a CSS Selector.
   *
   * @param {string} str - the string to escape
   * @returns {string|*} the escaped CSS string
   * @see https://developer.mozilla.org/docs/Web/API/CSS/escape
   * @private
   */
  static #escapeCSS(str) {
    let escape;
    try {
      escape = CSS.escape(str);
    } catch (e) {
      console.log("InternalPath.escapeCSS() - Error:");
      console.log(e);
    }
    return escape || str;
  }

}

/**
 * ChromiumPath is Chromium's DOMPath implementation for both CSS Selectors and XPath.
 * Note: This was from an old chromium build in 2018, so we ought to try and find a newer one.
 * Important: Keeping this as an IIFE instead of converting it to a class to keep the modifications low.
 *
 * Modifications Required
 * ----------------------
 * Replace Elements and Elements.DOMPath with IIFE: var ChromiumPath = ... {}
 * Replace nodeType() with nodeType
 * Replace children() with children
 * Replace localName() with localName
 * Replace nodeName() with nodeName
 * (?) Replace nodeNameInCorrectCase() with nodeName.toLowerCase()
 *
 * @see https://github.com/chromium/chromium/blob/77578ccb4082ae20a9326d9e673225f1189ebb63/third_party/blink/renderer/devtools/front_end/elements/DOMPath.js
 * @see https://stackoverflow.com/a/58677712
 */
var ChromiumPath = (() => {

  /**
   * Variables
   *
   * TODO: Technically, we don't need this to be global and we can just pass the quote into each function
   * @param {string} quote - quote the path quote style to use ("single" or "double")
   */
  let quote = "\"";

  /**
   * Generates a DOM Path (CSS Selector or XPath expression) for a node using Chromium's algorithm.
   *
   * @param {Node} node - the node to derive a path from
   * @param {string} type - the path type to use ("selector" or "xpath")
   * @param {string} quote_ - the path quote style to use ("single" or "double")
   * @param {boolean} optimized - the path optimization to use (true generates the shortest path and false generates the full path)
   * @returns {string|null} the path
   * @public
   */
  function generatePath(node, type, quote_, optimized) {
    quote = quote_;
    return type === "xpath" ? xPath(node, optimized) : cssPath(node, optimized);
  }

  // /**
  //  * @param {!SDK.DOMNode} node
  //  * @param {boolean=} justSelector
  //  * @return {string}
  //  */
  // function fullQualifiedSelector(node, justSelector) {
  //   if (node.nodeType !== Node.ELEMENT_NODE) {
  //     return node.localName || node.nodeName.toLowerCase();
  //   }
  //   return cssPath(node, justSelector);
  // }

  /**
   * @param {!SDK.DOMNode} node
   * @param {boolean=} optimized
   * @return {string}
   */
  function cssPath(node, optimized) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    const steps = [];
    let contextNode = node;
    while (contextNode) {
      const step = _cssPathStep(contextNode, !!optimized, contextNode === node);
      if (!step) {
        break;  // Error - bail out early.
      }
      steps.push(step);
      if (step.optimized) {
        break;
      }
      contextNode = contextNode.parentNode;
    }
    steps.reverse();
    return steps.join(' > ');
  }

  // /**
  //  * @param {!SDK.DOMNode} node
  //  * @return {boolean}
  //  */
  // function canGetJSPath(node) {
  //   let wp = node;
  //   while (wp) {
  //     if (wp.ancestorShadowRoot() && wp.ancestorShadowRoot().shadowRootType() !== SDK.DOMNode.ShadowRootTypes.Open) {
  //       return false;
  //     }
  //     wp = wp.ancestorShadowHost();
  //   }
  //   return true;
  // }
  //
  // /**
  //  * @param {!SDK.DOMNode} node
  //  * @param {boolean=} optimized
  //  * @return {string}
  //  */
  // function jsPath(node, optimized) {
  //   if (node.nodeType !== Node.ELEMENT_NODE) {
  //     return '';
  //   }
  //   const path = [];
  //   let wp = node;
  //   while (wp) {
  //     path.push(cssPath(wp, optimized));
  //     wp = wp.ancestorShadowHost();
  //   }
  //   path.reverse();
  //   let result = '';
  //   for (let i = 0; i < path.length; ++i) {
  //     if (i) {
  //       result += `.shadowRoot.querySelector('${path[i]}')`;
  //     } else {
  //       result += `document.querySelector('${path[i]}')`;
  //     }
  //   }
  //   return result;
  // }

  /**
   * @param {!SDK.DOMNode} node
   * @param {boolean} optimized
   * @param {boolean} isTargetNode
   * @return {?Step}
   */
  function _cssPathStep(node, optimized, isTargetNode) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    const id = node.getAttribute('id');
    if (optimized) {
      if (id) {
        // return new Step(idSelector(id), true);
        return new Step(idSelector(id), optimized);
      }
      const nodeNameLower = node.nodeName.toLowerCase();
      if (nodeNameLower === 'body' || nodeNameLower === 'head' || nodeNameLower === 'html') {
        // return new Step(node.nodeName.toLowerCase(), true);
        return new Step(node.nodeName.toLowerCase(), optimized);
      }
    }
    const nodeName = node.nodeName.toLowerCase();
    if (id) {
      // return new Step(nodeName + idSelector(id), true);
      return new Step(nodeName + idSelector(id), optimized);
    }
    const parent = node.parentNode;
    if (!parent || parent.nodeType === Node.DOCUMENT_NODE) {
      // return new Step(nodeName, true);
      return new Step(nodeName, optimized);
    }
    /**
     * @param {!SDK.DOMNode} node
     * @return {!Array.<string>}
     */
    function prefixedElementClassNames(node) {
      const classAttribute = node.getAttribute('class');
      if (!classAttribute) {
        return [];
      }
      return classAttribute.split(/\s+/g).filter(Boolean).map(function(name) {
        // The prefix is required to store "__proto__" in a object-based map.
        return '$' + name;
      });
    }
    /**
     * @param {string} id
     * @return {string}
     */
    function idSelector(id) {
      return '#' + escapeIdentifierIfNeeded(id);
    }
    /**
     * @param {string} ident
     * @return {string}
     */
    function escapeIdentifierIfNeeded(ident) {
      if (isCSSIdentifier(ident)) {
        return ident;
      }
      const shouldEscapeFirst = /^(?:[0-9]|-[0-9-]?)/.test(ident);
      const lastIndex = ident.length - 1;
      return ident.replace(/./g, function(c, i) {
        return ((shouldEscapeFirst && i === 0) || !isCSSIdentChar(c)) ? escapeAsciiChar(c, i === lastIndex) : c;
      });
    }
    /**
     * @param {string} c
     * @param {boolean} isLast
     * @return {string}
     */
    function escapeAsciiChar(c, isLast) {
      return '\\' + toHexByte(c) + (isLast ? '' : ' ');
    }
    /**
     * @param {string} c
     */
    function toHexByte(c) {
      let hexByte = c.charCodeAt(0).toString(16);
      if (hexByte.length === 1) {
        hexByte = '0' + hexByte;
      }
      return hexByte;
    }
    /**
     * @param {string} c
     * @return {boolean}
     */
    function isCSSIdentChar(c) {
      if (/[a-zA-Z0-9_-]/.test(c)) {
        return true;
      }
      return c.charCodeAt(0) >= 0xA0;
    }
    /**
     * @param {string} value
     * @return {boolean}
     */
    function isCSSIdentifier(value) {
      // Double hyphen prefixes are not allowed by specification, but many sites use it.
      return /^-{0,2}[a-zA-Z_][a-zA-Z0-9_-]*$/.test(value);
    }
    const prefixedOwnClassNamesArray = prefixedElementClassNames(node);
    let needsClassNames = false;
    let needsNthChild = false;
    let ownIndex = -1;
    let elementIndex = -1;
    const siblings = parent.children;
    for (let i = 0; (ownIndex === -1 || !needsNthChild) && i < siblings.length; ++i) {
      const sibling = siblings[i];
      if (sibling.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }
      elementIndex += 1;
      if (sibling === node) {
        ownIndex = elementIndex;
        continue;
      }
      if (needsNthChild) {
        continue;
      }
      if (sibling.nodeName.toLowerCase() !== nodeName) {
        continue;
      }
      needsClassNames = true;
      const ownClassNames = new Set(prefixedOwnClassNamesArray);
      if (!ownClassNames.size) {
        needsNthChild = true;
        continue;
      }
      const siblingClassNamesArray = prefixedElementClassNames(sibling);
      for (let j = 0; j < siblingClassNamesArray.length; ++j) {
        const siblingClass = siblingClassNamesArray[j];
        if (!ownClassNames.has(siblingClass)) {
          continue;
        }
        ownClassNames.delete(siblingClass);
        if (!ownClassNames.size) {
          needsNthChild = true;
          break;
        }
      }
    }
    let result = nodeName;
    if (isTargetNode && nodeName.toLowerCase() === 'input' && node.getAttribute('type') && !node.getAttribute('id') && !node.getAttribute('class')) {
      // result += '[type="' + node.getAttribute('type') + '"]';
      result += '[type=' + quote + node.getAttribute('type') + quote + ']';
    }
    if (needsNthChild) {
      result += ':nth-child(' + (ownIndex + 1) + ')';
    } else if (needsClassNames) {
      for (const prefixedName of prefixedOwnClassNamesArray) {
        // Note: We replaced the deprecated substr function with substring here:
        result += '.' + escapeIdentifierIfNeeded(prefixedName.substring(1));
      }
    }
    return new Step(result, false);
  }

  /**
   * @param {!SDK.DOMNode} node
   * @param {boolean=} optimized
   * @return {string}
   */
  function xPath(node, optimized) {
    if (node.nodeType === Node.DOCUMENT_NODE) {
      return '/';
    }
    const steps = [];
    let contextNode = node;
    while (contextNode) {
      const step = _xPathValue(contextNode, optimized);
      if (!step) {
        break;  // Error - bail out early.
      }
      steps.push(step);
      if (step.optimized) {
        break;
      }
      contextNode = contextNode.parentNode;
    }
    steps.reverse();
    return (steps.length && steps[0].optimized ? '' : '/') + steps.join('/');
  }

  /**
   * @param {!SDK.DOMNode} node
   * @param {boolean=} optimized
   * @return {?Step}
   */
  function _xPathValue(node, optimized) {
    let ownValue;
    const ownIndex = _xPathIndex(node);
    if (ownIndex === -1) {
      return null;  // Error.
    }
    switch (node.nodeType) {
      case Node.ELEMENT_NODE:
        if (optimized && node.getAttribute('id')) {
          // return new Step('//*[@id="' + node.getAttribute('id') + '"]', true);
          return new Step('//*[@id=' + quote + node.getAttribute('id') + quote + ']', true);
        }
        ownValue = node.localName;
        break;
      case Node.ATTRIBUTE_NODE:
        ownValue = '@' + node.nodeName;
        break;
      case Node.TEXT_NODE:
      case Node.CDATA_SECTION_NODE:
        ownValue = 'text()';
        break;
      case Node.PROCESSING_INSTRUCTION_NODE:
        ownValue = 'processing-instruction()';
        break;
      case Node.COMMENT_NODE:
        ownValue = 'comment()';
        break;
      case Node.DOCUMENT_NODE:
        ownValue = '';
        break;
      default:
        ownValue = '';
        break;
    }
    if (ownIndex > 0) {
      ownValue += '[' + ownIndex + ']';
    }
    return new Step(ownValue, node.nodeType === Node.DOCUMENT_NODE);
  }

  /**
   * @param {!SDK.DOMNode} node
   * @return {number}
   */
  function _xPathIndex(node) {
    // Returns -1 in case of error, 0 if no siblings matching the same expression, <XPath index among the same expression-matching sibling nodes> otherwise.
    function areNodesSimilar(left, right) {
      if (left === right) {
        return true;
      }
      if (left.nodeType === Node.ELEMENT_NODE && right.nodeType === Node.ELEMENT_NODE) {
        return left.localName === right.localName;
      }
      if (left.nodeType === right.nodeType) {
        return true;
      }
      // XPath treats CDATA as text nodes.
      const leftType = left.nodeType === Node.CDATA_SECTION_NODE ? Node.TEXT_NODE : left.nodeType;
      const rightType = right.nodeType === Node.CDATA_SECTION_NODE ? Node.TEXT_NODE : right.nodeType;
      return leftType === rightType;
    }

    const siblings = node.parentNode ? node.parentNode.children : null;
    if (!siblings) {
      return 0;  // Root node - no siblings.
    }
    let hasSameNamedElements;
    for (let i = 0; i < siblings.length; ++i) {
      if (areNodesSimilar(node, siblings[i]) && siblings[i] !== node) {
        hasSameNamedElements = true;
        break;
      }
    }
    if (!hasSameNamedElements) {
      return 0;
    }
    let ownIndex = 1;  // XPath indices start with 1.
    for (let i = 0; i < siblings.length; ++i) {
      if (areNodesSimilar(node, siblings[i])) {
        if (siblings[i] === node) {
          return ownIndex;
        }
        ++ownIndex;
      }
    }
    return -1;  // An error occurred: |node| not found in parent's children.
  }

  /**
   * @unrestricted
   */
  class Step {
    /**
     * @param {string} value
     * @param {boolean} optimized
     */
    constructor(value, optimized) {
      this.value = value;
      this.optimized = optimized || false;
    }

    /**
     * @override
     * @return {string}
     */
    toString() {
      return this.value;
    }
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    generatePath
  };

})();