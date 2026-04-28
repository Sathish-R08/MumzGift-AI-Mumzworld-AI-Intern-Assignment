import { useCallback, useState } from "react";
import SearchBar, { API_BASE } from "./components/SearchBar.jsx";
import GiftCard from "./components/GiftCard.jsx";
import RateLimitNotice from "./components/RateLimitNotice.jsx";

/** 429, or 502/502-like JSON that clearly indicates throttling (OpenRouter wording). */
function isRateLimitedResponse(res, json) {
  if (res.status === 429) {
    return true;
  }
  if (json?.code === "OPENROUTER_RATE_LIMIT" || json?.error === "rate_limit") {
    return true;
  }
  const parts = [
    json?.message,
    json?.error,
    json?.body,
    json?.provider_debug,
  ]
    .filter(Boolean)
    .join(" ");
  return /rate\s*limit|too\s*many\s*requests|429|throttl|quota|capacity/i.test(parts);
}

const initialState = {
  query_understood: null,
  reason_if_not_understood: null,
  recipient: null,
  age_months: null,
  budget_aed: null,
  occasion: null,
  recommendations: [],
  overall_confidence: null,
  out_of_scope: null,
  out_of_scope_reason: null,
};

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRateLimit, setShowRateLimit] = useState(false);

  const handleSearch = useCallback(async (query) => {
    setError(null);
    setShowRateLimit(false);
    setLoading(true);
    setData(null);
    const trimmed = String(query).trim();
    if (!trimmed) {
      setError("Type your gift idea above, then tap Find gifts.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/gift-finder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isRateLimitedResponse(res, json)) {
          setShowRateLimit(true);
          setError(null);
          setData(null);
          return;
        }
        // Prefer OpenRouter / backend detail (body may be JSON string from provider)
        let msg =
          json.message ||
          json.error ||
          (Array.isArray(json.details) ? json.details.map((d) => d.message).join(" ") : null) ||
          res.statusText;
        if (json.body) {
          try {
            const inner = JSON.parse(json.body);
            const innerMsg = inner.error?.message || inner.message || inner.error;
            if (typeof innerMsg === "string" && innerMsg.length) {
              msg = innerMsg;
            }
          } catch {
            if (typeof json.body === "string" && json.body.length < 500) {
              msg = typeof msg === "string" ? `${msg} — ${json.body}` : String(json.body);
            }
          }
        }
        if (res.status === 401) {
          msg = "Invalid or missing OpenRouter API key. Check backend/.env (OPENROUTER_API_KEY) and restart the server.";
        } else if (res.status === 402) {
          msg =
            (typeof msg === "string" && msg.length > 0 && msg) ||
            "OpenRouter: add credits or check account limits (HTTP 402).";
        } else if (res.status === 502) {
          if (typeof msg === "string" && msg.length < 3) {
            msg =
              "The AI service is unavailable (often a temporary free-model overload). Wait and retry, or set OPENROUTER_MODELS in backend/.env and restart the API.";
          }
        }
        setError(typeof msg === "string" && msg.length ? msg : "Request failed. Please try again.");
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error. Is the API running on port 3001?");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const safe = data ?? initialState;
  const overallPct =
    typeof safe.overall_confidence === "number"
      ? Math.round(safe.overall_confidence * 1000) / 10
      : null;

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__card">
          <div className="hero__head">
            <h1 className="app__title">MumzGift AI</h1>
            <span className="hero__emoji" aria-hidden>
              🎁
            </span>
          </div>
          <p className="app__subtitle">Find the perfect gift for any mom or baby</p>
          <SearchBar onSearch={handleSearch} loading={loading} />
        </div>
      </header>

      {showRateLimit && (
        <RateLimitNotice onDismiss={() => setShowRateLimit(false)} />
      )}

      {error && !showRateLimit && (
        <div className="app__message app__message--error" role="alert">
          {error}
        </div>
      )}

      {data && !loading && !error && data.out_of_scope && (
        <p className="app__message app__message--soft">
          Sorry, I can only help with mom and baby gift suggestions 😊
        </p>
      )}

      {data && !loading && !error && !data.out_of_scope && !data.query_understood && (
        <p className="app__message app__message--soft">
          I didn&apos;t quite understand that. Can you give more details?
        </p>
      )}

      {data && !data.out_of_scope && data.query_understood && (safe.recommendations?.length ?? 0) > 0 && (
        <section className="app__grid" aria-live="polite">
          {safe.recommendations.map((item, i) => (
            <GiftCard key={`${item.product_name_en}-${i}`} item={item} />
          ))}
        </section>
      )}

      {data && !data.out_of_scope && data.query_understood && (safe.recommendations?.length ?? 0) === 0 && !error && (
        <p className="app__message app__message--soft">
          No specific recommendations this time. Try a bit more detail or a different budget.
        </p>
      )}

      {data && overallPct !== null && !error && (
        <footer className="app__footer">
          Overall confidence: <strong>{overallPct}%</strong>
        </footer>
      )}
    </div>
  );
}
