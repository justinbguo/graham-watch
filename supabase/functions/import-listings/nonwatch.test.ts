import { assertEquals } from 'jsr:@std/assert@1';

import candidatesCsv from './fixtures/nonwatch-candidates.csv' with { type: 'text' };
import { classifyCatalogueItem, type CatalogueFields, type HoldReason } from './nonwatch.ts';

function item(fields: Partial<CatalogueFields> & { title: string }): CatalogueFields {
  return {
    title: fields.title,
    text: fields.text ?? '',
    productType: fields.productType ?? null,
    tags: fields.tags ?? [],
    vendor: fields.vendor ?? null,
    sourceUrl: fields.sourceUrl,
  };
}

function reason(fields: CatalogueFields): HoldReason | 'watch' {
  const decision = classifyCatalogueItem(fields);
  return decision.decision === 'hold' ? decision.reason : 'watch';
}

const JUNK: Array<{ reason: HoldReason; fields: CatalogueFields }> = [
  {
    reason: 'strap',
    fields: item({
      title: 'Rolex Oyster Bracelet - 20mm Two Tone.',
      productType: 'Watches',
      text: 'Jubilee-style replacement bracelet.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'Rolex Jubilee Bracelet 20mm',
      text: 'Loose bracelet for other Datejust references.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'Rolex President Bracelet 19mm',
      text: 'End links sold as a bracelet only.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'Black Shell Cordovan Strap',
      vendor: 'WIS STRAPS',
      productType: null,
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'The Tumbleweed',
      productType: '',
      text: 'Handmade leather strap. Lug length 115/75mm.',
    }),
  },
  {
    reason: 'strap',
    fields: item({ title: 'Black Saffiano Watch Strap', productType: null }),
  },
  {
    reason: 'strap',
    fields: item({ title: 'Rolex Explorer 1016', productType: 'Straps' }),
  },
  {
    reason: 'strap',
    fields: item({ title: 'Cap', productType: 'Nato' }),
  },
  {
    reason: 'strap',
    fields: item({ title: 'Cap', productType: 'Two Piece' }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Exhibition Tray - Large', productType: null }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Valet Tray', productType: 'Watch Tray' }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Spring Bar Tool - Steel', productType: null }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Bracelet Removal Tool', productType: null }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Rolex Explorer 1016', productType: 'Watch Boxes' }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Rolex Explorer 1016', productType: 'Watch Winder' }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Embroidered Speedy 1957 Cap', productType: null }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Theo & Harris Cap', productType: null }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'GMT Hands Shirt', productType: null }),
  },
  {
    reason: 'accessory',
    fields: item({ title: 'Cool Gift Card', productType: null }),
  },
  {
    reason: 'clock',
    fields: item({ title: 'Movado Travel Clock', productType: 'Watches' }),
  },
  {
    reason: 'clock',
    fields: item({ title: 'Cartier Clock Lighter', productType: null }),
  },
  {
    reason: 'clock',
    fields: item({ title: 'Accutron Spaceview Desk Clock', productType: null }),
  },
  {
    reason: 'clock',
    fields: item({
      title: 'Cartier Lapis Lazuli Minute Repeater Clock',
      productType: 'Vintage Watches',
      text: 'Complete with box and papers.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'WIS STRAPS Charcoal Grey Rubber Strap 22mm',
      vendor: 'WIS STRAPS',
      text: 'Upgrade your 22mm watch head with a charcoal grey calibrated rubber strap designed for smooth alignment.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'WIS STRAPS Forest Green Rubber Strap 22mm',
      vendor: 'WIS STRAPS',
      text: 'Upgrade your 22mm watch head with a forest green calibrated rubber strap.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'WIS STRAPS Lemon Yellow Rubber Strap 22mm',
      vendor: 'WIS STRAPS',
      text: 'Upgrade your 22mm watch head with a lemon yellow calibrated rubber strap.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'WIS STRAPS Miami Blue Rubber Strap 22mm',
      vendor: 'WIS STRAPS',
      text: 'Upgrade your 22mm watch head with a miami blue calibrated rubber strap.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: '1970s Rolex Jubilee 6311 Bracelet - 14k Yellow Gold',
      vendor: 'Rolex',
      text: 'This specific reference 6311 is a rare 14k yellow gold execution of the Jubilee bracelet.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'Patek Philippe 5036 White Gold Bracelet',
      vendor: "Danny's Vintage Watches",
      text: 'Finding a standalone Patek Philippe white gold bracelet is an increasingly difficult task.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'Rolex 1807 18038 1803 Day-Date Rose Gold Bracelet',
      vendor: "Danny's Vintage Watches",
      text: 'This is a period-correct President bracelet from a Rolex Day-Date ref. 1807. 20 mm lug width.',
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'Rolex Day Date 18078 – Bark Finish Bracelet',
      vendor: "Danny's Vintage Watches",
      text: "Here's a vintage Rolex Day-Date bracelet for references 1807, 18078. 20mm lug width.",
    }),
  },
  {
    reason: 'strap',
    fields: item({
      title: 'Rolex Heavy Bracelet - 6694 1500 5500',
      vendor: "Danny's Vintage Watches",
      text: "Here's a vintage Rolex heavy Oyster bracelet from the 1970s with 19mm lug width.",
    }),
  },
  {
    reason: 'strap',
    fields: item({ title: 'Gold Buckle', vendor: 'Hairspring', text: 'A buckle intended to match yellow gold cases.' }),
  },
  {
    reason: 'strap',
    fields: item({
      title: '20mm Hadley Roma Men\'s Wristwatch Band MSM788',
      productType: 'Jewelry & Watches > Watches, Parts & Accessories > Watch Accessories > Wristwatch Bands',
    }),
  },
  {
    reason: 'accessory',
    fields: item({
      title: 'Vintage Omega Meister Men\'s Wristwatch Box',
      productType: 'Boxes & Cases',
    }),
  },
  {
    reason: 'accessory',
    fields: item({
      title: 'Patek Philippe White Gold Ellipse Cufflinks Ref. 9003 (Objet) 29grams',
      productType: 'Watches',
    }),
  },
  {
    reason: 'accessory',
    fields: item({
      title: 'Patek Philippe 18K Yellow Gold Lapis Cufflinks, 1960s (Objet)',
      productType: 'Watches',
    }),
  },
  {
    reason: 'accessory',
    fields: item({
      title: 'Bulgari 18k Yellow Gold Monete Ring (Objet)',
      productType: 'Watches',
    }),
  },
  {
    reason: 'accessory',
    fields: item({
      title: 'Asprey Omani Khanjar White Gold Bracelet (Objet)',
      productType: 'Watches',
    }),
  },
  {
    reason: 'clock',
    fields: item({
      title: 'Time Module Inc. Golf Ball',
      productType: 'Collectibles > Decorative Collectibles > Clocks > Alarm Clocks & Clock Radios',
    }),
  },
  {
    reason: 'not_a_watch',
    fields: item({
      title: '1970 Grand Seiko "Japan\'s Grand Masterpiece" 61 Series Dress Watch Advertisement',
      productType: null,
    }),
  },
  {
    reason: 'not_a_watch',
    fields: item({ title: 'Rolex Prince Pocket Watch', text: 'Silver pocket watch.' }),
  },
  {
    reason: 'not_a_watch',
    fields: item({
      title: 'Vintage Elgin B.W. Raymond Railroad Pocket Watch',
      productType: 'Jewelry & Watches > Watches, Parts & Accessories > Watches > Pocket Watches',
    }),
  },
  {
    reason: 'not_a_watch',
    fields: item({
      title: 'Elgin 20  B.W. Raymond 8ADJ',
      productType: 'Pocket Watches',
    }),
  },
  {
    reason: 'not_a_watch',
    fields: item({
      title: 'Illinois Canadian Dial Model 6',
      productType: 'Wristwatches',
      sourceUrl:
        'https://thewatchpreserve.com/products/antique-18s-illinois-canadian-dial-model-6-railroad-pocket-watch-bunn-silver-1',
    }),
  },
  {
    reason: 'not_a_watch',
    fields: item({
      title: '1908 Illinois PW',
      sourceUrl: 'https://www.coolvintagewatches.com/pocket-watches/pw15-5fjnb',
    }),
  },
  {
    reason: 'not_a_watch',
    fields: item({
      title: 'Antique 18s Unbranded Art Deco Edge Open Face Pocket Watch Case for Key USA',
    }),
  },
  {
    reason: 'not_a_watch',
    fields: item({ title: 'ETA 2824 Movement Only' }),
  },
  {
    reason: 'not_a_watch',
    fields: item({
      title:
        '1865 Waltham P.S. Bartlett Civil War Era 18 Size Pocket Watch Same Brand Given to Abraham Lincoln at Gettysburg',
      productType: 'Pocket Watch',
      tags: ['Pocket Watch'],
    }),
  },
  {
    reason: 'not_a_watch',
    fields: item({
      title: '1914 Vacheron Constantin for Merimont Mens Art Deco 44mm Pocket Watch Platinum',
      productType: 'WATCH',
      tags: ['Pocket Watch'],
    }),
  },
  {
    reason: 'not_a_watch',
    fields: item({
      title: "Owned/Used by ZZ Top's Dusty Hill Harley-Davidson Chrome Pocket Watch",
      productType: 'WATCH',
      tags: ['Pocket Watch'],
    }),
  },
  {
    reason: 'not_a_watch',
    fields: item({
      title:
        '1912 Patek Philippe Vintage Ladies Miniature Pendant 18K Gold, Enamel & Diamond Watch',
      productType: 'Pocket Watch',
    }),
  },
];

