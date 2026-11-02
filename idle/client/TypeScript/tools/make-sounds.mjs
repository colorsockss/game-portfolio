// 게임의 소리를 사각파·삼각파·잡음으로 합성해 Unity 프로젝트의 Remote/Audio/(패치로 받는 Addressables 원격 그룹)에 WAV(16비트 모노
// 22.05kHz)로 쓴다. 직접 만든 소리라 라이선스가 없고, 잡음도 시드한 난수라 다시 돌려도 같은 파일이
// 나온다. 소리를 고치면 이 파일을 고쳐 다시 돌리고 WAV와 함께 커밋한다(LFS). 어느 키가 어느 파일을
// 쓰는지는 data/Sounds.xlsx가 정한다.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22_050;
const audio = fileURLToPath(new URL("../../Assets/Remote/Audio/", import.meta.url));

const midi = note => 440 * 2 ** ((note - 69) / 12);
const square = (phase, duty = 0.5) => (phase % 1 < duty ? 1 : -1);
const triangle = phase => 1 - 4 * Math.abs((phase % 1) - 0.5);
const sine = phase => Math.sin(phase * 2 * Math.PI);

// mulberry32: 파일마다 같은 잡음.
function noise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 2 ** 32) * 2 - 1;
  };
}

/** 길이 `seconds`의 빈 트랙. `add`로 소리를 얹는다. */
function track(seconds, seed = 1) {
  const samples = new Float64Array(Math.round(seconds * RATE));
  const random = noise(seed);
  return {
    samples,
    /**
     * `start`초부터 `length`초 동안 한 소리를 더한다. 높이는 시작과 끝 주파수 사이를 지수로 미끄러지고
     * (`to`가 없으면 그대로), 크기는 짧게 올라갔다가 끝에서 0이 되도록 줄어든다(`curve`가 클수록 빨리).
     */
    add({ start = 0, length, from = 0, to = from, wave = square, gain = 1, curve = 1, attack = 0.004 }) {
      const first = Math.round(start * RATE);
      const count = Math.min(Math.round(length * RATE), samples.length - first);
      let phase = 0;
      for (let i = 0; i < count; i++) {
        const t = i / count;
        phase += (from * (to / from || 1) ** t) / RATE;
        const envelope = Math.min(1, i / (attack * RATE)) * (1 - t) ** curve;
        samples[first + i] += (wave === "noise" ? random() : wave(phase)) * gain * envelope;
      }
    },
  };
}

/** 가장 큰 진폭을 0.8로 맞춰 16비트 PCM WAV로 쓴다. */
async function write(name, { samples }) {
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1;
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + samples.length * 2, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); // PCM
  bytes.writeUInt16LE(1, 22); // 모노
  bytes.writeUInt32LE(RATE, 24);
  bytes.writeUInt32LE(RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, i) => bytes.writeInt16LE(Math.round((value / peak) * 0.8 * 32767), 44 + i * 2));
  const file = path.join(audio, `${name}.wav`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  console.log(`${path.relative(process.cwd(), file)} ${(bytes.length / 1024).toFixed(1)} KB`);
}

