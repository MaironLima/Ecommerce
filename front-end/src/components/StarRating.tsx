import { Star } from "lucide-react";

interface StarRatingProps {
  value: number;
  size?: number;
  onChange?: (value: number) => void;
}

// Read-only when no onChange is given; otherwise an accessible 1–5 picker.
function StarRating({ value, size = 16, onChange }: StarRatingProps) {
  return (
    <div className="flex items-center gap-1" role={onChange ? "radiogroup" : "img"} aria-label={`${value} of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < Math.round(value);
        const star = (
          <Star
            size={size}
            className={filled ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}
          />
        );
        return onChange ? (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i + 1 === value}
            aria-label={`${i + 1} star${i ? "s" : ""}`}
            onClick={() => onChange(i + 1)}
            className="transition-transform hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={i}>{star}</span>
        );
      })}
    </div>
  );
}

export default StarRating;
