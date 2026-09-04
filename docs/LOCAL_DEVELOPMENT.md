# LifeForge AI - Local Development Guide

This guide details how to set up, configure, run, test, and build **LifeForge AI** locally outside Google AI Studio.

---

## 1. Prerequisites & System Requirements

- **Node.js**: Version `20.x` or higher (Recommended: LTS v20 or v22).
- **Package Manager**: `npm` (v10+), `yarn`, `pnpm`, or `bun`.
- **Operating System**: macOS, Linux, or Windows (via WSL2 recommended).
- **Google Cloud & Gemini API Key**: A valid Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey) with access to `gemini-3.1-flash-live-preview` and `gemini-3.8-flash`.
- **Firebase Project**: A Google Cloud / Firebase project with **Firebase Authentication** (Google Sign-In) and **Cloud Firestore** enabled.

---

## 2. Installation & Quickstart

### Step 1: Clone or Extract the Project
```bash
git clone <your-repo-url> lifeforge-ai
cd lifeforge-ai
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in the required values:
```env
# Server-Side Gemini API Key (Secret)
GEMINI_API_KEY=your_gemini_api_key_here

# App Base URL
APP_URL=http://localhost:3000

# Client Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

*Note:* If `firebase-applet-config.json` is present in the project root, the Firebase client SDK will automatically load fallback configuration from it.

---

## 3. Running the Development Server

LifeForge AI uses a unified Next.js + WebSocket custom HTTP server (`server.ts`) to support both the App Router UI/API routes and the bidirectional audio streaming channel for Gemini 3.1 Flash Live:

```bash
npm run dev
```

The application will start and listen on:
```
http://localhost:3000
```
- Open [http://localhost:3000](http://localhost:3000) in your browser.
- Allow microphone permissions when prompted in the Live Coach view.

---

## 4. Building for Production

### Production Build
```bash
npm run build
```
This compiles the Next.js frontend, bundles server routes, verifies TypeScript types, and optimizes static and dynamic assets into `.next/`.

### Starting Production Server
```bash
npm run start
```
This executes `node server.ts` in production mode with standard HTTP + WebSocket routing on port 3000.

---

## 5. Code Quality & Verification Scripts

### Run ESLint
```bash
npm run lint
```

### Run End-to-End Test & Security Suite
```bash
npx tsx scripts/validate-life-forge-e2e.ts
```
This suite verifies:
1. Multi-Agent Orchestration & Intent Classification
2. Per-User Data Isolation & Record Adaptation
3. Semantic Embeddings & Cosine Similarity
4. Exact Match & BM25 Keyword Search
5. Hybrid Retrieval Pipeline & Reranking
6. Gemini 3.8 Flash Agent Task Handoff
7. Prompt Injection Sanitization & Defense
8. Candidate Memory Confidence Gating & Lifecycle
9. Placement Skill-Gap & Evidence Grounding
10. Destructive Action Confirmation Security & 60s Expiration
11. Quantitative Metric Computation & Weekly Reflection

---

## 6. Docker & Containerized Deployment

LifeForge AI is designed to run in containerized environments such as **Google Cloud Run** or Kubernetes.

Example `Dockerfile`:
```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "server.ts"]
```

---

## 7. Troubleshooting Local Setup

- **Microphone / Web Audio Issues**: Ensure `http://localhost:3000` is accessed directly. Modern browsers require HTTPS for microphone capture unless accessing `localhost` or `127.0.0.1`.
- **WebSocket Upgrade Failed**: Ensure no external proxy or reverse proxy strips the `Upgrade: websocket` and `Connection: Upgrade` headers.
- **Firebase Permission Denied**: Deploy `firestore.rules` to your Firebase project using the Firebase CLI (`firebase deploy --only firestore:rules`) or configure your Firestore database rules in the Firebase Console.
