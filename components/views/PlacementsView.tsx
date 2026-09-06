'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useAuth } from '@/lib/auth-context';
import {
  savePlacementProfile,
  subscribePlacementProfile,
} from '@/lib/firebase';
import { resumeStateManager } from '@/lib/resume';
import { resumeService } from '@/lib/placement/resumeService';
import { uiActionBus } from '@/lib/events/uiEvents';
import type {
  PlacementProfile,
  ResumeProfileData,
} from '@/lib/types';
import {
  Briefcase,
  CheckCircle2,
  Sparkles,
  Cpu,
  Trash2,
  FileText,
  Upload,
  FileCheck,
  Edit3,
  Save,
  X,
} from 'lucide-react';

export const PlacementsView: React.FC = () => {
  const { user } = useAuth();
  const [placementProfile, setPlacementProfile] = useState<PlacementProfile | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
  const [resumeUploadSuccess, setResumeUploadSuccess] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editSummary, setEditSummary] = useState('');
  const [editSkills, setEditSkills] = useState('');
  const [editStrengths, setEditStrengths] = useState('');
  const [editGaps, setEditGaps] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const unsub = subscribePlacementProfile(user.uid, (data) => {
      if (!isMounted) return;
      if (data) {
        setPlacementProfile(data);
        if (data.resumeProfile) {
          resumeStateManager.setResume(data.resumeProfile);
          resumeService.syncResumeContext(user.uid, data.resumeProfile);
          setEditSummary(data.resumeProfile.summary || '');
          setEditSkills((data.resumeProfile.skills || []).join(', '));
          setEditStrengths((data.resumeProfile.strengths || []).join(', '));
          setEditGaps((data.resumeProfile.gaps || []).join(', '));
        }
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [user]);

  const handleUploadResume = async (file: File) => {
    if (!user) return;
    setIsUploadingResume(true);
    setResumeUploadError(null);
    setResumeUploadSuccess(false);

    try {
      uiActionBus.emit('UPLOAD_RESUME', { fileName: file.name, fileSize: file.size }, user.uid);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user.uid);

      const res = await fetch('/api/placement/resume', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Resume parsing failed');
      }

      if (data.resumeProfile) {
        resumeStateManager.setResume(data.resumeProfile);
        resumeService.syncResumeContext(user.uid, data.resumeProfile);
        const updatedProfile: PlacementProfile = {
          ...(placementProfile || {
            id: 'default',
            userId: user.uid,
            targetRole: 'Software Engineer',
            targetCompanies: ['Google', 'Amazon', 'Microsoft'],
            skills: [],
            weakAreas: [],
            experience: '',
            projects: [],
            preparationProgress: 70,
            upcomingInterviews: [],
            createdAt: new Date().toISOString(),
          }),
          resumeProfile: data.resumeProfile,
          resumeStatus: 'interview_ready',
          updatedAt: new Date().toISOString(),
        };
        await resumeService.saveResumeAnalysis(user.uid, data.resumeProfile);
        await savePlacementProfile(user.uid, updatedProfile);
        setPlacementProfile(updatedProfile);
        setResumeUploadSuccess(true);
      }
    } catch (err: any) {
      setResumeUploadError(err.message || 'Failed to upload and analyze resume');
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!user || !placementProfile?.resumeProfile) return;
    setIsSavingEdit(true);
    try {
      const skillsArray = editSkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const strengthsArray = editStrengths
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const gapsArray = editGaps
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);

      const updatedResumeProfile: ResumeProfileData = {
        ...placementProfile.resumeProfile,
        summary: editSummary.trim(),
        skills: skillsArray,
        strengths: strengthsArray,
        gaps: gapsArray,
      };

      const updatedProfile: PlacementProfile = {
        ...placementProfile,
        resumeProfile: updatedResumeProfile,
        updatedAt: new Date().toISOString(),
      };

      await resumeService.saveResumeAnalysis(user.uid, updatedResumeProfile);
      await savePlacementProfile(user.uid, updatedProfile);
      setPlacementProfile(updatedProfile);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save resume edits:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const [isClearingResume, setIsClearingResume] = useState(false);

  const handleClearResumeData = async () => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to clear your uploaded resume and placement profile data? This will reset everything to a fresh, clean state.')) {
      return;
    }
    setIsClearingResume(true);
    try {
      await fetch(`/api/placement/resume?userId=${encodeURIComponent(user.uid)}`, {
        method: 'DELETE',
      });
      resumeStateManager.setResume(null);
      resumeService.clearResumeContext(user.uid);
      setPlacementProfile(null);
      setResumeUploadSuccess(false);
      setResumeUploadError(null);
    } catch (err: any) {
      console.error('Failed to clear resume data:', err);
      setResumeUploadError('Failed to clear resume data');
    } finally {
      setIsClearingResume(false);
    }
  };

  const resumeProfile = placementProfile?.resumeProfile;
  const hasResume = !!resumeProfile;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-amber-500" />
            <h1 className="text-lg font-bold text-slate-100">Placement Intelligence & Technical Interview Matrix</h1>
            <Badge variant="emerald" size="sm">Canonical Resume Pipeline</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Upload your resume once for deep technical extraction, skill gap benchmarking, and tailored interview defense questions.
          </p>
        </div>

        {hasResume && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingResume}
              className="text-xs gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Re-upload Resume
            </Button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        data-testid="resume-file-input"
        type="file"
        accept=".pdf,.txt,.md"
        disabled={isUploadingResume}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUploadResume(file);
        }}
        className="hidden"
      />

      {hasResume ? (
        <div data-testid="tab-resume" className="space-y-6">
          <Card className="border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden divide-y divide-slate-800">
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-slate-100">
                      Extracted Candidate Intelligence & Verification
                    </h2>
                    <Badge variant="emerald" size="sm" data-testid="resume-uploaded-badge">Resume Uploaded</Badge>
                    <Badge variant="sky" size="sm" data-testid="resume-analysis-ready-badge">Analysis Ready</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    File: <span className="text-slate-300 font-medium">{resumeProfile.fileName || 'Parsed Resume'}</span> · Single source of truth across Live Voice & Text Coach
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingResume}
                  className="text-xs h-8 px-2.5 gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" /> Re-upload
                </Button>
                {!isEditing ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    className="text-xs h-8 px-2.5 gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      className="text-xs h-8 px-2"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleSaveEdits}
                      isLoading={isSavingEdit}
                      className="text-xs h-8 px-2.5 gap-1"
                    >
                      <Save className="w-3.5 h-3.5" /> Save
                    </Button>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  data-testid="clear-resume-btn"
                  onClick={handleClearResumeData}
                  disabled={isClearingResume}
                  className="text-xs h-8 px-2.5 gap-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300"
                  title="Clear resume data from Firebase and reset cache"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isClearingResume ? 'Clearing...' : 'Clear Resume'}</span>
                </Button>
              </div>
            </div>

            {isUploadingResume && (
              <div className="text-xs text-amber-400 font-medium p-3 bg-amber-950/20 border-b border-amber-800/30 animate-pulse text-center">
                Uploading & analyzing resume with Gemini 3.8 Flash...
              </div>
            )}
            {resumeUploadSuccess && (
              <div className="text-xs text-emerald-400 font-medium p-2.5 bg-emerald-950/20 border-b border-emerald-800/30 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Resume analyzed and saved to placement profile.
              </div>
            )}
            {resumeUploadError && (
              <div className="text-xs text-rose-400 font-medium p-2.5 bg-rose-950/20 border-b border-rose-800/30">
                {resumeUploadError}
              </div>
            )}

            <div className="p-5 space-y-6">
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" /> Professional Summary
                </div>
                {!isEditing ? (
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    {resumeProfile.summary}
                  </p>
                ) : (
                  <textarea
                    rows={3}
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-sky-400" /> Verified Technical Skills ({resumeProfile.skills.length})
                  </span>
                </div>
                {!isEditing ? (
                  <div className="flex flex-wrap gap-1.5 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    {resumeProfile.skills.map((skill, idx) => (
                      <span key={idx} className="px-2.5 py-1 rounded-md text-xs bg-slate-900 border border-slate-700/80 text-amber-300 font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={editSkills}
                    onChange={(e) => setEditSkills(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                )}
              </div>

              {resumeProfile.experience && resumeProfile.experience.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-emerald-400" /> Work & Internship Experience
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {resumeProfile.experience.map((exp: any, idx: number) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                          <span>{exp.role}</span>
                          <span className="text-[10px] text-slate-400 font-normal">{exp.duration}</span>
                        </div>
                        <div className="text-xs text-amber-400">{exp.organization}</div>
                        {exp.highlights && exp.highlights.length > 0 && (
                          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-400 pt-1">
                            {exp.highlights.map((hl: string, hIdx: number) => (
                              <li key={hIdx}>{hl}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {resumeProfile.projects && resumeProfile.projects.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-purple-400" /> Engineering Projects
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {resumeProfile.projects.map((proj: any, idx: number) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                        <div className="text-xs font-semibold text-slate-200">{proj.title}</div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{proj.description}</p>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {proj.techStack?.map((tech: string, tIdx: number) => (
                            <span key={tIdx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-amber-400 border border-slate-800 font-mono">
                              {tech}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Technical Strengths
                  </div>
                  <ul className="space-y-1 text-slate-300 text-xs list-disc list-inside p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-900/30">
                    {resumeProfile.strengths.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" /> Identified Gaps & Interview Risks
                  </div>
                  <ul className="space-y-1 text-slate-300 text-xs list-disc list-inside p-3.5 rounded-xl bg-amber-950/20 border border-amber-900/30">
                    {resumeProfile.gaps.map((g, idx) => (
                      <li key={idx}>{g}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {resumeProfile.interviewQuestions && resumeProfile.interviewQuestions.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Interview Defense Matrix ({resumeProfile.interviewQuestions.length} Questions)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {resumeProfile.interviewQuestions.map((q, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/40">
                            {q.category}
                          </span>
                          <span className="text-[10px] text-slate-500">#{idx + 1}</span>
                        </div>
                        <p className="text-xs font-medium text-slate-200 leading-relaxed">
                          &ldquo;{q.question}&rdquo;
                        </p>
                        {q.expectedPoints && q.expectedPoints.length > 0 && (
                          <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-slate-800/60">
                            <span className="font-semibold text-slate-300">Expected Defense Points:</span>
                            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                              {q.expectedPoints.map((pt, pIdx) => (
                                <li key={pIdx}>{pt}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : (
        <Card data-testid="tab-resume">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Upload Resume & Automated Technical Analysis</span>
              </div>
              <Badge variant="slate" size="sm">Not Uploaded</Badge>
            </CardTitle>
            <CardDescription>
              Accepted formats: PDF, TXT, or Markdown (max 5MB). Processed securely with Gemini 3.8 Flash.
            </CardDescription>
          </CardHeader>

          <div className="p-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 text-center space-y-3">
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-full bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  Select a PDF, Markdown, or TXT Resume
                </div>
                <div className="text-[11px] text-slate-500">
                  File size limit: 5MB · Analyzed against Tier-1 Software Engineering Standards
                </div>
              </div>
            </div>

            <input
              type="file"
              accept=".pdf,.txt,.md"
              disabled={isUploadingResume}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadResume(file);
              }}
              className="block mx-auto text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-500 cursor-pointer"
            />

            {isUploadingResume && (
              <div className="text-xs text-amber-400 font-medium animate-pulse">
                Uploading & analyzing resume with Gemini 3.8 Flash...
              </div>
            )}

            {resumeUploadError && (
              <div className="text-xs text-rose-400 font-medium">
                {resumeUploadError}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
