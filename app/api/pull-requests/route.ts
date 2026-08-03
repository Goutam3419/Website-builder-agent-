import { NextRequest, NextResponse } from 'next/server';
import { getPullRequests } from '@/lib/db';

// GET /api/pull-requests?projectId= -> list PRs the agent has opened for this project
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }
    const pullRequests = await getPullRequests(projectId);
    return NextResponse.json({ success: true, pullRequests });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
