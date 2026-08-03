// Real Vercel REST API integration

export interface VercelDeployResult {
  success: boolean;
  deploymentId?: string;
  url?: string;
  inspectorUrl?: string;
  readyState?: string;
  error?: string;
}

export async function testVercelToken(token: string): Promise<{ success: boolean; username?: string; error?: string }> {
  try {
    const res = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.error?.message || `Vercel API HTTP ${res.status}` };
    }

    const data = await res.json();
    return { success: true, username: data.user?.username || data.user?.email || 'Vercel User' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error connecting to Vercel' };
  }
}

export interface VercelDeploymentStatus {
  readyState: string; // 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED'
  url?: string;
  error?: string;
}

// Polls a deployment until it reaches a terminal state or the timeout
// elapses. Bounded and short by design — this runs inline in a request
// handler, not a background job, so it can't wait indefinitely. Most
// static-site build failures (the kind the Diagnostic Agent can actually
// fix — bad HTML/JS, missing files) surface within the first ~20-30s;
// this is not meant to catch slow framework builds.
export async function pollDeploymentStatus(
  token: string,
  deploymentId: string,
  teamId?: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<VercelDeploymentStatus> {
  const timeoutMs = opts.timeoutMs ?? 25000;
  const intervalMs = opts.intervalMs ?? 3000;
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  const startedAt = Date.now();
  const terminalStates = ['READY', 'ERROR', 'CANCELED'];

  let lastState: VercelDeploymentStatus = { readyState: 'BUILDING' };

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}${teamQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        lastState = { readyState: 'ERROR', error: `Status check failed (HTTP ${res.status})` };
        break;
      }
      const data = await res.json();
      lastState = {
        readyState: data.readyState || 'BUILDING',
        url: data.url ? `https://${data.url}` : undefined,
      };
      if (terminalStates.includes(lastState.readyState)) {
        return lastState;
      }
    } catch (err: any) {
      lastState = { readyState: 'ERROR', error: err.message || 'Network error while polling deployment' };
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return lastState; // Timed out still BUILDING, or broke out on an error above.
}

// Fetches raw build log text for a deployment — feeds the Diagnostic
// Agent's root-cause analysis.
export async function fetchDeploymentLogs(token: string, deploymentId: string, teamId?: string): Promise<string> {
  const teamQuery = teamId ? `&teamId=${encodeURIComponent(teamId)}` : '';
  try {
    const res = await fetch(`https://api.vercel.com/v3/deployments/${deploymentId}/events?limit=500${teamQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return `[log fetch failed: HTTP ${res.status}]`;
    }
    const events = await res.json();
    if (!Array.isArray(events)) return '[no structured log events returned]';
    return events
      .map((e: any) => e?.payload?.text || '')
      .filter(Boolean)
      .join('\n')
      .slice(0, 8000); // keep the diagnostic prompt bounded
  } catch (err: any) {
    return `[log fetch exception: ${err.message || 'unknown error'}]`;
  }
}

export async function deployToVercel(
  token: string,
  projectName: string,
  files: Record<string, string>,
  teamId?: string
): Promise<VercelDeployResult> {
  if (!token || !projectName) {
    return { success: false, error: 'Vercel API token and project name are required.' };
  }

  try {
    const sanitizedProjectName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-website';

    // Prepare files array for Vercel REST API v13
    const filePayload = Object.entries(files).map(([filePath, content]) => ({
      file: filePath.replace(/^\/+/, ''),
      data: content,
    }));

    // If index.html is missing, provide a standard entry
    if (!filePayload.some((f) => f.file === 'index.html' || f.file === 'app/page.tsx' || f.file === 'pages/index.tsx')) {
      filePayload.push({
        file: 'index.html',
        data: '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Website</title></head><body><div id="root">Website Loaded</div></body></html>',
      });
    }

    let url = 'https://api.vercel.com/v13/deployments';
    if (teamId) {
      url += `?teamId=${encodeURIComponent(teamId)}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: sanitizedProjectName,
        files: filePayload,
        projectSettings: {
          framework: null, // Static web deployment
        },
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errData.error?.message || errData.message || `Vercel Deployment Failed (HTTP ${res.status})`,
      };
    }

    const data = await res.json();
    const liveUrl = data.url ? `https://${data.url}` : undefined;

    return {
      success: true,
      deploymentId: data.id,
      url: liveUrl,
      inspectorUrl: data.inspectorUrl,
      readyState: data.readyState || 'BUILDING',
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Vercel deployment exception occurred' };
  }
}
