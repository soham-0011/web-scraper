const axios = require("axios");
const cheerio = require("cheerio");
const { MongoClient } = require("mongodb");
const sendEmailNotification = require("./services/sendemailSES");
const MONGODB_URI = "mongodb+srv://sushma:sushma@cluster0.nkl89.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";  
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


function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === "") return null;

  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    console.warn(`Could not parse date: ${dateStr}`);
    return null;
  }
}

function filterRecentRecords(records, daysBack = 500000) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  return records.filter(record => {
    if (!record.date || record.date < cutoffDate) {
      return false;
    }
    return true;
  });
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
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 245);
  for (const record of records) {
    try {
      if (!record.date || record.date < cutoffDate) {
        continue;
      }
      const existingRecord = await collection.findOne({
        $or: [
          { $and: [{ link: record.link }, { link: { $ne: null } }] },
          { title: record.title, DataSource: record.DataSource },
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
  console.log(`Scraping ${baseUrl}`);
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
          title: drugName,
          date: parseDate(withdrawalDate),
          description: title,
          link: fullUrl,
          DataSource: "FDA Withdrawals",
          genes_identified:[],
          drugs_identified:[drugName],
          is_india: "",
          is_conference:"",
          status:0,
          created_at: new Date(),
          updated_at: new Date(),
          activeOn : null
        });
      }
    });
    return records;
  } catch (error) {
    console.error(
      "Scraper error for FDA Withdrawals:",
      error.response?.status,
      error.response?.statusText || error.message
    );
    return [];
  }
}

// Scraper 2: FDA Ongoing Cancer Accelerated Approvals
async function scrapeFDAAcceleratedApprovals(baseUrl) {
  console.log(`Scraping ${baseUrl}`);

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
        const indicationCell = $(cols[1]);
        const linkTag = indicationCell.find("a[href]");
        let fullUrl = null;
        let description = "";
        let title = "";
        if (linkTag.length > 0) {
          const url = linkTag.attr("href");
          fullUrl = url.startsWith("/") ? `https://www.fda.gov${url}` : url;
          title = linkTag.attr("title")?.trim() || linkTag.text().trim();
          description = linkTag.text().trim();
        } else {
          description = indicationCell.text().trim();
        }
        const aaDate = $(cols[2]).text().trim();
        const postMarketing = $(cols[3]).text().trim();
        const fullDescription =
          postMarketing && postMarketing !== "..."
            ? `${description}. Post-marketing: ${postMarketing}`
            : description;
        records.push({
          title: title,
          date: parseDate(aaDate),
          description: fullDescription,
          link: fullUrl,
          DataSource: "FDA-Ongoing | Cancer Accelerated Approvals",
          genes_identified:[],
          drugs_identified:[cleanName],
          is_india: "",
          is_conference:"",
          status:0,
          created_at: new Date(),
          updated_at: new Date(),
          activeOn : null
        });
      }
    });
    return records;
  } catch (error) {
    console.error(
      "Scraper error for FDA Accelerated Approvals:",
      error.response?.status,
      error.response?.statusText || error.message
    );
    return [];
  }
}
async function scrapeFDAApprovals(baseUrl) {
  console.log(`Scraping ${baseUrl}`);

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
        const linkTag = $(cols[0]).find("a[href]");
        let fullUrl = null;
        let drugName = "";
        let title = "";
        if (linkTag.length > 0) {
          const url = linkTag.attr("href");
          fullUrl = url.startsWith("/") ? `${baseUrl}${url}` : url;
          drugName = linkTag.text().trim();
          title = linkTag.attr("title")?.trim() || linkTag.text().trim();
        } else {
          drugName = $(cols[0]).text().trim();
        }
        const description = $(cols[1]).text().trim();
        const approvalDate = $(cols[2]).text().trim();
        records.push({
          title: title,
          date: parseDate(approvalDate),
          description: description,
          link: fullUrl,
          DataSource: "FDA Oncology (Cancer)/Hematologic Malignancies Approval Notifications",
          genes_identified:[],
          drugs_identified:[drugName],
          is_india: "",
          is_conference:"",
          status:0,
          created_at: new Date(),
          updated_at: new Date(),
          activeOn : null
        });
      }
    });
    return records;
  } catch (error) {
    console.error(
      "Scraper error for FDA Approvals:",
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
    client = await connectToMongoDB();
    const urls = {
      withdrawals:
        "https://www.fda.gov/drugs/resources-information-approved-drugs/withdrawn-cancer-accelerated-approvals",
      accelerated:
        "https://www.fda.gov/drugs/resources-information-approved-drugs/ongoing-cancer-accelerated-approvals",
      approvals:
        "https://www.fda.gov/drugs/resources-information-approved-drugs/oncology-cancerhematologic-malignancies-approval-notifications",
    };
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
    const recentRecords = filterRecentRecords(allRecords, 500000);
    let insertedCount = 0;
    if (allRecords.length > 0) {
      insertedCount = await insertUniqueRecords(client, recentRecords);
    } else {
      console.log("No records to insert");
    }
     if (insertedCount > 0) {
        await sendEmailNotification(
          "FDA Scraper Update",
          `Updates regarding this FDA`
        );
      }
  } catch (error) {
    console.error("Main scraper error:", error.message);
  } finally {
    if (client) {
      await client.close();
      console.log("MongoDB connection closed");
    }
  }
}

scrapeAllFDA();
