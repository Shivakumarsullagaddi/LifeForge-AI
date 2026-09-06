'use client';

import React from 'react';

interface FormattedMessageProps {
  content: string;
  className?: string;
}

export const FormattedMessage: React.FC<FormattedMessageProps> = ({ content, className = '' }) => {
  if (!content) return null;

  const renderInline = (text: string) => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        parts.push(
          <code key={key++} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300 font-mono text-[11px]">
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        parts.push(
          <strong key={key++} className="font-semibold text-slate-100">
            {boldMatch[1]}
          </strong>
        );
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      const italicMatch = remaining.match(/^\*([^*]+)\*/);
      if (italicMatch) {
        parts.push(
          <em key={key++} className="italic text-slate-200">
            {italicMatch[1]}
          </em>
        );
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      const nextCode = remaining.indexOf('`');
      const nextBold = remaining.indexOf('**');
      const nextItalic = remaining.indexOf('*');

      const indices = [nextCode, nextBold, nextItalic].filter((idx) => idx > 0);
      const nextToken = indices.length > 0 ? Math.min(...indices) : -1;

      if (nextToken === -1) {
        parts.push(remaining);
        break;
      } else {
        parts.push(remaining.slice(0, nextToken));
        remaining = remaining.slice(nextToken);
      }
    }

    return parts;
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let elementIndex = 0;

  const flushList = () => {
    if (!currentList) return;
    if (currentList.type === 'ul') {
      elements.push(
        <ul key={elementIndex++} className="space-y-1 my-2 pl-4">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
              <span className="flex-1 leading-relaxed">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    } else {
      elements.push(
        <ol key={elementIndex++} className="space-y-1 my-2 pl-4 list-decimal list-inside">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
    }
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    const bulletMatch = trimmed.match(/^[\*\-\•]\s+(.*)$/);
    if (bulletMatch) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numberedMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(numberedMatch[1]);
      continue;
    }

    flushList();

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      if (level === 1 || level === 2) {
        elements.push(
          <h2 key={elementIndex++} className="text-sm font-bold text-amber-400 mt-3 mb-1">
            {renderInline(text)}
          </h2>
        );
      } else {
        elements.push(
          <h3 key={elementIndex++} className="text-xs font-semibold text-slate-100 mt-2 mb-1">
            {renderInline(text)}
          </h3>
        );
      }
      continue;
    }

    elements.push(
      <p key={elementIndex++} className="leading-relaxed my-1">
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList();

  return <div className={`space-y-1 text-slate-200 text-xs sm:text-sm ${className}`}>{elements}</div>;
};