const WATCHES: CatalogueFields[] = [
  item({ title: '1962 Seiko SilverWave Diver', productType: 'Watches' }),
  item({ title: '1962 Omega Seamaster with box and card', productType: 'Watches' }),
  item({ title: 'Longines Captain 1960s', productType: 'Watches' }),
  item({
    title: 'Gruen Art Deco Yellow Gold & Jade Lapel Watch (Objet)',
    productType: 'Watches',
  }),
  item({
    title: 'Jaeger Lecoultre Jade Diamond Onyx Pendant Watch, Art Deco (Objet)',
    productType: 'Watches',
  }),
  item({ title: 'Baylor Cufflinks', productType: 'Watches', text: 'A 17.5mm cufflinks wristwatch.' }),
  item({ title: 'Sheffield Cufflink Watch', productType: 'Watches' }),
  item({ title: 'Audemars Piguet Royal Oak 15202ST', text: 'On a bracelet.' }),
  item({ title: 'Audemars Piguet Royal Oak Jumbo 5402ST', text: 'Integrated bracelet.' }),
  item({
    title: 'Audemars Piguet Puzzle Bracelet 56059BA',
    text: 'The Puzzle Bracelet, reference 56059BA.',
  }),
  item({ title: 'Piaget Polo 861C701', text: 'Integrated bracelet in yellow gold.' }),
  item({ title: 'Aquadive Bathyscaphe 100 Box and Papers', vendor: 'Aquadive' }),
  item({
    title: 'Buben & Zorweg The One',
    text: 'A wristwatch. The maker also builds watch winders.',
    productType: 'Watch Winder',
  }),
  item({
    title: '1989 Rolex Datejust 16220',
    vendor: "Danny's Vintage Watches",
    text: 'On an oyster bracelet, with box and papers.',
    productType: 'Watches',
  }),
  item({ title: '2024 Omega Speedmaster', text: 'Current production. On bracelet.', productType: 'Modern' }),
  item({ title: 'Cartier Tank Louis', text: 'Meet at three o\'clock. On the original strap.' }),
  item({ title: 'Cartier Tank Art Deco', text: 'Wearable sculpture of a sort, with box and papers.' }),
  item({ title: 'Rolex Submariner 5513', tags: ['strap', 'bracelet'], text: 'Lug width 20mm.' }),
  item({ title: 'Heuer Autavia 1163', productType: 'DRESS', vendor: 'Heuer' }),
  item({ title: 'Rolex Explorer 1016', productType: '' }),
  item({ title: 'Rolex Explorer 1016', productType: 'Signature Pieces' }),
  item({ title: 'Rolex Explorer 1016', productType: 'Commercial' }),
  item({
    title: 'Rolex GMT-Master 1675',
    text: 'Priced at 400 dollars. The vendor is the shop.',
    vendor: 'Huntington Company',
  }),
  item({
    title: 'Audemars Piguet Royal Oak 15202ST',
    productType: 'Straps',
    text: 'On bracelet.',
  }),
  item({
    title: '1989 Rolex Lady Datejust 69178 - 18K Yellow Gold Walnut Burl Wood Dial President Bracelet',
    vendor: 'Rolex',
    text: 'This Lady Datejust President from 1989 features the Walnut Burl dial.',
  }),
  item({
    title: 'Rolex 18K Gold Watch - Complete Strap/Bracelet',
    vendor: 'Rolex',
    text: 'A Rolex crafted from 18K gold.',
  }),
  item({
    title: 'Bulova',
    productType: 'Jewelry & Watches > Watches, Parts & Accessories > Watches > Wristwatches',
  }),
  item({
    title: 'New Doxa Sub 200 Whitepearl Short Strap 796.15.011.23',
    productType: 'Jewelry & Watches > Watches, Parts & Accessories > Watches > Wristwatches',
  }),
  item({
    title: 'Gucci Leather Strap Black Dial',
    productType: 'Jewelry & Watches > Watches, Parts & Accessories > Watches > Wristwatches',
  }),
  item({
    title:
      '1969 Rolex Cellini Bark Finish | Ref. 3714 | 18Kt White Gold | Complete Full Set: Box, Rolex Guarantee, Buckle, Original sale Receipt',
    vendor: 'The Time Curator',
  }),
  item({ title: 'Accutron Spaceview Steel Bracelet Vintage', productType: 'accutron' }),
  item({ title: 'Audemars Piguet Ultra Thin - 18K Yellow Gold Integrated Bracelet' }),
  item({ title: '2005 Datejust 36 116233 – Two-Tone Hidden Clasp Champagne Dial' }),
  item({ title: 'Hamilton Tank Red Strap Vintage' }),
  item({
    title: "Vintage Ni-Lite 17 Jewel Men's Automatic Wristwatch ETA 2472 w Original Band NOS",
    productType: 'Jewelry & Watches > Watches, Parts & Accessories > Watches > Wristwatches',
  }),
  item({
    title: "Vintage 35mm Movado Tempo-Matic Men's Automatic Wristwatch 2562PC w NSA Band",
    productType: 'Jewelry & Watches > Watches, Parts & Accessories > Watches > Wristwatches',
  }),
];

