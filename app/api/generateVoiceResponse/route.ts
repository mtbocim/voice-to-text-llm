import { NextResponse } from 'next/server';

import { ElevenLabsClient } from "elevenlabs";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const client = new ElevenLabsClient({
    apiKey: ELEVENLABS_API_KEY,
});

export async function POST(req: Request): Promise<NextResponse<ReadableStream>> {

    const { previousText, voice, currentSentence } = await req.json();
    console.log('previousText', previousText, '\n\nvoice', voice, '\n\ncurrentSentence', currentSentence);
    // ElevenLabs response
    const audioResponse = await client.generate({
        model_id: "eleven_turbo_v2_5",
        text: currentSentence,
        previous_text: previousText === '' ? undefined : previousText,
        language_code: "en",
        voice,
        stream: true, 
    })

    const stream = new ReadableStream({
        async start(controller) {
            for await (const chunk of audioResponse) {
                controller.enqueue(chunk);
            }
            controller.close();
        }
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'audio/mpeg', // Adjust content type based on the audio format
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
        }
    });
}