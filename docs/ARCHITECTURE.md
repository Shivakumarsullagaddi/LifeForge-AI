# LifeForge AI - System Architecture & Data Flows

## 1. High-Level System Architecture

LifeForge AI is architected as an **AI Operating System** for college students, balancing real-time voice coaching, deep analytical reasoning, hybrid semantic retrieval, structured habits, and human-in-the-loop security gates.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                          │
│                                                                        │
│  ┌───────────────────────┐   ┌───────────────────┐   ┌───────────────┐ │
│  │   Live Coach View     │   │ Navigation Sidebar│   │ Feature Views │ │
│  │ (16kHz PCM AudioWorklet│   │ (Journal, Memory, │   │ (Placements,  │ │
│  │  Client Barge-In RMS) │   │  Study, Goals)    │   │  Reflections) │ │
│  └───────────┬───────────┘   └─────────┬─────────┘   └───────┬───────┘ │
│              │ (WebSocket)             │ (HTTPS Fetch)       │         │
└──────────────┼─────────────────────────┼─────────────────────┼─────────┘
               │                         │                     │
               ▼                         ▼                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS / HTTP SERVER                           │
│                              (server.ts)                               │
│                                                                        │
│  ┌───────────────────────────┐         ┌────────────────────────────┐  │
│  │   WebSocket Gateway       │         │   Next.js App Router       │  │
│  │   (/api/live-ws)          │         │   (/api/coach, /api/auth,  │  │
│  └───────────┬───────────────┘         │    /api/placement/*, etc.) │  │
│              │                         └─────────────┬──────────────┘  │
│              │                                       │                 │
│              ▼                                       ▼                 │
│  ┌───────────────────────────┐         ┌────────────────────────────┐  │
│  │   Gemini 3.1 Flash Live   │         │   Gemini 3.8 Flash         │  │
│  │   (Realtime Bi-directional│         │   (Orchestrator, Reasoning,│  │
│  │    Audio Streaming)       │         │    Grounding, Research)    │  │
│  └───────────┬───────────────┘         └─────────────▲──────────────┘  │
│              │                                       │                 │
│              │ (Tool Call: request_agent_task)       │                 │
│              └───────────────────────────────────────┘                 │
│                                  │                                     │
│                                  ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   HYBRID RETRIEVAL PIPELINE                      │  │
│  │  - Input Sanitization & Prompt Injection Protection               │  │
│  │  - Query Intent Classification (Domain, Urgency, Severity)       │  │
│  │  - Exact Match Search + Field-Weighted BM25 Keyword Search        │  │
│  │  - Dense Semantic Embeddings (text-embedding-004) + Cosine Sim   │  │
│  │  - Reciprocal Rank Fusion & Per-User Isolation Gate              │  │
│  └───────────────────────────────┬──────────────────────────────────┘  │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       PERSISTENCE & SECURITY                           │
│                                                                        │
│  ┌───────────────────────────┐         ┌────────────────────────────┐  │
│  │   Firebase Authentication │         │   Cloud Firestore          │  │
│  │   (Google Sign-In + Token)│         │   (/users/{uid}/*)         │  │
│  └───────────────────────────┘         │   - Strict Owner Rules     │  │
│                                        │   - Destructive Gate (60s) │  │
│                                        └────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Subsystems

### A. Dual-Model AI Engine
1. **Gemini 3.1 Flash Live (`gemini-3.1-flash-live-preview`)**:
   - **Role**: Handles conversational turn-taking, real-time 16kHz audio input/output streaming, voice tone and pacing, and instantaneous interruption detection.
   - **Tool Calls**: When deep historical analysis, placement research, or structured planning is needed, it triggers `request_agent_task`.
2. **Gemini 3.8 Flash (`gemini-3.8-flash`)**:
   - **Role**: Heavy reasoning, multi-agent orchestration, qualitative synthesis, skill-gap analysis, weekly reflection reporting, and Google Search Grounding for current technical trends and company hiring information.

### B. Specialist Agent Handoff Loop
- When the user asks a deep question via voice (e.g., *"Why did I struggle with Dynamic Programming on Tuesday?"*), Gemini Live issues a tool call to `executeAgentTask()`.
- The backend executes hybrid retrieval over the student's private Firestore documents.
- Gemini 3.8 Flash produces:
  1. A punchy 1–3 sentence **Spoken Summary** sent back to Gemini Live for immediate voice playback.
  2. Structured **UI Details, Action Plans, and Citations** sent to the client via WebSocket for visual display.

### C. Hybrid Retrieval Architecture
The hybrid retrieval engine (`lib/retrieval/`) processes user queries through three parallel stages:
1. **Exact & ID Search**: Instant matching on identifiers, titles, tags, and dates.
2. **Field-Weighted BM25 Token Search**: Matches high-entropy domain terms (e.g., *Dijkstra*, *LRU Cache*, *ACID*), weighting title (3.5x), tags (2.5x), and content (1.0x).
3. **Dense Semantic Embeddings**: Generates vectors using `text-embedding-004` (with fallback local hashing for offline/resilience) and computes cosine similarity.
4. **Scoring & Fusion**: Normalizes and combines scores (`0.45 * semantic + 0.35 * keyword + 0.20 * exact`), filtering below threshold and enforcing strict `userId == record.userId` constraints.

### D. Safety, Prompt Injection & Destructive Action Gates
- **Prompt Injection Defense**: Sanitizes control characters, strips system prompt override patterns (`Ignore previous instructions`, `<SYSTEM>`, etc.), and neutralizes untrusted external search outputs.
- **Destructive Action Security**: Operations like deleting journals, wiping memories, or writing to external Google Calendar cannot be auto-executed by AI models. They generate a pending `ActionConfirmation` with a strict **60-second expiration window** requiring explicit human approval.

---

## 3. Data Schema & Firestore Isolation

All records are strictly nested under `/users/{userId}/`:
- `/users/{userId}`: User Profile & Onboarding Preferences
- `/users/{userId}/journals/{journalId}`: Daily Journal Logs & Action Takeaways
- `/users/{userId}/memories/{memoryId}`: Candidate & Active Long-Term Memories
- `/users/{userId}/goals/{goalId}`: Milestone Goals & Progress Trackers
- `/users/{userId}/tasks/{taskId}`: Daily Tasks & Deep Work Flags
- `/users/{userId}/reflections/{reflectionId}`: Daily & Weekly Reflection Logs
- `/users/{userId}/conversations/{convId}`: Conversation History & Chat Messages
- `/users/{userId}/study_sessions/{sessionId}`: Pomodoro & Active Recall Records
- `/users/{userId}/action_confirmations/{actionId}`: Pending Destructive Action Approvals
- `/users/{userId}/placement_profile/default`: Placement Skills, Target Companies, and Projects

Security is enforced at the database layer in `firestore.rules` where `request.auth.uid == userId` is required for every collection and subcollection.
