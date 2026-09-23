# Railway Web Deployment

The Expo mobile app also exports as a browser presentation for stakeholders.
Android and iOS remain supported from the same codebase.

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
