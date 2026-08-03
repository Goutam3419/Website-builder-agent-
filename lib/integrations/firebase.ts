// Real Firebase Realtime Database REST API integration

export interface FirebaseSyncResult {
  success: boolean;
  syncedPath?: string;
  error?: string;
}

export async function testFirebaseConnection(dbUrl: string, secret?: string): Promise<{ success: boolean; error?: string }> {
  try {
    let cleanUrl = dbUrl.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    let reqUrl = `${cleanUrl}/.json?shallow=true`;
    if (secret) {
      reqUrl += `&auth=${encodeURIComponent(secret)}`;
    }

    const res = await fetch(reqUrl);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.error || `Firebase HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error connecting to Firebase Database URL' };
  }
}

export async function syncToFirebase(
  dbUrl: string,
  secret: string | undefined,
  projectId: string,
  projectData: { name: string; files: Record<string, string>; updated_at: string }
): Promise<FirebaseSyncResult> {
  if (!dbUrl) {
    return { success: false, error: 'Firebase Realtime Database URL is required.' };
  }

  try {
    let cleanUrl = dbUrl.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    let reqUrl = `${cleanUrl}/projects/${encodeURIComponent(projectId)}.json`;
    if (secret) {
      reqUrl += `?auth=${encodeURIComponent(secret)}`;
    }

    const res = await fetch(reqUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: projectId,
        name: projectData.name,
        files: projectData.files,
        updated_at: projectData.updated_at,
        synced_by: 'WebsiteBuilderAgent',
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.error || `Firebase Sync Failed (HTTP ${res.status})` };
    }

    return {
      success: true,
      syncedPath: `${cleanUrl}/projects/${projectId}.json`,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Firebase sync exception occurred' };
  }
}
