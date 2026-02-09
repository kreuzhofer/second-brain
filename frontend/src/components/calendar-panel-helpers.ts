export function formatMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0m';
  }
  const minutes = Math.floor(value);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function formatPlanRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startDate} - ${endDate}`;
  }
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString(undefined, options)} - ${end.toLocaleDateString(undefined, options)}`;
}

export function formatBlockTime(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return startIso;
  }
  const dateLabel = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const startLabel = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const endLabel = end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dateLabel}, ${startLabel}-${endLabel}`;
}

export function formatExpiresAt(expiresAt: string): string {
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return expiresAt;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
