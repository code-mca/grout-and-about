/* ==========================================================
   Grout & About: enquiry emails
   Receives the Contact us form, saves it to the Enquiries sheet,
   saves any photos or videos to Drive, and emails a PDF summary
   to the customer and to the business.
   ========================================================== */

// The prices, the same as the Prices & Areas calculator
const FIRST_HOUR = 85;
const PER_HALF_HOUR = 40;

const AREAS = {
  local: { name: "local", travel: 0 },
  near: { name: "up to 20 mins away", travel: 30 },
  far: { name: "further out", travel: 50 },
};

const TIMES = { 60: "1 hr", 90: "1½ hrs", 120: "2 hrs", 180: "3 hrs" };

const JOB_TYPES = {
  "small-repair": "Small repair",
  "bathroom-refresh": "Bathroom refresh",
  "bathroom-install": "Full bathroom installation",
  "radiator-repairs": "Radiator repair or replacement",
  "new-radiators": "New radiators",
  other: "Other",
};

// Limits: stop one person, or a bot, filling your inbox or your Drive
const MAX_PER_DAY = 3; // enquiries from one email address in 24 hours
const MAX_FILES = 6;
const MAX_UPLOAD_MB = 25; // all the files together, after the browser has shrunk the photos

/* ----------------------------------------------------------
   The web app: the site sends the form here
   ---------------------------------------------------------- */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Honeypot: people never see this field, so anything in it came from a bot.
    // Say "ok" so the bot moves on, but send nothing.
    if (data.website) {
      return reply_({ ok: true });
    }

    const enquiry = clean_(data);
    const problems = check_(enquiry);
    if (problems.length) {
      return reply_({ ok: false, message: "Please check: " + problems.join(", ") + "." });
    }

    const sheet = SpreadsheetApp.openById(setting_("SHEET_ID")).getSheetByName("Enquiries");
    if (countRecent_(sheet, enquiry.email) >= MAX_PER_DAY) {
      return reply_({
        ok: false,
        message:
          "You've already sent us a few enquiries today. We'll be in touch soon.",
      });
    }

    enquiry.received = new Date();
    enquiry.reference = makeReference_(enquiry.received);
    enquiry.estimate = workOutEstimate_(enquiry.area, enquiry.minutes);
    enquiry.location = lookUpPostcode_(enquiry.postcode);
    enquiry.folder = saveFiles_(enquiry);

    // Two emails each time, so check there's room in today's allowance first
    const canEmail = MailApp.getRemainingDailyQuota() >= 2;
    sheet.appendRow(toRow_(enquiry, canEmail ? "Emailed" : "Not emailed: daily limit reached"));

    if (canEmail) {
      const pdf = makePdf_(enquiry);
      sendBusinessEmail_(enquiry, pdf);
      sendCustomerEmail_(enquiry, pdf);
    }

    return reply_({ ok: true, reference: enquiry.reference });
  } catch (error) {
    console.error(error);
    return reply_({ ok: false, message: "Something went wrong on our side." });
  }
}

// Change this each time you paste in new code, then deploy a New version.
// Opening the /exec address in a browser shows it, so you can see which version the site is using.
const VERSION = "21 November 2026, 02:00";

// Opening the web app URL in a browser shows this, so you can check it's live
function doGet() {
  return ContentService.createTextOutput(`Grout & About enquiries: working. Version: ${VERSION}`);
}

// Run this from the editor to test without the site. You get both emails.
function testEnquiry() {
  const fakeRequest = {
    postData: {
      contents: JSON.stringify({
        name: "Test Person",
        email: setting_("BUSINESS_EMAIL"),
        phone: "07700 900123",
        postcode: "E8 4DA",
        "job-type": "small-repair",
        description: "Dripping tap in the bathroom.\nStarted last week.",
        area: "near",
        minutes: "90",
        files: [],
      }),
    },
  };
  console.log(doPost(fakeRequest).getContent());
}

/* ----------------------------------------------------------
   Checking what came in
   ---------------------------------------------------------- */

// Trim every field and cut it to a sensible length
function clean_(data) {
  const text = (value, max) =>
    String(value || "")
      .trim()
      .slice(0, max);
  return {
    name: text(data.name, 100),
    email: text(data.email, 200).toLowerCase(),
    phone: text(data.phone, 30),
    postcode: text(data.postcode, 10).toUpperCase(),
    jobType: text(data["job-type"], 40),
    description: text(data.description, 3000),
    area: text(data.area, 10),
    minutes: text(data.minutes, 3),
    media: cleanMedia_(data.files),
  };
}

