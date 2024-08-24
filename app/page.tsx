'use client'

/*
TODO:
    Add silence volume detection for dynamic silence threshold setting
    Additionally, add a cutoff so that random quiet noise aren't recorded
*/

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Accordion, AccordionItem } from '@nextui-org/react';
import getVoiceTranscription from '@/actions/getVoiceTranscription';
import useAudioContext from '@/hooks/useAudioContext';

interface AudioContextRef {
    current: AudioContext | null;
}

interface MediaRecorderRef {
    current: MediaRecorder | null;
}

const COLOR_MAP = {
    user: 'bg-blue-200',
    assistant: 'bg-green-200',
    feedback: 'bg-yellow-200',
};

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']

function AdvancedAudioRecorder() {
    const {
        startListening,
        stopListening,
        setShortSilenceDuration,
        setLongSilenceDuration,
        setSilenceThreshold,
        setSendTranscript,
        volume,
        sendTranscript,
        isRecordingStatus,
        isListeningStatus,
        silenceThreshold,
        shortSilenceDuration,
        longSilenceDuration,
        stream,
        audioContext,
    } = useAudioContext();
    //Will be hardcoded eventually


    // Updating UI (which includes audio playback), keep as state
    const [chatContext, setChatContext] = useState<{ role: string; content: string; }[]>([]);
    const [availableAudioDevices, setAvailableAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedAudioInput, setSelectedAudioInput] = useState<string>('');
    const [availableTTSVoices, setAvailableVoices] = useState<string[]>([]);
    const [selectedTTSVoice, setVoice] = useState<string>('');
    const [playbackActive, setPlaybackActive] = useState<boolean>(false);
    // I think this is fine as state
    const [fetchingTranscriptData, setGettingTranscriptData] = useState<boolean>(false);

    // Keep as ref
    const audioData = useRef<{ audioBuffer: AudioBuffer, text: string }[]>([]);
    const speechToTextDataQueue = useRef<Blob[]>([]);
    const mediaRecorder: MediaRecorderRef = useRef(null);
    const audioChunk = useRef<Blob | null>(null);
    const currentTranscription = useRef<string>('');
    const spokenText = useRef<string>('');
    const playbackActiveRef = useRef<boolean>(false);

    


    /**
     * Processes the audio queue and sends the audio to the OpenAI API for transcription
     */
    async function processQueue(): Promise<void> {
        while (speechToTextDataQueue.current.length > 0) {
            const formData = new FormData();
            const audioChunk = speechToTextDataQueue.current.shift() as Blob;
            formData.append('file', audioChunk, 'audio.webm');
            formData.append('model', 'whisper-1');
            formData.append('previousTranscript', currentTranscription.current);
            const results = await getVoiceTranscription(formData);
            currentTranscription.current = currentTranscription.current + ' ' + results;
            console.log('currentTranscription in processQueue:', results);
        }
        setGettingTranscriptData(false);
    }

    const startRecording = useCallback(function startRecording(): void {
        function handleDataAvailable(event: BlobEvent): void {
            if (event.data.size > 0) {
                audioChunk.current = event.data;
            }
        }

        // When called creates a closure, can't see current state data
        function handleRecordingStop(): void {
            if (audioChunk.current) {
                speechToTextDataQueue.current.push(audioChunk.current);
            }
            mediaRecorder.current = null;
        }

        if (stream.current && !mediaRecorder.current) {
            mediaRecorder.current = new MediaRecorder(stream.current, { mimeType: 'audio/webm' });
            mediaRecorder.current.ondataavailable = handleDataAvailable;
            mediaRecorder.current.onstop = handleRecordingStop;
            mediaRecorder.current.start();
        }
    }, [])

    function stopRecording(): void {
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
        }
    }

    const processTextStream = useCallback(async function processTextStream(response: Response, start: Date) {
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
            const sentences = completeText.match(/(.+?[,.:!?\r\n])\s?/gm) || [];
            const message = sentences.join('').replace(processedText, '');
            if (message.length > 20) {
                const audioBuffer = await getTextToVoice(processedText, message, selectedTTSVoice);
                // console.log('Adding to audioToPlay:', new Date() - start);

                if (audioBuffer) {
                    audioData.current.push({
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
    }, [selectedTTSVoice, isRecordingStatus]);


    async function getTextToVoice(priorText: string, currentSentence: string, voice: string): Promise<AudioBuffer | undefined> {
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

    /**
     * Adds the current transcription to the chat and resets the transcription state
     * 
     * Accepts the current transcription and adds it to the chat context
     */
    const handleLongSilence = useCallback(async function handleLongSilence(t: string): Promise<void> {
        const start = new Date();
        console.log('Long silence detected. Sending full transcription for processing.');

        const currentMessage = { role: 'user', content: t };
        const response = await fetch('/api/generateTextResponse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ messages: [...chatContext, currentMessage] })
        });

        let processedText = await processTextStream(response, start);
        if (processedText.trim() === '') {
            // Placeholder until I have a better idea of when this would happen
            processedText = '...'
        }
        setChatContext([...chatContext, currentMessage, { role: 'assistant', content: processedText }]);
        currentTranscription.current = ''
    }, [chatContext, processTextStream]);

    useEffect(() => {
        playbackActiveRef.current = playbackActive;
    }, [playbackActive]);

    useEffect(() => {
        if (isRecordingStatus.current) {
            startRecording();
        } else {
            stopRecording();
        }
    }, [volume, startRecording, isRecordingStatus]);

    /**
     * Plays the audio data
     * 
     * Conditions for playing audio:
     * - Audio data is available
     * - Audio isn't already playing
     * - There is an audio context
     */
    useEffect(() => {
        if (audioContext.current && audioData.current.length > 0 && playbackActive === false) {
            setPlaybackActive(true);
            const source = audioContext.current.createBufferSource();
            const currentAudioData = audioData.current.shift();
            if (currentAudioData) {
                source.buffer = currentAudioData.audioBuffer;
                source.connect(audioContext.current.destination);
                source.onended = () => {
                    setPlaybackActive(false);
                    console.log('Playback ended');
                }
                source.start();
                spokenText.current += currentAudioData.text;
            } else {
                setPlaybackActive(false);
            }
        }
    }, [audioData.current.length, playbackActive]);

    // Get available audio devices
    useEffect(() => {
        async function loadAudioDevices(): Promise<void> {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(device => device.kind === 'audioinput');
                if (audioInputs.length > 0) {
                    setSelectedAudioInput(audioInputs.filter(i => i.label.includes('Default'))[0].deviceId);
                    setAvailableAudioDevices(audioInputs);
                }
            } catch (error) {
                console.error('Error loading audio devices:', error);
                setAvailableAudioDevices([]);
            }
        }
        loadAudioDevices();
        return () => {
            stopListening();
        };
    }, []);

    // Get available voices from the ElevenLabs API, one call only
    useEffect(() => {

        async function fetchAvailableVoices() {
            const response = await fetch('https://api.elevenlabs.io/v1/voices');
            const data = await response.json();
            setAvailableVoices(data.voices.map((i: { voice_id: string, name: string }) => i.name));
            setVoice(data.voices[0].name);
        }
        if (false) {
            setAvailableVoices(OPENAI_VOICES);
            setVoice(OPENAI_VOICES[0]);
        } else {
            fetchAvailableVoices();
        }
    }, []);



    /**
     * Handles sending the user transcript to the STT API for processing
     * 
     * Conditions for sending the transcript:
     * - I've stopped talking long enough (sendTranscript flag)
     * - There is text to process
     * - I'm not already processing data
     * - Audio isn't playing (text to voice)
     * - There is no data in the queue (text to voice)
     */
    useEffect(() => {
        if (
            !playbackActiveRef.current
            && sendTranscript
            && !fetchingTranscriptData
            && currentTranscription.current.length > 0
            && speechToTextDataQueue.current.length === 0
        ) {
            console.log('playbackActive', playbackActiveRef.current, 'Send transcript:', sendTranscript, 'Fetching data:', fetchingTranscriptData, 'Current transcription:', currentTranscription.current.length, 'Audio data queue:', speechToTextDataQueue.current.length);
            setSendTranscript(false);
            handleLongSilence(currentTranscription.current)
        }
    }, [sendTranscript, fetchingTranscriptData, handleLongSilence, setSendTranscript]);

    /**
     * Processes the STT data queue
     * 
     * Conditions for processing the queue:
     * - There is data in the queue
     * - I'm not already processing data
     */
    useEffect(() => {
        if (speechToTextDataQueue.current.length > 0 && !fetchingTranscriptData) {
            setGettingTranscriptData(true);
            processQueue();
        }
    }, [speechToTextDataQueue.current.length, fetchingTranscriptData]);

    return (
        <div className="p-4 w-full mx-auto flex flex-row">
            <div className='w-1/2 px-40 mt-10'>
                <h1 className="text-2xl font-bold mb-4">Audio Recorder Settings</h1>
                <div className="mb-4">
                    <label className="block mb-2">Select Audio Input:</label>
                    <select
                        value={selectedAudioInput}
                        onChange={(e) => setSelectedAudioInput(e.target.value)}
                        className="w-full p-2 border rounded"
                    >
                        {availableAudioDevices.map((device) => (
                            <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="mb-4">
                    <label className="block mb-2">Select Voice:</label>
                    <select
                        value={selectedTTSVoice}
                        onChange={(e) => setVoice(e.target.value)}
                        className="w-full p-2 border rounded"
                    >
                        {availableTTSVoices.map((voice) => (
                            <option key={voice} value={voice}>
                                {voice}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    className={`px-4 py-2 rounded ${isListeningStatus ? 'bg-red-500' : 'bg-green-500'} text-white mb-4`}
                    onClick={isListeningStatus ? stopListening : () => startListening(selectedAudioInput)}
                >
                    {isListeningStatus ? 'Stop Listening' : 'Start Listening'}
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
                        Short Silence Duration: {shortSilenceDuration} ms
                    </label>
                    <input
                        type="range"
                        min="100"
                        max="2000"
                        step="100"
                        value={shortSilenceDuration}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShortSilenceDuration(Number(e.target.value))}
                        className="w-full"
                    />
                </div>
                <div className="mb-4">
                    <label className="block mb-2">
                        Long Silence Duration: {longSilenceDuration} ms
                    </label>
                    <input
                        type="range"
                        min="1000"
                        max="5000"
                        step="100"
                        value={longSilenceDuration}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLongSilenceDuration(Number(e.target.value))}
                        className="w-full"
                    />
                </div>
                <div className={`p-4 rounded ${volume < silenceThreshold ? 'bg-red-200' : 'bg-green-200'}`}>
                    {volume < silenceThreshold ? 'Silence Detected' : 'Audio Detected'}
                </div>
                <div className={`p-4 rounded mt-4 ${isRecordingStatus.current ? 'bg-yellow-200' : 'bg-gray-200'}`}>
                    Recording Status: {isRecordingStatus.current ? 'Recording' : 'Not Recording'}
                </div>
            </div>
            <div className='w-1/2'>
                {chatContext.map((message, index) => <div key={index}>
                    {message.role !== 'feedback'
                        ? <p className={`p-2 rounded ${COLOR_MAP[message.role]}`}>{message.content}</p>
                        : <Accordion className='w-full'>
                            <AccordionItem key="1" aria-label='Feedback' title='Feedback'>
                                {message.content}
                            </AccordionItem>
                        </Accordion>
                    }</div>)}
            </div>
        </div>
    );
};

export default AdvancedAudioRecorder;