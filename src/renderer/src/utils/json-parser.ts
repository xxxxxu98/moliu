/**
 * Robust JSON Parser Utilities
 * Provides comprehensive JSON parsing with multiple fallback strategies
 * Handles various AI response formats and edge cases
 */

import { jsonrepair } from 'jsonrepair';

export interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

/**
 * Main parsing function with multi-stage fallback
 */
export function robustJsonParse<T = any>(
  rawContent: string,
  options?: {
    expectedType?: 'object' | 'array';
    extractField?: string;
    enableCompletion?: boolean;
  }
): ParseResult<T> {
  const warnings: string[] = [];
  const expectedType = options?.expectedType || 'object';

  // Clean the raw content first
  let content = rawContent.trim();

  // Remove common prefixes that AI might add
  content = content
    .replace(/^(以下是|以下是JSON|以下是结果|返回|JSON结果|result|response|这是|下面)[:：]?\s*/i, '')
    .trim();

  // Strategy 1: Try direct parse
  try {
    const data = JSON.parse(content);
    return { success: true, data: data as T, warnings };
  } catch {
    // Direct parse failed
  }

  // Strategy 2: Extract from markdown code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim();
    try {
      const data = JSON.parse(extracted);
      return { success: true, data: data as T, warnings };
    } catch {
      // Try fixing the extracted content
      const fixed = fixCommonIssues(extracted, warnings);
      try {
        const data = JSON.parse(fixed);
        warnings.push('Fixed JSON from markdown code block');
        return { success: true, data: data as T, warnings };
      } catch (e) {
        warnings.push(`Markdown extraction failed: ${(e as Error).message}`);
      }
    }
  }

  // Strategy 3: Find JSON using bracket matching
  const jsonStr = findJsonByBrackets(content, expectedType);
  if (jsonStr) {
    // Try parsing the extracted JSON
    const fixed = fixCommonIssues(jsonStr, warnings);
    try {
      const data = JSON.parse(fixed);
      warnings.push('Extracted JSON using bracket matching');
      return { success: true, data: data as T, warnings };
    } catch (e) {
      warnings.push(`Bracket extraction parse failed: ${(e as Error).message}`);
    }

    // Try completing incomplete JSON
    if (options?.enableCompletion) {
      const completed = completeJson(fixed);
      try {
        const data = JSON.parse(completed);
        warnings.push('JSON was completed from partial content');
        return { success: true, data: data as T, warnings };
      } catch {
        // Completion failed
      }
    }
  }

  // Strategy 4: Try to extract the outlines array specifically
  if (expectedType === 'object') {
    const outlinesResult = extractOutlinesArray(content, warnings);
    if (outlinesResult) {
      return { success: true, data: { outlines: outlinesResult } as T, warnings };
    }
  }

  // Strategy 5: Aggressive cleanup
  const aggressive = aggressiveCleanup(content);
  try {
    const data = JSON.parse(aggressive);
    warnings.push('Used aggressive JSON cleanup');
    return { success: true, data: data as T, warnings };
  } catch {
    // Aggressive cleanup failed
  }

  // Strategy 6: Try to extract and parse any JSON-like content
  const anyJsonMatch = content.match(/\{[\s\S]*\}/);
  if (anyJsonMatch) {
    const fixed = fixCommonIssues(anyJsonMatch[0], warnings);
    try {
      const data = JSON.parse(fixed);
      warnings.push('Extracted JSON using regex fallback');
      return { success: true, data: data as T, warnings };
    } catch {
      // Regex fallback failed
    }
  }

  // Strategy 7: Use jsonrepair for final recovery attempt
  try {
    const repaired = jsonRepair(content);
    const data = JSON.parse(repaired);
    warnings.push('Used jsonrepair to fix malformed JSON');
    return { success: true, data: data as T, warnings };
  } catch (e) {
    warnings.push(`jsonrepair failed: ${(e as Error).message}`);
  }

  // All strategies failed
  return {
    success: false,
    error: 'Failed to parse JSON after all strategies',
    warnings,
  };
}

/**
 * Find JSON object or array using bracket matching
 */
function findJsonByBrackets(content: string, expectedType: 'object' | 'array'): string | null {
  // Try to find { or [ that starts the JSON
  const startChar = expectedType === 'object' ? '{' : '[';

  // Strategy 1: Find the first occurrence
  let startIndex = content.indexOf(startChar);
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastValidIndex = -1;

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === startChar) {
      depth++;
      if (depth === 1) lastValidIndex = i;
    } else if ((startChar === '{' && char === '}') || (startChar === '[' && char === ']')) {
      depth--;
      if (depth === 0) {
        return content.substring(startIndex, i + 1);
      }
    }
  }

  // Return what we have if incomplete
  if (lastValidIndex !== -1) {
    return content.substring(startIndex);
  }

  return null;
}

/**
 * Fix common JSON formatting issues
 */
function fixCommonIssues(jsonStr: string, warnings: string[]): string {
  let result = jsonStr.trim();

  // Remove markdown code block markers
  result = result.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();

  // Fix trailing commas
  const beforeLength = result.length;
  result = result
    .replace(/,\s*\]/g, ']')
    .replace(/,\s*\}/g, '}')
    .replace(/,\s*$/g, '');

  if (result.length !== beforeLength) {
    warnings.push('Fixed trailing commas');
  }

  // Replace curly quotes with straight quotes
  const curlyPatterns = [
    [/\u201C/g, '"'], // "
    [/\u201D/g, '"'], // "
    [/\u2018/g, "'"], // '
    [/\u2019/g, "'"], // '
  ];

  for (const [pattern, replacement] of curlyPatterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement);
      warnings.push('Fixed curly quotes');
    }
  }

  // Fix unescaped newlines in strings
  result = fixUnescapedNewlines(result);

  // Fix missing commas between properties
  result = result.replace(/"(\w+)"\s+"/g, '"$1", "');

  return result;
}

