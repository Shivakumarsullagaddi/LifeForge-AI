import { logStructured } from './logger';
import { authoritativeState } from './state/applicationState';

export type TimerStatus = 'STOPPED' | 'WAITING_CONFIRMATION' | 'RUNNING' | 'PAUSED' | 'COMPLETED';

export interface TimerState {
  timerId: string;
  status: TimerStatus;
  mode: 'focus' | 'break';
  duration: number;
  durationSeconds: number;
  startedAt: number | null;
  targetTime: number | null;
  targetEndTime: number | null;
  remainingTime: number;
  remainingSeconds: number;
  cyclesCompleted: number;
  label: string;
  pendingConfirmationDuration?: number | null;
}

function playTimerChime(type: 'STARTED' | 'PAUSED' | 'RESUMED' | 'COMPLETED' | 'STOPPED') {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx = new AudioCtxClass();
    const now = ctx.currentTime;

    if (type === 'STARTED' || type === 'RESUMED') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'PAUSED' || type === 'STOPPED') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.15);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'COMPLETED') {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.09, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.3);
      });
    }
  } catch {}
}

const STORAGE_KEY = 'lifeforge_canonical_timer';

const globalForTimer = globalThis as unknown as {
  __lifeforge_timer_manager?: TimerManager;
};

export class TimerManager {
  private static instance: TimerManager;
  private timerId: string = 'global_focus_timer';
  private status: TimerStatus = 'STOPPED';
  private mode: 'focus' | 'break' = 'focus';
  private duration: number = 25 * 60;
  private startedAt: number | null = null;
  private targetTime: number | null = null;
  private remainingTime: number = 25 * 60;
  private cyclesCompleted: number = 0;
  private label: string = 'DSA Deep Work Focus';
  private pendingConfirmationDuration: number | null = null;
  private listeners: Set<() => void> = new Set();
  private intervalId: any = null;

  private constructor() {
    this.restoreFromStorage();
    this.startTicker();
  }

  public static getInstance(): TimerManager {
    if (!globalForTimer.__lifeforge_timer_manager) {
      globalForTimer.__lifeforge_timer_manager = new TimerManager();
    }
    return globalForTimer.__lifeforge_timer_manager;
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const data = {
        timerId: this.timerId,
        status: this.status,
        mode: this.mode,
        duration: this.duration,
        startedAt: this.startedAt,
        targetTime: this.targetTime,
        remainingTime: this.remainingTime,
        cyclesCompleted: this.cyclesCompleted,
        label: this.label,
        pendingConfirmationDuration: this.pendingConfirmationDuration,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  private restoreFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.timerId = data.timerId || this.timerId;
      this.status = data.status || this.status;
      this.mode = data.mode || this.mode;
      this.duration = data.duration || this.duration;
      this.startedAt = data.startedAt || null;
      this.targetTime = data.targetTime || null;
      this.cyclesCompleted = data.cyclesCompleted || 0;
      this.label = data.label || this.label;
      this.pendingConfirmationDuration = data.pendingConfirmationDuration || null;

      if (this.status === 'RUNNING' && this.targetTime) {
        const remaining = Math.max(0, Math.round((this.targetTime - Date.now()) / 1000));
        this.remainingTime = remaining;
        if (remaining <= 0) {
          this.status = 'COMPLETED';
          this.targetTime = null;
        }
      } else {
        this.remainingTime = data.remainingTime ?? this.duration;
      }
    } catch {}
  }

