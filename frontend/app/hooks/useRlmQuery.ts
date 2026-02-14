"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const RLM_QUERY_WS_URL = "ws://localhost:8000/ws/query";

export interface RlmIteration {
  iteration: number;
  reasoning: string;
  code: string;
  output: string;
}

export interface RlmMetrics {
  tokens: number;
  time_s: number;
  iterations: number;
  depth: number;
  sub_llm_calls: number;
}

export interface RlmResult {
  answer: string;
  metrics: RlmMetrics;
}

interface RlmStatus {
  message: string;
}

interface RlmError {
  message: string;
}

type RlmWsEvent =
  | { type: "status"; data: RlmStatus }
  | { type: "iteration"; data: RlmIteration }
  | { type: "result"; data: RlmResult }
  | { type: "error"; data: RlmError };

export interface UseRlmQueryValue {
  submitQuery: (documentId: string, question: string) => void;
  isLoading: boolean;
  iterations: RlmIteration[];
  result: RlmResult | null;
  error: string | null;
  resetQuery: () => void;
}

export const RlmQueryContext = createContext<UseRlmQueryValue | null>(null);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRlmIteration(value: unknown): value is RlmIteration {
  if (!isObject(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.iteration) &&
    typeof value.reasoning === "string" &&
    typeof value.code === "string" &&
    typeof value.output === "string"
  );
}

function isRlmMetrics(value: unknown): value is RlmMetrics {
  if (!isObject(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.tokens) &&
    isFiniteNumber(value.time_s) &&
    isFiniteNumber(value.iterations) &&
    isFiniteNumber(value.depth) &&
    isFiniteNumber(value.sub_llm_calls)
  );
}

function isRlmResult(value: unknown): value is RlmResult {
  if (!isObject(value)) {
    return false;
  }

  return typeof value.answer === "string" && isRlmMetrics(value.metrics);
}

function isRlmError(value: unknown): value is RlmError {
  return isObject(value) && typeof value.message === "string";
}

function isRlmStatus(value: unknown): value is RlmStatus {
  return isObject(value) && typeof value.message === "string";
}

function isRlmWsEvent(value: unknown): value is RlmWsEvent {
  if (!isObject(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "status":
      return isRlmStatus(value.data);
    case "iteration":
      return isRlmIteration(value.data);
    case "result":
      return isRlmResult(value.data);
    case "error":
      return isRlmError(value.data);
    default:
      return false;
  }
}

export function useRlmQuery(): UseRlmQueryValue {
  const socketRef = useRef<WebSocket | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [iterations, setIterations] = useState<RlmIteration[]>([]);
  const [result, setResult] = useState<RlmResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    socketRef.current = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;

    if (
      socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN
    ) {
      socket.close();
    }
  }, []);

  const resetQuery = useCallback(() => {
    closeSocket();
    setIsLoading(false);
    setIterations([]);
    setResult(null);
    setError(null);
  }, [closeSocket]);

  const submitQuery = useCallback(
    (documentId: string, question: string) => {
      const trimmedQuestion = question.trim();
      if (!documentId || trimmedQuestion.length === 0) {
        setError("Please select a document and enter a question.");
        return;
      }

      closeSocket();
      setIsLoading(true);
      setIterations([]);
      setResult(null);
      setError(null);

      const socket = new WebSocket(RLM_QUERY_WS_URL);
      socketRef.current = socket;

      let hasTerminalEvent = false;

      const finishQuery = () => {
        if (hasTerminalEvent) {
          return;
        }

        hasTerminalEvent = true;
        setIsLoading(false);

        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        if (
          socket.readyState === WebSocket.CONNECTING ||
          socket.readyState === WebSocket.OPEN
        ) {
          socket.close();
        }
      };

      socket.onopen = () => {
        if (socketRef.current !== socket) {
          return;
        }

        try {
          socket.send(
            JSON.stringify({
              document_id: documentId,
              question: trimmedQuestion,
            }),
          );
        } catch {
          setError("Failed to send query to the RLM service.");
          finishQuery();
        }
      };

      socket.onmessage = (event) => {
        if (socketRef.current !== socket) {
          return;
        }

        let payload: unknown;
        try {
          payload =
            typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        } catch {
          setError("Received malformed data from the RLM service.");
          finishQuery();
          return;
        }

        if (!isRlmWsEvent(payload)) {
          setError("Received unexpected event payload from the RLM service.");
          finishQuery();
          return;
        }

        switch (payload.type) {
          case "status":
            break;
          case "iteration":
            setIterations((current) => [...current, payload.data]);
            break;
          case "result":
            setResult(payload.data);
            finishQuery();
            break;
          case "error":
            setError(payload.data.message);
            finishQuery();
            break;
        }
      };

      socket.onerror = () => {
        if (socketRef.current !== socket || hasTerminalEvent) {
          return;
        }

        setError("Unable to connect to the RLM query stream.");
        finishQuery();
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) {
          return;
        }

        socketRef.current = null;

        if (!hasTerminalEvent) {
          hasTerminalEvent = true;
          setIsLoading(false);
          setError((current) => current ?? "Query connection closed unexpectedly.");
        }
      };
    },
    [closeSocket],
  );

  useEffect(() => {
    return () => {
      closeSocket();
    };
  }, [closeSocket]);

  return {
    submitQuery,
    isLoading,
    iterations,
    result,
    error,
    resetQuery,
  };
}

export function useRlmQueryContext(): UseRlmQueryValue {
  const context = useContext(RlmQueryContext);
  if (!context) {
    throw new Error(
      "useRlmQueryContext must be used inside RlmQueryContext.Provider.",
    );
  }

  return context;
}
