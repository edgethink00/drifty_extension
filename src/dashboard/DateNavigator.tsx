import { shiftIsoDate } from '../lib/domain';
import { formatDateLabel } from '../shared/format';

export function DateNavigator({
  selectedDay,
  today,
  onDayChange
}: {
  readonly selectedDay: string;
  readonly today: string;
  readonly onDayChange: (day: string) => void;
}) {
  const isToday = selectedDay === today;
  const nextDay = shiftIsoDate(selectedDay, 1);
  const previousDay = shiftIsoDate(selectedDay, -1);

  return (
    <div className="dashboard-date-nav" aria-label="Dashboard date">
      <button type="button" aria-label="Previous day" onClick={() => onDayChange(previousDay)}>
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" className="dashboard-date-nav__today" aria-pressed={isToday} onClick={() => onDayChange(today)}>
        Today
      </button>
      <span className="dashboard-date-nav__label" aria-live="polite">{formatDateLabel(selectedDay)}</span>
      <button type="button" aria-label="Next day" disabled={nextDay > today} onClick={() => onDayChange(nextDay)}>
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
