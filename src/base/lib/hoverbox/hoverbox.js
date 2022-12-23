/**
 * Copyright (c) 2019 Kevin Li
 * Modifications by Roy Six
 * @preserve
 */
(function () {

    class HoverBox {

        /**
         * Gets this implementation's specific background color.
         *
         * Default: "rgba(153, 235, 255, 0.5)"
         * Infy Scroll: "rgba(97, 84, 146, 0.4)"
         * URL Incrementer: "rgba(51, 51, 91, 0.4)"
         * Downloadyze: "rgba(0, 0, 0, 0.4)"
         * @type {string} background the specific HoverBox background (the var--mdc-theme color in rgba format)
         */
        getBackground() {
            return "rgba(97, 84, 146, 0.4)";
        }

        constructor(options) {
            // MUST create hover box first before applying options
            this.hoverBox = document.createElement("div");
            // Note: Need the display: block because some sites set divs to display: none! e.g. https://capcomprotour.com/standings/
            this.hoverBox.style.setProperty("display", "block", "important");
            this.hoverBox.style.setProperty("position", "absolute", "important");
            this.hoverBox.style.setProperty("pointer-events", "none", "important");
            // Add max z-index to the hover box to ensure it always is visible over DOM elements with a z-index > 0
            this.hoverBox.style.setProperty("z-index", "2147483647", "important");
            const defaultOptions = {
                container: document.body,
                selectors: "*", // default to pick all elements
                background: this.getBackground(),
                borderWidth: 0, // 0 is best default to avoid jarring experience with horizontal scrollbars
                transition: "all 150ms ease", // set to "" (empty string) to disable
                ignoreElements: [document.body],
                action: {},
            }
            const mergedOptions = {
                ...defaultOptions,
                ...options
            };
            Object.keys(mergedOptions).forEach((key) => {
                this[key] = mergedOptions[key];
            });

            this._detectMouseMove = (e) => {
                this._previousEvent = e;
                let target = e.target;
                // console.log("detectMouseMove() - TCL: HoverBox -> this._moveHoverBox -> target", target)
                if (this.ignoreElements.indexOf(target) === -1 && target.matches(this.selectors) &&
                    this.container.contains(target) ||
                    target === this.hoverBox) { // is NOT ignored elements
                    // console.log("detectMouseMove() - TCL: target", target);
                    if (target === this.hoverBox) {
                        // the truly hovered element behind the added hover box
                        // Note: We wrap this in a try/catch due to some elements x and y coordinates being funky, e.g.:
                        // TypeError: Failed to execute 'elementsFromPoint' on 'Document': The provided double value is non-finite.
                        let hoveredElement;
                        try {
                            hoveredElement = document.elementsFromPoint(e.clientX, e.clientY)[1];
                        } catch (e) {
                            console.log("detectMouseMove() - error setting hoveredElement using document.elementsFromPoint. Error:");
                            console.log(e);
                            return;
                        }
                        console.log("detectMouseMove() - screenX: " + e.screenX + ", screenY: " + e.screenY + ", clientX: " + e.clientX + ", clientY: " + e.clientY);
                        console.log("detectMouseMove() - TCL: hoveredElement", hoveredElement);
                        if (this._previousTarget === hoveredElement) {
                            // avoid repeated calculation and rendering
                            return;
                        } else {
                            target = hoveredElement;
                        }
                    } else {
                        this._previousTarget = target;
                    }
                    const targetOffset = target.getBoundingClientRect();
                    const targetHeight = targetOffset.height;
                    const targetWidth = targetOffset.width;

                    this.hoverBox.style.setProperty("width", targetWidth + this.borderWidth * 2 + "px", "important");
                    this.hoverBox.style.setProperty("height", targetHeight + this.borderWidth * 2 + "px", "important");
                    // need scrollX and scrollY to account for scrolling
                    this.hoverBox.style.setProperty("top", targetOffset.top + window.scrollY - this.borderWidth + "px", "important");
                    this.hoverBox.style.setProperty("left", targetOffset.left + window.scrollX - this.borderWidth + "px", "important");

                    if (this._triggered && this.action.callback) {
                        this.action.callback(target);
                        this._triggered = false;
                    }
                } else {
                    // console.log("detectMouseMove() - hiding hover box...");
                    this.hoverBox.style.setProperty("width", "0", "important");
                }
            };
        }

        get container() {
            return this._container;
        }

        set container(value) {
            if (value instanceof HTMLElement) {
                this._container = value;
                this.container.appendChild(this.hoverBox);
            } else {
                throw new Error("Please specify an HTMLElement as container!");
            }
        }

        get background() {
            return this._background;
        }

        set background(value) {
            this._background = value;
            this.hoverBox.style.setProperty("background", this.background, "important");
        }

        get transition() {
            return this._transition;
        }

        set transition(value) {
            this._transition = value;
            this.hoverBox.style.setProperty("transition", this.transition, "important");
        }

        get borderWidth() {
            return this._borderWidth;
        }

        set borderWidth(value) {
            this._borderWidth = value;
            this._redetectMouseMove();
        }

        get selectors() {
            return this._selectors;
        }

        set selectors(value) {
            this._selectors = value;
            this._redetectMouseMove();
        }

        get ignoreElements() {
            return this._ignoreElements;
        }

        set ignoreElements(value) {
            this._ignoreElements = value;
            this._redetectMouseMove();
        }

        get action() {
            return this._action;
        }

        set action(value) {
            if (value instanceof Object) {
                if (typeof value.trigger === "string" &&
                    typeof value.callback === "function") {
                    if (this._triggerListener) {
                        document.removeEventListener(this.action.trigger, this._triggerListener);
                        this._triggered = false;
                    }
                    this._action = value;

                    this._triggerListener = () => {
                        this._triggered = true;
                        this._redetectMouseMove();
                    }
                    document.addEventListener(this.action.trigger, this._triggerListener);
                } else if (value.trigger !== undefined || value.callback !== undefined){ // allow empty action object
                    throw new Error("action must include two keys: trigger (String) and callback (function)!");
                }
            } else {
                throw new Error("action must be an object!");
            }
        }

        open() {
            document.addEventListener("mousemove", this._detectMouseMove);
        }

        close() {
            document.removeEventListener("mousemove", this._detectMouseMove);
            if (this.action) {
                document.removeEventListener(this.action.trigger, this._triggerListener);
            }
            this.hoverBox.remove();
        }

        /**
         * Highlights the element on the document page.
         *
         * @param el      {Element} the DOM element to highlight
         * @param close   {boolean} if true, closes and removes the hover box after highlighting it
         * @param timeout {number}  the specified timeout (ms) to highlight the element for before removing it
         * @private
         */
        highlightElement(el, close = false, timeout = 3000) {
            try {
                console.log("highlightElement()");
                console.log(this.hoverBox);
                if (el) {
                    this._detectMouseMove({target:el});
                }
                if (close) {
                    // Note: We need to store the reference to this.hoverBox in a variable or else we won't have it anymore by the time the timeout executes
                    const that = this;
                    setTimeout(function () {
                        that.close();
                    }, timeout);
                }
            } catch (e) {
                console.log("highlightElement() - error=")
                console.log(e);
            }
        }

        _redetectMouseMove() {
            if (this._detectMouseMove && this._previousEvent) {
                this._detectMouseMove(this._previousEvent);
            }
        }

    }

    // export module
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = HoverBox;
    } else {
        window.HoverBox = HoverBox;
    }

})();
