/* jshint esversion: 11 */
/* global bootstrap */

/**** Bathroom & Work Page ****/

/* Adding JS as auto-counter for project slide number */
document.querySelectorAll(".project-carousel").forEach((carousel) => {
  const counter = carousel.querySelector(".counter");
  const total = carousel.querySelectorAll(".carousel-item").length;

  carousel.addEventListener("slide.bs.carousel", (event) => {
    counter.textContent = `${event.to + 1} of ${total}`;
  });
});

/* Carousels: load every slide's photo once the carousel is nearly on screen.
   loading="lazy" on its own waits until a hidden slide is shown, so its photo
   only starts loading as it slides in, which leaves a blank block. */
const carouselWatcher = new IntersectionObserver(
  (entries, watcher) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.querySelectorAll("img").forEach((img) => {
        img.loading = "eager"; // start downloading now
        img.decode().catch(() => {}); // and get it ready to draw, so it appears straight away
      });
      watcher.unobserve(entry.target); // each carousel only needs this once
    });
  },
  { rootMargin: "300px" }, // start when the carousel is within 300px of the screen
);

document
  .querySelectorAll(".carousel")
  .forEach((carousel) => carouselWatcher.observe(carousel));

/**** Prices & Areas Page ****/

/* The calculator: add up the estimate whenever a pill is picked */
const calc = document.querySelector("#calc");

if (calc) {
  const zoneNames = { 0: "local", 30: "up to 20 mins", 50: "further out" };
  const timeNames = { 30: "30 mins", 60: "1 hr", 120: "2 hrs" };

  const updateEstimate = () => {
    const travel = Number(
      calc.querySelector('input[name="zone"]:checked').value,
    );
    const minutes = Number(
      calc.querySelector('input[name="time"]:checked').value,
    );
    const extraMinutes = minutes - 60;
    const extra = (extraMinutes / 30) * 40;

    // Work out each label first, so each line stays short
    const extraLabel = extraMinutes ? `(${timeNames[extraMinutes]})` : "";
    const extraPrice = extra ? `£${extra}` : "None";
    const travelPrice = travel ? `£${travel}` : "Included";

    calc.querySelector("#extra-label").textContent = extraLabel;
    calc.querySelector("#extra-price").textContent = extraPrice;
    calc.querySelector("#travel-label").textContent = `(${zoneNames[travel]})`;
    calc.querySelector("#travel-price").textContent = travelPrice;
    calc.querySelector("#total-price").textContent = `£${85 + extra + travel}`;

    // Put what they picked on the end of the Send an enquiry link, so the form can show it
    const area = calc
      .querySelector('input[name="zone"]:checked')
      .id.replace("zone-", ""); // zone-near becomes near
    calc.querySelector("#estimate-enquiry").href =
      `contact.html?area=${area}&minutes=${minutes}`;
  };

  calc.addEventListener("change", updateEstimate);
  updateEstimate();

  // After the Back button, Chrome and Edge can put back the pills that were
  // picked once this script has run, without a change event. Add it up again
  // when the page shows, so the total always matches the picked pills.
  window.addEventListener("pageshow", updateEstimate);
}

/* "Check the map": open the price map and scroll down to it */
const checkMap = document.querySelector("#check-map");
const priceMap = document.querySelector("#price-map");

