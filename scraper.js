const axios = require("axios");
const cheerio = require("cheerio");
const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;  
const DB_NAME = "RTM";
const COLLECTION_NAME = "news_updates_test";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

// Date parsing function
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === "") return null;

  try {
    // Handle various date formats
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    console.warn(`Could not parse date: ${dateStr}`);
    return null;
  }
}

// MongoDB connection and operations
async function connectToMongoDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log("Connected to MongoDB");
  return client;
}

async function insertUniqueRecords(client, records) {
  if (records.length === 0) return 0;

  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);

  let insertedCount = 0;

  for (const record of records) {
    try {
      // Check for duplicates based on URL or Title + DataSource
      const existingRecord = await collection.findOne({
        $or: [
          { $and: [{ URL: record.URL }, { URL: { $ne: null } }] },
          { Title: record.Title, DataSource: record.DataSource },
        ],
      });

      if (!existingRecord) {
        await collection.insertOne(record);
        insertedCount++;
      }
    } catch (error) {
      console.error(`Error inserting record: ${record.Title}`, error.message);
    }
  }

  return insertedCount;
}

// Scraper 1: FDA Withdrawals
async function scrapeWithdrawalsFDA(baseUrl) {
  console.log(`Scraping ${baseUrl}...`);

  try {
    const { data } = await axios.get(baseUrl, {
      headers: HEADERS,
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    const records = [];

    $("tbody tr").each((i, row) => {
      const cols = $(row).find("td");

      if (cols.length >= 4) {
        const drugName = $(cols[0]).text().trim();

        // Handle both link and plain text in second column
        const linkTag = $(cols[1]).find("a[href]");
        let fullUrl = null;
        let title = "";

        if (linkTag.length > 0) {
          const url = linkTag.attr("href");
          fullUrl = url.startsWith("/") ? `${baseUrl}${url}` : url;
          title = linkTag.attr("title")?.trim() || linkTag.text().trim();
        } else {
          title = $(cols[1]).text().trim();
        }
        const withdrawalDate = $(cols[3]).text().trim();

        records.push({
          DrugName: drugName,
          Title: title,
          Description: "",
          URL: fullUrl,
          PublishedDate: parseDate(withdrawalDate),
          DataSource: "FDA Withdrawals",
        });
      }
    });

    console.log(`Scraped ${records.length} withdrawal records`);
    return records;
  } catch (error) {
    console.error(
      "❌ Scraper error for FDA Withdrawals:",
      error.response?.status,
      error.response?.statusText || error.message
    );
    return [];
  }
}

// Scraper 2: FDA Ongoing Cancer Accelerated Approvals
async function scrapeFDAAcceleratedApprovals(baseUrl) {
  console.log(`Scraping ${baseUrl}...`);

  try {
    const { data } = await axios.get(baseUrl, {
      headers: HEADERS,
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    const records = [];

    $("tbody tr").each((i, row) => {
      const cols = $(row).find("td");

      if (cols.length >= 4) {
        // Drug name (first column)
        let drugName = $(cols[0]).text().trim();
        const cleanName = drugName.includes("(")
          ? drugName.split("(")[0].trim()
          : drugName;

        // AA Indication (second column) - contains link and description
        const indicationCell = $(cols[1]);
        const linkTag = indicationCell.find("a[href]");
        let fullUrl = null;
        let description = "";

        if (linkTag.length > 0) {
          const url = linkTag.attr("href");
          fullUrl = url.startsWith("/") ? `https://www.fda.gov${url}` : url;
          description = linkTag.text().trim();
        } else {
          description = indicationCell.text().trim();
        }

        // AA Date (third column)
        const aaDate = $(cols[2]).text().trim();

        // AA Post-Marketing (fourth column)
        const postMarketing = $(cols[3]).text().trim();

        // Combine description with post-marketing info if available
        const fullDescription =
          postMarketing && postMarketing !== "..."
            ? `${description}. Post-marketing: ${postMarketing}`
            : description;

        records.push({
          DrugName: cleanName,
          Title: cleanName,
          Description: fullDescription,
          URL: fullUrl,
          PublishedDate: parseDate(aaDate),
          DataSource: "FDA-Ongoing | Cancer Accelerated Approvals",
        });
      }
    });

    console.log(`Scraped ${records.length} accelerated approval records`);
    return records;
  } catch (error) {
    console.error(
      "❌ Scraper error for FDA Accelerated Approvals:",
      error.response?.status,
      error.response?.statusText || error.message
    );
    return [];
  }
}

// Scraper 3: FDA Oncology Approvals
async function scrapeFDAApprovals(baseUrl) {
  console.log(`Scraping ${baseUrl}...`);

  try {
    const { data } = await axios.get(baseUrl, {
      headers: HEADERS,
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    const records = [];

    $("tbody tr").each((i, row) => {
      const cols = $(row).find("td");

      if (cols.length >= 3) {
        // Drug name and link (first column)
        const linkTag = $(cols[0]).find("a[href]");
        let fullUrl = null;
        let drugName = "";

        if (linkTag.length > 0) {
          const url = linkTag.attr("href");
          fullUrl = url.startsWith("/") ? `${baseUrl}${url}` : url;
          drugName = linkTag.text().trim();
        } else {
          drugName = $(cols[0]).text().trim();
        }

        // Description (second column)
        const description = $(cols[1]).text().trim();

        // Approval date (third column)
        const approvalDate = $(cols[2]).text().trim();

        records.push({
          DrugName: drugName,
          Title: drugName,
          Description: description,
          URL: fullUrl,
          PublishedDate: parseDate(approvalDate),
          DataSource:
            "FDA Oncology (Cancer)/Hematologic Malignancies Approval Notifications",
        });
      }
    });

    console.log(`Scraped ${records.length} approval records`);
    return records;
  } catch (error) {
    console.error(
      "❌ Scraper error for FDA Approvals:",
      error.response?.status,
      error.response?.statusText || error.message
    );
    return [];
  }
}

// Main scraping function
async function scrapeAllFDA() {
  let client;

  try {
    // Connect to MongoDB
    client = await connectToMongoDB();

    // URLs to scrape
    const urls = {
      withdrawals:
        "https://www.fda.gov/drugs/resources-information-approved-drugs/withdrawn-cancer-accelerated-approvals",
      accelerated:
        "https://www.fda.gov/drugs/resources-information-approved-drugs/ongoing-cancer-accelerated-approvals",
      approvals:
        "https://www.fda.gov/drugs/resources-information-approved-drugs/oncology-cancerhematologic-malignancies-approval-notifications",
    };

    // Scrape all sources
    console.log("Starting FDA scraping process...\n");

    const [withdrawalRecords, acceleratedRecords, approvalRecords] =
      await Promise.all([
        scrapeWithdrawalsFDA(urls.withdrawals),
        scrapeFDAAcceleratedApprovals(urls.accelerated),
        scrapeFDAApprovals(urls.approvals),
      ]);

    // Combine all records
    const allRecords = [
      ...withdrawalRecords,
      ...acceleratedRecords,
      ...approvalRecords,
    ];
    console.log(`\nTotal records scraped: ${allRecords.length}`);

    // Insert unique records to MongoDB
    if (allRecords.length > 0) {
      const insertedCount = await insertUniqueRecords(client, allRecords);
      console.log(`Inserted ${insertedCount} new unique records to MongoDB`);
      console.log(
        `Skipped ${allRecords.length - insertedCount} duplicate records`
      );
    } else {
      console.log("No records to insert");
    }

    // Display sample records
    if (allRecords.length > 0) {
      console.log("\nSample records:");
      console.log(JSON.stringify(allRecords.slice(0, 3), null, 2));
    }
  } catch (error) {
    console.error("❌ Main scraper error:", error.message);
  } finally {
    // Close MongoDB connection
    if (client) {
      await client.close();
      console.log("MongoDB connection closed");
    }
  }
}

// Execute the scraper
scrapeAllFDA();
