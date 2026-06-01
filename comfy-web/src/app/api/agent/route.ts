import { NextRequest, NextResponse } from 'next/server';

const LMSTUDIO_CHAT_URL = 'http://127.0.0.1:1234/v1/chat/completions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...params } = body;

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    if (action === 'clarify') {
      const { prompt, model } = params;
      if (!prompt || !model) {
        return NextResponse.json({ error: 'Prompt and model are required' }, { status: 400 });
      }

      const systemMsg = {
        role: 'system',
        content: `You are a helpful AI assistant that helps users describe scenes for AI video generation. Ask concise clarifying questions when needed. Keep responses brief.

User wants to create a scene. Ask 1-2 brief questions if anything is unclear (style, mood, duration, specific elements). If the description is clear enough, just ask for the duration in seconds.`,
      };

      const userMsg = {
        role: 'user',
        content: `The user wants to create an AI-generated scene. Help them clarify their vision.

User's description: "${prompt}"

Ask 1-2 brief clarifying questions if needed, or ask for the scene duration.`,
      };

      const lmRes = await fetch(LMSTUDIO_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [systemMsg, userMsg],
          temperature: 0.4,
          max_tokens: 300,
        }),
      });

      if (!lmRes.ok) {
        const errText = await lmRes.text();
        return NextResponse.json({ error: errText || 'LM Studio error' }, { status: lmRes.status });
      }

      const data = await lmRes.json();
      return NextResponse.json({ response: data.choices?.[0]?.message?.content || '' });
    }

    if (action === 'plan') {
      const { prompt, duration, model } = params;
      if (!prompt || !duration || !model) {
        return NextResponse.json({ error: 'Prompt, duration, and model are required' }, { status: 400 });
      }

      const segments = Math.ceil(duration / 5.0625);
      const actualDuration = segments * 5.0625;

      const systemMsg = {
        role: 'system',
        content: `You are a professional AI film director and scene planner. Output ONLY valid JSON. No markdown, no code fences, no explanation.

OUTPUT SCHEMA:
{
  "scene": {
    "duration": <number>,
    "segments": <number>,
    "style": "<cinematic style>",
    "continuity": {
      "lighting": "<lighting instructions>",
      "camera_motion": "<camera instructions>",
      "subject": "<subject continuity>",
      "environment": "<environment continuity>",
      "pacing": "<pacing instructions>"
    }
  },
  "image_prompt": "<detailed image gen prompt>",
  "video_prompts": ["<seg 1 prompt>", "<seg 2 prompt>", ...],
  "continuity_notes": ["<note 1>", "<note 2>", ...]
}`,
      };

      const userMsg = {
        role: 'user',
        content: `Create a scene plan for:\n"${prompt}"\n\nDuration: ${duration}s\nSegments: ${segments}\nGenerate EXACTLY ${segments} video prompts.`,
      };

      const lmRes = await fetch(LMSTUDIO_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [systemMsg, userMsg],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      if (!lmRes.ok) {
        const errText = await lmRes.text();
        return NextResponse.json({ error: errText || 'LM Studio error' }, { status: lmRes.status });
      }

      const data = await lmRes.json();
      const rawText = data.choices?.[0]?.message?.content || '';

      return NextResponse.json({ raw: rawText });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Agent API error' },
      { status: 500 },
    );
  }
}
