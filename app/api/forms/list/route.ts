import { NextRequest, NextResponse } from 'next/server';
import { getFormSubmissions } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const submissions = await getFormSubmissions(projectId);
    return NextResponse.json({ success: true, submissions });
  } catch (err: any) {
    console.error('Error in GET /api/forms/list:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to list form submissions' }, { status: 500 });
  }
}
