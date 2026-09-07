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
        let teamsText = '';
        let metaText = '';

        const junk = document.querySelectorAll('style, script, head, link, nav, header, footer');
        junk.forEach(el => el.remove());

        // 1. EXTRACT FROM HTML TABLES
        const rows = document.querySelectorAll('tr');
        for (const row of rows) {
          if (row.querySelector('th')) continue;
          const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
          const vsCell = cells.find(c => c.toLowerCase().includes(' vs ') || c.toLowerCase().includes(' v '));
          
          if (vsCell && vsCell.length < 80) {
            teamsText = vsCell;
            const dateCell = cells.find(c => /\d{1,2}/.test(c) || /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(c));
            if (dateCell) metaText = dateCell;
            break;
          }
        }

        // 2. EXTRACT & SANITIZE FROM BODY TEXT
        if (!teamsText) {
          const bodyText = document.body.innerText.replace(/\s+/g, ' ');

          // Match clean Team A vs Team B string
          const vsRegex = /([A-Za-z0-9\s]{3,35}\s(?:VS|vs|v|V)\s[A-Za-z0-9\s]{3,35})/g;
          const matches = bodyText.match(vsRegex);

          if (matches) {
            for (let m of matches) {
              m = m.trim();
              if (m.length > 8 && m.length < 70 && !m.toLowerCase().includes('fixtures') && !m.toLowerCase().includes('fav move')) {
                teamsText = m;
                break;
              }
            }
          }

          // Match explicit date pattern (e.g. Saturday 26 Sept 2026 or Sunday 27 Sept)
          const dateRegex = /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s?\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Oct|Nov|Dec)[a-z]*\s?\d{0,4})/i;
          const dateMatch = bodyText.match(dateRegex);
          if (dateMatch) {
            metaText = dateMatch[0].trim();
          }
        }

        // 3. CLEAN UP NOISE & PREFIXES
        if (teamsText) {
          teamsText = teamsText
            .replace(/^(COMING|SEASON|UPCOMING|\d{2}\/\d{2})\s+FIXTURE(S)?/i, '')
            .replace(/^(EASON|EASON UPCOMING|UPCOMING FIXTURE)\s+/i, '')
            .replace(/\d{2}\/\d{2,4}$/g, '')
            .replace(/Meads of Melk.*$/i, '')
            .replace(/Stanley Park.*$/i, '')
            .replace(/Sherborne RFC.*$/i, '')
            .trim();
        }

        if (!teamsText || teamsText.length < 5) {
          teamsText = `${info.squad} Fixtures`;
        }

        // Clean up date string noise (removes postcodes like '12 6ES' or '26/27')
        if (metaText) {
          if (/^\d{2}\/\d{2,4}$/.test(metaText) || /[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}/i.test(metaText) || metaText.length < 6) {
            metaText = 'Check team page for kickoff time';
          }
        } else {
          metaText = 'Check team page for kickoff time';
        }

        return {
          squad: info.squad,
          sport: info.sport,
          badgeClass: info.badgeClass,
          teams: teamsText,
          dateStr: metaText,
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
