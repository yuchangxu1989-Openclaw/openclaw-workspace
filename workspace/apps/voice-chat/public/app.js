(() => {
  const $ = (s) => document.querySelector(s);
  const callBtn = $('#callBtn');
  const status = $('#status');
  const hint = $('#hint');
  const avatarWrapper = $('#avatarWrapper');
  const iconPhone = $('.icon-phone');
  const iconEnd = $('.icon-end');

  let ws = null;
  let audioCtx = null;
  let mediaStream = null;
  let processor = null;
  let source = null;
  let isActive = false;
  let isHolding = false;
  let audioQueue = [];
  let isPlaying = false;

  function setState(s) {
    status.className = 'status';
    avatarWrapper.className = 'avatar-wrapper';
    switch (s) {
      case 'idle':
        status.textContent = '点击开始对话';
        break;
      case 'connecting':
        status.textContent = '正在连接...';
        break;
      case 'ready':
        status.textContent = '按住按钮说话';
        status.classList.add('listening');
        avatarWrapper.classList.add('active');
        break;
      case 'listening':
        status.textContent = '正在听...';
        status.classList.add('listening');
        avatarWrapper.classList.add('active');
        break;
      case 'thinking':
        status.textContent = '焰崽思考中...';
        status.classList.add('speaking');
        avatarWrapper.classList.add('speaking');
        break;
      case 'speaking':
        status.textContent = '焰崽在说话...';
        status.classList.add('speaking');
        avatarWrapper.classList.add('speaking');
        break;
      case 'error':
        status.textContent = '连接出错，请重试';
        break;
    }
  }

  function setActive(v) {
    isActive = v;
    callBtn.classList.toggle('active', v);
    iconPhone.classList.toggle('hidden', v);
    iconEnd.classList.toggle('hidden', !v);
  }

  // PCM16 audio playback
  function playAudioChunk(b64Data) {
    audioQueue.push(b64Data);
    if (!isPlaying) drainQueue();
  }

  async function drainQueue() {
    if (!audioCtx || audioQueue.length === 0) { isPlaying = false; return; }
    isPlaying = true;
    setState('speaking');

    while (audioQueue.length > 0) {
      const b64 = audioQueue.shift();
      const raw = atob(b64);
      const pcm = new Int16Array(raw.length / 2);
      for (let i = 0; i < pcm.length; i++) {
        pcm[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
      }
      const float32 = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) float32[i] = pcm[i] / 32768;

      const buffer = audioCtx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(audioCtx.destination);

      await new Promise((resolve) => {
        src.onended = resolve;
        src.start();
      });
    }

    isPlaying = false;
    if (isActive) setState('ready');
  }

  // Mic capture → PCM16 → WebSocket
  async function startMic() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      hint.textContent = '麦克风权限被拒绝';
      setState('error');
      stopCall();
      return;
    }

    audioCtx = new AudioContext({ sampleRate: 24000 });
    source = audioCtx.createMediaStreamSource(mediaStream);

    // Use ScriptProcessor for broad compatibility
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!isHolding || !ws || ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        pcm[i] = Math.max(-32768, Math.min(32767, Math.floor(input[i] * 32768)));
      }
      const b64 = btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)));
      ws.send(JSON.stringify({ type: 'audio', data: b64 }));
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);
  }

  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}`);

    ws.onopen = () => setState('connecting');

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'ready') setState('ready');
      else if (msg.type === 'audio') playAudioChunk(msg.data);
      else if (msg.type === 'response_done') { if (isActive && !isPlaying) setState('ready'); }
      else if (msg.type === 'error') { hint.textContent = msg.message; setState('error'); }
    };

    ws.onclose = () => {
      if (isActive) { setState('error'); stopCall(); }
    };
    ws.onerror = () => {};
  }

  function startCall() {
    setActive(true);
    setState('connecting');
    audioQueue = [];
    isPlaying = false;
    connectWS();
    startMic();
  }

  function stopCall() {
    setActive(false);
    setState('idle');
    isHolding = false;
    hint.textContent = '';
    if (ws) { ws.close(); ws = null; }
    if (processor) { processor.disconnect(); processor = null; }
    if (source) { source.disconnect(); source = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    audioQueue = [];
    isPlaying = false;
  }

  // Click to toggle call
  callBtn.addEventListener('click', (e) => {
    if (!isActive) startCall();
    else stopCall();
  });

  // Hold-to-talk: press = start recording, release = commit
  callBtn.addEventListener('pointerdown', (e) => {
    if (!isActive) return;
    isHolding = true;
    setState('listening');
    // Cancel any playing audio
    audioQueue = [];
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'cancel' }));
  });

  const stopHolding = () => {
    if (!isHolding) return;
    isHolding = false;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'commit' }));
      setState('thinking');
    }
  };
  callBtn.addEventListener('pointerup', stopHolding);
  callBtn.addEventListener('pointerleave', stopHolding);
  callBtn.addEventListener('pointercancel', stopHolding);

  // Prevent context menu on long press (mobile)
  callBtn.addEventListener('contextmenu', (e) => e.preventDefault());
})();
