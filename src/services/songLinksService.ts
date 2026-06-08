import { apiFetch } from './apiFetch';
export const songLinksService = {
  async getStreamingLinks(songUid: string): Promise<{ links: Array<{ platform: string; url: string; label: string }> }> {
    const response = await apiFetch(`/api/songs/${songUid}/streaming-links`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to fetch streaming links');
    }
    return response.json();
  }
};
