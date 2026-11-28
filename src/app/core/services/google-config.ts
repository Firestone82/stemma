/**
 * The Google Cloud project Stemma uses to open and save trees in Google Drive. While the client ID is empty, the
 * Google Drive items (on the start page and in the File menu) show the steps to set one up instead of Google's
 * sign-in. None of these values is a secret: they end up in the page anyway, and Google only accepts them from the
 * origins listed for the client and the key.
 *
 * To fill them in (see README, "Google Drive"):
 *
 *   1. In the Google Cloud console, create a project and enable the "Google Drive API" and the "Google Picker API".
 *   2. Under Google Auth Platform, set up the consent screen (External) with the scope `.../auth/drive.file`, and add
 *      yourself (and anyone else who will use it) as a test user, or publish the app.
 *   3. Create an OAuth client ID of type "Web application". Under "Authorised JavaScript origins" add
 *      `http://localhost:4200` and `https://firestone82.github.io`.
 *   4. Optional, for the Google Picker (opening trees shared with you, saving into a folder of your choice): create an
 *      API key restricted to the Google Picker API and to the same websites.
 */
const CLIENT_ID = '422957047741-f7mbdrgi6g3vtsnkmvu2tmla67pmoks7.apps.googleusercontent.com';

export const GOOGLE_CONFIG = {
  /** OAuth client ID, "….apps.googleusercontent.com". */
  clientId: CLIENT_ID,
  /** API key for the Google Picker. Without it Stemma lists only the trees it saved and saves to the top folder. */
  apiKey: '',
  /** The project number (the client ID starts with it), so files picked in the Picker can be opened with `drive.file`. */
  appId: CLIENT_ID.split('-')[0],
};
