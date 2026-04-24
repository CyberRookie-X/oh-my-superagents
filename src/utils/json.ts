export interface SafeJsonResult<T> {
  value: T;
  warning?: string;
}

export function safeJsonParse<T>(content: string | null | undefined, fallback: T): SafeJsonResult<T> {
  if (content == null || content === "") {
    return { value: fallback, warning: "Failed to parse JSON: empty or null content" };
  }
  try {
    return { value: JSON.parse(content) as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: fallback, warning: `Failed to parse JSON: ${message}` };
  }
}
