// The SFU exchange is non-trickle: late STUN/TURN candidates must travel in SDP.
export function includeIceCandidates(description, candidates, complete = false) {
  const sections = description.sdp.trim().split(/\r?\n(?=m=)/);
  const media = sections.slice(1).map((section) => section.split(/\r?\n/));
  for (const candidate of candidates) {
    if (!candidate?.candidate) continue;
    const mid = candidate.sdpMid;
    const index = mid != null
      ? media.findIndex((lines) => lines.includes(`a=mid:${mid}`))
      : candidate.sdpMLineIndex;
    if (!Number.isInteger(index) || !media[index]) continue;
    const line = `a=${candidate.candidate.replace(/^a=/, '')}`;
    if (!media[index].includes(line)) media[index].push(line);
  }
  return {
    type: description.type,
    sdp: [sections[0], ...media.map((lines) => {
      const end = complete || lines.includes('a=end-of-candidates');
      const cleaned = lines.filter((line) => line && line !== 'a=end-of-candidates');
      if (end && cleaned.some((line) => line.startsWith('a=candidate:')))
        cleaned.push('a=end-of-candidates');
      return cleaned.join('\r\n');
    })].join('\r\n') + '\r\n',
  };
}

export async function completeLocalDescription(pc, description, timeout = 25000) {
  const candidates = [];
  let timer;
  let finish;
  const ready = new Promise((resolve) => { finish = resolve; });
  const candidate = (event) => {
    if (event.candidate) candidates.push(event.candidate);
    else finish();
  };
  const changed = () => {
    if (pc.iceGatheringState === 'complete' || pc.connectionState === 'closed') finish();
  };
  pc.addEventListener('icecandidate', candidate);
  pc.addEventListener('icegatheringstatechange', changed);
  pc.addEventListener('connectionstatechange', changed);
  try {
    await pc.setLocalDescription(description);
    if (pc.iceGatheringState !== 'complete' && pc.connectionState !== 'closed') {
      timer = setTimeout(finish, timeout);
      await ready;
    }
    if (pc.connectionState === 'closed') throw new Error('Media connection closed during ICE gathering');
    // Some native adapters emit candidates without updating localDescription.
    const local = pc.localDescription || pc.currentLocalDescription || description;
    const result = includeIceCandidates(local, candidates, pc.iceGatheringState === 'complete');
    if (!/^a=candidate:/m.test(result.sdp))
      throw new Error('ICE gathering produced no network candidates; check STUN/TURN connectivity');
    return result;
  } finally {
    clearTimeout(timer);
    pc.removeEventListener('icecandidate', candidate);
    pc.removeEventListener('icegatheringstatechange', changed);
    pc.removeEventListener('connectionstatechange', changed);
  }
}
