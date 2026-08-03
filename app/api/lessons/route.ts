import { NextRequest, NextResponse } from 'next/server';
import { deleteLesson, getLessons, getOrCreateUser } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const uid = searchParams.get('uid') || 'default_user';

    const user = await getOrCreateUser(uid);
    const lessons = await getLessons(projectId, user.id, true);

    return NextResponse.json({ success: true, lessons });
  } catch (err: any) {
    console.error('Error in GET /api/lessons:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch lessons' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lessonId = searchParams.get('lessonId');
    const uid = searchParams.get('uid') || 'default_user';

    if (!lessonId) {
      return NextResponse.json({ success: false, error: 'lessonId is required' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);
    const success = await deleteLesson(lessonId, user.id);

    return NextResponse.json({ success });
  } catch (err: any) {
    console.error('Error in DELETE /api/lessons:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to delete lesson' }, { status: 500 });
  }
}
