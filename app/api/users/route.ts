import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const name = searchParams.get('name') || 'Builder User';

    const user = await getOrCreateUser(uid, name);

    const response = NextResponse.json({ success: true, user });
    response.cookies.set('website_builder_uid', user.uid, {
      path: '/',
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
