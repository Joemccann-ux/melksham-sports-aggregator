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

  // CURRENT WEEK RANGE: Monday 00:00:00 to Sunday 23:59:59
  const now = new Date();
  const dayOfWeek = now.getDay();
  const distanceToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);

  const mondayThisWeek = new Date(now);
  mondayThisWeek.setDate(now.getDate() + distanceToMonday);
  mondayThisWeek.setHours(0, 0, 0, 0);

  const sundayThisWeek = new Date(mondayThisWeek);
  sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
  sundayThisWeek.setHours(23, 59, 59, 999);

  console.log(`Checking fixtures between ${mondayThisWeek.toDateString()} and ${sundayThisWeek.toDateString()}...`);

  for (const pageInfo of PAGES) {
    try {
      console.log(`Checking: ${pageInfo.url}`);
      await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 4000));

      const matchData = await page.evaluate((info, monTime, sunTime) => {
        let teams = '';
        let dateStr = '';
        let isPlayingThisWeek = false;

        // Strip non-content DOM elements
        const junk = document.querySelectorAll('style, script, head, link, nav, header, footer');
        junk.forEach(el => el.remove());

        const bodyText = document.body.innerText.replace(/\s+/g, ' ');

        // 1. EXTRACT MATCH TITLE
        const vsRegex = /([A-Za-z0-9\s.]{3,35}\s+(?:VS|vs|v|V)\s+[A-Za-z0-9\s.]{3,35})/g;
        const matches = bodyText.match(vsRegex);

        if (matches && matches.length > 0) {
          for (let m of matches) {
            let str = m.trim()
              .replace(/^(COMING|SEASON|UPCOMING|EASON|\d{2}\/\d{2})\s*(FIXTURE(S)?)?/i, '')
              .replace(/^Upcoming Fixture\s+/i, '')
              .split(/\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Meads|Stanley|Sherborne|Kingswood|\d{2}\/)/i)[0]
              .trim();

            if (str.length > 8 && str.length < 65 && !str.toLowerCase().includes('fav move')) {
              teams = str;
              break;
            }
          }
        }

        // 2. EXTRACT DATE & CHECK WEEK BOUNDARIES
        const dateRegex = /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s?\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s?\d{0,4})/i;
        const dateMatch = bodyText.match(dateRegex);

        if (dateMatch) {
          dateStr = dateMatch[0].trim();
          
          // Parse date to check against active week
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            if (parsedDate >= new Date(monTime) && parsedDate <= new Date(sunTime)) {
              isPlayingThisWeek = true;
            }
          } else {
            // Include match if the date string is specifically attached to this week's match card
            isPlayingThisWeek = true;
          }
        }

        // Return match data ONLY if team is actually playing this week
        if (teams && isPlayingThisWeek) {
          return {
            squad: info.squad,
            sport: info.sport,
            badgeClass: info.badgeClass,
            teams: teams,
            dateStr: dateStr || 'Check page for kickoff time',
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
  console.log(`Saved ${activeFixtures.length} active fixtures happening this week into fixtures.json`);
})();
