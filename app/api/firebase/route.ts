import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, getProject, getUserSettings } from '@/lib/db';
import { syncToFirebase } from '@/lib/integrations/firebase';

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
    if (!settings.firebase_db_url) {
      return NextResponse.json(
        { success: false, error: 'Firebase Realtime Database URL must be configured in Settings.' },
        { status: 400 }
      );
    }

    const result = await syncToFirebase(settings.firebase_db_url, settings.firebase_secret, projectId, {
      name: project.name,
      files: project.files,
      updated_at: project.updated_at,
    });

    return NextResponse.json({ success: result.success, result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
