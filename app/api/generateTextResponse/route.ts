import { streamText } from "ai";
import { createAnthropic } from '@ai-sdk/anthropic';

import { persona } from "@/promptMessages/improvText";

const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: Request) {
    const { messages } = await req.json();
    console.log("Current user message", messages.slice(-1)[0].content);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const { textStream } = await streamText({
                model: anthropic('claude-3-haiku-20240307'),
                system: persona,
                messages:messages.filter(m=>m.role !== 'feedback'),
                maxTokens: 50,
            });

            for await (const chunk of textStream) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain',
            'Transfer-Encoding': 'chunked',
        },
    });
}