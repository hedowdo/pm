import type { BoardState } from "@/lib/board";

export const CHAT_HISTORY_KEY = "kanban-studio.chat.v1";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AppliedOperation = {
  type: "create_card" | "edit_card" | "move_card";
  cardId: string;
};

export type ChatResponse = {
  message: string;
  appliedOperations: AppliedOperation[];
  board: BoardState;
};

export class ChatApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export async function sendChat(
  message: string,
  history: ChatMessage[],
): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (response.status === 401) {
    throw new ChatApiError("Your session expired. Sign in again.", 401);
  }
  if (!response.ok) {
    throw new ChatApiError(await responseErrorMessage(response), response.status);
  }

  return response.json() as Promise<ChatResponse>;
}

export function readChatHistory(): ChatMessage[] {
  const saved = window.sessionStorage.getItem(CHAT_HISTORY_KEY);
  if (!saved) return [];

  try {
    const parsed: unknown = JSON.parse(saved);
    return isChatHistory(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeChatHistory(history: ChatMessage[]) {
  window.sessionStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
}

export function clearChatHistory() {
  window.sessionStorage.removeItem(CHAT_HISTORY_KEY);
}

function isChatHistory(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
  );
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
    ) {
      return body.detail;
    }
  } catch {
    // Use the concise fallback below.
  }
  return "AI is unavailable. Please try again.";
}
