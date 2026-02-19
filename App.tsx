import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { SYSTEM_INSTRUCTION, AKENO_PRODUCTS, ExtendedProduct } from './constants';
import { encode, decode, decodeAudioData } from './utils/audioUtils';
import VoiceVisualizer from './components/VoiceVisualizer';
import ProductVideo from './components/ProductVideo';
import { TranscriptionItem } from './types';

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  
  const [productImages, setProductImages] = useState<Record<string, string>>({});
  const [productVideos, setProductVideos] = useState<Record<string, string>>({});
  const [generatingImages, setGeneratingImages] = useState<Record<string, boolean>>({});
  const [generatingVideos, setGeneratingVideos] = useState<Record<string, boolean>>({});
  const [videoStatus, setVideoStatus] = useState<string>('');

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

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
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
    sourcesRef.current.forEach((s) => {
      try { s.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const connect = async () => {
    if (isConnected || isConnecting) return;
    setIsConnecting(true);
    setError(null);

    try {
      // Fix: Initialize GoogleGenAI using process.env.API_KEY directly as per guidelines
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
            if (!inputAudioContextRef.current) return;
            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob: Blob = { 
                data: encode(new Uint8Array(int16.buffer)), 
                mimeType: 'audio/pcm;rate=16000' 
              };
              sessionPromise.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
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
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
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
      // Fix: Initialize GoogleGenAI using process.env.API_KEY directly
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

  const generateProductVideo = async (product: ExtendedProduct) => {
    if (generatingVideos[product.name] || !product.videoPrompt) return;
    try {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        alert("ቪዲዮ ለማመንጨት እባክዎ የሚከፈልበት የ-API ቁልፍ ይምረጡ።");
        await (window as any).aistudio.openSelectKey();
      }
      setGeneratingVideos(prev => ({ ...prev, [product.name]: true }));
      setVideoStatus('ቪዲዮውን በማዘጋጀት ላይ (Preparing cinematic preview)...');
      // Fix: Initialize GoogleGenAI using process.env.API_KEY directly
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: product.videoPrompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
      });
      while (!operation.done) {
        setVideoStatus('ቪዲዮው እየተሰራ ነው (Generating video, this may take a few minutes)...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);
        setProductVideos(prev => ({ ...prev, [product.name]: videoUrl }));
      }
    } catch (err: any) {
      console.error(err);
      setError(`${product.nameAm} ቪዲዮ ማመንጨት አልተቻለም።`);
    } finally {
      setGeneratingVideos(prev => ({ ...prev, [product.name]: false }));
      setVideoStatus('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7F6] text-slate-900 selection:bg-yellow-200">
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-50 px-4 md:px-8 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-500 text-white p-2 rounded-xl shadow-lg shadow-yellow-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black text-slate-800 leading-none">Akeno Assistant</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Industrial Intelligence Hub</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSetup(!showSetup)}
            className="flex items-center bg-slate-900 text-white rounded-lg px-3 py-1.5 gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-yellow-500 hover:text-slate-900 transition-all active:scale-95"
          >
            Setup Guide
          </button>
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

      {showSetup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-fade-in">
              <div className="bg-slate-900 p-6 flex items-center justify-between text-white">
                 <h2 className="font-black text-lg uppercase tracking-widest">Enterprise Integration Guide</h2>
                 <button onClick={() => setShowSetup(false)}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="p-8 space-y-6">
                 <p className="text-sm text-slate-600">This AI solution integrates Gemini 2.5 and Veo models for construction sales automation.</p>
              </div>
              <div className="bg-slate-50 p-6 border-t flex justify-end">
                 <button onClick={() => setShowSetup(false)} className="bg-slate-900 text-white px-8 py-2 rounded-xl font-bold uppercase text-[10px] tracking-widest">Close</button>
              </div>
           </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 lg:p-8 space-y-6">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="bg-yellow-500 text-slate-900 p-3 rounded-full animate-pulse shadow-lg"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
            <div>
              <h2 className="text-white font-black text-lg">Akeno Smart Logistics & Multimedia</h2>
              <p className="text-slate-400 text-xs">Handling customer inquiries with AI-generated previews.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="bg-white/10 px-3 py-2 rounded-xl border border-white/10 backdrop-blur-sm text-center">
               <span className="text-yellow-400 text-[9px] font-black uppercase tracking-widest block mb-0.5">Video Gen</span>
               <span className="text-white text-[11px] font-bold">Veo 3.1</span>
            </div>
          </div>
        </div>

        {videoStatus && <div className="bg-blue-600 text-white p-4 rounded-2xl flex items-center justify-center gap-4 animate-pulse shadow-lg font-bold">{videoStatus}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                <h3 className="font-bold text-sm uppercase tracking-widest">Enterprise Features</h3>
                <div className="w-2 h-2 bg-green-500 rounded-full" />
              </div>
              <div className="p-4 space-y-3">
                 {AKENO_PRODUCTS.map((p, i) => (
                   <div key={i} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg">
                     <div>
                       <p className="font-bold text-slate-700 text-sm">{p.nameAm}</p>
                       <p className="text-[10px] text-slate-400 uppercase">{p.name}</p>
                     </div>
                     <p className="text-slate-900 font-black text-xs">{p.priceAm}</p>
                   </div>
                 ))}
              </div>
            </section>
          </div>

          <div className="lg:col-span-8 flex flex-col h-full min-h-[500px]">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 flex-1 flex flex-col overflow-hidden">
              <div className="bg-slate-900 p-6 border-b flex justify-center items-center h-24">
                <VoiceVisualizer isActive={isConnected} color="#EAB308" />
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-8 max-h-[500px]">
                {transcriptions.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <h4 className="text-3xl font-black text-slate-800 mb-4 tracking-tighter">Akeno Assistant</h4>
                    <p className="text-slate-500 max-w-sm mx-auto font-bold text-base">አማርኛ ተናጋሪ የሽያጭ ረዳት። ስለ ብሎኬት ዋጋ ወይም ክፍያ ለመጠየቅ "Talk" የሚለውን ተጭነው ያናግሩኝ።</p>
                  </div>
                )}
                {transcriptions.map((t, i) => (
                  <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`max-w-[85%] p-6 rounded-[2rem] shadow-lg ${t.role === 'user' ? 'bg-yellow-500 text-slate-900 rounded-tr-none' : 'bg-slate-50 text-slate-800 rounded-tl-none border border-slate-200'}`}>
                      <p className="text-sm md:text-lg font-bold leading-tight">{t.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={transcriptionEndRef} />
              </div>
              {error && <div className="mx-8 mb-6 p-4 bg-red-600 text-white text-[11px] font-black rounded-2xl text-center animate-bounce">{error}</div>}
            </div>
          </div>
        </div>

        <section className="space-y-8 pt-12">
          <h3 className="text-3xl font-black text-slate-800 shrink-0">የምርት ማሳያ (Media Showroom)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {AKENO_PRODUCTS.map((p) => (
              <div key={p.name} className="bg-white rounded-[2.5rem] border border-slate-100 p-6 group transition-all hover:shadow-2xl flex flex-col h-full">
                <div className="aspect-square bg-slate-50 rounded-[2rem] overflow-hidden mb-6 relative">
                   {productVideos[p.name] ? (
                     <ProductVideo src={productVideos[p.name]} className="w-full h-full" />
                   ) : productImages[p.name] ? (
                     <img src={productImages[p.name]} alt={p.nameAm} className="w-full h-full object-cover animate-fade-in" />
                   ) : (
                     <div className="w-full h-full flex flex-col items-center justify-center p-8 text-slate-200">
                        {generatingImages[p.name] || generatingVideos[p.name] ? (
                          <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        )}
                     </div>
                   )}
                </div>
                <div className="flex-1 space-y-4">
                  <h4 className="text-lg font-black text-slate-800 text-center">{p.nameAm}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => generateProductImage(p)} disabled={generatingImages[p.name] || generatingVideos[p.name]} className="py-3 rounded-2xl text-[10px] font-black uppercase bg-slate-900 text-white hover:bg-yellow-500 hover:text-slate-900 transition-all active:scale-95">Photo</button>
                    {p.videoPrompt && <button onClick={() => generateProductVideo(p)} disabled={generatingImages[p.name] || generatingVideos[p.name]} className="py-3 rounded-2xl text-[10px] font-black uppercase bg-yellow-100 text-yellow-700 hover:bg-yellow-500 hover:text-slate-900 border border-yellow-200 transition-all active:scale-95">Video</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-slate-900 text-white mt-16 py-12 px-8 text-center text-[11px] font-bold uppercase tracking-widest">
         © {new Date().getFullYear()} Akeno Construction Assistant
      </footer>

      <style>{`
        @keyframes fadeIn { 
          from { opacity: 0; transform: translateY(12px) scale(0.98); } 
          to { opacity: 1; transform: translateY(0) scale(1); } 
        }
        .animate-fade-in { animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default App;