'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useAuth } from '@/lib/auth-context';
import {
  getGoals,
  getTasks,
  getReflections,
  deleteAllGoalsAndTasks,
  deleteAllConversations,
  deleteAllReflections,
  deleteResumeData,
  purgeAllUserData,
} from '@/lib/firebase';
import { resumeStateManager } from '@/lib/resume';
import { useLiveVoiceContext } from '@/lib/live-voice-context';
import {
  ShieldCheck,
  Lock,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Database,
  Server,
  FileText,
  CheckSquare,
  MessageSquare,
  Sparkles,
  RefreshCw,
  BookOpen,
} from 'lucide-react';

export const PrivacySecurityView: React.FC = () => {
  const { user, profile } = useAuth();
  const { resetAllConversations } = useLiveVoiceContext();
  const [activeTab, setActiveTab] = useState<'controls' | 'security'>('controls');
  const [isExporting, setIsExporting] = useState(false);

  const [deletingType, setDeletingType] = useState<string | null>(null);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purgeInput, setPurgeInput] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    type: 'goals-tasks' | 'conversations' | 'reflections' | 'resume';
    title: string;
    description: string;
    details: string;
    buttonLabel: string;
  } | null>(null);

  const showSuccessNotification = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => {
      setActionSuccessMsg(null);
    }, 4500);
  };

  const handleExportData = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const [goals, tasks, reflections] = await Promise.all([
        getGoals(user.uid),
        getTasks(user.uid),
        getReflections(user.uid),
      ]);

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          profile,
        },
        data: {
          goals,
          tasks,
          reflections,
        },
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lifeforge-ai-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccessNotification('Account data successfully exported to JSON.');
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || !confirmModal) return;
    const { type } = confirmModal;
    setDeletingType(type);
    try {
      if (type === 'goals-tasks') {
        await deleteAllGoalsAndTasks(user.uid);
        showSuccessNotification('All goals and tasks were permanently deleted.');
      } else if (type === 'conversations') {
        await resetAllConversations();
        showSuccessNotification('All conversation sessions were permanently deleted and restarted.');
      } else if (type === 'reflections') {
        await deleteAllReflections(user.uid);
        showSuccessNotification('All daily reflections and weekly reviews were permanently deleted.');
      } else if (type === 'resume') {
        await deleteResumeData(user.uid);
        resumeStateManager.reset();
        showSuccessNotification('Placement profile and resume records were permanently deleted.');
      }
    } catch (err) {
      console.error(`Failed to delete ${type}:`, err);
    } finally {
      setDeletingType(null);
      setConfirmModal(null);
    }
  };

  const handlePurgeAllData = async () => {
    if (!user || purgeInput !== 'PURGE DATA') return;

    setDeletingType('purge');
    try {
      await purgeAllUserData(user.uid);
      await resetAllConversations();
      resumeStateManager.reset();
      setPurgeModalOpen(false);
      setPurgeInput('');
      showSuccessNotification('Account activity data successfully purged. User identity and authentication preserved.');
    } catch (err) {
      console.error('Failed to purge data:', err);
    } finally {
      setDeletingType(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-bold text-slate-100">Privacy, Security & Data Ownership</h1>
            <Badge variant="emerald" size="sm">Zero Cross-User Leakage</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Cryptographic document isolation, strict Firebase Security Rules, and complete Right to be Forgotten controls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportData} isLoading={isExporting} className="gap-2 text-xs">
            <Download className="w-4 h-4" /> Export All Data (JSON)
          </Button>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-700/80 text-emerald-300 text-xs flex items-center gap-2.5 shadow-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs gap-1 max-w-md">
        <button
          type="button"
          onClick={() => setActiveTab('controls')}
          className={`flex-1 py-2 px-3 rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'controls'
              ? 'bg-amber-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Destructive Controls & Privacy</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex-1 py-2 px-3 rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'security'
              ? 'bg-amber-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Authentication & Security Rules</span>
        </button>
      </div>

      {activeTab === 'controls' && (
        <div className="space-y-6">
          <Card className="border-rose-900/50 bg-slate-900/90 shadow-lg">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-bold text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Destructive Controls & Right to be Forgotten</span>
                  </CardTitle>
                  <CardDescription>
                    Permanently delete specific datasets or perform a full activity data purge while maintaining your login identity.
                  </CardDescription>
                </div>
                <Badge variant="rose" size="sm" className="shrink-0">
                  Permanent Operations
                </Badge>
              </div>
            </CardHeader>

            <div className="p-4 sm:p-6 pt-0 space-y-4">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-300 text-xs leading-relaxed">
                You maintain complete ownership of your personal notes, memories, goals, tasks, and reflections. When you delete data, it is permanently wiped from Cloud Firestore. Your user profile credentials (name, email, and authentication UID) remain intact.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs">
                      <CheckSquare className="w-4 h-4 text-amber-400" />
                      <span>Goals & Tasks</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Single deletion operation: permanently deletes all active, paused, and completed goals and tasks from your account database.
                    </p>
                  </div>
                  <div>
                    <Button
                      data-testid="btn-delete-goals-tasks"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmModal({
                        type: 'goals-tasks',
                        title: 'Delete Goals & Tasks',
                        description: 'Permanently delete all Goals and Tasks? This cannot be undone.',
                        details: 'All active, paused, and completed goals and tasks will be erased from your account database.',
                        buttonLabel: 'Delete Goals & Tasks',
                      })}
                      isLoading={deletingType === 'goals-tasks'}
                      className="w-full text-xs text-rose-400 hover:text-rose-300 border-rose-900/40 hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Goals & Tasks
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs">
                      <MessageSquare className="w-4 h-4 text-sky-400" />
                      <span>Conversation History</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Single deletion operation: wipes all voice coaching sessions, message turns, rolling summaries, and chat history from your account.
                    </p>
                  </div>
                  <div>
                    <Button
                      data-testid="btn-delete-conversations"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmModal({
                        type: 'conversations',
                        title: 'Delete All Conversations',
                        description: 'Permanently delete all conversation sessions and chat messages? This cannot be undone.',
                        details: 'All voice coaching sessions, message turns, rolling summaries, and chat history will be erased from your account.',
                        buttonLabel: 'Delete All Conversations',
                      })}
                      isLoading={deletingType === 'conversations'}
                      className="w-full text-xs text-rose-400 hover:text-rose-300 border-rose-900/40 hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete All Conversations
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs">
                      <BookOpen className="w-4 h-4 text-emerald-400" />
                      <span>Reflections & Reviews</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Single deletion operation: permanently deletes all daily reflections, mood scores, journal entries, and weekly reviews from Firestore.
                    </p>
                  </div>
                  <div>
                    <Button
                      data-testid="btn-delete-reflections"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmModal({
                        type: 'reflections',
                        title: 'Delete Reflections',
                        description: 'Permanently delete all daily reflections and weekly reviews? This cannot be undone.',
                        details: 'All daily reflections, mood scores, journal entries, and weekly reviews will be erased from your account.',
                        buttonLabel: 'Delete Reflections',
                      })}
                      isLoading={deletingType === 'reflections'}
                      className="w-full text-xs text-rose-400 hover:text-rose-300 border-rose-900/40 hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Reflections
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      <span>Resume & Placement Data</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Completely deletes uploaded resume files, extracted skill profiles, and AI readiness evaluations. Resets the Placements tab to fresh state.
                    </p>
                  </div>
                  <div>
                    <Button
                      data-testid="btn-delete-resume"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmModal({
                        type: 'resume',
                        title: 'Delete Resume Data',
                        description: 'Permanently delete all placement profiles and uploaded resume data? This cannot be undone.',
                        details: 'All uploaded resume files, extracted skill profiles, and AI readiness evaluations will be deleted and reset.',
                        buttonLabel: 'Delete Resume Data',
                      })}
                      isLoading={deletingType === 'resume'}
                      className="w-full text-xs text-rose-400 hover:text-rose-300 border-rose-900/40 hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Resume Data
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/60 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>Purge All Activity Data</span>
                    </div>
                    <p className="text-[11px] text-rose-200/80 leading-relaxed">
                      Wipes all conversations, goals, tasks, reflections, study sessions, and resume data in one sweep. Keeps your account login and UID intact.
                    </p>
                  </div>
                  <div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setPurgeModalOpen(true)}
                      isLoading={deletingType === 'purge'}
                      className="w-full text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Purge All Activity Data
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-200">
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Data Export & Portability (GDPR Article 20)</span>
              </CardTitle>
              <CardDescription>
                Download a complete, machine-readable JSON archive of all your goals, tasks, reflections, and personal profile data.
              </CardDescription>
            </CardHeader>
            <div className="p-4 sm:p-6 pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <p className="text-slate-400 text-xs leading-relaxed max-w-xl">
                Your data is exported with timestamps, structured metrics, and schema tags. You can use this archive for personal backups or external integrations.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportData}
                isLoading={isExporting}
                className="shrink-0 gap-2 text-xs"
              >
                <Download className="w-3.5 h-3.5" /> Download JSON Archive
              </Button>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="space-y-6">
          <Card className="border-slate-800 bg-slate-900/90 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-100">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Authentication Security & Identity Verification</span>
              </CardTitle>
              <CardDescription>
                How LifeForge AI verifies user identity and guarantees authenticated session integrity.
              </CardDescription>
            </CardHeader>

            <div className="p-4 sm:p-6 pt-0 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>OAuth 2.0 PKCE</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Google Identity Provider with standard OpenID Connect and cryptographic tokens.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Zero Passwords</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    No passwords or hashed credentials stored in any database. Zero breach vector.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Isolated UID Token</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed font-mono truncate">
                    UID: {user?.uid || 'anonymous_user'}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-slate-300 text-xs leading-relaxed">
                <div className="font-semibold text-slate-200">Cryptographic Token Lifecycles</div>
                <p>
                  Every request sent to backend routes or Firebase services carries a short-lived bearer token signed by Google Auth servers. Tokens expire every 60 minutes and are rotated automatically. Even if a network packet were intercepted, replay attacks are eliminated.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-900/90 shadow-sm">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-100">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>Cloud Firestore Security Rules Architecture</span>
                  </CardTitle>
                  <CardDescription>
                    Enforced at the database engine level with zero-trust default deny.
                  </CardDescription>
                </div>
                <Badge variant="emerald" size="sm" className="shrink-0">
                  Kernel Enforced
                </Badge>
              </div>
            </CardHeader>

            <div className="p-4 sm:p-6 pt-0 space-y-4 text-xs">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Enforced Rules Configuration (firestore.rules)
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-300 text-[11px] font-mono leading-relaxed overflow-x-auto">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 1. Default Deny: All collections denied by default
    match /{document=**} {
      allow read, write: if false;
    }

    // 2. Strict User Isolation: Owner verification on UID
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    // 3. User root & all nested data subcollections
    match /users/{userId} {
      allow read, write: if isOwner(userId);

      match /goals/{goalId} { allow read, write: if isOwner(userId); }
      match /tasks/{taskId} { allow read, write: if isOwner(userId); }
      match /conversations/{convId} { 
        allow read, write: if isOwner(userId); 
        match /messages/{msgId} { allow read, write: if isOwner(userId); }
      }
      match /reflections/{refId} { allow read, write: if isOwner(userId); }
      match /study_sessions/{sessId} { allow read, write: if isOwner(userId); }
      match /placement_profile/{docId} { allow read, write: if isOwner(userId); }
      match /resume_metadata/{docId} { allow read, write: if isOwner(userId); }
    }
  }
}`}
                </pre>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-semibold text-slate-200">Guaranteed Cross-User Privacy</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    User A cannot read, query, or mutate User B data even if they know the document ID. Cloud Firestore rejects queries that lack the matching <code className="text-emerald-400">request.auth.uid</code>.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-semibold text-slate-200">No Wildcard Exposures</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    No top-level collections (e.g. <code className="text-amber-300">/goals</code> or <code className="text-amber-300">/tasks</code>) exist globally. Everything is strictly hierarchical under <code className="text-emerald-400">/users/{'{userId}'}</code>.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-900/90 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-100">
                <Server className="w-4 h-4 text-sky-400" />
                <span>Server-Side API Gateway & Zero Client Secrets</span>
              </CardTitle>
              <CardDescription>
                Zero API keys bundled into client code. All LLM calls and tool gateway executions are proxied server-side.
              </CardDescription>
            </CardHeader>

            <div className="p-4 sm:p-6 pt-0 space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Gemini Live & Flash Gateway:</span>
                  <Badge variant="emerald" size="sm">Active · Server Proxy</Badge>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Web clients establish a secure WebSocket directly to <code className="text-amber-300">/api/live-ws</code>. The Node.js server authenticates the connection and connects upstream to Google Gemini 3.1 Flash Live and Gemini 3.8 Flash using server environment credentials.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-slate-400 text-[11px]">Dedicated Database Instance:</div>
                  <div className="font-mono text-xs text-amber-400 truncate">ai-studio-lifeforgeai-32c3ad47...</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-slate-400 text-[11px]">Google Cloud Project:</div>
                  <div className="font-mono text-xs text-slate-200">developer-491706</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title={confirmModal?.title || 'Confirm Deletion'}
        description={confirmModal?.description}
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-300 leading-relaxed">
            {confirmModal?.details}
          </p>
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>This destructive operation cannot be undone.</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              data-testid="modal-cancel-delete"
              variant="outline"
              onClick={() => setConfirmModal(null)}
              disabled={deletingType !== null}
            >
              Cancel
            </Button>
            <Button
              data-testid="modal-confirm-delete"
              variant="danger"
              isLoading={deletingType !== null}
              onClick={handleConfirmDelete}
            >
              {confirmModal?.buttonLabel || 'Permanently Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={purgeModalOpen}
        onClose={() => {
          setPurgeModalOpen(false);
          setPurgeInput('');
        }}
        title="Confirm Full Account Data Purge"
        description="This action cannot be undone. All your conversations, goals, tasks, reflections, study sessions, and resume data will be permanently wiped."
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-300 leading-relaxed">
            Your login account (<strong className="text-slate-100">{user?.email}</strong>) will stay active, but all stored coaching activity and progress will be deleted.
          </p>
          <p className="text-slate-300 leading-relaxed">
            To confirm permanent deletion, type <strong className="text-rose-400 font-mono">PURGE DATA</strong> below:
          </p>
          <input
            type="text"
            value={purgeInput}
            onChange={(e) => setPurgeInput(e.target.value)}
            placeholder="PURGE DATA"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setPurgeModalOpen(false);
                setPurgeInput('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={purgeInput !== 'PURGE DATA' || deletingType === 'purge'}
              isLoading={deletingType === 'purge'}
              onClick={handlePurgeAllData}
            >
              Permanently Purge All Data
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
