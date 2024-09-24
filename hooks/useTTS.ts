import React, { useCallback } from 'react';

export default function useCreateVoiceResponse() {

    async function getTextToVoice(
        priorText: string, 
        currentSentence: string, 
        voice: string, 
        audioContext:React.MutableRefObject<null|AudioContext>
    ): Promise<AudioBuffer | undefined> {
        if (!currentSentence || currentSentence === '') {
            console.log('No text to process');
            return undefined;
        }

        const response = await fetch('/api/generateVoiceResponse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ previousText: priorText, currentSentence, voice: voice })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        if (!response.body) {
            throw new Error('Response body is undefined');

        }
        try {
            const audioChunks = [];
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                audioChunks.push(value);
            }
            const arrayBuffer = await new Blob(audioChunks).arrayBuffer();
            const audioData = await audioContext.current?.decodeAudioData(arrayBuffer);
            return audioData
        } catch (error) {
            console.error('Error processing audio data:', error);
        }
    }

    const processTextStream = useCallback(async function processTextStream(
        response: Response,
        audioContext: React.MutableRefObject<AudioContext | null>,
        audioData: { current: { audioBuffer: AudioBuffer, text: string }[] | null },
        selectedTTSVoice: string,
        isRecordingStatus: React.MutableRefObject<boolean>) {
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let processedText = '';
        let completeText = '';

        while (true && reader) {
            if (!audioContext.current) {
                break
            }
            const { done, value } = await reader.read();

            const textChunk = decoder.decode(value, { stream: true });
            completeText += textChunk;
            const sentences = completeText.match(/(.+?[.:!?\r\n])\s?/gm) || [];
            const message = sentences.join('').replace(processedText, '');
            if (message.length > 0) {
                const audioBuffer = await getTextToVoice(processedText, message, selectedTTSVoice, audioContext);
                // console.log('Adding to audioToPlay:', new Date() - start);

                if (audioBuffer) {
                    audioData.current?.push({
                        audioBuffer,
                        text: message
                    });
                    processedText += message;
                }
            }
            console.log('done:', done, 'isRecordingStatus:', isRecordingStatus.current);
            if (done) {
                // TODO: Need to decide if I want truncated text or not, maybe easier to not?
                // Make sure we got the last bit of text in case it doesn't end with a punctuation mark
                // const message = completeText.replace(processedText, '');
                // const audioBuffer = await getTextToVoice(processedText, message, selectedTTSVoice);
                // console.log('Adding to audioToPlay:', new Date() - start);

                // if (audioBuffer) {
                //     audioToPlay.current.push(audioBuffer);
                //     processedText += message;
                // }
                break;
            }

            // For this to work well I need to track which audio is playing and then only use text up to that point
            // if(isRecordingStatus.current) {
            //     // Need to stop playback here
            //     audioContext.current?.close();
            //     audioData.current = [];
            //     const text = spokenText.current;
            //     spokenText.current = '';    
            //     return text;
            // }

            console.log("What is textChunk:", textChunk, '\nWhat is processedText: ', processedText);
        }
        return processedText;
    }, []);

    return { getTextToVoice, processTextStream }
}