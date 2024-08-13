// api/transcription/route.js or api/transcription/[transcription].js (if using dynamic routes)

import { NextResponse } from 'next/server';

import { Readable } from 'stream';

import { GoogleGenerativeAI } from '@google/generative-ai';
const GEMINI_KEY = process.env.GEMINI_KEY || ''
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

import { ElevenLabsClient } from "elevenlabs";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const client = new ElevenLabsClient({
    apiKey: ELEVENLABS_API_KEY,
});

export async function POST(req: Request) {
    // Extract the transcription from the request body
    const { transcription, voice } = await req.json();

    const startText = new Date()

    // Gemini response
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest",
        systemInstruction: `
        You are having a conversation with the user.  The user has provided a transcription of a voice message, which may have grammatical errors or typos due to the nature of speech-to-text transcription.
        Respond in plain text that will be used with a tts model to generate a voice response. 
        To articulate pauses, use elipses (...)
        To emphasize excitement, use multiple exclamation marks (!!!)
        To emphasize curiosity, use multiple question marks (???)
        `,
    })

    const chat = model.startChat({
        history: [],
        generationConfig: {
            maxOutputTokens: 200,
            responseMimeType: 'text/plain',
        }
    })

    const result = await chat.sendMessage(transcription);
    const endText = new Date()

    const text = result.response.text()

    console.log("What is the text?", text, "Time taken", endText - startText, "ms")

    // ElevenLabs response
    const audioResponse = await client.generate({
        model_id: "eleven_turbo_v2_5",
        text,
        language_code: "en",
        voice
    })

    //How to return audio stream???

    return new NextResponse(audioResponse, {
        headers: {
            'Content-Type': 'audio/mpeg', // Adjust content type based on the audio format
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
        }
    });
}