// Keep only photos and videos sent as plain base64 text, each with a short comment
function cleanMedia_(files) {
  const base64 = /^[A-Za-z0-9+/=]+$/; // only the characters base64 uses, so nothing can break the HTML
  return (Array.isArray(files) ? files : [])
    .filter(
      (file) =>
        /^(image|video)\/[a-z0-9.+-]+$/.test(file.type) &&
        base64.test(file.data) &&
        (!file.still || base64.test(file.still)),
    )
    .map((file) => ({
      name: String(file.name || "file").slice(0, 100),
      type: file.type,
      data: String(file.data),
      still: String(file.still || ""),
      caption: String(file.caption || "")
        .trim()
        .slice(0, 100),
    }));
}

// The browser already checked these, but anyone can send to the URL without the form
function check_(enquiry) {
  const problems = [];
  if (!enquiry.name) problems.push("your name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enquiry.email)) problems.push("your email");
  if (!/^[0-9+()\s-]{7,30}$/.test(enquiry.phone)) problems.push("your phone number");
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/.test(enquiry.postcode))
    problems.push("your postcode");
  if (!isOneOf_(JOB_TYPES, enquiry.jobType)) problems.push("the job type");
  if (!enquiry.description) problems.push("the job description");

  const media = enquiry.media;
  const bytes = media.reduce(
    (total, file) => total + (file.data.length + file.still.length) * 0.75,
    0,
  );
  if (media.length > MAX_FILES) problems.push(`up to ${MAX_FILES} files`);
  if (bytes > MAX_UPLOAD_MB * 1024 * 1024) problems.push(`files up to ${MAX_UPLOAD_MB}MB in total`);
  return problems;
}

// How many enquiries this email address has sent in the last 24 hours
function countRecent_(sheet, email) {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const rows = sheet.getDataRange().getValues().slice(1); // skip the header row
  return rows.filter((row) => new Date(row[0]).getTime() > dayAgo && row[3] === email).length;
}

/* ----------------------------------------------------------
   Working things out
   ---------------------------------------------------------- */

// Worked out again here, never taken from the page: anyone can edit a page
function workOutEstimate_(area, minutes) {
  if (!isOneOf_(AREAS, area) || !isOneOf_(TIMES, minutes)) return null;
  const extra = ((Number(minutes) - 60) / 30) * PER_HALF_HOUR;
  const travel = AREAS[area].travel;
  return {
    total: FIRST_HOUR + extra + travel,
    area: AREAS[area].name,
    time: TIMES[minutes],
    // Each line as the calculator shows it, so everyone sees the same sum
    lines: [
      `£${FIRST_HOUR} first hour`,
      extra ? `£${extra} extra time` : "no extra time",
      travel ? `£${travel} travel` : "travel included",
      "parts at cost",
    ].join(", "),
  };
}

// True only for a key we wrote, like "near". Plain AREAS[area] would also accept
// names every object has, like "toString" or "__proto__", from an edited address.
function isOneOf_(list, key) {
  return Object.keys(list).includes(key);
}

// The calculator estimate as three table rows: where, how long and the price they saw
function estimateRows_(estimate, noEstimate) {
  if (!estimate) return row_("Estimate", noEstimate);
  const where = estimate.area.charAt(0).toUpperCase() + estimate.area.slice(1);
  return (
    row_("Travel zone", where) +
    row_("Job length", `About ${estimate.time}`) +
    row_("Estimate", `<strong>£${estimate.total} + parts</strong><br>${estimate.lines}`)
  );
}

// Ward and borough from postcodes.io (free, no key needed). If it's down, carry on without.
function lookUpPostcode_(postcode) {
  try {
    const url = "https://api.postcodes.io/postcodes/" + encodeURIComponent(postcode);
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return null;
    const result = JSON.parse(response.getContentText()).result;
    return { ward: result.admin_ward, borough: result.admin_district };
  } catch (error) {
    return null;
  }
}

// A short reference people can quote, like GA-1119-1432
function makeReference_(date) {
  return "GA-" + Utilities.formatDate(date, "Europe/London", "MMdd-HHmm");
}

/* ----------------------------------------------------------
   Saving
   ---------------------------------------------------------- */

