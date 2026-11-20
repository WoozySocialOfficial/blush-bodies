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
4. Add the two variables from `.env.example` using the official Supabase
   project's URL and publishable key. Never add a database password or a
   service-role key to the app or Railway.
5. After the first deployment succeeds, open **Settings > Networking** and
   generate a public domain.

Railway runs:

```text
npm run build:web
npm run start:web
```

Required Railway variables:

```text
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

## Supabase authentication redirects

In **Supabase > Authentication > URL Configuration**:

1. Set the Site URL to the stable Railway HTTPS domain.
2. Add the Railway domain with `/**` to the redirect allow list.
3. Add `blushbodies://auth` for confirmation and password-reset links opened
   from the installed mobile app.

Do not use `localhost` as the production Site URL. Localhost is only suitable
for browser testing on the same computer.

## Local Production Check

```powershell
npm run build:web
npx serve -s dist -l 4173
```

Open `http://localhost:4173`.

## Shared Data

Accounts and shared workspace state use Supabase when the two public variables
are configured. Mobile credentials are persisted with Expo SecureStore. Run the
database migration in `supabase/migrations` before testing a new Supabase
project, then confirm that two separate accounts in the same workspace can see
the same schedule and plans.
