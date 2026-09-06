# LifeForge AI — Local Setup & Deployment Guide

This guide describes how to configure, run, test, and build **LifeForge AI** locally outside Google AI Studio.

---

## 1. Prerequisites

- **Node.js**: Version `20.x` or higher (Recommended: LTS v20, v22, or v24). Verified on `v24.14.0`.
- **Package Manager**: `npm` (v10+). Verified on `11.9.0`.
- **Operating System**: macOS, Linux, or Windows.
- **Gemini API Key**: A valid Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey) with access to `gemini-3.1-flash-live-preview`, `gemini-3.8-flash`, and `gemini-embedding-2-preview`.
- **Firebase Project**: A Firebase project with Google Authentication and Cloud Firestore enabled.

---

## 2. Installation

1. Navigate to the project root directory:
   ```bash
   cd LifeForge-AI
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

---

## 3. Environment Variables Configuration

Create a `.env.local` file in the project root by copying the template:

```bash
cp .env.example .env.local
```

> **IMPORTANT**: Never commit `.env.local` to version control. Verify that `.gitignore` contains `.env*`.

Fill in the following variables in `.env.local`:

```env
# ==============================================================================
# 1. SERVER-ONLY SECRETS (Backend & Custom Server)
# ==============================================================================
# Required for Gemini 3.1 Flash Live and Gemini 3.8 Flash calls
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

# Base application URL
APP_URL=http://localhost:3000

# Runtime environment ('development' | 'production')
NODE_ENV=development

# Server port
PORT=3000

# ==============================================================================
# 2. CLIENT FIREBASE CONFIGURATION (Browser-Safe)
# ==============================================================================
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID

# ==============================================================================
# 3. GOOGLE WORKSPACE / OAUTH (Google Calendar Integration)
# ==============================================================================
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com
```

---

## 4. Firebase Setup

1. **Create Firebase Project**:
   - Go to the [Firebase Console](https://console.firebase.google.com/).
   - Click **Add project** or choose your existing Google Cloud project.

2. **Enable Authentication**:
   - Navigate to **Build** > **Authentication** > **Sign-in method**.
   - Enable the **Google** provider.
   - Configure your Project support email.

3. **Enable Cloud Firestore**:
   - Navigate to **Build** > **Firestore Database**.
   - Click **Create database** (Native mode).
   - Select your preferred Cloud region.

4. **Deploy Security Rules**:
   - In Firestore > **Rules**, paste the contents of `firestore.rules` from this repository:
   - Or deploy via Firebase CLI:
     ```bash
     firebase deploy --only firestore:rules
     ```

5. **Register Web App**:
   - In **Project Settings** > **General** > **Your apps**, click the Web icon (`</>`).
   - Copy the configuration values into `.env.local`.
   - Update `firebase-applet-config.json` with your project's matching parameters.

---

## 5. Gemini API Setup

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click **Create API key** and link to your Google Cloud project.
3. Verify that your API key has quota enabled for:
   - `gemini-3.1-flash-live-preview` (Bidirectional audio streaming WebSocket)
   - `gemini-3.8-flash` (Orchestrator and specialist reasoning)
   - `gemini-embedding-2-preview` (Vector search embeddings)
4. Set the key as `GEMINI_API_KEY` in `.env.local`.

---

## 6. Google Workspace / OAuth Setup (Google Calendar)

1. Open [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Ensure the **Google Calendar API** is enabled in **Enabled APIs & Services**.
3. Under **OAuth consent screen**, set user type to External and publish or add test users.
4. Under **Credentials** > **Create Credentials** > **OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - `http://127.0.0.1:3000`
5. Copy the Client ID into `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` in `.env.local`.

---

## 7. Development Command

Run the custom HTTP + WebSocket server in development mode:

```bash
npm run dev
```

This starts `tsx server.ts` at `http://localhost:3000`.

- Open [http://localhost:3000](http://localhost:3000) in your browser.
- Allow microphone permissions when prompted for the Live Coach voice interface.

---

## 8. Production Build Command

To compile and validate the production bundle:

```bash
npm run build
```

To run the production server:

```bash
npx tsx server.ts
```
*(Or `npm run start` if configured with a TypeScript runtime)*

---

## 9. Test & Verification Commands

- **TypeScript Typecheck**:
  ```bash
  npx tsc --noEmit
  ```

- **ESLint**:
  ```bash
  npm run lint
  ```

- **Retrieval Test Suite**:
  ```bash
  npx tsx scripts/test-retrieval.ts
  ```

- **Full End-to-End System Validation**:
  ```bash
  npx tsx scripts/validate-life-forge-e2e.ts
  ```
