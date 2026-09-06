'use client';

import React from 'react';
import {
  LayoutDashboard,
  Radio,
  BookMarked,
  Target,
  GraduationCap,
  Briefcase,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  Calendar,
  X,
} from 'lucide-react';

export type NavSection =
  | 'dashboard'
  | 'live-coach'
  | 'conversations'
  | 'goals'
  | 'study'
  | 'placements'
  | 'calendar'
  | 'reflections'
  | 'privacy';

interface NavigationSidebarProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

const navItems: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'live-coach', label: 'Live Coach', icon: Radio, badge: 'Voice/AI' },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'goals', label: 'Goals & Tasks', icon: Target },
  { id: 'placements', label: 'Placements', icon: Briefcase },
  { id: 'calendar', label: 'Google Calendar', icon: Calendar, badge: 'Google Sync' },
  { id: 'reflections', label: 'Reflections', icon: Sparkles },
  { id: 'privacy', label: 'Privacy & Security', icon: ShieldCheck },
];

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  currentSection,
  onSelectSection,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-950 border-r border-slate-800 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Navigation
            </span>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile?.();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-amber-600/15 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      isActive
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Info */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/50 m-2 rounded-xl border">
          <div className="text-[11px] font-semibold text-slate-300">Guiding Principle</div>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed italic">
            &ldquo;Do the work you genuinely want to become excellent at. Learn through logic, not rote.&rdquo;
          </p>
        </div>
      </aside>
    </>
  );
};
