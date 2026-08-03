import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, getVectorEmbeddings } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);
    const embeddings = await getVectorEmbeddings(projectId, user.id);

    return NextResponse.json({ success: true, embeddings });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
