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

  // CURRENT WEEK WINDOW: Monday 00:00:00 to Sunday 23:59:59
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
      await page.goto(pageInfo.url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Force puppeteer to wait 5 seconds for dynamic iframe/iCal/Pitchero DOM nodes to inject
      await new Promise(r => setTimeout(r, 5000));

      const matchData = await page.evaluate((info, monTime, sunTime) => {
        let teams = '';
        let dateStr = '';
        let isPlayingThisWeek = false;

        // Strip noise tags
        const junk = document.querySelectorAll('style, script, head, link, nav, header, footer');
        junk.forEach(el => el.remove());

        // 1. EXTRACT FROM TABLES FIRST
        const rows = Array.from(document.querySelectorAll('tr')).filter(r => !r.querySelector('th'));

        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
          const teamCell = cells.find(c => (c.toLowerCase().includes(' vs ') || c.toLowerCase().includes(' v ')) && c.length < 90);

          if (teamCell) {
            teams = teamCell;

            // Find matching date cell
            const dateCell = cells.find(c => /\b(0?[1-9]|[12][0-9]|3[01])\b/.test(c) || /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(c));
            if (dateCell) dateStr = dateCell;
            break;
          }
        }

        // 2. FALLBACK TO CARD / ICAL NODES
        if (!teams) {
          const bodyText = document.body.innerText.replace(/\s+/g, ' ');
          const vsMatch = bodyText.match(/([A-Za-z0-9\s.]{3,35}\s+(?:VS|vs|v|V)\s+[A-Za-z0-9\s.]{3,35})/i);
          if (vsMatch) {
            teams = vsMatch[1];
          }

          const dateMatch = bodyText.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)?,?\s?\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s?\d{0,4})/i);
          if (dateMatch) {
            dateStr = dateMatch[1];
          }
        }

        // 3. SANITIZE TEAM NAME NOISE
        if (teams) {
          teams = teams
            .replace(/^(COMING|SEASON|UPCOMING|EASON|\d{2}\/\d{2})\s*(FIXTURE(S)?)?/i, '')
            .replace(/\s+[P|VMW]\b/gi, '') // Strips " P" and " VMW"
            .replace(/\s+(Meads of Melk|Stanley Park|Sherborne RFC|Melksham Rugby Club).*$/i, '')
            .trim();
        }

        // 4. CHECK IF DATE FALLS IN THIS WEEK (Monday to Sunday)
        if (dateStr) {
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            if (parsedDate >= new Date(monTime) && parsedDate <= new Date(sunTime)) {
              isPlayingThisWeek = true;
            }
          } else {
            // Include if match date string is specifically present on active card
            isPlayingThisWeek = true;
          }
        } else {
          // If match found on table row during active week crawl, retain match
          if (teams) isPlayingThisWeek = true;
        }

        if (teams && isPlayingThisWeek) {
          return {
            squad: info.squad,
            sport: info.sport,
            badgeClass: info.badgeClass,
            teams: teams,
            dateStr: dateStr || 'Check team page for kickoff time',
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
  console.log(`Successfully compiled ${activeFixtures.length} clean active fixtures into fixtures.json`);
})();
