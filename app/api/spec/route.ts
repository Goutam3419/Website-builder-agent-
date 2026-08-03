import { NextRequest, NextResponse } from 'next/server';
import { Type } from '@google/genai';
import { getOrCreateUser, createSpec, getLatestSpec, updateSpecStatus } from '@/lib/db';
import { generateWithFallback } from '@/lib/agent/geminiClient';

// GET /api/spec?projectId=&uid= -> returns the latest spec for a project (if any)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }
    const spec = await getLatestSpec(projectId);
    return NextResponse.json({ success: true, spec });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/spec -> turns a raw, informal requirement into a structured SPEC
// (goals, pages, features, constraints, acceptance criteria) BEFORE any code
// is generated. This is the "spec-first" workflow: approve the spec, then
// the orchestrator builds against it instead of just the raw prompt.
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid') || req.cookies.get('website_builder_uid')?.value || 'anon_user_default';
    const body = await req.json();
    const { projectId, rawRequirement } = body as { projectId: string; rawRequirement: string };

    if (!projectId || !rawRequirement) {
      return NextResponse.json({ success: false, error: 'projectId and rawRequirement are required' }, { status: 400 });
    }

    const user = await getOrCreateUser(uid);

    const response = await generateWithFallback({
      contents: `Convert this informal project requirement into a structured software specification:\n\n"${rawRequirement}"`,
      config: {
        systemInstruction:
          'You are a requirements analyst. Break down informal requests into a precise, structured spec that a development agent can build against unambiguously. Be concrete — list actual page names, actual features, not vague categories.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            goals: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'High-level goals of this project' },
            pages: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Concrete list of pages/screens to build' },
            features: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Concrete features/functionality required' },
            constraints: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Technical or design constraints mentioned or implied' },
            acceptance_criteria: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Concrete, testable criteria that define "done"',
            },
          },
          required: ['goals', 'pages', 'features', 'acceptance_criteria'],
        },
      },
    });

    let structuredSpec: any;
    try {
      structuredSpec = JSON.parse(response.text || '{}');
    } catch {
      structuredSpec = { goals: [], pages: [], features: [], constraints: [], acceptance_criteria: [] };
    }

    const spec = await createSpec(projectId, user.id, rawRequirement, structuredSpec);
    return NextResponse.json({ success: true, spec: { ...spec, structured_spec: structuredSpec } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH /api/spec -> approve/update a spec's status (draft -> approved -> building -> done)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { specId, status } = body as { specId: string; status: string };
    if (!specId || !status) {
      return NextResponse.json({ success: false, error: 'specId and status are required' }, { status: 400 });
    }
    await updateSpecStatus(specId, status as any);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
