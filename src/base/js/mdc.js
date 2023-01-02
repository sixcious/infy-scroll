/**
 * Infy Scroll
 * @copyright (c) 2020 Roy Six
 * @license https://github.com/sixcious/infy-scroll/blob/main/LICENSE
 */

/**
 * MDC is a global object that contains all the Material Design Components that are being used.
 * Each component is stored in a Map with its DOM ID as the key and the component as the value.
 */
const MDC = {

  buttons: new Map([].map.call(document.querySelectorAll('.mdc-button'), function (el) {
    return [el.id, new mdc.ripple.MDCRipple(el)];
  })),

  // cards: new Map([].map.call(document.querySelectorAll('.mdc-card__primary-action'), function (el) {
  //   return [el.id, new mdc.ripple.MDCRipple(el)];
  // })),

  checkboxes: new Map([].map.call(document.querySelectorAll('.mdc-checkbox'), function (el) {
    return [el.id, new mdc.checkbox.MDCCheckbox(el)];
  })),

  chipsets: new Map([].map.call(document.querySelectorAll('.mdc-chip-set'), function (el) {
    return [el.id, new mdc.chips.MDCChipSet(el)];
  })),

  chips: new Map([].map.call(document.querySelectorAll('.mdc-chip'), function (el) {
    return [el.id, new mdc.chips.MDCChip(el)];
  })),

  dialogs: new Map([].map.call(document.querySelectorAll('.mdc-dialog'), function (el) {
    return [el.id, new mdc.dialog.MDCDialog(el)];
  })),

  drawers: new Map([].map.call(document.querySelectorAll('.mdc-drawer'), function (el) {
    return [el.id, new mdc.drawer.MDCDrawer(el)];
  })),

  fabs: new Map([].map.call(document.querySelectorAll('.mdc-fab'), function (el) {
    return [el.id, new mdc.ripple.MDCRipple(el)];
  })),

  formFields: new Map([].map.call(document.querySelectorAll('.mdc-form-field'), function (el) {
    return [el.id, new mdc.formField.MDCFormField(el)];
  })),

  linearProgresses: new Map([].map.call(document.querySelectorAll('.mdc-linear-progress'), function (el) {
    return [el.id, new mdc.linearProgress.MDCLinearProgress(el)];
  })),

  lists: new Map([].map.call(document.querySelectorAll('.mdc-list'), function (el) {
    // Add lists with ripple for each list item
    const list = new mdc.list.MDCList(el);
    list.listElements.map((listItemEl) => new mdc.ripple.MDCRipple(listItemEl));
    list.singleSelection = true;
    return [el.id, list];
  })),

  radios: new Map([].map.call(document.querySelectorAll('.mdc-radio'), function (el) {
    return [el.id, new mdc.radio.MDCRadio(el)];
  })),

  selects: new Map([].map.call(document.querySelectorAll('.mdc-select'), function (el) {
    return [el.id, new mdc.select.MDCSelect(el)];
  })),

  snackbars: new Map([].map.call(document.querySelectorAll('.mdc-snackbar'), function (el) {
    return [el.id, new mdc.snackbar.MDCSnackbar(el)];
  })),

  switches: new Map([].map.call(document.querySelectorAll('.mdc-switch'), function (el) {
    return [el.id, new mdc.switchControl.MDCSwitch(el)];
  })),

  tabBars: new Map([].map.call(document.querySelectorAll('.mdc-tab-bar'), function (el) {
    return [el.id, new mdc.tabBar.MDCTabBar(el)];
  })),

  tables: new Map([].map.call(document.querySelectorAll('.mdc-data-table'), function (el) {
    return [el.id, new mdc.dataTable.MDCDataTable(el)];
  })),

  textFields: new Map([].map.call(document.querySelectorAll('.mdc-text-field'), function (el) {
    return [el.id, new mdc.textField.MDCTextField(el)];
  })),

  // TODO: Migrate to MDC Tooltips at some point when we upgrade the MDC version?
  // tooltips: new Map([].map.call(document.querySelectorAll('.mdc-tooltip'), function (el) {
  //   return [el.id, new mdc.ripple.MDCRipple(el)];
  // })),

  /**
   * Performs a layout for each applicable MDC object. And MDC object needs to run layout each time it is displayed or
   * is shown again after being hidden (e.g. display: none).
   *
   * @public
   */
  layout: function () {
    MDC.selects.forEach(el => el.layout());
    MDC.textFields.forEach(el => {
      // If the text field input is empty (no value), remove the float-above from the label so it doesn't look broken
      if (el.input_ && el.label_?.root_) {
        if (!el.input_.value) {
          el.label_.root_.classList.remove("mdc-floating-label--float-above");
        } else {
          el.label_.root_.classList.add("mdc-floating-label--float-above");
        }
      }
      el.layout();
    });
  },

  /**
   * Opens the MDC Snackbar.
   *
   * @param labelText the text the snackbar should display
   * @param timeoutMs the milliseconds the snackbar should be active for, the minimum is 4000 ms and -1 is until closed
   * @public
   */
  openSnackbar: function(labelText, timeoutMs = 5000) {
    const snackbar = MDC.snackbars.get("mdc-snackbar");
    // Can't make snackbar timeoutMs lower than 4000?
    snackbar.timeoutMs = timeoutMs;
    // Since we're reusing the same snackbar, we need to reset the labelText before we open it, then set it after we open
    snackbar.labelText = "";
    snackbar.open();
    snackbar.labelText = labelText;
  }

};