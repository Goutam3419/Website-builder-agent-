import { NextRequest, NextResponse } from 'next/server';
import { createProject, deleteProject, getOrCreateUser, getProjects, checkUserExists } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';

    // Check BEFORE getOrCreateUser, which would otherwise always report
    // "existing" on every call after the very first one.
    const wasExistingUser = await checkUserExists(uid);
    const user = await getOrCreateUser(uid);

    let projects = await getProjects(user.id);

    // Auto-create a starter project ONLY for a genuinely brand-new user —
    // never for a returning user whose project list is empty because they
    // deleted their last project. Auto-recreating in that case is exactly
    // what made "delete" look like it silently didn't work: the user
    // deletes their only project, reloads, and a fresh default one is
    // sitting there again.
    if (projects.length === 0 && !wasExistingUser) {
      const defaultProject = await createProject(
        user.id,
        'My First SaaS Web App',
        'An AI-generated SaaS landing page and interactive portal',
        {
          'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SaaS Studio</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-950 text-zinc-100 font-sans min-h-screen flex flex-col justify-between p-8">
  <header class="max-w-6xl mx-auto w-full flex justify-between items-center py-4 border-b border-zinc-800">
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white">S</div>
      <span class="text-xl font-bold tracking-tight">SaaS Studio</span>
    </div>
    <nav class="flex gap-6 text-sm text-zinc-400">
      <a href="#features" class="hover:text-white transition">Features</a>
      <a href="#pricing" class="hover:text-white transition">Pricing</a>
      <a href="#contact" class="hover:text-white transition">Contact</a>
    </nav>
  </header>

  <main class="max-w-4xl mx-auto text-center py-20 space-y-6">
    <span class="px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">AI-Powered Website Builder</span>
    <h1 class="text-5xl font-extrabold text-white tracking-tight leading-tight">Build & Deploy High-Converting Websites in Seconds</h1>
    <p class="text-lg text-zinc-400 max-w-2xl mx-auto">Use multi-step reasoning, real GitHub commits, and single-click Vercel deployments to launch your product online.</p>
    <div class="pt-6 flex justify-center gap-4">
      <button onclick="alert('Welcome to SaaS Studio!')" class="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg transition">Get Started Free</button>
      <a href="#features" class="px-8 py-3.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-medium rounded-xl transition">View Demo</a>
    </div>
  </main>

  <footer class="max-w-6xl mx-auto w-full text-center py-6 border-t border-zinc-900 text-xs text-zinc-500">
    &copy; 2026 SaaS Studio. Generated with Website Builder Agent.
  </footer>
</body>
</html>`,
        }
      );
      projects = [defaultProject];
    }

    return NextResponse.json({ success: true, projects, userId: user.id });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const body = await req.json();

    const name = body.name || 'Untitled Project';
    const description = body.description || 'AI Website Builder Project';

    const user = await getOrCreateUser(uid);
    const newProject = await createProject(user.id, name, description, body.files || {});

    return NextResponse.json({ success: true, project: newProject });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);
    const deleted = await deleteProject(projectId, user.id);

    return NextResponse.json({ success: true, deleted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
