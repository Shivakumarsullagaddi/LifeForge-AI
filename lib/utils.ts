import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function deduplicateTranscript(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/\s+/g, ' ').trim();

  cleaned = cleaned.replace(/\b([a-zA-Z0-9']+)\s+\1\b/gi, '$1');

  const words = cleaned.split(' ');
  if (words.length >= 6) {
    const half = Math.floor(words.length / 2);
    for (let splitIdx = half - 1; splitIdx <= half + 1; splitIdx++) {
      if (splitIdx >= 3 && words.length - splitIdx >= 3) {
        const part1 = words.slice(0, splitIdx);
        const part2 = words.slice(splitIdx);
        const norm1 = part1.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const norm2 = part2.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''));

        let matchCount = 0;
        const minLen = Math.min(norm1.length, norm2.length);
        for (let i = 0; i < minLen; i++) {
          const w1 = norm1[i];
          const w2 = norm2[i];
          if (
            w1 === w2 ||
            (w1.length > 3 && w2.length > 3 && (w1.startsWith(w2.slice(0, 3)) || w2.startsWith(w1.slice(0, 3))))
          ) {
            matchCount++;
          }
        }
        if (minLen > 0 && matchCount / minLen >= 0.7) {
          const hasPunctuation2 = /[.?!]/.test(part2.join(' '));
          cleaned = hasPunctuation2 ? part2.join(' ') : part1.join(' ');
          break;
        }
      }
    }
  }

  return cleaned.trim();
}
