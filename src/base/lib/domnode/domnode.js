/**
 * DOMNode
 * @copyright (c) 2020 Roy Six
 */

/**
 * DOMNode is an API that provides convenient functions that are related to Nodes and Elements.
 *
 * Note: var is used for declaration because this script can get executed multiple times on the page.
 */
var DOMNode = (() => {

  /**
   * Gets a single element based on a path.
   *
   * Note: XPath can return Nodes (e.g. text nodes) whereas Selector can only return Elements.
   *
   * @param {string} path - the selector, xpath, or js path
   * @param {string} type - the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {string} preference - the preferred element to select if multiple are found ("first" or "last")
   * @param {Document} doc - the document to evaluate against
   * @returns {{Element,string}} the object containing the element returned from the path and error message if applicable
   * @public
   */
  function getElement(path, type, preference = "first", doc = document) {
    let element;
    let error;
    try {
      switch (type) {
        case "shadow":
        case "iframe":
        case "js":
          element = getElementsFromContextPath(path, "single", doc);
          break;
        case "xpath":
          // Note: XPathEvaluator.evaluate() and document.evaluate() appear to both be identical in function
          // @see https://developer.mozilla.org/docs/Web/API/XPathEvaluator/evaluate
          // element = new XPathEvaluator().evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (preference === "last") {
            const result = doc.evaluate(path, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            element = result && result.snapshotLength > 0 ? result.snapshotItem(result.snapshotLength - 1) : undefined;
          } else {
            element = doc.evaluate(path, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          }
          break;
        // case "selector":
        // case "document":
        default:
          if (preference === "last") {
            const result = doc.querySelectorAll(path);
            element = result && result.length > 0 ? result[result.length - 1] : undefined;
          } else {
            element = doc.querySelector(path);
          }
          break;
      }
      // console.log("getElement() - path=" + path + ", type=" + type + ", preference=" + preference + ", element=");
      // console.log(element);
    } catch (e) {
      console.log("getElement() - Error:");
      console.log(e);
      error = e.message;
    }
    return { element, error };
  }

  /**
   * Gets multiple elements based on a path.
   * Note: XPath can return Nodes (e.g. text nodes) whereas Selector can only return Elements.
   *
   * @param {string} path - the selector, xpath, or js path
   * @param {string} type - the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {Document} doc - the document to evaluate against
   * @returns {{Element[],string}} the object containing the elements returned from the path and error message if applicable
   * @public
   */
  function getElements(path, type, doc = document) {
    let elements = [];
    let error;
    try {
      switch (type) {
        case "shadow":
        case "iframe":
        case "js":
          elements = getElementsFromContextPath(path, "multiple", doc);
          break;
        case "xpath":
          // TODO: Investigate XPath resolver. Is null always OK?
          const result = doc.evaluate(path, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          if (result && result.snapshotLength > 0) {
            for (let i = 0; i < result.snapshotLength; i++) {
              elements.push(result.snapshotItem(i));
            }
          }
          break;
        // case "selector":
        // case "document":
        default:
          elements = Array.from(doc.querySelectorAll(path));
          break;
      }
    } catch (e) {
      console.log("getElements() - Error:");
      console.log(e);
      error = e.message;
    }
    // console.log("getElements() - path=" + path + ", type=" + type + ", elements=");
    // console.log(elements);
    return { elements, error };
  }

  /**
   * Gets an element's parent element, even if the parent element is a closed node (e.g. shadow root or iframe).
   *
   * @param {Element} element - the element
   * @returns {Element|undefined} the parent element or undefined if none exists
   * @public
   */
  function getParentElement(element) {
    const DFElement = element.ownerDocument?.defaultView?.Element || Element;
    if (element.parentElement instanceof DFElement) {
      return element.parentElement;
    }
    const shadow = getParentShadowRoot(element);
    if (shadow?.host) {
      return shadow.host;
    }
    const iframe = getParentIframe(element);
    if (iframe) {
      return iframe;
    }
    return undefined;
  }

  /**
   * Gets an element's first child element, even if the child element is a closed node (e.g. shadow root or iframe).
   *
   * @param {Element} element - the element
   * @returns {Element|undefined} the first child element or undefined if none exists
   * @public
   */
  function getChildElement(element) {
    const DFElement = element.ownerDocument?.defaultView?.Element || Element;
    if (element.firstElementChild instanceof DFElement) {
      return element.firstElementChild;
    }
    const shadowRoot = getShadowRoot(element);
    if (shadowRoot?.firstElementChild instanceof DFElement) {
      return shadowRoot.firstElementChild;
    }
    const iframeDocument = getIframeDocument(element);
    if (iframeDocument?.firstElementChild instanceof (iframeDocument?.defaultView?.Element || Element)) {
      return iframeDocument.firstElementChild;
    }
    return undefined;
  }

  /**
   * Returns the element's hosted shadow root if one exists using the Extension API methods, in case the root is closed.
   *
   * @param {Element} element - the host element to which a derive a shadow root from
   * @returns {ShadowRoot|undefined} the element's shadow root or undefined if none exists
   * @public
   */
  function getShadowRoot(element) {
    let shadowRoot;
    try {
      // Important: We can't just use instanceof ShadowRoot because if the element is in an iframe, that will always
      // return false. We need to get a reference to the element's window (defaultView) first
      // @see https://stackoverflow.com/a/27482101/988713
      // @see https://stackoverflow.com/questions/26248599/instanceof-htmlelement-in-iframe-is-not-element-or-object
      if (element.shadowRoot instanceof element.ownerDocument.defaultView.ShadowRoot) {
        // Using these two Extension API methods (for Chrome and Firefox, respectively) allows us to access the shadow
        // root even if it's closed
        // @see https://stackoverflow.com/a/70490033/988713
        if (typeof chrome?.dom?.openOrClosedShadowRoot === "function") {
          shadowRoot = chrome.dom.openOrClosedShadowRoot(element);
        } else if (typeof element.openOrClosedShadowRoot === "function") {
          shadowRoot = element.openOrClosedShadowRoot();
        }
        // Set to element.shadowRoot in case they return null or undefined?
        shadowRoot = shadowRoot || element.shadowRoot;
        // console.log("shadowRoot() - element.shadowRoot=" + element.shadowRoot);
      }
    } catch (e) {
      console.log("getShadowRoot() - Error:");
      console.log(e);
    }
    return shadowRoot;
  }

  /**
   * Gets a node's parent shadow root if one exists.
   *
   * @param {Node} node - the node
   * @returns {ShadowRoot|undefined} the node's parent shadow root or undefined if none exists
   * @public
   */
  function getParentShadowRoot(node) {
    const root = node?.getRootNode();
    // @see https://stackoverflow.com/a/63225241/988713 to see how to check that a node's root node is a shadow root
    if (root && root instanceof node?.ownerDocument?.defaultView?.ShadowRoot) {
      return root;
    }
    return undefined;
  }

  /**
   * Gets an iframe element's document, assuming the element is an iframe and it's from the same origin.
   *
   * @param {Element} element - the element, which may or may not be an iframe
   * @returns {Document|undefined} the iframe's document or undefined if the element isn't an iframe or no document exists
   * @see https://developer.mozilla.org/docs/Web/API/HTMLIFrameElement/contentDocument
   */
  function getIframeDocument(element) {
    let iframeDocument;
    if (element && element.nodeName?.toUpperCase() === "IFRAME" && element.contentDocument &&
        element.contentDocument instanceof element.contentDocument.defaultView?.Document) {
      iframeDocument = element.contentDocument;
    }
    return iframeDocument;
  }

  /**
   * Gets a node's parent iframe element if one exists.
   *
   * @param {Node} node - the node
   * @returns {Element|undefined} the node's parent iframe element or undefined if none exists
   * @public
   */
  function getParentIframe(node) {
    // Note: This commented out code doesn't work if the root is a ShadowRoot inside an iframe; we must get the ownerDocument instead
    // return node.getRootNode()?.defaultView?.frameElement;
    // @see https://stackoverflow.com/a/11199144/988713
    return node?.ownerDocument?.defaultView?.frameElement;
  }

  /**
   * Gets all the ancestor contexts that this node belongs to. For example, consider a node that is nested inside multiple
   * shadow roots or iframes, or even a mixture of shadow roots and iframes. This function will return an array
   * that contains each ancestor context (the shadow root and iframe nodes) along with a string identifying the context itself.
   *
   * Example:
   * document.querySelector("#shadow").shadowRoot.querySelector("#iframe").contentDocument.querySelector("#next-link");
   * Returns: [{node: document, context: "document"}, { node: shadowRoot, context: "shadow"}, { node: iframe, context: "iframe"}]
   *
   * @param {Node} node - the node
   * @returns {Object[]} an array of objects; each object contains the context root node and the string naming the context
   * @public
   */
  function getAncestorContexts(node) {
    const contexts = [];
    // For loop to ensure we don't go down lower than 10 levels
    for (let i = 0; i < 10; i++) {
      // If we've reached the top-level context (document) break out; this also covers null validation on node itself
      if (!node || node === document) {
        break;
      }
      let ancestor;
      let context;
      const shadow = getParentShadowRoot(node);
      if (shadow) {
        ancestor = shadow.host;
        context = "shadow";
      } else {
        const iframe = getParentIframe(node);
        if (iframe) {
          ancestor = iframe;
          context = "iframe";
        } else {
          ancestor = document;
          context = "document";
        }
      }
      // We reverse the contexts array so that we can start from the first level (document) and verify each path from start to finish in DOMPath
      contexts.unshift({ node, context });
      node = ancestor;
    }
    console.log("getAncestorContexts() - contexts=");
    console.log(contexts);
    return contexts;
  }

  /**
   * Gets a single element or multiple elements based on a context path. This is to support complex JS Paths that use a shadow
   * root or iframe as their context. Note that the iframe must be from the same origin as the page.
   *
   * Note also that the JS Path must use CSS Selectors via querySelector. Shadow roots must be CSS Selectors; XPath cannot be
   * used. Regardless, we do not support XPath for iframe context JS Paths as well.
   *
   * Shadow Example: document.querySelector("#shadow1").shadowRoot.querySelector("#shadow2").shadowRoot.querySelector("#target");
   * Iframe Example: document.querySelector("#iframe1").contentDocument.querySelector("#iframe2").contentDocument.querySelector("#target");
   *
   * @param {string} path - the full JS Path (see examples above)
   * @param {string} quantity - the quantity of nodes to return, either "single" or "multiple"
   * @param {Document} doc - the top-level document context to initially evaluate against
   * @returns {Element|Element[]} either a single element or an array of multiple elements depending on the quantity requested
   * @private
   */
  function getElementsFromContextPath(path, quantity, doc) {
    // We have two arrays. paths separates all the individual paths in the JS Path. contexts separates all the contexts (for example, this lets us support mixed iframe and shadow root contexts)
    // The map is to remove the quotes; if we can make a regex that doesn't capture them then we don't need to map the array
    const paths = path.match(/\(["|'](.*?)["|']\)/g)?.map((p) => p.substring(2, p.length - 2));
    const contexts = path.match(/\.shadowRoot|\.contentDocument/g)?.map((p) => p.replaceAll(".",""));
    let context = doc;
    if (contexts) {
      for (let i = 0; i < contexts.length; i++) {
        // console.log("getElementsFromContextPath() - i=" + i + ", context=" + contexts[i] + ", path=" + paths[i]);
        context = contexts[i] === "contentDocument" ? context.querySelector(paths[i]).contentDocument : DOMNode.getShadowRoot(context.querySelector(paths[i]));
      }
    }
    console.log("getElementsFromContextPath() - paths, contexts, chosen context=");
    console.log(paths);
    console.log(contexts);
    console.log(context);
    if (quantity === "multiple") {
      return Array.from(context.querySelectorAll(paths[paths.length - 1]));
    } else {
      return context.querySelector(paths[paths.length - 1]);
    }
  }

  /**
   * Gets all nodes (this includes both Element and Text Nodes) via the document.createTreeWalker() function.
   *
   * @param {Node} root - the root node to walk against (e.g. document.body)
   * @param {number} whatToShow - (optional) the filtered nodes to show (e.g. to only show Elements use NodeFilter.SHOW_ELEMENT)
   * @returns {Node[]} the nodes
   * @see https://stackoverflow.com/a/44516001
   * @public
   */
  function getNodesByTreeWalker(root, whatToShow) {
    console.log("getNodesByTreeWalker() - root=" + root + ", whatToShow=" + whatToShow);
    const nodes = [];
    try {
      const walker = document.createTreeWalker(root, whatToShow);
      // Note: The walker's first node is the root, so we can safely start iterating with a leading nextNode()
      while (walker.nextNode()) {
        nodes.push(walker.currentNode);
      }
    } catch (e) {
      console.log("getNodesByTreeWalker() - Error:");
      console.log(e);
    }
    return nodes;
  }

  /**
   * Inserts a node before the specified position (e.g. insertionPoint in the Element append mode).
   *
   * The reason why this function exists is because of the variety of ways that a node can be inserted. Until we
   * decide and pick one method to use in all parts of the code base, we should use and call this single function and
   * test the different methods here.
   *
   * There are multiple ways to insert an element before another element:
   * 1. Node.insertBefore
   * 2. Element.before
   * 3. Element.insertAdjacentElement
   *
   * @param {Node} node - the node to insert
   * @param {Element} position - the element position where to insert the node before
   * @see https://developer.mozilla.org/docs/Web/API/Node/insertBefore
   * @see https://developer.mozilla.org/docs/Web/API/Element/before
   * @see https://developer.mozilla.org/docs/Web/API/Element/insertAdjacentElement
   * @public
   */
  function insertBefore(node, position) {
    console.log("insertBefore() - typeof position=" + (position instanceof Node ? "Node" : position instanceof Element ? "Element" : "?") + ", typeof position.before()=" + typeof position?.before);
    if (typeof position?.before === "function") {
      // The before method is from the Element interface, but for some reason this works even if the position is a text node...
      position?.before(node);
    } else if (typeof position?.parentNode?.insertBefore === "function") {
      position?.parentNode.insertBefore(node, position);
    } else if (typeof position?.insertAdjacentElement === "function" && node instanceof Element) {
      // insertAdjacentElement is an alternative method, but only if node is Element (can't use DocumentFragments?)
      position?.insertAdjacentElement("beforebegin", node);
    }
    // position?.before(node);
  }

  /**
   * Transfers a node by adopting or importing it from another document (notably iframes) into the top-level document.
   * If either operation fails, the original node is returned as a fallback.
   *
   * Important Note: adopting the node is considered to be good practice by MDN. However, it doesn't seem to be
   * necessary. After we append the nodes to the fragment, their ownerDocument changes to this document automatically,
   * even without adopting them first. This is done by the browser as a courtesy as it would have been a breaking change
   * (see w3.org link below).
   *
   * @param {Node} node - the node to transfer
   * @param {string} mode - the node transfer mode to use ("import", "adopt", or no mode for the default)
   * @returns {Node} the node after being transferred
   * @see https://developer.mozilla.org/docs/Web/API/Document/adoptNode
   * @see https://developer.mozilla.org/docs/Web/API/Document/importNode
   * @see https://dom.spec.whatwg.org/#concept-node-adopt
   * @see https://stackoverflow.com/a/41322735
   * @see https://lists.w3.org/Archives/Public/www-dom/2010JulSep/0111.html
   * @see https://paul.kinlan.me/creating-a-popout-iframe-with-adoptnode-and-magic-iframes/
   * @private
   */
  function transferNode(node, mode) {
    // There are 3 ways to transfer the node from the nextDocument/iframeDocument to this document: importNode, adoptNode, and a standard appendChild
    // importNode doesn't work with some websites (p), so we should only use either the standard appendChild or adoptNode
    // console.log("transferNode() - before transferring, node.ownerDocument === document=" + (node.ownerDocument === document));
    let transferredNode;
    try {
      // AJAX Note: If we don't import/clone the elements, if the web page expects the elements to be there on the next page (e.g. for a replacement), it will fail to load the next page's elements
      // Ideally, we want to use adoptNode to transfer the original elements, but due to the above, this may not be possible
      // Also note that in Firefox, it throws a DeadObject error if we don't import or clone the node, so always import the nodes in AJAX mode
      // In the other iframe modes, it's okay to adopt the node because the next page will be loaded in a new iframe
      // AJAX Exception: Some websites only work if we adopt the node, not import it, so we have a special hidden setting for these sites (e.g. manga readers)
      // The only reason this function is in Scroll is due to the below line. If we want to move this to DOMNode, we would have to always pass this mode as a parameter
      // const mode = instance.transferNode || (instance.append === "ajax" ? "import" : "adopt");
      switch (mode) {
        case "import":
          transferredNode = document.importNode(node, true);
          break;
        case "adopt":
          transferredNode = document.adoptNode(node);
          break;
        default:
          transferredNode = node;
          break;
      }
    } catch (e) {
      console.log("transferNode() - error transferring this node, Error:");
      console.log(e);
      // If there was an error using importNode or adoptNode, return the original node
      transferredNode = node;
    }
    // console.log("transferNode() - after transferring, node.ownerDocument === document=" + (transferredNode.ownerDocument === document));
    return transferredNode;
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    getElement,
    getElements,
    getParentElement,
    getChildElement,
    getShadowRoot,
    getParentShadowRoot,
    getIframeDocument,
    getParentIframe,
    getAncestorContexts,
    getNodesByTreeWalker,
    insertBefore,
    transferNode
  };

})();