# Railway Web Deployment

The Expo mobile app also exports as a browser presentation for stakeholders.
Android and iOS remain supported from the same codebase.

## SDK and local setup

This project uses Expo SDK 58, React Native 0.88, and React 19.3. Use Node.js
22.13 or newer on the 22 line, 24.3 or newer on the 24 line, or Node.js 26.
Install dependencies with `npm ci`.

`npm install` and `npm ci` apply the patch in
`patches/@expo+metro-file-map+58.0.5.patch`. On Windows, OneDrive can report
regular files as symbolic links in directory listings, preventing Metro from
resolving installed dependencies. The patch checks those entries with `lstat`
in both Metro crawlers. Review and remove it when upgrading the file-map
package to a version that handles these files correctly. Keep install scripts
enabled so the patch is applied.

Start locally with `npm run web`, or use `npm start -- --tunnel` for a phone.
SDK 58's default tunnel requires an Expo account; sign in with `npx expo login`.
Use an SDK 58-compatible Expo Go app or rebuild your development client after
upgrading.

## Railway

1. Push this project to a GitHub repository.
2. In Railway, create a project and choose **Deploy from GitHub repo**.
3. Select this repository. Railway reads `railway.json` automatically.
4. After the first deployment succeeds, open **Settings > Networking** and
   generate a public domain.

Railway runs:

```text
npm run build:web
npm run start:web
```

No environment variables are required for the current local prototype.

## Local Production Check

```powershell
npm run build:web
npx serve -s dist -l 4173
```

Open `http://localhost:4173`.

## Prototype Data

Mobile credentials use Expo SecureStore. The browser demonstration stores only
salted password hashes and app data in that browser's local storage. Data is not
shared between devices because no production backend is connected yet.
