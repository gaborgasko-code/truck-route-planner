# Reply to App Review — Guideline 2.1, cookies (13 Oct 2026)

Apple asked, for version 2.3.0 (8): (1) is collected data shared with data
brokers, (2) is it linked with third-party data for marketing or
advertising, (3) are cookies collected for tracking when users access web
content in the app. Facts checked against js/core/ga.js, js/core/analytics.js
and js/core/consent.js.

---

Hello, and thank you for the review. Here are the answers to your questions.

1. Is the data collected by the app shared with any third-party data brokers?
No. The app does not share any data with data brokers and does not sell data.

2. Is the data collected by the app linked with third-party data for marketing or advertising purposes?
No. The app has no advertising, no advertising SDK and does not use the advertising identifier (IDFA). Nothing it collects is combined with third-party data.

3. When users access web content in the app, are cookies collected for tracking purposes by the app or service?
No. The app's screens are built with web technology but are bundled inside the app; it does not open third-party websites. The only cookies are the first-party Google Analytics cookies (_ga), and only if the user accepts the "Analytics" option in the app's privacy prompt. They are off by default and can be withdrawn at any time under Info > Privacy and cookies, which also deletes them. They are used only for aggregate usage statistics (screens viewed and route calculations). Google Analytics runs with all advertising features disabled: Google Signals off, ad personalization signals off, consent mode with ad_storage, ad_user_data and ad_personalization always denied, and IP anonymization on. The app's own statistics endpoint uses no cookies and no identifiers. Preferences (language, theme and the privacy choice) are stored only on the device.

Since no data is used for tracking as Apple defines it, the app does not request App Tracking Transparency permission, and its App Privacy details declare no tracking.

Kind regards,
Aissa Bamogo Redondo
