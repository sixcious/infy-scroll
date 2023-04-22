/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * V (short for Variable) stores all variables and constants that are used and shared between the individual content scripts.
 */
class V {

  /**
   * Fields
   *
   * @param {string} EVENT_ON - the custom event name for when Infy Scroll turns itself on
   * @param {string} EVENT_PAGE_APPENDED - the custom event name for when a page is appended
   * @param {string} EVENT_NODE_APPENDED - the custom event name for when a node is appended
   * @param {string} EVENT_AJAX - the custom event name for when interacting with the injected ajax script in AJAX Native mode
   * @param {string} PREFIX_ID - the id prefix for the ids (for convenience)
   * @param {string} PAGE_ID - the id of each appended page
   * @param {string} DIVIDER_ID - the id of each appended divider
   * @param {string} AJAX_IFRAME_ID - the id of the AJAX Iframe
   * @param {string} BOTTOM_ID - the id of the Bottom Observer's entry/target (the bottom div)
   * @param {string} LOADING_ID - the id of the loading div
   * @param {string} OVERLAY_ID - the id of the overlay div
   * @param {string} MESSAGE_ID - the id of the message div
   * @param {string} DIVIDER_INFINITY_ICON_CLASS - the class name of the divider's infinity icon (in order to stop it from animating when the page has loaded)
   * @param {string} DIVIDER_CLASS - the class name to set the divider with
   * @param {string} PAGE_STYLE - the css that is used for the Page append mode
   * @param {string} IFRAME_STYLE - the css that is used for the Iframe append mode
   * @param {string} MEDIA_STYLE - the css that is used for the Media append mode
   * @param {string} IFRAME_FIXED_STYLE - the css that is used for iframes that need to remain fixed on the screen (Element Iframe Import and AJAX)
   * @param {Object} instance - the instance object that contains all the properties for this page (such as the URL, action, and append mode)
   * @param {Object} items - the storage items cache containing the user's settings
   * @param {Object[]} pages - the pages array that contains a reference to each appended page in the DOM
   * @param {Document} currentDocument - the cloned full document for the current (latest) page that is being observed
   * @param {Node} insertionPoint - the insertion point is only used in append element mode and is the point at the bottom of the content to start inserting more elements
   * @param {Element[]} pageElements - the current page's array of page elements (in append element mode)
   * @param {Element} clickElement - the current click element used for the Click Element action
   * @param {HTMLIFrameElement} iframe - the current iframe that was appended for the current page
   * @param {Map<String, Element>} lazys - the lazy image/media elements that we obtain in fixLazyLoadingPre() and that we then need to later handle in fixLazyLoadingPost() after they are appended
   * @param {Element} bottom - the bottom element to track in Intersection Observer mode
   * @param {number} offset - the offset is only used in Scroll Listener mode and is the number of pixels from the bottom of the content (e.g. the pageElements or clickElementPosition) to the very bottom of the HTML document
   * @param {Element} loading - the loading element that is appended while a new page is being loaded
   * @param {Element} divider - the last page divider element that was appended; we store this in order to not have to re-calculate the colSpan again for future dividers in Append Element mode (tables)
   * @param {Element} overlay - (optional) the overlay element that is fixed onto the page, showing the current page number and total pages
   * @param {Object} timeouts - the reusable timeouts object that stores all named timeouts used on this page
   * @param {Object} checks - the object that keeps track of whether a specific task was completed (e.g. injecting the ajax script)
   * @param {function} scrollListener - the scroll listener callback function that fires every time the user scrolls. It calls the reusable scrollDetection function. Note this is written as a variable instead of a function due to the tricky way event listeners work
   * @param {IntersectionObserver} intersectionObserver - the intersection observer that observes pages in Intersection Observer mode (not the callback function)
   * @param {IntersectionObserver} bottomObserver - the intersection observer that observes the bottom element and determines if another page should be appended in Intersection Observer mode
   * @param {MutationObserver} ajaxObserver - the mutation observer that remove elements in the AJAX Native append mode
   * @param {MutationObserver} spaObserver - the mutation observer that checks for late action/deactivation for SPAs
   */
  // Note that the *only* reason why we use the same event names as AP is strictly for backwards compatibility with older scripts
  static EVENT_ON = "GM_AutoPagerizeLoaded";
  static EVENT_PAGE_APPENDED = "GM_AutoPagerizeNextPageLoaded";
  static EVENT_NODE_APPENDED = "AutoPagerize_DOMNodeInserted";
  static EVENT_AJAX = "InfyScrollAJAX";
  static PREFIX_ID = "infy-scroll-"
  static PAGE_ID = V.PREFIX_ID + "page-";
  static DIVIDER_ID = V.PREFIX_ID + "divider-";
  static AJAX_IFRAME_ID = V.PREFIX_ID + "ajax-iframe";
  static BOTTOM_ID = V.PREFIX_ID + "bottom";
  static LOADING_ID = V.PREFIX_ID + "loading";
  static OVERLAY_ID = V.PREFIX_ID + "overlay";
  static MESSAGE_ID = V.PREFIX_ID + "message";
  static DIVIDER_INFINITY_ICON_CLASS = V.DIVIDER_ID + "infinity-icon";
  // Fixes #22 https://github.com/sixcious/infy-scroll/issues/22 - Some external extensions (e.g. Ublacklist) require us to add this specific AP class name in order to recognize DOM mutations whenever Infy appends another page on Google Search
  static DIVIDER_CLASS = "autopagerize_page_info";
  // Note: Do not set min-height: 0, this causes issues, always initial (auto) or leave it out
  // TODO: Decide on how to set z-index for these three styles. They are position: static (initial) and have z-index: auto. We need the overlay, 2 loading, and message to have the z-index be higher than these so we can't use z-index: 2147483647. Is it better to NOT have a z-index applied to them?
  // TODO: Make PAGE_STYLE, IFRAME_STYLE, and such non constants so we can call processStyle on them in Scroll.init() once?
  static PAGE_STYLE =   "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; display: block; float: none; height: auto; margin: 0 0 2rem 0; max-height: none; max-width: none; min-height: auto; min-width: auto; opacity: 1; outline: 0;                   padding: 0; position: static; visibility: visible; width: auto; z-index: auto;";
  static IFRAME_STYLE = "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; display: block; float: none; height: 0;    margin: 0 0 2rem 0; max-height: none; max-width: none; min-height: auto; min-width: auto; opacity: 1; outline: 0; overflow: hidden; padding: 0; position: static; visibility: visible; width: 100%; z-index: auto;";
  static MEDIA_STYLE =  "background: initial; border: 0; border-radius: 0; box-shadow: none; clear: both; display: flex;  float: none; height: auto; margin: 2rem auto;  max-height: none; max-width: none; min-height: auto; min-width: auto; opacity: 1; outline: 0;                   padding: 0; position: static; visibility: visible; width: auto; z-index: auto;";
  static IFRAME_FIXED_STYLE = " position: fixed; bottom: 0; left: 0; visibility: hidden; height: 500px;"
  // We should initialize the instance to an empty object to avoid potential NPEs because we sometimes use it as a default value for some method arguments e.g. (x = instance.x, ...)
  static instance = {};
  static items = {};
  static pages = [];
  static currentDocument = document;
  static insertionPoint;
  static pageElements;
  static clickElement;
  static iframe;
  static lazys;
  static bottom;
  static offset = 0;
  static loading;
  static divider;
  static overlay;
  static timeouts = {};
  static checks = {};
  static scrollListener;
  static intersectionObserver;
  static bottomObserver;
  static ajaxObserver;
  static spaObserver;

}