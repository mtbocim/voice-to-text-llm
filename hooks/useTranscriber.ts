'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AssemblyAI, RealtimeTranscript, RealtimeTranscriber } from 'assemblyai';
import * as Tone from 'tone';

import getTranscriberToken from '@/actions/getTranscriberToken';


interface UseTranscriberReturnType {
    startTranscription: () => Promise<void>;
    stopTranscription: () => Promise<void>;
    transcriptText: string;
    isTranscribing: boolean;
}

export default function useTranscriber(waveformAnalyser: React.MutableRefObject<Tone.Analyser | null | undefined>): UseTranscriberReturnType {
    const [transcriptText, setTranscriptText] = useState<string>('');
    const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
    const transcriber = useRef<RealtimeTranscriber | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const isConnected = useRef<boolean>(false);

    const startTranscription = useCallback(async () => {

        const token = await getTranscriberToken(); // Your token fetching logic
        transcriber.current = new RealtimeTranscriber({
            token,
            sampleRate: Tone.getContext().sampleRate,
            // ... other configuration options
        });
        console.log(Tone.getContext())

        transcriber.current.on('transcript', (transcript: RealtimeTranscript) => {
            if (transcript.text){
                console.log('Transcript received:', transcript.text);
                // setTranscriptText(prevText => prevText + ' ' + transcript.text);
            }
            
            if (transcript.text) {
                console.log('Transcript received:', transcript.text);
                setTranscriptText(prevText => prevText + ' ' + transcript.text);
            }
        });

        transcriber.current.on('open', ({ sessionId }) => {
            console.log(`Session opened with ID: ${sessionId}`)
            isConnected.current = true;
            // Start sending audio data only after the connection is open
            const sendAudioData = () => {
                if (waveformAnalyser.current && transcriber.current && isConnected.current) {
                    const audioData = waveformAnalyser.current.getValue() as Float32Array;
                    const int16Array = new Int16Array(audioData.length);
                    for (let i = 0; i < audioData.length; i++) {
                        int16Array[i] = Math.round(audioData[i] * 32767);
                    }
                    const arrayBuffer = int16Array.buffer;
                    transcriber.current.sendAudio(arrayBuffer);
                }
            };

            intervalRef.current = setInterval(sendAudioData, 100);
        })

        transcriber.current.on('error', (error: Error) => {
            console.error('Error:', error)
        })

        transcriber.current.on('close', (code: number, reason: string) =>
            console.log('Session closed:', code, reason)
        )

        await transcriber.current.connect();
        setIsTranscribing(true);

    }, [waveformAnalyser]);

    const stopTranscription = useCallback(async () => {
        if (transcriber.current) {
            await transcriber.current.close();
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        setIsTranscribing(false);
    }, []);

    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    return {
        startTranscription,
        stopTranscription,
        transcriptText,
        isTranscribing,
    };
}