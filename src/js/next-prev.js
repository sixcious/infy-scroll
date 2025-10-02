/**
 * Infy Scroll
 * @copyright © 2020 Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * NextPrev handles all next and prev link logic, mainly finding the next or prev link on the page.
 *
 * The algorithm performs the following steps:
 * 1. Rule - Using a CSS Selector or XPath rule to find the link directly
 * 2. Keywords - Parsing the page for links that contain common next or prev keywords
 */
const NextPrev = (() => {

  // TODO: Is this bad for performance to keep this object available in memory?
  let urls;

  /**
   * Gets the last calculated URLs object.
   * Note that this function is only needed for debugging purposes.
   *
   * @returns {*} the urls object
   * @public
   * @debug
   */
  function getURLs() {
    return urls;
  }

  /**
   * Finds the next or prev URL based on the CSS Selector or XPath rule. Falls back to parsing the page using common
   * next or prev keywords.
   *
   * TODO: Parse iframes (and older frames and framesets?) nested inside the document
   * TODO: Ideally, we should stop checking keywords as soon as we find one that is self equals attributes
   *
   * @param type             the rule type can be "selector" or "xpath"
   * @param selector         the next or prev css selector rule to use
   * @param xpath            the next or prev xpath rule to use
   * @param property         the array of next or prev css selector/xpath properties to use e.g. ["href"] or ["parentNode", "href"] for nested properties like parentNode.href
   * @param keywordsEnabled  whether to use the next or prev keywords as a fallback to the selector/xpath rule
   * @param keywords         the next or prev keywords list to use
   * @param decodeURIEnabled whether to decode the URI or not
   * @param debugEnabled     if debug mode is enabled (to highlight the next/prev DOM element)
   * @param document_        (optional) Infy Scroll only: the current document on the page to query
   * @returns {*} the next or prev url (if found) along with the subtype and keyword that was used to find it
   * @public
   */
  function findNextPrevURL(type, selector, xpath, property, keywordsEnabled, keywords, decodeURIEnabled, debugEnabled, document_) {
    console.log("findNextPrevURL() - type=" + type + ", selector=" + selector + ", xpath=" + xpath + ", property=" + property + ", keywordsEnabled=" + keywordsEnabled + ", keywords=" + keywords + ", document=" + (document_ ? document_.location : "") + ", debugEnabled=" + debugEnabled);
    // The urls object stores the Rule URL (selector or xpath), and Keywords URLs (self/child/parent attribute and innerText)
    urls = {
      "rule": undefined,
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
    // If not parsing a specific document (e.g. an iframe's document), assume this is the root HTML document
    if (!document_) {
      document_ = document;
    }
    checkRule(urls, type, selector, xpath, property, decodeURIEnabled, document_, details);
    // If a URL was found using the selector or xpath rule, return it (minus the element)
    if (urls.rule) {
      console.log("findNextPrevURL() - found a URL using the " + urls.rule.method + " rule " + urls.rule.rule + ": " + urls.rule.url);
      highlightElement(urls.rule.element, debugEnabled);
      return { "url": urls.rule.url, "method": urls.rule.method, "rule": urls.rule.rule, "element": urls.rule.element.elementName };
    }
    // If keywordsEnabled, check keywords and return the result if found
    if (keywordsEnabled) {
      checkKeywords(urls, keywords, decodeURIEnabled, document_, details);
      console.log("findNextPrevURL() - found the following next/prev URLs via keywords (no rule match):");
      console.log(JSON.stringify(Object.values(urls)));
      for (const algorithm of algorithms) {
        const result = traverseURLs(urls, algorithm.relationship, algorithm.type, algorithm.subtypes, keywords, debugEnabled);
        if (result) {
          return result;
        }
      }
    }
    // If still haven't returned a URL, return the error
    return details;
  }

  /**
   * Checks if the selector or xpath rule matches against an element's property (i.e. a.href).
   *
   * @param urls             the urls object that stores all the links found when parsing this document
   * @param type             the link type to use: attribute or innerText
   * @param selector         the next or prev css selector rule to use
   * @param xpath            the next or prev xpath rule to use
   * @param property         the array of next or prev css selector/xpath properties to use e.g. ["href"] or ["parentNode", "href"] for nested properties like parentNode.href
   * @param decodeURIEnabled whether to decode the URI or not
   * @param document_        the current document on the page to query
   * @param details          the details object that stores details about this action, such as error messages that were caught
   * @private
   */
  function checkRule(urls, type, selector, xpath, property, decodeURIEnabled, document_, details) {
    try {
      let element;
      let defaultProperty;
      if (type === "xpath") {
        element = document_.evaluate(xpath, document_, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      } else {
        element = document_.querySelector(selector);
      }
      // No element found, don't bother continuing. We don't want to put any unnecessary errors into details at this point as the rule was valid if it got to this point
      if (!element) {
        return;
      }
      let url = element[property[0]];
      for (let i = 1; i < property.length; i++) {
        url = url[property[i]];
      }
      // If no URL was found using the specified property, try using hard-coded properties that are known to contain URLs
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
        console.log("checkRule() - property isn't href! attempting to deal with a potential relative URL, url=" + url + ", property=" + property);
        try {
          url = new URL(url, document.baseURI).href;
        } catch(e) {
          console.log("nextPrev() - Exception caught trying to get the absolute URL from the potential relative URL:" + e)
          details.error = e.message;
        }
      }
      if (decodeURIEnabled) {
        try {
          url = decodeURIComponent(url);
        } catch(e) {
          console.log("checkRule() - Exception caught decoding URL:" + e);
          details.error = e.message;
        }
      }
      // Fix the Link before testing if it's valid
      url = Util.fixURL(url);
      if (Util.isValidURL(url, "next-prev", details)) {
        // TODO: i18n This whole object, especially defaultProperty
        urls.rule = { "url": url, "method": type, "rule": (type === "xpath" ? xpath : selector) + "." + property.join(".") + (defaultProperty ? " (Using the Default Property)" : ""), "element": element };
      }
    } catch(e) {
      console.log("checkRule() - Exception caught when querying for selector or evaluating xpath: " + e);
      details.error = e.message;
    }
  }

  /**
   * Checks the keywords against all elements with a URL (i.e. href).
   * Checks that the URL is valid and then checks the element's parent and the element itself if the keyword matches.
   *
   * @param urls             the urls object that stores all the links found when parsing this document
   * @param keywords         the next or prev keywords list to use
   * @param decodeURIEnabled whether to decode the URI or not
   * @param document_        the current document on the page to query
   * @param details          the details object that stores details about this action, such as error messages that were caught
   * @private
   */
  function checkKeywords(urls, keywords, decodeURIEnabled, document_, details) {
    // TODO: Just check [href] regardless of element tag names?
    const elements = document_.querySelectorAll("link[href], a[href], area[href], form[action], button[formaction]");
    for (const element of elements) {
      try {
        // Try to obtain the URL from the element by looking at what type of element it is and checking for properties that typically store URLs
        const elementName = element.nodeName.toLowerCase();
        let url = element.href ? element.href : elementName === "form" && element.action ? element.action : element.tagName === "button" && element.formAction ? element.formAction : "";
        if (decodeURIEnabled) {
          try {
            url = decodeURIComponent(url);
          } catch(e) {
            console.log("checkKeywords() - exception caught:" + e);
            details.error = e.message;
          }
        }
        // Fix the Link before testing if it's valid
        url = Util.fixURL(url);
        // Make sure we check if this URL has a valid extension when we're checking keywords!
        if (Util.isValidURL(url, "next-prev", details) && Util.isValidExtension(url, "next-prev", details)) {
          // Check the actual element first
          checkElement(urls, keywords, url, elementName, element, "self");
          // Check the parent element. Sometimes the anchor is wrapped inside another element (like a li) with the keyword
          const parent = element.parentNode;
          if (parent && parent.nodeName) {
            // Don't check super-root parents like html, head, and body
            const parentName = parent.nodeName.toLowerCase();
            if (parentName !== "html" && parentName !== "head" && parentName !== "body") {
              checkElement(urls, keywords, url, elementName, parent, "parent");
            }
          }
          // Check the children (i.e. the element's innerHTML) except for forms (they're much too big and have too many children!)
          // TODO: Use childNodes instead of children? children only looks at elements, whereas childNodes includes text nodes
          const children = element.children;
          if (children && children.length > 0 && elementName !== "form") {
            checkChildElements(urls, keywords, url, elementName, children, 1);
          }
          // TODO: Check element.nextSibling? May be TOO aggressive and error-prone
        }
      } catch (e) {
        console.log("buildURLs() - exception caught:" + e);
        details.error = e.message;
      }
    }
  }

  /**
   * Checks if this element matches any of the keywords. This checks the element in multiple ways: attribute and
   * innerText.
   *
   * @param urls        the urls object that stores all the links found when parsing this document
   * @param keywords    the next or prev keywords list to use
   * @param url         the URL of the link
   * @param elementName the element's name
   * @param children    the element
   * @param level       the children level, e.g. first-level children, second-level children, ... up to a hard-coded max
   * @private
   */
  function checkChildElements(urls, keywords, url, elementName, children, level) {
    // console.log("checkChildElements() - elementName=" + elementName + " children.length=" + (children ? children.length : "undefined")  + ", level=" + level);
    for (const child of children) {
      checkElement(urls, keywords, url, elementName, child, "child");
      // Recursively check only 10 levels down
      if (child && child.children && child.children.length > 0 && level < 10) {
        checkChildElements(urls, keywords, url, elementName, child.children, level + 1);
      }
    }
  }

  /**
   * Checks if this element matches any of the keywords. This checks the element in multiple ways, including its
   * attribute, innerText, innerHTML.
   *
   * @param urls         the urls object that stores all the links found when parsing this document
   * @param keywords     the next or prev keywords list to use
   * @param url          the URL of the link
   * @param elementName  the element's name
   * @param element      the element
   * @param relationship the element's relationship (e.g. self is "" or parent is "parent")
   * @private
   */
  function checkElement(urls, keywords, url, elementName, element, relationship) {
    if (element) {
      for (const attribute of element.attributes) {
        if (attribute && attribute.nodeValue && attribute.nodeName) {
          parseText(urls, keywords, "attribute", url, attribute.nodeValue.replace(/\s/g, "").toLowerCase(), elementName, element, attribute.nodeName.toLowerCase(), relationship);
        }
      }
      if (element.innerText) {
        parseText(urls, keywords, "innerText", url, element.innerText.replace(/\s/g, "").toLowerCase(), elementName, element, undefined, relationship);
      }
      // TODO: Also check other properties like background-image using window.getComputedStyle()? However, we can't use getComputedStyle() unless the element is already in the DOM...
      // parseText(urls, keywords, "backgroundImage", url, element.ownerDocument.defaultView.getComputedStyle(element).backgroundImage.replace(/\s/g, "").toLowerCase(), elementName, element, undefined, relationship);
    }
  }

  /**
   * Parses an element's text for keywords that might indicate a next or prev link.
   * Adds the link to the urls map if a match is found.
   *
   * @param urls         the urls object that stores all the links found when parsing this document
   * @param keywords     the next or prev keywords list to use
   * @param type         the type of element text value to parse: attribute, innerText, or innerHTML
   * @param url          the URL of the link
   * @param text         the element's attribute value, innerText, or innerHTML to parse keywords from
   * @param elementName  the element's name
   * @param element      the element
   * @param attribute    (optional) the element attribute's node name if it's needed
   * @param relationship the element's relationship (e.g. self is "" or parent is "parent")
   * @private
   */
  function parseText(urls, keywords, type, url, text, elementName, element, attribute, relationship) {
    const value = { url: url, element: element, elementName: elementName, attribute: attribute, relationship: relationship };
    for (const keyword of keywords) {
      // Don't bother optimizing this by first checking includes. equals/startsWith/endsWith will all fail early in implementation.
      if (text === keyword) {
        urls.keywords[relationship][type].equals.set(keyword, value);
      } else if (text.startsWith(keyword)) {
        urls.keywords[relationship][type].startsWith.set(keyword, value);
      } else if (text.endsWith(keyword)) {
        urls.keywords[relationship][type].endsWith.set(keyword, value);
      } else if (text.includes(keyword)) {
        urls.keywords[relationship][type].includes.set(keyword, value);
      }
    }
  }

  /**
   * Traverses the urls object to see if a URL was found. e.g. urls[attributes][equals][next]
   *
   * @param urls         the urls object stores attribute, innerText, and innerHTML links that were found
   * @param relationship the algorithm element relationship to use: self, child, or parent
   * @param type         the algorithm main type to use: attribute, innerText, or innerHTML
   * @param subtypes     the algorithm subtypes to use: equals, startsWith, endsWith, includes
   * @param keywords     the ordered list of keywords sorted in priority
   * @param debugEnabled if debug mode is enabled (to highlight the next/prev DOM element)
   * @returns {*} the next or prev url (if found) along with the subtype and keyword that was used to find it
   * @private
   */
  function traverseURLs(urls, relationship, type, subtypes, keywords, debugEnabled) {
    for (const keyword of keywords) {
      for (const subtype of subtypes) {
        if (urls.keywords[relationship][type][subtype].has(keyword)) {
          const value = urls.keywords[relationship][type][subtype].get(keyword);
          console.log("traverseResults() - a next/prev link was found:" + relationship + " - " +  type + " - " + subtype + " - " + keyword + " - " + value.elementName + " - " + value.attribute + " - " + value.url);
          highlightElement(value.element, debugEnabled);
          return { url: value.url, method: "keyword", relationship: relationship, type: type, subtype: subtype, keyword: keyword, element: value.elementName, attribute: value.attribute };
        }
      }
    }
  }

  /**
   * Highlights the next or prev element on the document page (if debug mode is enabled).
   *
   * @param element      the DOM element to highlight
   * @param debugEnabled if debug mode is enabled (to highlight the next/prev DOM element)
   * @private
   */
  function highlightElement(element, debugEnabled) {
    if (debugEnabled) {
      try {
        element.style.outline = "3px solid black";
        element.style.backgroundColor = "#FDFF47";
        setTimeout(function () {
          element.style.outline = "";
          element.style.backgroundColor = "";
        }, 5000);
      } catch(e) {
        console.log("highlightElement() - exception caught, error=" + e);
      }
    }
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    getURLs,
    findNextPrevURL
  };

})();