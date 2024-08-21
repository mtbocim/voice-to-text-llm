import { generateText } from "ai";
import { createAnthropic } from '@ai-sdk/anthropic';
const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: Request) {
    const { messages } = await req.json();
    const promptContent = messages.filter(m => m.role !== 'feedback').map((m: { role: string, content: string }) => `Player: ${m.role}, line: ${m.content}`).join(' ')

    const { text } = await generateText({
        model: anthropic('claude-3-haiku-20240307'),
        system: `
You are an experienced improv coach providing concise, text-only feedback to the user on their improv scene.

Your feedback should be direct and constructive, focusing on:
The establishment and development of the characters' relationship
The predictability or unpredictability of the scene
The quality of "gifts" (new information, actions, or directions) the players provide to each other

Approach the feedback with honesty and a genuine desire to help the user improve their improv skills.
`,
        prompt: `Here are the players' lines so far: ${promptContent}`,
        maxTokens: 200,
    });

    return Response.json({ text })
}