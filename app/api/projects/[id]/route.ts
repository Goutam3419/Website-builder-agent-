import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, getProject, updateProject } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';

    const user = await getOrCreateUser(uid);
    const project = await getProject(projectId, user.id);

    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, project });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const body = await req.json();

    const user = await getOrCreateUser(uid);
    const updated = await updateProject(projectId, user.id, body);

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Project not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ success: true, project: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
