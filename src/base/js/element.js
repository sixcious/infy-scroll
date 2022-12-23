/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Element_ handles all Append Element logic. This currently only includes the Auto Detect Page Element feature,
 * but we will be transporting some of the element code in Scroll to here.
 *
 * Note: We intentionally use the name "Element_" instead of the singular reserved "Element."
 */
const Element_ = (() => {

  /**
   * Variables
   * TODO: Convert map to object for easier filtering/reducing?
   *
   * @param {Map} elements the map of parent element candidates for the auto detect page element function
   */
  let elements;

  /**
   * Gets the declared variables. This can be used by other parts of the app or for debugging purposes.
   *
   * @returns {*} the variables
   * @public
   */
  function get() {
    return { elements };
  }

  /**
   * Auto detects the page element using a custom-made algorithm and then generates its selector or xpath.
   *
   * @param currentDocument the document the page element is on
   * @param type            the path type to generate ("selector" or "xpath")
   * @param algorithm       the DOM Path algorithm to use ("internal" or "chromium")
   * @param quote           the DOM Path quote style to use ("double" or "single")
   * @param optimized       the DOM Path optimization (true generates the shortest path, false generates the full path)
   * @returns {*} object containing the page element and its path
   * @public
   */
  function autoDetectPageElement(currentDocument, type, algorithm, quote, optimized) {
    console.log("autoDetectPageElement() - type=" + type);
    elements = new Map();
    let el;
    let path = "";
    try {
      checkChildren(currentDocument.body);
      parseMap();
      if (!elements || elements.size <= 0) {
        throw new Error("The elements map is empty or undefined!");
      }
      el = elements.entries().next().value[0];
      // How does DOMPath know which document we're using?
      path = DOMPath.generatePath(el, type, algorithm, quote, optimized) + (type === "xpath" ? "/*" : " > *");
      // new HoverBox().highlightElement(el, true);
      console.log("autoDetectPageElement() - rule=" + path);
    } catch (e) {
      console.log("autoDetectPageElement() - Error:");
      console.log(e);
    }
    return { el: el, path: path };
  }

  /**
   * Checks an element and its children to see if it is the page element.
   *
   * @param element {Element} the element whose children to check
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
    const BANNED_ATTRIBUTES = ["ads", "aside", "dropdown", "footer", "header", "jumpbox", "menu", "menubar", "menu-bar", "nav", "navbar", "navigation", "navigation-list", "nav-bar", "paginate", "pagination", "paginator", "sidebar", "side-bar", "tooltips"];
    // Note: We shouldn't ban attributes that merely "include" any of the banned words in them. For example, consider a page that uses an outer div with the class "sidebar-content" that encapsulates both "sidebar" and "content"
    x:for (let child of element.children) {
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
              continue x;
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
        let rect;
        // TODO: Decide on overflowing as a potential ban, e.g. Google Search Results Page 1 sidebar content
        // let overflowing = false;
        try {
          // Note: This sometimes used to always return false when the page is first loaded (if the instance is already on), always returning false and giving us an empty elements map
          // Note 2: Found the reason, it was due to using document_ (latest doc, not on the page), so we don't have getBCR. So the solution is to just always pass in regular document
          if (k && typeof k.getBoundingClientRect === "function") {
            rect = k.getBoundingClientRect();
          }
          // overflowing = getTotalWidth(document) < rect.right;
        } catch (e) {
          console.log("parseMap() - error calling getBoundingClientRect()");
        }
        return v.nodeNames.size > 0 && (rect && typeof rect.height === "number" && typeof rect.width === "number" ? rect.height > 500 || rect.width > 500 : true);
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
    // Wanted to use 10, but Google Search seems to top out at 9 for id rso search results...
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
   * @param property {string} the property to examine
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

  // function getTotalWidth(doc) {
  //   const html = doc.documentElement;
  //   const body = doc.body;
  //   console.log("getTotalWidth() - hcw="  + html.clientWidth + ", hsw=" + html.scrollWidth + ", how=" + html.offsetWidth + ", bcw=" + body.clientWidth + ", bsw=" + body.scrollWidth + ", bow=" + body.offsetWidth);
  //   return Math.max(html.clientWidth, html.scrollWidth, html.offsetWidth, body.clientWidth, body.scrollWidth, body.offsetWidth);
  // }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    get,
    autoDetectPageElement
  };

})();