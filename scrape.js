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
      await page.goto(pageInfo.url, { waitUntil: 'networkidle2', timeout: 30000 });

      const matchData = await page.evaluate((info) => {
        let teamsText = '';
        let metaText = '';

        // Clean out garbage elements
        const junk = document.querySelectorAll('style, script, head, link, nav, header, footer');
        junk.forEach(el => el.remove());

        // STAGE 1: Check HTML Tables
        const tableRows = document.querySelectorAll('table tr');
        for (const row of tableRows) {
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

        // STAGE 2: Parse Third-Party / RFU Widgets using Regex
        if (!teamsText) {
          const bodyText = document.body.textContent.replace(/\s+/g, ' ').trim();

          // Regex to capture "Team A VS Team B" up to a date or location
          const vsRegex = /([A-Za-z0-9\s]{3,40}\s(?:VS|vs|v|V)\s[A-Za-z0-9\s]{3,40})/g;
          const matches = bodyText.match(vsRegex);

          if (matches && matches.length > 0) {
            for (let m of matches) {
              m = m.trim();
              // Ignore generic titles or page headings
              if (m.length > 8 && m.length < 70 && !m.toLowerCase().includes('fixtures') && !m.toLowerCase().includes('results') && !m.toLowerCase().includes('fav move')) {
                teamsText = m;
                break;
              }
            }
          }

          // Isolate first date string pattern (e.g., "Sunday 27 Sept 2026" or "26 Sept 2026")
          const dateRegex = /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s?\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Oct|Nov|Dec)[a-z]*\s?\d{0,4})/i;
          const dateMatch = bodyText.match(dateRegex);
          if (dateMatch) {
            metaText = dateMatch[0].trim();
          }
        }

        // STAGE 3: Clean Fallback
        if (!teamsText) {
          teamsText = `${info.squad} Fixtures`;
        }
        if (!metaText) {
          metaText = 'Check page for kickoff time';
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

      if (matchData) {
        allFixtures.push(matchData);
      }
    } catch (err) {
      console.error(`Error scraping ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('fixtures.json', JSON.stringify(allFixtures, null, 2));
  console.log(`Saved ${allFixtures.length} clean fixtures into fixtures.json`);
})();
