export const formatRelativeTime = (value: number) => {
  const diffMs = value - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) {
    return "just now";
  }

  if (Math.abs(diffMinutes) < 60) {
    return `${Math.abs(diffMinutes)}m ${diffMinutes < 0 ? "ago" : "ahead"}`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return `${Math.abs(diffHours)}h ${diffHours < 0 ? "ago" : "ahead"}`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${Math.abs(diffDays)}d ${diffDays < 0 ? "ago" : "ahead"}`;
};

export const truncatePath = (value: string) => {
  const parts = value.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) {
    return value;
  }
  return `.../${parts.slice(-3).join("/")}`;
};

