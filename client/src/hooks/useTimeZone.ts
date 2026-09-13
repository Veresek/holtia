import { useAuth } from "../auth/AuthProvider";
import { DEFAULT_TIME_ZONE } from "../time";

export function useTimeZone() {
  const { user } = useAuth();
  return user?.timezone || DEFAULT_TIME_ZONE;
}
