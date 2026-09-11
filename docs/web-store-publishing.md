# Chrome Web Store automatic publishing

Pushing to `main` runs `.github/workflows/publish-chrome-web-store.yml`. The workflow builds the extension, assigns a unique CI release version, uploads the ZIP with Chrome Web Store API v2, and submits it for review. After approval, the revision is published automatically with the listing's existing visibility settings.

## One-time setup

1. Create or select a Google Cloud project and enable **Chrome Web Store API**.
2. Create a service account. It does not need a project-level role for Web Store access.
3. In Chrome Web Store Developer Dashboard, open **Account** and add the service account email. A publisher can currently have one service account.
4. Allow the service account to mint an access token by granting it `Service Account Token Creator` on itself.

   ```bash
   gcloud iam service-accounts add-iam-policy-binding SERVICE_ACCOUNT_EMAIL \
     --project=PROJECT_ID \
     --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
     --role="roles/iam.serviceAccountTokenCreator"
   ```

5. Create a JSON key for the service account.
6. In the GitHub repository, create the `chrome-web-store` environment and add these environment secrets:

   | Secret | Value |
   | --- | --- |
   | `CWS_SERVICE_ACCOUNT_JSON` | Entire service-account JSON key, preferably minified to one line |
   | `CWS_SERVICE_ACCOUNT_EMAIL` | Service account email (`...@....iam.gserviceaccount.com`) |
   | `CWS_PUBLISHER_ID` | Publisher ID from Developer Dashboard → Account |
   | `CWS_EXTENSION_ID` | ID of the existing Chrome Web Store item |

7. Ensure the Web Store item's Store listing and Privacy sections are complete. If its visibility was changed manually, publish that visibility change once in the dashboard before using the API.

The v2 API updates an existing item; the first item and its listing must be created manually. GitHub also provides a **Run workflow** button for retrying the process without another commit.

If a revision is already under review, the Web Store rejects another submission. The workflow does not cancel an active review automatically; wait for that review to finish before retrying.

## Release versions

Chrome Web Store rejects a package unless its manifest version is higher than the current version. CI rewrites only the packaged `dist/manifest.json` to `YEAR.MONTH.DAY.SERIAL`, while `version_name` keeps the source version and short commit SHA visible. The source `manifest.json` is not modified.

Do not commit the service-account key. Rotate it immediately if it is exposed.
