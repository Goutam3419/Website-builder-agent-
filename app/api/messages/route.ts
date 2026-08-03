import { NextRequest, NextResponse } from 'next/server';
import { getMessages, getOrCreateUser, saveMessage } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);
    const messages = await getMessages(projectId, user.id);

    return NextResponse.json({ success: true, messages });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const body = await req.json();

    const { projectId, role, content, reasoning, actionTaken, stepDetails } = body;

    if (!projectId || !content) {
      return NextResponse.json({ success: false, error: 'projectId and content are required' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);
    const msg = await saveMessage(
      projectId,
      user.id,
      role || 'user',
      content,
      reasoning || '',
      actionTaken || '',
      stepDetails || []
    );

    return NextResponse.json({ success: true, message: msg });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
