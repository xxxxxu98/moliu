type ErrorPayload = {
  message?: unknown;
  error?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonMessage(message: string): string | undefined {
  const trimmed = message.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    return extractErrorMessage(JSON.parse(trimmed));
  } catch {
    return undefined;
  }
}

export function extractErrorMessage(error: unknown, fallback = "未知错误"): string {
  if (typeof error === "string") {
    return parseJsonMessage(error) || error || fallback;
  }

  if (!isRecord(error)) {
    return fallback;
  }

  const payload = error as ErrorPayload;

  if (payload.error) {
    const nestedMessage = extractErrorMessage(payload.error, "");
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  if (typeof payload.message === "string" && payload.message) {
    return parseJsonMessage(payload.message) || payload.message;
  }

  if (error instanceof Error) {
    return parseJsonMessage(error.message) || error.message || fallback;
  }

  return fallback;
}
