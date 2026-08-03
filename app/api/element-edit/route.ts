import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/db';
import { runElementEditAgent } from '@/lib/agent/engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, uid = 'default_user', elementInfo, instruction } = body;

    if (!projectId || !instruction || !elementInfo) {
      return NextResponse.json({ success: false, error: 'projectId, elementInfo, and instruction are required' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);
    const result = await runElementEditAgent(projectId, user.id, elementInfo, instruction);

    return NextResponse.json({
      success: true,
      project: result.project,
      validationReport: result.validationReport,
    });
  } catch (err: any) {
    console.error('Error in POST /api/element-edit:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to edit element' }, { status: 500 });
  }
}
