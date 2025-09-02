const axios = require("axios");
const cheerio = require("cheerio");

async function scrape() {
  const url =
    "https://www.fda.gov/drugs/resources-information-approved-drugs/withdrawn-cancer-accelerated-approvals";

  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
    });

    const $ = cheerio.load(data);
    const rows = [];

    $("table tr").each((i, row) => {
      const rowData = [];
      $(row)
        .find("td, th")
        .each((j, cell) => {
          rowData.push($(cell).text().trim());
        });
      if (rowData.length) rows.push(rowData);
    });
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error(
      "❌ Scraper error:",
      err.response?.status,
      err.response?.statusText || err.message
    );
  }
}

scrape();
