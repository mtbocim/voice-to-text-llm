'use server'

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

export default async function getVoiceTranscription(formData: FormData) {
    const audioFile = formData.get('file') as File
    const previousTranscript = formData.get('previousTranscript') as string

    /** This is all I need for OpenAI */
    // Current price is $0.006 per minute of audio rounded to nearest second
    const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "en",
        prompt: previousTranscript,
    });
    return transcription.text

}