'use server'

// Imports the Google Cloud client library
import { SpeechClient } from "@google-cloud/speech";
import OpenAI, { toFile } from "openai";
import fs from 'fs/promises'
import { createReadStream } from "fs";
import { array } from "zod";
import { Uploadable } from "openai/uploads.mjs";
const apiKey = process.env.OPENAI_KEY;
const openai = new OpenAI({ apiKey });

// const {SpeechClient} = require('@google-cloud/speech')

// require('dotenv').config({path:'../.env'})
// const GOOGLE_CLOUD_KEY = process.env.GOOGLE_CLOUD_KEY;
// const EMAIL = process.env.EMAIL;
// const PROJECT_ID = process.env.PROJECT_ID;

// const options = {
//     credentials: {
//         client_email: EMAIL,
//         private_key: GOOGLE_CLOUD_KEY,
//     },
//     projectId: PROJECT_ID,
// }
// const client = new SpeechClient(options);


export default async function getVoiceTranscription(formData: FormData) {
    // console.log(formData)
    const audioFile = formData.get('file') as File
    console.log(audioFile)

    // const buffer
    // const audioBuffer = Buffer.from(audioFile, 'base64')
    // console.log(audioBuffer)
    
    // const buffer = await audioFile.arrayBuffer()
    // const audioBuffer = Buffer.from(buffer)

    // await fs.writeFile('tmp.mp3', audioBuffer)
    // const file = createReadStream('tmp.mp3')
    // console.log(file)
    // const file = await toFile(audioBuffer, 'tmp.mp3', {type:'audio/mpeg'})
    // console.log(file)
    const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
    });
    console.log(transcription)
    return transcription.text
    // const audioData = formData.get('audio') as Blob

    // if (!audioData) {
    //     throw new Error("No audio file found in formData");
    // }

    // const arrayBuffer = await audioData.arrayBuffer()
    // const dataString = Buffer.from(arrayBuffer).toString('base64')
    // console.log(audioData, dataString.length, '\n', dataString)
    // // return
    // const client = new SpeechClient()


    // // Detects speech in the audio file
    // const [response] = await client.recognize({
    //     audio: { content: dataString },
    //     config: {
    //         encoding: "WEBM_OPUS",
    //         languageCode: "en-US",
    //         sampleRateHertz: 16000
    //     }
    // });
    // console.log(response)
    // const transcription = response.results
    //     .map(result => result.alternatives[0].transcript)
    //     .join('\n');
    // console.log(`Transcription: ${transcription}`);
}
