import { NextRequest, NextResponse } from 'next/server';

export interface ParseJsonOptions<T> {
  requiredFields?: (keyof T)[];
  allowEmpty?: boolean;
  emptyFallback?: T;
  validate?: (data: any) => { valid: boolean; error?: string };
}

export type ParseJsonResult<T> =
  | {
      ok: true;
      data: T;
      response?: never;
    }
  | {
      ok: false;
      data?: never;
      response: NextResponse;
      error: {
        code: string;
        message: string;
      };
      status: number;
    };

export async function parseJsonBody<T = any>(
  req: NextRequest | Request,
  options: ParseJsonOptions<T> = {}
): Promise<ParseJsonResult<T>> {
  const contentType = req.headers.get('content-type') || '';
  const isJsonType =
    contentType.toLowerCase().includes('application/json') ||
    contentType.toLowerCase().includes('+json');

  let rawText = '';
  try {
    rawText = await req.text();
  } catch (err: any) {
    return {
      ok: false,
      status: 400,
      error: {
        code: 'INVALID_REQUEST',
        message: err?.message || 'Failed to read request body',
      },
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Failed to read request body',
          },
        },
        { status: 400 }
      ),
    };
  }

  const trimmed = rawText.trim();

  if (!trimmed) {
    if (options.allowEmpty && options.emptyFallback !== undefined) {
      return { ok: true, data: options.emptyFallback };
    }
    return {
      ok: false,
      status: 400,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body cannot be empty',
      },
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request body cannot be empty',
          },
        },
        { status: 400 }
      ),
    };
  }

  if (!isJsonType) {
    return {
      ok: false,
      status: 400,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Content-Type must be application/json',
      },
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Content-Type must be application/json',
          },
        },
        { status: 400 }
      ),
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: any) {
    return {
      ok: false,
      status: 400,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON payload',
      },
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Malformed JSON payload',
          },
        },
        { status: 400 }
      ),
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      ok: false,
      status: 400,
      error: {
        code: 'INVALID_REQUEST',
        message: 'JSON payload must be an object or array',
      },
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'JSON payload must be an object or array',
          },
        },
        { status: 400 }
      ),
    };
  }

  if (options.requiredFields && options.requiredFields.length > 0) {
    for (const field of options.requiredFields) {
      if (parsed[field] === undefined || parsed[field] === null) {
        return {
          ok: false,
          status: 400,
          error: {
            code: 'INVALID_REQUEST',
            message: `Missing required field: ${String(field)}`,
          },
          response: NextResponse.json(
            {
              success: false,
              error: {
                code: 'INVALID_REQUEST',
                message: `Missing required field: ${String(field)}`,
              },
            },
            { status: 400 }
          ),
        };
      }
    }
  }

  if (options.validate) {
    const valResult = options.validate(parsed);
    if (!valResult.valid) {
      return {
        ok: false,
        status: 400,
        error: {
          code: 'INVALID_REQUEST',
          message: valResult.error || 'Request validation failed',
        },
        response: NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: valResult.error || 'Request validation failed',
            },
          },
          { status: 400 }
        ),
      };
    }
  }

  return {
    ok: true,
    data: parsed as T,
  };
}

export function safeJsonParse<T = any>(text: string, fallback: T): T {
  if (!text || typeof text !== 'string') return fallback;
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!cleaned) return fallback;
  try {
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}
