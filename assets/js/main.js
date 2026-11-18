/**** Bathroom & Work Page ****/

/* Adding JS as auto-counter for project slide number */
document.querySelectorAll(".project-carousel").forEach((carousel) => {
  const counter = carousel.querySelector(".counter");
  const total = carousel.querySelectorAll(".carousel-item").length;

  carousel.addEventListener("slide.bs.carousel", (event) => {
    counter.textContent = `${event.to + 1} of ${total}`;
  });
});
