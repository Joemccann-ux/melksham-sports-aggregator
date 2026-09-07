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
      console.log(`Loading: ${pageInfo.url}`);
      await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // WAIT FOR ELEMENTOR WIDGETS OR TABLES TO FULLY RENDER
      await new Promise(r => setTimeout(r, 4000));

      const matchData = await page.evaluate((info) => {
        let teamsText = '';
        let metaText = '';

        // 1. EXTRACT FROM STANDARD TABLE ROWS FIRST
        const rows = document.querySelectorAll('tr');
        for (const row of rows) {
          if (row.querySelector('th')) continue; // Skip header
          const rowText = row.textContent.replace(/\s+/g, ' ').trim();
          
          if ((rowText.toLowerCase().includes(' vs ') || rowText.toLowerCase().includes(' v ')) && !rowText.toLowerCase().includes('fav move')) {
            const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
            const vsCell = cells.find(c => (c.toLowerCase().includes(' vs ') || c.toLowerCase().includes(' v ')) && c.length < 90);
            
            teamsText = vsCell || rowText.substring(0, 80);
            
            // Look for date in row cells
            const dateCell = cells.find(c => /\d{1,2}/.test(c) || /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(c));
            if (dateCell) metaText = dateCell;
            break;
          }
        }

        // 2. PARSE BODY TEXT IF TABLES ARE NOT USED
        if (!teamsText) {
          const bodyText = document.body.innerText.replace(/\s+/g, ' ');

          // Match patterns like "Team A vs Team B"
          const vsRegex = /([A-Za-z0-9\s]{3,35}\s(?:VS|vs|v|V)\s[A-Za-z0-9\s]{3,35})/g;
          const matches = bodyText.match(vsRegex);

          if (matches) {
            for (let m of matches) {
              m = m.trim();
              if (m.length > 8 && m.length < 80 && !m.toLowerCase().includes('fixtures') && !m.toLowerCase().includes('fav move')) {
                teamsText = m;
                break;
              }
            }
          }

          // Match dates like "Saturday 26 Sept 2026" or "12/09/26"
          const dateRegex = /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s?\d{1,2}[\s\/\.-]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Oct|Nov|Dec|\d{1,2})[a-z]*\s?\d{0,4})/i;
          const dateMatch = bodyText.match(dateRegex);
          if (dateMatch) {
            metaText = dateMatch[0].trim();
          }
        }

        // 3. FALLBACKS
        if (!teamsText) {
          teamsText = `${info.squad} Fixtures`;
        }
        if (!metaText) {
          metaText = 'Check page for kickoff details';
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
  console.log(`Saved ${allFixtures.length} fixtures into fixtures.json`);
})();
