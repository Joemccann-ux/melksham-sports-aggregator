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
      console.log(`Scraping table data from: ${pageInfo.url}`);
      await page.goto(pageInfo.url, { waitUntil: 'networkidle2', timeout: 30000 });

      const matchData = await page.evaluate((info) => {
        let teamsText = '';
        let metaText = '';

        // 1. SCRAPE HTML TABLE ROWS FIRST
        const tableRows = document.querySelectorAll('table tr');
        
        for (const row of tableRows) {
          // Skip table header rows
          if (row.querySelector('th')) continue;

          const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
          const rowText = cells.join(' ');

          if (rowText.toLowerCase().includes(' vs ') || rowText.toLowerCase().includes(' v ')) {
            // Locate cell containing team names
            const vsCell = cells.find(c => c.toLowerCase().includes(' vs ') || c.toLowerCase().includes(' v '));
            teamsText = vsCell || rowText;

            // Extract date/time from adjacent cells if available
            const dateCell = cells.find(c => /\d{1,2}[\/\.-]\d{1,2}/.test(c) || /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(c));
            if (dateCell) metaText = dateCell;

            break; // Stop at first valid upcoming row
          }
        }

        // 2. FALLBACK FOR CARDS OR WIDGETS
        if (!teamsText) {
          const bolds = document.querySelectorAll('strong, b');
          for (const b of bolds) {
            const bText = b.textContent.trim();
            if ((bText.toLowerCase().includes(' vs ') || bText.toLowerCase().includes(' v ')) && bText.length < 90) {
              teamsText = bText;
              break;
            }
          }
        }

        // 3. CLEANUP
        if (!teamsText || teamsText.length > 90) {
          teamsText = `${info.squad} Fixtures`;
        }

        if (!metaText) {
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

      if (matchData) {
        allFixtures.push(matchData);
      }
    } catch (err) {
      console.error(`Error scraping ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('fixtures.json', JSON.stringify(allFixtures, null, 2));
  console.log(`Successfully compiled ${allFixtures.length} clean table fixtures into fixtures.json`);
})();
