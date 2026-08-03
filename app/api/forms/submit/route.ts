import { NextRequest, NextResponse } from 'next/server';
import { saveFormSubmission } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, formName = 'contact', data } = body;

    if (!projectId || !data || typeof data !== 'object') {
      return NextResponse.json({ success: false, error: 'projectId and valid data object are required' }, { status: 400 });
    }

    const submission = await saveFormSubmission(projectId, formName, data);
    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (err: any) {
    console.error('Error in POST /api/forms/submit:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to submit form' }, { status: 500 });
  }
}
