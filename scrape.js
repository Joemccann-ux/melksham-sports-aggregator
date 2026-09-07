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

      const widgetsData = await page.evaluate((info) => {
        const results = [];
        const widgets = document.querySelectorAll('.elementor-widget-html');

        widgets.forEach((widget) => {
          // Clone node to strip unwanted internal style/script tags
          const clone = widget.cloneNode(true);
          const junk = clone.querySelectorAll('style, script');
          junk.forEach(el => el.remove());

          const cleanText = clone.textContent.replace(/\s+/g, ' ').trim();

          if (cleanText.toLowerCase().includes(' vs ') || cleanText.toLowerCase().includes(' v ')) {
            // Extract match title or fallback to squad name
            const teamsEl = clone.querySelector('strong, .match-title, .fixture-teams');
            const metaEl = clone.querySelector('.match-location, .date-header, .fixture-meta, p');

            let teamsText = teamsEl ? teamsEl.textContent.trim() : '';
            if (!teamsText || teamsText.length > 100) {
              teamsText = `${info.squad} Fixture`;
            }

            let metaText = metaEl ? metaEl.textContent.trim() : '';
            if (metaText.length > 120) {
              metaText = 'Check page for details';
            }

            results.push({
              squad: info.squad,
              sport: info.sport,
              badgeClass: info.badgeClass,
              teams: teamsText,
              dateStr: metaText,
              url: info.url
            });
          }
        });

        return results;
      }, pageInfo);

      // Only take the first upcoming valid match card per squad page
      if (widgetsData.length > 0) {
        allFixtures.push(widgetsData[0]);
      }
    } catch (err) {
      console.error(`Error scraping ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('fixtures.json', JSON.stringify(allFixtures, null, 2));
  console.log(`Successfully compiled ${allFixtures.length} clean fixtures into fixtures.json`);
})();
