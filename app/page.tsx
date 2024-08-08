'use client'

import React, { useState, useRef, useEffect } from 'react';

interface AudioContextRef {
    current: AudioContext | null;
}

interface AnalyserNodeRef {
    current: AnalyserNode | null;
}

interface Float32ArrayRef {
    current: Float32Array | null;
}

interface NumberRef {
    current: number | null;
}

interface AudioDevice {
    deviceId: string;
    label: string;
}

function WebAudioExplorer() {
    const [isListening, setIsListening] = useState<boolean>(false);
    
    // In decibels
    const [volume, setVolume] = useState<number>(-Infinity);
    
    // Can't be altered while audio context is listening
    const [silenceThreshold, setSilenceThreshold] = useState<number>(-50);

    const [silenceDuration, setSilenceDuration] = useState<number>(1000);
    const [shortBreakDuration, setShortBreakDuration] = useState<number>(300);
    const [isSilent, setIsSilent] = useState<boolean>(true);
    const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<string>('');

    const audioContext: AudioContextRef = useRef(null);
    const analyser: AnalyserNodeRef = useRef(null);
    const dataArray: Float32ArrayRef = useRef(null);
    const silenceStartTime: NumberRef = useRef(null);
    const animationFrame: NumberRef = useRef(null);
    const mediaRecorder: React.MutableRefObject<MediaRecorder | null> = useRef(null);
    const audioChunks: React.MutableRefObject<Blob[]> = useRef([]);

    useEffect(() => {
        getAudioDevices();
        return () => {
            stopListening();
        };
    }, []);

    /* Get a list of available audio input devices */
    async function getAudioDevices(): Promise<void> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices
                .filter(device => device.kind === 'audioinput')
                .map(device => ({ deviceId: device.deviceId, label: device.label || `Microphone ${device.deviceId.slice(0, 5)}` }));
            setAudioDevices(audioInputs);
            if (audioInputs.length > 0) {
                setSelectedDevice(audioInputs[0].deviceId);
            }
            console.log('Available audio input devices:', audioInputs);
        } catch (error) {
            console.error('Error getting audio devices:', error);
        }
    }

    async function startListening(): Promise<void> {
        try {
            console.log('Starting audio capture...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: selectedDevice ? { exact: selectedDevice } : undefined }
            });
            audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
            analyser.current = audioContext.current.createAnalyser();
            const source: MediaStreamAudioSourceNode = audioContext.current.createMediaStreamSource(stream);
            source.connect(analyser.current);

            analyser.current.fftSize = 2048;
            dataArray.current = new Float32Array(analyser.current.fftSize);

            mediaRecorder.current = new MediaRecorder(stream);
            mediaRecorder.current.ondataavailable = handleDataAvailable;
            mediaRecorder.current.start(100); // Collect data every 100ms

            setIsListening(true);
            checkAudio();
            console.log('Audio capture started successfully');
        } catch (error) {
            console.error('Error accessing microphone:', error);
        }
    }

    function stopListening(): void {
        console.log('Stopping audio capture...');
        if (audioContext.current) {
            audioContext.current.close();
            audioContext.current = null;
        }
        if (animationFrame.current) {
            cancelAnimationFrame(animationFrame.current);
        }
        if (mediaRecorder.current) {
            mediaRecorder.current.stop();
        }
        setIsListening(false);
        setVolume(-Infinity);
        setIsSilent(true);
        console.log('Audio capture stopped');
    }

    function checkAudio(): void {
        if (!analyser.current || !dataArray.current) return;

        analyser.current.getFloatTimeDomainData(dataArray.current);
        const rms: number = Math.sqrt(dataArray.current.reduce((sum, val) => sum + val * val, 0) / dataArray.current.length);
        const dbFS: number = 20 * Math.log10(rms);
        setVolume(dbFS);
        console.log("what is the volume", dbFS, "what is the silence threshold", silenceThreshold);
        if (dbFS < silenceThreshold) {
            if (!silenceStartTime.current) {
                silenceStartTime.current = Date.now();
            } else {
                const silenceDurationMs = Date.now() - silenceStartTime.current;
                if (silenceDurationMs > shortBreakDuration) {
                    console.log('Short break detected, processing audio chunk...', silenceDurationMs, shortBreakDuration);
                    handleShortBreak();
                    setIsSilent(true);
                }
                if (silenceDurationMs > silenceDuration) {
                    handleLongSilence();
                }
            }
        } else {
            silenceStartTime.current = null;
            setIsSilent(false);
        }

        animationFrame.current = requestAnimationFrame(checkAudio);
    }

    function handleDataAvailable(event: BlobEvent): void {
        if (event.data.size > 0) {
            audioChunks.current.push(event.data);
        }
    }

    function handleShortBreak(): void {
        // console.log('Short break detected, processing audio chunk...');
        // Placeholder for sending audio chunk for processing
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        sendAudioChunkForProcessing(audioBlob);
        audioChunks.current = []; // Clear the chunks after processing
    }

    function handleLongSilence(): void {
        // console.log('Long silence detected, processing entire transcription...');
        // Placeholder for processing entire transcription
        processEntireTranscription();
    }

    // Placeholder function for sending audio chunk for processing
    async function sendAudioChunkForProcessing(audioBlob: Blob): Promise<void> {
        // This is where you would send the audio chunk to your backend for processing
        audioBlob?.size > 0 && console.log('Sending audio chunk for processing, size:', audioBlob.size, 'bytes');
        // Example of how you might send this to a backend:
        // const formData = new FormData();
        // formData.append('audio', audioBlob, 'audio.webm');
        // await fetch('/api/process-audio-chunk', { method: 'POST', body: formData });
    }

    // Placeholder function for processing entire transcription
    async function processEntireTranscription(): Promise<void> {
        // This is where you would send the entire transcription to an LLM for processing
        // console.log('Processing entire transcription...');
        // Example of how you might do this:
        // const transcription = await getFullTranscription();
        // const response = await fetch('/api/process-transcription', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ transcription })
        // });
        // const result = await response.json();
        // console.log('LLM response:', result);
    }

    return (
        <div className="p-4 max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-4">Web Audio API Explorer</h1>
            <div className="mb-4">
                <label className="block mb-2">Select Audio Input:</label>
                <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className="w-full p-2 border rounded"
                >
                    {audioDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                            {device.label}
                        </option>
                    ))}
                </select>
            </div>
            <button
                className={`px-4 py-2 rounded ${isListening ? 'bg-red-500' : 'bg-green-500'} text-white mb-4`}
                onClick={isListening ? stopListening : startListening}
            >
                {isListening ? 'Stop Listening' : 'Start Listening'}
            </button>
            <div className="mb-4">
                <label className="block mb-2">
                    Current Volume: {volume === -Infinity ? '-∞' : volume.toFixed(2)} dB
                </label>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                        className="bg-blue-600 h-2.5 rounded-full"
                        style={{ width: `${Math.max(0, (volume + 100) / 100 * 100)}%` }}
                    ></div>
                </div>
            </div>
            <div className="mb-4">
                <label className="block mb-2">
                    Silence Threshold: {silenceThreshold} dB
                </label>
                <input
                    type="range"
                    min="-100"
                    max="0"
                    value={silenceThreshold}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSilenceThreshold(Number(e.target.value))}
                    className="w-full"
                />
            </div>
            <div className="mb-4">
                <label className="block mb-2">
                    Long Silence Duration: {silenceDuration} ms
                </label>
                <input
                    type="range"
                    min="100"
                    max="5000"
                    step="100"
                    value={silenceDuration}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSilenceDuration(Number(e.target.value))}
                    className="w-full"
                />
            </div>
            <div className="mb-4">
                <label className="block mb-2">
                    Short Break Duration: {shortBreakDuration} ms
                </label>
                <input
                    type="range"
                    min="100"
                    max="1000"
                    step="50"
                    value={shortBreakDuration}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShortBreakDuration(Number(e.target.value))}
                    className="w-full"
                />
            </div>
            <div className={`p-4 rounded ${isSilent ? 'bg-red-200' : 'bg-green-200'}`}>
                {isSilent ? 'Silence Detected' : 'Audio Detected'}
            </div>
        </div>
    );
};

export default WebAudioExplorer;