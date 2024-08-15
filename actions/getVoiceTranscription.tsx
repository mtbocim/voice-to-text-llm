'use server'

// Imports the Google Cloud client library
import { SpeechClient } from "@google-cloud/speech";
import OpenAI from "openai";
const apiKey = process.env.OPENAI_KEY;
const openai = new OpenAI({ apiKey });


export default async function getVoiceTranscription(formData: FormData) {
    // console.log('starting transcription')
    // const start = new Date()
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
    // const start2 = new Date();
    
    
    /** Google transcription here */
    // const arrayBuffer = await audioFile.arrayBuffer()
    // const dataString = Buffer.from(arrayBuffer).toString('base64')
    // const client = new SpeechClient()

    // const [response] = await client.recognize({
    //     audio: { content: dataString },
    //     config: {
    //         encoding: "WEBM_OPUS",
    //         languageCode: "en-US",
    //         // sampleRateHertz: 16000
    //     }
    // });
    // const end = new Date();
    // console.log("Sentence:", transcription.text, "\nOpenAI time taken", start2 - start, "ms\n", "Google time taken", end - start2, "ms\n")

    // console.log(transcription)
    return transcription.text

}


/*
Sentence tests and time taken:


*/