  public getState(): TimerState {
    let currentRemaining = this.remainingTime;
    if (this.status === 'RUNNING' && this.targetTime) {
      currentRemaining = Math.max(0, Math.round((this.targetTime - Date.now()) / 1000));
    }
    return {
      timerId: this.timerId,
      status: this.status,
      mode: this.mode,
      duration: this.duration,
      durationSeconds: this.duration,
      startedAt: this.startedAt,
      targetTime: this.targetTime,
      targetEndTime: this.targetTime,
      remainingTime: currentRemaining,
      remainingSeconds: currentRemaining,
      cyclesCompleted: this.cyclesCompleted,
      label: this.label,
      pendingConfirmationDuration: this.pendingConfirmationDuration,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.saveToStorage();
    try {
      const state = this.getState();
      authoritativeState.updateTimer({
        status:
          state.status === 'RUNNING'
            ? 'RUNNING'
            : state.status === 'PAUSED'
            ? 'PAUSED'
            : state.status === 'COMPLETED'
            ? 'COMPLETED'
            : 'STOPPED',
        mode: state.mode,
        durationSeconds: state.durationSeconds,
        remainingSeconds: state.remainingSeconds,
        startedAt: state.startedAt ? new Date(state.startedAt).toISOString() : undefined,
      });
    } catch {}
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  private startTicker(): void {
    if (typeof window === 'undefined') return;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => {
      if (this.status === 'RUNNING' && this.targetTime) {
        const remaining = Math.max(0, Math.round((this.targetTime - Date.now()) / 1000));
        this.remainingTime = remaining;
        if (remaining <= 0) {
          if (this.mode === 'focus') {
            this.cyclesCompleted += 1;
            const breakSec = 5 * 60;
            this.mode = 'break';
            this.duration = breakSec;
            this.remainingTime = breakSec;
            this.targetTime = Date.now() + breakSec * 1000;
            this.label = 'Recharge & Rest';
            playTimerChime('COMPLETED');
          } else {
            this.status = 'COMPLETED';
            this.targetTime = null;
            this.mode = 'focus';
            this.remainingTime = 0;
            this.label = 'Session Completed';
            playTimerChime('COMPLETED');
          }
        }
        this.notify();
      }
    }, 1000);
  }

  public requestConfirmation(minutes = 25, label = 'DSA Deep Work Focus'): void {
    this.pendingConfirmationDuration = minutes;
    this.status = 'WAITING_CONFIRMATION';
    this.label = label;
    this.notify();
  }

  public cancelConfirmation(): void {
    this.pendingConfirmationDuration = null;
    this.status = 'STOPPED';
    this.notify();
  }

  public start(
    minutes = 25,
    modeOrLabel: 'focus' | 'break' | string = 'focus',
    maybeLabel?: string
  ): void {
    let mode: 'focus' | 'break' = 'focus';
    let label = 'DSA Deep Work Focus';
    if (modeOrLabel === 'break') {
      mode = 'break';
      if (maybeLabel) label = maybeLabel;
    } else if (modeOrLabel === 'focus') {
      mode = 'focus';
      if (maybeLabel) label = maybeLabel;
    } else if (typeof modeOrLabel === 'string') {
      label = modeOrLabel;
    }
    const durSeconds = Math.max(60, minutes * 60);
    const now = Date.now();
    this.duration = durSeconds;
    this.remainingTime = durSeconds;
    this.mode = mode;
    this.startedAt = now;
    this.targetTime = now + durSeconds * 1000;
    this.status = 'RUNNING';
    this.label = label;
    this.pendingConfirmationDuration = null;
    playTimerChime('STARTED');
    logStructured('TIMER', `Timer started`, { mode, minutes, status: 'RUNNING', label });
    this.notify();
  }

  public startBreak(minutes = 5, label = 'Recharge & Rest'): void {
    this.start(minutes, 'break', label);
  }

  public pause(): void {
    if (this.targetTime) {
      this.remainingTime = Math.max(0, Math.round((this.targetTime - Date.now()) / 1000));
    }
    this.targetTime = null;
    this.status = 'PAUSED';
    playTimerChime('PAUSED');
    this.notify();
  }

  public resume(): void {
    const now = Date.now();
    this.targetTime = now + (this.remainingTime || this.duration) * 1000;
    this.status = 'RUNNING';
    playTimerChime('RESUMED');
    this.notify();
  }

  public restart(): void {
    const now = Date.now();
    this.remainingTime = this.duration;
    this.startedAt = now;
    this.targetTime = now + this.duration * 1000;
    this.status = 'RUNNING';
    playTimerChime('STARTED');
    this.notify();
  }

  public stop(): void {
    this.status = 'STOPPED';
    this.remainingTime = this.duration;
    this.targetTime = null;
    this.startedAt = null;
    this.pendingConfirmationDuration = null;
    playTimerChime('STOPPED');
    this.notify();
  }
}

export const timerManager = TimerManager.getInstance();
