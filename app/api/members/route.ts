import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, addProjectMember, getProjectMembers, getUserRoleForProject, removeProjectMember } from '@/lib/db';

// GET /api/members?projectId=&uid= -> list members + caller's own role
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);
    const members = await getProjectMembers(projectId);
    const myRole = await getUserRoleForProject(projectId, user.id);

    return NextResponse.json({ success: true, members, myRole });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/members -> invite another user (by their uid) to this project.
// Only the project owner can invite (checked server-side, not just hidden in UI).
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const body = await req.json();
    const { projectId, inviteeUid, role } = body as { projectId: string; inviteeUid: string; role: 'editor' | 'viewer' };

    if (!projectId || !inviteeUid || !role) {
      return NextResponse.json({ success: false, error: 'projectId, inviteeUid, and role are required' }, { status: 400 });
    }
    if (!['editor', 'viewer'].includes(role)) {
      return NextResponse.json({ success: false, error: 'role must be editor or viewer' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);
    const myRole = await getUserRoleForProject(projectId, user.id);
    if (myRole !== 'owner') {
      return NextResponse.json({ success: false, error: 'Only the project owner can invite members' }, { status: 403 });
    }

    const invitee = await getOrCreateUser(inviteeUid);
    const member = await addProjectMember(projectId, invitee.id, role, user.id);

    return NextResponse.json({ success: true, member });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/members?projectId=&memberUid=&uid= -> remove a member (owner only)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const projectId = searchParams.get('projectId');
    const memberUid = searchParams.get('memberUid');

    if (!projectId || !memberUid) {
      return NextResponse.json({ success: false, error: 'projectId and memberUid are required' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);
    const myRole = await getUserRoleForProject(projectId, user.id);
    if (myRole !== 'owner') {
      return NextResponse.json({ success: false, error: 'Only the project owner can remove members' }, { status: 403 });
    }

    const memberUser = await getOrCreateUser(memberUid);
    await removeProjectMember(projectId, memberUser.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
