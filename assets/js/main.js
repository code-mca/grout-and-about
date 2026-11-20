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
  };

  calc.addEventListener("change", updateEstimate);
  updateEstimate();
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
  const mediaTemplate = document.querySelector("#media-template");
  const sendButton = enquiryForm.querySelector('button[type="submit"]');
  const formStatus = enquiryForm.querySelector("#form-status");

  // Shows what went wrong and lets them try again
  const showProblem = (message) => {
    formStatus.textContent = message;
    sendButton.disabled = false;
    sendButton.textContent = "Send enquiry";
  };

  // One row per picked file: a small preview and a box for a comment
  const showMedia = (files) => {
    mediaList.replaceChildren(); // clear any rows from an earlier pick
    files.forEach((file, index) => {
      const row = mediaTemplate.content.cloneNode(true);
      const isVideo = file.type.startsWith("video/");

      // A video preview jumps half a second in, so it isn't a black frame
      const preview = document.createElement(isVideo ? "video" : "img");
      preview.src = URL.createObjectURL(file) + (isVideo ? "#t=0.5" : "");
      if (isVideo) {
        preview.muted = true;
        preview.playsInline = true;
        preview.preload = "metadata";
      } else {
        preview.alt = ""; // the label next to it already names the file
      }
      row.querySelector(".media-thumb").append(preview);

      // Give each comment box its own id, so its label can point to it
      const caption = row.querySelector(".media-caption");
      caption.id = `caption-${index}`;
      const label = row.querySelector(".media-name");
      label.htmlFor = caption.id;
      label.textContent = `${isVideo ? "Video" : "Photo"} ${index + 1}: ${file.name}`;

      mediaList.append(row);
    });
  };

  // Check the files as soon as they're picked, then list them
  fileInput.addEventListener("change", () => {
    const files = [...fileInput.files];
    const videoBytes = files
      .filter((file) => file.type.startsWith("video/"))
      .reduce((total, file) => total + file.size, 0);
    const videoMb = videoBytes / (1024 * 1024);

    if (files.length > MAX_FILES) {
      fileInput.setCustomValidity(`Please pick up to ${MAX_FILES} files.`);
    } else if (videoMb > MAX_VIDEO_MB) {
      fileInput.setCustomValidity(
        `Your videos come to ${Math.ceil(videoMb)}MB. Please keep them under ${MAX_VIDEO_MB}MB: shorter clips, or fewer.`,
      );
    } else {
      fileInput.setCustomValidity(""); // empty means no problem
    }
    fileInput.reportValidity();
    showMedia(files);
  });

  // The submit event only fires once every field passes the browser's checks
  enquiryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
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
      for (const [index, file] of [...fileInput.files].entries()) {
        const caption = mediaList
          .querySelector(`#caption-${index}`)
          .value.trim();

        if (file.type.startsWith("video/")) {
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
