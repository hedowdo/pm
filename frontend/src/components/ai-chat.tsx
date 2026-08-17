"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { MessageSquareText, Send, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { BoardState } from "@/lib/board";
import {
  ChatApiError,
  readChatHistory,
  sendChat,
  writeChatHistory,
  type ChatMessage,
} from "@/lib/chat";

export function AiChat({
  disabled = false,
  isDesktop = false,
  onBoardReplace,
  onSendingChange,
  onUnauthorized,
}: {
  disabled?: boolean;
  isDesktop?: boolean;
  onBoardReplace: (board: BoardState) => void;
  onSendingChange?: (isSending: boolean) => void;
  onUnauthorized?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setHistory(readChatHistory());
      setIsHistoryReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [history, isSending]);

  async function submitMessage() {
    const message = draft.trim();
    if (!message || disabled || isSending || !isHistoryReady) return;

    setError(null);
    setIsSending(true);
    onSendingChange?.(true);

    try {
      const response = await sendChat(message, history);
      const nextHistory: ChatMessage[] = [
        ...history,
        { role: "user", content: message },
        { role: "assistant", content: response.message },
      ];
      onBoardReplace(response.board);
      setHistory(nextHistory);
      writeChatHistory(nextHistory);
      setDraft("");
    } catch (sendError) {
      if (sendError instanceof ChatApiError && sendError.status === 401) {
        onUnauthorized?.();
        return;
      }
      setError(
        sendError instanceof Error
          ? sendError.message
          : "AI is unavailable. Please try again.",
      );
    } finally {
      setIsSending(false);
      onSendingChange?.(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  const content = (
    <ChatContent
      isDialog={!isDesktop}
      history={history}
      draft={draft}
      error={error}
      disabled={disabled}
      isSending={isSending}
      isHistoryReady={isHistoryReady}
      inputRef={inputRef}
      logRef={logRef}
      onDraftChange={(value) => {
        setDraft(value);
        setError(null);
      }}
      onInputKeyDown={handleInputKeyDown}
      onSubmit={submit}
      closeButton={
        !isDesktop ? (
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close AI chat"
              className="rounded-xl p-2 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <X size={20} />
            </button>
          </Dialog.Close>
        ) : null
      }
    />
  );

  if (isDesktop) {
    return (
      <aside
        aria-label="AI assistant"
        className="sticky top-8 h-[calc(100vh-4rem)] min-h-[36rem] overflow-hidden rounded-[1.75rem] border border-[#032147]/12 bg-white/80 shadow-[0_20px_55px_rgba(3,33,71,0.12)] backdrop-blur-sm"
      >
        {content}
      </aside>
    );
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open AI chat"
          className="fixed right-5 bottom-5 z-30 flex items-center gap-2 rounded-full bg-[#753991] px-5 py-3.5 text-sm font-bold text-white shadow-[0_14px_32px_rgba(117,57,145,0.32)] transition hover:bg-[#63307c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#753991]"
        >
          <MessageSquareText size={18} strokeWidth={2.4} />
          Ask AI
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#032147]/45 backdrop-blur-[3px]" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed inset-y-0 right-0 z-50 w-[min(100%,26rem)] overflow-hidden bg-[#fcfbf7] shadow-[-20px_0_60px_rgba(3,33,71,0.24)] focus:outline-none"
        >
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChatContent({
  isDialog,
  history,
  draft,
  error,
  disabled,
  isSending,
  isHistoryReady,
  inputRef,
  logRef,
  closeButton,
  onDraftChange,
  onInputKeyDown,
  onSubmit,
}: {
  isDialog: boolean;
  history: ChatMessage[];
  draft: string;
  error: string | null;
  disabled: boolean;
  isSending: boolean;
  isHistoryReady: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  logRef: RefObject<HTMLDivElement | null>;
  closeButton: ReactNode;
  onDraftChange: (value: string) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const cannotSend =
    disabled || isSending || !isHistoryReady || draft.trim().length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/10 bg-[#032147] px-5 py-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] font-bold tracking-[0.2em] text-[#ecad0a] uppercase">
              BOARD ASSISTANT
            </p>
            {isDialog ? (
              <Dialog.Title asChild>
                <h2 className="editorial-title text-2xl font-bold tracking-[-0.04em]">
                  Plan with AI
                </h2>
              </Dialog.Title>
            ) : (
              <h2 className="editorial-title text-2xl font-bold tracking-[-0.04em]">
                Plan with AI
              </h2>
            )}
          </div>
          {closeButton}
        </div>
        {isDialog ? (
          <Dialog.Description className="mt-2 text-sm leading-5 text-white/62">
            Create, edit, or move cards with a clear request.
          </Dialog.Description>
        ) : (
          <p className="mt-2 text-sm leading-5 text-white/62">
            Create, edit, or move cards with a clear request.
          </p>
        )}
      </div>

      <div
        ref={logRef}
        role="log"
        aria-label="AI conversation"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
      >
        {history.length === 0 && !isSending ? (
          <div className="rounded-2xl border border-dashed border-[#209dd7]/30 bg-[#209dd7]/6 p-5">
            <p className="font-bold text-[#032147]">Start with a board task</p>
            <p className="mt-2 text-sm leading-5 text-[#888888]">
              Try asking to add a task, revise a card, or move work to another column.
            </p>
          </div>
        ) : null}

        {history.map((message, index) => (
          <article
            key={`${message.role}-${index}`}
            aria-label={message.role === "user" ? "You" : "AI assistant"}
            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
              message.role === "user"
                ? "ml-auto bg-[#753991] text-white shadow-[0_8px_18px_rgba(117,57,145,0.2)]"
                : "border border-[#032147]/10 bg-white text-[#032147] shadow-[0_7px_16px_rgba(3,33,71,0.06)]"
            }`}
          >
            <p className="mb-1 text-[10px] font-bold tracking-[0.12em] uppercase opacity-65">
              {message.role === "user" ? "You" : "Assistant"}
            </p>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </article>
        ))}

        {isSending ? (
          <div className="max-w-[92%] rounded-2xl border border-[#032147]/10 bg-white px-4 py-3 text-sm text-[#888888] shadow-[0_7px_16px_rgba(3,33,71,0.06)]">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[#209dd7]" />
            Working on your board...
          </div>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="border-t border-[#032147]/10 bg-white/85 p-4">
        {error ? (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-[#a53b2a]/8 px-3 py-2.5">
            <p role="alert" className="text-sm font-semibold leading-5 text-[#a53b2a]">
              {error}
            </p>
            <button
              type="submit"
              disabled={cannotSend}
              className="shrink-0 text-sm font-bold text-[#753991] underline decoration-[#753991]/35 underline-offset-3 disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        ) : null}

        <label htmlFor="ai-message" className="sr-only">
          Message the board assistant
        </label>
        <div className="flex items-end gap-2 rounded-2xl border border-[#032147]/16 bg-white p-2 shadow-[0_8px_20px_rgba(3,33,71,0.06)] focus-within:border-[#209dd7] focus-within:ring-3 focus-within:ring-[#209dd7]/12">
          <textarea
            ref={inputRef}
            id="ai-message"
            rows={3}
            value={draft}
            disabled={!isHistoryReady}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Ask AI to update the board"
            className="min-h-18 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-[#032147] outline-none placeholder:text-[#888888]/75 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={cannotSend}
            aria-label={isSending ? "Sending message" : "Send message"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#753991] text-white transition hover:bg-[#63307c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#753991] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send size={17} strokeWidth={2.5} />
          </button>
        </div>
        <p className="mt-2 text-xs leading-4 text-[#888888]">
          Enter to send. Shift+Enter for a new line.
        </p>
        <p role="status" aria-live="polite" className="sr-only">
          {isSending ? "The assistant is working." : error ?? "Ready for a message."}
        </p>
      </form>
    </div>
  );
}

export function useDesktopChat() {
  const [isDesktop, setIsDesktop] = useState(false);

  useLayoutEffect(() => {
    const update = () => {
      setIsDesktop(document.body.getBoundingClientRect().width >= 1536);
    };
    update();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(update);
      observer.observe(document.body);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return isDesktop;
}
