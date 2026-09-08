/**
 * Truck Route Planner - consent banner and preferences dialog.
 *
 * Both builds share this. Accepting and rejecting are one click each and use
 * the same visual weight, which is what the EDPB and the Spanish AEPD ask for:
 * refusing must be no harder than agreeing.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var consent = TRP.consent;
  var esc = TRP.util.escapeHtml;

  function t(key, params) { return TRP.i18n.t(key, params); }

  var banner = null;
  var dialog = null;
  var lastFocus = null;

  /* ---------------------------------------------------------------- banner */

  function bannerHtml() {
    return '<div class="consent__inner">' +
      '<div class="consent__text">' +
      '<h2 class="consent__title" data-role="title"></h2>' +
      '<p class="consent__body" data-role="intro"></p>' +
      '<a class="consent__link" href="PRIVACY.html" data-role="policy"></a>' +
      '</div>' +
      /*
       * Reject and accept must be equally easy to reach. EDPB guidance, and
       * the AEPD in particular, treat a plain-text "reject" beside a filled
       * "accept" as a dark pattern that invalidates the consent, so the two
       * are the same size and the same button family; only "settings" is
       * quieter, because it opens a dialog rather than deciding anything.
       */
      '<div class="consent__actions">' +
      '<button type="button" class="btn btn--ghost consent__settings" data-action="settings"></button>' +
      '<button type="button" class="btn btn--accent" data-action="reject"></button>' +
      '<button type="button" class="btn btn--primary" data-action="accept"></button>' +
      '</div></div>';
  }

  function fillBanner() {
    if (!banner) return;
    banner.querySelector('[data-role="title"]').textContent = t('cookie.title');
    banner.querySelector('[data-role="intro"]').textContent = t('cookie.intro');
    banner.querySelector('[data-role="policy"]').textContent = t('cookie.moreInfo');
    banner.querySelector('[data-action="reject"]').textContent = t('cookie.rejectAll');
    banner.querySelector('[data-action="settings"]').textContent = t('cookie.settings');
    banner.querySelector('[data-action="accept"]').textContent = t('cookie.acceptAll');
  }

  function showBanner() {
    if (banner) { banner.hidden = false; return; }
    banner = document.createElement('section');
    banner.className = 'consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', t('cookie.title'));
    banner.innerHTML = bannerHtml();
    document.body.appendChild(banner);
    fillBanner();

    banner.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action]');
      if (!button) return;
      var action = button.getAttribute('data-action');
      if (action === 'accept') { consent.acceptAll(); hideBanner(); toastSaved(); }
      else if (action === 'reject') { consent.rejectAll(); hideBanner(); toastSaved(); }
      else if (action === 'settings') { openSettings(); }
    });

    TRP.i18n.onChange(fillBanner);
  }

  function hideBanner() {
    if (banner) banner.hidden = true;
  }

  function toastSaved() {
    if (TRP.appCommon && TRP.appCommon.toast) TRP.appCommon.toast(t('cookie.saved'), 'ok');
  }

  /* ---------------------------------------------------------------- dialog */

  function categoryRow(category, locked, granted) {
    var id = 'consent-' + category;
    return '<div class="consent-cat">' +
      '<div class="consent-cat__head">' +
      '<label class="consent-cat__label" for="' + id + '">' +
      esc(t('cookie.cat.' + category)) + '</label>' +
      (locked
        ? '<span class="badge badge--secure">' + esc(t('cookie.alwaysOn')) + '</span>'
        : '<input type="checkbox" class="consent-cat__toggle" id="' + id +
          '" data-category="' + category + '"' + (granted ? ' checked' : '') + '>') +
      '</div>' +
      '<p class="consent-cat__desc">' + esc(t('cookie.cat.' + category + 'Desc')) + '</p>' +
      '</div>';
  }

  function dialogHtml() {
    var state = consent.state();
    var rows = categoryRow('necessary', true, true) +
      consent.offered().map(function (c) {
        return categoryRow(c, false, state[c]);
      }).join('');

    var decided = consent.decidedAt();
    var status = decided
      ? t('cookie.decidedOn', { date: TRP.util.formatDateTime(decided) })
      : t('cookie.noChoice');

    return '<div class="consent-dialog__panel" role="document">' +
      '<header class="consent-dialog__head">' +
      '<h2>' + esc(t('cookie.settingsTitle')) + '</h2>' +
      '<button type="button" class="icon-btn" data-action="close" aria-label="' +
      esc(t('cookie.close')) + '">&#10005;</button>' +
      '</header>' +
      '<p class="consent-dialog__intro">' + esc(t('cookie.settingsIntro')) + '</p>' +
      '<div class="consent-dialog__body">' + rows + '</div>' +
      '<p class="consent-dialog__status">' + esc(status) + '</p>' +
      '<footer class="consent-dialog__foot">' +
      '<a class="consent__link" href="PRIVACY.html">' + esc(t('cookie.moreInfo')) + '</a>' +
      '<span class="consent-dialog__spacer"></span>' +
      (decided ? '<button type="button" class="btn btn--ghost" data-action="withdraw">' +
        esc(t('cookie.withdraw')) + '</button>' : '') +
      '<button type="button" class="btn btn--ghost" data-action="reject">' +
      esc(t('cookie.rejectAll')) + '</button>' +
      '<button type="button" class="btn btn--primary" data-action="save">' +
      esc(t('cookie.save')) + '</button>' +
      '</footer></div>';
  }

  function closeSettings() {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
    document.removeEventListener('keydown', onKeydown);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') closeSettings();
  }

  function readToggles() {
    var choices = {};
    dialog.querySelectorAll('.consent-cat__toggle').forEach(function (input) {
      choices[input.getAttribute('data-category')] = input.checked;
    });
    return choices;
  }

  /** Open the preferences dialog. Also reachable from the footer link. */
  function openSettings() {
    closeSettings();
    lastFocus = document.activeElement;
    dialog = document.createElement('div');
    dialog.className = 'consent-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = dialogHtml();
    document.body.appendChild(dialog);

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) { closeSettings(); return; }
      var button = event.target.closest('[data-action]');
      if (!button) return;
      var action = button.getAttribute('data-action');
      if (action === 'close') { closeSettings(); return; }
      if (action === 'save') { consent.save(readToggles()); }
      else if (action === 'reject') { consent.rejectAll(); }
      else if (action === 'withdraw') {
        consent.withdraw();
        closeSettings();
        if (TRP.appCommon && TRP.appCommon.toast) {
          TRP.appCommon.toast(t('cookie.withdrawn'), 'info');
        }
        showBanner();
        return;
      }
      closeSettings();
      hideBanner();
      toastSaved();
    });

    document.addEventListener('keydown', onKeydown);
    var first = dialog.querySelector('button, input');
    if (first) first.focus();
  }

  /* ------------------------------------------------------------------ init */

  /**
   * Show the banner when there is no valid decision, and wire every
   * `[data-action="privacy-settings"]` element to the dialog.
   */
  function init() {
    document.querySelectorAll('[data-action="privacy-settings"]').forEach(function (el) {
      el.addEventListener('click', function (event) {
        event.preventDefault();
        openSettings();
      });
    });
    if (consent.needsPrompt()) showBanner();
  }

  TRP.consentUI = {
    init: init,
    openSettings: openSettings,
    closeSettings: closeSettings,
    showBanner: showBanner,
    hideBanner: hideBanner
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
