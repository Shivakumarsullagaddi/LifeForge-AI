'use client';

import React, { useState } from 'react';
import {
  Activity,
  Mic,
  Volume2,
  Cpu,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import type { ActionConfirmation } from '@/lib/types';

interface AgentActivityBarProps {
  activeAgent?: string;
  isLiveActive?: boolean;
  statusText?: string;
  pendingConfirmations?: ActionConfirmation[];
  onApproveAction?: (actionId: string) => void;
  onRejectAction?: (actionId: string) => void;
}

export const AgentActivityBar: React.FC<AgentActivityBarProps> = ({
  activeAgent = 'Orchestrator Agent',
  isLiveActive = false,
  statusText = 'System Ready · Isolated Firestore Active',
  pendingConfirmations = [],
  onApproveAction,
  onRejectAction,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-t border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-2.5 text-xs text-slate-300">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Active agent & session status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium text-slate-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-amber-400 font-semibold">{activeAgent}</span>
          </div>

          <span className="text-slate-600">|</span>

          <div className="flex items-center gap-2 text-slate-400">
            <Cpu className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate max-w-[260px] sm:max-w-md">{statusText}</span>
          </div>
        </div>

        {/* Center/Right: Session hardware / tool indicator & confirmation alerts */}
        <div className="flex items-center gap-3">
          {pendingConfirmations.length > 0 && (
            <Badge variant="rose" size="sm" className="animate-pulse">
              <ShieldAlert className="w-3 h-3" />
              <span>{pendingConfirmations.length} Action(s) Require Confirmation</span>
            </Badge>
          )}

          <div className="hidden sm:flex items-center gap-2 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800 text-[11px] text-slate-400">
            <div className="flex items-center gap-1" title="Microphone">
              <Mic className={`w-3 h-3 ${isLiveActive ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span>{isLiveActive ? 'Mic On' : 'Mic Idle'}</span>
            </div>
            <span className="text-slate-700">·</span>
            <div className="flex items-center gap-1" title="Audio Synthesis">
              <Volume2 className="w-3 h-3 text-slate-500" />
              <span>Audio Worklet</span>
            </div>
            <span className="text-slate-700">·</span>
            <div className="flex items-center gap-1" title="Tool Gateway">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Tool Gateway Secure</span>
            </div>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors p-1"
          >
            <Activity className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-medium text-[11px]">Observability</span>
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Expanded Observability Drawer */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Subsystem Isolation State */}
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-slate-200 font-medium">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Security & Isolation</span>
              </div>
              <Badge variant="emerald" size="sm">Enforced</Badge>
            </div>
            <p className="text-slate-400 text-[11px]">
              Database: <code className="text-amber-300">ai-studio-lifeforgeai</code>
            </p>
            <p className="text-slate-400 text-[11px]">
              Scope: <span className="text-emerald-400">request.auth.uid == userId</span>
            </p>
          </div>

          {/* Active Tool Gateway Pipeline */}
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-slate-200 font-medium">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>Tool Gateway Status</span>
              </div>
              <Badge variant="slate" size="sm">0 ms</Badge>
            </div>
            <p className="text-slate-400 text-[11px]">
              Human-in-the-loop authorization barrier enabled for destructive actions.
            </p>
          </div>

          {/* Pending Confirmations Handler */}
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-slate-200 font-medium">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-400" />
                <span>Action Confirmations</span>
              </div>
              <span className="text-slate-400 text-[11px]">{pendingConfirmations.length} Pending</span>
            </div>
            {pendingConfirmations.length === 0 ? (
              <p className="text-slate-500 text-[11px]">No pending sensitive actions requiring confirmation.</p>
            ) : (
              <div className="space-y-2">
                {pendingConfirmations.map((action) => (
                  <div key={action.id} className="p-2 bg-slate-950 rounded border border-rose-900/40 text-[11px] space-y-1.5">
                    <div className="font-semibold text-rose-300">{action.title}</div>
                    <p className="text-slate-400">{action.description}</p>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onApproveAction?.(action.id)}
                        className="h-6 text-[10px] px-2"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRejectAction?.(action.id)}
                        className="h-6 text-[10px] px-2 text-rose-300"
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
