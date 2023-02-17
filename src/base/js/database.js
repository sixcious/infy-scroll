/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Database handles all database-specific tasks. This mainly includes downloading the databases from one of the CDNs or
 * original URLs and then persisting it to storage.
 *
 * List of potential locations: jsdelivr.net, statically.io, github.io, wedata.net, pages.dev, githubusercontent.com
 */
const Database = (() => {

  /**
   * Variables
   *
   * @oaram {Object} URLS the immutable object that contains the database URLs in a fixed order
   * @param {Object} urls the mutable object that is cloned from the URLS object, but with an order based on downloadLocation
   */
  const URLS = {
    AP: [
      { location: "jsdelivr.net",  url: "https://cdn.jsdelivr.net/gh/infyscroll/infyscroll.github.io/databases/AutoPagerize/items_all.json" },
      { location: "statically.io", url: "https://cdn.statically.io/gh/infyscroll/infyscroll.github.io/main/databases/AutoPagerize/items_all.json" },
      { location: "github.io",     url: "https://infyscroll.github.io/databases/AutoPagerize/items_all.json" },
      { location: "wedata.net",    url: "http://wedata.net/databases/AutoPagerize/items_all.json" }
      // , { location: "pages.dev",     url: "https://infyscroll.pages.dev/databases/AutoPagerize/items_all.json" }
      // , { location: "githubusercontent.com", url: "https://raw.githubusercontent.com/infyscroll/infyscroll.github.io/main/databases/AutoPagerize/items_all.json" }
    ],
    IS: [
      { location: "jsdelivr.net",  url: "https://cdn.jsdelivr.net/gh/infyscroll/infyscroll.github.io/databases/InfyScroll/items_all.json" },
      { location: "statically.io", url: "https://cdn.statically.io/gh/infyscroll/infyscroll.github.io/main/databases/InfyScroll/items_all.json" },
      { location: "github.io",     url: "https://infyscroll.github.io/databases/InfyScroll/items_all.json" },
      { location: "wedata.net",    url: "http://wedata.net/databases/InfyScroll/items_all.json" }
      // , { location: "pages.dev",     url: "https://infyscroll.pages.dev/databases/InfyScroll/items_all.json" },
      // , { location: "githubusercontent.com", url: "https://raw.githubusercontent.com/infyscroll/infyscroll.github.io/main/databases/InfyScroll/items_all.json" }
    ]
  };
  let urls;

  /**
   * Downloads the databases.
   *
   * Note: This function is in the Background because both the Content Script and Options  need the ability to download
   * the database. If it weren't in the Background, we would need to duplicate this function in both places.
   *
   * @param {boolean} downloadAP - whether to download the AP database or not
   * @param {boolean} downloadIS - whether to download the IS database or not
   * @param {string} downloadLocation - the preferred location to download the database from
   * @returns {Promise<{url: string, error: *, downloaded: boolean}>} the result (true if successful and any error message)
   * @public
   */
  async function download(downloadAP = true, downloadIS = true, downloadLocation) {
    console.log("download() - downloadAP=" + downloadAP + ", downloadIS=" + downloadIS);
    // Save the Database Date first (separately) to avoid potential issues, such as this function being called on every request in case of error with the fetch request
    await Promisify.storageSet({"databaseDate": new Date().toJSON()});
    // We need to clone the URLS array each time because if this is called again before the background is unloaded, the index order will be different
    urls = Util.clone(URLS);
    // If the preferred location is specified, swap its index so that it's the first entry in the arrays (if not found, default to 0 so no change occurs)
    if (downloadLocation) {
      for (const key of Object.keys(urls)) {
        let index = urls[key].findIndex(d => d.location === downloadLocation);
        index = index >= 0 && index < urls[key].length ? index : 0;
        [urls[key][0],urls[key][index]] = [urls[key][index],urls[key][0]];
      }
    }
    // Download the databases if they are specified
    const resultAP = downloadAP ? await downloadDatabase("AP", 0) : {};
    const resultIS = downloadIS ? await downloadDatabase("IS", 0) : {};
    // Merge the results of the downloaded and error properties
    const result = {};
    result.downloaded = (downloadAP && resultAP.downloaded) || (resultIS && resultIS.downloaded);
    result.error = resultAP.error || resultIS.error;
    console.log("download() - result.downloaded=" + result.downloaded + ", result.error=" + result.error);
    return result;
  }

  /**
   * Downloads the named database.
   *
   * @param {string} databaseName - the name of the database to download, "AP" (AutoPagerize) or "IS" (InfyScroll)
   * @param {number} index - the current index in the urls array to use (also the current download attempt)
   * @returns {Promise<{location: string, error: *, downloaded: boolean}>} the result (true if successful and any error message)
   * @private
   */
  async function downloadDatabase(databaseName, index = 0) {
    console.log("downloadDatabase() - databaseName=" + databaseName + ", index=" + index);
    const result = { location: "", downloaded: false, error: undefined };
    const databaseURLs = urls[databaseName];
    try {
      const url = databaseURLs[index].url;
      const location = databaseURLs[index].location;
      // Add a timestamp to make this URL request unique and not cachable by the browser
      // Note: Date.now() will always return a number less than Number.MAX_SAFE_INTEGER (and is good for the next 200,000 years)
      // https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Date#the_ecmascript_epoch_and_timestamps
      const timestamp = "?ts=" + Date.now();
      result.location = location;
      console.log("downloadDatabase() - downloading database from: " + url);
      const response = await fetch(url + timestamp);
      let database = await response.json();
      // Filter the database to only records who contain the required properties
      database = database.filter(d => d.data && d.data.url);
      // Map each database record (r) to a flat object with the desired keys
      database = database.map(d => {
        const r = {};
        for (const k of ["name", "resource_url", "updated_at", "created_by"]) { if (d[k]) { r[k] = d[k]; } }
        for (const k of Object.keys(d.data)) { if (d.data[k]) { r[k] = d.data[k]; } }
        return r;
      });
      // Sort the database with the longest URLs first to find the most exact URL match first
      database.sort((a, b) => (a.url.length < b.url.length) ? 1 : -1);
      if (Array.isArray(database) && database.length > 0) {
        // Note: The microformat is the item that websites use to make themselves compatible with AutoPagerize
        if (databaseName === "AP") {
          const microformat = {
            name:         "Microformat",
            created_by:   "swdyh",
            updated_at:   "2008-01-01T00:00:00.000Z",
            url:          ".*",
            nextLink:     "//a[@rel='next'] | //link[@rel='next']",
            pageElement:  "//*[contains(@class, 'autopagerize_page_element')]",
            insertBefore: "//*[contains(@class, 'autopagerize_insert_before')]",
          };
          database.push(microformat);
        }
        await Promisify.storageSet({
          ["database" + databaseName]: database,
          ["database" + databaseName + "Date"]: new Date().toJSON(),
          ["database" + databaseName + "Location"]: location,
          ["database" + databaseName + "Enabled"]: true
        });
        result.downloaded = true;
      } else {
        throw new Error(chrome.i18n.getMessage("database_empty_error"));
      }
    } catch (e) {
      console.log("downloadDatabase() - error downloading database from: " + result.location + " - Error:");
      console.log(e);
      result.error = e.message;
      index++;
      if (index < databaseURLs.length) {
        return await downloadDatabase(databaseName, index);
      }
    }
    return result;
  }

  // Return public members from the Immediately Invoked Function Expression (IIFE, or "Iffy") Revealing Module Pattern (RMP)
  return {
    download
  };

})();