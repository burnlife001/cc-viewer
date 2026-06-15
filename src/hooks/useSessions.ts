import { useQuery } from "@tanstack/react-query";
import type { SessionMeta, SessionMessage } from "@/types";
import { sessionsApi } from "@/lib/api";

export function useSessionsQuery() {
  return useQuery<SessionMeta[]>({
    queryKey: ["sessions"],
    queryFn: async () => sessionsApi.list(),
    staleTime: 30 * 1000,
  });
}

export function useSessionMessagesQuery(sourcePath?: string) {
  return useQuery<SessionMessage[]>({
    queryKey: ["sessionMessages", sourcePath],
    queryFn: async () => sessionsApi.getMessages(sourcePath!),
    enabled: Boolean(sourcePath),
    staleTime: 30 * 1000,
  });
}
