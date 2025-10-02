/**
 * Infy Scroll
 * @copyright © 2020 Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Storage handles all storage-specific tasks, such as updating data between versions and backing up and restoring data.
 *
 * TODO: Finish implementing this to add a backup and restore feature
 */
const Storage = (() => {

  function update(previousVersion) {
    console.log("Storage update (no op) previousVersion=" + previousVersion);
  }

  function backup() {
  }

  // TODO: Handle two cases
  // 1. Updating internal storage (items)
  // 2. Updating imported storage (JSON text)
  async function restore(previousVersion, method, items) {
    // Cache storage items in case of error along the way
    const currentItems = await Promisify.storageGet();
    await _0_2();
    await _0_3();
    await _0_4();
    await _0_5();
    await _0_6();
    await _0_6_0_6();
    await _0_6_6_6();
  }

  // 0.2 Update: Add new options, force re-download database (if applicable), re-sort saves by ID to remove previously bad id duplicate id generation
  async function _0_2() {
    if (details.previousVersion < "0.2") {
      console.log("installedListener() - updating to 0.2 ...");
      const items = await Promisify.storageGet();
      const shouldDownloadDatabase = items && items.database && items.database.length > 0;
      await Promisify.storageSet({
        "interfaceMessages": true,
        "whitelistEnabled": items && items.whitelist && items.whitelist.length > 0,
        "database": [],
        "databaseDate": null,
        "databaseAutoUpdate": 1,
        "databaseBlacklist": items && items.databaseExclusions ? items.databaseExclusions : [],
        "databaseWhitelist": []
      });
      await Promisify.storageRemove("databaseExclusions");
      let saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
      // Ensure each save has a url and type (there was no validation on this in 0.1)
      saves = saves.filter(save => save.url && save.type);
      // Re-generate IDs in case there is now a gap after filtering, e.g. if deleting ID 3 in this array: [1, 2, 4, 5, ...]
      saves.sort((a, b) => (a.order > b.order) ? 1 : (a.order === b.order) ? ((a.url && b.url && a.url.length < b.url.length) ? 1 : -1) : -1);
      for (let i = 0; i < saves.length; i++) {
        // Set new id and new properties: title and scrollElementInsertRule added in 0.2
        if (saves[i]) {
          saves[i].id = i + 1;
          saves[i].title = "";
          saves[i].scrollElementInsertRule = "";
        }
      }
      // Resort back to default sort order
      saves.sort((a, b) => (a.order > b.order) ? 1 : (a.order === b.order) ? ((a.url && b.url && a.url.length < b.url.length) ? 1 : -1) : -1);
      await Promisify.storageSet({"saves": saves});
      // Force re-download database if the user already had a prior database because 0.1's database is stored in a different format in 0.2+
      if (shouldDownloadDatabase) {
        await downloadDatabase({useBackup: true});
      }
    }
  }

  // 0.3 Update: Reset scroll options to better default values to avoid too many requests, change percentage thresholds to pixels thresholds, add new scripts and styles options
  async function _0_3() {
    if (details.previousVersion < "0.3") {
      console.log("installedListener() - updating to 0.3 ...");
      const items = await Promisify.storageGet();
      // Set new storage items and reset default values for some items
      await Promisify.storageSet({
        "customScriptsEnabled": SDV.customScriptsEnabled,
        "scrollAppendThresholdPages": items && items.scrollDetection === "io" ? 1 : 0,
        "scrollAppendThresholdPixels": SDV.scrollAppendThresholdPixels,
        "scrollAppendDelay": SDV.scrollAppendDelay,
        "scrollAppendScripts": SDV.scrollAppendScripts,
        "scrollAppendStyles": SDV.scrollAppendStyles,
        "buttonScrollPixels": SDV.buttonScrollPixels
      });
      // Remove unused storage items
      await Promisify.storageRemove(["script", "scriptStart", "buttonScrollPercentage", "scrollAppendThresholdPercentage"]);
      // Add new properties introduced in 0.3 and remove unused properties to each save object
      const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
      for (const save of saves) {
        save.scrollAppendScripts = SDV.scrollAppendScripts;
        save.scrollAppendStyles = SDV.scrollAppendStyles;
        save.buttonScrollPixels = SDV.buttonScrollPixels;
        save.nextKeywordsEnabled = true;
        save.prevKeywordsEnabled = true;
        delete save.buttonScrollPercentage;
      }
      await Promisify.storageSet({"saves": saves});
    }
  }

  // 0.4 Update: Scroll Append Threshold pixels/pages changes. Also changed Append Element selector rule to target the children of the parent element, not the parent (this affects append element selector saves)
  async function _0_4() {
    if (details.previousVersion < "0.4") {
      console.log("installedListener() - updating to 0.4 ...");
      const items = await Promisify.storageGet();
      // Reset default values for scroll append threshold due to internal algorithm change and new minimum values being 0, not -1
      // Reset scrollElementInsertRule due to selector rule change, add new autoBehavior and on storage items
      await Promisify.storageSet({
        "scrollAppendThresholdPages": SDV.scrollAppendThresholdPages,
        "scrollAppendThresholdPixels": SDV.scrollAppendThresholdPixels,
        "scrollElementRule": SDV.scrollElementRule,
        "autoBehavior": SDV.autoBehavior,
        "on": SDV.on
      });
      // Remove the scrollbar detection option; this option is pretty much irrelevant in scroll listener mode as scroll pixels will always append pages until a scrollbar exists anyway
      await Promisify.storageRemove("scrollbarDetect");
      // Fix saves that use Append Element mode with selector rule type to point to the child elements (not the parent element)
      const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
      for (const save of saves) {
        if (save && save.scrollAppend === "element" && save.scrollElementType === "selector" && save.scrollElementRule && save.scrollElementRule.length > 0) {
          save.scrollElementRule += " > *";
        }
      }
      await Promisify.storageSet({"saves": saves});
    }
  }

  // 0.5 Update: Reset scrollAction due to Action consolidation. Three new options: scroll divider alignment, scroll icon, scroll wrap first page
  async function _0_5() {
    if (details.previousVersion < "0.5") {
      console.log("installedListener() - updating to 0.5 ...");
      const items = await Promisify.storageGet();
      // Reset scrollAction and add new storage items for two options
      await Promisify.storageSet({
        "scrollAction": SDV.scrollAction,
        "scrollWrapFirstPage": SDV.scrollWrapFirstPage,
        "scrollDividerAlign": SDV.scrollDividerAlign,
        "scrollIcon": SDV.scrollIcon
      });
      // Change saves that use Decrement action to Increment with a negative interval due to action consolidation
      const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
      for (const save of saves) {
        if (save) {
          save.scrollWrapFirstPage = false;
          if (save.scrollAction === "decrement") {
            save.scrollAction = "increment";
            save.interval = -save.interval;
          }
        }
      }
      await Promisify.storageSet({"saves": saves});
    }
  }

  // 0.6 Update: Store browser name, increase button size to 50, scrollWrapFirstPage default change, new options added for iframe height wait, element iframe hybrid, and lazy load script
  async function _0_6() {
    if (details.previousVersion < "0.6") {
      console.log("installedListener() - updating to 0.6 ...");
      const items = await Promisify.storageGet();
      // Storage Items changes - Increase button size if still using default 40px size, make scroll wrap first page false (see certain websites with iframe mode for why)
      await Promisify.storageSet({
        "browserName": getBrowserName(),
        "buttonSize": items && items.buttonSize && items.buttonSize !== 40 ? items.buttonSize : SDV.buttonSize,
        "interfaceTheme": SDV.interfaceTheme,
        "dynamicSettings": false,
        "nextProperty": items.nextAttribute ? items.nextAttribute : SDV.nextProperty,
        "prevProperty": items.prevAttribute ? items.prevAttribute : SDV.prevProperty,
        "scrollWrapFirstPage": SDV.scrollWrapFirstPage,
        "scrollHeightWait": SDV.scrollHeightWait,
        "scrollElementIframe": SDV.scrollElementIframe,
        "scrollLazyLoad": SDV.scrollLazyLoad,
        "scrollLazyLoadMode": SDV.scrollLazyLoadMode,
        "scrollLazyLoadAttributeSource": SDV.scrollLazyLoadAttributeSource,
        "scrollLazyLoadAttributeDestination": SDV.scrollLazyLoadAttributeDestination
      });
      // Remove the outdated "Attribute" names as they are now named "Property"
      await Promisify.storageRemove(["nextAttribute", "prevAttribute"]);
      // Add new options and delete unused options to save object
      const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
      for (const save of saves) {
        if (save) {
          save.version = "0.6";
          save.nextProperty = save.nextAttribute;
          save.prevProperty = save.prevAttribute;
          save.scrollHeightWait = 0;
          save.scrollElementIframe = SDV.scrollElementIframe;
          save.scrollLazyLoad = SDV.scrollLazyLoad;
          save.scrollLazyLoadMode = SDV.scrollLazyLoadMode
          save.scrollLazyLoadAttributeSource = SDV.scrollLazyLoadAttributeSource;
          save.scrollLazyLoadAttributeDestination = SDV.scrollLazyLoadAttributeDestination;
          delete save.nextAttribute;
          delete save.prevAttribute;
        }
      }
      await Promisify.storageSet({"saves": saves});
      // Whitelist Exact URLs Change (*url*) to ("url")
      let whitelist = items && items.whitelist && items.whitelist.length > 0 ? items.whitelist : [];
      whitelist = whitelist.map(url => {
        return url && url.startsWith("*") && url.endsWith("*") ? "\"" + url.substring(1, url.length - 1) + "\"" : url
      });
      await Promisify.storageSet({"whitelist": whitelist});
      // Database Blacklist Exact URLs Change (*url*) to ("url")
      let databaseBlacklist = items && items.databaseBlacklist && items.databaseBlacklist.length > 0 ? items.databaseBlacklist : [];
      databaseBlacklist = databaseBlacklist.map(url => {
        return url && url.startsWith("*") && url.endsWith("*") ? "\"" + url.substring(1, url.length - 1) + "\"" : url
      });
      await Promisify.storageSet({"databaseBlacklist": databaseBlacklist});
      // Database Whitelist Exact URLs Change (*url*) to ("url")
      let databaseWhitelist = items && items.databaseWhitelist && items.databaseWhitelist.length > 0 ? items.databaseWhitelist : [];
      databaseWhitelist = databaseWhitelist.map(url => {
        return url && url.startsWith("*") && url.endsWith("*") ? "\"" + url.substring(1, url.length - 1) + "\"" : url
      });
      await Promisify.storageSet({"databaseWhitelist": databaseWhitelist});
    }
  }

  // 0.6.0.6 Update: Make Fix Lazy Load default to true
  async function _0_6_0_6() {
    if (details.previousVersion < "0.6.0.6") {
      console.log("installedListener() - updating to 0.6.0.6 ...");
      // Storage Items changes - scrollLazyLoad is now true by default
      await Promisify.storageSet({
        "scrollLazyLoad": SDV.scrollLazyLoad
      });
      // No changes to the saves
    }
  }

  // 0.6.6.0 Update: Step 1 of Removing Infy from UI, Links New Tab extra option, Append Custom Styles, CustomEvents
  async function _0_6_6_6() {
    if (details.previousVersion < "0.6.6.0") {
      console.log("installedListener() - updating to 0.6.6.0 ...");
      const items = await Promisify.storageGet();
      // Storage Items changes - new append custom styles
      await Promisify.storageSet({
        "linksNewTabEnabled": true,
        "customEventsEnabled": false,
        "scrollAppendCustomStyles": SDV.scrollAppendCustomStyles,
        "scrollAppendCustomStylesValue": SDV.scrollAppendCustomStylesValue
      });
      // Saves: new append custom styles
      const saves = items && items.saves && items.saves.length > 0 ? items.saves : [];
      for (const save of saves) {
        if (save) {
          save.scrollAppendCustomStyles = SDV.scrollAppendCustomStyles;
          save.scrollAppendCustomStylesValue = SDV.scrollAppendCustomStylesValue;
        }
      }
      await Promisify.storageSet({"saves": saves});
    }
  }

  // Message Listener: We need to return immediately if the function will be performing asynchronous work
  // chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) { if (!request || request.receiver !== "background") { return; } messageListener(request, sender, sendResponse); if (request && request.async) { return true; } });

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    backup,
    restore,
    update
  };

})();