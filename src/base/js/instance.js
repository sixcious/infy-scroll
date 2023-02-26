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
   * Builds an instance with initial values from a source (either a save, database, or the default storage items).
   *
   * @param {Object} tab - the tab properties (id, url)
   * @param {Object} items - the storage items
   * @param {number} checks - (optional) the current number of times this method has been called to check for a saved or database URL
   * @returns {Object} the instance
   * @public
   */
  async function buildInstance(tab, items, checks) {
    console.log("buildInstance() - checks=" + checks);
    // Multiple checks, up to 5 seconds after document.idle
    const CHECK_VALUES = [0, 1000, 2000, 2000];
    // Assume we'll be using the storage items as the source for building the instance
    let source = items;
    // Note: source.via will either be "items", "save", or "database". First assume we will be using the storage items
    source.via = "items";
    // source.tabURL = tab.url;
    // SPA variable to store whether a save or database URL is an SPA
    let spa;
    // Check Saves (Test savesEnabled strictly for false to make sure the key actually exists)
    if (items.saves && Array.isArray(items.saves) && items.saves.length > 0 && items.savesEnabled !== false) {
      const check = checkSaves(tab, items, source, checks === CHECK_VALUES.length);
      source = check.source;
      items = check.items;
      spa = check.spa;
      console.log("buildInstance() - after checking saves, spa=" + spa);
    }
    // Check DatabaseIS (Only if source.via is still items)
    if ((source.via === "items" || source.via === "placeholder") && items.databaseIS && Array.isArray(items.databaseIS) && items.databaseIS.length > 0) {
      const check = checkDatabaseIS(tab, items, source, checks === CHECK_VALUES.length);
      source = check.source;
      items = check.items;
      spa = spa || check.spa;
      console.log("buildInstance() - after checking databaseIS, spa=" + spa);
    }
    // Check DatabaseAP (Only if source.via is still items)
    // Commenting out the below line because I think this was before we started filtering the items.databaseAP from the first check, but we can still check late activation with the filtered items
    // if (!checks && (source.via === "items" || source.via === "placeholder") && items.databaseAP && Array.isArray(items.databaseAP) && items.databaseAP.length > 0) {
    if ((source.via === "items" || source.via === "placeholder") && items.databaseAP && Array.isArray(items.databaseAP) && items.databaseAP.length > 0) {
      // disregardActivate is always false because there are generic database URLs that are longer than 13 characters e.g. ^https?://(www\.)?.+\.com/
      const check = checkDatabaseAP(tab, items, source, false);
      source = check.source;
      items = check.items;
      spa = spa || check.spa;
      console.log("buildInstance() - after checking databaseAP, spa=" + spa);
    }
    // If still haven't found a Save or Database source, retry after the checks seconds... (only if checks argument is present)
    if ((source.via === "items" || source.via === "placeholder") && typeof checks === "number" && checks >= 1 && checks < CHECK_VALUES.length) {
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
   * Translates a source (such as a save or database) to an instance, or vice-versa.
   *
   * @param {Object} source - the source object (save or database)
   * @param {string} direction - either "source>instance" (e.g. when checking a save) or "instance>source" (e.g. when saving an instance)
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
      else                      { action = "click"; }
      source.action = action;
    }
    if (!source.append) {
      let append;
      if      (source.mediaType)                                 { append = "media"; }
      // It is possible for this combination element, but this is the less common case, so we prioritize ajax
      else if (source.pageElement && source.action === "click")  { append = "ajax"; }
      else if (!source.pageElement && source.action === "click") { append = "none"; }
      else if (source.pageElement)                               { append = "element"; }
      // iframePageOne is optional, so iframe should have an append defined in most cases
      else if (typeof source.iframePageOne !== "undefined")      { append = "iframe"; }
      else                                                       { append = "page"; }
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
      // No booleans currently?
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
      ["keyword", "prevLinkKeyword"],
      ["keyword", "nextLinkKeyword"],
      ["pageElement", "pageElementPath"],
      ["insertBefore", "insertBeforePath"],
      ["loadElement", "loadElementPath"],
      ["removeElement", "removeElementPath"],
      ["hideElement", "hideElementPath"],
      ["disableScrollElement", "disableScrollElementPath"],
      ["disableRemoveElement", "disableRemoveElementPath"],
      ["scrollIframe", "scrollIframeEnabled"]
    ]);
    // Note: We use hasOwnProperty in case the value is truthy (e.g. false) and instead of in because in goes up to the Object prototype properties, which we don't care about
    if (direction === "source>instance") {
      for (const [key, value] of translations) {
        if (source.hasOwnProperty(key)) {
          source[value] = source[key];
          delete source[key];
        }
      }
      // Add another property called type + "Mode" and if the source has a type defined for it, set it there for later
      // We need to do this here and now because we always set the type before we create the instance: Auto or Fixed Type
      for (let type of ["nextLinkType", "prevLinkType", "buttonType", "pageElementType"]) {
        source[type + "Mode"] = source[type] || "auto";
      }
    } else {
      for (const [key, value] of translations) {
        if (source.hasOwnProperty(value)) {
          source[key] = source[value];
          delete source[value];
        }
      }
    }
  }

  /**
   * Gets all the option screen's keys for the instance (used by Saves and Database items).
   *
   * @returns {string[]} the instance option keys
   * @public
   */
  function getInstanceOptionKeys() {
    return [
      "scrollDetection", "scrollBehavior", "scrollUpdateAddress", "scrollUpdateTitle",
      "scrollAppendThresholdPixels", "scrollAppendThresholdPages", "scrollAppendDelay", "scrollMaximumPages",
      "scrollDivider", "scrollDividerAlign", "scrollDividerButtons", "scrollOverlay", "scrollIcon", "scrollLoading",
      "customScriptsEnabled", "resizeMediaEnabled", "linksNewTabEnabled", "customEventsEnabled", "debugEnabled",
      "color"
    ];
  }

  /**
   * Creates the instance object using the tab, items, and source.
   *
   * @param {Object} tab - the tab properties (id, url)
   * @param {Object} items - the storage items
   * @param {Object} source - the source object (save or database)
   * @param {string} spa - the spa regex if this is a save or database url that needs to be watched
   * @returns {Object} the newly built instance
   * @private
   */
  function createInstance(tab, items, source, spa) {
    // Return the newly built instance using tab, items, and source (scrollEnabled for Infy-specific logic in shared JS)
    const _ = {};
    _.enabled = items.on && !!(source.saveActivate || source.databaseActivate);
    _.scrollEnabled = true;
    _.autoEnabled = false;
    _.multiEnabled = false;
    _.listEnabled = source.saveFound && source.action === "list";
    _.via = source.via;
    _.tabId = tab.id;
    _.tabURL = tab.url;
    _.url = tab.url;
    _.saveFound = !!source.saveFound;
    _.saveType = source.saveType || "pattern";
    _.saveURL = source.saveURL || tab.url;
    _.saveID = source.saveID;
    _.saveName = source.saveName || document?.title || "";
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
    _.startingURLsCurrentIndex = 0;
    _.urlsCurrentIndex = 0;
    _.nextLinkPath = source.nextLinkPath || items.nextLinkPath;
    _.nextLinkType = source.nextLinkTypeDetected || items.preferredPathType;
    _.nextLinkProperty = source.nextLinkProperty || items.nextLinkProperty;
    _.nextLinkKeywordsEnabled = source.via !== "items" ? !!source.nextLinkKeywordsEnabled : undefined;
    _.nextLinkKeyword = source.action === "next" ? source.nextLinkKeyword : undefined;
    _.prevLinkPath = source.prevLinkPath || items.prevLinkPath;
    _.prevLinkType = source.prevLinkTypeDetected || items.preferredPathType;
    _.prevLinkProperty = source.prevLinkProperty || items.prevLinkProperty;
    _.prevLinkKeywordsEnabled = source.via !== "items" ? !!source.prevLinkKeywordsEnabled : undefined;
    _.prevLinkKeyword = source.action === "prev" ? source.prevLinkKeyword : undefined;
    _.buttonPath = source.buttonPath || "";
    _.buttonType = source.buttonTypeDetected || items.preferredPathType;
    _.buttonDetection = typeof source.buttonPosition !== "undefined" && source.via !== "items" ? "manual" : "auto";
    _.buttonPosition = source.via !== "items" ? source.buttonPosition : undefined;
    _.list = source.list || [];
    // _.listOptions = source.listOptions || false;
    _.iframePageOne = !!source.iframePageOne;
    _.mediaType = source.mediaType || items.mediaType;
    _.pageElementPath = source.pageElementPath || "";
    _.pageElementType = source.pageElementTypeDetected || items.preferredPathType;
    _.pageElementIframe = source.pageElementIframe;
    _.insertBeforePath = source.insertBeforePath || "";
    _.ajaxMode = source.ajaxMode || "iframe";
    _.loadElementPath = source.loadElementPath || "";
    _.scrollIframeEnabled = typeof source.scrollIframeEnabled === "boolean" ? source.scrollIframeEnabled : true;
    // AJAX Native
    _.removeElementPath = source.removeElementPath || "";
    _.hideElementPath = source.hideElementPath || "";
    _.disableScrollObjects = source.disableScrollObjects || "";
    _.disableScrollElementPath = source.disableScrollElementPath || "";
    _.disableScrollFunctions = source.disableScrollFunctions || "";
    _.disableRemoveElementPath = source.disableRemoveElementPath || "";
    _.disableRemoveFunctions = source.disableRemoveFunctions || "";
    // Auto
    _.autoTimes = items.autoTimes;
    _.autoTimesOriginal = items.autoTimes;
    _.autoSeconds = items.autoSeconds;
    _.autoSlideshow = items.autoSlideshow;
    _.autoBehavior = items.autoBehavior;
    _.autoBadge = items.autoBadge;
    _.autoPaused = false;
    _.autoRepeating = false;
    _.autoRepeatCount = 0;
    // Extra
    // We always set lazyLoad to what the items default option is except for saves
    _.lazyLoad = (source.via === "save" || source.via === "placeholder") ? source.lazyLoad : items.lazyLoad;
    _.lazyLoadSource = source.lazyLoadSource || "data-src";
    _.lazyLoadDestination = source.lazyLoadDestination || "src";
    _.mirrorPage = source.mirrorPage;
    // Note: spaf is only used by database sources so we don't need to save it
    _.spa = spa;
    _.transferNode = source.transferNode;
    _.transferNodeMode = _.transferNode || (_.append === "ajax" ? "import" : "adopt");
    // Types (Auto or Fixed)
    for (const type of ["nextLinkType", "prevLinkType", "buttonType", "pageElementType"]) {
      _[type + "Mode"] = source[type + "Mode"] || "auto";
    }
    // Instance Option Keys
    for (const key of getInstanceOptionKeys()) {
      // If the source isn't the storage items (save/database), we prefix it with "_" and store it in the instance so that we can see them if we re-save it in Saves
      if (source.via !== "items" && source.hasOwnProperty(key)) {
        _["_" + key] = source[key];
      }
      // We update the instance with the source ones if they exist, else we use the storage items version
      _[key] = typeof _["_" + key] !== "undefined" ? _["_" + key] : items[key];
    }
    // Because there is no global color option, if there is no color from the source, use the default one
    _.color = _.color || "#55555F"
    // Make the threshold be 100 for click button, including both ajax modes; in the case of iframe, this also buys us extra time to scroll
    // the iframe, and in the case of native, if some of the bottom content hasn't loaded before the button has been clicked, this is necessary
    _.scrollAppendThresholdPixels = source.action === "click" ? 100 : _.scrollAppendThresholdPixels;
    // _.scrollAppendDelay = source.action === "click" ? _.scrollAppendDelay + 1000 : _.scrollAppendDelay;
    _.scrollDividerGrid = 0;
    _.scrollDividerGridParentModified = false;
    _.scrollbarExists = false;
    _.scrollbarAppends = 0;
    _.scrollbarHeight = 0;
    // Determine if this URL is local by using the window protocol or tab url
    _.isLocal = typeof window === "object" && window.location && window.location.protocol ? window.location.protocol.startsWith("file:") : tab.url && tab.url.startsWith("file://");
    // We need the locationOrigin for the Popup's List mode to show the domain/origin and for the SPA setting. The origin has the protocol and hostname
    _.locationOrigin = typeof window === "object" && window.location && window.location.origin ? window.location.origin : "";
    _.documentContentType = typeof document === "object" && document.contentType ? document.contentType : "text/html";
    _.documentCharacterSet = typeof document === "object" && document.characterSet ? document.characterSet : "UTF-8";
    _.currentPage = 1;
    _.bottomPage = 0;
    _.totalPages = 1;
    _.isLoading = true;
    _.started = false;
    _.requestAPI = "fetch";
    _.viewedFoundSnackbar = false;
    _.picker = "";
    _.pickerEnabled = false;
    _.pickerSet = false;
    // Document Type depends on append mode and action combination.
    _.documentType =
      (_.append === "element" && _.action === "click") || (_.append === "none") || (_.append === "ajax" && _.ajaxMode === "native") ? "top" :
      (_.append === "iframe") || (_.append === "ajax" && _.ajaxMode !== "native") || (_.append === "element" && _.pageElementIframe) ? "iframe" :
      "current";
    // Workflow
    // We never show the loading in workflowPrepend because we don't know when the elements will be appended by the site
    _.workflowReverse = (source.append === "ajax" && source.ajaxMode !== "native") || (source.append === "element" && source.pageElementIframe);
    _.workflowPrepend = (source.action === "click" && ((source.append === "element") || (source.append === "ajax" && source.ajaxMode === "native"))) ? "divider" : "";
    if (_.workflowPrepend) { _.scrollLoading = false }
    _.workflowSkipAppend = false;
    // If action is list or shuffle is enabled, precalculate the URLs array for the _
    if (_.action === "list" || (_.shuffleURLs && (_.action === "increment" || _.action === "decrement"))) {
      const precalculateProps = IncrementArray.precalculateURLs(_);
      _.urls = precalculateProps.urls;
      _.urlsCurrentIndex = _.startingURLsCurrentIndex = precalculateProps.currentIndex;
    }
    // Check to see if a custom script exists for this URL and set the instance's script value with the index in the Scripts array
    try {
      if (_.customScriptsEnabled) {
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
    // Trim down the database date to something more manageable
    try {
      _.databaseUpdatedAt = source.databaseUpdatedAt ? new Date(source.databaseUpdatedAt).toLocaleDateString() : "";
    } catch (e) {
      console.log("createInstance() - error trimming databaseUpdatedAt date. Error:");
      console.error(e);
      _.databaseUpdatedAt = source.databaseUpdatedAt;
    }
    return _;
  }

  /**
   * Checks if a saved URL matches this tab's URL.
   *
   * @param {Object} tab - the tab properties (id, url)
   * @param {Object} items - the storage items
   * @param {Object} source - the source object (save or database)
   * @param {boolean} disregardActivate - true if this should disregard the action and append activation checks aside from URL (only true on the last check)
   * @returns {{source: Object, items: Object, spa: string}} the modified source if it matched this URL, the updated items, and resolved spa
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
      if (checkSpa(save.spa, save.spaf, items.browserName, tab.url)) {
        spa = save.spa || save.spaf;
        isSpa = true;
      }
      const result = Saves.matchesSave(tab.url, save);
      if (result && result.matches) {
        console.log("checkSaves() - save matches this tab's URL, checking for activation... save=");
        console.log(save);
        // Translate the save to the instance keys before checking for activation
        translateInstance(save);
        const activate = checkActivate(tab, items, save);
        // Saves only: We need a placeholder if it fails activation in case the user clicks the Popup early
        // If source.via becomes placeholder, we don't check the other saves unless they have passed activation
        if (activate || disregardActivate || source.via === "items") {
          const isPlaceholder = !activate && !disregardActivate;
          console.log("checkSaves() - save activation passed for this tab's URL, disregardActivate=" + disregardActivate + ", isPlaceholder=" + isPlaceholder + ", save=");
          console.log(save);
          source = save;
          source.via = isPlaceholder ? "placeholder" : "save";
          source.saveURL = save.url;
          source.saveType = save.type || "regex";
          source.saveID = save.id;
          source.saveName = save.name;
          source.saveActivate = activate;
          source.saveFound = true;
          // Use Save's selection if this is an exact URL save; otherwise calculate the selection as normal later
          if (save.type === "exact" && result.selection) {
            source.selection = result.selection;
          }
          // Do not break out of the loop if this is just a placeholder save in order to check the other saves
          if (!isPlaceholder) {
            break;
          }
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
   * @param {Object} tab - the tab properties (id, url)
   * @param {Object} items - the storage items
   * @param {Object} source - the source object (save or database)
   * @param {boolean} disregardActivate - true if this should disregard the action and append activation checks aside from URL (only true on the last check)
   * @returns {{source: Object, items: Object, spa: string}} the modified source if it matched this URL, the updated items, and resolved spa
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
      if (checkSpa(is.spa, is.spaf, items.browserName, tab.url)) {
        spa = is.spa || is.spaf;
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
          const check = checkDatabaseActivate(tab, items, is.url);
          source.databaseActivate = check.databaseActivate;
          source.databaseBlacklisted = check.databaseBlacklisted;
          source.databaseWhitelisted = check.databaseWhitelisted;
          source.databaseBlacklistWhitelistURL = check.databaseBlacklistWhitelistURL;
          source.databaseURL = is.url;
          source.databaseResourceURL = is.resource_url;
          source.databaseUpdatedAt = is.updated_at;
          source.databaseFound = true;
          source.databaseISFound = true;
          // Use Save's selection if this is an exact URL save; otherwise calculate the selection as normal later
          if (is.type === "exact" && result.selection) {
            source.selection = result.selection;
          }
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
   * @param {Object} tab - the tab properties (id, url)
   * @param {Object} items - the storage items
   * @param {Object} source - the source object (save or database)
   * @param {boolean} disregardActivate - true if this should disregard the action and append activation checks aside from URL (only true on the last check)
   * @returns {{source: Object, items: Object, spa: string}} the modified source if it matched this URL, the updated items, and resolved spa
   * @private
   */
  function checkDatabaseAP(tab, items, source, disregardActivate) {
    console.log("checkDatabaseAP()");
    let spa = undefined;
    for (let i = 0; i < items.databaseAP.length; i++) {
      let ap = items.databaseAP[i];
      // Check SPA now before the break in for loop if activate passes
      // Note: isSpa gets reset to false on each iteration for each save whereas spa saves the last actual spa URL for all saves checked (needed for the popup in case the user tries to re-save the URL to keep their spa URL)
      let isSpa = false;
      if (checkSpa(ap.spa, ap.spaf, items.browserName, tab.url)) {
        spa = ap.spa || ap.spaf;
        isSpa = true;
      }
      try {
        ap.type = "regex";
        const result = Saves.matchesSave(tab.url, ap);
        if (result && result.matches) {
          console.log("checkDatabaseAP() - item matches this tab's URL, checking for activation... item=");
          console.log(ap);
          // Disregard activating the nextLink and pageElement requirements if this is the last check to allow the user to see the Database URL (ignore generic URLs whose length is small)
          if (disregardActivate) {
            disregardActivate = ap.url.length > 13;
          }
          // Translate the database to the instance keys before checking for activation
          // We create a new object to avoid potential collisions with other AP keys and our keys
          ap = {};
          ap.action = "next";
          ap.append = "element";
          ap.nextLinkType = "xpath";
          ap.pageElementType = "xpath";
          ap.nextLinkKeywordsEnabled = false;
          ap.url = items.databaseAP[i].url;
          ap.nextLink = items.databaseAP[i].nextLink;
          ap.pageElement = items.databaseAP[i].pageElement;
          ap.resource_url = items.databaseAP[i].resource_url;
          ap.updated_at = items.databaseAP[i].updated_at;
          translateInstance(ap);
          const activate = checkActivate(tab, items, ap);
          if (activate || disregardActivate) {
            console.log("checkDatabaseAP() - item activation passed for this tab's URL, item=");
            console.log(ap);
            source = ap;
            source.via = "database";
            const check = checkDatabaseActivate(tab, items, ap.url);
            source.databaseURL = ap.url;
            source.databaseResourceURL = ap.resource_url;
            source.databaseUpdatedAt = ap.updated_at;
            source.databaseFound = true;
            source.databaseAPFound = true;
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
   * Checks if a source (save or database) should activate itself based on its action and append mode settings.
   * TODO: If a source passes activation, store the action/append results (e.g. next link) so we don't have to re-calculate them again for page 1 in Scroll.prepareFirstPage()
   *
   * @param {Object} tab - the tab properties (id, url)
   * @param {Object} items - the storage items
   * @param {Object} source - the source object (save or database)
   * @returns {boolean} true if this source passes all activation checks, false otherwise
   * @private
   */
  function checkActivate(tab, items, source) {
    // We now need to determine whether we should auto-activate based on the action and append mode
    let activate = false;
    const action = source.action;
    const append = source.append;
    console.log("checkActivate() - action=" + action + ", append=" + append);
    if (action === "next" || action === "prev") {
      // Note that if a source has a type already set for it, we don't change it
      // Important: We declare a new property for the source called "TypeDetected" instead of overriding its "Type"  with the detected type because
      // in subsequent checks, we don't want the source type to be defined if it wasn't already, or else it will be a considered
      // a fixed type (e.g. late activation, or on checks > 1)
      source[action + "LinkTypeDetected"] = source[action + "LinkType"] || DOMPath.determinePathType(source[action + "LinkPath"], items.preferredPathType).type;
      // Note that we intentionally convert undefined save[action +"KeywordEnabled"] to false to avoid storing them in the save
      source[action + "LinkKeywordsEnabled"] = !!source[action + "LinkKeyword"];
      const keyword = typeof source[action + "LinkKeyword"] === "object" ? source[action + "LinkKeyword"] : undefined;
      const link = Next.findLink(source[action + "LinkPath"], source[action + "LinkTypeDetected"], source[action + "LinkProperty"], source[action + "LinkKeywordsEnabled"], items[action + "LinkKeywords"], keyword, true, document, false);
      activate = link && link.url;
      source[action + "LinkKeyword"] = link.method === "keyword" ? link.keywordObject : undefined;
    } else if (action === "increment" || action === "decrement") {
      const selection = Increment.findSelection(tab.url, source.selectionStrategy, source.selectionCustom);
      activate = selection && !!selection.selection;
    } else if (action === "click") {
      source.buttonTypeDetected = source.buttonType || DOMPath.determinePathType(source.buttonPath, items.preferredPathType).type;
      activate = Click.findButton(source.buttonPath, source.buttonTypeDetected, document, false).details.found;
    } else if (action === "list") {
      activate = true;
    }
    // The only append modes we have to validate is element and ajax (page, iframe, media, and none are all assumed to be true)
    if (activate && (append === "element" || append === "ajax")) {
      source.pageElementTypeDetected = source.pageElementType || DOMPath.determinePathType(source.pageElementPath, items.preferredPathType).type;
      const pageElements = Elementify.getPageElements(document, source.pageElementTypeDetected, source.pageElementPath);
      activate = pageElements && pageElements.length > 0 && pageElements[0] && pageElements[0].parentNode;
    }
    console.log("checkActivate() - activate=" + activate);
    return activate;
  }

  /**
   * Checks to see if the database URL should activate itself based on the blacklist or whitelist.
   *
   * @param {Object} tab - the tab properties (id, url)
   * @param {Object} items - the storage items
   * @param {string} databaseURL - the database URL
   * @returns {{databaseActivate: boolean, databaseBlacklisted: boolean, databaseBlacklistWhitelistURL: string, databaseWhitelisted: boolean}} the database action properties
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

  /**
   * Checks if the source's SPA URL matches this URL.
   *
   * @param {string} spa - the SPA URL (regular expression)
   * @param {string} spaf - the SPA URL (regular expresion) specific only to Firefox due to not supporting Navigation API
   * @param {string} browserName - the browser name
   * @param {string} url - the current tab URL to match the regular expression with
   * @returns {*|boolean} the object that contains whether the spa URL matches this URL
   */
  function checkSpa(spa, spaf, browserName, url) {
    let matches = false;
    try {
      matches = (spa && new RegExp(spa).test(url)) || (browserName === "firefox" && spaf && new RegExp(spaf).test(url));
    } catch (e) {
      console.error(e);
    }
    return matches;
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    buildInstance,
    translateInstance,
    getInstanceOptionKeys
  };

})();