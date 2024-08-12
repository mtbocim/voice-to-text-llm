'use server'

import { GoogleGenerativeAI } from '@google/generative-ai';
const GEMINI_KEY = process.env.GEMINI_KEY || ''
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

import OpenAI from "openai";
const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
});


import { ElevenLabsClient } from "elevenlabs";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const client = new ElevenLabsClient({
    apiKey: ELEVENLABS_API_KEY,
});

export default async function getTranscriptionResponse(transcription: string): Promise<ReadableStream<any>> {
    console.log('starting transcription response', transcription)

    // Gemini response
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest",
        systemInstruction: `
        You are have having a conversation with the user. 
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
    console.log(result.response.text())

    const text = result.response.text()

    // OpenAI response
    // const audioResponse = await openai.audio.speech.create({
    //     model: "tts-1",
    //     input: text,
    //     response_format: "opus",
    //     voice: ""

    // });
    // // This block will send the whole file as is, do not remove
    // const audioBuffer = await audioResponse.arrayBuffer()
    // const buffer = Buffer.from(audioBuffer);
    // const base64Audio = buffer.toString('base64')
    // console.log("Received voice response", new Date())

    // return base64Audio

    // ElevenLabs response
    console.log("Generating voice response", new Date())
    const audioResponse = await client.textToSpeech.convertAsStream("cgSgspJ2msm6clMCkdW9",{
        // voice: "Jessica",
        model_id: "eleven_turbo_v2_5",
        text,
        // voice_settings:{
        //     style:0.2
        // }
        language_code: "en"
    })
    // audioResponse.
    // const chunks: Buffer[] = [];
    // for await (const chunk of audioResponse) {
    //     chunks.push(chunk);
    //     console.log("chunk received", new Date())
    // }

    // const content = Buffer.concat(chunks);
    // console.log("Received voice response", new Date())
    // return content.toString('base64');
    return new ReadableStream({
        async start(controller) {
            for await (let chunk of generator) {
                const chunkData = encoder.encode(JSON.stringify(chunk));
                controller.enqueue(chunkData);
            }
            controller.close();
        }
    });
    

}