Deno.test('holds the junk the shops actually listed', () => {
  const misses = JUNK.filter((example) => reason(example.fields) !== example.reason);
  assertEquals(
    misses.map((example) => `${example.fields.title} -> ${reason(example.fields)}`),
    []
  );
});

Deno.test('holds no real watch', () => {
  const held = WATCHES.filter((fields) => reason(fields) !== 'watch');
  assertEquals(
    held.map((fields) => fields.title),
    []
  );
  assertEquals(held.length, 0);
});

Deno.test('the same product decides the same way twice', () => {
  const fields = item({ title: 'Black Saffiano Watch Strap' });
  assertEquals(classifyCatalogueItem(fields), classifyCatalogueItem(fields));
});

const TRAPS: CatalogueFields[] = [
  item({ title: 'Hamilton Tank Red Strap Vintage' }),
  item({ title: 'Accutron Spaceview Steel Bracelet Vintage', productType: 'accutron' }),
  item({ title: 'Longines Sexy Bracelet Vintage' }),
  item({ title: "Daniel Roth Le Sentier 'Lego' Sport Bracelet", productType: 'Watch' }),
  item({ title: 'Marvin Dress Watch Bracelet', productType: 'Watch' }),
  item({ title: 'Audemars Piguet - Puzzle Bracelet', text: 'Reference 4647/903.' }),
  item({ title: 'Baylor Cufflinks', productType: 'Watches', text: 'A 17.5mm cufflinks wristwatch.' }),
  item({ title: 'Panerai Luminor Black Seal Hunter Case' }),
  item({ title: "American Watch Case Co." }),
  item({ title: 'Bulova Monopusher "Stopwatch"' }),
  item({ title: 'Benrus Cocktail Charm' }),
  item({ title: 'Tubogas Bangle Watch' }),
  item({ title: 'Invicta Reserve 52mm', text: 'A large sports wristwatch.' }),
  item({ title: '1907 Waltham Vanguard PW', sourceUrl: 'https://example.com/watches/vanguard' }),
  item({ title: '1909 Illinois 14kt Gold Hunter Case', sourceUrl: 'https://example.com/watches/illinois' }),
  item({ title: 'Omega Speedmaster on strap' }),
  item({ title: 'Rolex Submariner with a leather strap' }),
  item({
    title: 'Nautilus 5711',
    text: 'Diamond cocktail wristwatch. Style is jewellery.',
  }),
  item({
    title: 'Patek Philippe Calatrava ref. 5026G',
    productType: 'Watches and Accessories',
  }),
];

