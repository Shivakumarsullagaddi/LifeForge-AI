'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { calendarStateManager } from '@/lib/calendar';
import { globalToolGateway } from '@/lib/tools/gateway';
import { subscribeUserActions } from '@/lib/events';
import { timerManager } from '@/lib/timer';
import { LiveAudioPlayer, float32ToInt16PCM, pcmInt16ToBase64 } from '@/lib/pcm-audio';
import { deduplicateTranscript } from '@/lib/utils';

export type SessionLifecycleState =
  | 'IDLE'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'LISTENING'
  | 'USER_SPEAKING'
  | 'PROCESSING'
  | 'ASSISTANT_SPEAKING'
  | 'INTERRUPTED'
  | 'AGENT_PROCESSING'
  | 'RECONNECTING'
  | 'ERROR'
  | 'ENDED';

export type AudioState = SessionLifecycleState;

export type AgentActivityState =
  | 'Listening'
  | 'Transcribing'
  | 'Classifying'
  | 'Agent requested'
  | 'Retrieving context'
  | 'Searching'
  | 'Researching'
  | 'Planning'
  | 'Waiting for approval'
  | 'Executing tool'
  | 'Completed'
  | 'Failed';

export interface AgentTaskEvent {
  domain: string;
  query?: string;
  status: 'running' | 'completed';
  spokenSummary?: string;
  structuredDetails?: Record<string, any>;
  citations?: Array<{ title?: string; uri?: string }>;
  timestamp: string;
}

export interface StructuredTelemetry {
  connection: {
    browser: string;
    wsState: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
    geminiLiveSession: 'DISCONNECTED' | 'HANDSHAKING' | 'ACTIVE' | 'ERROR';
    firebaseStatus: 'ONLINE' | 'OFFLINE';
    reconnectCount: number;
    uptimeSeconds: number;
  };
  audio: {
    micPermission: 'prompt' | 'granted' | 'denied';
    inputAudioContextState: AudioContextState | 'none';
    outputAudioContextState: AudioContextState | 'none';
    audioWorkletActive: boolean;
    inputSampleRate: number;
    outputSampleRate: number;
    inputActive: boolean;
    outputActive: boolean;
    chunksReceived: number;
    chunksDecoded: number;
    buffersQueued: number;
    buffersScheduled: number;
    buffersPlayed: number;
    queueDepth: number;
    lastPlaybackTime: string | null;
    audioState: SessionLifecycleState;
    rmsInputLevel: number;
    peakInputLevel: number;
    isClipping: boolean;
    inputChannels: number;
    inputChunkRate: number;
    vadEventCount: number;
    turnCompleteCount: number;
    interruptionCount: number;
  };
  conversation: {
    conversationId: string | null;
    liveSessionId: string;
    currentTurnId: string | null;
    currentSpeaker: 'user' | 'assistant' | 'none';
    turnNumber: number;
    lastUserTranscript: string;
    lastAssistantTranscript: string;
    transcriptStatus: 'idle' | 'streaming' | 'finalized';
  };
  agentActivity: {
    state: AgentActivityState;
    domain?: string;
    query?: string;
    detail?: string;
    updatedAt: string;
  };
  network: {
    latencyMs: number | null;
    lastMessageTime: string | null;
    messagesSent: number;
    messagesReceived: number;
    audioPacketsSent: number;
    audioPacketsReceived: number;
  };
  errors: Array<{
    id: string;
    timestamp: string;
    component: string;
    errorCode: string;
    safeMessage: string;
  }>;
}

export interface LiveVoiceOptions {
  userId: string;
  conversationId?: string | null;
  userProfile?: any;
  activeDomain?: string;
  userData?: any;
  resumeContext?: {
    conversationSummary?: string;
    recentMessages?: Array<{ role: string; text?: string; content?: string }>;
    relevantMemories?: Array<{ content: string; type: string }>;
  };
  onUserTranscript?: (text: string, turnId: string) => void;
  onModelTranscript?: (text: string, turnId: string) => void;
  onModelStartSpeaking?: (userText?: string, turnId?: string) => void;
  onTurnComplete?: (userText: string, modelText: string, turnId: string) => void;
  onAgentTaskEvent?: (event: AgentTaskEvent) => void;
  onStateChange?: (state: SessionLifecycleState) => void;
  onEndSessionRequested?: (reason?: string) => void;
  refreshUserContext?: () => void;
}

function float32ToBase64PCM(float32Array: Float32Array): string {
  const pcm16 = float32ToInt16PCM(float32Array);
  return pcmInt16ToBase64(pcm16);
}

