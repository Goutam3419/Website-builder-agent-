import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, getProject, getUserSettings, updateProject } from '@/lib/db';
import { deployToVercel } from '@/lib/integrations/vercel';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const body = await req.json();

    const { projectId } = body;

    const user = await getOrCreateUser(uid);
    const project = await getProject(projectId, user.id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const settings = await getUserSettings(user.id);
    if (!settings.vercel_token) {
      return NextResponse.json(
        { success: false, error: 'Vercel API Token must be configured in Settings.' },
        { status: 400 }
      );
    }

    const result = await deployToVercel(settings.vercel_token, project.name, project.files, settings.vercel_team_id);

    if (result.success && result.url) {
      await updateProject(projectId, user.id, { live_url: result.url });
    }

    return NextResponse.json({ success: result.success, result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
