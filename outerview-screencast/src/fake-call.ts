import type { Page } from "playwright";

export type CallLine = { maya: string } | { you: string };

/**
 * Stand in for the interview server, so a recording can show a real-looking call without
 * one: no voice AI, nothing saved, nothing counted against the plan. The call screen talks
 * to the server only over /api/interview/realtime; this answers that WebSocket itself and
 * plays `lines` as the conversation: Maya speaks (her orb animates on quiet noise; the
 * recording has no sound anyway), the guest answers, each line lands in the transcript.
 *
 * Call it in a video's setup, before the call is joined. Wire protocol: see
 * outerview/main/client/src/features/interview-call/hooks/use-call-connection.ts.
 */
export async function fakeCall(page: Page, lines: CallLine[], opts: { msPerChar?: number; gapMs?: number } = {}) {
  const msPerChar = opts.msPerChar ?? 55;
  const gapMs = opts.gapMs ?? 900;
  await page.routeWebSocket(/\/api\/interview\/realtime/, (ws) => {
    const send = (msg: object) => ws.send(JSON.stringify(msg));
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let closed = false;
    ws.onClose(() => void (closed = true));
    // The client streams the microphone up; nobody is listening.
    ws.onMessage(() => {});

    void (async () => {
      await sleep(300);
      send({ type: "session_started" });
      send({ type: "session_updated" });
      let seq = 0;
      for (const line of lines) {
        if (closed) return;
        if ("maya" in line) {
          send({ type: "maya_state", state: "talking" });
          send({ type: "response_started" });
          const ms = Math.max(1200, line.maya.length * msPerChar);
          for (let t = 0; t < ms && !closed; t += 250) {
            send({ type: "audio", data: speechNoise(250) });
            await sleep(250);
          }
          send({ type: "ai_transcript", text: line.maya, seq: ++seq, timestamp: Date.now() });
          send({ type: "response_done" });
          send({ type: "maya_state", state: "listening" });
        } else {
          // The guest talks for a while, then their words arrive.
          await sleep(Math.max(1000, line.you.length * msPerChar));
          send({ type: "user_speaking", started: false, seq: ++seq });
          send({ type: "user_transcript", text: line.you, seq, timestamp: Date.now() });
          send({ type: "maya_state", state: "thinking" });
        }
        await sleep(gapMs);
      }
    })();
  });
}

/** Quiet, wavering noise as 24kHz PCM16 base64: enough to drive the speaking animation. */
function speechNoise(ms: number): string {
  const n = Math.round(24 * ms);
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const envelope = 0.6 + 0.4 * Math.sin(i / 900);
    buf.writeInt16LE(Math.round((Math.random() - 0.5) * 3000 * envelope), i * 2);
  }
  return buf.toString("base64");
}
