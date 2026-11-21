// Runs Code.gs in Node with stand-in Google services, to test its logic: node apps-script/tests.js
const fs = require('fs');
const vm = require('vm');

function makeWorld(opts = {}) {
  const sent = [];
  const rows = [['Received', 'Reference', 'Name', 'Email']];
  (opts.existingRows || []).forEach((r) => rows.push(r));
  const created = { folders: [], files: [] };
  const world = {
    console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => ({ SHEET_ID: 'sheet123', UPLOAD_FOLDER_ID: 'folder123', BUSINESS_EMAIL: 'owner@example.com' })[k] || null,
      }),
    },
    SpreadsheetApp: {
      openById: (id) => ({
        getSheetByName: (name) => ({
          getDataRange: () => ({ getValues: () => rows }),
          appendRow: (r) => rows.push(r),
        }),
      }),
    },
    MailApp: {
      getRemainingDailyQuota: () => (opts.quota === undefined ? 100 : opts.quota),
      sendEmail: (msg) => sent.push(msg),
    },
    UrlFetchApp: {
      fetch: (url) => {
        if (opts.postcodeDown) throw new Error('network');
        const ok = url.includes('E8%204DA') || url.includes('E84DA');
        return {
          getResponseCode: () => (ok ? 200 : 404),
          getContentText: () => JSON.stringify({ status: 200, result: { admin_ward: 'Hackney Downs', admin_district: 'Hackney' } }),
        };
      },
    },
    DriveApp: {
      getFolderById: () => ({
        createFolder: (name) => {
          created.folders.push(name);
          return {
            createFile: (blob) => {
              created.files.push(blob);
              return { setDescription: (d) => { blob.description = d; } };
            },
            getUrl: () => 'https://drive.google.com/drive/folders/abc',
          };
        },
      }),
    },
    Utilities: {
      formatDate: (d, tz, fmt) => (fmt === 'MMdd-HHmm' ? '1119-2330' : '19 November 2026, 23:30'),
      base64Decode: (s) => Buffer.from(s, 'base64'),
      newBlob: (data, type, name) => ({
        data, type, name,
        getAs: (t) => ({ pdfFrom: String(data), type: t, setName(n) { this.name = n; return this; } }),
      }),
    },
    MimeType: { HTML: 'text/html', PDF: 'application/pdf' },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; }, getContent() { return this.text; } }),
    },
  };
  vm.createContext(world);
  vm.runInContext(fs.readFileSync(__dirname + '/Code.gs', 'utf8'), world);
  return { world, sent, rows, created };
}

const good = {
  name: 'Sam Jones', email: 'Sam@Example.com', phone: '07700 900123', postcode: 'e8 4da',
  'job-type': 'small-repair', description: 'Tap <b>drips</b>\nall night', area: 'near', minutes: '90', files: [],
};
const post = (w, body) => JSON.parse(w.world.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
let fails = 0;
const expect = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fails++; };

// 1. Good enquiry
let w = makeWorld();
let r = post(w, good);
expect('good: ok', r.ok === true && r.reference === 'GA-1119-2330');
expect('good: two emails', w.sent.length === 2);
expect('good: business email to the owner, reply-to customer', w.sent[0].to === 'owner@example.com' && w.sent[0].replyTo === 'sam@example.com');
expect('good: customer email replies to the owner', w.sent[1].to === 'sam@example.com' && w.sent[1].replyTo === 'owner@example.com');
expect('good: estimate 85+40+30=155', w.sent[0].htmlBody.includes('£155 + parts'));
expect('good: ward in business email', w.sent[0].htmlBody.includes('Hackney Downs, Hackney'));
expect('good: HTML escaped', w.sent[0].htmlBody.includes('Tap &lt;b&gt;drips&lt;/b&gt;<br>all night') && !w.sent[0].htmlBody.includes('<b>drips'));
expect('good: pdf attached', w.sent[0].attachments[0].type === 'application/pdf' && /enquiry GA-1119-2330\.pdf$/.test(w.sent[0].attachments[0].name));
expect('good: customer first name', w.sent[1].subject === "Thanks, Sam: we've got your enquiry");
// Greeting: titles and initials
for (const [name, want] of [
  ['Sam Jones', 'Sam'], ['Mr J Smith', 'Mr Smith'], ['Dr. Ana Lee', 'Dr Lee'], ['mrs smith', 'mrs smith'],
  ['J Smith', 'J Smith'], ['Mr', 'Mr'], ['Priya', 'Priya'], ['  Sam   Jones ', 'Sam'],
]) {
  const gw = makeWorld(); post(gw, { ...good, name, email: `t${Math.random()}@example.com` });
  expect(`greeting: "${name}" -> "${want}"`, gw.sent[1] && gw.sent[1].subject === `Thanks, ${want}: we've got your enquiry` && gw.sent[1].htmlBody.includes(`Hi ${want},`));
}
expect('good: row logged with status', w.rows.length === 2 && w.rows[1][14] === 'Emailed' && w.rows[1][5] === 'E8 4DA');

