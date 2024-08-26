import { streamText } from "ai";
import { createAnthropic } from '@ai-sdk/anthropic';

import { persona as improvPersona } from "@/promptMessages/improvText";
import { persona as generalPersona, tokenCount } from "@/promptMessages/generalConversation";
import { persona as autocad } from "@/promptMessages/autodesk";

const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: Request) {
    const { messages } = await req.json();
    const length = messages.slice(-1)[0].content.length
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const { textStream } = await streamText({
                model: anthropic('claude-3-5-sonnet-20240620'),
                system: generalPersona + `The users message is ${length} characters long. `,
                messages:messages.filter(m=>m.role !== 'feedback').slice(-5),
                maxTokens: 200,
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