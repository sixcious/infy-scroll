/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * Scripts is an array of objects that are custom-made for some popular websites to fix broken HTML or images due to the
 * unnatural way of how pages are appended. The custom scripts are only ran after each page is appended. These scripts
 * are usually intended to fix missing thumbnail images, but could serve to do anything to the appended elements.
 *
 * @type {Object[]} the array of script objects
 */
const Scripts = [
  {
    // name:        "Google Search (Includes Videos and News Sections)",
    // description: "Thumbnail Image Script",
    // note:        "Uses complex inline scripts that are situationally added in the document body for each page to set the image sources. URLs are either hexadecimal encoded or unicode encoded and may point to Base 64 Images.",
    // todo: star ratings (background images)
    url: String.raw`^https?://[^./]+\.google(?:\.[^./]{2,3}){1,2}/(?:c(?:se|ustom)|search|webhp|m|#)`,
    fn: function (doc) {
      [...doc.querySelectorAll("script")].forEach(script => {
        try {
          if (script && script.textContent) {
            const textContent = script.textContent;
            let regexp;
            // Type 1 Thumbnail Images
            // (function(){var s='data:image/jpeg;base64,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';var ii=['vidthumb2','vidthumb3'];_setImagesSrc(ii,s);})();
            // URL has Hexadecimal Encoding. For example, '\x3d' is '='. Also, URLs point to Base 64 Images.
            // Example URL: data:image/jpeg;base64,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\x3d
            // @see https://stackoverflow.com/a/4209150 by Gumbo
            // @see https://stackoverflow.com/a/4209128 by PleaseStand
            regexp = new RegExp("(var s=')(.*)(';)(var ii=\\[')(.*)('];)").exec(textContent);
            if (regexp && regexp[2] && regexp[5]) {
              // Note: var ii can have multiple vidthumbs so we need to split it, e.g. var ii=['vidthumb2','vidthumb3'];
              const ids = regexp[5].split("','");
              const url = regexp[2];
              // Decode Hexadecimal Encoding
              // Alternative Solution: JSON.parse('"' + url.replace(/([^\\]|^)\\x/g, '$1\\u00') + '"');
              const src = url.replace(/\\x([0-9A-Fa-f]{2})/gi, (...arguments) => { return String.fromCharCode(parseInt(arguments[1], 16))});
              for (const id of ids) {
                const img = doc.getElementById(id);
                if (src && img && img.nodeName && img.nodeName.toUpperCase() === "IMG") {
                  console.log("fn() - changing img id=" + id + ", from=" + img.src + " to=" + src);
                  img.src = src;
                }
              }
              return;
            }
            // Type 2 Video Thumbnail Images
            // (function(){google.ldidly=0;google.ldi={"vidthumb1":"url","vidthumb2":"url","vidthumb3":"url"}
            // URL has Unicode Encoding. For example, '\u003d' is '='
            // Example URL: https://encrypted-tbn1.gstatic.com/images?q\u003dtbn:ANd9GcQH8XUamt5Aejpl1Dkj9L5ihcN0uSgYOwQEmWQtCVsdfwpdDJ43bx-47OEP3Ko
            // @see https://stackoverflow.com/a/7885499 by Ioannis Karadimas
            // @see https://stackoverflow.com/a/43641559 by Thriggle
            regexp = new RegExp("(google.ldi={)(.*?)(})").exec(textContent);
            if (regexp && regexp[2]) {
              // Note: google.ldi={} can have multiple vidthumbs inside the braces so we need to split it by comma
              const objects = regexp[2].split(",");
              for (const object of objects) {
                const regexp2 = new RegExp("(\")(.*?)(\":\")(.*?)(\")").exec(object);
                if (regexp2 && regexp2[2] && regexp2[4]) {
                  const id = regexp2[2];
                  const url = regexp2[4];
                  const img = doc.getElementById(id);
                  // Decode Unicode Encoding
                  // Alternative Solution: JSON.parse("\"" + url + "\"");
                  const src = url.replace(/\\u([\d\w]{4})/gi, (...arguments) => { return String.fromCharCode(parseInt(arguments[1], 16))});
                  if (src && img && img.nodeName && img.nodeName.toUpperCase() === "IMG") {
                    console.log("Scripts.fn() - changing img id=" + id + ", from=" + img.src + " to=" + src);
                    img.src = src;
                  }
                }
              }
            }
            // Type 3 Google Shopping Thumbnail Images
            // var _pmc='{}` _pmc is a JSON Object, but it appears to be in both Hex and Unicode encoding? We need to parse it and then access _pmc.spop.r to find an array of the images
            // There is also an outer div[data-ved] that needs opacity set to 1
            // Some of the images are lazily set via the attribute "data-image-src". These only give us the secondary image though (the one that shows up on hover)
            // 16746816653091682559
            // https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcRtZLtHDEiFVQokTHQiuHmZ8iTTYiJvNF62LZr1vUXs-1L4d6AwGH7qVfOPBWt1vzm4YdG3XU0IZE-c6b6hookHlkZeE2cH_hOPAxVK6nw&usqp=CAE
            // '\x3d' is '=' \x22 is ? \u0026 is &
            // regexp = new RegExp("(var _pmc=')(.*)(';)").exec(textContent);
            // if (regexp && regexp[2]) {
            //   console.log("Scripts.fn() - Google Shopping Image Script Found");
            //   doc.querySelectorAll("[data-ved]").forEach(div => {
            //     div.style.setProperty("opacity", "1", "important");
            //   });
            //   // const json = JSON.parse(regexp[2]);
            //   // if (json && json.spop && json.spop.r) {
            //   //   console.log("Scripts.fn() - Google Shopping JSON Found");
            //   // }
            // }
          }
        } catch (e) {
          console.log("Scripts.fn() - Error:");
          console.log(e);
        }
      });
    }
  },
  {
    // name:        "Bing Search",
    // description: "Thumbnail Image Script",
    // note:        "Uses a simple dataset url replacement on the image to set the image source and a complex replacement ala Google Search",
    url: String.raw`^https?://(?:www|cnweb)4?\.bing\.com/(?:[^/]+/)*?(?:results\.aspx|search)`,
    fn: function (doc) {
      // Type 1 Thumbnail Images (Simple)
      [...doc.querySelectorAll("img[data-src-hq][src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAIBTAA7']")].forEach(img => {
        img.src = img.dataset.srcHq ? img.dataset.srcHq : img.src;
      });
      // Type 2 Thumbnail Images (Complex - Same type as Google Search Type 1 Thumbnail Images)
      [...doc.querySelectorAll("script")].forEach(script => {
        if (script && script.textContent) {
          const textContent = script.textContent;
          let regexp = new RegExp("(var x=_ge\\(')(.*)('\\))(.*x.src=')(.*)(';)").exec(textContent);
          if (regexp && regexp[2] && regexp[5]) {
            const id = regexp[2];
            const url = regexp[5];
            const img = doc.getElementById(id);
            // This doesn't seem to need the hex decoding...
            // const src = url.replace(/\\x([0-9A-Fa-f]{2})/gi, (...arguments) => { return String.fromCharCode(parseInt(arguments[1], 16))});
            const src = url;
            if (src && img && img.nodeName && img.nodeName.toUpperCase() === "IMG") {
              console.log("Scripts.fn() - changing img id=" + id + ", from=" + img.src + " to=" + src);
              img.src = src;
            }
            console.log("Scripts.fn() - src=" + src);
          }
        }
      });
    }
  },
  {
    // name:        "Yande.re"
    // description: "Class Removal",
    // note:        "Removes the "javascript-hide class to thumb",
    // eurl: new Uint8Array( [94, 104, 116, 116, 112, 115, 63, 58, 47, 47, 121, 97, 110, 100, 101, 46, 114, 101]),
    url: String.raw`^https?://yande\.re`,
    rootDocument: true,
    fn: function (doc) {
      doc.querySelectorAll(".javascript-hide").forEach(el => {
        if (el && el.classList) {
          console.log("Scripts.fn() - removing javascript-hide class from element");
          el.classList.remove("javascript-hide");
        }
      });
    }
  }
];