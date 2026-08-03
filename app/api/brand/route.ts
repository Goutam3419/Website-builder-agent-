import { NextRequest, NextResponse } from 'next/server';
import { getBrandProfile, saveBrandProfile } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const profile = await getBrandProfile(projectId);
    return NextResponse.json({ success: true, brandProfile: profile });
  } catch (err: any) {
    console.error('Error in GET /api/brand:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch brand profile' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, brandProfile } = body;

    if (!projectId || !brandProfile) {
      return NextResponse.json({ success: false, error: 'projectId and brandProfile are required' }, { status: 400 });
    }

    const updated = await saveBrandProfile(projectId, brandProfile);
    return NextResponse.json({ success: true, brandProfile: updated });
  } catch (err: any) {
    console.error('Error in POST /api/brand:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to save brand profile' }, { status: 500 });
  }
}
