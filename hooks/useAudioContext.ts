import React, { useState, useRef, useCallback, useEffect } from "react";
import * as Tone from 'tone'; // Import Tone.js

interface UseAudioContextReturnType {
    startListening: (selectedAudioInput: string) => Promise<void>;
    stopListening: () => void;
    volume: number;
    isRecordingStatus: React.MutableRefObject<boolean>;
    isListeningStatus: boolean;
    audioContext: React.MutableRefObject<Tone.BaseContext | null>;
    isPlaybackActive: React.MutableRefObject<boolean>;
    volumeAverages: { min: number, max: number };
    // Will eventually be more or less hardcoded, and not needed to be passed around
    setShortSilenceDuration: React.Dispatch<React.SetStateAction<number>>;
    shortSilenceDuration: number;
    setSilenceThreshold: React.Dispatch<React.SetStateAction<number>>;
    silenceThreshold: number;
    inputDevice: React.MutableRefObject<Tone.UserMedia | null | undefined>;
}

export default function useAudioContext(): UseAudioContextReturnType {
    const [isListeningStatus, setIsListeningStatus] = useState<boolean>(false);
    const [volume, setVolume] = useState<number>(-Infinity);
    const [shortSilenceDuration, setShortSilenceDuration] = useState<number>(500);
    const [silenceThreshold, setSilenceThreshold] = useState<number>(-20);

    const audioData = useRef<{ audioBuffer: AudioBuffer; text: string }[]>([]);
    const audioContext = useRef<Tone.BaseContext | null>(null);
    const silenceStartTime = useRef<number | null>(null);
    const longSilenceTimer = useRef<NodeJS.Timeout | null>(null);
    const isRecordingStatus = useRef(false);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const isPlaybackActive = useRef(false);

    // Want to track min/max volume for dynamic thresholding
    const minVolumeSample = useRef<number[]>([-70]);
    const maxVolumeSample = useRef<number[]>([-30]);
    const [volumeAverages, setVolumeAverages] = useState<{ min: number, max: number }>({ min: -70, max: 0 });

    const meter = useRef<Tone.Meter | null>()
    const inputDevice = useRef<Tone.UserMedia | null>();
    const analyser = useRef<Tone.Analyser | null>();
    const lowFilter = useRef<Tone.Filter | null>();

    /**
    * Creates audio context and other nodes to start listening
    */
    async function startListening(selectedAudioInput: string): Promise<void> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const chosenDevice = devices.find(device =>
                device.deviceId === selectedAudioInput || device.label === selectedAudioInput
            );

            if (!chosenDevice) {
                throw new Error("Selected audio input device not found");
            }

            await Tone.start();
            audioContext.current = Tone.getContext();

            inputDevice.current = new Tone.UserMedia();
            meter.current = new Tone.Meter();
            lowFilter.current = new Tone.Filter(150, 'highpass', -24);
            analyser.current = new Tone.Analyser('fft', 2048);

            await inputDevice.current.open(chosenDevice.deviceId);
            inputDevice.current.chain(lowFilter.current, meter.current, analyser.current);


            setIsListeningStatus(true);
            checkAudio();
        } catch (error) {
            console.error('Error accessing microphone:', error);
        }
    }
    // Stops listening and resets all the values

    function stopListening(): void {
        console.log('Stopping listening...');
        if (inputDevice.current) {
            inputDevice.current.close();
        }
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
        }
        if (analyser.current) {
            analyser.current.dispose();
        }
        if (meter.current) {
            meter.current.dispose();
        }

        if (longSilenceTimer.current) {
            clearTimeout(longSilenceTimer.current);
        }
        setIsListeningStatus(false);
        isRecordingStatus.current = false;
        isPlaybackActive.current = false;
        setVolume(-Infinity);
        audioData.current = [];
        console.log('Listening stopped');
    }

    /**
     * Controller function to check the audio data
     * It should tell me data and 'flip some switches'
     */
    const checkAudio = useCallback(() => {
        // Cancel startup if audioContext is not set
        if (!audioContext.current) return;
        const data = analyser.current?.getValue()
        const sampleRate = audioContext.current!.sampleRate;
        const binCount = analyser.current!.size / 2;

        let maxMagnitude = -Infinity;
        let dominantFrequencyIndex = 0;
        let totalMagnitude = 0;
        let significantFrequencies = [];

        for (let i = 0; i < binCount; i++) {
            const magnitude = data[i];
            totalMagnitude += magnitude;

            if (magnitude > maxMagnitude) {
                maxMagnitude = magnitude;
                dominantFrequencyIndex = i;
            }

            const frequency = (i * sampleRate) / (analyser.current!.size * 2);
            if (magnitude > -100) { // Adjust this threshold as needed
                significantFrequencies.push({ frequency, magnitude });
            }
        }

        const dominantFrequency = (dominantFrequencyIndex * sampleRate) / (analyser.current!.size * 2);
        const averageMagnitude = totalMagnitude / binCount;

        // Sort significant frequencies by magnitude
        significantFrequencies.sort((a, b) => b.magnitude - a.magnitude); 
        console.log(significantFrequencies.slice(0, 10), dominantFrequency, averageMagnitude);
        const dbFS = meter.current?.getValue() as number;
        setVolume(dbFS);
        adjustMinMax(dbFS);

        // Check if audio is playing before allowing user to start recording
        if (!isPlaybackActive.current) {
            if (dbFS < silenceThreshold) {
                if (!silenceStartTime.current) {
                    silenceStartTime.current = Date.now();
                } else {
                    const silenceDuration = Date.now() - silenceStartTime.current;

                    if (silenceDuration > shortSilenceDuration && isRecordingStatus.current) {
                        isRecordingStatus.current = false;
                    }
                }
            } else {
                // Still talking, don't want to process transcript yet
                if (silenceStartTime.current) {
                    silenceStartTime.current = null;

                }
                // Start recording if not already recording
                if (!isRecordingStatus.current) {
                    isRecordingStatus.current = true;
                }
            }
        }

    }, [shortSilenceDuration, silenceThreshold]);

    // Where I calculate the min/max volume for dynamic silence thresholding
    function adjustMinMax(dbFS: number) {
        // Don't ever care about storing this case
        if (dbFS === -Infinity) return;

        const maxAverage = maxVolumeSample.current.reduce((acc, val) => acc + val, 0) / maxVolumeSample.current.length;
        const minAverage = minVolumeSample.current.reduce((acc, val) => acc + val, 0) / minVolumeSample.current.length;


        // exponential moving average calculation
        // https://en.wikipedia.org/wiki/Moving_average
        // Hysteresis to prevent rapid switching between states
        // https://en.wikipedia.org/wiki/Hysteresis
        const maxHysteresis = 6; // dB 
        const minHysteresis = 3; // dB
        const alpha = 0.005; // EMA smoothing factor (adjust as needed)

        if (Math.abs(dbFS - (maxAverage + maxHysteresis)) < Math.abs(dbFS - (minAverage - minHysteresis))) {
            // Update maxVolumeSample
            maxVolumeSample.current = maxVolumeSample.current.length > 0
                ? maxVolumeSample.current.map((val) => alpha * dbFS + (1 - alpha) * val)
                : [dbFS];
        } else {
            // Update minVolumeSample
            minVolumeSample.current = minVolumeSample.current.length > 0
                ? minVolumeSample.current.map((val) => alpha * dbFS + (1 - alpha) * val)
                : [dbFS];
        }

        setVolumeAverages({ min: minAverage, max: maxAverage });
        setSilenceThreshold(maxAverage - 18);
    }

    //Drives the checkAudio function
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (isListeningStatus) {
            intervalId = setInterval(checkAudio, 50);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isListeningStatus, checkAudio]);

    return {
        startListening,
        stopListening,
        volume,
        isRecordingStatus,
        isListeningStatus,
        inputDevice,
        audioContext,
        isPlaybackActive,
        volumeAverages,
        // Will eventually be more or less hardcoded, and not needed to be passed around
        setShortSilenceDuration,
        shortSilenceDuration,
        setSilenceThreshold,
        silenceThreshold,
    };
}

