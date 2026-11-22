// Footer year
document.getElementById("y").textContent = new Date().getFullYear();

// If an icon file is missing, show the game's initials instead of a broken image
document.querySelectorAll(".icon[data-ini] img").forEach(function (img) {
  function fallback() {
    var s = document.createElement("span");
    s.className = "ini";
    s.textContent = img.parentNode.dataset.ini;
    img.replaceWith(s);
  }
  if (img.complete && img.naturalWidth === 0) fallback();
  else img.addEventListener("error", fallback);
});

// Hide screenshots that fail to load
document.querySelectorAll(".shots-row img").forEach(function (img) {
  img.addEventListener("error", function () { img.remove(); });
});
