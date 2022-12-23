/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Instance handles all instance-specific logic, such as building the initial instance for the Scroll content script.
 *
 * An "instance" is simply an object that contains the properties needed for a specific tab. Each tab in the browser
 * has its own instance object.
 */
const Instance = (() => {

  /**
   * Builds an instance with initial values (from either an existing save, database, or via default storage items).
   *
   * @param tab   the tab properties (id, url) to set this instance with
   * @param items the storage items
   * @param checks (optional) the current number of times this method has been called to check for a saved or database URL
   * @returns instance the newly built instance
   * @public
   */
  async function buildInstance(tab, items, checks) {
    console.log("buildInstance() - checks=" + checks);
    // Multiple checks, up to 5 seconds after document.idle
    const CHECK_VALUES = [0,1000,2000,2000];
    // Assume we'll be using the storage items as the source for building the instance
    let source = items;
    // Note: source.via will either be "items", "save", or "database". First assume we will be using the storage items
    source.via = "items";
    source.tabURL = tab.url;
    // SPA variable to store whether a save or database is an SPA
    let spa = undefined;
    // Check Saves
    if (items.saves && Array.isArray(items.saves) && items.saves.length > 0) {
      const check = checkSaves(tab, items, source, checks === CHECK_VALUES.length);
      source = check.source;
      items = check.items;
      spa = check.spa;
      console.log("buildInstance() - after checking saves, spa=" + spa);
    }
    // Check DatabaseIS (Only if source.via is still items)
    if (source.via === "items" && items.databaseIS && Array.isArray(items.databaseIS) && items.databaseIS.length > 0) {
      const check = checkDatabaseIS(tab, items, source, checks === CHECK_VALUES.length);
      source = check.source;
      items = check.items;
      spa = spa || check.spa;
      console.log("buildInstance() - after checking databaseIS, spa=" + spa);
    }
    // Check DatabaseAP (Only if source.via is still items)
    if (!checks && source.via === "items" && items.databaseAP && Array.isArray(items.databaseAP) && items.databaseAP.length > 0) {
      const check = checkDatabaseAP(tab, items, source, checks === CHECK_VALUES.length);
      source = check.source;
      items = check.items;
      spa = spa || check.spa;
      console.log("buildInstance() - after checking databaseAP, spa=" + spa);
    }
    // If still haven't found a Save or Database source, retry... (only if checks argument is present)
    if (source.via === "items" && typeof checks === "number" && checks >= 1 && checks < CHECK_VALUES.length) {
      console.log("buildInstance() - no Saved URL or Database URL found, retrying after " + CHECK_VALUES[checks] + "ms ...");
      await Promisify.sleep(CHECK_VALUES[checks]);
      return buildInstance(tab, items, checks + 1);
    }
    // Prepopulate the selection to increment/decrement
    // Note: Saved URL Exact will already have the selection set and Database Found will already have the next object for nextLinkKeywordsEnabled
    // TODO: For better efficiency, we should look at moving this to when we have to activate an instance so that we don't do it on every page load
    source.selection = source.selection || Increment.findSelection(tab.url, source.selectionStrategy, source.selectionCustom);
    const instance = createInstance(tab, items, source, spa);
    // Store the items in the instance temporarily for callers that need them
    instance.items = items;
    return instance;
  }

  /**
   * Translates a source (such as a Save) to an instance, or vice-versa.
   *
   * @param source the source, e.g. save object
   * @param direction either "source>instance" (e.g. when checking a save) or "instance>source" (e.g. when saving an instance)
   * @public
   */
  function translateInstance(source, direction="source>instance") {
    // Step 1: Determine the action and append (these are optional in Database items)
    if (!source.action) {
      let action;
      if      (source.nextLink) { action = "next"; }
      else if (source.prevLink) { action = "prev"; }
      else if (source.interval) { action = "increment"; }
      else if (source.list)     { action = "list"; }
      else                      { action = "button"; }
      source.action = action;
    }
    if (!source.append) {
      let append;
      if      (source.mediaType)                                  { append = "media"; }
      else if (source.pageElement && source.action === "button")  { append = "ajax"; }
      else if (!source.pageElement && source.action === "button") { append = "none"; }
      else if (source.pageElement)                                { append = "element"; }
      // This key is optional, so iframe should have an append defined in most cases
      else if (typeof source.iframePageOne !== "undefined")       { append = "iframe"; }
      else                                                        { append = "page"; }
      source.append = append;
    }
    // Step 2: Convert Strings to Objects (only applies to Database JSON sources, in which every value is a string, including numbers, e.g. "1" not 1)
    try {
      // TODO: "base" might be problematic because we also store strings sometimes for the base type
      const numbers = ["interval", "errorSkip", "selectionStart", "selectionEnd"];
      for (const number of numbers) {
        if (typeof source[number] === "string") {
          source[number] = Number(source[number]);
        }
      }
      // const booleans = [""];
      // for (const boolean of booleans) {
      //   if (typeof source[boolean] === "string") {
      //     source[boolean] = source[boolean] === "true";
      //   }
      // }
    } catch (e) {
      console.log("translateInstance() - Error converting strings to objects:")
      console.log(e);
    }
    // Step 3: Translate the source keys to instance keys or vice versa
    const translations = new Map([
      ["button", "buttonPath"],
      ["nextLink", "nextLinkPath"],
      ["prevLink", "prevLinkPath"],
      ["pageElement", "pageElementPath"],
      ["insertBefore", "insertBeforePath"],
      ["removeElement", "removeElementPath"],
      ["disableScrollElement", "disableScrollElementPath"],
      ["disableRemoveElement", "disableRemoveElementPath"]
    ]);
    if (direction === "source>instance") {
      for (const [key, value] of translations) {
        if (source[key]) {
          source[value] = source[key];
          delete source[key];
        }
      }
    } else {
      for (const [key, value] of translations) {
        if (source[value]) {
          source[key] = source[value];
          delete source[value];
        }
      }
    }
  }

  /**
   * Creates the instance object using the tab, items, and source.
   *
   * @param tab    the tab properties (id, url)
   * @param items  the storage items
   * @param source the source object we are building the instance from
   * @param spa    the spa domain if this is a Save or Database URL SPA that needs to be watched
   * @returns {*} the newly built instance
   * @private
   */
  function createInstance(tab, items, source, spa) {
    // Return the newly built instance using tab, items, and source (scrollEnabled for Infy-specific logic in shared JS)
    const _ = {};
    _.enabled = items.on && !!(source.saveActivate || source.databaseActivate);
    _.previouslyEnabled = _.enabled;
    _.scrollEnabled = true;
    _.autoEnabled = false;
    _.multiEnabled = false;
    _.listEnabled = source.saveFound && source.action === "list";
    // // DecodeURIEnabled Deprecation - Part 4
    // _.decodeURIEnabled = !!source.decodeURIEnabled;
    _.debugEnabled = items.debugEnabled;
    _.via = source.via;
    _.tabId = tab.id;
    _.tabURL = tab.url;
    _.url = tab.url;
    _.saveFound = !!source.saveFound;
    _.saveType = source.saveType || "pattern";
    _.saveURL = source.saveURL || tab.url;
    _.saveID = source.saveID;
    _.saveTitle = source.saveTitle ? source.saveTitle : document && document.title ? document.title : "";
    _.databaseFound = !!source.databaseFound;
    _.databaseAPFound = !!source.databaseAPFound;
    _.databaseISFound = !!source.databaseISFound;
    _.databaseActivate = !!source.databaseActivate;
    _.databaseURL = source.databaseURL;
    _.databaseResourceURL = source.databaseResourceURL;
    _.databaseBlacklisted = !!source.databaseBlacklisted;
    _.databaseWhitelisted = !!source.databaseWhitelisted;
    _.databaseBlacklistWhitelistURL = source.databaseBlacklistWhitelistURL;
    _.action = source.action;
    _.append = source.append;
    _.selection = source.selection.selection;
    _.selectionStart = source.selection.selectionStart;
    _.selectionStrategy = source.selectionStrategy || items.selectionStrategy;
    _.selectionCustom = source.selectionCustom;
    _.leadingZeros = source.via !== "items" && source.saveType === "exact" ? !!source.leadingZeros : items.leadingZerosPadByDetection && source.selection.selection.charAt(0) === '0' && source.selection.selection.length > 1;
    _.interval = source.interval || items.interval;
    _.base = source.base || items.base;
    _.baseCase = source.baseCase || items.baseCase;
    _.baseRoman = source.baseRoman || items.baseRoman;
    _.baseDateFormat = source.baseDateFormat || items.baseDateFormat;
    _.baseCustom = source.baseCustom || items.baseCustom;
    _.errorSkip = typeof source.errorSkip === "number" ? source.errorSkip : items.errorSkip;
    _.errorCodes = source.errorCodes || items.errorCodes;
    _.errorCodesCustom = source.errorCodesCustom || items.errorCodesCustom;
    _.multi = {"1": {}, "2": {}, "3": {}};
    _.multiCount = 0;
    _.shuffleEnabled = source.via !== "items" && typeof source.shuffleURLs === "number" && source.shuffleURLs > 0;
    _.shuffleURLs = source.shuffleURLs || items.shuffleURLs;
    _.urls = [];
    _.nextLinkType = source.nextLinkType || items.preferredPathType;
    _.nextLinkPath = source.nextLinkPath || items.nextLinkPath;
    // _.nextLinkType = source.nextLinkType || items.nextLinkType;
    // _.nextLinkPath = source.nextLinkPath || (items.nextLinkType === "selector" ? items.nextLinkSelector : items.nextXpath);
    _.nextLinkProperty = source.nextLinkProperty || items.nextLinkProperty;
    _.nextLinkKeywordsEnabled = source.via !== "items" ? !!source.nextLinkKeywordsEnabled : undefined;
    _.nextLinkKeywords = items.nextLinkKeywords;
    _.nextLinkKeyword = source.nextLinkKeyword;
    _.prevLinkType = source.prevLinkType || items.preferredPathType;
    _.prevLinkPath = source.prevLinkPath || items.prevLinkPath;
    // _.prevLinkType = source.prevLinkType || items.prevLinkType;
    // _.prevLinkPath = source.prevLinkPath || (items.prevLinkType === "selector" ? items.prevSelector : items.prevXpath);
    _.prevLinkProperty = source.prevLinkProperty || items.prevLinkProperty;
    _.prevLinkKeywordsEnabled = source.via !== "items" ? !!source.prevLinkKeywordsEnabled : undefined;
    _.prevLinkKeywords = items.prevLinkKeywords;
    _.prevLinkKeyword = source.prevLinkKeyword;
    _.buttonType = source.buttonType || items.preferredPathType;
    _.buttonPath = source.buttonPath || "";
    // _.buttonType = source.buttonType || items.buttonType;
    // _.buttonDetection = source.buttonDetection || items.buttonDetection;
    // _.buttonPosition = source.buttonPosition || items.buttonPosition;
    _.buttonDetection = typeof source.buttonPosition !== "undefined" && source.via !== "items" ? "manual" : "auto";
    _.buttonPosition = source.via !== "items" ? source.buttonPosition : undefined;
    _.list = source.list || [];
    // _.listOptions = source.listOptions || false;
    _.iframePageOne = source.iframePageOne || false;
    _.mediaType = source.mediaType || items.mediaType;
    _.pageElementPath = source.pageElementPath || "";
    _.pageElementType = source.pageElementType || items.preferredPathType;
    _.pageElementIframe = source.pageElementIframe;
    _.pageElementIframeWait = source.pageElementIframeWait || 0;
    _.insertBeforePath = source.insertBeforePath || "";
    _.removeElementPath = source.removeElementPath || "";
    _.removeElementDelay = source.removeElementDelay || 0;
    _.disableScrollElementPath = source.disableScrollElementPath || "";
    _.disableScrollFunctions = source.disableScrollFunctions || "";
    _.disableRemoveElementPath = source.disableRemoveElementPath || "";
    _.disableRemoveFunctions = source.disableRemoveFunctions || "";
    _.autoTimes = items.autoTimes;
    _.autoTimesOriginal = items.autoTimes;
    _.autoSeconds = items.autoSeconds;
    _.autoSlideshow = items.autoSlideshow;
    _.autoBehavior = items.autoBehavior;
    _.autoBadge = items.autoBadge;
    _.autoPaused = false;
    _.autoRepeating = false;
    _.autoRepeatCount = 0;
    _.scrollAppendThresholdPages = items.scrollAppendThresholdPages;
    // We will make the threshold pixels be 100 for button for ajax mode in case some content hasn't loaded before the button has been clicked
    _.scrollAppendThresholdPixels = source.action === "button" ? 100 : items.scrollAppendThresholdPixels;
    // _.scrollAppendScripts = source.scrollAppendScripts || false;
    // _.scrollAppendStyles = source.scrollAppendStyles || false;
    // We always set lazyLoad to what the items default option is except for saves
    _.lazyLoad = source.via === "save" ? source.lazyLoad : items.lazyLoad;
    _.lazyLoadSource = source.lazyLoadSource || "data-src";
    _.lazyLoadDestination = source.lazyLoadDestination || "src";
    _.spa = spa;
    _.scrollbarExists = false;
    _.scrollbarAppends = 0;
    // TODO: Should we remove these from the instance? I think the idea was that we would eventually allow for the instance to store these for instance-specific options
    _.scrollDivider = items.scrollDivider;
    _.scrollDividerGrid = 0;
    _.scrollDividerGridParentModified = false;
    _.scrollUpdateAddress = items.scrollUpdateAddress;
    _.scrollUpdateTitle = items.scrollUpdateTitle;
    _.scrollBehavior = items.scrollBehavior;
    _.scrollPrepareFirstPageAttempts = 0;
    // Determine if this URL is local by using the window protocol or tab url
    _.isLocal = typeof window === "object" && window.location && window.location.protocol ? window.location.protocol.startsWith("file:") : tab.url && tab.url.startsWith("file://");
    // We need the locationOrigin for the Popup's List mode to show the domain/origin and for the SPA setting. The origin has the protocol and hostname
    _.locationOrigin = typeof window === "object" && window.location && window.location.origin ? window.location.origin : "";
    _.documentContentType = typeof document === "object" && document.contentType ? document.contentType : "text/html";
    _.documentCharacterSet = typeof document === "object" && document.characterSet ? document.characterSet : "UTF-8";
    _.currentPage = 1;
    _.totalPages = 1;
    _.isLoading = true;
    _.started = false;
    _.useXHR = false;
    _.viewedFoundSnackbar = false;
    _.picker = "";
    _.pickerEnabled = false;
    // If action is list or shuffle is enabled, precalculate the URLs array for the _
    if (_.action === "list" || (_.shuffleURLs && (_.action === "increment" || _.action === "decrement"))) {
      const precalculateProps = IncrementArray.precalculateURLs(_);
      _.urls = precalculateProps.urls;
      _.urlsCurrentIndex = _.startingURLsCurrentIndex = precalculateProps.currentIndex;
    }
    // Check to see if a custom script exists for this URL and set the instance's script value with the index in the Scripts array
    try {
      if (items.customScriptsEnabled) {
        for (let i = 0; i < Scripts.length; i++) {
          // const scriptURL = Scripts[i].eurl ? new TextDecoder().decode(Scripts[i].eurl) : Scripts[i].url;
          const scriptURL = Scripts[i].url;
          console.log("createInstance() - checking scriptURL=" + scriptURL);
          if (new RegExp(scriptURL).test(tab.url)) {
            console.log("createInstance() - attaching a custom script to the instance, i=" + i + ", script url=" + scriptURL);
            _.script = i;
            break;
          }
          console.log("createInstance() - done checking scriptURL=" + scriptURL);
        }
      }
    } catch (e) {
      console.log("createInstance() - error checking scripts. Error:");
      console.log(e);
    }
    // Note: While some cryptography functions aren't available on non-https websites, we can use the ones needed to generate random numbers and strings
    try {
      _.randomNumber = Cryptography.randomNumber();
      _.randomString = Cryptography.randomString();
    } catch (e) {
      console.log("createInstance() - error generating random number and string. Error:");
      console.log(e);
    }
    // We need to check Bing Search specifically because it doesn't like us using a li divider in its ol parent (we check this later in Scroll.appendDivider())
    try {
      _.isBingSearchURL = new RegExp(String.raw`^https?://(?:www|cnweb)4?\.bing\.com/(?:[^/]+/)*?(?:results\.aspx|search)`).test(tab.url);
    } catch (e) {
      console.log("createInstance() - error checking isBingSearchURL. Error:");
      console.log(e);
    }
    return _;
  }

  /**
   * Checks if a saved URL matches this tab's URL.
   *
   * @param tab    the tab properties (id, url)
   * @param items  the storage items
   * @param source the source object we are building the instance from
   * @param disregardActivate true if this should disregard the action and append activation checks aside from URL (only true on the last check)
   * @returns {*} the modified source with save properties if it matched this URL or the original source
   * @private
   */
  function checkSaves(tab, items, source, disregardActivate) {
    console.log("checkSaves()");
    let spa = undefined;
    for (let i = 0; i < items.saves.length; i++) {
      const save = items.saves[i];
      // Check SPA now before the break in for loop if activate passes
      // Note: isSpa gets reset to false on each iteration for each save whereas spa saves the last actual spa URL for all saves checked (needed for the popup in case the user tries to re-save the URL to keep their spa URL)
      let isSpa = false;
      if (save.spa && (save.spa === window.location.origin || new RegExp(save.spa).test(window.location.origin))) {
        spa = save.spa;
        isSpa = true;
      }
      const result = Saves.matchesSave(tab.url, save);
      if (result && result.matches) {
        console.log("checkSaves() - save matches this tab's URL, checking for activation... save=");
        console.log(save);
        // Translate the save to the instance keys before checking for activation
        translateInstance(save);
        // Note: When checking for whether we "found" a save, unlike database URLs, we don't test that it also activates in order to allow the user to edit the properties in the Popup in case they're outdated
        const activate = checkActivate(tab, items, save);
        if (activate || disregardActivate) {
          console.log("checkSaves() - save activation passed for this tab's URL, disregardActivate=" + disregardActivate + ", save=");
          console.log(save);
          source = save;
          source.via = "save";
          source.saveURL = save.url;
          source.saveType = save.type || "regex";
          source.saveID = save.id;
          source.saveTitle = save.title;
          source.saveActivate = activate;
          source.saveFound = true;
          // Use Save's selection if this is an exact URL save; otherwise calculate the selection as normal later
          if (save.type === "exact" && result.selection) {
            source.selection = result.selection;
          }
          //   if (save.type === "exact") {
          //     source.selection = Saves.matchesSave(tab.url, save).selection || source.selection;
          //   }
          break;
        }
      } else if (!isSpa) {
        // Do not remove the save if it's a SPA and it matches this tab's domain
        items.saves[i] = undefined;
      }
    }
    // Filter out the undefined values from the array for the next time we check it
    items.saves = items.saves.filter((data) => {
      return data !== undefined;
    });
    return { source: source, items: items, spa: spa };
  }

  /**
   * Checks if a databaseIS URL matches this tab's URL.
   *
   * @param tab    the tab properties (id, url)
   * @param items  the storage items
   * @param source the source object we are building the instance from
   * @param disregardActivate true if this should disregard the action and append activation checks aside from URL (only true on the last check)
   * @returns {*} the modified source with databaseIS properties if it matched this URL or the original source
   * @private
   */
  function checkDatabaseIS(tab, items, source, disregardActivate) {
    console.log("checkDatabaseIS()");
    let spa = undefined;
    for (let i = 0; i < items.databaseIS.length; i++) {
      const is = items.databaseIS[i];
      // Check SPA now before the break in for loop if activate passes
      // Note: isSpa gets reset to false on each iteration for each save whereas spa saves the last actual spa URL for all saves checked (needed for the popup in case the user tries to re-save the URL to keep their spa URL)
      let isSpa = false;
      if (is.spa && (is.spa === window.location.origin || new RegExp(is.spa).test(window.location.origin))) {
        spa = is.spa;
        isSpa = true;
      }
      const result = Saves.matchesSave(tab.url, is);
      if (result && result.matches) {
        console.log("checkDatabaseIS() - item matches this tab's URL, checking for activation... item=");
        console.log(is);
        // Translate the database to the instance keys before checking for activation
        translateInstance(is);
        const activate = checkActivate(tab, items, is);
        if (activate || disregardActivate) {
          console.log("checkDatabaseIS() - item activation passed for this tab's URL, item=");
          console.log(is);
          source = is;
          source.via = "database";
          source.saveURL = is.url;
          source.saveType = is.type || "regex";
          const databaseActivate = checkDatabaseActivate(tab, items, is.url);
          source.databaseActivate = databaseActivate.databaseActivate;
          source.databaseBlacklisted = databaseActivate.databaseBlacklisted;
          source.databaseWhitelisted = databaseActivate.databaseWhitelisted;
          source.databaseBlacklistWhitelistURL = databaseActivate.databaseBlacklistWhitelistURL;
          source.databaseURL = is.url;
          source.databaseResourceURL = is.resource_url;
          source.databaseFound = true;
          source.databaseISFound = true;
          // Use Save's selection if this is an exact URL save; otherwise calculate the selection as normal later
          if (is.type === "exact" && result.selection) {
            source.selection = result.selection;
          }
          // if (is.type === "exact") {
          //   source.selection = Saves.matchesSave(tab.url, is).selection || source.selection;
          // }
          break;
        }
      } else if (!isSpa) {
        // Do not remove the database entry if it's a SPA and it matches this tab's domain
        items.databaseIS[i] = undefined;
      }
    }
    // Filter out the undefined values from the array for the next time we check it
    items.databaseIS = items.databaseIS.filter((data) => {
      return data !== undefined;
    });
    return { source: source, items: items, spa: spa };
  }

  /**
   * Checks if a databaseAP URL matches this tab's URL.
   *
   * @param tab      the tab properties (id, url)
   * @param items    the storage items
   * @param source   the source object we are building the instance from
   * @param disregardActivate true if this should disregard the action and append activation checks aside from URL (only true on the last check)
   * @returns {*} the modified source with database properties if it matched this URL or the original source
   * @private
   */
  function checkDatabaseAP(tab, items, source, disregardActivate) {
    console.log("checkDatabaseAP()");
    let spa = undefined;
    // TODO: If a database record was found, store the nextURL and elements at this point so we don't have to re-calculate them again for page 1 in Scroll.prepareFirstPage()
    // for (let d of database) {
    for (let i = 0; i < items.databaseAP.length; i++) {
      const ap = items.databaseAP[i];
      // Check SPA now before the break in for loop if activate passes
      // Note: isSpa gets reset to false on each iteration for each save whereas spa saves the last actual spa URL for all saves checked (needed for the popup in case the user tries to re-save the URL to keep their spa URL)
      let isSpa = false;
      if (ap.spa && (ap.spa === window.location.origin || new RegExp(ap.spa).test(window.location.origin))) {
        spa = ap.spa;
        isSpa = true;
      }
      try {
        // Requirement 1: Check if this database record matches this url
        const urlResult = new RegExp(ap.url).test(tab.url);
        if (urlResult) {
          console.log("checkDatabaseAP() - a database record's url matched:=" + ap.url);
          // Disregard activating the nextLink and pageElement requirements if this is the last check to allow the user to see the Database URL (ignore generic URLs whose length is small)
          if (disregardActivate) {
            disregardActivate = ap.url.length > 13;
          }
          // Requirement 2: Check if this database record's action result matches
          const actionResult = !!Next.findLink("xpath", ap.nextLink, ["href"], false, items.nextLinkKeywords, undefined, false, false, document).url;
          if (actionResult || disregardActivate) {
            console.log("checkDatabaseAP() - a database record's action result was true");
            // Requirement 3: Check if this database record's append result matches
            const pageElements = Scroll.getPageElements(document, "xpath", ap.pageElement);
            const appendResult = pageElements && pageElements.length > 0 && pageElements[0] && pageElements[0].parentNode;
            if (appendResult || disregardActivate) {
              console.log("checkDatabaseAP() - a database record's append result was true");
              const check = checkDatabaseActivate(tab, items, ap.url);
              // Convert the AP database item into an instance source (set nextLinkKeywordsEnabled to false to ensure we only use the xpath rule)
              source = {};
              source.action = "next";
              source.append = "element";
              source.nextLinkType = "xpath";
              source.nextLinkPath = ap.nextLink;
              source.nextLinkKeywordsEnabled = false;
              source.pageElementType = "xpath";
              source.pageElementPath = ap.pageElement;
              source.insertBeforePath = ap.insertBefore;
              source.databaseURL = ap.url;
              source.databaseResourceURL = ap.resource_url;
              source.databaseFound = true;
              source.databaseAPFound = true;
              source.via = "database";
              source.databaseActivate = check.databaseActivate;
              if (disregardActivate) {
                source.databaseActivate = false;
              }
              source.databaseBlacklisted = check.databaseBlacklisted;
              source.databaseWhitelisted = check.databaseWhitelisted;
              source.databaseBlacklistWhitelistURL = check.databaseBlacklistWhitelistURL;
              // If this is the generic database URLs https?://... (13 characters or less), don't use them as the Save URL and instead use the tab URL. Also change the default save type to pattern
              if (ap.url && ap.url.length > 13) {
                source.saveURL = ap.url;
                source.saveType = "regex";
              } else {
                // Note: This saveURL gets automatically set when we build the instance below if we didn't set it here
                // source.saveURL = tab.url;
                source.saveType = "pattern";
              }
              break;
            }
          }
        } else if (!isSpa) {
          // Do not remove the item if it's an SPA and it matches this tab's domain
          items.databaseAP[i] = undefined;
        }
      } catch (e) {
        console.log("checkDatabaseAP() - error checking a database record. Error:");
        console.log(e);
      }
    }
    // Filter out the undefined values from the array for the next time we check it
    items.databaseAP = items.databaseAP.filter((data) => {
      return data !== undefined;
    });
    return { source: source, items: items, spa: spa };
  }

  /**
   * Checks if a saved URL or databaseIS URL should activate itself based on its action and append mode settings.
   *
   * @param tab   the tab properties (id, url)
   * @param items the storage items
   * @param save  the source object we are building the instance from
   * @returns {boolean} the modified source with save properties if it matched this URL or the original source
   * @private
   */
  function checkActivate(tab, items, save) {
    // We now need to determine whether we should auto-activate based on the action and append mode
    let activate = false;
    const action = save.action;
    const append = save.append;
    // No Longer doing this commented out logic, we always check to activate the action no matter what
    // We always activate in the following three scenarios:
    // 1. button action due to dynamic content (e.g. the button) that may not have possibly loaded on the page
    // 2. list action as we are currently not validating it in the popup
    // 3. next/prev action with an append of iframe or element-iframe due to dynamic content
    // let activate = false; // action === "button" || action === "list" || ((action === "next" || action === "prev") && (append === "iframe" || (append === "element" && save.pageElementIframe)));
    // If none of the special cases, we need to manually verify this save
    // Note that if a save has a type already set for it, we don't change it
    if (action === "next" || action === "prev") {
      save[action + "LinkType"] = save[action + "LinkType"] || DOMPath.determinePathType(save[action + "LinkPath"], items.preferredPathType).type;
      // Note that we intentionally convert undefined save[action +"KeywordEnabled"] to false to avoid storing them in the save
      // const link = Next.findLink(save[action + "LinkType"], save[action + "LinkPath"], save[action + "LinkProperty"], !!save[action + "LinkKeywordsEnabled"], items[action + "LinkKeywords"], save[action + "LinkKeyword"], true, false, document);
      save[action + "LinkKeywordsEnabled"] = !!save[action + "LinkKeyword"];
      const keyword = typeof save[action + "LinkKeyword"] === "object" ? save[action + "LinkKeyword"] : undefined;
      const link = Next.findLink(save[action + "LinkType"], save[action + "LinkPath"], save[action + "LinkProperty"], save[action + "LinkKeywordsEnabled"], items[action + "LinkKeywords"], keyword, true, false, document);
      activate = link && link.url;
      save[action + "LinkKeyword"] = link.method === "keyword" ? link.keywordObject : undefined;
    } else if (action === "increment" || action === "decrement") {
      // // DecodeURIEnabled Deprecation - Part 2
      // const selection = Increment.findSelection(save.tabURL || tab.url, save.selectionStrategy, save.selectionCustom);
      const selection = Increment.findSelection(tab.url, save.selectionStrategy, save.selectionCustom);
      activate = selection && !!selection.selection;
    } else if (action === "button") {
      save.buttonType = save.buttonType || DOMPath.determinePathType(save.buttonPath, items.preferredPathType).type;
      activate = Button.findButton(save.buttonType, save.buttonPath).details.found;
    } else if (action === "list") {
      activate = true;
    }
    // The only append modes we have to validate is element and ajax. page, iframe, media, and none are all assumed to be true
    if (activate && (append === "element" || append === "ajax")) {
      save.pageElementType = save.pageElementType || DOMPath.determinePathType(save.pageElementPath, items.preferredPathType).type;
      const pageElements = Scroll.getPageElements(document, save.pageElementType, save.pageElementPath);
      activate = pageElements && pageElements.length > 0 && pageElements[0] && pageElements[0].parentNode;
      // if (save.removeElementPath) {
      //   save.removeElementType = save.removeElementType || DOMPath.determinePathType(save.removeElementPath, items.preferredPathType).type;
      // }
    }
    console.log("checkActivate() - activate=" + activate);
    return activate;
  }

  /**
   * Checks to see if the database URL should activate itself based on the blacklist or whitelist.
   *
   * @param tab         the tab
   * @param items       the storage items
   * @param databaseURL the database URL
   * @returns {{databaseActivate: boolean, databaseBlacklisted: boolean, databaseBlacklistWhitelistURL: string, databaseWhitelisted: boolean}}
   * @private
   */
  function checkDatabaseActivate(tab, items, databaseURL) {
    // Important: We always use the domain/origin (using window.location.origin)
    // We only use the database URL using parenthesis if we can't use the domain
    // The domain is going to be what the user probably prefers, especially in the case of generic database URLs
    const _ = {
      databaseActivate: false,
      databaseBlacklisted: false,
      databaseWhitelisted: false,
      // databaseBlacklistWhitelistURL: "(" + databaseURL + ")"
      databaseBlacklistWhitelistURL: window && window.location && window.location.origin ? window.location.origin : "(" + databaseURL + ")"
    };
    // Whitelist Mode: Don't auto-activate on a URL unless Whitelisted
    if (items.databaseMode === "whitelist") {
      _.databaseActivate = false;
      const result = Saves.matchesList(tab.url, databaseURL, items.databaseWhitelist, "Database Whitelist");
      if (result && result.matches) {
        _.databaseActivate = true;
        _.databaseWhitelisted = true;
        _.databaseBlacklistWhitelistURL = result.url;
      }
    }
    // Or Blacklist Mode: Auto-activate on all URLs unless Blacklisted
    else {
      _.databaseActivate = true;
      const result = Saves.matchesList(tab.url, databaseURL, items.databaseBlacklist, "Database Blacklist");
      if (result && result.matches) {
        _.databaseActivate = false;
        _.databaseBlacklisted = true;
        _.databaseBlacklistWhitelistURL = result.url;
      }
    }
    return _;
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    buildInstance,
    translateInstance
  };

})();