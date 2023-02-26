/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Elementify handles all Append Element logic. This includes getting the insertion point and the page elements.
 * The Auto Detect Page Element feature is handled by {@link AutoDetectPageElement}.
 *
 * Note: The name "Elementify" is used instead of the reserved interface name, {@link Element}.
 */
const Elementify = (() => {

  /**
   * Gets the insertion point in the Append Element mode. We first check using the insertBefore path (if supplied), and
   * then fall back to checking the elements.
   *
   * Note: The insertBefore path is completely optional and was only found to be used in ~1% of all Database records. It
   * should only be used on the first page (original document).
   *
   * @param {Element[]} elements - the page elements to use to get the insertion point from
   * @param {string} type - (optional) the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {string} path - (optional) the selector, xpath, or js path
   * @param {boolean} withDetails - (optional) whether to include the details object or not
   * @param {boolean} useInsertBefore - (optional) if true, attempts to use the insertBeforePath
   * @returns {Node|{Node, Object}} the insertion point or an object that includes it with extra details
   * @public
   */
  function getInsertionPoint(elements, useInsertBefore = false, type = "", path = "", withDetails = false) {
    const instance = Scroll.get("instance");
    path = path || instance.insertBeforePath;
    type = type || instance.pageElementType;
    // Note: We do not want to set the global insertionPoint variable in this function in case we are just checking for it
    let insertionPoint_;
    let details = "";
    // Check insertBefore only on first page on original document (wrap in try/catch in case there's a problem to fallback to normal insert point)
    try {
      if (path && useInsertBefore) {
        const result = DOMNode.getElement(path, type, "first", document);
        if (result.error) {
          throw new Error(result.error);
        }
        insertionPoint_ = result.element;
        details = chrome.i18n.getMessage("insertion_point_before");
      }
    } catch (e) {
      console.log("getInsertionPoint() - error checking insertBefore path. Error:");
      console.log(e);
      details = e.message;
    }
    // If no insertion point found using the insert before path, set insertion point using the last element
    if (!insertionPoint_ && elements && elements.length > 0) {
      try {
        const lastElement = elements[elements.length - 1];
        if (lastElement.nextSibling) {
          insertionPoint_ = lastElement.nextSibling;
          details = chrome.i18n.getMessage("insertion_point_sibling");
        } else {
          // Don't modify the DOM if only requesting details! (e.g. Popup checking...) Just return the lastElement so we get the parent from it
          if (withDetails) {
            insertionPoint_ = lastElement;
          } else {
            // TODO: Investigate if we can create an element span, as that lets us use getBoundingClientRect
            insertionPoint_ = lastElement.parentNode.appendChild(document.createTextNode(" "));
          }
          details = chrome.i18n.getMessage("insertion_point_new");
        }
      } catch (e) {
        console.log("getInsertionPoint() - error checking lastElement. Error:");
        console.log(e);
        details = e.message;
      }
    }
    console.log("getInsertionPoint() - type=" + type + ", path=" + path + "details=" + details + ", insertionPoint=");
    console.log(insertionPoint_);
    return withDetails ? [insertionPoint_, details] : insertionPoint_;
  }

  /**
   * Gets the array of page elements in Append Element mode.
   *
   * Note: Instance.buildInstance() calls this when determining if this is a database URL.
   *
   * @param {Document} doc - the document to use when querying or evaluating the array of elements
   * @param {string} type - (optional) the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {string} path - (optional) the selector, xpath, or js path
   * @param {boolean} withDetails - (optional) whether to include the details object or not
   * @returns {Element[]|{Element[], Object}} the array of page elements or an object that includes them with extra details
   * @public
   */
  function getPageElements(doc, type = "", path = "", withDetails = false) {
    const instance = Scroll.get("instance");
    path = path || instance.pageElementPath;
    type = type || instance.pageElementType;
    // Note: We do not want to set the global pageElements variable in this function in case we are just checking for it
    // Stores the exception or error message in order to return it back to the user for feedback (e.g. invalid selector)
    const result = DOMNode.getElements(path, type, doc);
    const pageElements_ = result.elements;
    const details = { error: result.error };
    // console.log("getPageElements() - type=" + type + ", path=" + path + ", elements=");
    // console.log(pageElements_);
    return withDetails ? [pageElements_, details] : pageElements_;
  }

  /**
   * Gets a filtered array of page elements that are not already in the pages array nor in the array of excluded
   * elements (e.g. the divider and bottom elements).
   *
   * @param {Object[]} pages - the pages array that contains a reference to each appended page in the DOM
   * @param {Element[]} excludedPageElements - the array of page elements to exclude
   * @param {Document} doc - the document to use when querying or evaluating the array of elements
   * @returns {Element[]} the array of filtered page elements
   */
  function getFilteredPageElements(pages, excludedPageElements, doc = document) {
    const totalPageElements = getPageElements(doc);
    // Never include the divider or bottom in the pageElements
    // let pastPageElements = [divider, bottom];
    // We need to also make sure to not include any of the page dividers (including the current divider not yet part of the pages)
    for (const page of pages) {
      excludedPageElements = excludedPageElements.concat(page.pageElements, page.divider);
    }
    const filteredPageElements = totalPageElements.filter(pageElement => !excludedPageElements.includes(pageElement));
    console.log("getFilteredPageElements() - filteredPageElements, totalPageElements, excludedPageElements=");
    console.log(filteredPageElements);
    console.log(totalPageElements);
    console.log(excludedPageElements);
    return filteredPageElements;
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    getInsertionPoint,
    getPageElements,
    getFilteredPageElements
  };

})();

