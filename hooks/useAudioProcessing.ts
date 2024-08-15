import { useState, useRef, useCallback } from 'react';

export default function useAudioProcessing(silenceThreshold:number, shortSilenceDuration: number, longSilenceDuration:number) {
    const [isListening, setIsListening] = useState<boolean>(false);
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(-Infinity);
    const [isSilent, setIsSilent] = useState<boolean>(true);

    const audioContext = useRef<AudioContext | null>(null);
    const analyser = useRef<AnalyserNode | null>(null);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const dataArray = useRef<Float32Array | null>(null);
    const silenceStartTime = useRef<number | null>(null);
    const animationFrame = useRef<number | null>(null);
    const stream = useRef<MediaStream | null>(null);
    const longSilenceTimer = useRef<NodeJS.Timeout | null>(null);

    const checkAudio = useCallback(() => {
        if (!analyser.current || !dataArray.current) return;

        analyser.current.getFloatTimeDomainData(dataArray.current);
        const rms = Math.sqrt(dataArray.current.reduce((sum, val) => sum + val * val, 0) / dataArray.current.length);
        const dbFS = 20 * Math.log10(rms);
        setVolume(dbFS);

        if (dbFS < silenceThreshold) {
            if (!silenceStartTime.current) {
                silenceStartTime.current = Date.now();
                longSilenceTimer.current = setTimeout(() => setIsRecording(false), longSilenceDuration);
            } else {
                const silenceDuration = Date.now() - silenceStartTime.current;
                if (silenceDuration > shortSilenceDuration) {
                    setIsRecording(false);
                }
            }
            setIsSilent(true);
        } else {
            if (silenceStartTime.current) {
                silenceStartTime.current = null;
                if (longSilenceTimer.current) {
                    clearTimeout(longSilenceTimer.current);
                }
            }
            setIsSilent(false);
            setIsRecording(true);
        }
        animationFrame.current = requestAnimationFrame(checkAudio);
    }, [silenceThreshold, shortSilenceDuration, longSilenceDuration]);

    const startListening = async (selectedInput: string) => {
        try {
            stream.current = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: selectedInput ? { exact: selectedInput } : undefined }
            });
            audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
            analyser.current = audioContext.current.createAnalyser();
            const source = audioContext.current.createMediaStreamSource(stream.current);
            source.connect(analyser.current);
            analyser.current.fftSize = 2048;
            dataArray.current = new Float32Array(analyser.current.fftSize);
            setIsListening(true);
            checkAudio();
        } catch (error) {
            console.error('Error accessing microphone:', error);
        }
    };

    const stopListening = () => {
        if (audioContext.current) {
            audioContext.current.close();
            audioContext.current = null;
        }
        if (animationFrame.current) {
            cancelAnimationFrame(animationFrame.current);
        }
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
        }
        if (stream.current) {
            stream.current.getTracks().forEach(track => track.stop());
            stream.current = null;
        }
        if (longSilenceTimer.current) {
            clearTimeout(longSilenceTimer.current);
        }
        setIsListening(false);
        setIsRecording(false);
    };

    return { isListening, isRecording, volume, isSilent, startListening, stopListening };
}