Deno.test('wristwatch traps stay on the deck', () => {
  const held = TRAPS.filter((fields) => reason(fields) !== 'watch');
  assertEquals(
    held.map((fields) => `${fields.title} -> ${reason(fields)}`),
    [],
  );
});

type CsvRow = {
  title: string;
  url: string;
  category: string;
  reason: string;
};

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows;
  const titleAt = header.indexOf('title');
  const urlAt = header.indexOf('url');
  const categoryAt = header.indexOf('category');
  const reasonAt = header.indexOf('reason');
  return body
    .filter((cells) => cells.length > categoryAt)
    .map((cells) => ({
      title: cells[titleAt] ?? '',
      url: cells[urlAt] ?? '',
      category: cells[categoryAt] ?? '',
      reason: cells[reasonAt] ?? '',
    }));
}

function productTypeFromAudit(row: CsvRow): string | null {
  const named = row.reason.match(/product type is '([^']+)'/);
  if (named) return named[1];
  if (handheldStopwatch(row)) return 'Pocket Watches';
  return null;
}

function pocketSignal(row: CsvRow): boolean {
  const title = row.title.toLowerCase();
  const url = row.url.toLowerCase();
  return (
    title.includes('pocket watch') ||
    title.includes('pocketwatch') ||
    url.includes('/pocket-watches') ||
    url.includes('pocket-watch') ||
    url.includes('pocketwatch')
  );
}

