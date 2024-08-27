import { NextResponse } from 'next/server';

import { ElevenLabsClient } from "elevenlabs";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const client = new ElevenLabsClient({
    apiKey: ELEVENLABS_API_KEY,
});

import OpenAI from 'openai';
const OPENAI_KEY = process.env.OPENAI_KEY;
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// Setup OpenAI as cheap alternative
const TTS_SOURCE = true ? 'elevenlabs' : 'openai'; // 'openai' or 'elevenlabs'

export async function POST(req: Request): Promise<NextResponse<ReadableStream>> {

    const { previousText, voice, currentSentence } = await req.json();
    // console.log('previousText', previousText, '\n\nvoice', voice, '\n\ncurrentSentence', currentSentence);
    // ElevenLabs response

    if (TTS_SOURCE !== 'openai') {
        
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
                'Content-Type': 'audio/mpeg', 
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
            }
        });
    } else {
        console.log('Using OpenAI, cost:', 15/1_000_000 * currentSentence.length, 'USD'); // 15 USD per 1M characters
        const audioResponse = await openai.audio.speech.create({
            model: "tts-1",
            voice,
            input: currentSentence,
        });
        return new NextResponse(audioResponse.body, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
            }
        });
    }
}