/**
 * @param {object} props
 * @param {object} props.item - one recommendation from the API
 */
export default function GiftCard({ item }) {
  const c = item.confidence;
  let badgeClass = "badge badge--low";
  if (c > 0.85) {
    badgeClass = "badge badge--high";
  } else if (c >= 0.6) {
    badgeClass = "badge badge--med";
  }

  const pct = Math.round(c * 1000) / 10;

  return (
    <article className="gift-card">
      <h3 className="gift-card__title-en">{item.product_name_en}</h3>
      <p className="gift-card__title-ar" dir="rtl" lang="ar">
        {item.product_name_ar}
      </p>
      <p className="gift-card__reason gift-card__reason--en">{item.reason_en}</p>
      <p className="gift-card__reason gift-card__reason--ar" dir="rtl" lang="ar">
        {item.reason_ar}
      </p>
      <div className="gift-card__meta">
        <span className="gift-card__price">
          {item.estimated_price_aed} AED
          {item.age_appropriate ? " · age-appropriate" : ""}
        </span>
        <span className={badgeClass} title="Model confidence for this item">
          Confidence {pct}%
        </span>
      </div>
    </article>
  );
}