// Each enquiry's files go in their own folder inside your uploads folder,
// with each comment saved as the file's description
function saveFiles_(enquiry) {
  if (!enquiry.media.length) return null;

  const uploads = DriveApp.getFolderById(setting_("UPLOAD_FOLDER_ID"));
  const folder = uploads.createFolder(`${enquiry.reference} ${enquiry.name}`);
  enquiry.media.forEach((item) => {
    const bytes = Utilities.base64Decode(item.data);
    folder.createFile(Utilities.newBlob(bytes, item.type, item.name)).setDescription(item.caption);
  });
  return { url: folder.getUrl(), count: enquiry.media.length };
}

// One row per enquiry, in the same order as the sheet's headings
// Sheets reads anything starting with = + - or @ as a formula or a number, so a phone number
// like +447700900123 loses its +, 07700900123 loses its 0, and a description starting with =
// could run as a formula. A ' in front makes Sheets keep it as text (the ' doesn't show).
function asText_(value) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function toRow_(enquiry, status) {
  return [
    enquiry.received,
    enquiry.reference,
    asText_(enquiry.name),
    asText_(enquiry.email),
    `'${enquiry.phone}`, // always text, so no 0 or + goes missing
    enquiry.postcode,
    enquiry.location ? enquiry.location.ward : "",
    enquiry.location ? enquiry.location.borough : "",
    JOB_TYPES[enquiry.jobType],
    asText_(enquiry.description),
    enquiry.estimate ? enquiry.estimate.area : "",
    enquiry.estimate ? enquiry.estimate.time : "",
    enquiry.estimate ? enquiry.estimate.total : "",
    enquiry.folder ? enquiry.folder.url : "",
    status,
  ];
}

/* ----------------------------------------------------------
   The PDF and the two emails
   ---------------------------------------------------------- */

