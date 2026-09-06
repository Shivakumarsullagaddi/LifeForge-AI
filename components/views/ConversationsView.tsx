'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useAuth } from '@/lib/auth-context';
import { subscribeConversations, subscribeConversationMessages } from '@/lib/firebase';
import type { ConversationSession, ChatMessage } from '@/lib/types';
import { MessageSquare, Pin, Bot, User, Search, ArrowRight } from 'lucide-react';

interface ConversationsViewProps {
  onSelectConversation?: (id: string) => void;
}

const safeFormatDate = (val: any): string => {
  if (!val) return '';
  try {
    if (typeof val === 'object' && typeof val.seconds === 'number') {
      return new Date(val.seconds * 1000).toLocaleDateString();
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  } catch {
    return '';
  }
};

const safeFormatTime = (val: any): string => {
  if (!val) return '';
  try {
    if (typeof val === 'object' && typeof val.seconds === 'number') {
      return new Date(val.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const ConversationsView: React.FC<ConversationsViewProps> = ({
  onSelectConversation,
}) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    return conversations
      .filter(Boolean)
      .filter((c) => {
        const q = (searchQuery || '').toLowerCase().trim();
        if (!q) return true;
        const title = String(c.title || '').toLowerCase();
        const preview = String(c.lastMessagePreview || '').toLowerCase();
        return title.includes(q) || preview.includes(q);
      });
  }, [conversations, searchQuery]);

  const selectedConv = useMemo(() => {
    if (selectedId) {
      const found = filteredConversations.find((c) => c && c.id === selectedId) || conversations.find((c) => c && c.id === selectedId);
      if (found) return found;
    }
    return filteredConversations.length > 0 ? filteredConversations[0] : null;
  }, [filteredConversations, conversations, selectedId]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeConversations(
      user.uid,
      (list) => {
        const safeList = Array.isArray(list) ? list.filter(Boolean) : [];
        setConversations(safeList);
        setSelectedId((prev) => {
          const currentTarget = selectedIdRef.current || prev;
          if (currentTarget) {
            const exists = safeList.some((c) => c && c.id === currentTarget);
            if (exists) return currentTarget;
          }
          return safeList.length > 0 ? safeList[0].id : null;
        });
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    const activeId = selectedConv?.id;
    if (!user || !activeId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);
    const unsubscribe = subscribeConversationMessages(
      user.uid,
      activeId,
      (msgs) => {
        setMessages(Array.isArray(msgs) ? msgs.filter(Boolean) : []);
        setLoadingMessages(false);
      },
      () => {
        setLoadingMessages(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, selectedConv?.id]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-400" />
            <h1 className="text-lg font-bold text-slate-100">Coaching Conversation Archive</h1>
            <Badge variant="amber" size="sm">Searchable</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Review past dialogue sessions, guidance notes, and problem-solving breakdowns across specialized agents.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversation topics or messages..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              <div className="h-16 bg-slate-900/50 rounded-xl animate-pulse" />
              <div className="h-16 bg-slate-900/50 rounded-xl animate-pulse" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No conversations found.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              if (!conv) return null;
              const isSelected = (selectedConv?.id || selectedId) === conv.id;
              const title = conv.title || 'Coaching Session';
              const domain = conv.agentDomain || 'orchestrator';
              const dateStr = safeFormatDate(conv.lastMessageAt || conv.updatedAt || conv.createdAt);

              return (
                <div
                  key={conv.id || Math.random().toString()}
                  data-testid="conversation-item"
                  onClick={() => {
                    setSelectedId(conv.id);
                    selectedIdRef.current = conv.id;
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all text-xs space-y-2 ${
                    isSelected
                      ? 'bg-amber-950/20 border-amber-500/40 text-slate-100 shadow-sm'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold truncate text-slate-100">{title}</span>
                    {conv.isPinned && <Pin className="w-3 h-3 text-amber-400 shrink-0" />}
                  </div>

                  {conv.lastMessagePreview ? (
                    <p className="text-[11px] text-slate-400 line-clamp-1 italic">
                      &ldquo;{String(conv.lastMessagePreview)}&rdquo;
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center gap-1.5">
                      <Badge size="sm" variant="slate">
                        {domain}
                      </Badge>
                      {typeof conv.messageCount === 'number' && (
                        <span className="text-[10px] text-amber-400/90 font-medium">
                          {conv.messageCount} msg{conv.messageCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    {dateStr ? <span>{dateStr}</span> : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="lg:col-span-2">
          <Card className="h-[600px] flex flex-col justify-between">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-100">
                  {selectedConv?.title || 'Conversation Archive'}
                </CardTitle>
                <CardDescription>
                  {selectedConv ? (
                    <>
                      Agent Domain: <span className="text-amber-400 font-semibold uppercase">{selectedConv.agentDomain || 'Orchestrator'}</span>
                      <span className="ml-2 text-slate-500">
                        · {messages.length > 0 ? messages.length : (selectedConv.messageCount || 0)} messages recorded
                      </span>
                    </>
                  ) : (
                    <span>No conversation selected</span>
                  )}
                </CardDescription>
              </div>

              {onSelectConversation && selectedConv && (
                <Button
                  size="sm"
                  data-testid="resume-in-live-coach"
                  onClick={() => {
                    const targetId = selectedConv?.id || selectedId;
                    if (targetId && onSelectConversation) {
                      onSelectConversation(targetId);
                    }
                  }}
                  className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold gap-1.5"
                >
                  <span>Resume in Live Coach</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              )}
            </CardHeader>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {!selectedConv ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-500">
                  <MessageSquare className="w-10 h-10 text-slate-700 mb-3" />
                  <p className="text-xs text-slate-400 font-medium">No conversation selected</p>
                  <p className="text-[11px] text-slate-600 mt-1 max-w-sm">
                    Select a conversation from the archive to review message transcripts, or speak to your coach to create new sessions.
                  </p>
                </div>
              ) : loadingMessages ? (
                <div className="space-y-3">
                  <div className="h-12 bg-slate-950 rounded-lg animate-pulse" />
                  <div className="h-12 bg-slate-950 rounded-lg animate-pulse" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16 text-xs text-slate-500">
                  No messages recorded in this session yet.
                </div>
              ) : (
                messages.map((msg) => {
                  if (!msg) return null;
                  const isUser = msg.role === 'user';
                  const timeStr = safeFormatTime(msg.createdAt || (msg as any).timestamp);
                  const contentStr = typeof msg.content === 'string'
                    ? msg.content
                    : (typeof (msg as any).text === 'string'
                      ? (msg as any).text
                      : String(msg.content || ''));

                  return (
                    <div
                      key={msg.id || Math.random().toString()}
                      className={`flex gap-3 text-xs leading-relaxed ${
                        isUser ? 'ml-auto flex-row-reverse max-w-md' : 'max-w-xl'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs ${
                          isUser ? 'bg-amber-600 text-white' : 'bg-slate-800 text-amber-400 border border-slate-700'
                        }`}
                      >
                        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      </div>
                      <div
                        className={`p-3 rounded-xl ${
                          isUser
                            ? 'bg-amber-950/40 border border-amber-800/50 text-slate-100'
                            : 'bg-slate-950/80 border border-slate-800 text-slate-200'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{contentStr}</div>
                        {timeStr ? (
                          <div className="text-[10px] text-slate-500 mt-1.5 text-right">
                            {timeStr}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