/**
 * AutoDetectPageElement is solely responsible for auto detecting the page elements.
 */
const AutoDetectPageElement = (() => {

  /**
   * Variables
   *
   * TODO: Convert map to object for easier filtering/reducing?
   * @param {Map<Element, Object>} elements - the map of parent element candidates with data for the auto detect page element function
   */
  let elements;

  /**
   * Gets the declared variables. This can be used by other parts of the app or for debugging purposes.
   *
   * @returns {*} the variables
   * @public
   * @debug
   */
  function debug() {
    return { elements };
  }

  /**
   * Auto detects the page elements using a custom-made algorithm and then generates its DOM Path.
   *
   * Important: This does not accept another {@link Document} to detect. It must always use the top-level document
   * because DOMPath uses the top-level document and because we use functions like Element.getBoundingClientRect() for
   * the algorithm, which requires the element to be on the page (i.e. in the top-level document).
   *
   * @param {string} type - the path type to use ("selector" or "xpath")
   * @param {string} algorithm - the path algorithm to use ("internal" or "chromium")
   * @param {string} quote - the path quote style to use ("single" or "double")
   * @param {boolean} optimized - the path optimization to use (true generates the shortest path and false generates the full path)
   * @returns {{el: Element, path: string}} the object containing the page element and its path
   * @public
   */
  function detect(type, algorithm, quote, optimized) {
    console.log("autoDetectPageElement() - type=" + type);
    elements = new Map();
    let el;
    let path = "";
    try {
      checkChildren(document.body);
      parseMap();
      if (!elements || elements.size <= 0) {
        throw new Error("The elements map is empty or undefined!");
      }
      console.log("autoDetectPageElement() - elements=");
      console.log(elements);
      el = elements.entries().next().value[0];
      path = DOMPath.generatePath(el, type, algorithm, quote, optimized).path + (type === "xpath" ? "/*" : " > *");
      console.log("autoDetectPageElement() - path=" + path);
    } catch (e) {
      console.log("autoDetectPageElement() - Error:");
      console.log(e);
    }
    return { el: el, path: path };
  }

  /**
   * Checks an element and its children to see if it is the page element.
   *
   * @param {Element} element - the element whose children to check
   * @private
   */
  function checkChildren(element) {
    // console.log("checkChildren() - element=" + (element ? element.nodeName : ""));
    if (!element || !element.children || element.children.length <= 0) {
      return;
    }
    const data = {
      nodeNames: new Map(),
      classNames: new Map(),
      classLists: new Map()
    }
    elements.set(element, data);
    // Iffy on: IFRAME, LABEL, LEGEND, MENU (Alternative to UL/OL)
    const BANNED_NODES = ["ASIDE", "B", "BR", "CANVAS", "DATALIST", "DIALOG", "EM", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "I", "INPUT", "LINK", "NAV", "OPTGROUP", "OPTION", "NOSCRIPT", "PROGRESS", "SELECT", "SCRIPT", "STYLE", "TEMPLATE"];
    // Iffy on: "top"
    const BANNED_ATTRIBUTES = ["ads", "aside", "carousel", "dropdown", "footer", "header", "jumpbox", "menu", "menubar", "menu-bar", "nav", "navbar", "navigation", "navigation-list", "nav-bar", "paginate", "pagination", "paginator", "sidebar", "side-bar", "tooltips"];
    // Note: We shouldn't ban attributes that merely "include" any of the banned words in them. For example, consider a page that uses an outer div with the class "sidebar-content" that encapsulates both "sidebar" and "content"
    first:for (let child of element.children) {
      try {
        if (!child) {
          continue;
        }
        // Note: We use the !! to make it truthy (otherwise returns '') and we check if the element has the property to be safe
        const nodeName = !!child.nodeName && typeof child.nodeName.toUpperCase === "function" ? child.nodeName.toUpperCase() : "";
        if (!nodeName || BANNED_NODES.includes(nodeName)) {
          console.log("checkChildren() - continuing because banned node encountered:  " + (nodeName ? nodeName : "undefined"));
          continue;
        }
        const id = !!child.id && typeof child.id.toLowerCase === "function" ? child.id.toLowerCase() : "";
        // const id = child.hasAttribute("id") && typeof child.getAttribute("id").toLowerCase === "function" ? child.getAttribute("id").toLowerCase() : "";
        if (id && BANNED_ATTRIBUTES.includes(id)) {
          console.log("checkChildren() - continuing because banned id encountered:    " + id);
          continue;
        }
        // // Note: SVGs can't have classNames and will throw an exception if we don't check if toLowerCase() is a function
        // const className = (!!child.className && typeof child.className.toLowerCase === "function" ? child.className.toLowerCase() : "").trim();
        // // const className = child.hasAttribute("class") && typeof child.getAttribute("class").toLowerCase === "function" ? child.getAttribute("class").toLowerCase() : "";
        // if (className && ATTRIBUTE_BANS.includes(className)) {
        //   continue;
        // }
        // We check each child's class individually to see if it's banned
        const classList = child.classList;
        if (classList) {
          for (let clazz of classList) {
            clazz = (!!clazz && typeof clazz.toLowerCase === "function" ? clazz.toLowerCase() : "").trim();
            if (clazz && BANNED_ATTRIBUTES.includes(clazz)) {
              console.log("checkChildren() - continuing because banned class encountered: " + clazz);
              continue first;
            }
          }
        }
        // Check if this element is visible on the page
        try {
          const style = window.getComputedStyle(child);
          if (style && (style.display === "none" || style.visibility === "hidden" || (/(0)/.test(style.opacity)))) {
            continue;
          }
        } catch (e) {
          console.log("checkChildren() - Error calling window.getComputedStyle()r:");
          console.log(e);
        }
        // nodeName can't possibly be null or empty
        const nodeNameCount = elements.get(element).nodeNames.get(nodeName) || 0;
        elements.get(element).nodeNames.set(nodeName, nodeNameCount + 1);
        // className might be null or empty since we still want the nodeName for this element, but we won't add it to the classNames map
        const className = (!!child.className && typeof child.className.toLowerCase === "function" ? child.className.toLowerCase() : "").trim();
        if (className) {
          const classCount = elements.get(element).classNames.get(className) || 0;
          elements.get(element).classNames.set(className, classCount + 1);
          // Element Class List (Not Child)
          // const elementClassList = element.classList;
          // For each class that this child has, we will put it in the classLists map and keep doing this for the remaining children as we loop
          for (const clazz of classList) {
            const clazzCount = elements.get(element).classLists.get(clazz) || 0;
            elements.get(element).classLists.set(clazz, clazzCount + 1);
          }
        }
        checkChildren(child);
      } catch (e) {
        console.log("checkChildren() - Error:");
        console.log(e);
      }
    }
  }

  /**
   * Parses the elements map by filtering out bad data first and sorting the maps. It then compares the maps same max
   * value and sets the elements map with the one that has the best chance to be the page element.
   *
   * @private
   */
  function parseMap() {
    console.log("parseResults()");
    // This is a bit hacky, but we never want the body. We always start out with it in the beginning.
    // TODO: Find a way to start out without using the body?
    elements.delete(document.body);
    // Remove elements with no nodeNames (e.g. no children) and that have a width or height of less than 500 px (some have 0 on eiter, so we do an OR check here, not AND)
    // If we don't do this then we will have the ones with no children return -Infinity when we sort, but they'll still be at the bottom, so it's not necessary maybe?
    elements = new Map(
      [...elements].filter(function ([k,v]) {
        // Important: We must be using the top-level document in order to use functions like getBoundingClientRect
        const position = DOMNode.getElementPosition(k);
        const rect = position?.rect;
        // TODO: Check element (k).children's positions and get the topmost and bottommost to determine the height of the content instead of rect.height?
        // TODO: Decide on overflowing as a potential ban, e.g. Google Search Results Page 1 sidebar content
        // let overflowing = false;
        // try {
        //   // Important: We must be using the top-level document in order to use functions like getBoundingClientRect
        //   if (k && typeof k.getBoundingClientRect === "function") {
        //     rect = k.getBoundingClientRect();
        //     const position = DOMNode.getElementPosition(k);
        //   }
        //   // overflowing = getTotalWidth(document) < rect.right;
        // } catch (e) {
        //   console.log("parseMap() - error calling getBoundingClientRect()");
        // }
        return v.nodeNames.size > 0 && (rect && typeof rect.height === "number" && typeof rect.width === "number" ? rect.height > 500 || rect.width > 500 : true);
        // return v.nodeNames.size > 0 && (height > 500 || height === 0);
        // return v.nodeNames.size > 0 && (rect && typeof rect.height === "number" && rect.height > 0 ? rect.height > 500 : typeof rect.width === "number" && rect.width > 0 ? rect.width > 500 : true);
        // return v.nodeNames.size > 0 && (rect && typeof rect.right === "number" ? !overflowing : true) && (rect && typeof rect.height === "number" && typeof rect.width === "number" ? rect.height > 500 || rect.width > 500 : true);
      })
    );
    // // This is a bit hacky but sometimes with the getBoundingClientRect we get an empty map so we have to do it without...
    // if (elements2 && elements2.size > 0) {
    //   elements = elements2;
    // } else {
    //   elements = new Map([...elements].filter(function ([k,v]) { return v.nodeNames.size > 0; }));
    // }
    // Wanted to use 10, but Google Search seems to top out at 9 for id rso search results
    const similarityThreshold = 9;
    // Compare the maps. If there is an element that has at least 10 children with the same className, use that element.
    // 1st Choice: Use the element with the most children that have the same exact className
    const classNames = sortMap("classNames");
    if (classNames && classNames.size > 0) {
      let classNamesMax = Math.max(...[...classNames.entries().next().value[1]["classNames"].values()])
      console.log("parseMap() - classNamesMax=" + classNamesMax);
      if (classNamesMax >= similarityThreshold) {
        elements = classNames;
        return;
      }
    }
    // 2nd Choice: Use the element with the most children that have the same single class (in classLists)
    const classLists = sortMap("classLists");
    if (classLists && classLists.size > 0) {
      let classListsMax = Math.max(...[...classLists.entries().next().value[1]["classLists"].values()])
      console.log("parseMap() - classListsMax=" + classListsMax);
      if (classListsMax >= similarityThreshold) {
        elements = classLists;
        return;
      }
    }
    // Otherwise use the element with the most children that have the same nodeName
    elements = sortMap("nodeNames");
  }

  /**
   * Sorts the elements map out by a specific property, either the max number of the same classNames or nodeNames.
   * This is needed for the algorithm.
   *
   * @param {string} property - the property to examine
   * @returns {Map<Element, Object>} the sorted map by the most number of children with the property to examine
   * @see Use Map.reduce to make this simpler? https://medium.com/poka-techblog/simplify-your-javascript-use-map-reduce-and-filter-bd02c593cc2d
   * @private
   */
  function sortMap(property) {
    console.log("sortMap() - property=" + property);
    // a[0] is the key (element) and a[1] is the value (object, containing nodeNames and classNames)
    return new Map([...elements.entries()].sort((a, b) => {
      // Note the double ... ..., Math.max takes in an arguments in parenthesis, NOT arrays
      // so we convert the map to an array (first ...) then we convert the array [1,2,3] to arguments in parenthesis (1,2,3) for the second ...
      const amax = Math.max(...[...a[1][property].values()]) || 0;
      const bmax = Math.max(...[...b[1][property].values()]) || 0;
      // console.log("a=" + amax + " b=" + bmax);
      return bmax - amax;
    }));
  }

  // Holding off on this for now
  // function getTotalWidth(doc) {
  //   const html = doc.documentElement;
  //   const body = doc.body;
  //   console.log("getTotalWidth() - hcw="  + html.clientWidth + ", hsw=" + html.scrollWidth + ", how=" + html.offsetWidth + ", bcw=" + body.clientWidth + ", bsw=" + body.scrollWidth + ", bow=" + body.offsetWidth);
  //   return Math.max(html.clientWidth, html.scrollWidth, html.offsetWidth, body.clientWidth, body.scrollWidth, body.offsetWidth);
  // }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    debug,
    detect
  };

})();