/**
 * Shown when OpenRouter returns HTTP 429 (free-tier / burst limits).
 * Not a bug in the app—users should wait and retry.
 */
export default function RateLimitNotice({ onDismiss }) {
  return (
    <div
      className="rate-limit"
      role="status"
      aria-live="polite"
    >
      <p className="rate-limit__title">Free AI limit — please wait a moment</p>
      <p className="rate-limit__lead">
        You&apos;ve hit a <strong>temporary cap</strong> on how many free requests OpenRouter allows
        (per minute or per day). <strong>This is not a bug in MumzGift</strong> — the model host is
        throttling.
      </p>
      <ul className="rate-limit__list">
        <li>Wait <strong>2–5 minutes</strong> (or try again later today).</li>
        <li>Refresh the page, then run your search again — don&apos;t click rapidly.</li>
        <li>
          Optional: add a small <strong>credit</strong> on{" "}
          <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">
            openrouter.ai
          </a>{" "}
          for higher limits, or use a calmer test pace.
        </li>
      </ul>
      {typeof onDismiss === "function" && (
        <button type="button" className="rate-limit__dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
