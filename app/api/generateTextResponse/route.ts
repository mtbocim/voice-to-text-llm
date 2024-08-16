// api/transcription/route.js or api/transcription/[transcription].js (if using dynamic routes)
import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google"

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_KEY,
})

export async function POST(req: Request) {
    const { messages } = await req.json();

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const { textStream } = await streamText({
                model: google('models/gemini-1.5-flash-latest'),
                system: `
                    You are having a conversation with the user. The user has provided a transcription of a voice message,
                    which may have grammatical errors or typos due to the nature of speech-to-text transcription.
                    Respond in plain text that will be used with a tts model to generate a voice response.
                    To articulate pauses, use elipses (...)
                    To emphasize excitement, use multiple exclamation marks (!!!)
                    To emphasize curiosity, use multiple question marks (???)
                `,
                // prompt: messages,
                messages,
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