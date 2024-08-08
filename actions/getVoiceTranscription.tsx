'use server'

// Imports the Google Cloud client library
import { SpeechClient } from "@google-cloud/speech";
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

export default async function getVoiceTranscription(formData:FormData) {
    console.log(formData)
    const audioData = formData.get('audio') as string
    // console.log(audioData)
    if (!audioData) {
        throw new Error("No audio file found in formData");
    }
    
    const client = new SpeechClient()
    

    // // The audio file's encoding, sample rate in hertz, and BCP-47 language code
    const audio = {
        content: audioData,
    };
    const config = {
        languageCode: 'en-US',
    };
    const request = {
        audio: audio,
        config: config,
    };

    // Detects speech in the audio file
    const [response] = await client.recognize(request);
    const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
    console.log(`Transcription: ${transcription}`);
}