// Anything a visitor typed goes through this before it goes into HTML,
// so nobody can add their own links or code to an email sent from your address
function escape_(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

function row_(label, value) {
  return (
    `<tr><th style="text-align:left;padding:6px 12px 6px 0;vertical-align:top;">${label}</th>` +
    `<td style="padding:6px 0;">${value}</td></tr>`
  );
}

// The summary both people get as a PDF
function summaryHtml_(enquiry) {
  const when = Utilities.formatDate(enquiry.received, "Europe/London", "d MMMM yyyy, HH:mm");
  const files = enquiry.media.length ? `${enquiry.media.length}, shown below` : "None";

  return `
    <div style="font-family:Arial,sans-serif;color:#2B1840;font-size:14px;">
      <h1 style="font-size:22px;margin:0 0 4px;">Grout &amp; About: your enquiry</h1>
      <p style="margin:0 0 16px;">Reference ${enquiry.reference} · ${when}</p>
      <table style="border-collapse:collapse;color:#2B1840;">
        ${row_("Name", escape_(enquiry.name))}
        ${row_("Email", escape_(enquiry.email))}
        ${row_("Phone", escape_(enquiry.phone))}
        ${row_("Postcode", escape_(enquiry.postcode))}
        ${row_("Job type", JOB_TYPES[enquiry.jobType])}
        ${row_("Description", escape_(enquiry.description))}
        ${estimateRows_(enquiry.estimate, "Not worked out on the site")}
        ${row_("Photos and videos", files)}
      </table>
      ${mediaHtml_(enquiry.media)}
    </div>`;
}

// Each photo, or a still from each video, with its comment underneath
function mediaHtml_(media) {
  if (!media.length) return "";
  const items = media.map((item, index) => {
    const isVideo = item.type.startsWith("video/");
    const label = `${isVideo ? "Video" : "Photo"} ${index + 1}`;
    const caption = item.caption ? `: ${escape_(item.caption)}` : "";
    const picture = isVideo ? item.still : item.data;
    const image = picture
      ? `<img src="data:${isVideo ? "image/jpeg" : item.type};base64,${picture}" width="320" alt="">`
      : `<p style="margin:0;">No preview for this video.</p>`;
    return `
      <div style="margin:0 0 20px;page-break-inside:avoid;">
        ${image}
        <p style="margin:6px 0 0;"><strong>${label}</strong>${caption}</p>
      </div>`;
  });
  return `<h2 style="font-size:18px;margin:24px 0 12px;">Photos and videos</h2>${items.join("")}`;
}

function makePdf_(enquiry) {
  const html = summaryHtml_(enquiry);
  return Utilities.newBlob(html, MimeType.HTML, "enquiry.html")
    .getAs(MimeType.PDF)
    .setName(`Grout and About enquiry ${enquiry.reference}.pdf`);
}

// Yours: the things you need to plan the job, first
function sendBusinessEmail_(enquiry, pdf) {
  const place = enquiry.location
    ? `${escape_(enquiry.location.ward)}, ${escape_(enquiry.location.borough)}`
    : "Not found: check the postcode";
  const map =
    "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(enquiry.postcode);
  const files = enquiry.folder
    ? `<a href="${enquiry.folder.url}">${enquiry.folder.count} in Drive</a>`
    : "None";

  const html = `
    <div style="font-family:Arial,sans-serif;color:#2B1840;font-size:15px;">
      <p style="margin:0 0 12px;"><strong>${JOB_TYPES[enquiry.jobType]}</strong> in ${place}</p>
      <table style="border-collapse:collapse;color:#2B1840;">
        ${row_("Postcode", `${escape_(enquiry.postcode)} · <a href="${map}">map</a>`)}
        ${estimateRows_(enquiry.estimate, "They didn't use the calculator")}
        ${row_("Photos and videos", files)}
        ${row_("Name", escape_(enquiry.name))}
        ${row_("Phone", `<a href="tel:${escape_(enquiry.phone)}">${escape_(enquiry.phone)}</a>`)}
        ${row_("Email", escape_(enquiry.email))}
        ${row_("Description", escape_(enquiry.description))}
      </table>
      <p style="margin:16px 0 0;">Reply to this email to answer them. Reference ${enquiry.reference}.</p>
    </div>`;

  MailApp.sendEmail({
    to: setting_("BUSINESS_EMAIL"),
    replyTo: enquiry.email,
    name: "Grout & About website",
    subject: `New enquiry: ${JOB_TYPES[enquiry.jobType]} in ${enquiry.postcode}`,
    htmlBody: html,
    attachments: [pdf],
  });
}

// Theirs: friendly, in the same voice as the site
function sendCustomerEmail_(enquiry, pdf) {
  const greeting = greetingName_(enquiry.name);
  const estimate = enquiry.estimate
    ? `<p>Here's the estimate you worked out on our calculator:</p>
      <table style="border-collapse:collapse;color:#2B1840;margin:0 0 16px;">
        ${estimateRows_(enquiry.estimate)}
      </table>
      <p>We'll confirm the price once we've had a look at what's involved.</p>`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;color:#2B1840;font-size:15px;line-height:1.5;">
      <p>Hi ${escape_(greeting)},</p>
      <p>Thanks for getting in touch. We've got your enquiry and we'll be back to you within one working day with a time and a clear price. No drips, no drama.</p>
      ${estimate}
      <p>We've attached a copy of what you sent, so you've got it for your records.</p>
      <p>An enquiry isn't a confirmed appointment: we'll agree a time with you first. If anything changes in the meantime, just reply to this email.</p>
      <p>Speak soon,<br>Grout &amp; About<br>Hackney, London</p>
    </div>`;

  MailApp.sendEmail({
    to: enquiry.email,
    replyTo: setting_("BUSINESS_EMAIL"),
    name: "Grout & About",
    subject: `Thanks, ${greeting}: we've got your enquiry`,
    htmlBody: html,
    attachments: [pdf],
  });
}

/* ----------------------------------------------------------
   Small helpers
   ---------------------------------------------------------- */

// What to call them in the email: "Sam" for "Sam Jones", "Mr Smith" for "Mr J Smith",
// and the full name for "J Smith", because "Hi J" reads oddly
function greetingName_(name) {
  const titles = ["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir", "dame", "rev"];
  const words = String(name).split(/\s+/).filter(Boolean);
  const first = (words[0] || "").replace(/\.$/, ""); // "Dr." counts as "Dr"

  if (titles.includes(first.toLowerCase())) {
    return words.length > 1 ? `${first} ${words[words.length - 1]}` : first;
  }
  if (first.length === 1) return words.join(" ");
  return first;
}

// Settings live in Project Settings > Script properties, not in the code
function setting_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error(`Missing script property: ${key}`);
  return value;
}

// Every answer to the site is a little JSON object
function reply_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
