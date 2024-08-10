'use server'

import { GoogleGenerativeAI } from '@google/generative-ai';
const GEMINI_KEY = process.env.GEMINI_KEY || ''
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

import OpenAI from "openai";
const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
});

export default async function getTranscriptionResponse(transcription: string):Promise<string> {
    console.log('starting transcription response', transcription)

    // Gemini response
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest",
        systemInstruction: `You are have having a conversation with the user. Respond in plain text that will be used with a tts model to generate a voice response.`,
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
    const audioResponse = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: text,
        response_format: "opus",
        
    });
    
    // This block will send the whole file as is, do not remove
    const audioBuffer = await audioResponse.arrayBuffer()
    const buffer = Buffer.from(audioBuffer);
    const base64Audio = buffer.toString('base64')
    console.log("Received voice response", new Date())
    
    return base64Audio

}