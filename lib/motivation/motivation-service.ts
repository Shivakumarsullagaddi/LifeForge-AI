export interface MotivationalQuote {
  id: string;
  quote: string;
  author: string;
  category: 'discipline' | 'learning' | 'clarity' | 'resilience';
  isPersonalPrinciple?: boolean;
}

export const CURATED_MOTIVATIONAL_POOL: MotivationalQuote[] = [
  {
    id: 'quote-1',
    quote: 'Do the work you genuinely want to become excellent at. Learn through logic, not rote repetition.',
    author: 'LifeForge Core Principle',
    category: 'discipline',
    isPersonalPrinciple: true,
  },
  {
    id: 'quote-2',
    quote: 'First, solve the problem. Then, write the code.',
    author: 'John Johnson',
    category: 'learning',
    isPersonalPrinciple: false,
  },
  {
    id: 'quote-3',
    quote: 'Simplicity is prerequisite for reliability.',
    author: 'Edsger W. Dijkstra',
    category: 'clarity',
    isPersonalPrinciple: false,
  },
  {
    id: 'quote-4',
    quote: 'Small disciplines repeated with consistency every day lead to great achievements gained slowly over time.',
    author: 'John C. Maxwell',
    category: 'discipline',
    isPersonalPrinciple: false,
  },
  {
    id: 'quote-5',
    quote: 'Depth in fundamental computer science principles outperforms superficial memorization in every technical interview.',
    author: 'LifeForge Core Principle',
    category: 'learning',
    isPersonalPrinciple: true,
  },
  {
    id: 'quote-6',
    quote: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    author: 'James Clear',
    category: 'resilience',
    isPersonalPrinciple: false,
  },
  {
    id: 'quote-7',
    quote: 'Focus on high-leverage deliberate practice rather than passive consumption.',
    author: 'LifeForge Core Principle',
    category: 'discipline',
    isPersonalPrinciple: true,
  },
  {
    id: 'quote-8',
    quote: 'Computer science is no more about computers than astronomy is about telescopes.',
    author: 'Hal Abelson',
    category: 'learning',
    isPersonalPrinciple: false,
  },
];

let cachedIndex = 0;
let lastUpdateTimestamp = 0;

export function getRotatedMotivationalQuote(): MotivationalQuote {
  const now = Date.now();
  if (now - lastUpdateTimestamp > 60000 || lastUpdateTimestamp === 0) {
    const minuteBucket = Math.floor(now / 60000);
    cachedIndex = minuteBucket % CURATED_MOTIVATIONAL_POOL.length;
    lastUpdateTimestamp = now;
  }
  return CURATED_MOTIVATIONAL_POOL[cachedIndex] || CURATED_MOTIVATIONAL_POOL[0];
}
