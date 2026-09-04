# LifeForge AI - Environment Configuration & Inventory

This document provides a comprehensive inventory of all environment variables used by **LifeForge AI**, detailing their security scope, purpose, origin, and sensitivity classification.

---

## 1. Environment Variable Classifications

| Variable Name | Scope | Sensitivity | Purpose & Source |
|---|---|---|---|
| `GEMINI_API_KEY` | **Server-Only** | **HIGH / SECRET** | Required for all Gemini API requests (`gemini-3.1-flash-live-preview`, `gemini-3.8-flash`, `text-embedding-004`). Obtained from Google AI Studio / GCP Console. Never exposed to browser. |
| `APP_URL` | **Server-Only** | Low | Application base URL (e.g. `http://localhost:3000` or Cloud Run URL). Used for canonical endpoint resolution and CORS checks. |
| `PORT` | **Server-Only** | Low | Server listening port for custom HTTP/WS server (Default: `3000`). |
| `NODE_ENV` | **Server & Build** | Low | Runtime mode (`development`, `production`, `test`). |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | **Browser-Safe** | Public Config | Firebase Web API key for client-side Auth and Firestore connections. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | **Browser-Safe** | Public Config | Firebase Auth Domain (e.g. `project.firebaseapp.com`). |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | **Browser-Safe** | Public Config | Google Cloud / Firebase Project ID. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | **Browser-Safe** | Public Config | Firebase Cloud Storage bucket identifier. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | **Browser-Safe** | Public Config | FCM messaging sender ID. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | **Browser-Safe** | Public Config | Firebase Web Client App ID. |
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | **Browser-Safe** | Public Config | Google OAuth 2.0 Web Client ID for Google Workspace / Calendar authorization. |

---

## 2. Source & Acquisition Guide

### A. Gemini API Key (`GEMINI_API_KEY`)
1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Click **Get API key** and create/select a Google Cloud project.
3. In local environments, set `GEMINI_API_KEY=...` in `.env.local`.
4. In production (Google Cloud Run / Kubernetes), store this secret in **Google Cloud Secret Manager** and mount it as an environment variable into your container.

### B. Firebase Configuration (`NEXT_PUBLIC_FIREBASE_*`)
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select your Firebase project (or create one).
3. Under **Project Settings** > **General**, scroll to **Your apps** and click **Add Web App** (or view existing config).
4. Copy the parameters into `.env.local` or save them into `firebase-applet-config.json` at the project root.

### C. Google Workspace / OAuth Configuration
1. In the [Google Cloud Console](https://console.cloud.google.com/), navigate to **APIs & Services** > **OAuth Consent Screen**.
2. Configure user type as External (or Internal if G Suite domain), providing support email.
3. Under **Credentials**, create an **OAuth 2.0 Client ID** of type **Web application**.
4. Add authorized JavaScript origins:
   - `http://localhost:3000` (for local development)
   - `https://your-production-domain.com` (for production)
5. Enable the **Google Calendar API** in **APIs & Services** > **Enabled APIs & Services**.

---

## 3. Security Guidelines & Token Handling

- **Never prefix server keys with `NEXT_PUBLIC_`**: The Gemini API key must never be prefixed with `NEXT_PUBLIC_` or bundled in client scripts.
- **Client-Side OAuth Flow**: Google Calendar access tokens are acquired strictly on the client side via Firebase Auth Google popup with Workspace scopes, stored in memory during the active session, and passed as bearer tokens to Google APIs.
- **No Hardcoded Fallbacks**: All credentials must be read from environment variables or `firebase-applet-config.json`. No secrets or keys are committed into version control.
