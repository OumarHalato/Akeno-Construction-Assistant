
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { SYSTEM_INSTRUCTION, AKENO_PRODUCTS, ExtendedProduct } from './constants';
import { encode, decode, decodeAudioData } from './utils/audioUtils';
import VoiceVisualizer from './components/VoiceVisualizer';
import { TranscriptionItem } from './types';

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  
  const [productImages, setProductImages] = useState<Record<string, string>>({});
  const [generatingImages, setGeneratingImages] = useState<Record<string, boolean>>({});

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptionEndRef = useRef<HTMLDivElement>(null);

  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const scrollToBottom = () => {
    transcriptionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [transcriptions]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus(label);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const connect = async () => {
    if (isConnected || isConnecting) return;
    setIsConnecting(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob: Blob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            } else if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            }
            if (message.serverContent?.turnComplete) {
              if (currentInputTranscription.current) setTranscriptions(prev => [...prev, { role: 'user', text: currentInputTranscription.current, timestamp: Date.now() }]);
              if (currentOutputTranscription.current) setTranscriptions(prev => [...prev, { role: 'assistant', text: currentOutputTranscription.current, timestamp: Date.now() }]);
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            setError('ግንኙነት ተቋርጧል።');
            disconnect();
          },
          onclose: () => disconnect(),
        },
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError('ማይክሮፎኑን ማግኘት አልተቻለም።');
      setIsConnecting(false);
    }
  };

  const generateProductImage = async (product: ExtendedProduct) => {
    if (generatingImages[product.name]) return;
    setGeneratingImages(prev => ({ ...prev, [product.name]: true }));
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: product.imagePrompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) { imageUrl = `data:image/png;base64,${part.inlineData.data}`; break; }
      }
      if (imageUrl) setProductImages(prev => ({ ...prev, [product.name]: imageUrl }));
    } catch (err) {
      setError(`${product.nameAm} ምስል ማመንጨት አልተቻለም።`);
    } finally {
      setGeneratingImages(prev => ({ ...prev, [product.name]: false }));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7F6] text-slate-900 selection:bg-yellow-200">
      {/* Dynamic Header */}
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-50 px-4 md:px-8 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-500 text-white p-2 rounded-xl shadow-lg shadow-yellow-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black text-slate-800 leading-none">Akeno Assistant</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Industrial Intelligence Hub</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 mr-4">
             <button 
               onClick={() => setShowSetup(!showSetup)}
               className="flex items-center bg-slate-900 text-white rounded-lg px-3 py-1.5 gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-yellow-500 hover:text-slate-900 transition-all active:scale-95"
             >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                Setup Guide
             </button>
          </div>
          <button
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
            className={`px-5 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
              isConnected ? 'bg-red-50 text-red-600 border border-red-200 shadow-inner' : 'bg-yellow-500 text-slate-900 shadow-lg shadow-yellow-500/30 hover:bg-yellow-600 active:scale-95'
            }`}
          >
            {isConnecting ? <div className="animate-spin h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full" /> : isConnected ? 'ያቁሙ' : 'ያናግሩ (Talk)'}
          </button>
        </div>
      </header>

      {/* Setup Guide Modal */}
      {showSetup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-fade-in">
              <div className="bg-slate-900 p-6 flex items-center justify-between">
                 <h2 className="text-white font-black text-lg uppercase tracking-widest">Enterprise Integration Guide</h2>
                 <button onClick={() => setShowSetup(false)} className="text-slate-400 hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
              </div>
              <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                       <h4 className="text-[10px] font-black text-yellow-600 uppercase mb-2">1. LLM Core</h4>
                       <p className="text-xs font-bold text-slate-700">Google Gemini Flash Engine via Google AI Studio API.</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                       <h4 className="text-[10px] font-black text-yellow-600 uppercase mb-2">2. Voice Integration</h4>
                       <p className="text-xs font-bold text-slate-700">Vapi.ai / Retell AI for high-performance TTS & STT.</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                       <h4 className="text-[10px] font-black text-yellow-600 uppercase mb-2">3. Connectivity</h4>
                       <p className="text-xs font-bold text-slate-700">Twilio Phone, Telegram Bot API, & WhatsApp Business API.</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                       <h4 className="text-[10px] font-black text-yellow-600 uppercase mb-2">4. Automation</h4>
                       <p className="text-xs font-bold text-slate-700">Make.com / Zapier for CRM and Notification Orchestration.</p>
                    </div>
                 </div>

                 <div className="space-y-4 pt-4">
                    <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2">
                       <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" /> Deployment Steps
                    </h3>
                    <ol className="space-y-3 text-xs font-medium text-slate-600 list-decimal pl-4">
                       <li><span className="text-slate-900 font-bold">Clone Repository:</span> Initialize the codebase in your local or cloud environment.</li>
                       <li><span className="text-slate-900 font-bold">API Configuration:</span> Obtain your Google AI Studio Key and set as <code className="bg-slate-100 px-1 rounded">API_KEY</code>.</li>
                       <li><span className="text-slate-900 font-bold">System Setup:</span> Apply the provided <code className="bg-slate-100 px-1 rounded">SYSTEM_INSTRUCTION</code> from <code className="bg-slate-100 px-1 rounded">constants.tsx</code>.</li>
                       <li><span className="text-slate-900 font-bold">Gateway Connection:</span> Hook into Vapi.ai for real-time telephony and voice gateway services.</li>
                    </ol>
                 </div>
              </div>
              <div className="bg-slate-50 p-6 border-t flex justify-end">
                 <button onClick={() => setShowSetup(false)} className="bg-slate-900 text-white px-8 py-2 rounded-xl font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-slate-900/20 active:scale-95 transition-all">Understood</button>
              </div>
           </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 lg:p-8 space-y-6">
        
        {/* Top Info Banner: Smart Logistics */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl relative overflow-hidden">
          <div className="flex items-center gap-4 relative z-10">
            <div className="bg-yellow-500 text-slate-900 p-3 rounded-full animate-pulse shadow-lg shadow-yellow-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <h2 className="text-white font-black text-lg">Akeno Smart Logistics & Sales</h2>
              <p className="text-slate-400 text-xs md:text-sm">Handling customer inquiries via Phone, Telegram, and WhatsApp Business.</p>
            </div>
          </div>
          <div className="flex gap-2 relative z-10">
            <div className="bg-white/10 px-3 py-2 rounded-xl border border-white/10 backdrop-blur-sm">
               <span className="text-yellow-400 text-[9px] font-black uppercase tracking-widest block mb-0.5 text-center">Voice AI</span>
               <span className="text-white text-[11px] font-bold">Vapi/Gemini</span>
            </div>
            <div className="bg-white/10 px-3 py-2 rounded-xl border border-white/10 backdrop-blur-sm">
               <span className="text-yellow-400 text-[9px] font-black uppercase tracking-widest block mb-0.5 text-center">Logistics</span>
               <span className="text-white text-[11px] font-bold">Semera/Afar</span>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 text-white/5 rotate-12">
            <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Column 1: Feature List & Pricing */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                <h3 className="font-bold text-sm uppercase tracking-widest">Enterprise Features</h3>
                <div className="w-2 h-2 bg-green-500 rounded-full" />
              </div>
              <div className="p-4 space-y-3">
                 <div className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                    <div className="mt-1 text-yellow-600"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>
                    <div>
                       <p className="text-xs font-black text-slate-800">Multi-Channel Support</p>
                       <p className="text-[10px] text-slate-500 font-medium leading-tight">Native integration with Phone, Telegram & WhatsApp APIs.</p>
                    </div>
                 </div>
                 <div className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                    <div className="mt-1 text-yellow-600"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>
                    <div>
                       <p className="text-xs font-black text-slate-800">Logistics Automation</p>
                       <p className="text-[10px] text-slate-500 font-medium leading-tight">Automated calculation of Free Transport eligibility.</p>
                    </div>
                 </div>
                 <div className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                    <div className="mt-1 text-yellow-600"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>
                    <div>
                       <p className="text-xs font-black text-slate-800">Fast Payment Flows</p>
                       <p className="text-[10px] text-slate-500 font-medium leading-tight">Shared banking details & Telebirr for frictionless sales.</p>
                    </div>
                 </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <div className="w-1 h-4 bg-yellow-500 rounded-full" /> የዋጋ ዝርዝር (Prices)
                </h3>
              </div>
              <div className="p-2 space-y-1">
                {AKENO_PRODUCTS.map((p, i) => (
                  <div key={i} className="group flex justify-between items-center p-3 rounded-xl hover:bg-slate-50 transition-all cursor-default">
                    <div>
                      <p className="font-bold text-slate-700 text-sm">{p.nameAm}</p>
                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">{p.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-900 font-black">{p.priceAm}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Column 2: Conversational UI */}
          <div className="lg:col-span-8 flex flex-col h-full min-h-[650px]">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 flex-1 flex flex-col overflow-hidden relative">
              <div className="bg-slate-900 p-6 border-b flex justify-center items-center h-32 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full">
                   <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-transparent" />
                   <div className="absolute bottom-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl" />
                </div>
                <VoiceVisualizer isActive={isConnected} color="#EAB308" />
                <div className="absolute top-4 left-6 flex items-center gap-2">
                   <div className="bg-green-500 w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                   <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">AI Live Session</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-8 max-h-[550px]">
                {transcriptions.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <div className="bg-yellow-50 p-10 rounded-full mb-10 relative">
                       <div className="absolute inset-0 bg-yellow-400 rounded-full animate-ping opacity-10" />
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-yellow-600 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </div>
                    <h4 className="text-3xl font-black text-slate-800 mb-4 tracking-tighter">Akeno Assistant</h4>
                    <p className="text-slate-500 max-w-sm mx-auto font-bold text-base leading-relaxed">አማርኛ ተናጋሪ የሽያጭ ረዳት። ስለ ብሎኬት ዋጋ፣ የትራንስፖርት ሁኔታ ወይም ክፍያ ለመጠየቅ "Talk" የሚለውን ተጭነው ያናግሩኝ።</p>
                  </div>
                )}

                {transcriptions.map((t, i) => (
                  <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`max-w-[90%] md:max-w-[75%] p-6 rounded-[2rem] shadow-lg ${t.role === 'user' ? 'bg-yellow-500 text-slate-900 rounded-tr-none' : 'bg-slate-50 text-slate-800 rounded-tl-none border border-slate-200'}`}>
                      <p className="text-sm md:text-lg font-bold leading-tight">{t.text}</p>
                      <div className="flex items-center justify-between mt-4 opacity-30">
                         <span className="text-[10px] font-black uppercase tracking-widest">{t.role === 'user' ? 'Customer' : 'Assistant'}</span>
                         <span className="text-[10px] font-bold">{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={transcriptionEndRef} />
              </div>

              {error && <div className="mx-8 mb-6 p-4 bg-red-600 text-white text-[11px] font-black rounded-2xl text-center shadow-2xl animate-bounce">{error}</div>}
              
              <div className="p-5 border-t bg-slate-50 flex items-center justify-between">
                 <div className="flex gap-6">
                    <button className="text-[11px] font-black uppercase text-slate-400 hover:text-slate-900 transition-all border-b border-transparent hover:border-slate-900">Transcription</button>
                    <button className="text-[11px] font-black uppercase text-slate-400 hover:text-slate-900 transition-all border-b border-transparent hover:border-slate-900">Manager Connect</button>
                 </div>
                 <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Channel:</span>
                    <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">Web Voice</span>
                 </div>
              </div>
            </div>
          </div>
        </div>

        {/* Product Visuals Grid */}
        <section className="space-y-8 pt-12">
          <div className="flex items-center gap-6 px-2">
             <h3 className="text-3xl font-black text-slate-800 shrink-0">Product Visuals</h3>
             <div className="h-1 flex-1 bg-slate-200 rounded-full" />
             <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">AI Generated Previews</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-6">
            {AKENO_PRODUCTS.map((p) => (
              <div key={p.name} className="bg-white rounded-3xl border border-slate-100 p-4 group transition-all hover:shadow-2xl hover:-translate-y-2">
                <div className="aspect-square bg-slate-50 rounded-2xl overflow-hidden mb-4 relative shadow-inner">
                   {productImages[p.name] ? (
                     <img src={productImages[p.name]} alt={p.nameAm} className="w-full h-full object-cover animate-fade-in" />
                   ) : (
                     <div className="w-full h-full flex flex-col items-center justify-center p-4">
                        {generatingImages[p.name] ? (
                           <div className="flex flex-col items-center gap-2">
                             <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                             <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Processing</span>
                           </div>
                        ) : (
                          <div className="bg-slate-200/40 p-5 rounded-full group-hover:bg-yellow-100 transition-all group-hover:scale-110">
                            <svg className="w-8 h-8 text-slate-300 group-hover:text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                        )}
                     </div>
                   )}
                </div>
                <div className="space-y-3">
                  <h4 className="text-[12px] font-black text-slate-800 text-center">{p.nameAm}</h4>
                  <button 
                    onClick={() => generateProductImage(p)}
                    disabled={generatingImages[p.name]}
                    className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${productImages[p.name] ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-yellow-500 hover:text-slate-900 shadow-xl active:scale-95'}`}
                  >
                    {generatingImages[p.name] ? 'Building...' : productImages[p.name] ? 'Regenerate' : 'Generate Visual'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-slate-900 text-white mt-16 py-20 px-8 relative overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-16 relative z-10">
          <div className="md:col-span-6 space-y-8">
            <div className="flex items-center gap-4">
               <div className="bg-yellow-500 text-slate-900 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shadow-yellow-500/20">AK</div>
               <div>
                  <h5 className="font-black text-2xl uppercase tracking-[0.2em]">Akeno Construction</h5>
                  <p className="text-[10px] text-yellow-500 font-black uppercase tracking-widest mt-1">Manufacturing Industrial Solutions</p>
               </div>
            </div>
            <p className="text-slate-400 text-base max-w-lg font-medium leading-relaxed">
              Leading the Afar region in reinforced concrete production and high-quality construction inputs. Integrated with AI for seamless customer excellence.
            </p>
            <div className="flex gap-6">
               <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-4 pr-10 hover:bg-white/10 transition-colors">
                  <div className="bg-green-500 w-3 h-3 rounded-full shadow-[0_0_12px_rgba(34,197,94,0.6)]" />
                  <div>
                    <span className="block text-[11px] font-black text-slate-500 uppercase tracking-widest">Voice Gateway</span>
                    <span className="text-sm font-bold">Vapi.ai Connected</span>
                  </div>
               </div>
               <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-4 pr-10 hover:bg-white/10 transition-colors">
                  <div className="bg-blue-500 w-3 h-3 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
                  <div>
                    <span className="block text-[11px] font-black text-slate-500 uppercase tracking-widest">Automation</span>
                    <span className="text-sm font-bold">Make.com Sync</span>
                  </div>
               </div>
            </div>
          </div>
          
          <div className="md:col-span-3 space-y-6">
             <h6 className="text-xs font-black uppercase tracking-[0.3em] text-yellow-500">Contact Hub</h6>
             <div className="space-y-4 text-sm text-slate-300 font-medium">
                <p className="flex items-center gap-4 hover:text-white transition-colors cursor-pointer group">
                  <svg className="w-5 h-5 text-slate-500 group-hover:text-yellow-500 transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg> 
                  0921117148
                </p>
                <p className="flex items-start gap-4 hover:text-white transition-colors cursor-pointer group leading-snug">
                  <svg className="w-5 h-5 text-slate-500 group-hover:text-yellow-500 transition-colors shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg> 
                  Semera, Afar Region,<br/>Ethiopia (Near Eid Meda)
                </p>
             </div>
          </div>

          <div className="md:col-span-3 space-y-6">
             <h6 className="text-xs font-black uppercase tracking-[0.3em] text-yellow-500">Enterprise Stack</h6>
             <div className="flex flex-col gap-3">
                <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl text-[11px] font-bold text-slate-400 flex items-center justify-between">
                   <span>Twilio / Telephony</span>
                   <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                </div>
                <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl text-[11px] font-bold text-slate-400 flex items-center justify-between">
                   <span>Telegram / WhatsApp</span>
                   <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                </div>
                <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl text-[11px] font-bold text-slate-400 flex items-center justify-between">
                   <span>CRM / Make.com</span>
                   <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                </div>
             </div>
          </div>
        </div>
        
        <div className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
           <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">
              © {new Date().getFullYear()} Akeno Construction Assistant v1.8 Pro • Enterprise Edition
           </p>
           <div className="flex gap-8 text-[11px] font-black uppercase tracking-widest text-slate-500">
              <a href="#" className="hover:text-yellow-500 transition-colors">Privacy</a>
              <a href="#" className="hover