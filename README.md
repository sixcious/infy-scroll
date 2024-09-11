# Infy Scroll
<img src="https://raw.githubusercontent.com/sixcious/assets/main/repository/infy-scroll/icon.svg?sanitize=true" width="196" height="196" alt="Infy Scroll" title="Infy Scroll">

## Available For
<a href="https://chromewebstore.google.com/detail/infy-scroll/gdnpnkfophbmbpcjdlbiajpkgdndlino" title="Download for Google Chrome"><img src="https://raw.githubusercontent.com/sixcious/assets/main/vendor/chrome.svg?sanitize=true" height="64" alt="Google Chrome"></a>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://microsoftedge.microsoft.com/addons/detail/infy-scroll/fmdemgjiipojpgemeljnbaabjeinicba" title="Download for Microsoft Edge"><img src="https://raw.githubusercontent.com/sixcious/assets/main/vendor/edge.png" height="64" alt="Microsoft Edge, Icon: By Source, Fair use, https://en.wikipedia.org/w/index.php?curid=62848768"></a>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<a href="https://addons.mozilla.org/firefox/addon/infy-scroll/" title="Download for Mozilla Firefox"><img src="https://raw.githubusercontent.com/sixcious/assets/main/vendor/firefox.svg?sanitize=true" height="64" alt="Mozilla Firefox"></a>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;

<br><br>
<img src="https://raw.githubusercontent.com/sixcious/assets/main/repository/infy-scroll/infy.png" height="600" alt="Infy" title="Infy" align="left">
<br><br>

## Important Note
Infy contains some experimental ideas and features. This means it might contain a few bugs and it might not work on every website you try it on! But I really want you to be 100% happy with Infy, so if something isn't working right, or if there's a feature you think is missing, please open an issue on GitHub and give me a chance to fix it before leaving a low rating/review, and I promise I will.

## About
Infy Scroll can let you add customized infinite scrolling to websites and can auto-load the next page. It's also compatible with the AutoPagerize Database, which means it supports thousands of websites automatically. Infy supports 4 different actions and 6 different append modes so you can customize each site's infinite scrolling to how you want it to be. Infy understands both CSS Selector and XPath expressions for finding next links, and it features an Element Picker that can generate them for you, similar to the original AutoPager. It can also increment URLs and perform special actions, like clicking "Load More" buttons. You can save your settings for each URL and Infy will auto-activate the next time you visit them.

## Features
- 4 Actions: Next Link, Click Element, Increment URL, URL List
- 6 Append Modes: Page, Iframe, Element, Media, AJAX, and None
- Support for 3 Path Types: Infy understands CSS Selectors, XPath expressions, and JS Paths, and can auto-detect what type of path you are entering, or can be set to a fixed path type by toggling the label (SE/XP/JS)
- Element Picker (Powered by ElemPick): Pick an element on the page and generate its Selector or XPath expression automatically or use the EP's buttons to traverse the DOM in any direction (May not work on complex websites)
- Auto Detect (an innovative feature): Let Infy's algorithm try to detect the next link, page element, and click elements for you (May not work well on complex websites)
- Auto Mode: Automatically append pages, or use Slideshow Mode (supports Pause and Repeat)
- AJAX Support: Infy features two unique and innovative AJAX append modes: Iframe and Native
- SPA Support: Infy supports the Navigation API to detect navigation events so you don't have to refresh the page as often
- Save URLs: Infy can save custom site-specific settings and then auto-activate on your favorite URLs
- Database Support: Infy supports the AutoPagerize and InfyScroll Databases allowing it to support thousands of websites for you automatically
- Custom Scripts: Infy has custom scripts for a few popular websites (such as Google Search) that will try to fix missing image thumbnails
- Advanced Features: Fix lazy loading or use the Element Iframe mode to fix missing images
- Scripts and Styles Features: Add Custom CSS and more
- User Interface: A simple UI made with Material Design and Lit

