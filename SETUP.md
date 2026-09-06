# LifeForge AI — Fresh Machine Developer Setup Guide

This guide walks you through setting up LifeForge AI on a clean developer machine from scratch.

---

## 1. Prerequisites

Ensure your environment satisfies the following minimum requirements:

- **Operating System**: Windows 10/11, macOS (Apple Silicon or Intel), or Linux (Ubuntu 22.04+ recommended).
- **Node.js**: `v20.x` or `v22.x` (LTS recommended, minimum `>=20.0.0`).
- **Package Manager**: `npm` (v10+).
- **Git**: Git version control installed.
- **Browser**: Google Chrome (recommended for full Web Audio API and WebSocket support).

Verify versions:
```bash
node -v
npm -v
git --version
```

---

## 2. Repository Setup

Clone the repository and install project dependencies:

```bash
# Clone the repository
git clone https://github.com/Shivakumarsullagaddi/LifeForge-AI.git
cd LifeForge-AI

# Install exact dependencies from package-lock.json
npm install
```

---

## 3. Gemini API Setup

LifeForge AI requires a Google Gemini API key to power real-time voice streaming (`gemini-3.1-flash-live-preview`) and deep reasoning/extraction (`gemini-3.8-flash`).

1. Navigate to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click **Get API Key** and generate a new key for your project.
4. Keep this key handy for the `GEMINI_API_KEY` environment variable.

---

## 4. Firebase Project Setup

### 4.1 Create Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a new project (e.g., `lifeforge-ai-dev`).
3. Disable or enable Google Analytics according to preference.

### 4.2 Enable Authentication
1. In the Firebase console left navigation, click **Build > Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab:
   - Enable **Google** sign-in provider.
   - Set the support email for the project.
   - Under **Authorized domains**, ensure `localhost` is listed.

### 4.3 Create Firestore Database
1. Go to **Build > Firestore Database**.
2. Click **Create Database**.
3. Select your preferred database location (e.g., `asia-south1` or `us-central1`).
4. Start in **Production Mode**.

### 4.4 Deploy Firestore Security Rules
Copy the contents of [firestore.rules](file:///d:/hack2skill/apac_cohort_3/LifeForge-AI/firestore.rules) into the Firebase Console Rules editor, or deploy via Firebase CLI:

```bash
# Install Firebase CLI globally if not present
npm install -g firebase-tools

# Log in to your Firebase account
firebase login

# Deploy rules directly
firebase deploy --only firestore:rules
```

The canonical security rules enforce strict ownership:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
    function isAuthenticated() {
      return request.auth != null && request.auth.uid != null;
    }
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    match /users/{userId} {
      allow read, write: if isOwner(userId);
      match /{subcollection=**} {
        allow read, write: if isOwner(userId);
      }
    }
  }
}
```

### 4.5 Enable Firebase Cloud Storage
1. Go to **Build > Storage**.
2. Click **Get Started** and configure your storage bucket in production mode.
3. Note your bucket name (e.g., `your-project.firebasestorage.app`).

### 4.6 Register Web Application
1. Click the **Project Settings** (gear icon) > **General**.
2. Scroll down to **Your apps** and click the **Web** icon (`</>`).
3. Register the app (e.g., `LifeForge Web`).
4. Note down the `firebaseConfig` credentials object.

---

## 5. Google Calendar API & OAuth Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/) for the same GCP project linked to your Firebase project.
2. Go to **APIs & Services > Library**.
3. Search for **Google Calendar API** and click **Enable**.
4. Go to **APIs & Services > OAuth consent screen**:
   - Choose **External** user type.
   - Fill in Application Name (`LifeForge AI`), User support email, and Developer contact information.
   - Add scopes: `.../auth/calendar.events` and `.../auth/calendar.events.readonly`.
   - Add test users (your personal email).
5. Go to **APIs & Services > Credentials**:
   - Click **Create Credentials > OAuth Client ID**.
   - Application Type: **Web application**.
   - Name: `LifeForge Calendar OAuth`.
   - **Authorized JavaScript origins**:
     - `http://localhost:3000`
   - **Authorized redirect URIs**:
     - `http://localhost:3000`
   - Click **Create** and copy your **Client ID**.

---

## 6. Environment Variables Configuration

Create your `.env.local` by copying `.env.example`:

```bash
cp .env.example .env.local
```

Populate the file with your actual keys. **Never commit `.env.local` to version control.**

### 6.1 Server-Only Secrets
*These variables are accessed strictly on the server and are never bundled into client code.*

```env
# Google Gemini API Key for Live Voice and 3.8 Flash Reasoning
GEMINI_API_KEY=AIzaSy...

# Base application URL
APP_URL=http://localhost:3000

# Node execution environment
NODE_ENV=development

# Server port (default: 3000)
PORT=3000
```

### 6.2 Browser-Safe Client Variables
*These variables are prefixed with `NEXT_PUBLIC_` and are safely compiled into client bundles for Firebase and OAuth initialization.*

```env
# Firebase Public Web Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456

# Google Calendar Client-Side OAuth Client ID
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
```

---

## 7. Running the Application

LifeForge AI uses a custom Node.js server ([server.ts](file:///d:/hack2skill/apac_cohort_3/LifeForge-AI/server.ts)) that binds Next.js App Router HTTP handlers alongside a dedicated WebSocket server on the same port.

### Local Development Mode
Runs the application with live TypeScript reloading and automatic environment loading:
```bash
npm run dev
```

The console will indicate:
```
> tsx --env-file=.env.local server.ts
Ready on http://localhost:3000
WebSocket server listening on port 3000
```

Open [http://localhost:3000](http://localhost:3000) in Google Chrome.

### Production Build & Execution
To validate a clean production bundle and start the optimized server:

```bash
# Build Next.js production bundle
npm run build

# Start custom production server
npm run start
```

---

## 8. Playwright Automated Testing Setup

LifeForge includes comprehensive browser automation tests that verify live coach audio flows, resume parsing, Google Calendar syncing, and timer persistence.

### 8.1 Install Playwright Browsers
```bash
npx playwright install chrome chromium
```

### 8.2 Execute Test Suites
```bash
# Run all end-to-end tests
npm run test:e2e

# Run with interactive Playwright UI
npm run test:e2e:ui

# Run tests in headed browser mode
npm run test:e2e:headed

# Run unit / integration test suite
npm run test:unit
```

---

## 9. Troubleshooting

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **WebSocket connection failed** | Server not started with `server.ts` or port blocked | Ensure you run `npm run dev`, which runs `tsx server.ts`. Do NOT run `next dev`. |
| **Missing microphone audio in Live Coach** | Browser permissions blocked or non-HTTPS/localhost origin | Grant microphone access in Chrome settings; verify origin is strictly `http://localhost:3000`. |
| **Firestore permission-denied** | User not logged in or security rules misconfigured | Ensure you are signed in via Google Sign-In and [firestore.rules](file:///d:/hack2skill/apac_cohort_3/LifeForge-AI/firestore.rules) has been applied. |
| **Google Calendar status ERROR** | Missing OAuth client ID or origin mismatch | Ensure `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is set and `http://localhost:3000` is added to Authorized JavaScript origins. |
| **Resume parsing failed** | `GEMINI_API_KEY` missing or file exceeds 10MB | Verify `GEMINI_API_KEY` in `.env.local` and upload a standard PDF or DOCX file under 10MB. |
| **Admin verification failure** | Missing Firebase Admin credentials in dev | Run `npm run firebase:verify` to inspect local Admin SDK configuration. |
