import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from '@google/genai';
import { executeAgentTask } from './lib/live/agentHandoff';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface ClientSessionState {
  userId: string;
  userProfile?: any;
  activeDomain?: string;
  userData?: any;
  liveSession?: any;
  pingInterval?: NodeJS.Timeout;
  isAlive: boolean;
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request', req.url, err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '', true);
    if (pathname === '/api/live-ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    const sessionState: ClientSessionState = {
      userId: 'anonymous_user',
      isAlive: true,
    };

    // Keepalive ping/pong
    clientWs.on('pong', () => {
      sessionState.isAlive = true;
    });

    sessionState.pingInterval = setInterval(() => {
      if (!sessionState.isAlive) {
        console.log('[Live WS] Client heartbeat timed out, terminating');
        clientWs.terminate();
        return;
      }
      sessionState.isAlive = false;
      clientWs.ping();
    }, 25000);

    const safeSend = (payload: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    clientWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // 1. Initialize Gemini 3.1 Flash Live Session
        if (msg.type === 'init') {
          sessionState.userId = msg.userId || 'current_user';
          sessionState.userProfile = msg.userProfile;
          sessionState.activeDomain = msg.activeDomain || 'orchestrator';
          sessionState.userData = msg.userData;

          const userName = sessionState.userProfile?.displayName || 'Student';
          const targetGoal = sessionState.userProfile?.primaryGoal || 'mastering computer science & engineering placements';

          const systemInstruction = `You are LifeForge AI Live Voice Coach, a disciplined, direct, calm, intelligent, supportive, and solution-oriented mentor speaking in real-time with ${userName}.
Target Goal: ${targetGoal}.

CORE COACHING PRINCIPLES:
- "If you fall, stand up and continue. Avoid unnecessary excuses. Focus on solutions."
- "Do the work you genuinely want to become excellent at."
- "Learn through logic rather than rote memorization."
- "Something is better than nothing."

VOICE GUIDELINES:
- Speak naturally, concisely, and punchily (1 to 3 sentences per spoken turn).
- Avoid robotic filler, bullet point readings, or marketing fluff.
- Be encouraging yet strictly accountable.
- Never diagnose medical or psychiatric conditions.
- Never suggest sleep deprivation, starvation, or self-harm as punishment.
- For deep history retrieval, complex study problems, placement skill-gap analysis, or company research, invoke the \`request_agent_task\` tool so Gemini 3.8 Flash can perform specialist reasoning.`;

          try {
            // Connect to Gemini 3.1 Flash Live
            const liveSession = await ai.live.connect({
              model: 'gemini-3.1-flash-live-preview',
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: 'Zephyr',
                    },
                  },
                },
                systemInstruction,
                outputAudioTranscription: {},
                inputAudioTranscription: {},
                tools: [
                  {
                    functionDeclarations: [
                      {
                        name: 'request_agent_task',
                        description: 'Delegate complex student inquiries, private user memory/study retrieval, placement analysis, or research to the Gemini 3.8 Flash reasoning engine.',
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            domain: {
                              type: Type.STRING,
                              description: 'The specialist agent domain: study, placement, wellbeing, reflection, research, calendar, goals.',
                            },
                            query: {
                              type: Type.STRING,
                              description: 'The specific question or task for Gemini 3.8 Flash.',
                            },
                          },
                          required: ['domain', 'query'],
                        },
                      },
                    ],
                  },
                ],
              },
              callbacks: {
                onmessage: async (message: LiveServerMessage) => {
                  try {
                    // 1. Audio chunks streamed back
                    const parts = message.serverContent?.modelTurn?.parts || [];
                    for (const part of parts) {
                      if (part.inlineData?.data) {
                        safeSend({
                          type: 'audio',
                          data: part.inlineData.data,
                        });
                      }
                      if (part.text) {
                        safeSend({
                          type: 'model_transcript',
                          text: part.text,
                        });
                      }
                    }

                    // 2. Transcriptions
                    const serverContentAny = message.serverContent as any;
                    const modelTranscript =
                      serverContentAny?.outputAudioTranscription?.text ||
                      serverContentAny?.outputTranscription?.text;
                    if (modelTranscript) {
                      safeSend({
                        type: 'model_transcript',
                        text: modelTranscript,
                      });
                    }

                    const userTranscript =
                      serverContentAny?.inputAudioTranscription?.text ||
                      serverContentAny?.inputTranscription?.text;
                    if (userTranscript) {
                      safeSend({
                        type: 'user_transcript',
                        text: userTranscript,
                      });
                    }

                    // 3. Interrupted (Barge-in detected by model)
                    if (message.serverContent?.interrupted) {
                      safeSend({ type: 'interrupted' });
                    }

                    // 4. Turn Complete
                    if (message.serverContent?.turnComplete) {
                      safeSend({ type: 'turn_complete' });
                    }

                    // 5. Tool Calls (Handoff to Gemini 3.8 Flash)
                    const toolCalls = message.toolCall?.functionCalls || [];
                    for (const call of toolCalls) {
                      if (call.name === 'request_agent_task') {
                        const { domain = 'study', query = '' } = (call.args as any) || {};

                        safeSend({
                          type: 'agent_task_start',
                          domain,
                          query,
                        });

                        // Call Gemini 3.8 Flash
                        const taskResult = await executeAgentTask({
                          userId: sessionState.userId,
                          domain: domain as any,
                          query,
                          userData: sessionState.userData,
                        });

                        safeSend({
                          type: 'agent_task_complete',
                          domain,
                          spokenSummary: taskResult.spokenSummary,
                          structuredDetails: taskResult.structuredDetails,
                          citations: taskResult.citations,
                        });

                        // Return response to Gemini 3.1 Live
                        await liveSession.sendToolResponse({
                          functionResponses: [
                            {
                              id: call.id,
                              response: {
                                output: taskResult.spokenSummary,
                              },
                            },
                          ],
                        });
                      }
                    }
                  } catch (callbackErr) {
                    console.error('[Live WS] Error processing LiveServerMessage:', callbackErr);
                  }
                },
                onclose: () => {
                  console.log('[Live WS] Gemini Live session closed');
                  safeSend({ type: 'session_closed' });
                },
                onerror: (liveErr) => {
                  console.error('[Live WS] Gemini Live session error:', liveErr);
                  safeSend({ type: 'session_error', error: String(liveErr) });
                },
              },
            });

            sessionState.liveSession = liveSession;
            safeSend({
              type: 'session_ready',
              model: 'gemini-3.1-flash-live-preview',
            });
            console.log(`[Live WS] Session connected for user: ${sessionState.userId}`);
          } catch (connErr: any) {
            console.error('[Live WS] Failed to connect to Gemini Live:', connErr);
            safeSend({
              type: 'session_error',
              error: connErr.message || 'Failed to establish Gemini Live session',
            });
          }
        }

        // 2. Incoming 16kHz PCM Audio from Client
        else if (msg.type === 'audio' && sessionState.liveSession && msg.data) {
          try {
            sessionState.liveSession.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } catch (audioErr) {
            console.error('[Live WS] Failed to send audio chunk to Gemini Live:', audioErr);
          }
        }

        // 3. User Interruption Signal (Client-Side Barge-In)
        else if (msg.type === 'interrupt') {
          safeSend({ type: 'interrupted' });
        }

        // 4. Update Cached User Data (for hybrid retrieval handoffs)
        else if (msg.type === 'update_user_data') {
          sessionState.userData = msg.userData;
        }
      } catch (parseErr) {
        console.error('[Live WS] Error parsing client message:', parseErr);
      }
    });

    // Cleanup on disconnect
    const cleanup = () => {
      if (sessionState.pingInterval) {
        clearInterval(sessionState.pingInterval);
      }
      if (sessionState.liveSession) {
        try {
          sessionState.liveSession.close();
        } catch (e) {
          // ignore
        }
        sessionState.liveSession = null;
      }
      console.log(`[Live WS] Cleaned up session for user: ${sessionState.userId}`);
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', (err) => {
      console.error('[Live WS] Client WebSocket error:', err);
      cleanup();
    });
  });

  server.listen(port, () => {
    console.log(`> LifeForge AI server listening on http://${hostname}:${port}`);
  });
});
