export interface ScenePlan {
  scene: {
    duration: number;
    segments: number;
    style: string;
    continuity: {
      lighting: string;
      camera_motion: string;
      subject: string;
      environment: string;
      pacing: string;
    };
  };
  image_prompt: string;
  video_prompts: string[];
  continuity_notes: string[];
}

const SEGMENT_DURATION_FRAMES = 81;
const FPS = 16;
const FRAMES_PER_SEGMENT = SEGMENT_DURATION_FRAMES;
const SECONDS_PER_SEGMENT = FRAMES_PER_SEGMENT / FPS;

const PLANNER_SYSTEM_PROMPT = `You are a professional AI film director and scene planner. Your task is to analyze a user's scene description and output a structured JSON scene plan.

RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no explanation.
2. The JSON must match the exact schema provided.
3. Calculate the number of segments: each segment is ~5 seconds (81 frames at 16fps). Round UP.
4. Generate EXACTLY enough video_prompts entries for the number of segments.
5. image_prompt should be a detailed prompt for image generation (Flux model).
6. Each video_prompt should describe what happens in that specific segment, maintaining continuity.
7. continuity_notes should list key elements to maintain across segments (subject appearance, lighting, camera, etc.).

OUTPUT SCHEMA:
{
  "scene": {
    "duration": <number>,
    "segments": <number>,
    "style": "<cinematic style description>",
    "continuity": {
      "lighting": "<lighting continuity instructions>",
      "camera_motion": "<camera continuity instructions>",
      "subject": "<subject appearance continuity>",
      "environment": "<environment continuity>",
      "pacing": "<pacing instructions>"
    }
  },
  "image_prompt": "<detailed image generation prompt>",
  "video_prompts": ["<segment 1 prompt>", "<segment 2 prompt>", ...],
  "continuity_notes": ["<note 1>", "<note 2>", ...]
}`;

const DURATION_CLARIFICATION_PROMPT = `The user didn't specify a duration. Ask them how many seconds the scene should be.`;

const CLARIFICATION_SYSTEM_PROMPT = `You are a helpful AI assistant that helps users describe scenes for AI video generation. Ask concise clarifying questions when needed. Keep responses brief.`;

export async function askClarification(
  userInput: string,
  model: string,
): Promise<string> {
  const res = await fetch('/api/lmstudio/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: CLARIFICATION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `The user wants to create an AI-generated scene. Ask if there are any specific details they'd like to clarify about the scene before planning begins.

User's description: "${userInput}"

Ask 1-2 brief questions if anything is unclear (style, mood, duration, specific elements). If the description is already clear, just say "The description is clear enough. Let me know the total duration in seconds."`,
        },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to get clarification');
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function generateScenePlan(
  userDescription: string,
  durationSeconds: number,
  model: string,
  styleDescription?: string,
): Promise<ScenePlan> {
  const segments = Math.ceil(durationSeconds / SECONDS_PER_SEGMENT);
  const actualDuration = segments * SECONDS_PER_SEGMENT;

  const styleBlock = styleDescription
    ? `\n\nSTYLE REQUIREMENTS (must be followed for ALL prompts):\n${styleDescription}`
    : '';

  const userMessage = `Create a scene plan for this description:
"${userDescription}"
${styleBlock}
Duration: ${durationSeconds} seconds
This requires ${segments} segment(s) (each ~${SECONDS_PER_SEGMENT}s).
Total actual duration will be ~${actualDuration.toFixed(1)} seconds.

Generate EXACTLY ${segments} video prompts, one per segment.`;

  const res = await fetch('/api/lmstudio/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to generate scene plan');
  }

  const data = await res.json();
  const rawText = data.choices?.[0]?.message?.content || '';

  return parseScenePlan(rawText, segments);
}

function parseScenePlan(rawText: string, expectedSegments: number): ScenePlan {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not find valid JSON in LLM response');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Failed to parse scene plan JSON from LLM response');
  }

  if (!parsed.scene || !parsed.image_prompt || !Array.isArray(parsed.video_prompts)) {
    throw new Error('Scene plan missing required fields');
  }

  while (parsed.video_prompts.length < expectedSegments) {
    parsed.video_prompts.push(parsed.video_prompts[parsed.video_prompts.length - 1] || parsed.image_prompt);
  }

  parsed.video_prompts = parsed.video_prompts.slice(0, expectedSegments);

  return parsed as ScenePlan;
}
