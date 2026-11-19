/**** Bathroom & Work Page ****/

/* Adding JS as auto-counter for project slide number */
document.querySelectorAll(".project-carousel").forEach((carousel) => {
  const counter = carousel.querySelector(".counter");
  const total = carousel.querySelectorAll(".carousel-item").length;

  carousel.addEventListener("slide.bs.carousel", (event) => {
    counter.textContent = `${event.to + 1} of ${total}`;
  });
});

/**** Prices & Areas Page ****/

/* The calculator: add up the estimate whenever a pill is picked */
const calc = document.querySelector("#calc");

if (calc) {
  const zoneNames = { 0: "local", 30: "up to 20 mins", 50: "further out" };
  const timeNames = { 30: "30 mins", 60: "1 hr", 120: "2 hrs" };

  function updateEstimate() {
    const travel = Number(
      calc.querySelector('input[name="zone"]:checked').value,
    );
    const minutes = Number(
      calc.querySelector('input[name="time"]:checked').value,
    );
    const extraMinutes = minutes - 60;
    const extra = (extraMinutes / 30) * 40;

    calc.querySelector("#extra-label").textContent = extraMinutes
      ? `(${timeNames[extraMinutes]})`
      : "";
    calc.querySelector("#extra-price").textContent = extra
      ? `£${extra}`
      : "None";
    calc.querySelector("#travel-label").textContent = `(${zoneNames[travel]})`;
    calc.querySelector("#travel-price").textContent = travel
      ? `£${travel}`
      : "Included";
    calc.querySelector("#total-price").textContent = `£${85 + extra + travel}`;
  }

  calc.addEventListener("change", updateEstimate);
  updateEstimate();
}

/* "Check the map": open the price map and scroll down to it */
const checkMap = document.querySelector("#check-map");
const priceMap = document.querySelector("#price-map");

if (checkMap && priceMap) {
  const mapButton = document.querySelector("#price-map-btn");

  // Scroll so the See the price map bar sits at the top, with the map below it
  function scrollToMap() {
    mapButton.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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

/* "See bathroom projects" and "See repair prices": switch tabs and go back up to them */
document.querySelectorAll("[data-show-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = document.querySelector(button.dataset.showTab);
    bootstrap.Tab.getOrCreateInstance(tab).show();
    tab.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});