// 2. Honeypot
w = makeWorld(); r = post(w, { ...good, website: 'http://spam' });
expect('honeypot: says ok, sends nothing, logs nothing', r.ok === true && w.sent.length === 0 && w.rows.length === 1);

// 3. Bad fields
w = makeWorld(); r = post(w, { ...good, email: 'nope', postcode: 'hello', 'job-type': 'boiler' });
expect('bad fields: listed', r.ok === false && /your email, your postcode, the job type/.test(r.message) && w.sent.length === 0);

// 4. Rate cap
const recent = new Date();
w = makeWorld({ existingRows: [[recent, 'x', 'Sam', 'sam@example.com'], [recent, 'y', 'Sam', 'sam@example.com'], [recent, 'z', 'Sam', 'sam@example.com']] });
r = post(w, good);
expect('cap: 4th in a day refused', r.ok === false && /already sent/.test(r.message) && w.sent.length === 0);
const old = new Date(Date.now() - 25 * 3600 * 1000);
w = makeWorld({ existingRows: [[old, 'x', 'Sam', 'sam@example.com'], [old, 'y', 'Sam', 'sam@example.com'], [old, 'z', 'Sam', 'sam@example.com']] });
expect('cap: older than 24h ignored', post(w, good).ok === true);

// 5. Quota low
w = makeWorld({ quota: 1 }); r = post(w, good);
expect('quota: logged, not emailed, still ok', r.ok === true && w.sent.length === 0 && /daily limit/.test(w.rows[1][14]));

// 6. No estimate / tampered estimate
w = makeWorld(); post(w, { ...good, area: 'moon', minutes: '999' });
expect('estimate: tampered values ignored', w.sent[0].htmlBody.includes("didn't use the calculator") && w.sent[1].htmlBody.indexOf('calculator') === -1);

// 6b. The calculator estimate in full: travel zone, job length and the price they saw, in all three
const estimateCases = [
  ['near', '90', ['Up to 20 mins away', 'About 1½ hrs', '£155 + parts', '£85 first hour, £40 extra time, £30 travel, parts at cost'], ['up to 20 mins away', '1½ hrs', 155]],
  ['local', '60', ['Local', 'About 1 hr', '£85 + parts', '£85 first hour, no extra time, travel included, parts at cost'], ['local', '1 hr', 85]],
  ['far', '180', ['Further out', 'About 3 hrs', '£295 + parts', '£85 first hour, £160 extra time, £50 travel, parts at cost'], ['further out', '3 hrs', 295]],
];
for (const [area, minutes, shown, logged] of estimateCases) {
  const ew = makeWorld();
  post(ew, { ...good, area, minutes });
  const [biz, cust] = ew.sent;
  const pdf = biz.attachments[0].pdfFrom;
  const inAll = shown.every((bit) => biz.htmlBody.includes(bit) && cust.htmlBody.includes(bit) && pdf.includes(bit));
  expect(`estimate ${area}/${minutes}: zone, length and price in both emails and the PDF`, inAll && biz.htmlBody.includes('Travel zone') && cust.htmlBody.includes('Job length'));
  expect(`estimate ${area}/${minutes}: sheet columns`, JSON.stringify(ew.rows[1].slice(10, 13)) === JSON.stringify(logged));
}
w = makeWorld(); post(w, { ...good, area: '', minutes: '' });
expect('estimate: none sent says so in both, PDF too', w.sent[0].htmlBody.includes("They didn't use the calculator") && !w.sent[0].htmlBody.includes('Travel zone') && !w.sent[1].htmlBody.includes('estimate you worked out') && w.sent[0].attachments[0].pdfFrom.includes('Not worked out on the site'));
w = makeWorld(); post(w, { ...good, area: 'near', minutes: '90<script>' });
expect('estimate: an edited address gives no estimate and nothing from the address in the email', w.sent[0].htmlBody.includes("They didn't use the calculator") && !w.sent[0].htmlBody.includes('<script>'));

for (const [area, minutes, job] of [['__proto__', '90', 'small-repair'], ['toString', 'constructor', 'small-repair']]) {
  const pw = makeWorld(); const pr = post(pw, { ...good, area, minutes, 'job-type': job });
  expect(`estimate: built-in object names (${area}/${minutes}) give no estimate, enquiry still sent`, pr.ok === true && pw.sent.length === 2 && pw.sent[0].htmlBody.includes("They didn't use the calculator"));
}
w = makeWorld(); r = post(w, { ...good, 'job-type': '__proto__' });
expect('job type: built-in object name refused', r.ok === false && /the job type/.test(r.message));

// 6c. The appointment line is for the customer only: in their email, not in the business email or the PDF
w = makeWorld(); post(w, good);
expect('appointment line: customer email only', w.sent[1].htmlBody.includes("isn't a confirmed appointment") && !w.sent[0].htmlBody.includes('appointment') && !w.sent[0].attachments[0].pdfFrom.includes('appointment'));