/**
 * Fix unescaped newlines within strings
 */
function fixUnescapedNewlines(str: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString && (char === '\n' || char === '\r')) {
      // Escape the newline
      if (char === '\r' && str[i + 1] === '\n') {
        result += '\\r\\n';
        i++;
      } else if (char === '\n') {
        result += '\\n';
      } else {
        result += '\\r';
      }
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * Try to complete incomplete JSON by adding missing closing brackets
 */
function completeJson(jsonStr: string): string {
  let result = jsonStr;

  const openBraces = (result.match(/\{/g) || []).length;
  const closeBraces = (result.match(/\}/g) || []).length;
  const openBrackets = (result.match(/\[/g) || []).length;
  const closeBrackets = (result.match(/\]/g) || []).length;

  // Check if inside a string
  const quoteCount = (result.match(/"/g) || []).length;
  const inString = quoteCount % 2 !== 0;

  if (!inString) {
    // Add missing closing braces
    for (let i = 0; i < openBraces - closeBraces; i++) {
      result += '}';
    }

    // Add missing closing brackets
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      result += ']';
    }
  }

  return result;
}

/**
 * Extract outlines array specifically (for outline generation)
 */
function extractOutlinesArray(content: string, warnings: string[]): any[] | null {
  // Try to find "outlines": [
  const match = content.match(/"outlines"\s*:\s*\[([\s\S]*)\]/);
  if (!match) return null;

  let arrayContent = '[' + match[1];

  // Try to fix the array content
  arrayContent = fixCommonIssues(arrayContent, warnings);

  // Remove trailing issues
  arrayContent = arrayContent.replace(/,\s*$/, '');

  // Try to add missing bracket
  const openBrackets = (arrayContent.match(/\[/g) || []).length;
  const closeBrackets = (arrayContent.match(/\]/g) || []).length;
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    arrayContent += ']';
  }

  try {
    const data = JSON.parse(arrayContent);
    if (Array.isArray(data)) {
      warnings.push('Extracted outlines array specifically');
      return data;
    }
  } catch {
    // Failed to parse
  }

  return null;
}

/**
 * Aggressive cleanup for severely malformed JSON
 */
function aggressiveCleanup(content: string): string {
  let result = content.trim();

  // Remove all markdown
  result = result.replace(/```[\s\S]*?```/g, '');

  // Remove common prefixes
  result = result
    .replace(/^(以下是|这是|返回结果|JSON)[:：]?\s*/gi, '')
    .trim();

  // Remove non-JSON characters from start
  result = result.replace(/^[^{[\s]+/, '');

  // Find first { or [
  const firstBrace = result.indexOf('{');
  const firstBracket = result.indexOf('[');
  const startIndex = Math.min(
    firstBrace >= 0 ? firstBrace : Infinity,
    firstBracket >= 0 ? firstBracket : Infinity
  );

  if (startIndex !== Infinity) {
    result = result.substring(startIndex);
  }

  // Remove all whitespace
  let cleaned = '';
  let inString = false;
  let escaped = false;

  for (const char of result) {
    if (escaped) {
      cleaned += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      cleaned += char;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      cleaned += char;
      continue;
    }

    if (inString) {
      cleaned += char;
    } else if (/\s/.test(char)) {
      // Skip whitespace outside strings
      continue;
    } else {
      cleaned += char;
    }
  }

  result = cleaned;

  // Fix missing commas
  result = result.replace(/}([\s\n]*[{[])/g, '},$1');
  result = result.replace(/]([\s\n]*[{[])/g, '],$1');

  // Fix trailing commas
  result = result.replace(/,(\s*[}\]])/g, '$1');

  // Complete missing brackets
  result = completeJson(result);

  return result;
}

/**
 * Async version with retry capability
 */
export async function parseJsonWithRetry<T = any>(
  rawContent: string,
  options?: {
    maxRetries?: number;
    expectedType?: 'object' | 'array';
    extractField?: string;
  }
): Promise<ParseResult<T>> {
  const maxRetries = options?.maxRetries || 1;

  let lastResult: ParseResult<T> | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = robustJsonParse<T>(rawContent, {
      expectedType: options?.expectedType,
      extractField: options?.extractField,
      enableCompletion: true,
    });

    if (result.success) {
      return result;
    }

    lastResult = result;

    // Wait a bit between retries
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return lastResult || {
    success: false,
    error: 'All parsing attempts failed',
  };
}

/**
 * Streaming JSON parser for real-time responses
 */
export class StreamingJsonParser<T = any> {
  private buffer: string = '';
  private complete: boolean = false;

  addChunk(chunk: string): void {
    this.buffer += chunk;
  }

  markComplete(): void {
    this.complete = true;
  }

  tryParse(): ParseResult<T> | null {
    if (!this.buffer.trim()) return null;

    const result = robustJsonParse<T>(this.buffer, {
      enableCompletion: this.complete,
    });

    return result.success ? result : null;
  }

  getBuffer(): string {
    return this.buffer;
  }

  isComplete(): boolean {
    if (!this.complete) return false;

    const depth = (this.buffer.match(/[\[\{]/g) || []).length -
                   (this.buffer.match(/[\]\}]/g) || []).length;
    const inString = (this.buffer.match(/"/g) || []).length % 2 !== 0;

    return depth <= 0 && !inString;
  }
}
