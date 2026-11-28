/**
 * The Google Cloud project Stemma uses to open and save trees in Google Drive. While the client ID is empty, the
 * Google Drive items (on the start page and in the File menu) show the steps to set one up instead of Google's
 * sign-in. The client ID is not a secret: it ends up in the page anyway, and Google only accepts it from the origins
 * listed for the client. No API key is needed.
 *
 * To fill it in (see README, "Google Drive"):
 *
 *   1. In the Google Cloud console, create a project and enable the "Google Drive API".
 *   2. Under Google Auth Platform, set up the consent screen (External) with the scope `.../auth/drive.file`, and add
 *      yourself (and anyone else who will use it) as a test user, or publish the app.
 *   3. Create an OAuth client ID of type "Web application". Under "Authorised JavaScript origins" add
 *      `http://localhost:4200` and `https://firestone82.github.io`.
 */
export const GOOGLE_CONFIG = {
  /** OAuth client ID, "….apps.googleusercontent.com". */
  clientId: '',
};
