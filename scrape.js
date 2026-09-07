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

        // 1. Look for specific match containers first
        const matchCards = document.querySelectorAll('.match-card, .fixture-card, .fixture-item');
        
        for (const card of matchCards) {
          const title = card.querySelector('.match-title, .fixture-teams, strong');
          const meta = card.querySelector('.match-location, .date-header, .fixture-meta');
          
          if (title && !title.textContent.includes('Fav Move:')) {
            teamsText = title.textContent.trim();
            if (meta) metaText = meta.textContent.trim();
            break;
          }
        }

        // 2. Fallback scan through Elementor widgets
        if (!teamsText) {
          const widgets = document.querySelectorAll('.elementor-widget-html');
          
          for (const widget of widgets) {
            const clone = widget.cloneNode(true);
            
            // Clean out scripts, styles, and unwanted metadata
            const junk = clone.querySelectorAll('style, script, head, link, .fav-move');
            junk.forEach(el => el.remove());

            const text = clone.textContent.replace(/\s+/g, ' ').trim();

            if ((text.toLowerCase().includes(' vs ') || text.toLowerCase().includes(' v ')) && !text.includes('Fav Move:')) {
              // Target strong or bold tags containing "vs" or "v"
              const strongs = clone.querySelectorAll('strong, b, p');
              for (const s of strongs) {
                const sText = s.textContent.trim();
                if ((sText.toLowerCase().includes(' vs ') || sText.toLowerCase().includes(' v ')) && !sText.includes('Fav Move:')) {
                  teamsText = sText;
                  break;
                }
              }

              if (!teamsText) {
                // If text is messy, extract the first sentence containing "vs"
                const matchString = text.split('.').find(str => str.toLowerCase().includes(' vs ') || str.toLowerCase().includes(' v '));
                if (matchString) teamsText = matchString.trim();
              }

              metaText = 'Check team page for kickoff time';
              break;
            }
          }
        }

        // 3. Fallback squad title if no explicitly clean match text is isolated
        if (!teamsText || teamsText.includes('Fav Move:')) {
          teamsText = `${info.squad} Match`;
          metaText = 'See details on team page';
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
