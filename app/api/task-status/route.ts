import { NextRequest, NextResponse } from 'next/server';
import { getActiveTaskPlan } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'Missing projectId parameter' }, { status: 400 });
    }

    const taskPlan = await getActiveTaskPlan(projectId);
    return NextResponse.json({ success: true, taskPlan });
  } catch (err: any) {
    console.error('Error in /api/task-status:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
