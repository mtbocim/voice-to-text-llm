import React, { useCallback, useEffect, useRef } from 'react';

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

export default function useTTS(audioContext: React.MutableRefObject<AudioContext | null>) {
    const [availableVoices, setAvailableVoices] = React.useState<string[]>([]);
    const [voice, setVoice] = React.useState<string>('');
    
    const audioData = useRef<{ audioBuffer: AudioBuffer; text: string }[]>([]);
    const isAudioPlaying = useRef(false);
    // Get available voices from the ElevenLabs API, one call only
    useEffect(() => {
        async function fetchAvailableVoices() {
            const response = await fetch("https://api.elevenlabs.io/v1/voices");
            const data = await response.json();
            const voices = data.voices.map((i: { voice_id: string; name: string }) => i.name).sort()
            setAvailableVoices(voices)
            setVoice(voices[0]);
        }
        if (false) {
            setAvailableVoices(OPENAI_VOICES);
            setVoice(OPENAI_VOICES[0]);
        } else {
            fetchAvailableVoices();
        }
    }, []);

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

    /**
     * Plays the audio data
     *
     * Conditions for playing audio:
     * - Audio data is available
     * - Audio isn't already playing
     * - There is an audio context
     */
    useEffect(() => {
        // TODO: the playbackActiveRef changing might create small gaps where recording could be active

        const playNextAudio = () => {
            if (audioData.current.length > 0 && audioContext.current) {
                console.log(
                    "Audio data:",
                    audioData.current.length,
                    "Playback active:",
                    isAudioPlaying.current
                );
                if (!isAudioPlaying.current) {
                    isAudioPlaying.current = true;
                    const source = audioContext.current.createBufferSource();
                    const currentAudioData = audioData.current.shift();
                    if (currentAudioData) {
                        source.buffer = currentAudioData.audioBuffer;
                        source.connect(audioContext.current.destination);
                        source.onended = () => {
                            isAudioPlaying.current = false;
                            console.log("Playback ended");
                            playNextAudio(); // Play the next audio data
                        };
                        source.start();
                    }
                }
            } else {
                console.log(
                    "Audio data:",
                    audioData.current.length,
                );
            }
        };

        if (audioData.current.length > 0 && isAudioPlaying.current === false) {
            playNextAudio();
        }
    }, [audioData.current.length, audioContext]);

    return { voice, setVoice, availableVoices, processTextStream, audioData }
}