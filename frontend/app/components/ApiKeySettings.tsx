"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, X } from "lucide-react";

const STORAGE_KEY = "rlm-byok-settings";

interface ProviderModelOption {
  id: string;
  name: string;
}

interface ProviderConfig {
  label: string;
  api_key_name: string;
  models: ProviderModelOption[];
  default: string;
}

type ProviderModels = Record<string, ProviderConfig>;

interface ApiKeySettingsState {
  provider: string;
  apiKey: string;
  model: string;
}

interface ApiKeySettingsContextValue {
  settings: ApiKeySettingsState;
  providers: ProviderModels;
  providerKeys: string[];
  selectedProvider: ProviderConfig | null;
  selectedModelName: string;
  hasApiKey: boolean;
  isLoadingProviders: boolean;
  providersError: string | null;
  setProvider: (provider: string) => void;
  setApiKey: (apiKey: string) => void;
  setModel: (model: string) => void;
}

const ApiKeySettingsContext = createContext<ApiKeySettingsContextValue | null>(null);

const DEFAULT_SETTINGS: ApiKeySettingsState = {
  provider: "gemini",
  apiKey: "",
  model: "",
};

function getApiBase(): string {
  const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "");
  }

  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }

  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProviderModel(value: unknown): value is ProviderModelOption {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isProviderConfig(value: unknown): value is ProviderConfig {
  return (
    isObject(value) &&
    typeof value.label === "string" &&
    typeof value.api_key_name === "string" &&
    Array.isArray(value.models) &&
    value.models.every(isProviderModel) &&
    typeof value.default === "string"
  );
}

function isProviderModels(value: unknown): value is ProviderModels {
  if (!isObject(value)) {
    return false;
  }

  return Object.values(value).every(isProviderConfig);
}

function loadSavedSettings(): ApiKeySettingsState {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) {
      return DEFAULT_SETTINGS;
    }

    return {
      provider:
        typeof parsed.provider === "string" && parsed.provider.trim().length > 0
          ? parsed.provider
          : DEFAULT_SETTINGS.provider,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function ApiKeySettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ApiKeySettingsState>(DEFAULT_SETTINGS);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [providers, setProviders] = useState<ProviderModels>({});
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadSavedSettings());
    setHasLoadedSettings(true);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchProviders = async () => {
      setIsLoadingProviders(true);
      setProvidersError(null);

      try {
        const response = await fetch(`${getApiBase()}/api/providers`, {
          method: "GET",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to load providers (${response.status}).`);
        }

        const payload: unknown = await response.json();
        if (!isProviderModels(payload)) {
          throw new Error("Received malformed providers payload.");
        }

        if (!isMounted) {
          return;
        }

        setProviders(payload);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (!isMounted) {
          return;
        }

        setProvidersError(
          error instanceof Error
            ? error.message
            : "Unable to load provider settings from backend.",
        );
        setProviders({});
      } finally {
        if (isMounted) {
          setIsLoadingProviders(false);
        }
      }
    };

    void fetchProviders();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  const providerKeys = useMemo(() => Object.keys(providers), [providers]);

  useEffect(() => {
    if (providerKeys.length === 0) {
      return;
    }

    setSettings((current) => {
      const provider =
        providers[current.provider] !== undefined
          ? current.provider
          : providers.gemini
            ? "gemini"
            : providerKeys[0];
      const selectedProvider = providers[provider];
      const hasSelectedModel = selectedProvider.models.some(
        (entry) => entry.id === current.model,
      );
      const model = hasSelectedModel ? current.model : selectedProvider.default;

      if (provider === current.provider && model === current.model) {
        return current;
      }

      return {
        ...current,
        provider,
        model,
      };
    });
  }, [providers, providerKeys]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedSettings) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [hasLoadedSettings, settings]);

  const setProvider = useCallback(
    (provider: string) => {
      setSettings((current) => {
        const providerConfig = providers[provider];
        if (!providerConfig) {
          return current;
        }

        const model = providerConfig.models.some(
          (entry) => entry.id === current.model,
        )
          ? current.model
          : providerConfig.default;

        return {
          ...current,
          provider,
          model,
        };
      });
    },
    [providers],
  );

  const setApiKey = useCallback((apiKey: string) => {
    setSettings((current) => ({ ...current, apiKey }));
  }, []);

  const setModel = useCallback(
    (model: string) => {
      setSettings((current) => {
        const providerConfig = providers[current.provider];
        if (!providerConfig) {
          return current;
        }

        if (!providerConfig.models.some((entry) => entry.id === model)) {
          return current;
        }

        return {
          ...current,
          model,
        };
      });
    },
    [providers],
  );

  const selectedProvider = providers[settings.provider] ?? null;
  const selectedModelName =
    selectedProvider?.models.find((entry) => entry.id === settings.model)?.name ??
    "No model selected";
  const hasApiKey = settings.apiKey.trim().length > 0;

  const contextValue = useMemo<ApiKeySettingsContextValue>(
    () => ({
      settings,
      providers,
      providerKeys,
      selectedProvider,
      selectedModelName,
      hasApiKey,
      isLoadingProviders,
      providersError,
      setProvider,
      setApiKey,
      setModel,
    }),
    [
      hasApiKey,
      isLoadingProviders,
      providerKeys,
      providers,
      providersError,
      selectedModelName,
      selectedProvider,
      setApiKey,
      setModel,
      setProvider,
      settings,
    ],
  );

  return (
    <ApiKeySettingsContext.Provider value={contextValue}>
      {children}
    </ApiKeySettingsContext.Provider>
  );
}

export function useApiKeySettings(): ApiKeySettingsContextValue {
  const context = useContext(ApiKeySettingsContext);
  if (!context) {
    throw new Error(
      "useApiKeySettings must be used inside ApiKeySettingsProvider.",
    );
  }

  return context;
}

export default function ApiKeySettings() {
  const {
    settings,
    providers,
    providerKeys,
    selectedProvider,
    selectedModelName,
    hasApiKey,
    isLoadingProviders,
    providersError,
    setProvider,
    setApiKey,
    setModel,
  } = useApiKeySettings();

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isPanelOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!panelRef.current?.contains(target)) {
        setIsPanelOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPanelOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isPanelOpen]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setIsPanelOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/90 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-cyan-500/60 hover:text-zinc-100"
        aria-expanded={isPanelOpen}
        aria-controls="api-key-settings-panel"
      >
        <KeyRound className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">API Key</span>
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            hasApiKey ? "bg-emerald-400" : "bg-zinc-500"
          }`}
          aria-hidden
        />
        <span className="hidden max-w-36 truncate text-xs text-zinc-400 lg:inline">
          {selectedModelName}
        </span>
      </button>

      {isPanelOpen && (
        <section
          id="api-key-settings-panel"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-[min(92vw,26rem)] rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-2xl shadow-black/50"
        >
          <header className="flex items-start justify-between border-b border-zinc-800 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                BYOK Settings
              </p>
              <p className="mt-1 text-sm text-zinc-200">
                Configure your provider, key, and model.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPanelOpen(false)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="space-y-4 p-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
              <p className="text-xs text-zinc-400">Current model</p>
              <p className="mt-1 text-sm font-medium text-zinc-100">
                {selectedModelName}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                <CheckCircle2
                  className={`h-3.5 w-3.5 ${
                    hasApiKey ? "text-emerald-400" : "text-zinc-600"
                  }`}
                  aria-hidden
                />
                {hasApiKey ? "API key configured" : "API key not configured"}
              </p>
            </div>

            {isLoadingProviders && (
              <p className="text-sm text-zinc-400">Loading providers...</p>
            )}

            {providersError && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {providersError}
              </p>
            )}

            {!isLoadingProviders && !providersError && selectedProvider && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {providerKeys.map((providerKey) => {
                    const isSelected = settings.provider === providerKey;
                    const providerLabel = providers[providerKey]?.label ?? providerKey;

                    return (
                      <button
                        key={providerKey}
                        type="button"
                        onClick={() => setProvider(providerKey)}
                        className={`rounded-xl border px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                          isSelected
                            ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                            : "border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                        }`}
                      >
                        {providerLabel}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label
                    htmlFor="provider-api-key"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500"
                  >
                    {selectedProvider.api_key_name}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="provider-api-key"
                      type={showApiKey ? "text" : "password"}
                      value={settings.apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="Paste your API key"
                      autoComplete="off"
                      spellCheck={false}
                      className="h-10 flex-1 rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-cyan-500/70 focus:ring-2 focus:ring-cyan-500/25"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((current) => !current)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                      aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" aria-hidden />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="provider-model"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500"
                  >
                    Model
                  </label>
                  <select
                    id="provider-model"
                    value={settings.model}
                    onChange={(event) => setModel(event.target.value)}
                    className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/70 focus:ring-2 focus:ring-cyan-500/25"
                  >
                    {selectedProvider.models.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
