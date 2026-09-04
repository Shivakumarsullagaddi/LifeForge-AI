'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type AudioState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LISTENING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'RECONNECTING'
  | 'ERROR'
  | 'DISCONNECTED';

export interface AgentTaskEvent {
  domain: string;
  query?: string;
  status: 'running' | 'completed';
  spokenSummary?: string;
  structuredDetails?: Record<string, any>;
  citations?: Array<{ title?: string; uri?: string }>;
  timestamp: string;
}

export interface LiveVoiceOptions {
  userId: string;
  userProfile?: any;
  activeDomain?: string;
  userData?: any;
  onUserTranscript?: (text: string) => void;
  onModelTranscript?: (text: string) => void;
  onTurnComplete?: (userText: string, modelText: string) => void;
  onAgentTaskEvent?: (event: AgentTaskEvent) => void;
}

export function useLiveVoice(options: LiveVoiceOptions) {
  const [state, setState] = useState<AudioState>('IDLE');
  const [micLevel, setMicLevel] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [turnCount, setTurnCount] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [currentAgentTask, setCurrentAgentTask] = useState<AgentTaskEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // References to keep state across callbacks
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Playback queue & barge-in refs
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isTurnCompleteRef = useRef<boolean>(true);
  const turnStartTimeRef = useRef<number>(0);
  const hasReceivedFirstAudioInTurnRef = useRef<boolean>(false);

  // Transcription buffer refs
  const currentUserTranscriptRef = useRef<string>('');
  const currentModelTranscriptRef = useRef<string>('');

  // Energy / VAD for client-side barge-in
  const consecutiveHighEnergyFramesRef = useRef<number>(0);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Helper: Convert Float32Array to 16-bit Int16 PCM Base64
  const float32ToBase64PCM = (float32Array: Float32Array): string => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  };

  // Helper: Decode Base64 24kHz Int16 PCM to AudioBuffer
  const base64PCMToAudioBuffer = (
    base64Data: string,
    audioCtx: AudioContext
  ): AudioBuffer => {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    return audioBuffer;
  };

  // 1. Interrupt / Stop Playback Immediately (Barge-In)
  const interruptPlayback = useCallback(() => {
    if (activeSourcesRef.current.size > 0) {
      activeSourcesRef.current.forEach((source) => {
        try {
          source.stop();
          source.disconnect();
        } catch (e) {
          // Ignore if already stopped
        }
      });
      activeSourcesRef.current.clear();
    }

    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    }

    setState('INTERRUPTED');
    setTimeout(() => {
      setState('LISTENING');
    }, 150);

    // Notify WebSocket server of interruption
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
  }, []);

  // 2. Schedule and Play Streamed 24kHz Audio Chunk
  const playAudioChunk = useCallback((base64Data: string) => {
    if (!outputAudioCtxRef.current) return;

    if (outputAudioCtxRef.current.state === 'suspended') {
      outputAudioCtxRef.current.resume();
    }

    // Measure latency to first audio chunk of a response
    if (!hasReceivedFirstAudioInTurnRef.current && turnStartTimeRef.current > 0) {
      const firstAudioLatency = Math.round(performance.now() - turnStartTimeRef.current);
      setLatencyMs(firstAudioLatency);
      hasReceivedFirstAudioInTurnRef.current = true;
    }

    const audioBuffer = base64PCMToAudioBuffer(base64Data, outputAudioCtxRef.current);
    const source = outputAudioCtxRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputAudioCtxRef.current.destination);

    const currentTime = outputAudioCtxRef.current.currentTime;
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime + 0.02; // Small 20ms jitter cushion
    }

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;

    activeSourcesRef.current.add(source);
    isTurnCompleteRef.current = false;
    setState('SPEAKING');

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0 && isTurnCompleteRef.current) {
        setState('LISTENING');
      }
    };
  }, []);

  // 3. Start Recording & Audio Pipeline
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

      // AudioContexts
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputAudioCtx = new AudioCtxClass({ sampleRate: 16000 });
      const outputAudioCtx = new AudioCtxClass({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputAudioCtx;
      outputAudioCtxRef.current = outputAudioCtx;

      const source = inputAudioCtx.createMediaStreamSource(stream);

      // Try AudioWorklet first
      let workletLoaded = false;
      try {
        await inputAudioCtx.audioWorklet.addModule('/audio-processor.js');
        const workletNode = new AudioWorkletNode(inputAudioCtx, 'pcm-processor');
        workletNode.port.onmessage = (e) => {
          if (isMuted) return;
          const pcmInt16 = e.data as Int16Array;

          // Calculate RMS level for visualizer & client VAD barge-in
          let sumSquares = 0;
          for (let i = 0; i < pcmInt16.length; i++) {
            const normalized = pcmInt16[i] / 32768.0;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / pcmInt16.length);
          setMicLevel(Math.min(1, rms * 5));

          // Client-side Barge-In check: If assistant is speaking and user speaks loudly
          if (activeSourcesRef.current.size > 0 && rms > 0.045) {
            consecutiveHighEnergyFramesRef.current++;
            if (consecutiveHighEnergyFramesRef.current >= 2) {
              interruptPlayback();
              consecutiveHighEnergyFramesRef.current = 0;
            }
          } else {
            consecutiveHighEnergyFramesRef.current = 0;
          }

          // Send PCM to WebSocket
          const uint8Array = new Uint8Array(pcmInt16.buffer);
          let binary = '';
          for (let i = 0; i < uint8Array.byteLength; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
          }
        };

        source.connect(workletNode);
        workletNode.connect(inputAudioCtx.destination);
        audioWorkletNodeRef.current = workletNode;
        workletLoaded = true;
      } catch (workletErr) {
        console.warn('AudioWorklet module not available, using ScriptProcessorNode fallback:', workletErr);
      }

      // Fallback: ScriptProcessorNode
      if (!workletLoaded) {
        const processor = inputAudioCtx.createScriptProcessor(2048, 1, 1);
        processor.onaudioprocess = (e) => {
          if (isMuted) return;
          const inputData = e.inputBuffer.getChannelData(0);

          let sumSquares = 0;
          for (let i = 0; i < inputData.length; i++) {
            sumSquares += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sumSquares / inputData.length);
          setMicLevel(Math.min(1, rms * 5));

          if (activeSourcesRef.current.size > 0 && rms > 0.045) {
            consecutiveHighEnergyFramesRef.current++;
            if (consecutiveHighEnergyFramesRef.current >= 2) {
              interruptPlayback();
              consecutiveHighEnergyFramesRef.current = 0;
            }
          } else {
            consecutiveHighEnergyFramesRef.current = 0;
          }

          const base64 = float32ToBase64PCM(inputData);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
          }
        };

        source.connect(processor);
        processor.connect(inputAudioCtx.destination);
        scriptProcessorRef.current = processor;
      }
    } catch (err: any) {
      console.error('Failed to initialize microphone stream:', err);
      setState('ERROR');
      setErrorMsg(err.message || 'Microphone access denied or unavailable');
    }
  }, [interruptPlayback, isMuted]);

  // 4. Connect WebSocket to Gemini 3.1 Flash Live
  const connect = useCallback(async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    setState('CONNECTING');
    setErrorMsg(null);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/live-ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('[Live Voice] Connected to WebSocket bridge');
        setState('LISTENING');

        // Send init message
        ws.send(
          JSON.stringify({
            type: 'init',
            userId: optionsRef.current.userId,
            userProfile: optionsRef.current.userProfile,
            activeDomain: optionsRef.current.activeDomain,
            userData: optionsRef.current.userData,
          })
        );

        // Start mic stream
        await startAudioPipeline();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'session_ready') {
            console.log('[Live Voice] Gemini 3.1 Flash Live Session active');
            setState('LISTENING');
          } else if (msg.type === 'audio' && msg.data) {
            playAudioChunk(msg.data);
          } else if (msg.type === 'user_transcript' && msg.text) {
            currentUserTranscriptRef.current += msg.text;
            optionsRef.current.onUserTranscript?.(currentUserTranscriptRef.current);
            turnStartTimeRef.current = performance.now();
            hasReceivedFirstAudioInTurnRef.current = false;
          } else if (msg.type === 'model_transcript' && msg.text) {
            currentModelTranscriptRef.current += msg.text;
            optionsRef.current.onModelTranscript?.(currentModelTranscriptRef.current);
          } else if (msg.type === 'interrupted') {
            interruptPlayback();
          } else if (msg.type === 'turn_complete') {
            isTurnCompleteRef.current = true;
            setTurnCount((prev) => prev + 1);

            if (optionsRef.current.onTurnComplete) {
              optionsRef.current.onTurnComplete(
                currentUserTranscriptRef.current.trim(),
                currentModelTranscriptRef.current.trim()
              );
            }

            currentUserTranscriptRef.current = '';
            currentModelTranscriptRef.current = '';

            if (activeSourcesRef.current.size === 0) {
              setState('LISTENING');
            }
          } else if (msg.type === 'agent_task_start') {
            const taskEvent: AgentTaskEvent = {
              domain: msg.domain,
              query: msg.query,
              status: 'running',
              timestamp: new Date().toLocaleTimeString(),
            };
            setCurrentAgentTask(taskEvent);
            optionsRef.current.onAgentTaskEvent?.(taskEvent);
          } else if (msg.type === 'agent_task_complete') {
            const taskEvent: AgentTaskEvent = {
              domain: msg.domain,
              status: 'completed',
              spokenSummary: msg.spokenSummary,
              structuredDetails: msg.structuredDetails,
              citations: msg.citations,
              timestamp: new Date().toLocaleTimeString(),
            };
            setCurrentAgentTask(taskEvent);
            optionsRef.current.onAgentTaskEvent?.(taskEvent);
          } else if (msg.type === 'session_error') {
            console.error('[Live Voice] Session Error:', msg.error);
            setErrorMsg(msg.error);
            setState('ERROR');
          }
        } catch (e) {
          console.error('[Live Voice] Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        console.log('[Live Voice] WebSocket closed');
        setState('DISCONNECTED');
      };

      ws.onerror = (err) => {
        console.error('[Live Voice] WebSocket error:', err);
        setState('ERROR');
        setErrorMsg('Connection to voice server lost');
      };
    } catch (err: any) {
      console.error('[Live Voice] Failed to connect WebSocket:', err);
      setState('ERROR');
      setErrorMsg(err.message || 'Failed to connect');
    }
  }, [interruptPlayback, playAudioChunk, startAudioPipeline]);

  // 5. Disconnect & Full Cleanup
  const disconnect = useCallback(() => {
    // 1. Interrupt playing audio
    if (activeSourcesRef.current.size > 0) {
      activeSourcesRef.current.forEach((s) => {
        try {
          s.stop();
          s.disconnect();
        } catch (e) {
          // ignore
        }
      });
      activeSourcesRef.current.clear();
    }

    // 2. Stop mic track
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // 3. Disconnect audio nodes & close contexts
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close();
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close();
      outputAudioCtxRef.current = null;
    }

    // 4. Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState('DISCONNECTED');
    setMicLevel(0);
    setCurrentAgentTask(null);
  }, []);

  // Update cached user data on the server when client state updates
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

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    micLevel,
    isMuted,
    turnCount,
    latencyMs,
    currentAgentTask,
    errorMsg,
    connect,
    disconnect,
    toggleMute,
    interruptNow: interruptPlayback,
    updateUserData,
  };
}
