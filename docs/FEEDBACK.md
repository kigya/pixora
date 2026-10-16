# Automated feedback integration

The screen sends only email, message, optional personal rating, app version and a random request ID. No images, URIs, working files, logs or device identifiers. AI works offline; feedback uses the network only on explicit submission. The developer is the fixed recipient. Reply email is required.

## Free Google Apps Script setup

1. Open https://script.google.com/ in your own Google account and create a project.
2. Paste `support/apps-script/Code.gs`. If needed, display the manifest and paste `appsscript.json`.
3. Deploy → New deployment → Web app. Execute as: Me; Who has access: Anyone. Authorize email sending from your own account. No tokens/passwords are added to the APK.
4. Copy the URL in the form `https://script.google.com/macros/s/…/exec`.
5. Store the URL in local `android/feedback.properties` as `endpoint=URL`. Rebuild the release APK with the existing signing key. The client endpoint URL is public, not a secret.
6. Send your own test question from the installed app. Verify email receipt and Reply-To. Network delivery is unverified until this step succeeds.

Without a URL, submission is honestly unavailable; the app never shows a fake Sent result. Errors preserve form text. Canceling sends no email. Email/message are not stored in the working journal.

The handler fixes the recipient, validates size/fields, limits repeat email per address to ten minutes and total volume to 50/day, and checks remaining free quota. Request IDs allow retries without a second email for six hours. Public handlers can be abused; limits reduce quota consumption but are not user authentication. Sending stops at quota exhaustion; no paid tier is enabled. [Google quotas](https://developers.google.com/apps-script/guides/services/quotas).

Personal stars are not a Google Play rating and are never automatically published. Under the owner agreement, store navigation is available regardless of rating. Before publication, the link is explicitly marked as a test and requires confirmation; it must not ask users to review another app as Pixora. [Review policies](https://support.google.com/googleplay/android-developer/answer/9898684).

## Integration verification — 2026-10-09

The owner supplied a Web App URL stored only in local android/feedback.properties. A test POST returned HTTP 200, ok=true and the matching request ID; receipt and Reply-To were verified in the developer's mailbox. Submission from the installed Xiaomi form also delivered successfully without a personal rating. Private delivery IDs, reply addresses, message content and logs remain local. Mocks do not replace actual form-delivery evidence.


For 0.6, Code.gs uses Pixora. The deployed handler still delivers through the previous endpoint but uses the old Upselora subject. Replace the Apps Script source, then Deploy → Manage deployments → Edit → New version → Deploy; the existing deployment URL is retained.