// 6d. The sheet keeps phone numbers and anything starting with = + - @ as text
w = makeWorld(); post(w, { ...good, phone: '+447700900123', description: '=HYPERLINK("http://x.example","click")', name: '-Sam' });
expect('sheet: phone with + kept as text', w.rows[1][4] === "'+447700900123");
expect('sheet: description starting with = kept as text, not a formula', w.rows[1][9] === `'=HYPERLINK("http://x.example","click")`);
expect('sheet: name starting with - kept as text', w.rows[1][2] === "'-Sam");
w = makeWorld(); post(w, { ...good, phone: '07700900123' });
expect('sheet: phone starting with 0 kept as text, ordinary text unchanged', w.rows[1][4] === "'07700900123" && w.rows[1][2] === 'Sam Jones' && w.rows[1][9] === good.description.trim());

// 7. Postcode lookup down
w = makeWorld({ postcodeDown: true }); r = post(w, good);
expect('postcode service down: still ok', r.ok === true && w.sent[0].htmlBody.includes('Not found: check the postcode'));

// 8. Files
const img = Buffer.from('fake-image-bytes').toString('base64');
const still = Buffer.from('fake-still').toString('base64');
w = makeWorld(); r = post(w, { ...good, files: [
  { name: 'tap.jpg', type: 'image/jpeg', data: img, caption: '  Drip under the <sink>  ' },
  { name: 'virus.exe', type: 'application/x-msdownload', data: img, caption: 'x' },
  { name: 'leak.mov', type: 'video/quicktime', data: img, still, caption: 'Water on the floor' },
  { name: 'bad.jpg', type: 'image/jpeg', data: 'abc"><script>', caption: 'x' },
  { name: 'odd.jpg', type: 'image/jpeg" onerror="x', data: img, caption: 'x' },
] });
expect('files: image and video saved, exe and tampered ones skipped', r.ok && w.created.files.length === 2 && w.created.files[0].name === 'tap.jpg' && w.created.files[1].name === 'leak.mov' && w.created.folders[0] === 'GA-1119-2330 Sam Jones');
expect('files: comments trimmed and saved as descriptions', w.created.files[0].description === 'Drip under the <sink>' && w.created.files[1].description === 'Water on the floor');
expect('files: link in business email', w.sent[0].htmlBody.includes('2 in Drive'));
const pdf = w.sent[0].attachments[0].pdfFrom;
expect('pdf: photo embedded', pdf.includes(`src="data:image/jpeg;base64,${img}"`));
expect('pdf: video still embedded, not the video', pdf.includes(`src="data:image/jpeg;base64,${still}"`) && pdf.split('data:').length === 3);
expect('pdf: comments escaped and labelled', pdf.includes('<strong>Photo 1</strong>: Drip under the &lt;sink&gt;') && pdf.includes('<strong>Video 2</strong>: Water on the floor'));
expect('pdf: count row', pdf.includes('2, shown below'));
w = makeWorld(); r = post(w, { ...good, files: [{ name: 'clip.mp4', type: 'video/mp4', data: img, caption: '' }] });
expect('pdf: video with no still says so', w.sent[0].attachments[0].pdfFrom.includes('No preview for this video.') && w.sent[0].attachments[0].pdfFrom.includes('<strong>Video 1</strong></p>'));
w = makeWorld(); r = post(w, good);
expect('pdf: no photos section when none sent', !w.sent[0].attachments[0].pdfFrom.includes('Photos and videos</h2>') && w.created.folders.length === 0);
w = makeWorld(); r = post(w, { ...good, files: Array(7).fill({ name: 'a.jpg', type: 'image/jpeg', data: img }) });
expect('files: 7 refused', r.ok === false && /up to 6 files/.test(r.message));
const big = 'A'.repeat(Math.ceil(26 * 1024 * 1024 / 0.75));
w = makeWorld(); r = post(w, { ...good, files: [{ name: 'big.mp4', type: 'video/mp4', data: big }] });
expect('files: 26MB refused', r.ok === false && /25MB/.test(r.message));
const long = 'x'.repeat(150);
w = makeWorld(); post(w, { ...good, files: [{ name: 'a.jpg', type: 'image/jpeg', data: img, caption: long }] });
expect('files: comment cut to 100 characters', w.created.files[0].description.length === 100);

// 9. Broken JSON
w = makeWorld();
r = JSON.parse(w.world.doPost({ postData: { contents: 'not json' } }).getContent());
expect('broken body: friendly error', r.ok === false && /our side/.test(r.message));

// 10. testEnquiry runs
w = makeWorld(); w.world.testEnquiry();
expect('testEnquiry: sends both', w.sent.length === 2);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
fs.writeFileSync(__dirname + '/sample-business.html', w.sent[0].htmlBody);
fs.writeFileSync(__dirname + '/sample-customer.html', w.sent[1].htmlBody);
fs.writeFileSync(__dirname + '/sample-pdf.html', w.sent[0].attachments[0].pdfFrom);