const sounds = {
  // 맞는 소리: 짧은 잡음과 낮게 떨어지는 사각파.
  "Sfx/Hit": () => {
    const t = track(0.09, 11);
    t.add({ length: 0.09, wave: "noise", gain: 0.6, curve: 2 });
    t.add({ length: 0.09, from: 220, to: 110, gain: 0.4 });
    return t;
  },
  // 치명타: 높은 데서 내려오는 얇은 사각파에 잡음을 더 길게.
  "Sfx/Crit": () => {
    const t = track(0.18, 12);
    t.add({ length: 0.18, from: 1200, to: 400, wave: phase => square(phase, 0.25), gain: 0.5 });
    t.add({ length: 0.12, wave: "noise", gain: 0.4, curve: 2 });
    return t;
  },
  // 처치: 길게 떨어지는 음.
  "Sfx/Kill": () => {
    const t = track(0.3, 13);
    t.add({ length: 0.3, from: 660, to: 110, curve: 1.5, gain: 0.6 });
    t.add({ length: 0.05, wave: "noise", gain: 0.3 });
    return t;
  },
  // 보스 등장: 낮은 두 번 + 길게 한 번, 한 옥타브 아래 삼각파를 겹친다.
  "Sfx/Boss": () => {
    const t = track(0.95, 14);
    [[0, 0.15, 45], [0.2, 0.15, 45], [0.4, 0.55, 41]].forEach(([start, length, note]) => {
      t.add({ start, length, from: midi(note), gain: 0.5, curve: 0.5 });
      t.add({ start, length, from: midi(note - 12), wave: triangle, gain: 0.6, curve: 0.5 });
    });
    return t;
  },
  // 스테이지 클리어: 도 미 솔 도, 마지막 음을 끈다.
  "Sfx/Clear": () => {
    const t = track(0.65, 15);
    [72, 76, 79].forEach((note, i) => t.add({ start: i * 0.1, length: 0.1, from: midi(note), wave: phase => square(phase, 0.25), gain: 0.5 }));
    t.add({ start: 0.3, length: 0.35, from: midi(84), wave: phase => square(phase, 0.25), gain: 0.5, curve: 1.5 });
    return t;
  },
  // 레벨업: 빠르게 오르는 아르페지오를 삼각파와 얇은 사각파로 겹친다.
  "Sfx/LevelUp": () => {
    const t = track(0.75, 16);
    [67, 72, 76, 79, 84, 88].forEach((note, i) => {
      const last = i === 5;
      const length = last ? 0.4 : 0.07;
      t.add({ start: i * 0.07, length, from: midi(note), wave: triangle, gain: 0.5, curve: last ? 1.5 : 1 });
      t.add({ start: i * 0.07, length, from: midi(note), wave: phase => square(phase, 0.125), gain: 0.25, curve: last ? 1.5 : 1 });
    });
    return t;
  },
  // 버튼: 짧고 높게 떨어지는 딸깍. 자주 나므로 가장 짧고 작다.
  "Sfx/Click": () => {
    const t = track(0.05, 18);
    t.add({ length: 0.05, from: 1500, to: 900, wave: phase => square(phase, 0.25), gain: 0.5, curve: 3 });
    t.add({ length: 0.01, wave: "noise", gain: 0.2 });
    return t;
  },
  // 전투 BGM: 120BPM 4마디(8초) 반복. Am F C G 위에 8분음표 베이스, 16분음표 아르페지오, 킥과 하이햇.
  // 모든 음이 마디 안에서 끝나므로 이어 붙여도 이음매에서 튀지 않는다.
  "Bgm/Battle": () => {
    const sixteenth = 0.125;
    const t = track(64 * sixteenth, 17);
    const chords = [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]];
    chords.forEach((chord, bar) => {
      const barStart = bar * 16 * sixteenth;
      for (let step = 0; step < 16; step++) {
        const start = barStart + step * sixteenth;
        const arp = [chord[0], chord[1], chord[2], chord[0] + 12][step % 4] + 24;
        t.add({ start, length: sixteenth * 0.9, from: midi(arp), wave: phase => square(phase, 0.25), gain: 0.12, curve: 1.5 });
        if (step % 2 === 0) t.add({ start, length: sixteenth * 1.8, from: midi(chord[0] + (step % 4 === 2 ? 12 : 0)), wave: triangle, gain: 0.45, curve: 0.7 });
        if (step % 8 === 0) t.add({ start, length: 0.12, from: 120, to: 40, wave: sine, gain: 0.6, curve: 2 });
        if (step % 4 === 2) t.add({ start, length: 0.03, wave: "noise", gain: 0.1, curve: 2 });
      }
    });
    return t;
  },
  // 고블린 야영지·오우거 요새: 같은 120BPM 4마디(8초)에 Dm B♭ Gm A. 8분음표 아르페지오를 낮게 두고 4분음표 베이스,
  // 1·3박 킥과 2·4박 스네어(잡음)로 무겁게 한다.
  "Bgm/Fortress": () => {
    const sixteenth = 0.125;
    const t = track(64 * sixteenth, 21);
    const chords = [[38, 41, 45], [34, 38, 41], [31, 34, 38], [33, 37, 40]];
    chords.forEach((chord, bar) => {
      const barStart = bar * 16 * sixteenth;
      for (let step = 0; step < 16; step += 2) {
        const start = barStart + step * sixteenth;
        const arp = [chord[0], chord[1], chord[2], chord[1]][(step / 2) % 4] + 24;
        t.add({ start, length: sixteenth * 1.8, from: midi(arp), wave: phase => square(phase, 0.5), gain: 0.1, curve: 1.2 });
        if (step % 4 === 0) t.add({ start, length: sixteenth * 3.6, from: midi(chord[0]), wave: triangle, gain: 0.5, curve: 0.6 });
        if (step % 8 === 0) t.add({ start, length: 0.15, from: 100, to: 35, wave: sine, gain: 0.7, curve: 2 });
        if (step % 8 === 4) t.add({ start, length: 0.1, wave: "noise", gain: 0.25, curve: 1.5 });
      }
    });
    return t;
  },
  // 얼어붙은 고개·용의 둥지: 150BPM 4마디(6.4초)에 Em C D B. 16분음표로 오르내리는 아르페지오, 옥타브를 뛰는 8분음표 베이스,
  // 4분음표 킥과 엇박 하이햇으로 급하게 한다.
  "Bgm/Peak": () => {
    const sixteenth = 0.1;
    const t = track(64 * sixteenth, 22);
    const chords = [[40, 43, 47], [36, 40, 43], [38, 42, 45], [35, 39, 42]];
    chords.forEach((chord, bar) => {
      const barStart = bar * 16 * sixteenth;
      for (let step = 0; step < 16; step++) {
        const start = barStart + step * sixteenth;
        const arp = [chord[0], chord[1], chord[2], chord[0] + 12, chord[2], chord[1]][step % 6] + 24;
        t.add({ start, length: sixteenth * 0.9, from: midi(arp), wave: phase => square(phase, 0.125), gain: 0.11, curve: 1.5 });
        if (step % 2 === 0) t.add({ start, length: sixteenth * 1.8, from: midi(chord[0] + (step % 4 === 2 ? 12 : 0)), wave: triangle, gain: 0.45, curve: 0.7 });
        if (step % 4 === 0) t.add({ start, length: 0.1, from: 130, to: 45, wave: sine, gain: 0.6, curve: 2 });
        if (step % 4 === 2) t.add({ start, length: 0.025, wave: "noise", gain: 0.12, curve: 2 });
      }
    });
    return t;
  },
  // 불: 길게 끄는 잡음(불길)에 낮게 떨어지는 사각파와 사인파 울림.
  "Sfx/Fire": () => {
    const t = track(0.3, 31);
    t.add({ length: 0.3, wave: "noise", gain: 0.6, curve: 1.2, attack: 0.02 });
    t.add({ length: 0.2, from: 320, to: 140, gain: 0.3 });
    t.add({ length: 0.3, from: 90, to: 50, wave: sine, gain: 0.5 });
    return t;
  },
  // 얼음: 높은 사인파 둘이 차례로 반짝이고 아주 짧은 잡음으로 깨진다.
  "Sfx/Ice": () => {
    const t = track(0.3, 32);
    t.add({ length: 0.02, wave: "noise", gain: 0.4 });
    t.add({ length: 0.2, from: midi(93), wave: sine, gain: 0.5, curve: 1.5 });
    t.add({ start: 0.06, length: 0.24, from: midi(100), wave: sine, gain: 0.4, curve: 1.5 });
    t.add({ start: 0.06, length: 0.24, from: midi(88), wave: triangle, gain: 0.25, curve: 2 });
    return t;
  },
  // 독: 낮게 떨어지는 짧은 사각파 셋(거품)과 옅은 잡음.
  "Sfx/Poison": () => {
    const t = track(0.24, 33);
    [[0, 300, 200], [0.07, 260, 170], [0.14, 220, 140]].forEach(([start, from, to]) =>
      t.add({ start, length: 0.08, from, to, wave: phase => square(phase, 0.25), gain: 0.45, curve: 1.5 }));
    t.add({ length: 0.24, wave: "noise", gain: 0.12, curve: 1 });
    return t;
  },
  // 신성: 높은 도 미 솔을 삼각파로 함께 울리고 한 옥타브 위 사인파를 얹은 종소리.
  "Sfx/Holy": () => {
    const t = track(0.6, 34);
    [84, 88, 91].forEach(note => t.add({ length: 0.6, from: midi(note), wave: triangle, gain: 0.35, curve: 1.3 }));
    t.add({ length: 0.4, from: midi(96), wave: sine, gain: 0.2, curve: 2 });
    return t;
  },
};

for (const [name, make] of Object.entries(sounds)) await write(name, make());
