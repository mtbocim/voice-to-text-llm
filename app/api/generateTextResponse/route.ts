// api/transcription/route.js or api/transcription/[transcription].js (if using dynamic routes)

import { CoreMessage, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google"

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_KEY,
})

export async function POST(req: Request) {
    // Extract the transcription from the request body
    const { messages }: { messages: CoreMessage[] } = await req.json();    
    // console.log('transcription', messages)
    const result = await streamText({
        model: google('models/gemini-1.5-flash-latest'),
        // temperature: .5,
        system: `
                You are having a conversation with the user.  The user has provided a transcription of a voice message, 
                which may have grammatical errors or typos due to the nature of speech-to-text transcription.
                Respond in plain text that will be used with a tts model to generate a voice response.
                To articulate pauses, use elipses (...)
                To emphasize excitement, use multiple exclamation marks (!!!)
                To emphasize curiosity, use multiple question marks (???)
     `,
        messages,
        maxTokens: 200,
    });

    return result.toDataStreamResponse();
}


