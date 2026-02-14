"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

function deriveWsUrlFromApiBase(apiBase: string): string | null {
  try {
    const parsed = new URL(apiBase);
    const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${parsed.host}/ws/query`;
  } catch {
    return null;
  }
}

function getRlmWsUrl(): string {
  const explicitWsUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (explicitWsUrl) {
    return explicitWsUrl;
  }

  const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredApiBase) {
    const derivedWsUrl = deriveWsUrlFromApiBase(configuredApiBase);
    if (derivedWsUrl) {
      return derivedWsUrl;
    }
  }

  if (typeof window === "undefined") {
    return "ws://localhost:8000/ws/query";
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.hostname}:8000/ws/query`;
}
export const BACKEND_CONNECTION_ERROR =
  "Cannot connect to backend. Make sure the backend is running.";

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
  statusMessage: string;
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
  const [statusMessage, setStatusMessage] = useState("Idle");

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
    setStatusMessage("Idle");
  }, [closeSocket]);

  const submitQuery = useCallback(
    (documentId: string, question: string) => {
      const trimmedQuestion = question.trim();
      if (!documentId || trimmedQuestion.length === 0) {
        setError("Please select a document and enter a question.");
        setStatusMessage("Waiting for a valid question.");
        return;
      }

      closeSocket();
      setIsLoading(true);
      setIterations([]);
      setResult(null);
      setError(null);
      setStatusMessage("Connecting to RLM...");

      const socket = new WebSocket(getRlmWsUrl());
      socketRef.current = socket;

      let hasTerminalEvent = false;
      let didOpen = false;

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

        didOpen = true;
        setStatusMessage("Connected. Sending query...");

        try {
          socket.send(
            JSON.stringify({
              document_id: documentId,
              question: trimmedQuestion,
            }),
          );
          setStatusMessage("RLM is processing your query...");
        } catch {
          setError("Failed to send query to the RLM service.");
          setStatusMessage("Failed to send query.");
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
          setStatusMessage("Received malformed stream data.");
          finishQuery();
          return;
        }

        if (!isRlmWsEvent(payload)) {
          setError("Received unexpected event payload from the RLM service.");
          setStatusMessage("Received unexpected stream event.");
          finishQuery();
          return;
        }

        switch (payload.type) {
          case "status":
            setStatusMessage(payload.data.message);
            break;
          case "iteration":
            setIterations((current) => [...current, payload.data]);
            setStatusMessage(`Iteration ${payload.data.iteration} streamed.`);
            break;
          case "result":
            setResult(payload.data);
            setStatusMessage("RLM process completed.");
            finishQuery();
            break;
          case "error":
            setError(payload.data.message);
            setStatusMessage("RLM reported an error.");
            finishQuery();
            break;
        }
      };

      socket.onerror = () => {
        if (socketRef.current !== socket || hasTerminalEvent) {
          return;
        }

        setError(BACKEND_CONNECTION_ERROR);
        setStatusMessage("Cannot connect to backend.");
        finishQuery();
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        if (hasTerminalEvent) {
          return;
        }

        hasTerminalEvent = true;
        setIsLoading(false);

        if (!didOpen) {
          setError(BACKEND_CONNECTION_ERROR);
          setStatusMessage("Cannot connect to backend.");
          return;
        }

        setError((current) => current ?? "Query connection closed unexpectedly.");
        setStatusMessage((current) =>
          current === "RLM process completed."
            ? current
            : "Query connection closed unexpectedly.",
        );
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
    statusMessage,
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
