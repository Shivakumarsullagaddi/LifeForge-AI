export type LogTag =
  | 'AUTH'
  | 'ORCHESTRATOR'
  | 'AGENT'
  | 'TOOL'
  | 'CALENDAR'
  | 'RESUME'
  | 'GOAL'
  | 'TASK'
  | 'TIMER'
  | 'REFLECTION'
  | 'FIRESTORE'
  | 'LIVE_WS';

const SENSITIVE_KEY_REGEX = /(?:token|secret|password|credential|authorization|apikey|api_key|private)/i;

export function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj.length > 30 && (obj.startsWith('ya29.') || obj.startsWith('eyJ') || obj.startsWith('AIza'))) {
      return '***REDACTED_TOKEN***';
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        cleaned[k] = '***REDACTED***';
      } else {
        cleaned[k] = redactSensitiveData(v);
      }
    }
    return cleaned;
  }
  return obj;
}

export function logStructured(tag: LogTag, message: string, details?: Record<string, any>): void {
  const timestamp = new Date().toISOString();
  if (details) {
    const safeDetails = redactSensitiveData(details);
    const detailsStr = Object.entries(safeDetails)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
    console.log(`[${tag}] [${timestamp}] ${message} ${detailsStr}`.trim());
  } else {
    console.log(`[${tag}] [${timestamp}] ${message}`);
  }
}
