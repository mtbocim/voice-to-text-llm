'use server'

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

import { GoogleGenerativeAI } from '@google/generative-ai';
const gemini = new GoogleGenerativeAI(process.env.GEMINI_KEY||'');



function quickCheck(text: string) {
    // Trim the text to remove leading/trailing whitespace
    text = text.trim();

    // If the text is empty, it's not mid-sentence
    if (text === '') {
        return false;
    }

    // Regex patterns
    const sentenceEndPattern = /[.!?]$/;
    const ellipsisPattern = /\.{3,}$/;
    const incompletePhrasesPattern = /^(so|and|but|or|because|while|if|unless|although|however|therefore|thus|hence|consequently|nevertheless|moreover|furthermore|additionally|in addition|as a result|accordingly|subsequently|meanwhile|otherwise|alternatively|conversely|similarly|likewise|in contrast|on the other hand)$/i;
    const fillerWordsPattern = /^(um|uh|er|ah|like|you know)$/i;

    // Check if the text ends with an ellipsis (speech-to-text interpreted as a pause, likely mid-sentence)
    // Needs to be before sentence-ending punctuation check
    if (ellipsisPattern.test(text)) {
        return true;
    }

    // Check if the text ends with sentence-ending punctuation
    if (sentenceEndPattern.test(text)) {
        return false;
    }


    // Split the text into words
    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1].toLowerCase();

    // Check if the last word is an incomplete phrase starter or a filler word
    if (incompletePhrasesPattern.test(lastWord) || fillerWordsPattern.test(lastWord)) {
        return true;
    }

    // Reached this point, not sure if mid-sentence
    return undefined;
}

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
    const start = new Date();
    const quickResult = quickCheck(transcription.text);
    console.log("Get mid sentence determination start time", start, "\nprevious text", previousTranscript, "\nnew text", transcription.text)
    if (quickResult === undefined) {
        try {
            const model = gemini.getGenerativeModel({
                model: "gemini-1.5-flash-latest",
                systemInstruction: `
             Determine if the following transcribed speech is not truncated at an appropriate place for another person to interject.
             Consider context, grammar, and natural speech patterns.
             Respond with only "True" if it's mid-sentence, or "False" if it's not.
  
             Response in JSON:
             {
                 "isMidSentence": boolean
             }
            `,
            })

            const chat = model.startChat({
                history: [],
                generationConfig: {
                    maxOutputTokens: 200,
                    responseMimeType: 'application/json',
                }
            })

            const msg = `The current transcript is: ${previousTranscript + transcription.text}`
            const result = await chat.sendMessage(msg);
            const data = JSON.parse(result.response.text())

            console.log("Get mid sentence determination end", new Date() - start)

            return { newText: transcription.text, isMidSentence: data.isMidSentence }
        } catch (error) {
            console.error('Error processing audio data:', error);
        }
    } else {
        return { newText: transcription.text, isMidSentence: quickResult }
    }
}