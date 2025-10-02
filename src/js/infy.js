/**
 * Infy Scroll
 * @copyright © 2020 Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Infy handles all instance-specific logic, such as building the initial instance and getting the items for the main
 * Scroll content script.
 */
const Infy = (() => {

  /**
   * Builds an instance with initial values (from either an existing save, database, or via default storage items).
   *
   * @param tab   the tab properties (id, url) to set this instance with
   * @param items (optional) the storage items
   * @returns instance the newly built instance
   * @public
   */
  async function buildInstance(tab, items) {
    console.log("buildInstance()");
    items = items ? items : await Promisify.storageGet();
    // For presentation purposes, the extension has an option for URLs to be decoded or left as is. This is needed so that we recognize the URL correctly when we save them
    // Note: Use decodeURIComponent instead of decodeURI. While component is only intended for parameters (not full URLs), it can decode more characters
    // TODO: Need to also make the check for each Saved URL if the user decides to turn this option on/off... (annoying to handle)
    if (items.decodeURIEnabled) {
      try {
        tab.url = decodeURIComponent(tab.url);
      } catch(e) {
        console.log("buildInstance() - error decoding URI:" + e);
      }
    }
    // via will either be items, save, whitelist, or database. First assume we will be using the storage items
    let via = "items";
    let object = items;
    // Check Saves
    for (const save of items.saves) {
      const result = Saves.matchesSave(tab.url, save);
      if (result.matches) {
        // TODO: Validate there is a next/prev link (if action is Next/Prev Link) or a page element (if append mode is Element)
        console.log("buildInstance() - Saved URL (" + save.type + ") found for this tab's url");
        via = "save";
        object = save;
        object.saveID = save.id;
        object.saveTitle = save.title;
        object.saveURL = save.url;
        object.saveType = save.type;
        object.saveFound = true;
        // Use Save's selection if this is an exact URL save; otherwise calculate the selection as normal later
        if (save.type === "exact" && result.selection) {
          object.selection = result.selection;
        }
        // We now need to determine whether Infy should auto-activate itself based on the action and append mode
        const action = object.scrollAction;
        const append = object.scrollAppend;
        // We always activate in the following three scenarios:
        // 1. button action due to dynamic content (e.g. the button) that may not have possibly loaded on the page
        // 2. list action as we are currently not validating it in the popup
        // 3. next/prev action with an append of iframe or element-iframe due to dynamic content
        let saveActivate = action === "button" || action === "list" || ((action === "next" || action === "prev") && (append === "iframe" || (append === "element" && object.scrollElementIframe)));
        // If none of the special cases, we need to manually verify this save
        if (!saveActivate) {
          if (action === "next" || action === "prev") {
            const result = NextPrev.findNextPrevURL(object[action + "Type"], object[action + "Selector"], object[action + "Xpath"], object[action + "Property"], object[action + "KeywordsEnabled"], items[action + "Keywords"], object.decodeURIEnabled, items.debugEnabled, document);
            saveActivate = result && result.url;
          } else if (action === "increment" || action === "decrement") {
            const selection = IncrementDecrement.findSelection(tab.url, object.selectionPriority, object.selectionCustom);
            saveActivate = selection && !!selection.selection;
          }
          // The only append mode we then have to validate is element. page, iframe, and media are all assumed to be true
          if (saveActivate && append === "element") {
            const elements = Scroll.getElements(document, object.scrollElementType, object.scrollElementRule);
            saveActivate = elements && elements.length > 0 && elements[0] && elements[0].parentNode;
          }
        }
        object.saveActivate = saveActivate;
        break;
      }
    }
    // Check Whitelist (Only if via is still items and not saves)
    if (via === "items" && items.whitelist && items.whitelistEnabled) {
      const result = Saves.matchesList(tab.url, undefined, items.whitelist, "Whitelist");
      if (result && result.matches) {
        via = "whitelist";
        object.saveURL = result.url;
        object.saveType = result.type;
        object.whitelistFound = true;
      }
    }
    // Check Database (Only if via is still items and not saves or whitelist)
    // TODO: If a database record was found, store the nextURL and elements at this point so we don't have to re-calculate them again for page 1 in Scroll.prepareFirstPage()
    if (via === "items" && items.database && Array.isArray(items.database) && items.database.length > 0) {
      // Note: The microformat is the fallback rule that AutoPagerize uses
      const microformat = {
        url:          '.*',
        nextLink:     '//a[@rel="next"] | //link[@rel="next"]',
        insertBefore: '//*[contains(@class, "autopagerize_insert_before")]',
        pageElement:  '//*[contains(@class, "autopagerize_page_element")]'
      };
      // TODO: items.database.push(microformat);
      for (const d of items.database) {
        try {
          // Requirement 1: Check if this database url matches this url
          if (new RegExp(d.url).test(tab.url)) {
            console.log("buildInstance() - a database record's url matched:=" + d.url);
            // Requirement 2: Check if the next url exists
            const nextURL = NextPrev.findNextPrevURL("xpath", undefined, d.nextLink, ["href"], false, items.nextKeywords, false, false, undefined);
            if (nextURL && nextURL.url) {
              console.log("buildInstance() - a database record's next link matched:" + nextURL.url);
              // Requirement 3: Check if any page elements exist
              const elements = Scroll.getElements(document, "xpath", d.pageElement);
              if (elements && elements.length > 0 && elements[0] && elements[0].parentNode) {
                console.log("buildInstance() - a database record's page elements matched:" + elements.length + " elements");
                let databaseActivate = false;
                // Auto-activate on all URLs unless Blacklisted
                if (items.databaseAutoActivate) {
                  databaseActivate = true;
                  const result = Saves.matchesList(tab.url, d.url, items.databaseBlacklist, "Database Blacklist");
                  if (result && result.matches) {
                    databaseActivate = false;
                  }
                }
                // Or don't auto-activate on a URL unless Whitelisted
                else {
                  databaseActivate = false;
                  const result = Saves.matchesList(tab.url, d.url, items.databaseWhitelist, "Database Whitelist");
                  if (result && result.matches) {
                    databaseActivate = true;
                  }
                }
                // Convert the database object into an instance object (set nextKeywordsEnabled to false to ensure we only use the xpath rule)
                object.scrollAction = "next";
                object.scrollAppend = "element";
                object.nextType = "xpath";
                object.nextXpath = d.nextLink;
                object.nextKeywordsEnabled = false;
                object.scrollElementType = "xpath";
                object.scrollElementRule = d.pageElement;
                object.scrollElementInsertRule = d.insertBefore;
                object.scrollElementIframe = false;
                object.databaseURL = d.url;
                object.databaseFound = true;
                object.databaseActivate = databaseActivate;
                // If this is the generic database URLs https?://... (13 characters or less), don't use them as the Save URL and instead use the tab URL. Also change the default save type to pattern
                if (d.url && d.url.length > 13) {
                  object.saveURL = d.url;
                  object.saveType = "regex";
                } else {
                  // Note: This saveURL gets automatically set when we build the instance below if we didn't set it here
                  // object.saveURL = tab.url;
                  object.saveType = "pattern";
                }
                break;
              }
            }
          }
        } catch(e) {
          console.log("buildInstance() - error checking a database record:" + e);
        }
      }
    }
    // Prepopulate the selection to increment/decrement, nextKeywordsEnabled, and prevKeywordsEnabled
    // Note: Saved URL Exact will already have the selection set and Database Found will already have the next object for nextKeywordsEnabled
    // TODO: For better efficiency, we should look at moving these three statements to when we have to activate an instance so that we don't do it on every page load
    object.selection = object.selection || IncrementDecrement.findSelection(tab.url, object.selectionPriority, object.selectionCustom);
    if (!object.hasOwnProperty("nextKeywordsEnabled")) {
      const findNextURLResponse = NextPrev.findNextPrevURL(object.nextType, object.nextSelector, object.nextXpath, object.nextProperty, false, items.nextKeywords, object.decodeURIEnabled, false,  undefined);
      object.nextKeywordsEnabled = !findNextURLResponse || !findNextURLResponse.url;
    }
    if (!object.hasOwnProperty("prevKeywordsEnabled")) {
      const findPrevURLResponse = !NextPrev.findNextPrevURL(object.prevType, object.prevSelector, object.prevXpath, object.prevProperty, false, items.prevKeywords, object.decodeURIEnabled, false,  undefined);
      object.prevKeywordsEnabled = !findPrevURLResponse || !findPrevURLResponse.url;
    }
    // Check to see if a custom script exists for this URL and set the instance's script value with the index in the Scripts array
    try {
      if (items.customScriptsEnabled) {
        for (let i = 0; i < Scripts.length; i++) {
          const scriptURL = Scripts[i].url;
          console.log("buildInstance() - checking scriptURL=" + scriptURL);
          if (new RegExp(scriptURL).test(tab.url)) {
            console.log("buildInstance() - attaching a custom script to the instance, i=" + i + ", script url=" + scriptURL);
            object.script = i;
            break;
          }
          console.log("buildInstance() - done checking scriptURL=" + scriptURL);
        }
      }
    } catch(e) {
      console.log("buildInstance() - error checking scripts, error=" + e);
    }
    // Return the newly built instance using tab, via, selection, object, and items (scrollEnabled for Infy-specific logic in shared JS)
    const instance = {
      "enabled": items.on && !!(object.saveActivate || object.whitelistFound || object.databaseActivate),
      "scrollEnabled": true, "autoEnabled": false, "multiEnabled": false, "listEnabled": object.saveFound && object.scrollAction === "list",
      "decodeURIEnabled": object.decodeURIEnabled, "debugEnabled": items.debugEnabled,
      "tabId": tab.id, "url": tab.url,
      "saveFound": !!object.saveFound, "saveType": object.saveType ? object.saveType : "pattern", "saveURL": object.saveURL ? object.saveURL : tab.url, "saveID": object.saveID, "saveTitle": object.saveTitle ? object.saveTitle : "",
      "whitelistFound": !!object.whitelistFound,
      "databaseFound": !!object.databaseFound, "databaseActivate": !!object.databaseActivate, "databaseURL": object.databaseURL,
      "selection": object.selection.selection, "selectionStart": object.selection.selectionStart,
      "selectionPriority": object.selectionPriority, "selectionCustom": object.selectionCustom,
      "leadingZeros": via === "save" && object.saveType === "exact" ? object.leadingZeros : items.leadingZerosPadByDetection && object.selection.selection.charAt(0) === '0' && object.selection.selection.length > 1,
      "interval": object.interval,
      "base": object.base, "baseCase": object.baseCase, "baseRoman": object.baseRoman, "baseDateFormat": object.baseDateFormat, "baseCustom": object.baseCustom,
      "errorSkip": object.errorSkip, "errorCodes": object.errorCodes, "errorCodesCustomEnabled": object.errorCodesCustomEnabled, "errorCodesCustom": object.errorCodesCustom,
      "multi": {"1": {}, "2": {}, "3": {}}, "multiCount": 0,
      "urls": [], "shuffleURLs": object.shuffleURLs, "shuffleLimit": object.shuffleLimit,
      "nextType": object.nextType, "nextSelector": object.nextSelector, "nextXpath": object.nextXpath, "nextProperty": object.nextProperty, "nextKeywordsEnabled": object.nextKeywordsEnabled, "nextKeywords": items.nextKeywords,
      "prevType": object.prevType, "prevSelector": object.prevSelector, "prevXpath": object.prevXpath, "prevProperty": object.prevProperty, "prevKeywordsEnabled": object.prevKeywordsEnabled, "prevKeywords": items.prevKeywords,
      "buttonType": object.buttonType, "buttonRule": object.buttonRule, "buttonMethod": object.buttonMethod, "buttonScrollPixels": object.buttonScrollPixels,
      "list": object.list ? object.list : "", "listArray": object.listArray ? object.listArray : [],
      "autoTimes": items.autoTimes, "autoTimesOriginal": items.autoTimes, "autoSeconds": items.autoSeconds, "autoSlideshow": items.autoSlideshow, "autoBehavior": items.autoBehavior, "autoBadge": items.autoBadge, "autoPaused": false, "autoRepeating": false, "autoRepeatCount": 0,
      "script": object.script,
      "scrollAction": object.scrollAction, "scrollAppend": object.scrollAppend,
      "scrollWrapFirstPage": object.scrollWrapFirstPage, "scrollHeightWait": object.scrollHeightWait ? object.scrollHeightWait : items.scrollHeightWait,
      "scrollElementRule": object.scrollElementRule, "scrollElementInsertRule": object.scrollElementInsertRule ? object.scrollElementInsertRule : "", "scrollElementType": object.scrollElementType, "scrollElementIframe": object.scrollElementIframe,
      "scrollMediaType": object.scrollMediaType,
      "scrollAppendThresholdPages": items.scrollAppendThresholdPages, "scrollAppendThresholdPixels": object.scrollAction === "button" && object.buttonScrollPixels ? object.buttonScrollPixels : items.scrollAppendThresholdPixels,
      "scrollAppendScripts": object.scrollAppendScripts, "scrollAppendStyles": object.scrollAppendStyles, "scrollAppendCustomStyles": object.scrollAppendCustomStyles, "scrollAppendCustomStylesValue": object.scrollAppendCustomStylesValue,
      "scrollLazyLoad": object.scrollLazyLoad, "scrollLazyLoadMode": object.scrollLazyLoadMode, "scrollLazyLoadAttributeSource": object.scrollLazyLoadAttributeSource, "scrollLazyLoadAttributeDestination": object.scrollLazyLoadAttributeDestination,
      "scrollbarExists": false, "scrollbarAppends": 0, "scrollDivider": items.scrollDivider, "scrollUpdateAddress": items.scrollUpdateAddress, "scrollUpdateTitle": items.scrollUpdateTitle, "scrollBehavior": items.scrollBehavior, "scrollOverlay": items.scrollOverlay, "scrollPrepareFirstPageAttempts": 0,
      "isLocal": tab.url && tab.url.startsWith("file://"),
      "documentContentType": document && document.contentType ? document.contentType : "text/html",
      "documentCharacterSet": document && document.characterSet ? document.characterSet : "UTF-8",
      "currentPage": 1, "totalPages": 1, "isLoading": true, "started": false, "useXHR": false
    };
    // Set Window-specific properties
    if (typeof window === "object" && window.location) {
      // We only need the locationOrigin for the Popup's List mode to show the domain/origin. The origin has the protocol and hostname
      instance.locationOrigin = window.location.origin;
      // Re-evaluate isLocal using the window's location protocol
      instance.isLocal = window.location.protocol ? window.location.protocol.startsWith("file:") : instance.isLocal;
    }
    // If action is list or shuffle is enabled, precalculate the URLs array for the instance
    if (instance.scrollAction === "list" || (instance.shuffleURLs && (instance.scrollAction === "increment" || instance.scrollAction === "decrement"))) {
      const precalculateProps = IncrementDecrementArray.precalculateURLs(instance);
      instance.urls = precalculateProps.urls;
      instance.urlsCurrentIndex = instance.startingURLsCurrentIndex = precalculateProps.currentIndex;
    }
    return instance;
  }

  /**
   * A convenience function that gets the storage items after checking to see if the database needs to be updated. If
   * the database needs to be updated, the storage items are updated with the new database.
   *
   * This function resides in the content script instead of the background's startup listener because that only fires
   * when Chrome starts, and users tend to keep their browser open for days or weeks before restarting.
   *
   * @returns {Promise<{}>} the storage items
   * @public
   */
  async function getItems() {
    console.log("getItems()");
    let items;
    try {
      items = await Promisify.storageGet();
      // This checks to see if the database needs to be updated (if the update was more than X number of days ago).
      // Note: 1 Day = 86400000 ms
      if (items && items.database && items.database.length > 0 && items.databaseAutoUpdate >= 1 && (!items.databaseDate || ((new Date() - new Date(items.databaseDate)) >= (86400000 * items.databaseAutoUpdate)))) {
        console.log("getItems() - updating database because databaseDate=" + items.databaseDate + " and databaseAutoUpdate=" + items.databaseAutoUpdate);
        const response = await Promisify.runtimeSendMessage({receiver: "background", greeting: "downloadDatabase", options: {useBackup: false}});
        console.log("getItems() - download response=" + JSON.stringify(response));
        if (response && response.downloaded) {
          items = await Promisify.storageGet();
        }
      }
    } catch(e) {
      console.log("getItems() - error:" + e);
    }
    return items;
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    buildInstance,
    getItems
  };

})();
