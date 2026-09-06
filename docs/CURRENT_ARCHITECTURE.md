# LifeForge AI — Current System Architecture

## 1. System Overview & Boundaries

LifeForge AI is an AI-powered life, study, and career coaching platform for college students. It combines real-time bidirectional voice coaching, multi-agent orchestration, hybrid semantic retrieval over private user history, structured habit and goal tracking, and student placement intelligence under strict user data isolation.

### Frontend / Backend Boundaries

```
┌────────────────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser / React 19)                       │
│                                                                        │
│  ┌───────────────────────┐   ┌───────────────────┐   ┌───────────────┐ │
│  │   Live Coach View     │   │ Navigation Sidebar│   │ Feature Views │ │
│  │ - 16kHz PCM Mic Stream│   │ - Dashboard       │   │ - Placements  │ │
│  │ - AudioWorklet Node   │   │ - Journal, Memory │   │ - Reflections │ │
│  │ - Client VAD Barge-In │   │ - Goals & Tasks   │   │ - Study & Pom │ │
│  │ - 24kHz Audio Queue   │   │ - Privacy/Security│   │ - Calendar    │ │
│  └───────────┬───────────┘   └─────────┬─────────┘   └───────┬───────┘ │
│              │ (WebSocket)             │ (Next.js API Fetch) │         │
└──────────────┼─────────────────────────┼─────────────────────┼─────────┘
               │                         │                     │
               ▼                         ▼                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS / HTTP SERVER                           │
│                              (server.ts)                               │
│                                                                        │
│  ┌───────────────────────────┐         ┌────────────────────────────┐  │
│  │   WebSocket Gateway       │         │   Next.js App Router       │  │
│  │   Route: /api/live-ws     │         │   /api/coach               │  │
│  │   - Client heartbeat      │         │   /api/placement/research  │  │
│  │   - Audio streaming bridge│         │   /api/placement/skill-gap │  │
│  │   - Interruption relay    │         │   /api/reflection          │  │
│  │   - Live tool dispatcher  │         │   /api/retrieval           │  │
│  │                           │         │   /api/auth/verify         │  │
│  └───────────┬───────────────┘         └─────────────┬──────────────┘  │
│              │                                       │                 │
│              │                                       ▼                 │
│              │                         ┌────────────────────────────┐  │
│              │                         │   Gemini 3.8 Flash         │  │
│              │                         │   (Orchestrator, Reasoning,│  │
│              ▼                         │    Grounding, Planning)    │  │
│  ┌───────────────────────────┐         └─────────────▲──────────────┘  │
│  │   Gemini 3.1 Flash Live   │                       │                 │
│  │   (Realtime Bi-directional│                       │                 │
│  │    Voice & Turn-Taking)   │                       │                 │
│  └───────────┬───────────────┘                       │                 │
│              │                                       │                 │
│              │ (Tool: request_agent_task)            │                 │
│              └───────────────────────────────────────┘                 │
│                                  │                                     │
│                                  ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   HYBRID RETRIEVAL PIPELINE                      │  │
│  │  - Prompt Injection Sanitizer (Redacts control sequences)        │  │
│  │  - Intent Understanding (Domain, Category, Temporal Extraction)  │  │
│  │  - Exact Search (IDs, dates, quoted phrases, exact titles)       │  │
│  │  - BM25 Keyword Search (Field-weighted tokens & CS terms)        │  │
│  │  - Dense Semantic Embeddings (gemini-embedding-2-preview)        │  │
│  │  - Candidate Merge, Deduplication & Reranking                    │  │
│  │  - Bounded Untrusted Prompt Context Builder                      │  │
│  └───────────────────────────────┬──────────────────────────────────┘  │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       PERSISTENCE & SECURITY                           │
│                                                                        │
│  ┌───────────────────────────┐         ┌────────────────────────────┐  │
│  │   Firebase Authentication │         │   Cloud Firestore          │  │
│  │   (Google Sign-In Pop-up) │         │   (/users/{userId}/*)      │  │
│  │   - Workspace OAuth Scope │         │   - Ownership Rules        │  │
│  │     (Google Calendar API) │         │   - Action Confirmations   │  │
│  └───────────────────────────┘         └────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Model Responsibilities & Strict Separation

The architecture enforces a strict division of responsibility between models:

| Capability | Gemini 3.1 Flash Live (`gemini-3.1-flash-live-preview`) | Gemini 3.8 Flash (`gemini-3.8-flash`) |
|---|:---:|:---:|
| **Realtime Bidirectional Audio** | **Primary** (16kHz in, 24kHz out) | Not Used |
| **Conversational Turn-Taking** | **Primary** | Not Used |
| **Barge-in / Voice Interruption** | **Primary** | Not Used |
| **Live Voice Tone & Pacing** | **Primary** (Zephyr voice) | Not Used |
| **Tool Calling Gateway** | Calls `request_agent_task` | Implements Task Logic |
| **Agent Orchestration & Routing** | Delegated to 3.8 Flash | **Primary** (`app/api/coach/route.ts`) |
| **Specialist Domain Reasoning** | Delegated to 3.8 Flash | **Primary** (`lib/live/agentHandoff.ts`) |
| **Private User Data Retrieval** | Delegated to 3.8 Flash | **Primary** (via Hybrid Engine) |
| **Google Search Grounding** | Not Used | **Primary** (`tools: [{ googleSearch: {} }]`) |
| **Placement Skill-Gap Analysis** | Not Used | **Primary** (Structured JSON Schema) |
| **Weekly Reflection Reports** | Not Used | **Primary** (Structured JSON Schema) |
| **Candidate Action Proposals** | Not Used | **Primary** (`<PROPOSED_ACTIONS>` tags) |

---

## 3. Agent Architecture

### Orchestrator Agent (`app/api/coach/route.ts`)
- Evaluates student input and conversational history (up to last 6 turns).
- Performs hybrid retrieval against student's private records.
- Synthesizes empathetic yet disciplined coaching responses.
- Proposes structured candidate actions (`candidateMemory`, `proposedTask`, `proposedGoal`) enclosed in `<PROPOSED_ACTIONS>` tags.
- Activates Google Search grounding when company research or internship trends are detected.

### Specialist Agents
1. **Study Coach**: Manages 25/5 Pomodoro focus sessions, active recall ("teach this concept back to me"), spaced repetition, and misconception clearance.
2. **Placement Agent**: Guides DSA, Operating Systems, DBMS, Networks, and System Design preparation; performs resume defense and interview strategy.
3. **Research Agent**: Fetches fresh hiring trends, interview patterns, and company timelines grounded with Google Search.
4. **Reflection & Wellbeing Agent**: Analyzes quantitative study hours, task completion trends, and reflection logs; challenges excuses with solution-oriented accountability without diagnosing medical conditions or recommending self-harm.
5. **Memory Agent**: Identifies verified facts, preferences, values, and routines worth long-term retention.
6. **Goals & Tasks Agent**: Converts milestones into actionable deep-work tasks.

### Live Specialist Handoff Loop (`lib/live/agentHandoff.ts`)
1. During a voice session, Gemini 3.1 Live detects a complex inquiry and calls `request_agent_task(domain, query)`.
2. The WebSocket server sends an `agent_task_start` event to the client UI.
3. `executeAgentTask` executes hybrid retrieval and invokes `gemini-3.8-flash`.
4. The output is split into:
   - **Spoken Summary**: 1–2 punchy sentences returned to Gemini 3.1 Live via `sendToolResponse`.
   - **Structured Details**: Complete analysis, citations, and retrieved items sent to the UI via `agent_task_complete`.

---

## 4. Firestore Architecture

All private data is strictly scoped under `/users/{userId}/*`:

```
/users/{userId}
  ├── /journals/{journalId}             # Daily journal entries, mood, clarity, takeaways
  ├── /memories/{memoryId}             # Long-term memories, habits, routines, preferences
  ├── /goals/{goalId}                  # High-level goals, target dates, progress
  ├── /tasks/{taskId}                  # Daily actionable tasks, deep-work flags
  ├── /reflections/{reflectionId}      # Daily and weekly reflection logs, discipline scores
  ├── /conversations/{conversationId}  # Coaching chat sessions
  │     └── /messages/{messageId}      # Individual messages
  ├── /study_sessions/{sessionId}      # Pomodoro focus blocks and misconceptions cleared
  ├── /action_confirmations/{actionId} # Human-in-the-loop confirmation queue
  ├── /embeddings/{embeddingId}        # Private dense vector embeddings
  └── /placement_profile/default       # Technical skills matrix, projects, interview roadmap
```

### Security Rules (`firestore.rules`)
- Default deny: `match /{document=**} { allow read, write: if false; }`.
- Owner authorization: `isOwner(userId) = isAuthenticated() && request.auth.uid == userId`.
- All subcollections under `/users/{userId}` require `isOwner(userId)`.

---

## 5. Retrieval Architecture

The retrieval system (`lib/retrieval/`) implements a multi-stage hybrid pipeline:

```
User Query
    │
    ▼
[Intent Understanding] ── Extract dates, classify domain, identify query category
    │
    ├──────────────────────────┬──────────────────────────┐
    ▼                          ▼                          ▼
[Exact Search]         [Keyword Search]          [Semantic Search]
- Document IDs         - BM25 field-weighted     - gemini-embedding-2-preview
- Quoted phrases       - Title: 3.5x             - 768-dimension vectors
- Extracted dates      - Tags: 2.5x              - Fallback: deterministic n-gram
- Exact titles         - Content: 1.0x           - Cosine similarity
    │                          │                          │
    └──────────────────────────┼──────────────────────────┘
                               ▼
                    [Candidate Merge & Dedup]
                               │
                               ▼
                    [Multi-Signal Reranking]
                    Score = w_sem(0.45) + w_kw(0.35) + w_exact(0.20)
                    Multi-match boost: +20% (2 matches), +35% (3 matches)
                    Domain match boost: +15%
                               │
                               ▼
                    [Prompt Sanitizer & Framing]
                    Redacts injection patterns
                    Bound in untrusted context block
```

---

## 6. Voice Architecture

### Live Voice Pipeline
1. **Client Audio Capture**: Microphone captured at 16kHz mono via `navigator.mediaDevices.getUserMedia`.
2. **AudioWorklet (`public/audio-processor.js`)**: Converts Float32 audio samples to 16-bit PCM Int16 buffers (~128ms / 2048 samples) with `ScriptProcessorNode` fallback.
3. **Client VAD & Barge-In**: Computes RMS energy in real time. If assistant is speaking (`activeSources > 0`) and RMS > 0.045 for 2 consecutive frames:
   - Instantly stops playing Web Audio buffers (`source.stop()`).
   - Dispatches `{ type: 'interrupt' }` to the server.
   - Resets state to `LISTENING`.
4. **WebSocket Server (`server.ts`)**: Upgrades `/api/live-ws`, maintains keepalive pings every 25 seconds, bridges bidirectional PCM chunks to Gemini 3.1 Live via `@google/genai`.
5. **Server Interruption**: Relays `message.serverContent.interrupted` to client to flush audio playback queue.
6. **Playback Engine**: Streams 24kHz PCM chunks decoded to `AudioBuffer` and scheduled with a 20ms jitter cushion.

---

## 7. Security Boundaries & Observations

1. **Firestore Client-Side Enforcement**: `firestore.rules` guarantees that direct browser Firestore queries cannot read or write another user's documents.
2. **Prompt Injection Defense**: `sanitizeUntrustedContent` strips injection tokens (`ignore previous instructions`, `[SYSTEM]`, `<script>`, etc.) and formats context into an explicit untrusted block.
3. **Human-in-the-Loop Confirmation Gate**: Destructive actions (deleting journals, clearing memories, creating calendar events) generate an `ActionConfirmation` with a strict 60-second expiration.
4. **Current Architectural Limitations**:
   - **WebSocket Authentication**: The `/api/live-ws` handshake does not verify a Firebase Auth ID token; it trusts the `userId` in the client's `init` payload.
   - **Server Route Data Passing**: API routes (`/api/coach`, `/api/reflection`, etc.) accept `userData` directly from the client JSON payload instead of querying Firestore directly on the server with Firebase Admin credentials.

---

## 8. External Integrations

1. **Google Gemini Live & Gemini Flash API**:
   - `gemini-3.1-flash-live-preview` (Bi-directional voice WebSocket)
   - `gemini-3.8-flash` (Orchestration, reasoning, structured output)
   - `gemini-embedding-2-preview` (Dense vector embeddings)
2. **Google Search Grounding**:
   - Dynamic search grounding via `@google/genai` tools config for fresh industry hiring patterns and company research.
3. **Google Calendar API**:
   - Client-side OAuth with `https://www.googleapis.com/auth/calendar.events` scope.
   - Schedules Pomodoro focus blocks and mock interview sessions.
4. **Firebase Platform**:
   - Authentication (Google Sign-In popup)
   - Cloud Firestore (Isolated user data store)