## Introducing AJAX
Since releasing Infy Scroll in August 2020, if you were to ask me what is the one feature I was working my hardest to implement — it's always been an append mode for [AJAX websites](https://developer.mozilla.org/docs/Glossary/AJAX). After two years of on and off development, I'm really proud to offer this [completely new and innovative append mode](https://github.com/sixcious/infy-scroll/wiki/AJAX) in Version 0.8, The Eightfinity Edition. AJAX comes in two versions: Iframe and Native. AJAX is mostly in the proof of concept stage right now, but does work on many sites, including Pixiv.

#### AJAX Demo (Pixiv)
<img src="https://raw.githubusercontent.com/sixcious/infy-scroll/main/assets/ajax.gif">

*The AJAX Native append mode working on Pixiv*

##### Example Settings
````
{
  "action": "click",
  "append": "ajax",
  "clickElement": "//nav/button[@aria-current='true']/following-sibling::a[not(@hidden)]",
  "loadElement": "//section//div/ul//figure",
  "pageElement": "//section/div/ul | //section/div/div/ul | //section/div/div/div/ul",
  "spaf": "^https://www\\.pixiv\\.net",
  "url": "^https://www\\.pixiv\\.net/"
}
````
*You can copy and paste these settings using the Add Save feature in the Options. (Tested on December 22, 2022.)*

## SPA Support
[SPAs (Single-page Applications)](https://developer.mozilla.org/docs/Glossary/SPA) are tricky to deal with because they update their page content dynamically, and sometimes don't even update the address bar. However, Infy now supports the [Navigation API](https://developer.mozilla.org/docs/Web/API/Navigation_API) (Chrome/Edge 102+ Only) to detect browser navigations and it can also watch for changes on the page and auto-activate and auto-deactivate itself if the website changes its content dynamically. It even works here on GitHub and on Pixiv. (If you're on Firefox, you can check the Late Activation setting in the UI Window's Scripts dialog and save the URL.) No more refreshing the page!

## Documentation
- [Help Guide](https://github.com/sixcious/infy-scroll/wiki)
- [Version History](https://github.com/sixcious/infy-scroll/wiki/Version-History)
- [Future Roadmap](https://github.com/sixcious/infy-scroll/wiki/Roadmap)

## FAQ
#### Can you help me make it work with a specific website?
I really wish I could! Please see [this post](https://github.com/sixcious/infy-scroll/issues/50) for a potential solution.

#### Why can't Infy Scroll execute custom scripts?
Unfortunately, because browsers strongly discourage this from a security standpoint (especially now that Manifest V3 is out!). Please  feel free to read the [Scripts and Styles](https://github.com/sixcious/infy-scroll/wiki/Scripts-and-Styles) section for more information and a potential solution.

#### What is the minimum browser version (and why is it to so high)?
Infy currently requires Chrome/Edge `120` and Firefox `128` and higher to run. I usually update the minimum browser version every time I do a release so I can use the latest and greatest ECMAScript features without worry. If your browser doesn't support Infy, I'm afraid you'll have to use another app/extension (sorry!).

#### Why is the production version's source code minified?
I use [Terser](https://github.com/terser/terser) to minify the source code for production releases that I upload to your browser's web store. I mainly do this because I write a lot of comments and `console.log()` statements for debugging and because it cuts down the file size significantly. That said, you can always view a "Pretty Print" of the source code by using a [CRX Viewer](https://robwu.nl/crxviewer/) to inspect it before installing it.

## Permissions Justification
- `Read and change all your data on the websites you visit` - Infy needs to request this permission so that its content script can auto-activate on any Saved URL or Database URL you want it to.

## Privacy Policy
Infy Scroll does *not* track you. It does *not* use analytic services. It does *not* collect or transmit any data from your device or computer. All your data is stored locally on your device. Your data is *your* data.

## Contributing
Thanks for considering to contribute! I'm currently not setup to accept PRs just yet, but you can [open an issue](https://github.com/sixcious/infy-scroll/issues) and we can discuss your idea or change.

## License
<a href="https://github.com/sixcious/infy-scroll/blob/main/LICENSE">View License</a>  

## Copyright
Infy Scroll  
Copyright &copy; 2015-2020 <a href="https://github.com/sixcious" target="_blank">Roy Six</a>  
Character Design and Artwork Copyright &copy; 2020 <a href="https://twitter.com/thejoyfool" target="_blank">Joyfool</a>
