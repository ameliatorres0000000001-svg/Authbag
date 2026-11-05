// Reading what a phone can see on an NFC chip: UID length, chip maker (ISO/IEC 7816-6 code) and stored links.
// Facts about the chip only; never a judgement about the bag.

// IC manufacturer codes (ISO/IEC 7816-6), the common ones
const MAKERS: Record<number, string> = {
  0x01: 'Motorola', 0x02: 'STMicroelectronics', 0x03: 'Hitachi', 0x04: 'NXP Semiconductors', 0x05: 'Infineon Technologies',
  0x06: 'Cylink', 0x07: 'Texas Instruments', 0x08: 'Fujitsu', 0x09: 'Matsushita', 0x0a: 'NEC', 0x0b: 'Oki', 0x0c: 'Toshiba',
  0x0d: 'Mitsubishi', 0x0e: 'Samsung', 0x0f: 'Hynix', 0x10: 'LG Semiconductors', 0x16: 'EM Microelectronic-Marin',
};

const OFFICIAL: Record<string, string[]> = { lv: ['louisvuitton.com'], chanel: ['chanel.com'] };

export interface ChipFacts {
  bytes: number;
  /** 'single' = 4-byte UID (often random, maker not encoded); 'double'/'triple' = 7/10-byte; 'iso15693' = 8-byte vicinity tag */
  kind: 'single' | 'double' | 'triple' | 'iso15693' | 'other';
  maker: string | null;
  links: { url: string; host: string; official: boolean | null }[];
}

export function parseUid(serial: string): number[] {
  const hex = serial.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (hex.length % 2) return [];
  return Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

export function chipFacts(serial: string, urls: string[], brand: 'lv' | 'chanel' | 'other'): ChipFacts {
  const b = parseUid(serial);
  let kind: ChipFacts['kind'] = 'other';
  let maker: string | null = null;
  if (b.length === 4) kind = 'single';
  else if (b.length === 7 || b.length === 10) { kind = b.length === 7 ? 'double' : 'triple'; maker = MAKERS[b[0]] ?? null; }
  else if (b.length === 8 && b[0] === 0xe0) { kind = 'iso15693'; maker = MAKERS[b[1]] ?? null; }
  const links = urls.map((url) => {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch { host = ''; }
    const list = OFFICIAL[brand];
    const official = list && host ? list.some((d) => host === d || host.endsWith(`.${d}`)) : null;
    return { url, host, official };
  });
  return { bytes: b.length, kind, maker, links };
}
