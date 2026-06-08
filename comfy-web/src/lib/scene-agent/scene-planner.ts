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

function getPlannerSystemPrompt(imageStyle?: string): string {
  const style = imageStyle || 'cinematic';

  const imagePromptStyles: Record<string, string> = {
    realistic: `Create a highly detailed image generation prompt that describes a scene like a candid snapshot taken on a modern smartphone camera in everyday conditions.
  * Include subject appearance, clothing, environment, lighting conditions, and spontaneous framing.
  * Lighting should feel uncontrolled and ambient.
  * Composition should feel natural and unposed.`,
    photography: `Create a highly detailed image generation prompt that reads like a professional photograph captured with controlled lighting in a real environment.
  * Include subject appearance, clothing, environment, lighting, lens characteristics, and texture detail.
  * Composition feels intentional but natural.
  * Emphasize realistic depth of field and fine material detail.`,
    cinematic: `Create a highly detailed cinematic image generation prompt optimized for Flux.
  * Include subject appearance, clothing, environment, lighting, mood, camera framing, lens feel, realism, textures, and atmosphere.
  * Prioritize strong visual identity and consistency.`,
    anime: `Create a highly detailed image generation prompt that reads like a frame from a modern high-quality anime production.
  * Include expressive character features, clothing, environment, lighting, and mood consistent with Japanese animation.
  * Emphasize stylized visuals and emotional readability.`,
    cgi: `Create a highly detailed image generation prompt that reads like a high-end 3D rendered scene from a modern production pipeline.
  * Include subject appearance, materials, environment, lighting, and spatial depth.
  * Emphasize physically based rendering and realistic material behavior.`,
  };

  const qualityRuleSets: Record<string, string> = {
    realistic: `10. Photographic quality rules:
  * Use natural, observational language rather than film-style descriptions.
  * Describe the scene as if captured spontaneously without artificial staging.
  * Avoid cinematic framing, dramatic lighting, or artistic intent.`,
    photography: `10. Photography quality rules:
  * Use descriptive language of a professional photograph.
  * Emphasize natural but controlled lighting.
  * Composition should feel intentional but not artificially perfect.`,
    cinematic: `10. Cinematic quality rules:
  * Use descriptive film-style language.
  * Emphasize realistic movement, natural fabric motion, believable facial expressions, and smooth camera motion.
  * Prefer grounded realism over exaggerated animation.`,
    anime: `10. Anime quality rules:
  * Use descriptive language consistent with contemporary Japanese animation.
  * Emphasize expressive characters with stylized facial features.
  * Lighting and shading should follow anime production techniques.`,
    cgi: `10. CGI quality rules:
  * Use descriptive language of a 3D rendered scene.
  * Emphasize physically based rendering of materials and realistic light behavior.
  * Emphasize spatial depth and physical presence.`,
  };

  const finalOutputDescriptions: Record<string, string> = {
    realistic: 'a casually captured everyday scene with natural imperfections and unpolished framing',
    photography: 'a professional photographic series with consistent lighting and composition',
    cinematic: 'a professionally planned cinematic sequence with smooth visual continuity and realistic temporal progression',
    anime: 'a consistent anime sequence with maintained art style and visual continuity',
    cgi: 'a consistent 3D rendered sequence with physically coherent visuals and spatial continuity',
  };

  const imagePromptSection = imagePromptStyles[style] || imagePromptStyles.cinematic;
  const qualitySection = qualityRuleSets[style] || qualityRuleSets.cinematic;
  const finalDesc = finalOutputDescriptions[style] || finalOutputDescriptions.cinematic;

  return `You are a professional AI scene planner. Your task is to analyze a user's scene description and output a structured JSON scene plan.

RULES:
1. Output ONLY valid JSON. No markdown, no code fences, no explanation.
2. The JSON must match the exact schema provided exactly.
3. Calculate the number of segments automatically:
  * Each segment is approximately 5 seconds.
  * Assume 81 frames at 16fps per segment.
  * Always round UP to the nearest whole segment.
4. Generate EXACTLY the required number of video_prompts entries.
5. image_prompt:
  * ${imagePromptSection}
6. video_prompts:
  * Each prompt represents ONE continuous segment of the scene.
  * Maintain subject consistency, environment consistency, lighting continuity, and motion continuity across all segments.
  * Describe motion clearly and physically.
  * Focus on smooth temporal progression rather than abrupt actions.
7. continuity_notes:
  * List critical elements that must remain consistent across segments:
  * subject appearance
  * hairstyle
  * outfit
  * environment
  * lighting
  * camera movement
  * mood
  * pacing
  * weather
  * color tone
8. Motion continuity rules:
  * Actions must evolve naturally between segments.
  * Avoid sudden jumps in pose, emotion, lighting, environment, or camera angle.
  * If an action intensifies, begin subtly before escalating.
  * Preserve momentum and body positioning between segments.
  * Maintain believable physics and hand-object interaction.
9. Environment continuity rules:
  * Do not abruptly change location, time of day, weather, or visual style unless explicitly requested.
  * Maintain coherent visual progression.
${qualitySection}
11. Action prompting rules:
  * Be directive and physically specific.
  * Describe sequential movement clearly.
  * Break complex actions into understandable physical steps.
  * Include body mechanics, pacing, and emotional tone when relevant.
12. Hand interaction rules:
  * Explicitly describe hand placement, grip, and interaction with objects when actions involve clothing, tools, props, or environment interaction.
  * Prioritize realistic finger and fabric interaction.
13. Avoid:
  * abrupt scene transitions
  * impossible movement
  * excessive motion changes
  * inconsistent subject appearance
  * vague actions
  * contradictory camera instructions
14. The final output should feel like ${finalDesc}.

OUTPUT SCHEMA:
{
  "scene": {
    "duration": <number>,
    "segments": <number>,
    "style": "<visual style description>",
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
}

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
  imageStyle?: string,
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
        { role: 'system', content: getPlannerSystemPrompt(imageStyle) },
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
