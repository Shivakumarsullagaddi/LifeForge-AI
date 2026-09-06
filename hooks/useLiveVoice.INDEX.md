# useLiveVoice.ts Feature Navigation Index

Quick reference map of `hooks/useLiveVoice.ts` line ranges and features.

---

## 1. Types & Interfaces (Lines 1 – 45)
- `SessionLifecycleState`, `AudioState`: 12-state FSM states (`IDLE`, `CONNECTING`, `LISTENING`, `USER_SPEAKING`, `ASSISTANT_SPEAKING`, `INTERRUPTED`, etc.)
- `AgentActivityState`: Specialist task lifecycle states
- `AgentTaskEvent`: Task execution events for Live System panels
- `LiveTelemetry`: Detailed telemetry schema (audio, network, conversation, agent activity)
- `LiveVoiceOptions`: Callback props (`onTurnComplete`, `onUserTranscript`, `onModelTranscript`, `onModelStartSpeaking`, `onAgentTaskEvent`, `onEndSessionRequested`)

## 2. Hook Initialization & Reactive State (Lines 46 – 225)
- `useLiveVoice(options)` hook entry
- React state variables: `state`, `latencyMs`, `turnCount`, `currentTurnId`, `liveSessionId`, `currentAgentTask`, `telemetry`, `isMuted`, `errorMsg`

## 3. Audio & WebSocket Refs (Lines 226 – 265)
- Audio graph refs: `wsRef`, `inputAudioCtxRef`, `outputAudioCtxRef`, `audioPlayerRef`, `mediaStreamRef`, `audioWorkletNodeRef`, `scriptProcessorRef`, `muteGainNodeRef`
- Turn & transcription tracking: `generationIdRef`, `activeSourcesRef`, `isTurnCompleteRef`, `currentUserTranscriptRef`, `currentModelTranscriptRef`, `hasServerTranscriptInTurnRef`, `speechRecognizerRef`, `stateRef`

## 4. Diagnostics & State Transition Helpers (Lines 266 – 300)
- `recordError(component, errorCode, safeMessage)`: Non-sensitive error logging
- `setState(nextState)`: Central FSM transition engine with telemetry updates
- `stopSpeechRecognizer()`: Clean abort of local Web Speech API

## 5. Web Speech Recognition & Ground Truth Latching (Lines 301 – 365)
- `startSpeechRecognizer()`: Local browser speech recognizer initialization
- `recognizer.onresult`: Real-time user speaking feedback
- Server transcript suppression: ignores Web Speech if `hasServerTranscriptInTurnRef` is active
- `recognizer.onend`: Auto-restart handler when connection is open and active

## 6. Barge-in & Interruption Engine (Lines 366 – 395)
- `interruptPlayback()`: Flushes audio queue, increments generation ID, stops recognizer, transitions to `INTERRUPTED` then `LISTENING`, sends `{ type: 'interrupt' }` over WebSocket

## 7. Audio Playback & Jitter Buffer (Lines 396 – 460)
- `playAudioChunk(base64Data, expectedGenId)`: Decodes 24kHz PCM from Gemini Live via `LiveAudioPlayer`, tracks queue depth, calculates turn latency

## 8. Microphone Capture & PCM Audio Streaming (Lines 461 – 580)
- `setupMicrophone()`: Requests 16kHz media stream, loads AudioWorklet or ScriptProcessor fallback, streams raw PCM chunks over WebSocket to backend

## 9. Live Session Handshake & Connection (Lines 581 – 700)
- `connect()`: AudioContext unlock, session ID generation (`live_sess_*`), initial turn ID, WebSocket connection to `/ws/live`

## 10. WebSocket Message Dispatcher (Lines 701 – 950)
- `session_started`: Session confirmation & telemetry handshake
- `audio`: Model speech streaming chunk, triggers `onModelStartSpeaking`
- `user_transcript`: Server transcript ground truth latching, delta accumulation, deduplication
- `model_transcript`: Model text streaming chunks
- `interrupted`: Barge-in synchronization
- `turn_complete`: Turn boundary finalization, saves user/model transcripts via `onTurnComplete`
- `agent_task_start` / `agent_task_complete`: Live System action panel updates
- `end_session_requested`: Self-termination signal from agent

## 11. Reconnection & Error Resilience (Lines 951 – 1100)
- `scheduleReconnect()`: Exponential backoff reconnection guard
- `ws.onerror`, `ws.onclose`: Automatic recovery and error isolation

## 12. Cleanup, Teardown & Public API (Lines 1101 – 1294)
- `disconnect()`: Full hardware and network teardown
- `resetToIdle()`: Reinitializes all refs and state to clean idle state
- `toggleMute()`: Hardware and AudioContext mute switch
- Hook return object (`connect`, `disconnect`, `resetToIdle`, `toggleMute`, `state`, `telemetry`, etc.)
