'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useAuth } from '@/lib/auth-context';
import { getConversations, getConversationMessages } from '@/lib/firebase';
import type { ConversationSession, ChatMessage } from '@/lib/types';
import { MessageSquare, Pin, Calendar, Bot, User, Search, Sparkles } from 'lucide-react';

interface ConversationsViewProps {
  onSelectConversation?: (id: string) => void;
}

export const ConversationsView: React.FC<ConversationsViewProps> = ({
  onSelectConversation,
}) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationSession[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!user) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        const list = await getConversations(user.uid);
        if (isMounted) {
          setConversations(list);
          if (list.length > 0) {
            setSelectedConv(list[0]);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load conversations:', err);
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !selectedConv) return;
    async function loadMsgs() {
      if (!user || !selectedConv) return;
      setLoadingMessages(true);
      try {
        const msgs = await getConversationMessages(user.uid, selectedConv.id);
        setMessages(msgs);
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    }
    loadMsgs();
  }, [user, selectedConv]);

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
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

      {/* Grid: Left List, Right Message Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: List */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversation topics..."
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
              const isSelected = selectedConv?.id === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConv(conv)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all text-xs space-y-1.5 ${
                    isSelected
                      ? 'bg-amber-950/20 border-amber-500/40 text-slate-100 shadow-sm'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold truncate">{conv.title}</span>
                    {conv.isPinned && <Pin className="w-3 h-3 text-amber-400" />}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <Badge size="sm" variant="slate">
                      {conv.agentDomain}
                    </Badge>
                    <span>{new Date(conv.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Messages View */}
        <div className="lg:col-span-2">
          <Card className="h-[600px] flex flex-col justify-between">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">
                  {selectedConv?.title || 'Select a session'}
                </CardTitle>
                <CardDescription>
                  Agent Domain: <span className="text-amber-400 font-semibold uppercase">{selectedConv?.agentDomain || 'Orchestrator'}</span>
                </CardDescription>
              </div>
            </CardHeader>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {loadingMessages ? (
                <div className="space-y-3">
                  <div className="h-12 bg-slate-950 rounded-lg animate-pulse" />
                  <div className="h-12 bg-slate-950 rounded-lg animate-pulse" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16 text-xs text-slate-500">
                  No messages in this session.
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 text-xs leading-relaxed ${
                        isUser ? 'ml-auto flex-row-reverse max-w-md' : 'max-w-xl'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs ${
                          isUser ? 'bg-amber-600 text-white' : 'bg-slate-800 text-amber-400'
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
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        <div className="text-[10px] text-slate-500 mt-1.5 text-right">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
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