function handheldStopwatch(row: CsvRow): boolean {
  return /\bstop\s*watch/.test(row.title.toLowerCase()) && !pocketSignal(row);
}

function keptForNow(row: CsvRow): boolean {
  return (
    row.category === 'pendant_lapel_watch' ||
    /\b(?:pendant|lapel|brooch|sautoir)\b/i.test(row.title) ||
    /\bcufflink\s+watch\b/i.test(row.title) ||
    handheldStopwatch(row)
  );
}

function expectedFromLabel(row: CsvRow): HoldReason | 'watch' {
  if (row.category === 'jewelry') return 'accessory';
  if (row.category === 'accessory' || row.category === 'other_part') return 'not_a_watch';
  if (row.category === 'bracelet_part') {
    if (row.title.includes('Florentine')) return 'watch';
    return 'strap';
  }
  // A switched-off pendant or stopwatch rule does not cancel a pocket watch.
  const typedPocket = /pocket\s*watch/i.test(productTypeFromAudit(row) ?? '');
  if (pocketSignal(row) || typedPocket) return 'not_a_watch';
  if (keptForNow(row)) return 'watch';
  return 'watch';
}

Deno.test('labeled catalogue rows hold or pass from the title and url', () => {
  const rows = parseCsv(candidatesCsv);
  const misses = rows.filter((row) => {
    const decided = reason(
      item({
        title: row.title,
        sourceUrl: row.url,
        productType: productTypeFromAudit(row),
      }),
    );
    return decided !== expectedFromLabel(row);
  });
  assertEquals(
    misses.map((row) => {
      const decided = reason(
        item({
          title: row.title,
          sourceUrl: row.url,
          productType: productTypeFromAudit(row),
        }),
      );
      return `${row.category} | ${decided} | ${expectedFromLabel(row)} | ${row.title}`;
    }),
    [],
  );
});
