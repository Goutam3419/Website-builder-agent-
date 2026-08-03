import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, getProject, getUserSettings } from '@/lib/db';
import { pushToGitHub } from '@/lib/integrations/github';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const body = await req.json();

    const { projectId, commitMessage } = body;

    const user = await getOrCreateUser(uid);
    const project = await getProject(projectId, user.id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const settings = await getUserSettings(user.id);
    if (!settings.github_token || !settings.github_owner || !settings.github_repo) {
      return NextResponse.json(
        { success: false, error: 'GitHub Personal Access Token, Owner, and Repository must be configured in Settings.' },
        { status: 400 }
      );
    }

    const result = await pushToGitHub(
      settings.github_token,
      settings.github_owner,
      settings.github_repo,
      project.files,
      commitMessage || `Commit for ${project.name}`
    );

    return NextResponse.json({ success: result.success, result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
