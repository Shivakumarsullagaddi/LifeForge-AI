export function calculateLiveStreak(profile: {
  createdAt?: string;
  lastActiveDate?: string;
  disciplinedStreakDays?: number;
}): { streak: number; lastActiveDate: string; updated: boolean } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const currentStreak = typeof profile.disciplinedStreakDays === 'number' ? profile.disciplinedStreakDays : 1;
  const lastActive = profile.lastActiveDate;

  if (!lastActive) {
    let initialStreak = currentStreak;
    if (profile.createdAt) {
      const createdDate = new Date(profile.createdAt);
      const createdStr = `${createdDate.getFullYear()}-${pad(createdDate.getMonth() + 1)}-${pad(createdDate.getDate())}`;
      if (createdStr !== todayStr) {
        initialStreak = Math.max(2, currentStreak + 1);
      } else {
        initialStreak = Math.max(1, currentStreak);
      }
    } else {
      initialStreak = Math.max(1, currentStreak);
    }
    return { streak: initialStreak, lastActiveDate: todayStr, updated: true };
  }

  if (lastActive === todayStr) {
    if (currentStreak <= 1 && profile.createdAt) {
      const createdDate = new Date(profile.createdAt);
      const createdStr = `${createdDate.getFullYear()}-${pad(createdDate.getMonth() + 1)}-${pad(createdDate.getDate())}`;
      if (createdStr !== todayStr) {
        return { streak: 2, lastActiveDate: todayStr, updated: true };
      }
    }
    return { streak: currentStreak, lastActiveDate: todayStr, updated: false };
  }

  const parseYMD = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };

  const diffMs = parseYMD(todayStr) - parseYMD(lastActive);
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return { streak: currentStreak + 1, lastActiveDate: todayStr, updated: true };
  } else if (diffDays > 1) {
    return { streak: 1, lastActiveDate: todayStr, updated: true };
  }

  return { streak: currentStreak, lastActiveDate: todayStr, updated: false };
}
