import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STARS_MAX } from '@/lib/productReviews';

const sizeClasses = {
  sm: 'w-3.5 h-3.5',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
} as const;

type StarSize = keyof typeof sizeClasses;

interface StarRatingProps {
  /** Rating in stars, 0..5 (supports fractional values for partial fill). */
  stars: number;
  maxStars?: number;
  size?: StarSize;
  className?: string;
  /** Accessible label; defaults to "N out of M stars". */
  label?: string;
}

/**
 * Read-only star rating display. Renders partial fills (e.g. 4.3 stars).
 */
export function StarRating({
  stars,
  maxStars = STARS_MAX,
  size = 'md',
  className,
  label,
}: StarRatingProps) {
  const value = Number.isFinite(stars) ? Math.max(0, Math.min(maxStars, stars)) : 0;
  const aria = label ?? `${value.toFixed(1)} out of ${maxStars} stars`;

  return (
    <div
      className={cn('flex items-center gap-0.5', className)}
      role="img"
      aria-label={aria}
      title={aria}
    >
      {Array.from({ length: maxStars }, (_, index) => {
        const fillPercentage = Math.min(Math.max(value - index, 0), 1) * 100;
        return (
          <span key={index} className="relative inline-flex" aria-hidden="true">
            <Star
              className={cn(sizeClasses[size], 'text-slate-300 dark:text-slate-600')}
              strokeWidth={1.5}
            />
            <span
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${fillPercentage}%` }}
            >
              <Star
                className={cn(sizeClasses[size], 'text-amber-400 fill-amber-400')}
                strokeWidth={1.5}
              />
            </span>
          </span>
        );
      })}
    </div>
  );
}

interface StarRatingInputProps {
  /** Selected rating in whole stars, 0..5 (0 = none). */
  value: number;
  onChange: (stars: number) => void;
  maxStars?: number;
  size?: StarSize;
  className?: string;
  disabled?: boolean;
  /** Accessible group label, e.g. "Your rating". */
  label?: string;
}

/**
 * Interactive 1..N star picker. Accessible: an ARIA radiogroup of star buttons
 * with full keyboard support (arrow keys to change, click/Enter/Space to set).
 */
export function StarRatingInput({
  value,
  onChange,
  maxStars = STARS_MAX,
  size = 'lg',
  className,
  disabled = false,
  label = 'Your rating',
}: StarRatingInputProps) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  const setStars = (next: number) => {
    if (disabled) return;
    onChange(Math.max(0, Math.min(maxStars, next)));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setStars(Math.min(maxStars, (value || 0) + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setStars(Math.max(0, (value || 0) - 1));
    }
  };

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: maxStars }, (_, index) => {
        const starValue = index + 1;
        const filled = shown >= starValue;
        return (
          <button
            key={index}
            type="button"
            role="radio"
            aria-checked={value === starValue}
            aria-label={`${starValue} ${starValue === 1 ? 'star' : 'stars'}`}
            tabIndex={value === starValue || (value === 0 && index === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => setStars(starValue)}
            onMouseEnter={() => !disabled && setHover(starValue)}
            className={cn(
              'rounded-sm transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-robotechy-green',
              !disabled && 'cursor-pointer hover:scale-110',
              disabled && 'cursor-not-allowed opacity-60'
            )}
          >
            <Star
              className={cn(
                sizeClasses[size],
                filled ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-600'
              )}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
    </div>
  );
}