if (checkMap && priceMap) {
  const mapButton = document.querySelector("#price-map-btn");

  // Scroll so the See the price map bar sits at the top, with the map below it
  const scrollToMap = () => {
    mapButton.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  checkMap.addEventListener("click", () => {
    if (priceMap.classList.contains("show")) {
      scrollToMap(); // already open: full height, so scroll now
    } else {
      // closed: wait until it has finished opening, or the scroll stops short
      priceMap.addEventListener("shown.bs.collapse", scrollToMap, {
        once: true,
      });
      bootstrap.Collapse.getOrCreateInstance(priceMap, {
        toggle: false,
      }).show();
    }
  });
}

// "See bathroom projects" and "See repair prices": switch tabs and go back up to them
document.querySelectorAll("[data-show-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = document.querySelector(button.dataset.showTab);
    bootstrap.Tab.getOrCreateInstance(tab).show();
    tab.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

/**** Contact Us Page ****/

/* The calculator estimate: show it on the form if they came from the Prices page */
const estimateCarry = document.querySelector("#estimate-carry");

if (estimateCarry) {
  // The same areas, times and prices as the calculator
  const areas = {
    local: { name: "local", travel: 0 },
    near: { name: "up to 20 mins away", travel: 30 },
    far: { name: "further out", travel: 50 },
  };
  const times = { 60: "1 hr", 90: "1½ hrs", 120: "2 hrs", 180: "3 hrs" };

  // Read ?area=near&minutes=90 from the end of the address
  const params = new URLSearchParams(window.location.search);
  const area = params.get("area");
  const minutes = params.get("minutes");

  // Only show it if both are values the calculator could have sent. Checking the
  // keys, not areas[area], stops names every object has, like "toString", getting in.
  if (Object.keys(areas).includes(area) && Object.keys(times).includes(minutes)) {
    const extra = ((Number(minutes) - 60) / 30) * 40;
    const total = 85 + extra + areas[area].travel;

    estimateCarry.querySelector("#carry-total").textContent = `£${total}`;
    estimateCarry.querySelector("#carry-detail").textContent =
      `${areas[area].name}, about ${times[minutes]} of work`;
    document.querySelector("#area").value = area;
    document.querySelector("#minutes").value = minutes;
    estimateCarry.hidden = false;
  }
}

/* Send the enquiry, with any photos and videos, to our Apps Script, which emails it */
const ENQUIRY_URL =
  "https://script.google.com/macros/s/AKfycbyW0i0SeE-TSK7VsIRIJq4erFEmnUwmK4u2Rj7eglpEEKCK2UG7SOgDTwm39LfFxNE9/exec";

/* Limits for photos and videos */
const MAX_FILES = 6;
const MAX_VIDEO_MB = 20; // videos are sent as they are, so keep them short
const PHOTO_SIZE = 1600; // photos are shrunk so their longest side is this many pixels

const enquiryForm = document.querySelector("#enquiry-form");

if (enquiryForm) {
  const fileInput = enquiryForm.querySelector("#files");
  const mediaList = enquiryForm.querySelector("#media-list");
  const mediaNote = enquiryForm.querySelector("#media-note");
  const addButton = enquiryForm.querySelector("#add-media");
  const mediaTemplate = document.querySelector("#media-template");
  const sendButton = enquiryForm.querySelector('button[type="submit"]');
  const formStatus = enquiryForm.querySelector("#form-status");

  // Every photo and video added so far, each with its comment and preview
  const media = [];

  // The fields that must be filled in: each has its messages in data-missing and data-wrong
  const fields = [...enquiryForm.querySelectorAll("[data-missing]")];
  let showingCount = false; // true while the line under Send is the "fields need fixing" count

  // Checks one field, and shows or clears the message under it. Returns true if it's fine.
  const checkField = (field) => {
    let problem = "";
    if (!field.value.trim()) problem = field.dataset.missing;
    else if (!field.validity.valid) problem = field.dataset.wrong;

    document.querySelector(`#${field.id}-error`).textContent = problem;
    if (problem) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
    return !problem;
  };

  // The line under Send: how many fields still need fixing
  const showCount = () => {
    const wrong = fields.filter((field) => field.hasAttribute("aria-invalid")).length;
    let words = "";
    if (wrong === 1) words = "1 field needs fixing before this can send.";
    else if (wrong > 1) words = `${wrong} fields need fixing before this can send.`;
    formStatus.textContent = words;
    showingCount = wrong > 0;
  };

  fields.forEach((field) => {
    // Leaving a field they've typed in: check it straight away
    field.addEventListener("change", () => {
      if (field.value.trim() || field.hasAttribute("aria-invalid")) checkField(field);
      if (showingCount) showCount();
    });
    // Typing in a field already marked: clear the message as soon as it's right
    field.addEventListener("input", () => {
      if (field.hasAttribute("aria-invalid") && field.validity.valid && field.value.trim()) {
        checkField(field);
        if (showingCount) showCount();
      }
    });
  });

  // Shows what went wrong and lets them try again
  const showProblem = (message) => {
    formStatus.textContent = message;
    sendButton.disabled = false;
    sendButton.textContent = "Send enquiry";
  };

  // Adds up the size of every video added so far, in MB
  const videoMb = () =>
    media
      .filter((item) => item.isVideo)
      .reduce((total, item) => total + item.file.size, 0) /
    (1024 * 1024);

  // Turns the Add button off at the limit, and changes its words to match
  const updateAddButton = () => {
    const full = media.length >= MAX_FILES;
    fileInput.disabled = full;
    let words = "Add a photo or video";
    if (full) words = `${MAX_FILES} files added`;
    else if (media.length) words = "Add another photo or video";
    addButton.textContent = words;
  };

  // Draws one row per file: a small preview, its name, a Remove button and a comment box
  const showMedia = () => {
    mediaList.replaceChildren(); // start again, so the numbers stay in order
    media.forEach((item, index) => {
      const row = mediaTemplate.content.cloneNode(true);
      const kind = item.isVideo ? "Video" : "Photo";

      // A video preview jumps half a second in, so it isn't a black frame
      const preview = document.createElement(item.isVideo ? "video" : "img");
      preview.src = item.preview + (item.isVideo ? "#t=0.5" : "");
      if (item.isVideo) {
        preview.muted = true;
        preview.playsInline = true;
        preview.preload = "metadata";
      } else {
        preview.alt = ""; // the label next to it already names the file
      }
      row.querySelector(".media-thumb").append(preview);

      // Each comment box gets its own id, so its label can point to it
      const caption = row.querySelector(".media-caption");
      caption.id = `caption-${index}`;
      caption.value = item.caption; // keeps what they typed when the rows are redrawn
      caption.addEventListener("input", () => {
        item.caption = caption.value;
      });
      const label = row.querySelector(".media-name");
      label.htmlFor = caption.id;
      label.textContent = `${kind} ${index + 1}: ${item.file.name}`;

      // Remove takes the file out of the list, then redraws the rows
      const remove = row.querySelector(".media-remove");
      remove.setAttribute("aria-label", `Remove ${label.textContent}`);
      remove.addEventListener("click", () => {
        URL.revokeObjectURL(item.preview); // frees the memory the preview used
        media.splice(media.indexOf(item), 1);
        mediaNote.textContent = `${kind} removed.`;
        showMedia();
        fileInput.focus(); // so keyboard users aren't left on a button that's gone
      });

      mediaList.append(row);
    });
    updateAddButton();
  };

  // Each time files are picked, add them to the list (up to the limits)
  fileInput.addEventListener("change", () => {
    const problems = [];

    for (const file of fileInput.files) {
      const isVideo = file.type.startsWith("video/");
      const fileMb = file.size / (1024 * 1024);

      if (media.length >= MAX_FILES) {
        problems.push(`only ${MAX_FILES} files can be added`);
        break;
      }
      if (isVideo && videoMb() + fileMb > MAX_VIDEO_MB) {
        problems.push(
          `${file.name} would take your videos over ${MAX_VIDEO_MB}MB, so try a shorter clip`,
        );
        continue;
      }
      const preview = URL.createObjectURL(file);
      media.push({ file, isVideo, preview, caption: "" });
    }

    const note = `Not everything was added: ${problems.join(", and ")}.`;
    mediaNote.textContent = problems.length ? note : "";
    fileInput.value = ""; // empties the box, so the same file can be picked again
    showMedia();
  });

  // novalidate on the form means submit always fires, so check every field first
  enquiryForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const results = fields.map(checkField); // every field, so all the messages show at once
    if (results.includes(false)) {
      showCount();
      const first = fields.find((field) => field.hasAttribute("aria-invalid"));
      first.focus({ preventScroll: true });
      first.scrollIntoView({ block: "center" }); // so its label shows above it too
      return;
    }

    sendButton.disabled = true; // stops a second press sending it twice
    sendButton.textContent = "Sending…";
    formStatus.textContent = "";

    try {
      // Every text field, by its name
      const data = {};
      for (const [name, value] of new FormData(enquiryForm)) {
        if (typeof value === "string") data[name] = value.trim();
      }

      // Each photo shrunk, each video as it is with a still from it, and each comment
      data.files = [];
      for (const item of media) {
        const file = item.file;
        const caption = item.caption.trim();

        if (item.isVideo) {
          const still = await takeStill(file).catch(() => "");
          data.files.push({
            name: file.name,
            type: file.type,
            data: await readFile(file),
            still,
            caption,
          });
        } else {
          let photo;
          try {
            photo = await shrinkPhoto(file);
          } catch (error) {
            return showProblem(
              `Sorry, we couldn't open ${file.name}. Please try a JPEG or PNG photo.`,
            );
          }
          const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
          data.files.push({ name, type: "image/jpeg", data: photo, caption });
        }
      }

      // Plain text, so the browser sends it straight away with no extra check first
      const response = await fetch(ENQUIRY_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (result.ok) {
        window.location.href = "thankyou.html";
      } else {
        showProblem(result.message);
      }
    } catch (error) {
      showProblem(
        "Sorry, that didn't send. Please try again in a few minutes.",
      );
    }
  });
}

/* Photos and videos: helpers used when sending */

// Draws a picture smaller on a canvas and returns it as a JPEG, in base64 text
function drawSmaller(picture, width, height) {
  const scale = Math.min(1, PHOTO_SIZE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff"; // JPEGs can't be see-through, so start with white
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(picture, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75).split(",")[1];
}

// A photo, shrunk so it's quick to send and fits in the PDF
async function shrinkPhoto(file) {
  const photo = await createImageBitmap(file);
  return drawSmaller(photo, photo.width, photo.height);
}

// A still picture from a second into the video (or halfway, for very short clips)
function takeStill(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };
    video.onseeked = () => {
      resolve(drawSmaller(video, video.videoWidth, video.videoHeight));
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => reject(video.error);
    setTimeout(() => reject(new Error("No still in time")), 8000);
    video.src = URL.createObjectURL(file);
  });
}

// Turns a file into base64 text, which can travel inside the JSON
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
