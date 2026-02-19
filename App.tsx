
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
  
  // Image Generation States
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
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob: Blob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
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
              if (currentInputTranscription.current) {
                setTranscriptions(prev => [...prev, { role: 'user', text: currentInputTranscription.current, timestamp: Date.now() }]);
              }
              if (currentOutputTranscription.current) {
                setTranscriptions(prev => [...prev, { role: 'assistant', text: currentOutputTranscription.current, timestamp: Date.now() }]);
              }
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
            console.error('Live API Error:', e);
            setError('ግንኙነት ተቋርጧል። እባክዎ እንደገና ይሞክሩ።');
            disconnect();
          },
          onclose: () => {
            disconnect();
          },
        },
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error(err);
      setError('ማይክሮፎኑን ማግኘት አልተቻለም። እባክዎ ፍቃድ ይስጡ።');
      setIsConnecting(false);
    }
  };

  const generateProductImage = async (product: ExtendedProduct) => {
    if (generatingImages[product.name]) return;
    
    setGeneratingImages(prev => ({ ...prev, [product.name]: true }));
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: product.imagePrompt }]
        },
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        setProductImages(prev => ({ ...prev, [product.name]: imageUrl }));
      } else {
        throw new Error("ምስሉን ማመንጨት አልተቻለም።");
      }
    } catch (err) {
      console.error("Image Gen Error:", err);
      setError(`${product.nameAm} ምስል ማመንጨት አልተቻለም። እባክዎ እንደገና ይሞክሩ።`);
    } finally {
      setGeneratingImages(prev => ({ ...prev, [product.name]: false }));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-500 text-white p-2 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Akeno Assistant</h1>
            <p className="text-xs text-slate-500 font-medium">የአኬኖ ግንባታ ረዳት</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
            className={`px-6 py-2 rounded-full font-semibold transition-all flex items-center gap-2 ${
              isConnected 
              ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' 
              : 'bg-yellow-500 text-slate-900 hover:bg-yellow-600 shadow-md active:scale-95'
            }`}
          >
            {isConnecting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                በመገናኘት ላይ...
              </span>
            ) : isConnected ? (
              <>ያቁሙ (Stop)</>
            ) : (
              <>ያናግሩ (Talk)</>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Product Info & Info Cards */}
          <div className="lg:col-span-1 space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                <span className="w-1.5 h-6 bg-yellow-500 rounded-full"></span>
                የምርት ዋጋ ዝርዝር
              </h2>
              <div className="space-y-4">
                {AKENO_PRODUCTS.map((product, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="font-semibold text-slate-800">{product.nameAm}</p>
                      <p className="text-xs text-slate-400">{product.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-yellow-600 font-bold">{product.priceAm}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-tighter">{product.price}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-slate-800 text-white rounded-2xl shadow-lg p-6 relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-lg font-bold mb-2">ልዩ ማሳሰቢያ</h2>
                <p className="text-sm text-slate-300 mb-4 italic">
                  "ነፃ ትራንስፖርት ከ2000 ብሎኬት በላይ ሲታዘዝ እና እስከ 50 ኪ.ሜ ርቀት ድረስ እንሰጣለን።"
                </p>
                <div className="space-y-2 text-xs">
                  <p><span className="text-yellow-400 font-bold">CBE:</span> 1000368060805</p>
                  <p><span className="text-yellow-400 font-bold">Telebirr:</span> 0921117148</p>
                  <p><span className="text-yellow-400 font-bold">አድራሻ:</span> ሰመራ፣ የኢድ ሶላት ሜዳ አጠገብ</p>
                </div>
              </div>
              <div className="absolute -bottom-10 -right-10 opacity-10 text-white">
                <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </section>
          </div>

          {/* Right: Conversational UI */}
          <div className="lg:col-span-2 flex flex-col min-h-[500px]">
            <div className="bg-white rounded-2xl shadow-sm border flex-1 flex flex-col overflow-hidden relative">
              
              {/* Visualizer Overlay */}
              <div className="bg-slate-50/50 p-4 border-b flex justify-center items-center h-24">
                <div className="flex flex-col items-center">
                  <VoiceVisualizer isActive={isConnected} />
                  <p className={`text-[10px] mt-2 font-bold uppercase tracking-widest ${isConnected ? 'text-green-500 animate-pulse' : 'text-slate-400'}`}>
                    {isConnected ? 'ላይቭ (Live)' : 'ዝግጁ (Ready)'}
                  </p>
                </div>
              </div>

              {/* Chat History */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[400px]">
                {!isConnected && transcriptions.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center px-10">
                    <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <h3 className="text-slate-800 font-bold text-lg mb-2">እንኳን ወደ አኬኖ ኮንስትራክሽን በሰላም መጡ!</h3>
                    <p className="text-slate-500 text-sm max-w-sm">
                      የምርት መረጃ ለማግኘት፣ ዋጋ ለመጠየቅ ወይም ትዕዛዝ ለመስጠት "Talk" የሚለውን ቁልፍ በመጫን ያናግሩኝ። በአማርኛ ለመርዳት ዝግጁ ነኝ።
                    </p>
                  </div>
                )}

                {transcriptions.map((t, idx) => (
                  <div key={idx} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                      t.role === 'user' 
                      ? 'bg-yellow-500 text-slate-900 rounded-tr-none' 
                      : 'bg-slate-100 text-slate-800 rounded-tl-none border'
                    }`}>
                      <p className="text-sm font-medium leading-relaxed">{t.text}</p>
                      <span className="text-[10px] opacity-50 block mt-1 text-right">
                        {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={transcriptionEndRef} />
              </div>

              {/* Status Footer */}
              <div className="bg-white p-4 border-t flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-slate-300'}`}></span>
                  {isConnected ? 'ግንኙነቱ ንቁ ነው (Connected)' : 'ግንኙነት የለም (Not Connected)'}
                </div>
                <div>AI Assistant v1.1 • Multimedia Enhanced</div>
              </div>

              {error && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[90%] bg-red-500 text-white px-4 py-2 rounded-lg text-xs font-bold text-center animate-bounce shadow-lg z-20">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Product Visuals Gallery Section */}
        <section className="bg-white rounded-3xl shadow-sm border p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
              <span className="w-2 h-8 bg-yellow-500 rounded-full"></span>
              የምርት ምስሎች (Product Visuals)
            </h2>
            <p className="text-sm text-slate-400 font-medium">በ AI የተፈጠሩ የምርት ቅድመ-እይታዎች</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {AKENO_PRODUCTS.map((product) => (
              <div key={product.name} className="group bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden transition-all hover:shadow-md hover:-translate-y-1">
                <div className="aspect-square bg-slate-200 relative overflow-hidden">
                  {productImages[product.name] ? (
                    <img 
                      src={productImages[product.name]} 
                      alt={product.nameAm} 
                      className="w-full h-full object-cover animate-fade-in"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-6 text-center">
                      {generatingImages[product.name] ? (
                        <div className="flex flex-col items-center gap-3">
                          <svg className="animate-spin h-8 w-8 text-yellow-500" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">በመፍጠር ላይ...</p>
                        </div>
                      ) : (
                        <div className="text-slate-400 opacity-60">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-xs font-semibold">ምስል የለም</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="p-4 flex flex-col gap-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm leading-tight">{product.nameAm}</h3>
                    <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">{product.name}</p>
                  </div>
                  
                  <button 
                    onClick={() => generateProductImage(product)}
                    disabled={generatingImages[product.name]}
                    className={`w-full py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-2 ${
                      productImages[product.name] 
                      ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' 
                      : 'bg-yellow-500 text-slate-900 hover:bg-yellow-600 shadow-sm active:scale-95'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {generatingImages[product.name] ? 'በመፍጠር ላይ...' : productImages[product.name] ? 'እንደገና ፍጠር' : 'ምስል ፍጠር'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t py-6 px-4 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-slate-500 text-xs">
          <p>© {new Date().getFullYear()} አኬኖ ኮንስትራክሽን እና ተያያዥ ግብዓቶች ማምረቻ:: ሰመራ::</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-yellow-600 underline decoration-yellow-200">የአገልግሎት ውል</a>
            <a href="#" className="hover:text-yellow-600 underline decoration-yellow-200">የግላዊነት ፖሊሲ</a>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default App;
