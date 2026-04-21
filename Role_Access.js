window.addEventListener("DOMContentLoaded", function () {
    const card = document.querySelector("main > div");

    if (card) {
        card.style.opacity = "0";
        card.style.transform = "translateY(24px)";
        card.style.transition = "opacity 0.5s ease, transform 0.5s ease";

        setTimeout(function () {
            card.style.opacity = "1";
            card.style.transform = "translateY(0)";
        }, 80);
    }
});
