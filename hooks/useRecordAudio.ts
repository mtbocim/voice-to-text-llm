import { useCallback, useRef, useEffect } from "react";
import * as Tone from 'tone';

interface UseRecordAudioReturnType {
    startRecording: () => void;
    stopRecording: () => void;
    speechToTextDataQueue: React.MutableRefObject<Blob[]>;
}

export default function useRecordAudio(inputDevice: React.MutableRefObject<Tone.UserMedia | null | undefined>): UseRecordAudioReturnType {
    const recorder = useRef<Tone.Recorder | null>(null);
    const speechToTextDataQueue = useRef<Blob[]>([]);

    useEffect(() => {
        recorder.current = new Tone.Recorder();
        return () => {
            if (recorder.current) {
                recorder.current.dispose();
            }
        };
    }, []);

    const startRecording = useCallback(() => {
        if (inputDevice.current && recorder.current && recorder.current.state !== 'started') {
            inputDevice.current.connect(recorder.current);
            recorder.current.start();
        }
    }, [inputDevice]);

    const stopRecording = useCallback(async () => {
        if (recorder.current?.state === 'started') {
            const recording = await recorder.current.stop();
            const blob = new Blob([recording], { type: 'audio/webm' });
            speechToTextDataQueue.current.push(blob);

            if (inputDevice.current) {
                inputDevice.current.disconnect(recorder.current);
            }
        }
    }, [inputDevice]);

    return { startRecording, stopRecording, speechToTextDataQueue };
}