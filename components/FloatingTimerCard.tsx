'use client';

import React from 'react';
import { useLiveVoiceContext } from '@/lib/live-voice-context';
import { uiActionBus } from '@/lib/events/uiEvents';
import { Play, Pause, Square, Coffee, Sparkles } from 'lucide-react';

export const FloatingTimerCard: React.FC = () => {
  const { timerState, pauseTimer, resumeTimer, stopTimer, startTimer } = useLiveVoiceContext();

  const isVisible =
    timerState.status === 'RUNNING' ||
    timerState.status === 'PAUSED' ||
    (timerState.status === 'COMPLETED' && timerState.mode === 'break') ||
    (timerState.status === 'COMPLETED' && timerState.mode === 'focus');

  if (!isVisible && timerState.status === 'STOPPED') {
    return null;
  }

  const mins = Math.floor((timerState.remainingSeconds || timerState.remainingTime || 0) / 60);
  const secs = (timerState.remainingSeconds || timerState.remainingTime || 0) % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const isBreakReady = timerState.status === 'COMPLETED' && timerState.mode === 'focus';
  const isRunning = timerState.status === 'RUNNING';

  return (
    <div
      data-testid="floating-timer-card"
      className="fixed bottom-14 left-6 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-amber-500/60 shadow-2xl backdrop-blur-md text-slate-100 animate-fade-in"
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
            timerState.mode === 'break'
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              : 'bg-amber-950 text-amber-300 border border-amber-800'
          }`}
        >
          {timerState.mode === 'break' ? 'BREAK' : 'FOCUS'}
        </span>
        <span className="font-mono text-sm font-bold tracking-tight text-slate-100">
          {isBreakReady ? '5:00 BREAK' : timeFormatted}
        </span>
      </div>

      <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
        {isBreakReady ? (
          <>
            <button
              onClick={() => {
                uiActionBus.emit('START_TIMER', { durationSeconds: 300, mode: 'break' });
                startTimer(5, 'break', 'Recharge & Rest');
              }}
              className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 transition-colors"
            >
              <Coffee className="w-3 h-3" /> Start Break
            </button>
            <button
              onClick={() => {
                uiActionBus.emit('STOP_TIMER');
                stopTimer();
              }}
              className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Skip
            </button>
          </>
        ) : (
          <>
            {isRunning ? (
              <button
                onClick={() => {
                  uiActionBus.emit('PAUSE_TIMER');
                  pauseTimer();
                }}
                title="Pause"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => {
                  uiActionBus.emit('RESUME_TIMER');
                  resumeTimer();
                }}
                title="Resume"
                className="p-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 transition-colors font-bold"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
              </button>
            )}
            <button
              onClick={() => {
                uiActionBus.emit('STOP_TIMER');
                stopTimer();
              }}
              title="Stop"
              className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