export function useLiveVoice(options: LiveVoiceOptions) {
  const [state, setStateInternal] = useState<SessionLifecycleState>('IDLE');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [turnCount, setTurnCount] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [currentAgentTask, setCurrentAgentTask] = useState<AgentTaskEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [liveSessionId, setLiveSessionId] = useState<string>('');
  const [currentTurnId, setCurrentTurnId] = useState<string>('');

  const chunksReceivedRef = useRef<number>(0);
  const chunksDecodedRef = useRef<number>(0);
  const buffersQueuedRef = useRef<number>(0);
  const buffersScheduledRef = useRef<number>(0);
  const buffersPlayedRef = useRef<number>(0);
  const lastPlaybackTimeRef = useRef<string | null>(null);

  const [telemetry, setTelemetry] = useState<StructuredTelemetry>(() => ({
    connection: {
      browser: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 32) : 'Node/Browser',
      wsState: 'CLOSED',
      geminiLiveSession: 'DISCONNECTED',
      firebaseStatus: 'ONLINE',
      reconnectCount: 0,
      uptimeSeconds: 0,
    },
    audio: {
      micPermission: 'prompt',
      inputAudioContextState: 'none',
      outputAudioContextState: 'none',
      audioWorkletActive: false,
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      inputActive: false,
      outputActive: false,
      chunksReceived: 0,
      chunksDecoded: 0,
      buffersQueued: 0,
      buffersScheduled: 0,
      buffersPlayed: 0,
      queueDepth: 0,
      lastPlaybackTime: null,
      audioState: 'IDLE',
      rmsInputLevel: 0,
      peakInputLevel: 0,
      isClipping: false,
      inputChannels: 1,
      inputChunkRate: 0,
      vadEventCount: 0,
      turnCompleteCount: 0,
      interruptionCount: 0,
    },
    conversation: {
      conversationId: null,
      liveSessionId: '',
      currentTurnId: null,
      currentSpeaker: 'none',
      turnNumber: 0,
      lastUserTranscript: '',
      lastAssistantTranscript: '',
      transcriptStatus: 'idle',
    },
    agentActivity: {
      state: 'Listening',
      updatedAt: new Date().toLocaleTimeString(),
    },
    network: {
      latencyMs: null,
      lastMessageTime: null,
      messagesSent: 0,
      messagesReceived: 0,
      audioPacketsSent: 0,
      audioPacketsReceived: 0,
    },
    errors: [],
  }));

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const audioPlayerRef = useRef<LiveAudioPlayer | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainNodeRef = useRef<GainNode | null>(null);

  const generationIdRef = useRef<number>(0);
  const lastInterruptTimeRef = useRef<number>(0);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isTurnCompleteRef = useRef<boolean>(true);
  const turnStartTimeRef = useRef<number>(0);
  const hasReceivedFirstAudioInTurnRef = useRef<boolean>(false);
  const hasServerTranscriptInTurnRef = useRef<boolean>(false);

  const liveSessionIdRef = useRef<string>('');
  const currentTurnIdRef = useRef<string>('');
  const turnCountRef = useRef<number>(0);
  const currentUserTranscriptRef = useRef<string>('');
  const currentModelTranscriptRef = useRef<string>('');
  const isMutedRef = useRef<boolean>(false);
  const sessionStartTimeRef = useRef<number>(0);
  const speechRecognizerRef = useRef<any>(null);
  const stateRef = useRef<SessionLifecycleState>('IDLE');

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const recordError = useCallback((component: string, errorCode: string, safeMessage: string) => {
    const errorEntry = {
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      component,
      errorCode,
      safeMessage,
    };
    setTelemetry((prev) => ({
      ...prev,
      errors: [errorEntry, ...prev.errors.slice(0, 19)],
    }));
  }, []);

  const setState = useCallback((nextState: SessionLifecycleState) => {
    stateRef.current = nextState;
    setStateInternal((prev) => {
      if (prev === nextState) return prev;
      optionsRef.current.onStateChange?.(nextState);
      return nextState;
    });
    setTelemetry((prev) => ({
      ...prev,
      audio: {
        ...prev.audio,
        audioState: nextState,
        inputActive: nextState === 'LISTENING' || nextState === 'USER_SPEAKING',
        outputActive: nextState === 'ASSISTANT_SPEAKING',
      },
    }));
  }, []);

  const stopSpeechRecognizer = useCallback(() => {
    if (speechRecognizerRef.current) {
      try {
        speechRecognizerRef.current.onresult = null;
        speechRecognizerRef.current.onerror = null;
        speechRecognizerRef.current.onend = null;
        speechRecognizerRef.current.abort();
      } catch {}
      speechRecognizerRef.current = null;
    }
  }, []);

  const startSpeechRecognizer = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    stopSpeechRecognizer();

    try {
      const recognizer = new SpeechRec();
      recognizer.continuous = true;
      recognizer.interimResults = true;
      recognizer.lang = 'en-US';
      recognizer.maxAlternatives = 1;

      recognizer.onresult = (event: any) => {
        if (isMutedRef.current || stateRef.current === 'ASSISTANT_SPEAKING' || hasServerTranscriptInTurnRef.current) return;
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        const liveText = deduplicateTranscript((finalTranscript + interimTranscript).trim());
        if (liveText && !hasServerTranscriptInTurnRef.current) {
          currentUserTranscriptRef.current = liveText;
          setState('USER_SPEAKING');
          optionsRef.current.onUserTranscript?.(liveText, currentTurnIdRef.current);
        }
      };

      recognizer.onerror = () => {};
      recognizer.onend = () => {
        if (
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN &&
          !isMutedRef.current &&
          stateRef.current !== 'ASSISTANT_SPEAKING'
        ) {
          try {
            recognizer.start();
          } catch {}
        }
      };

      recognizer.start();
      speechRecognizerRef.current = recognizer;
    } catch {}
  }, [stopSpeechRecognizer, setState]);

  const interruptPlayback = useCallback(() => {
    const now = Date.now();
    if (now - lastInterruptTimeRef.current < 500) {
      return;
    }
    lastInterruptTimeRef.current = now;
    generationIdRef.current += 1;

    if (audioPlayerRef.current) {
      audioPlayerRef.current.stopAndFlush();
    }
    activeSourcesRef.current.clear();

    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    }

    stopSpeechRecognizer();
    setState('INTERRUPTED');
    setTimeout(() => {
      setState('LISTENING');
      startSpeechRecognizer();
    }, 150);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
  }, [setState, stopSpeechRecognizer, startSpeechRecognizer]);

  const playAudioChunk = useCallback(
    (base64Data: string, expectedGenId: number) => {
      chunksReceivedRef.current += 1;

      if (expectedGenId !== generationIdRef.current) {
        return;
      }
      if (!audioPlayerRef.current) return;

      if (!hasReceivedFirstAudioInTurnRef.current && turnStartTimeRef.current > 0) {
        const firstAudioLatency = Math.round(performance.now() - turnStartTimeRef.current);
        setLatencyMs(firstAudioLatency);
        hasReceivedFirstAudioInTurnRef.current = true;
      }

      const { scheduled } = audioPlayerRef.current.enqueueAudioChunk(base64Data, () => {
        buffersPlayedRef.current += 1;
        lastPlaybackTimeRef.current = new Date().toLocaleTimeString();

        setTelemetry((prev) => ({
          ...prev,
          audio: {
            ...prev.audio,
            buffersPlayed: buffersPlayedRef.current,
            queueDepth: audioPlayerRef.current?.getActiveSourceCount() || 0,
            lastPlaybackTime: lastPlaybackTimeRef.current,
          },
        }));

        if (expectedGenId === generationIdRef.current) {
          if ((audioPlayerRef.current?.getActiveSourceCount() || 0) === 0 && isTurnCompleteRef.current) {
            setState('LISTENING');
            startSpeechRecognizer();
          }
        }
      });

      if (!scheduled) return;

      chunksDecodedRef.current += 1;
      buffersScheduledRef.current += 1;
      buffersQueuedRef.current += 1;
      isTurnCompleteRef.current = false;
      stopSpeechRecognizer();
      setState('ASSISTANT_SPEAKING');

      setTelemetry((prev) => ({
        ...prev,
        audio: {
          ...prev.audio,
          chunksReceived: chunksReceivedRef.current,
          chunksDecoded: chunksDecodedRef.current,
          buffersQueued: buffersQueuedRef.current,
          buffersScheduled: buffersScheduledRef.current,
          queueDepth: audioPlayerRef.current?.getActiveSourceCount() || 0,
          outputActive: true,
        },
      }));
    },
    [setState, stopSpeechRecognizer, startSpeechRecognizer]
  );

  const startAudioPipeline = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!inputAudioCtxRef.current || inputAudioCtxRef.current.state === 'closed') {
        inputAudioCtxRef.current = new AudioCtxClass({ sampleRate: 16000 });
      }
      if (inputAudioCtxRef.current.state === 'suspended') {
        inputAudioCtxRef.current.resume().catch(() => {});
      }

      const inputAudioCtx = inputAudioCtxRef.current;
      const source = inputAudioCtx.createMediaStreamSource(stream);

      let workletLoaded = false;
      const muteGain = inputAudioCtx.createGain();
      muteGain.gain.value = 0;
      muteGain.connect(inputAudioCtx.destination);
      muteGainNodeRef.current = muteGain;

      try {
        await inputAudioCtx.audioWorklet.addModule('/audio-processor.js');
        const workletNode = new AudioWorkletNode(inputAudioCtx, 'pcm-processor');
        workletNode.port.onmessage = (e) => {
          if (isMutedRef.current) return;
          const msgData = e.data;
          const pcmInt16: Int16Array = msgData && msgData.pcm ? msgData.pcm : (msgData as Int16Array);
          const rms = msgData && typeof msgData.rms === 'number' ? msgData.rms : 0;
          const peak = msgData && typeof msgData.peak === 'number' ? msgData.peak : 0;
          const isClipping = msgData && typeof msgData.isClipping === 'boolean' ? msgData.isClipping : false;

          if (!pcmInt16 || !pcmInt16.buffer) return;

          const uint8Array = new Uint8Array(pcmInt16.buffer);
          let binary = '';
          for (let i = 0; i < uint8Array.byteLength; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
            setTelemetry((prev) => ({
              ...prev,
              audio: {
                ...prev.audio,
                rmsInputLevel: rms,
                peakInputLevel: peak,
                isClipping,
                inputChannels: 1,
                inputChunkRate: Math.round(16000 / 2048),
                inputActive: true,
              },
              network: {
                ...prev.network,
                audioPacketsSent: prev.network.audioPacketsSent + 1,
              },
            }));
          }
        };

        source.connect(workletNode);
        workletNode.connect(muteGain);
        audioWorkletNodeRef.current = workletNode;
        workletLoaded = true;
      } catch {
        recordError('AudioWorklet', 'FALLBACK_SCRIPT_PROCESSOR', 'AudioWorklet module fallback to ScriptProcessor');
      }

      if (!workletLoaded) {
        const processor = inputAudioCtx.createScriptProcessor(2048, 1, 1);
        processor.onaudioprocess = (e) => {
          if (isMutedRef.current) return;
          const inputData = e.inputBuffer.getChannelData(0);
          let sumSquares = 0;
          let peak = 0;
          for (let i = 0; i < inputData.length; i++) {
            const abs = Math.abs(inputData[i]);
            if (abs > peak) peak = abs;
            sumSquares += inputData[i] * inputData[i];
          }
          const rms = Math.round(Math.sqrt(sumSquares / inputData.length) * 1000) / 1000;
          const isClipping = peak >= 0.999;

          const base64 = float32ToBase64PCM(inputData);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
            setTelemetry((prev) => ({
              ...prev,
              audio: {
                ...prev.audio,
                rmsInputLevel: rms,
                peakInputLevel: Math.round(peak * 1000) / 1000,
                isClipping,
                inputChannels: 1,
                inputChunkRate: Math.round(16000 / 2048),
                inputActive: true,
              },
              network: {
                ...prev.network,
                audioPacketsSent: prev.network.audioPacketsSent + 1,
              },
            }));
          }
        };

        source.connect(processor);
        processor.connect(muteGain);
        scriptProcessorRef.current = processor;
      }

      startSpeechRecognizer();

      setTelemetry((prev) => ({
        ...prev,
        audio: {
          ...prev.audio,
          micPermission: 'granted',
          inputAudioContextState: inputAudioCtx.state,
          outputAudioContextState: outputAudioCtxRef.current?.state || 'none',
          audioWorkletActive: workletLoaded,
          inputSampleRate: 16000,
          outputSampleRate: outputAudioCtxRef.current?.sampleRate || 24000,
        },
      }));
    } catch (err: any) {
      setState('ERROR');
      setErrorMsg(err.message || 'Microphone access denied or unavailable');
      recordError('Microphone', 'PERMISSION_DENIED', err.message || 'Microphone access denied');
      setTelemetry((prev) => ({
        ...prev,
        audio: {
          ...prev.audio,
          micPermission: 'denied',
        },
      }));
    }
  }, [recordError, setState, startSpeechRecognizer]);

  const connect = useCallback(async () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new LiveAudioPlayer(24000);
    }
    audioPlayerRef.current.init(outputAudioCtxRef.current);
    outputAudioCtxRef.current = audioPlayerRef.current.getAudioContext();

    const newSessionId = `live_sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setLiveSessionId(newSessionId);
    liveSessionIdRef.current = newSessionId;
    sessionStartTimeRef.current = Date.now();
    turnCountRef.current = 1;
    setTurnCount(1);

    chunksReceivedRef.current = 0;
    chunksDecodedRef.current = 0;
    buffersQueuedRef.current = 0;
    buffersScheduledRef.current = 0;
    buffersPlayedRef.current = 0;
    lastPlaybackTimeRef.current = null;

    const initialTurnId = `turn_${newSessionId}_001`;
    currentTurnIdRef.current = initialTurnId;
    setCurrentTurnId(initialTurnId);
    currentUserTranscriptRef.current = '';
    currentModelTranscriptRef.current = '';
    hasServerTranscriptInTurnRef.current = false;

    setState('CONNECTING');
    setErrorMsg(null);

    const reconnectReqId = `live_conn_${Date.now()}`;
    globalToolGateway.recordExecution({
      requestId: reconnectReqId,
      agentTaskId: `task_${reconnectReqId}`,
      conversationId: optionsRef.current.conversationId || 'live_voice_session',
      turnId: initialTurnId,
      tool: 'reconnect_live_voice',
      agent: 'LifeForge Live Coach',
      status: 'RUNNING',
      state: 'RUNNING',
      arguments: { action: 'RECONNECT', session: newSessionId },
      startedAt: new Date().toISOString(),
    });

    optionsRef.current.onAgentTaskEvent?.({
      domain: 'orchestrator',
      status: 'running',
      spokenSummary: 'Connecting to Gemini Live session...',
      timestamp: new Date().toLocaleTimeString(),
    });

    setTelemetry((prev) => ({
      ...prev,
      connection: {
        ...prev.connection,
        wsState: 'CONNECTING',
        geminiLiveSession: 'HANDSHAKING',
        reconnectCount: prev.connection.reconnectCount + 1,
      },
      conversation: {
        ...prev.conversation,
        liveSessionId: newSessionId,
        conversationId: optionsRef.current.conversationId || null,
        currentTurnId: initialTurnId,
        turnNumber: 0,
      },
      audio: {
        ...prev.audio,
        outputAudioContextState: outputAudioCtxRef.current?.state || 'none',
        outputSampleRate: outputAudioCtxRef.current?.sampleRate || 24000,
        chunksReceived: 0,
        chunksDecoded: 0,
        buffersQueued: 0,
        buffersScheduled: 0,
        buffersPlayed: 0,
        queueDepth: 0,
        lastPlaybackTime: null,
      },
    }));

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/live-ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setState('CONNECTED');
        setTelemetry((prev) => ({
          ...prev,
          connection: {
            ...prev.connection,
            wsState: 'OPEN',
            geminiLiveSession: 'HANDSHAKING',
          },
        }));

        ws.send(
          JSON.stringify({
            type: 'init',
            userId: optionsRef.current.userId,
            conversationId: optionsRef.current.conversationId,
            liveSessionId: newSessionId,
            userProfile: optionsRef.current.userProfile,
            activeDomain: optionsRef.current.activeDomain,
            userData: optionsRef.current.userData,
            resumeContext: optionsRef.current.resumeContext,
            calendarState: calendarStateManager.getState(),
            calendarToken: calendarStateManager.getAccessToken(),
          })
        );

        await startAudioPipeline();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const nowStr = new Date().toLocaleTimeString();

          setTelemetry((prev) => ({
            ...prev,
            network: {
              ...prev.network,
              lastMessageTime: nowStr,
              messagesReceived: prev.network.messagesReceived + 1,
            },
          }));

          if (msg.type === 'session_ready') {
            if (msg.calendarToken && msg.calendarState === 'CONNECTED') {
              calendarStateManager.setAccessToken(msg.calendarToken);
              calendarStateManager.setState('CONNECTED');
            } else if (msg.calendarState && msg.calendarState !== 'DISCONNECTED') {
              calendarStateManager.setState(msg.calendarState);
            }
            setState('LISTENING');
            startSpeechRecognizer();
            setErrorMsg(null);
            globalToolGateway.recordExecution({
              requestId: reconnectReqId,
              agentTaskId: `task_${reconnectReqId}`,
              conversationId: optionsRef.current.conversationId || 'live_voice_session',
              turnId: initialTurnId,
              tool: 'reconnect_live_voice',
              agent: 'LifeForge Live Coach',
              status: 'COMPLETED',
              state: 'COMPLETED',
              arguments: { action: 'RECONNECT', session: newSessionId },
              startedAt: new Date(Date.now() - 500).toISOString(),
              completedAt: new Date().toISOString(),
              duration: 0.5,
              result: { status: 'CONNECTED', model: msg.model || 'gemini-3.1-flash-live-preview', ready: true },
            });
            optionsRef.current.onAgentTaskEvent?.({
              domain: 'orchestrator',
              status: 'completed',
              spokenSummary: 'Gemini Live voice session connected and listening.',
              timestamp: nowStr,
            });
            setTelemetry((prev) => ({
              ...prev,
              connection: {
                ...prev.connection,
                geminiLiveSession: 'ACTIVE',
              },
              agentActivity: {
                state: 'Listening',
                updatedAt: nowStr,
              },
            }));
          } else if (msg.type === 'audio' && msg.data) {
            stopSpeechRecognizer();
            setState('ASSISTANT_SPEAKING');
            const cleanUserText = deduplicateTranscript(currentUserTranscriptRef.current.trim());
            currentUserTranscriptRef.current = cleanUserText;
            optionsRef.current.onModelStartSpeaking?.(
              cleanUserText,
              currentTurnIdRef.current
            );
            playAudioChunk(msg.data, generationIdRef.current);
            setTelemetry((prev) => ({
              ...prev,
              network: {
                ...prev.network,
                audioPacketsReceived: prev.network.audioPacketsReceived + 1,
              },
            }));
          } else if (msg.type === 'user_transcript' && msg.text) {
            if (currentModelTranscriptRef.current.trim()) {
              const prevUser = deduplicateTranscript(currentUserTranscriptRef.current.trim());
              const prevModel = currentModelTranscriptRef.current.trim();
              const prevTurnId = currentTurnIdRef.current;
              turnCountRef.current += 1;
              setTurnCount(turnCountRef.current);
              if (optionsRef.current.onTurnComplete) {
                optionsRef.current.onTurnComplete(prevUser, prevModel, prevTurnId);
              }
              currentUserTranscriptRef.current = '';
              currentModelTranscriptRef.current = '';
              hasServerTranscriptInTurnRef.current = false;
              const nextTurnId = `turn_${liveSessionIdRef.current}_${String(turnCountRef.current).padStart(3, '0')}`;
              currentTurnIdRef.current = nextTurnId;
              setCurrentTurnId(nextTurnId);
            }

            const incomingUserText = msg.text.trim();
            if (incomingUserText) {
              if (!hasServerTranscriptInTurnRef.current) {
                hasServerTranscriptInTurnRef.current = true;
                stopSpeechRecognizer();
                currentUserTranscriptRef.current = incomingUserText;
              } else {
                const current = (currentUserTranscriptRef.current || '').trim();
                if (!current) {
                  currentUserTranscriptRef.current = incomingUserText;
                } else if (incomingUserText.startsWith(current)) {
                  currentUserTranscriptRef.current = incomingUserText;
                } else if (current.includes(incomingUserText) || current.endsWith(incomingUserText)) {
                } else {
                  const needsSpace = !current.endsWith(' ') && !incomingUserText.startsWith(' ') && !/^[.,?!;:]/.test(incomingUserText);
                  currentUserTranscriptRef.current = `${current}${needsSpace ? ' ' : ''}${incomingUserText}`;
                }
              }
              currentUserTranscriptRef.current = deduplicateTranscript(currentUserTranscriptRef.current);
            }

            if (stateRef.current !== 'ASSISTANT_SPEAKING') {
              setState('USER_SPEAKING');
              optionsRef.current.onUserTranscript?.(
                currentUserTranscriptRef.current,
                currentTurnIdRef.current
              );
            }
            turnStartTimeRef.current = performance.now();
            hasReceivedFirstAudioInTurnRef.current = false;

            setTelemetry((prev) => ({
              ...prev,
              audio: {
                ...prev.audio,
                vadEventCount: prev.audio.vadEventCount + 1,
              },
              conversation: {
                ...prev.conversation,
                currentSpeaker: 'user',
                lastUserTranscript: currentUserTranscriptRef.current,
                transcriptStatus: 'streaming',
              },
              agentActivity: {
                state: 'Transcribing',
                updatedAt: nowStr,
              },
            }));
          } else if (msg.type === 'model_transcript' && msg.text) {
            stopSpeechRecognizer();
            setState('ASSISTANT_SPEAKING');
            const cleanUserText = deduplicateTranscript(currentUserTranscriptRef.current.trim());
            currentUserTranscriptRef.current = cleanUserText;
            optionsRef.current.onModelStartSpeaking?.(
              cleanUserText,
              currentTurnIdRef.current
            );
            currentModelTranscriptRef.current += msg.text;
            optionsRef.current.onModelTranscript?.(
              currentModelTranscriptRef.current,
              currentTurnIdRef.current
            );

            setTelemetry((prev) => ({
              ...prev,
              conversation: {
                ...prev.conversation,
                currentSpeaker: 'assistant',
                lastAssistantTranscript: currentModelTranscriptRef.current,
                transcriptStatus: 'streaming',
              },
            }));
          } else if (msg.type === 'interrupted') {
            interruptPlayback();
            hasServerTranscriptInTurnRef.current = false;
            setTelemetry((prev) => ({
              ...prev,
              audio: {
                ...prev.audio,
                interruptionCount: prev.audio.interruptionCount + 1,
              },
            }));
            const interruptedUser = deduplicateTranscript(currentUserTranscriptRef.current.trim());
            const interruptedModel = currentModelTranscriptRef.current.trim();
            const interruptedTurnId = currentTurnIdRef.current;
            if (interruptedUser || interruptedModel) {
              turnCountRef.current += 1;
              setTurnCount(turnCountRef.current);
              if (optionsRef.current.onTurnComplete) {
                optionsRef.current.onTurnComplete(interruptedUser, interruptedModel, interruptedTurnId);
              }
              currentUserTranscriptRef.current = '';
              currentModelTranscriptRef.current = '';
              const nextTurnId = `turn_${liveSessionIdRef.current}_${String(turnCountRef.current).padStart(3, '0')}`;
              currentTurnIdRef.current = nextTurnId;
              setCurrentTurnId(nextTurnId);
            }
          } else if (msg.type === 'turn_complete') {
            isTurnCompleteRef.current = true;
            hasServerTranscriptInTurnRef.current = false;
            if (activeSourcesRef.current.size === 0) {
              setState('LISTENING');
              startSpeechRecognizer();
            }
            const completedUser = deduplicateTranscript(currentUserTranscriptRef.current.trim());
            const completedModel = currentModelTranscriptRef.current.trim();
            const finishedTurnId = currentTurnIdRef.current;

            if (completedUser || completedModel) {
              turnCountRef.current += 1;
              setTurnCount(turnCountRef.current);

              if (optionsRef.current.onTurnComplete) {
                optionsRef.current.onTurnComplete(completedUser, completedModel, finishedTurnId);
              }

              currentUserTranscriptRef.current = '';
              currentModelTranscriptRef.current = '';

              const nextTurnId = `turn_${liveSessionIdRef.current}_${String(turnCountRef.current).padStart(3, '0')}`;
              currentTurnIdRef.current = nextTurnId;
              setCurrentTurnId(nextTurnId);
            }

            setTelemetry((prev) => ({
              ...prev,
              audio: {
                ...prev.audio,
                turnCompleteCount: prev.audio.turnCompleteCount + 1,
              },
              conversation: {
                ...prev.conversation,
                currentTurnId: currentTurnIdRef.current,
                turnNumber: turnCountRef.current,
                currentSpeaker: 'none',
                transcriptStatus: 'finalized',
              },
              agentActivity: {
                state: 'Listening',
                updatedAt: nowStr,
              },
            }));

            if (activeSourcesRef.current.size === 0) {
              setState('LISTENING');
            }
          } else if (msg.type === 'agent_task_start') {
            setState('AGENT_PROCESSING');
            const taskEvent: AgentTaskEvent = {
              domain: msg.domain,
              query: msg.query,
              status: 'running',
              timestamp: nowStr,
            };
            setCurrentAgentTask(taskEvent);
            optionsRef.current.onAgentTaskEvent?.(taskEvent);

            setTelemetry((prev) => ({
              ...prev,
              agentActivity: {
                state: 'Agent requested',
                domain: msg.domain,
                query: msg.query,
                updatedAt: nowStr,
              },
            }));
          } else if (msg.type === 'agent_task_complete') {
            if (msg.toolExecution) {
              globalToolGateway.recordExecution(msg.toolExecution);
            }
            const tool = msg.toolExecution?.tool || msg.structuredDetails?.tool;
            if (tool === 'start_focus_timer' || tool === 'start_timer') {
              const mins = msg.toolExecution?.arguments?.durationMinutes || msg.structuredDetails?.durationMinutes || 25;
              timerManager.start(mins, 'focus');
            } else if (tool === 'pause_focus_timer' || tool === 'pause_timer') {
              timerManager.pause();
            } else if (tool === 'resume_focus_timer' || tool === 'resume_timer') {
              timerManager.resume();
            } else if (tool === 'restart_focus_timer' || tool === 'restart_timer') {
              timerManager.restart();
            } else if (tool === 'stop_focus_timer' || tool === 'stop_timer') {
              timerManager.stop();
            } else if (
              tool === 'create_goal' ||
              tool === 'create_task' ||
              tool === 'delete_goal' ||
              tool === 'delete_task' ||
              tool === 'create_reflection'
            ) {
              optionsRef.current.refreshUserContext?.();
            }
            const taskEvent: AgentTaskEvent = {
              domain: msg.domain,
              status: 'completed',
              spokenSummary: msg.spokenSummary,
              structuredDetails: msg.structuredDetails,
              citations: msg.citations,
              timestamp: nowStr,
            };
            setCurrentAgentTask(taskEvent);
            optionsRef.current.onAgentTaskEvent?.(taskEvent);

            setTelemetry((prev) => ({
              ...prev,
              agentActivity: {
                state: 'Completed',
                domain: msg.domain,
                detail: msg.spokenSummary,
                updatedAt: nowStr,
              },
            }));
          } else if (msg.type === 'end_session_requested') {
            optionsRef.current.onEndSessionRequested?.(msg.reason);
          } else if (msg.type === 'session_closed') {
            stopSpeechRecognizer();
            if (audioPlayerRef.current) {
              audioPlayerRef.current.stopAndFlush();
            }
            activeSourcesRef.current.clear();
            if (wsRef.current) {
              try { wsRef.current.close(); } catch {}
              wsRef.current = null;
            }
            setState('ENDED');
            setErrorMsg('Gemini Live voice session ended. Click Connect to restart.');
            optionsRef.current.onAgentTaskEvent?.({
              domain: 'orchestrator',
              status: 'completed',
              spokenSummary: 'Gemini Live voice session closed. Ready to reconnect.',
              timestamp: nowStr,
            });
            setTelemetry((prev) => ({
              ...prev,
              connection: {
                ...prev.connection,
                wsState: 'CLOSED',
                geminiLiveSession: 'DISCONNECTED',
              },
              agentActivity: {
                state: 'Completed',
                detail: 'Gemini Live voice session disconnected',
                updatedAt: nowStr,
              },
            }));
          } else if (msg.type === 'session_error') {
            stopSpeechRecognizer();
            if (wsRef.current) {
              try { wsRef.current.close(); } catch {}
              wsRef.current = null;
            }
            setErrorMsg(msg.error || 'Gemini Live voice session error');
            setState('ERROR');
            recordError('WebSocketSession', 'SESSION_ERROR', msg.error);
            optionsRef.current.onAgentTaskEvent?.({
              domain: 'orchestrator',
              status: 'completed',
              spokenSummary: msg.error || 'Gemini Live session error occurred.',
              timestamp: nowStr,
            });
          }
        } catch {
          recordError('WebSocketParser', 'PARSE_ERROR', 'Failed to parse incoming WebSocket message');
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        setState('ENDED');
        setTelemetry((prev) => ({
          ...prev,
          connection: {
            ...prev.connection,
            wsState: 'CLOSED',
            geminiLiveSession: 'DISCONNECTED',
          },
        }));
      };

      ws.onerror = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        setState('ERROR');
        setErrorMsg('Connection to voice server lost');
        recordError('WebSocketTransport', 'TRANSPORT_ERROR', 'Connection to voice server lost');
      };
    } catch (err: any) {
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      setState('ERROR');
      setErrorMsg(err.message || 'Failed to connect');
      recordError('WebSocketClient', 'CONNECT_FAILURE', err.message || 'Failed to connect');
    }
  }, [interruptPlayback, playAudioChunk, recordError, setState, startAudioPipeline, startSpeechRecognizer, stopSpeechRecognizer]);

  const disconnect = useCallback(() => {
    generationIdRef.current += 1;

    if (audioPlayerRef.current) {
      audioPlayerRef.current.stopAndFlush();
    }
    activeSourcesRef.current.clear();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (muteGainNodeRef.current) {
      muteGainNodeRef.current.disconnect();
      muteGainNodeRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    stopSpeechRecognizer();

    currentUserTranscriptRef.current = '';
    currentModelTranscriptRef.current = '';
    hasServerTranscriptInTurnRef.current = false;

    setState('ENDED');
    setCurrentAgentTask(null);

    setTelemetry((prev) => ({
      ...prev,
      connection: {
        ...prev.connection,
        wsState: 'CLOSED',
        geminiLiveSession: 'DISCONNECTED',
      },
      audio: {
        ...prev.audio,
        inputActive: false,
        outputActive: false,
        queueDepth: 0,
        audioState: 'ENDED',
      },
    }));
  }, [setState]);

  const resetToIdle = useCallback(() => {
    disconnect();
    setState('IDLE');
    setErrorMsg(null);
    setCurrentAgentTask(null);
    setCurrentTurnId('');
    currentUserTranscriptRef.current = '';
    currentModelTranscriptRef.current = '';
    hasServerTranscriptInTurnRef.current = false;
    setTelemetry((prev) => ({
      ...prev,
      connection: {
        ...prev.connection,
        wsState: 'CLOSED',
        geminiLiveSession: 'DISCONNECTED',
      },
      audio: {
        ...prev.audio,
        inputActive: false,
        outputActive: false,
        queueDepth: 0,
        audioState: 'IDLE',
      },
    }));
  }, [disconnect, setState]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      if (!next) {
        if (inputAudioCtxRef.current?.state === 'suspended') {
          inputAudioCtxRef.current.resume().catch(() => {});
        }
        if (outputAudioCtxRef.current?.state === 'suspended') {
          outputAudioCtxRef.current.resume().catch(() => {});
        }
        audioPlayerRef.current?.resume().catch(() => {});
      }
      return next;
    });
  }, []);

  const updateUserData = useCallback((userData: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'update_user_data',
          userData,
        })
      );
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (sessionStartTimeRef.current > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        const uptime = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
        setTelemetry((prev) => ({
          ...prev,
          connection: {
            ...prev.connection,
            uptimeSeconds: uptime,
          },
          audio: {
            ...prev.audio,
            outputAudioContextState: outputAudioCtxRef.current?.state || 'none',
          },
          network: {
            ...prev.network,
            latencyMs,
          },
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [latencyMs]);

  useEffect(() => {
    const unsubCal = calendarStateManager.subscribe(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'calendar_state_update',
            calendarState: calendarStateManager.getState(),
            calendarToken: calendarStateManager.getAccessToken(),
          })
        );
      }
    });

    const unsubAction = subscribeUserActions((event) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(event));
      }
    });

    return () => {
      unsubCal();
      unsubAction();
    };
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    isMuted,
    turnCount,
    latencyMs,
    currentAgentTask,
    errorMsg,
    liveSessionId,
    currentTurnId,
    telemetry,
    connect,
    disconnect,
    resetToIdle,
    toggleMute,
    interruptNow: interruptPlayback,
    updateUserData,
  };
}
