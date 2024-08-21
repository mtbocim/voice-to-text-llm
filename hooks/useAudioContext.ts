import { useState, useRef, useCallback } from "react";

interface AudioContextRef {
    current: AudioContext | null;
}

interface AnalyserNodeRef {
    current: AnalyserNode | null;
}

interface MediaRecorderRef {
    current: MediaRecorder | null;
}

interface Float32ArrayRef {
    current: Float32Array | null;
}

interface NumberRef {
    current: number | null;
}

export default function useAudioContext() {
    const [isListening, setIsListening] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(-Infinity);
    const [isSilent, setIsSilent] = useState<boolean>(true);
    const [shortSilenceDuration, setShortSilenceDuration] = useState<number>(500);
    const [longSilenceDuration, setLongSilenceDuration] = useState<number>(1000);
    const [silenceThreshold, setSilenceThreshold] = useState<number>(-38);
    const [sendTranscript, setSendTranscript] = useState<boolean>(false);
    const [isRecordingStatus, setIsRecording] = useState<boolean>(false);



    const audioContext: AudioContextRef = useRef(null);
    const stream = useRef<MediaStream | null>(null);
    const analyser: AnalyserNodeRef = useRef(null);
    const dataArray: Float32ArrayRef = useRef(null);
    const silenceStartTime: NumberRef = useRef(null);
    const longSilenceTimer = useRef<NodeJS.Timeout | null>(null);
    const animationFrame: NumberRef = useRef(null);
    const isRecordingRef = useRef(false);


    async function startListening(selectedInput: string): Promise<boolean> {
        try {
            console.log('Starting to listen...');
            stream.current = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: selectedInput ? { exact: selectedInput } : undefined }
            });
            audioContext.current = new AudioContext();
            analyser.current = audioContext.current.createAnalyser();
            const source: MediaStreamAudioSourceNode = audioContext.current.createMediaStreamSource(stream.current);
            source.connect(analyser.current);

            analyser.current.fftSize = 2048;
            dataArray.current = new Float32Array(analyser.current.fftSize);

            setIsListening(true);
            checkAudio();
            console.log('Listening started');
            return true
        } catch (error) {
            console.error('Error accessing microphone:', error);
            return false
        }
    }

    function stopListening(): void {
        console.log('Stopping listening...');
        if (audioContext.current) {
            audioContext.current.close();
            audioContext.current = null;
        }

        if (stream.current) {
            stream.current.getTracks().forEach(track => track.stop());
            stream.current = null;
        }

        setIsListening(false);
        console.log('Listening stopped');
    }

    const checkAudio = useCallback(function checkAudio() {
        if (!analyser.current || !dataArray.current) return;

        analyser.current.getFloatTimeDomainData(dataArray.current);
        const rms: number = Math.sqrt(dataArray.current.reduce((sum, val) => sum + val * val, 0) / dataArray.current.length);
        const dbFS: number = 20 * Math.log10(rms);
        setVolume(dbFS);

        if (dbFS < silenceThreshold) {
            // Set silence start time if not already set
            if (!silenceStartTime.current) {
                silenceStartTime.current = Date.now();
                longSilenceTimer.current = setTimeout(() => setSendTranscript(true), longSilenceDuration);
            } else {
                const silenceDuration = Date.now() - silenceStartTime.current;

                if (silenceDuration > shortSilenceDuration && isRecordingRef.current) {
                    // stopRecording();
                    // setIsRecording(false);
                    return { recording: false }
                }
            }
            setIsSilent(true);
        } else {
            // Still talking, don't want to process transcript yet
            if (silenceStartTime.current) {
                silenceStartTime.current = null;
                if (longSilenceTimer.current) {
                    clearTimeout(longSilenceTimer.current);
                }
            }
            setIsSilent(false);
            // Start recording if not already recording
            if (!isRecordingRef.current) {
                // startRecording();
                // setIsRecording(true);
                return { recording: true }
            }
        }

        animationFrame.current = requestAnimationFrame(checkAudio);
    }, [silenceThreshold, shortSilenceDuration, longSilenceDuration]);

    return {
        startListening,
        stopListening,
        setShortSilenceDuration,
        setLongSilenceDuration,
        setSilenceThreshold,
        isListening,
        volume,
        isSilent,
        sendTranscript,
        isRecordingStatus
    };
}