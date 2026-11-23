/**
 * The Google Cloud project Stemma uses to open and save trees in Google Drive. While any of these is empty, the
 * Google Drive items (on the start page and in the File menu) show these steps instead of Google's sign-in. These values are not secrets: they end up in the page anyway,
 * and Google only accepts them from the origins listed for the client.
 *
 * To fill them in (see README, "Google Drive"):
 *
 *   1. In the Google Cloud console, create a project and enable the "Google Drive API" and the "Google Picker API".
 *   2. Set up the OAuth consent screen (External) with the scope `.../auth/drive.file`, and add yourself as a test user.
 *   3. Create an OAuth client ID of type "Web application". Under "Authorised JavaScript origins" add
 *      `http://localhost:4200` and `https://firestone82.github.io`.
 *   4. Create an API key, restricted to the Google Picker API and to the same websites.
 *   5. The app ID is the project number, on the project's dashboard.
 */
export const GOOGLE_CONFIG = {
  /** OAuth client ID, "….apps.googleusercontent.com". */
  clientId: '',
  /** API key for the Google Picker. */
  apiKey: '',
  /** The project number, so files picked in the Picker can be opened with the `drive.file` scope. */
  appId: '',
};
