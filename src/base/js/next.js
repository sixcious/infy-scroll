/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Next handles all next and prev link logic, mainly finding the next or prev link on the page.
 *
 * The algorithm performs the following steps:
 * 1. Path - Using a CSS Selector or XPath expression to find the link directly
 * 2. Keywords - Parsing the page for links that contain common next or prev keywords
 */
const Next = (() => {

  /**
   * Variables
   *
   * @param {*} urls - the object of all url candidates for the next or previous link
   */
  let urls;

  /**
   * Gets the declared variables. This can be used by other parts of the app or for debugging purposes.
   *
   * @returns {*} the variables
   * @public
   */
  function get() {
    return { urls };
  }

  /**
   * Finds the next or prev link using an instance and an array of potential documents and pages (convenience function).
   *
   * @param {Object} instance - the instance containing the link properties
   * @param {Object} items - the storage items containing the global link properties
   * @param {string} action - the type of link ("next" or "prev")
   * @param {Document[]} documents - the array of documents to check for a link
   * @param {Object[]} pages - (optional) the current pages that have been appended
   * @returns {*} the next or prev url (if found) along with extra details used to find it or an error message
   * @public
   */
  function findLinkWithInstance(instance, items, action, documents , pages ) {
    console.log("findLinkWithInstance()");
    return findLinkWithProperties(
      instance[action + "LinkPath"],
      instance[action + "LinkType"],
      instance[action + "LinkProperty"],
      instance[action + "LinkKeywordsEnabled"],
      items[action + "LinkKeywords"],
      instance[action + "LinkKeyword"],
      // This is always false because if we have an instance, we know we have the keyword; this should only be true if the Popup is checking for the next/prev link
      false,
      documents,
      pages,
      instance.url,
      instance.debugEnabled);
  }

  /**
   * Finds the next or prev link using properties and an array of potential documents and pages (convenience function).
   *
   * @param {string} path - the selector, xpath, or js path
   * @param {string} type - the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {string[]} property - the array of properties to use e.g. ["href"] or ["parentNode", "href"] for nested properties like parentNode.href
   * @param {boolean} keywordsEnabled - whether to use the next or prev keywords as a fallback to the selector/xpath expression
   * @param {string[]} keywords - the next or prev keywords list to use, ordered and sorted in priority
   * @param {Object} keywordObject - the static keyword object to use for this instance's pages
   * @param {boolean} checkOtherKeywords - if this is the first page or not in order to determine whether we should fallback to other keywords (true or false)
   * @param {Document[]} documents - the array of documents to check for a link
   * @param {Object[]} pages - (optional) the current pages that have been appended
   * @param {string} currentURL - the instance.url to check to see if the next url is a duplicate of it
   * @param {boolean} highlight - whether to highlight the next/prev element
   * @returns {*} the next or prev url (if found) along with extra details used to find it or an error message
   * @public
   */
  function findLinkWithProperties(path, type, property , keywordsEnabled, keywords, keywordObject, checkOtherKeywords, documents = [document], pages = [], currentURL, highlight = false) {
    console.log("findLinkWithProperties()");
    let result;
    for (const doc of documents) {
      // Firefox Dead Object Error - Need to wrap this in a try-catch in case one of the documents (namely currentDocument) is dead
      try {
        if (!doc) {
          continue;
        }
        result = Next.findLink(path, type, property, keywordsEnabled, keywords, keywordObject, checkOtherKeywords, doc, highlight);
        // We purposely only accept the link if it is different than one we've already found
        // TODO: We may be still returning duplicate links sometimes with # params as the only difference, make a decision on this
        result.duplicate = (result.url === currentURL) || !!(pages && pages.find(p => p.url === result.url));
        if (result.url && !result.duplicate) {
          break;
        }
      } catch (e) {
        console.log("findLinkWithProperties() - error most likely Firefox Dead Object Error, Error:")
        console.log(e);
      }
    }
    console.log("returning result, result=");
    console.log(result);
    return result;
  }

  /**
   * Finds the next or prev link using a path or keywords.
   *
   * TODO: Parse iframes (and older frames and framesets?) nested inside the document
   * TODO: Ideally, we should stop checking keywords as soon as we find one that is self equals attributes
   *
   * @param {string} path - the selector, xpath, or js path
   * @param {string} type - the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {string[]} property - the array of properties to use e.g. ["href"] or ["parentNode", "href"] for nested properties like parentNode.href
   * @param {boolean} keywordsEnabled - whether to use the next or prev keywords as a fallback to the selector/xpath expression
   * @param {string[]} keywords - the next or prev keywords list to use, ordered and sorted in priority
   * @param {Object} keywordObject - the static keyword object to use for this instance's pages
   * @param {boolean} checkOtherKeywords - if this is the first page or not in order to determine whether we should fallback to other keywords (true or false)
   * @param {Document} doc - (optional) Infy Scroll only: the current document on the page to query
   * @param {boolean} highlight - whether to highlight the next/prev element
   * @returns {*} the next or prev url (if found) along with extra details used to find it or an error message
   * @public
   */
  function findLink(path, type, property = ["href"], keywordsEnabled, keywords, keywordObject, checkOtherKeywords, doc = document, highlight = false) {
    console.log("findLink() - path=" + path + ", type=" + type + ", property=" + property + ", keywordsEnabled=" + keywordsEnabled + ", keywords=" + keywords + ", keywordObject=" + keywordObject + ", checkOtherKeywords=" + checkOtherKeywords + ", doc=" + doc + ", highlight=" + highlight);
    // The urls object stores the Path URL (selector or xpath), and Keywords URLs (self/child/parent attribute and innerText)
    urls = {
      "path": undefined,
      "keywords": {
        "self": {
          "attribute": { "equals": new Map(), "startsWith": new Map(), "endsWith": new Map(), "includes": new Map() },
          "innerText": { "equals": new Map(), "startsWith": new Map(), "endsWith": new Map(), "includes": new Map() }
        },
        "child": {
          "attribute": { "equals": new Map(), "startsWith": new Map(), "endsWith": new Map(), "includes": new Map() },
          "innerText": { "equals": new Map(), "startsWith": new Map(), "endsWith": new Map(), "includes": new Map() }
        },
        "parent": {
          "attribute": { "equals": new Map(), "startsWith": new Map(), "endsWith": new Map(), "includes": new Map() },
          "innerText": { "equals": new Map(), "startsWith": new Map(), "endsWith": new Map(), "includes": new Map() }
        }
      }
    };
    // Note: This is the Keyword Algorithm. The algorithm order matters, the highest priority algorithms are first when they are iterated below
    const algorithms = [
      { "relationship": "self", "type": "attribute", "subtypes": ["equals"] },
      { "relationship": "self", "type": "innerText", "subtypes": ["equals"] },
      { "relationship": "child", "type": "attribute", "subtypes": ["equals"] },
      { "relationship": "child", "type": "innerText", "subtypes": ["equals"] },
      { "relationship": "parent", "type": "attribute", "subtypes": ["equals"] },
      { "relationship": "parent", "type": "innerText", "subtypes": ["equals"] },
      // Combined startsWith, endsWith, and includes for priority on keywords instead of the subtypes
      { "relationship": "self", "type": "attribute", "subtypes": ["startsWith", "endsWith", "includes"] },
      { "relationship": "self", "type": "innerText", "subtypes": ["startsWith", "endsWith", "includes"] },
      { "relationship": "child", "type": "attribute", "subtypes": ["startsWith", "endsWith", "includes"] },
      { "relationship": "child", "type": "innerText", "subtypes": ["startsWith", "endsWith", "includes"] },
      { "relationship": "parent", "type": "attribute", "subtypes": ["startsWith", "endsWith", "includes"] },
      { "relationship": "parent", "type": "innerText", "subtypes": ["startsWith", "endsWith", "includes"] }
    ];
    // Stores the exception or error message in order to return it back to the user for feedback (e.g. invalid selector)
    const details = { error: undefined };
    checkPath(path, type, property, doc, details);
    // If a URL was found using the selector or xpath path, return it (minus the element)
    if (urls.path) {
      console.log("findLink() - found a URL using the " + urls.path.method + " path " + urls.path.path + ": " + urls.path.url);
      highlightElement(urls.path.element, highlight);
      return { "url": urls.path.url, "method": urls.path.method, "path": urls.path.path, "element": urls.path.element.elementName };
    }
    // keywordsEnabled can be either: true, false, or undefined (we don't store keywordsEnabled in the storage items, so it's undefined there!)
    // If keywordsEnabled is true OR if keywordsEnabled is undefined (i.e. we don't know yet as this is our first time checking), check keywords and return the result if found
    if (keywords && (keywordsEnabled || keywordsEnabled === undefined)) {
      checkKeywords(keywords, doc, details);
      console.log("findLink() - found the following next/prev URLs via keywords (no path match):");
      console.log(urls);
      if (keywordObject) {
        let value;
        try {
          // keywordObject Array: 0=relationship, 1=type, 2=subtype, 3=keyword
          const ko = keywordObject.split(" ");
          value = urls.keywords[ko[0]][ko[1]][ko[2]].get(ko[3]);
        } catch (e) {
          console.log("findLink() - Error parsing keywordObject, Error:");
          console.log(e);
        }
        if (value) {
          console.log("findLink() - returning keywordObject url:" + value.url);
          console.log(value);
          highlightElement(value.element, highlight);
          return { "url": value.url, "method": "keyword", "keywordObject": keywordObject, "element": value.elementName, "attribute": value.attribute };
        }
      }
      // We only want to fallback to other keywords if the keywordObject doesn't exist or if this is the first page in the series
      if (!keywordObject || checkOtherKeywords) {
        for (const algorithm of algorithms) {
          const result = traverseURLs(algorithm.relationship, algorithm.type, algorithm.subtypes, keywords, highlight);
          if (result) {
            // If this keyword isn't the same as the original keyword, we need to explicitly mention this by suffixing -alternate to the method
            if (keywordObject && checkOtherKeywords) {
              result.method += "-alternate";
            }
            console.log("findLink() - returning keywordObject url:");
            console.log(result);
            return result;
          }
        }
      }
    }
    // If still haven't returned a URL, return the error
    return details;
  }

  /**
   * Checks if the selector or xpath matches against an element's property (i.e. a.href).
   *
   *
   * @param {string} path - the selector, xpath, or js path
   * @param {string} type - the path type to use ("selector", "xpath") or context ("document", "shadow", "iframe")
   * @param {string[]} property - the array of properties to use e.g. ["href"] or ["parentNode", "href"] for nested properties like parentNode.href
   * @param {Document} doc - (optional) Infy Scroll only: the current document on the page to query
   * @param {Object} details - the details object that stores details about this action, such as error messages that were caught
   * @private
   */
  function checkPath(path, type, property, doc, details) {
    try {
      const result = DOMNode.getElement(path, type, "first", doc);
      if (result.error) {
        throw new Error(result.error);
      }
      const element = result.element;
      // No element found, don't bother continuing. We don't want to put any unnecessary errors into details at this point as the path was valid if it got to this point
      if (!element) {
        return;
      }
      let url = element[property[0]];
      for (let i = 1; i < property.length; i++) {
        url = url[property[i]];
      }
      // If no URL was found using the specified property, try using hard-coded properties that are known to contain URLs
      let defaultProperty;
      if (!url) {
        defaultProperty = element.href ? "href" : element.action ? "action" : element.formAction ? "formAction" : undefined;
        // If we found a URL using one of the default properties, use it
        if (defaultProperty) {
          property = [defaultProperty];
          url = element[property[0]];
        }
      }
      // If the property isn't [href], we may be dealing with a relative URL (href will always give us the absolute URL)
      // In this situation, we will try and make sure we are getting the absolute URL by passing in the window.location.origin as the basepoint second argument in the URL
      if (url && !defaultProperty && property && !property.includes("href")) {
        console.log("checkPath() - property isn't href! attempting to deal with a potential relative URL, url=" + url + ", property=" + property);
        try {
          url = new URL(url, document.baseURI).href;
        } catch (e) {
          console.log("checkPath() - Exception caught trying to get the absolute URL from the potential relative URL. Error:")
          console.log(e);
          details.error = e.message;
        }
      }
      // Fix the Link before testing if it's valid
      url = Util.fixURL(url);
      if (Util.isValidURL(url, "next-prev", details)) {
        urls.path = { "url": url, "method": type, "path": path + "." + property.join(".") + (defaultProperty ? chrome.i18n.getMessage("next_prev_default_property") : ""), "element": element };
      }
    } catch (e) {
      console.log("checkPath() - Exception caught when querying for selector or evaluating xpath. Error:");
      console.log(e);
      details.error = e.message;
    }
  }

  /**
   * Checks the keywords against all elements with a URL (i.e. href).
   * Checks that the URL is valid and then checks the element's parent and the element itself if the keyword matches.
   *
   * @param {string[]} keywords - the next or prev keywords list to use, ordered and sorted in priority
   * @param {Document} doc - (optional) Infy Scroll only: the current document on the page to query
   * @param {Object} details - the details object that stores details about this action, such as error messages that were caught
   * @private
   */
  function checkKeywords(keywords, doc, details) {
    // const startTime = performance.now();
    // TODO: Just check [href] regardless of element tag names?
    const elements = doc.querySelectorAll("link[href], a[href], area[href], form[action], button[formaction]");
    for (const element of elements) {
      try {
        // Try to obtain the URL from the element by looking at what type of element it is and checking for properties that typically store URLs
        const elementName = element.nodeName.toLowerCase();
        let url = element.href ? element.href : elementName === "form" && element.action ? element.action : elementName === "button" && element.formAction ? element.formAction : "";
        // Fix the Link before testing if it's valid
        url = Util.fixURL(url);
        // Make sure we check if this URL has a valid extension when we're checking keywords!
        if (Util.isValidURL(url, "next-prev", details) && Util.isValidExtension(url, "next-prev", details)) {
          // Check the actual element first
          checkElement(keywords, url, elementName, element, "self");
          // Check the parent element. Sometimes the anchor is wrapped inside another element (like a li) with the keyword
          const parent = element.parentNode;
          if (parent && parent.nodeName) {
            // Don't check super-root parents like html, head, and body
            const parentName = parent.nodeName.toLowerCase();
            if (parentName !== "html" && parentName !== "head" && parentName !== "body") {
              checkElement(keywords, url, elementName, parent, "parent");
            }
          }
          // Check the children (i.e. the element's innerHTML) except for forms (they're much too big and have too many children!)
          // TODO: Use childNodes instead of children? children only looks at elements, whereas childNodes includes text nodes
          const children = element.children;
          if (children && children.length > 0 && elementName !== "form") {
            checkChildElements(keywords, url, elementName, children, 1);
          }
          // TODO: Check element.nextSibling? May be TOO aggressive and error-prone
        }
      } catch (e) {
        console.log("buildURLs() - Error:");
        console.log(e);
        details.error = e.message;
      }
    }
    // const endTime = performance.now();
    // console.log("findLink() - Call to do test took " + (endTime - startTime) + " milliseconds");
  }

  /**
   * Checks if an element and any of its child elements matches any of the keywords. This checks the elements in
   * multiple ways: attribute and innerText.
   *
   * @param {string[]} keywords - the next or prev keywords list to use, ordered and sorted in priority
   * @param {string} url - the URL of the link to check
   * @param {string} elementName - the element's node name
   * @param {HTMLCollection} children - the child elements to check (does not include text nodes)
   * @param {number} level - the current children depth level, e.g. first-level children, second-level children, ... up to a hard-coded max
   * @private
   */
  function checkChildElements(keywords, url, elementName, children, level) {
    // console.log("checkChildElements() - elementName=" + elementName + " children.length=" + (children ? children.length : "undefined")  + ", level=" + level);
    for (const child of children) {
      checkElement(keywords, url, elementName, child, "child");
      // Recursively check only 10 levels down
      if (child && child.children && child.children.length > 0 && level < 10) {
        checkChildElements(keywords, url, elementName, child.children, level + 1);
      }
    }
  }

  /**
   * Checks if this element matches any of the keywords. This checks the element in multiple ways, including its
   * attributes and innerText.
   *
   * @param {string[]} keywords - the next or prev keywords list to use, ordered and sorted in priority
   * @param {string} url - the URL of the link to check
   * @param {string} elementName - the element's node name
   * @param {HTMLElement} element - the element to check
   * @param {string} relationship - the algorithm element relationship to use ("self", "child", or "parent")
   * @private
   */
  function checkElement(keywords, url, elementName, element, relationship) {
    if (element) {
      for (const attribute of element.attributes) {
        if (attribute && attribute.nodeValue && attribute.nodeName) {
          parseText(keywords, "attribute", url, attribute.nodeValue.replace(/\s|-|_/g, "").toLowerCase(), elementName, element, attribute.nodeName.toLowerCase(), relationship);
        }
      }
      if (element.innerText) {
        parseText(keywords, "innerText", url, element.innerText.replace(/\s|-|_/g, "").toLowerCase(), elementName, element, undefined, relationship);
      }
      // TODO: Also check other properties like background-image using window.getComputedStyle()? However, we can't use getComputedStyle() unless the element is already in the DOM...
      // parseText(keywords, "backgroundImage", url, element.ownerDocument.defaultView.getComputedStyle(element).backgroundImage.replace(/\s/g, "").toLowerCase(), elementName, element, undefined, relationship);
    }
  }

  /**
   * Parses an element's text for keywords that might indicate a next or prev link.
   * Adds the link to the urls map if a match is found.
   *
   * @param {string[]} keywords - the next or prev keywords list to use, ordered and sorted in priority
   * @param {string} type - the algorithm main type to use ("attribute" or "innerText")
   * @param {string} url - the URL of the link to check
   * @param {string} text - the element's attribute or innerText value to parse keywords from
   * @param {string} elementName - the element's node name
   * @param {HTMLElement} element - the element to check
   * @param {string} attribute - (optional) the element attribute's node name if it's needed
   * @param {string} relationship - the algorithm element relationship to use ("self", "child", or "parent")
   * @private
   */
  function parseText(keywords, type, url, text, elementName, element, attribute, relationship) {
    const value = { url: url, element: element, elementName: elementName, attribute: attribute, relationship: relationship };
    for (const keyword of keywords) {
      // Don't bother optimizing this by first checking includes. equals/startsWith/endsWith will all fail early in implementation.
      if (text === keyword) {
        urls.keywords[relationship][type]["equals"].set(keyword, value);
      } else if (text.startsWith(keyword)) {
        urls.keywords[relationship][type]["startsWith"].set(keyword, value);
      } else if (text.endsWith(keyword)) {
        urls.keywords[relationship][type]["endsWith"].set(keyword, value);
      } else if (text.includes(keyword)) {
        urls.keywords[relationship][type]["includes"].set(keyword, value);
      }
      // Regex:
      // if (keyword.startsWith("/") && keyword.endsWith("/") && new RegExp(keyword.slice(1,-1)).test(text)) {
      //   urls.keywords[relationship][type]["equals"].set(keyword, value);
      // }
    }
  }

  /**
   * Traverses the urls object to see if a URL was found. e.g. urls[attributes][equals][next]
   *
   * @param {string} relationship - the algorithm element relationship to use ("self", "child", or "parent")
   * @param {string} type - the algorithm main type to use ("attribute" or "innerText")
   * @param {string[]} subtypes - the algorithm subtypes to use ("equals", "startsWith", "endsWith", "includes")
   * @param {string[]} keywords - the next or prev keywords list to use, ordered and sorted in priority
   * @param {boolean} highlight - whether to highlight the next/prev element
   * @returns {*} the next or prev url (if found) along with the subtype and keyword that was used to find it
   * @private
   */
  function traverseURLs(relationship, type, subtypes, keywords, highlight) {
    for (const keyword of keywords) {
      for (const subtype of subtypes) {
        if (urls.keywords[relationship][type][subtype].has(keyword)) {
          const value = urls.keywords[relationship][type][subtype].get(keyword);
          console.log("traverseResults() - a next/prev link was found:" + relationship + " - " +  type + " - " + subtype + " - " + keyword + " - " + value.elementName + " - " + value.attribute + " - " + value.url);
          highlightElement(value.element, highlight);
          const keywordObject = relationship + " " + type + " " + subtype + " " + keyword;
          return { url: value.url, method: "keyword", keywordObject: keywordObject, element: value.elementName, attribute: value.attribute };
        }
      }
    }
  }

  /**
   * Highlights the element on the page.
   * Important: If the element isn't in the top-level document, it can't be highlighted.
   *
   * @param {Element} element - the element
   * @param {boolean} highlight - true if this element should be highlighted, false otherwise
   * @private
   */
  function highlightElement(element, highlight) {
    try {
      if (highlight && typeof HoverBox !== "undefined") {
        new HoverBox().highlightElement(element, true);
      }
    } catch (e) {
      console.log("highlightElement() - Error:");
      console.log(e);
    }
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    get,
    findLink,
    findLinkWithProperties,
    findLinkWithInstance
  };

})();