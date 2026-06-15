import type { SessionMeta, SessionMessage } from "@/types";

const API_BASE = "/api";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const sessionsApi = {
  async list(): Promise<SessionMeta[]> {
    return fetchJSON<SessionMeta[]>(`${API_BASE}/sessions`);
  },

  async getMessages(sourcePath: string): Promise<SessionMessage[]> {
    const encoded = encodeURIComponent(sourcePath);
    return fetchJSON<SessionMessage[]>(
      `${API_BASE}/sessions/messages?sourcePath=${encoded}`,
    );
  },

  getExportUrl(sourcePath: string): string {
    const encoded = encodeURIComponent(sourcePath);
    return `${API_BASE}/sessions/export?sourcePath=${encoded}`;
  },

  getOpenFolderUrl(sourcePath: string): string {
    const encoded = encodeURIComponent(sourcePath);
    return `${API_BASE}/sessions/open-folder?sourcePath=${encoded}`;
  },
};
