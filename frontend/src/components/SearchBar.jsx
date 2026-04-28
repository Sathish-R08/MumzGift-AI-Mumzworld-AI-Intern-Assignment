import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

/**
 * @param {object} props
 * @param {(query: string) => Promise<void>} props.onSearch
 * @param {boolean} props.loading
 */
export default function SearchBar({ onSearch, loading }) {
  const [value, setValue] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    await onSearch(value);
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <label className="search-bar__label" htmlFor="gift-query">
        Your request
      </label>
      <div className="search-bar__field-wrap">
        <input
          id="gift-query"
          className="search-bar__input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="What are you shopping for?"
          autoComplete="off"
          disabled={loading}
          aria-describedby="search-hint"
        />
      </div>
      <p id="search-hint" className="search-bar__hint">
        Gifts for <strong>mom</strong>, <strong>baby</strong>, or a <strong>mom-to-be</strong> — say who
        it’s for, age if you know it, and your <strong>budget in AED</strong>. Example: “Friend with a
        6-month-old, under 200 AED.”
      </p>
      <div className="search-bar__actions">
        <button className="search-bar__button" type="submit" disabled={loading}>
          {loading ? (
            <span className="search-bar__spinner-wrap" aria-live="polite">
              <span className="search-bar__spinner" />
              <span>Searching</span>
            </span>
          ) : (
            <>
              Find gifts <span aria-hidden>🎁</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export { API_BASE };
