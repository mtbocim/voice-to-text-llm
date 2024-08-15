import { NextResponse } from 'next/server';

import { ElevenLabsClient } from "elevenlabs";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const client = new ElevenLabsClient({
    apiKey: ELEVENLABS_API_KEY,
});

export async function POST(req: Request) {
    // Extract the transcription from the request body
    const { previousText, voice, currentSentence } = await req.json();

    // ElevenLabs response
    const audioResponse = await client.generate({
        model_id: "eleven_turbo_v2_5",
        text: currentSentence,
        previous_text: previousText,
        language_code: "en",
        voice
    })


    return new NextResponse(audioResponse, {
        headers: {
            'Content-Type': 'audio/mpeg', // Adjust content type based on the audio format
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
        }
    });
}