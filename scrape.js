const fs = require('fs');
const puppeteer = require('puppeteer');

const PAGES = [
  { squad: 'Melksham Town 1st', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-men-1st-team/' },
  { squad: 'Melksham Town Res', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-res/' },
  { squad: 'FOF FC', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/fof-mens-1st-xi/' },
  { squad: 'Melksham Ladies', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-ladies/' },
  { squad: 'Melksham Vets', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-vets/' },
  { squad: 'RFC Women', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-women-fixtures-2026-2027/' },
  { squad: 'RFC Men 1st XV', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-mens-1xv-fixtures-2026-2027/' },
  { squad: 'RFC Men 2nd XV', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-2xv-fixtures-2026-2027/' },
  { squad: 'U18s Academy', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-u18s-academy/' },
  { squad: 'Fawns U16', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-fawns-u16/' },
  { squad: 'RFC 16s Bucks', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-16s-the-bucks/' },
  { squad: 'Fawns U14', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-fawns-u14/' }
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const allFixtures = [];

  for (const pageInfo of PAGES) {
    try {
      console.log(`Scraping: ${pageInfo.url}`);
      await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3500));

      const matchData = await page.evaluate((info) => {
        let cleanMatchTitle = '';
        let cleanMetaDate = '';

        // Clean out junk tags
        const junk = document.querySelectorAll('style, script, head, link, nav, header, footer');
        junk.forEach(el => el.remove());

        const bodyText = document.body.innerText.replace(/\s+/g, ' ');

        // Find "Team A vs Team B" patterns
        const vsRegex = /([A-Za-z0-9\s]{3,35}\s(?:VS|vs|v|V)\s[A-Za-z0-9\s]{3,35})/g;
        const matches = bodyText.match(vsRegex);

        if (matches && matches.length > 0) {
          for (let rawMatch of matches) {
            let str = rawMatch.trim()
              .replace(/^(COMING|SEASON|UPCOMING|EASON|EASON UPCOMING|\d{2}\/\d{2})\s*(FIXTURE(S)?)?/i, '')
              .replace(/\d{2}\/\d{2,4}$/g, '')
              .trim();

            if (str.length > 8 && str.length < 75 && !str.toLowerCase().includes('fav move')) {
              cleanMatchTitle = str;
              break;
            }
          }
        }

        // Extract clean date pattern (e.g., "Saturday 26 Sept 2026" or "Sunday 27 Sept")
        const dateRegex = /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s?\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Oct|Nov|Dec)[a-z]*\s?\d{0,4})/i;
        const dateMatch = bodyText.match(dateRegex);

        if (dateMatch) {
          cleanMetaDate = dateMatch[0].trim();
        }

        // Fallback cleanup if text extraction wasn't formatted cleanly
        if (!cleanMatchTitle || cleanMatchTitle.length < 5) {
          cleanMatchTitle = `${info.squad}`;
          cleanMetaDate = 'No fixture scheduled this week';
        } else if (!cleanMetaDate) {
          cleanMetaDate = 'Check team page for kickoff time';
        }

        return {
          squad: info.squad,
          sport: info.sport,
          badgeClass: info.badgeClass,
          teams: cleanMatchTitle,
          dateStr: cleanMetaDate,
          url: info.url
        };
      }, pageInfo);

      allFixtures.push(matchData);
    } catch (err) {
      console.error(`Error scraping ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('fixtures.json', JSON.stringify(allFixtures, null, 2));
  console.log(`Saved ${allFixtures.length} clean fixtures into fixtures.json`);
})();
