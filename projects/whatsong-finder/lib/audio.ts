export async function decodeAudio(file:Blob):Promise<AudioBuffer> {
 if(file.size>40*1024*1024) throw new Error('Choose a file smaller than 40 MB. Trim long videos first.');
 const context=new AudioContext();
 try {
  const audio=await context.decodeAudioData(await file.arrayBuffer());
  if(audio.duration<2) throw new Error('Use a clip at least 2 seconds long.');
  if(audio.duration>1200) throw new Error('Use a clip shorter than 20 minutes. Trim the part with music first.');
  return audio;
 } catch(e) { if(e instanceof Error&&/Use a clip/.test(e.message))throw e;throw new Error('Your browser could not read this file. Try MP3, WAV, M4A or a short MP4 with audio.'); }
 finally { await context.close(); }
}
export function waveform(audio:AudioBuffer,bars=88) {
 const samples=audio.getChannelData(0);const step=Math.max(1,Math.floor(samples.length/bars));
 return Array.from({length:bars},(_,i)=>{let peak=0;for(let j=i*step;j<Math.min(samples.length,(i+1)*step);j+=Math.max(1,Math.floor(step/60)))peak=Math.max(peak,Math.abs(samples[j]));return peak;});
}
export async function prepareClip(audio:AudioBuffer,start:number,speed:number,normalize:boolean,windowSeconds=12,allowSilence=false):Promise<Blob> {
 const duration=Math.min(12,windowSeconds,(audio.duration-start)/speed);
 if(duration<2)throw new Error('Move the start time earlier so there are at least 2 seconds to identify.');
 const context=new OfflineAudioContext(1,Math.ceil(duration*22050),22050);
 const source=context.createBufferSource();source.buffer=audio;source.playbackRate.value=speed;source.connect(context.destination);source.start(0,start);
 const rendered=await context.startRendering();const samples=rendered.getChannelData(0);
 let peak=0;for(const n of samples)peak=Math.max(peak,Math.abs(n));
 if(peak<0.00005&&!allowSilence)throw new Error('This clip is silent. Choose a part where the music is audible.');
 const gain=normalize&&peak>0?Math.min(5,.94/peak):1;
 const bytes=new ArrayBuffer(44+samples.length*2);const view=new DataView(bytes);
 const write=(o:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
 write(0,'RIFF');view.setUint32(4,36+samples.length*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,22050,true);view.setUint32(28,44100,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const n=Math.max(-1,Math.min(1,samples[i]*gain));view.setInt16(44+i*2,n<0?n*32768:n*32767,true);}
 return new Blob([bytes],{type:'audio/wav'});
}
