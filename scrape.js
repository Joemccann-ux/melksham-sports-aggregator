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
  const activeFixtures = [];

  // Active Monday-to-Sunday Date Window
  const now = new Date();
  const dayOfWeek = now.getDay();
  const distanceToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);

  const mondayThisWeek = new Date(now);
  mondayThisWeek.setDate(now.getDate() + distanceToMonday);
  mondayThisWeek.setHours(0, 0, 0, 0);

  const sundayThisWeek = new Date(mondayThisWeek);
  sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
  sundayThisWeek.setHours(23, 59, 59, 999);

  for (const pageInfo of PAGES) {
    try {
      console.log(`Scraping: ${pageInfo.url}`);
      await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));

      const matchData = await page.evaluate((info, monTime, sunTime) => {
        let teams = '';
        let dateStr = '';
        let isThisWeek = false;

        // 1. EXTRACT STRUCTURED TABLE ROWS
        const rows = Array.from(document.querySelectorAll('tr')).filter(r => !r.querySelector('th'));

        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
          if (cells.length === 0) continue;

          // Find team cell containing ' vs ' or ' v '
          const teamCell = cells.find(c => (c.toLowerCase().includes(' vs ') || c.toLowerCase().includes(' v ')) && c.length < 90);

          if (teamCell) {
            // Clean match title
            teams = teamCell
              .replace(/^(COMING|SEASON|UPCOMING|EASON|\d{2}\/\d{2})\s*(FIXTURE(S)?)?/i, '')
              .replace(/\s+P\s+Meads.*|\s+VMW.*|\s+Stanley.*$/i, '')
              .trim();

            // Find valid date cell
            const dateCell = cells.find(c => /\b(0?[1-9]|[12][0-9]|3[01])\b/.test(c) && /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(c));
            
            if (dateCell) {
              dateStr = dateCell.trim();
              
              // Validate date against active week boundaries
              const parsedDate = new Date(dateStr);
              if (!isNaN(parsedDate.getTime())) {
                if (parsedDate >= new Date(monTime) && parsedDate <= new Date(sunTime)) {
                  isThisWeek = true;
                }
              } else {
                isThisWeek = true;
              }
            }
            break;
          }
        }

        // Return fixture only if a valid matchup taking place this week exists
        if (teams && isThisWeek) {
          return {
            squad: info.squad,
            sport: info.sport,
            badgeClass: info.badgeClass,
            teams: teams,
            dateStr: dateStr || 'Kickoff details on team page',
            url: info.url
          };
        }

        return null;
      }, pageInfo, mondayThisWeek.getTime(), sundayThisWeek.getTime());

      if (matchData) {
        activeFixtures.push(matchData);
      }
    } catch (err) {
      console.error(`Error scraping ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('fixtures.json', JSON.stringify(activeFixtures, null, 2));
  console.log(`Saved ${activeFixtures.length} valid weekly fixtures into fixtures.json`);
})();
