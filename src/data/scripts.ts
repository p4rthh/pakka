import type { BuyerType, Speaker } from "../engine/types";

// Three replayable demo calls. `pauseMs` is the silence before the line starts,
// so playback feels like a real call; the UI can speed it up.

export interface ScriptLine {
  speaker: Speaker;
  text: string;
  pauseMs: number;
}

export interface DemoScript {
  id: "a" | "b" | "c";
  title: string;
  summary: string;
  buyerType: BuyerType;
  buyerName: string;
  buyerPhone: string;
  lines: ScriptLine[];
}

export const demoScripts: DemoScript[] = [
  {
    id: "a",
    title: "Wholesaler order, decided buyer",
    summary: "A kirana owner phones the wholesaler with a ready list in bori and dabba; read-back and a Marathi 'barobar'.",
    buyerType: "wholesaler",
    buyerName: "Patil Provision Stores",
    buyerPhone: "9820012345",
    lines: [
      { speaker: "seller", text: "Shah Traders, bolo Patil ji.", pauseMs: 600 },
      { speaker: "buyer", text: "Namaste Shah bhai. Order likh lo: Kolam 2 bori, Tata namak 50 packet, Fortune tel 2 dabba.", pauseMs: 1400 },
      { speaker: "buyer", text: "Aur cheeni 1 bori, Parle G 5 dabba, toor dal 25 kilo.", pauseMs: 2200 },
      { speaker: "seller", text: "Toh final: Kolam 2 bori, Tata namak 50 packet, Fortune tel 2 dabba, cheeni 1 bori, Parle G 5 dabba, toor dal 25 kilo. Barobar?", pauseMs: 1800 },
      { speaker: "buyer", text: "Haan barobar. Kal subah tak pathva do.", pauseMs: 1500 },
    ],
  },
  {
    id: "b",
    title: "Household browses rice, rejects on price, corrects at read-back",
    summary: "Asks what rice is in stock, hears options, turns down Daawat as too costly, picks Kolam, then changes 5 kilo to 10 during read-back.",
    buyerType: "household",
    buyerName: "Mrs. Kulkarni",
    buyerPhone: "9867054321",
    lines: [
      { speaker: "seller", text: "Haan ji, Sharma Kirana. Boliye.", pauseMs: 600 },
      { speaker: "buyer", text: "Bhaiya, rice mein kya kya hai?", pauseMs: 1300 },
      { speaker: "seller", text: "Kolam hai 62 rupaye kilo, Sona Masoori 58, Daawat basmati 105, Kohinoor basmati 135. India Gate abhi khatam hai.", pauseMs: 1600 },
      { speaker: "buyer", text: "Daawat basmati 105 rupaye? Bahut mehenga hai.", pauseMs: 2000 },
      { speaker: "buyer", text: "Kolam hi de do, 5 kilo. Aur Tata namak ek packet, Fortune tel ek litre.", pauseMs: 1500 },
      { speaker: "seller", text: "Toh final: Kolam 5 kilo, Tata namak 1 packet, Fortune tel 1 litre. Sahi hai?", pauseMs: 1700 },
      { speaker: "buyer", text: "Kolam 5 nahi, 10 kilo kar do.", pauseMs: 1400 },
      { speaker: "seller", text: "Theek hai, Kolam 10 kilo. Aur kuch?", pauseMs: 1200 },
      { speaker: "buyer", text: "Bas, itna hi. Ghar pe bhej dena.", pauseMs: 1300 },
    ],
  },
  {
    id: "c",
    title: "Out-of-stock brand becomes a lost sale",
    summary: "Asks for India Gate (out of stock), declines the Daawat substitute, asks for Amul butter (not stocked), buys atta only.",
    buyerType: "household",
    buyerName: "Mrs. Desai",
    buyerPhone: "9930011223",
    lines: [
      { speaker: "seller", text: "Sharma Kirana, boliye.", pauseMs: 600 },
      { speaker: "buyer", text: "India Gate basmati hai kya? 5 kilo chahiye.", pauseMs: 1300 },
      { speaker: "seller", text: "India Gate abhi khatam hai. Daawat hai 105 rupaye kilo, wahi quality. Chalega?", pauseMs: 1700 },
      { speaker: "buyer", text: "Nahi, mujhe India Gate hi chahiye. Woh baad mein dekhti hoon.", pauseMs: 1900 },
      { speaker: "buyer", text: "Baaki, Aashirvaad atta 1 packet aur Amul butter 2 bhi de do.", pauseMs: 1600 },
      { speaker: "seller", text: "Amul butter hum nahi rakhte. Toh final: Aashirvaad atta 1 packet. India Gate aate hi phone karta hoon.", pauseMs: 1800 },
      { speaker: "buyer", text: "Haan theek hai.", pauseMs: 1100 },
    ],
  },
];

export function getScript(id: string): DemoScript | undefined {
  return demoScripts.find((s) => s.id === id);
}
