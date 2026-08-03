import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, getUserSettings, saveUserSettings } from '@/lib/db';
import { testGitHubToken } from '@/lib/integrations/github';
import { testVercelToken } from '@/lib/integrations/vercel';
import { testFirebaseConnection } from '@/lib/integrations/firebase';

// Never send raw secrets back to the browser once saved. Shows just enough
// (first 4 chars) so the user can recognize which token is connected.
function redactToken(value?: string | null): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(value.length - 4, 24))}`;
}

function redactSettings(settings: any) {
  return {
    ...settings,
    github_token: redactToken(settings?.github_token),
    vercel_token: redactToken(settings?.vercel_token),
    firebase_secret: redactToken(settings?.firebase_secret),
    anthropic_api_key: redactToken(settings?.anthropic_api_key),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';

    const user = await getOrCreateUser(uid);
    const settings = await getUserSettings(user.id);

    return NextResponse.json({ success: true, settings: redactSettings(settings) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const body = await req.json();

    const user = await getOrCreateUser(uid);

    // If a secret field still shows its redacted placeholder (user didn't
    // retype it), drop it from the update so the real stored value is kept
    // instead of being overwritten with asterisks.
    const current = await getUserSettings(user.id);
    for (const field of ['github_token', 'vercel_token', 'firebase_secret', 'anthropic_api_key'] as const) {
      if (body[field] !== undefined && body[field] === redactToken(current?.[field])) {
        delete body[field];
      }
    }

    const updatedSettings = await saveUserSettings(user.id, body);

    // Test Connections Status
    const statusResults = {
      github: { connected: false, user: '', error: '' },
      vercel: { connected: false, user: '', error: '' },
      firebase: { connected: false, error: '' },
    };

    if (updatedSettings.github_token) {
      const ghTest = await testGitHubToken(updatedSettings.github_token);
      statusResults.github = {
        connected: ghTest.success,
        user: ghTest.username || '',
        error: ghTest.error || '',
      };
    }

    if (updatedSettings.vercel_token) {
      const vTest = await testVercelToken(updatedSettings.vercel_token);
      statusResults.vercel = {
        connected: vTest.success,
        user: vTest.username || '',
        error: vTest.error || '',
      };
    }

    if (updatedSettings.firebase_db_url) {
      const fbTest = await testFirebaseConnection(updatedSettings.firebase_db_url, updatedSettings.firebase_secret);
      statusResults.firebase = {
        connected: fbTest.success,
        error: fbTest.error || '',
      };
    }

    return NextResponse.json({ success: true, settings: redactSettings(updatedSettings), status: statusResults });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
